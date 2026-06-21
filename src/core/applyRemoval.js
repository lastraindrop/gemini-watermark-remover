import { removeWatermark } from './blendModes.js';
import { removeRepeatedWatermarkLayers } from './multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from './alphaCalibration.js';
import { refineSubpixelOutline } from './adaptiveDetector.js';
import { calculateCorrelation } from './detector.js';
import { DETECTION_THRESHOLDS } from './config.js';
import { applyEdgeCleanup } from './edgeCleanup.js';
import { assessRemovalDiffArtifacts } from './restorationMetrics.js';

/**
 * Estimate optimal alphaGain by comparing watermark-center luminance against
 * surrounding background pixels. The template alpha map uses max-channel values
 * from the reference template (typically ~0.5 at star center). For very faint
 * watermarks (actual alpha 0.02-0.05), the default gain of 1.0 causes 10-15x
 * over-correction — producing dark blotches instead of clean removal.
 *
 * Returns a gain in [0.01, 2.0]; 1.0 means no adjustment.
 */
export function estimateAlphaGain(imageData, alphaMap, position) {
    const { x, y, width, height } = position;
    const { data, width: imgWidth, height: imgHeight } = imageData;

    // Weighted estimation: use the template alpha map as weights so that
    // pixels where the watermark actually exists contribute more to the
    // estimate. Simple averaging dilutes the watermark signal because the
    // star occupies only a small fraction of the probe region.
    let wmWeighted = 0, bgSum = 0, bgCount = 0, totalWeight = 0;

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const px = Math.floor(x + col);
            const py = Math.floor(y + row);
            if (px < 0 || py < 0 || px >= imgWidth || py >= imgHeight) continue;
            const i = (py * imgWidth + px) << 2;
            const lum = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
            const a = alphaMap[row * width + col];

            if (a > 0.15) {
                wmWeighted += lum * a;
                totalWeight += a;
            } else {
                bgSum += lum;
                bgCount++;
            }
        }
    }

    if (totalWeight < 0.01 || bgCount < 10) return 1;
    const wmMean = wmWeighted / totalWeight;
    const bgMean = bgSum / bgCount;
    const estAlpha = Math.max(0, (wmMean - bgMean) / Math.max(0.01, 1 - bgMean));
    const templateAlpha = alphaMap[Math.floor(height / 2) * width + Math.floor(width / 2)];
    if (templateAlpha <= 0.01 || estAlpha <= 0.001) return 1;
    return Math.max(0.01, Math.min(2.0, estAlpha / templateAlpha));
}

/**
 * v2.6: Non-Maximum Suppression for watermark matches.
 *
 * When the detection pipeline finds multiple candidates near the same region
 * (e.g. a 48px match at margin 32 AND a 96px match at margin 64 that spatially
 * overlap), applying removal to ALL of them corrupts the image — each pass
 * re-processes already-cleaned pixels, producing dark blotches and artifacts.
 *
 * This function keeps only the highest-confidence match per spatial cluster,
 * suppressing lower-confidence overlaps.
 *
 * @param {Array} matches - Detection matches (will be sorted by confidence desc)
 * @returns {Array} Filtered matches with no significant spatial overlap
 */
function suppressOverlappingMatches(matches) {
    if (matches.length <= 1) return matches;

    // Sort by confidence descending
    const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
    const accepted = [];

    // v2.6: Confidence ratio filter — only keep matches whose confidence is
    // within 50% of the strongest match. If the winner has conf=0.97, any match
    // below 0.49 is almost certainly a false positive (different watermark
    // geometry, margin, or template creating spurious correlation). This is
    // especially important after adding 192px margin probing, which increases
    // the candidate pool and false-positive surface.
    const topConfidence = sorted[0].confidence;
    const confidenceFloor = topConfidence * 0.5;

    for (const candidate of sorted) {
        // Skip weak matches far below the winner
        if (candidate.confidence < confidenceFloor && accepted.length > 0) continue;

        let overlapsExisting = false;
        for (const existing of accepted) {
            // Check actual pixel-level bounding box intersection
            const ax1 = candidate.pos.x, ay1 = candidate.pos.y;
            const ax2 = candidate.pos.x + candidate.pos.width;
            const ay2 = candidate.pos.y + candidate.pos.height;
            const bx1 = existing.pos.x, by1 = existing.pos.y;
            const bx2 = existing.pos.x + existing.pos.width;
            const by2 = existing.pos.y + existing.pos.height;

            const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
            const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
            const overlapArea = overlapX * overlapY;

            const candidateArea = candidate.pos.width * candidate.pos.height;
            const existingArea = existing.pos.width * existing.pos.height;
            const minArea = Math.min(candidateArea, existingArea);

            // Suppress if overlap area exceeds 25% of the smaller match's area
            if (overlapArea > minArea * 0.25) {
                overlapsExisting = true;
                break;
            }
        }
        if (!overlapsExisting) {
            accepted.push(candidate);
        }
    }

    return accepted;
}

