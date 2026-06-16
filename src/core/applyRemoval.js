import { removeWatermark } from './blendModes.js';
import { removeRepeatedWatermarkLayers } from './multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from './alphaCalibration.js';
import { refineSubpixelOutline } from './adaptiveDetector.js';

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
        const useMultiPass = match.profileId === 'gemini';
        if (useMultiPass) {
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

            const lastPass = multiPassResult.passes.length > 0
                ? multiPassResult.passes[multiPassResult.passes.length - 1]
                : null;

            // v2.6: Try sub-pixel refinement when multi-pass did not fully
            // converge. refineSubpixelOutline tests small alpha-map shifts
            // (±0.25px) and scales (±1%) against the ORIGINAL image to find
            // better alignment, reducing "micro-deviation" (1–2 px color/position
            // shift after removal). Only invoked when residual remains above
            // threshold, to avoid wasting compute on already-clean results.
            if (lastPass && multiPassResult.stopReason !== 'residual-low') {
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

            if (multiPassResult.stopReason !== 'residual-low' && lastPass) {
                const originalSpatialScore = match.confidence;
                const suppressionGain = Math.abs(originalSpatialScore) - Math.abs(lastPass.afterSpatialScore);

                if (shouldRecalibrateAlphaStrength({
                    originalScore: Math.abs(originalSpatialScore),
                    processedScore: Math.abs(lastPass.afterSpatialScore),
                    suppressionGain
                })) {
                    const recalibrated = recalibrateAlphaStrength({
                        sourceImageData: multiPassResult.imageData,
                        alphaMap: match.alphaMap,
                        position: match.pos,
                        originalSpatialScore: Math.abs(originalSpatialScore),
                        processedSpatialScore: Math.abs(lastPass.afterSpatialScore)
                    });
                    if (recalibrated) {
                        imageData.data.set(recalibrated.imageData.data);
                        continue;
                    }
                }
            }

            imageData.data.set(multiPassResult.imageData.data);
        } else {
            removeWatermark(imageData, match.alphaMap, match.pos);
        }
    }
}