export function applyRemovalStrategy(imageData, matches) {
    // v2.6: Non-Maximum Suppression — filter overlapping matches before removal.
    // Without this, a single real watermark at 48px can produce 2-3 overlapping
    // false-positive matches at different sizes/margins, and applying removal to
    // all of them corrupts the image.
    const filteredMatches = suppressOverlappingMatches(matches);

    for (const match of filteredMatches) {
        // v2.7 C-2: Extend multi-pass removal to all known profiles.
        // Previously only Gemini used multi-pass; Doubao and DALL-E 3 got
        // single-pass removal, leaving residual on rectangular watermarks.
        // Multi-pass safety gates (near-black, texture, halo, sign-flip) are
        // shape-agnostic and work for any alpha map dimensions.
        const useMultiPass = ['gemini', 'doubao', 'dalle3'].includes(match.profileId);
        if (useMultiPass) {
            // BUG-C7 (STAGE_PLAN_v2.7): Compute a PURE NCC score for the
            // original (pre-removal) region BEFORE any modification, so it is
            // directly comparable to multiPassRemoval's `afterSpatialScore`
            // (also pure NCC from calculateCorrelation). Previously this used
            // `match.confidence`, which is a 3D blend score
            // (spatial×0.5 + gradient×0.3 + variance×0.2, range ~0.3-0.7).
            // That type mismatch made shouldRecalibrateAlphaStrength's
            // `originalScore >= 0.6` gate almost impossible to satisfy, leaving
            // the recalibration path as effective dead code.
            const originalSpatialScore = Math.abs(calculateCorrelation(
                imageData,
                match.pos.x, match.pos.y,
                match.pos.width, match.pos.height,
                match.alphaMap,
                true
            ));

            // v2.7 C-1: Weak-alpha chain for large-margin (48@96) watermarks.
            // Ported from upstream GargantuaX v1.0.17 candidateSelector.js.
            // Gemini recently emits 48px watermarks at a 96px anchor with very
            // faint alpha (~60% of standard). Standard gain=1.0 causes over-
            // correction on these; trying gain=0.6 first avoids dark blotches.
            // If 0.6 produces a clean result (residual NCC ≤ 0.22), short-
            // circuit — skip the full multi-pass + recalibration chain.
            const isWeakAlphaConfig = match.config?.logoSize === 48 &&
                match.config?.marginRight === 96 &&
                match.config?.marginBottom === 96;

            if (isWeakAlphaConfig) {
                const weakAlphaResult = removeRepeatedWatermarkLayers({
                    imageData,
                    alphaMap: match.alphaMap,  // no pre-scale — use raw alpha
                    position: match.pos,
                    maxPasses: DETECTION_THRESHOLDS.WEAK_ALPHA_MAX_PASSES,
                    residualThreshold: 0.25,
                    alphaGain: DETECTION_THRESHOLDS.WEAK_ALPHA_GAIN  // 0.6
                });
                const waLastPass = weakAlphaResult.passes[weakAlphaResult.passes.length - 1];
                if (waLastPass &&
                    Math.abs(waLastPass.afterSpatialScore) <= DETECTION_THRESHOLDS.WEAK_ALPHA_RESIDUAL_CLEAN_THRESHOLD) {
                    // Weak-alpha chain succeeded — skip recalibration, use 0.6 result
                    imageData.data.set(weakAlphaResult.imageData.data);
                    continue;
                }
                // Otherwise fall through to standard gain path below
            }

            // v2.6: Check for manual alphaGain override (difficult cases)
            const estimatedGain = estimateAlphaGain(imageData, match.alphaMap, match.pos);
            const alphaGain = (match.config?.alphaGainOverride && match.config.alphaGainOverride > 0)
                ? match.config.alphaGainOverride
                : estimatedGain;
            // v2.5: Pre-scale the alpha map once before multi-pass removal.
            // Passing alphaGain to each pass causes cumulative over-correction:
            // after pass 1 removes the watermark, pass 2 applies the SAME gain
            // to the residual, producing a dark "inverse ghost" of the star.
            // Pre-scaling the alpha map once and letting the multi-pass run with
            // its natural gain=1 avoids this accumulation.
            const scaledAlpha = alphaGain !== 1
                ? Float32Array.from(match.alphaMap, v => v * alphaGain)
                : match.alphaMap;

            // v2.5: forceProcess skips multi-pass safety gates — use single-pass
            // for difficult images where near-black/over-correction checks abort.
            if (match.config?.forceProcess) {
                removeWatermark(imageData, scaledAlpha, match.pos);
                continue;
            }

            const multiPassResult = removeRepeatedWatermarkLayers({
                imageData,
                alphaMap: scaledAlpha,
                position: match.pos,
                maxPasses: 4,
                residualThreshold: 0.25
            });

            // v2.7 B-1: Halo feedback retry. When multi-pass detects an alpha-
            // band halo (dark/bright ring at watermark edge), it stops early
            // with stopReason='safety-halo'. Instead of giving up, retry with
            // progressively lower alphaGain (×0.8 each step, floor 0.5) to
            // find a gain that removes the watermark without creating halos.
            // Max 2 downgrade attempts. Ported from upstream watermarkProcessor.
            let effectiveResult = multiPassResult;
            if (effectiveResult.stopReason === 'safety-halo' && alphaGain > 0.55) {
                const HALO_MAX_RETRIES = 2;
                const HALO_GAIN_DECAY = 0.8;
                const HALO_GAIN_FLOOR = 0.5;
                let retryGain = alphaGain;
                for (let retry = 0; retry < HALO_MAX_RETRIES; retry++) {
                    retryGain = Math.max(HALO_GAIN_FLOOR, retryGain * HALO_GAIN_DECAY);
                    if (retryGain >= alphaGain) break; // no meaningful reduction
                    const retryAlpha = Float32Array.from(match.alphaMap, v => v * retryGain);
                    const retryResult = removeRepeatedWatermarkLayers({
                        imageData,
                        alphaMap: retryAlpha,
                        position: match.pos,
                        maxPasses: 4,
                        residualThreshold: 0.25
                    });
                    effectiveResult = retryResult;
                    if (retryResult.stopReason !== 'safety-halo') break; // halo resolved
                }
            }

            const lastPass = effectiveResult.passes.length > 0
                ? effectiveResult.passes[effectiveResult.passes.length - 1]
                : null;

            // v2.6: Try sub-pixel refinement when multi-pass did not fully
            // converge. refineSubpixelOutline tests small alpha-map shifts
            // (±0.25px) and scales (±1%) against the ORIGINAL image to find
            // better alignment, reducing "micro-deviation" (1–2 px color/position
            // shift after removal). Only invoked when residual remains above
            // threshold, to avoid wasting compute on already-clean results.
            if (lastPass && effectiveResult.stopReason !== 'residual-low') {
                const refined = refineSubpixelOutline({
                    sourceImageData: imageData,
                    alphaMap: match.alphaMap,  // unscaled — fn applies own gain
                    position: match.pos,
                    alphaGain,
                    baselineSpatialScore: Math.abs(lastPass.afterSpatialScore),
                    baselineGradientScore: lastPass.afterGradientScore || 0
                });
                if (refined) {
                    imageData.data.set(refined.imageData.data);
                    continue;
                }
            }

            if (effectiveResult.stopReason !== 'residual-low' && lastPass) {
                // originalSpatialScore is already Math.abs'd (pure NCC).
                // lastPass.afterSpatialScore is also pure NCC (set in
                // multiPassRemoval.js via calculateCorrelation). The two
                // values are now directly comparable in type and scale.
                const suppressionGain = originalSpatialScore - Math.abs(lastPass.afterSpatialScore);

                if (shouldRecalibrateAlphaStrength({
                    originalScore: originalSpatialScore,
                    processedScore: Math.abs(lastPass.afterSpatialScore),
                    suppressionGain
                })) {
                    const recalibrated = recalibrateAlphaStrength({
                        sourceImageData: effectiveResult.imageData,
                        alphaMap: match.alphaMap,
                        position: match.pos,
                        originalSpatialScore,
                        processedSpatialScore: Math.abs(lastPass.afterSpatialScore)
                    });
                    if (recalibrated) {
                        imageData.data.set(recalibrated.imageData.data);
                        continue;
                    }
                }
            }

            // v2.7 B-3: Edge cleanup — apply alpha-gradient-aware blur to the
            // removal result to reduce quantization banding (visible color steps
            // caused by Math.round() in blendModes.js:111). Only runs when we're
            // about to commit the final result (not skipped by subpixel/calibration).
            applyEdgeCleanup(effectiveResult.imageData, match.alphaMap, match.pos);

            // v2.7 P5: Post-removal diff artifact assessment. Measure the
            // quality of the removal result by comparing original vs processed
            // pixels in the watermark region. If severe banding is detected
            // (score > 0.15), the removal quality is compromised — but we
            // still commit the result since it's the best we have. The
            // assessment result is attached to the match for downstream
            // logging/UI feedback. Ported from upstream restorationMetrics.js.
            const diffAssessment = assessRemovalDiffArtifacts(
                imageData.data,
                effectiveResult.imageData.data,
                match.pos,
                imageData.width
            );
            match.diffArtifacts = diffAssessment;

            imageData.data.set(effectiveResult.imageData.data);
        } else {
            removeWatermark(imageData, match.alphaMap, match.pos);
        }
    }
}
