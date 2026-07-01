import { removeWatermark } from './blendModes.js';
import { removeRepeatedWatermarkLayers } from './multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from './alphaCalibration.js';
import { refineSubpixelOutline } from './adaptiveDetector.js';
import { calculateCorrelation } from './detector.js';
import { DETECTION_THRESHOLDS } from './config.js';
import { assessRemovalDiffArtifacts } from './restorationMetrics.js';
import { suppressOverlappingCandidates } from './candidateGeometry.js';

/** Count actual RGB pixel changes inside one candidate region. */
function countChangedPixels(before, after, imageWidth, imageHeight, position) {
    const startX = Math.max(0, Math.floor(position.x));
    const startY = Math.max(0, Math.floor(position.y));
    const endX = Math.min(imageWidth, Math.ceil(position.x + position.width));
    const endY = Math.min(imageHeight, Math.ceil(position.y + position.height));
    let changedPixels = 0;
    let maxChannelDelta = 0;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const index = (y * imageWidth + x) << 2;
            let pixelChanged = false;
            for (let channel = 0; channel < 3; channel++) {
                const delta = Math.abs(after[index + channel] - before[index + channel]);
                if (delta > 0) pixelChanged = true;
                if (delta > maxChannelDelta) maxChannelDelta = delta;
            }
            if (pixelChanged) changedPixels++;
        }
    }
    return { changedPixels, maxChannelDelta };
}

export function applyRemovalStrategy(imageData, matches) {
    // v2.6: Non-Maximum Suppression — filter overlapping matches before removal.
    // Without this, a single real watermark at 48px can produce 2-3 overlapping
    // false-positive matches at different sizes/margins, and applying removal to
    // all of them corrupts the image.
    const filteredMatches = suppressOverlappingCandidates(matches, { preserveOrder: true });
    const report = {
        attemptedCount: matches.length,
        acceptedCount: filteredMatches.length,
        suppressedCount: matches.length - filteredMatches.length,
        appliedCount: 0,
        results: []
    };

    for (const match of filteredMatches) {
        const beforeMatch = new Uint8ClampedArray(imageData.data);
        let trace = { stopReason: 'not-run', passCount: 0, attemptedPassCount: 0 };
        try {
        // Multi-pass safety gates are shared by the supported profiles.
        const useMultiPass = match.profileId === 'gemini' || match.profileId === 'doubao';
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
                    residualThreshold: DETECTION_THRESHOLDS.MULTIPASS_RESIDUAL_THRESHOLD,
                    alphaGain: DETECTION_THRESHOLDS.WEAK_ALPHA_GAIN  // 0.6
                });
                const waLastPass = weakAlphaResult.passes[weakAlphaResult.passes.length - 1];
                if (waLastPass &&
                    Math.abs(waLastPass.afterSpatialScore) <= DETECTION_THRESHOLDS.WEAK_ALPHA_RESIDUAL_CLEAN_THRESHOLD) {
                    // Weak-alpha chain succeeded — skip recalibration, use 0.6 result
                    imageData.data.set(weakAlphaResult.imageData.data);
                    trace = {
                        stopReason: weakAlphaResult.stopReason,
                        passCount: weakAlphaResult.passCount,
                        attemptedPassCount: weakAlphaResult.attemptedPassCount,
                        alphaGain: DETECTION_THRESHOLDS.WEAK_ALPHA_GAIN
                    };
                    continue;
                }
                // Otherwise fall through to standard gain path below
            }

            // Standard templates are already calibrated to the physical alpha
            // used by removeWatermark. The luminance estimator is intentionally
            // not applied by default because high-contrast backgrounds can make
            // a normal-strength watermark look weak, leaving bright residue.
            const alphaGain = (match.config?.alphaGainOverride && match.config.alphaGainOverride > 0)
                ? match.config.alphaGainOverride
                : 1;
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
                trace = { stopReason: 'forced-single-pass', passCount: 1, attemptedPassCount: 1, alphaGain };
                continue;
            }

            const multiPassResult = removeRepeatedWatermarkLayers({
                imageData,
                alphaMap: scaledAlpha,
                position: match.pos,
                maxPasses: 4,
                residualThreshold: DETECTION_THRESHOLDS.MULTIPASS_RESIDUAL_THRESHOLD
            });

            const effectiveResult = multiPassResult;

            const lastPass = effectiveResult.passes.length > 0
                ? effectiveResult.passes[effectiveResult.passes.length - 1]
                : null;

            // Safety gates may reject the first attempted pass. In that case
            // no cleanup or calibration may manufacture an apparent change.
            if (effectiveResult.passCount === 0) {
                trace = {
                    stopReason: effectiveResult.stopReason,
                    passCount: 0,
                    attemptedPassCount: effectiveResult.attemptedPassCount,
                    alphaGain
                };
                continue;
            }

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
                    trace = { stopReason: 'subpixel-refined', passCount: 1, attemptedPassCount: 1, alphaGain };
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
                        trace = { stopReason: 'alpha-recalibrated', passCount: 1, attemptedPassCount: 1, alphaGain };
                        continue;
                    }
                }
            }

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
            trace = {
                stopReason: effectiveResult.stopReason,
                passCount: effectiveResult.passCount,
                attemptedPassCount: effectiveResult.attemptedPassCount,
                alphaGain
            };
        } else {
            removeWatermark(imageData, match.alphaMap, match.pos);
            trace = { stopReason: 'single-pass', passCount: 1, attemptedPassCount: 1, alphaGain: 1 };
        }
        } finally {
            const delta = countChangedPixels(
                beforeMatch,
                imageData.data,
                imageData.width,
                imageData.height,
                match.pos
            );
            const result = {
                applied: delta.changedPixels > 0,
                changedPixels: delta.changedPixels,
                maxChannelDelta: delta.maxChannelDelta,
                profileId: match.profileId,
                source: match.source || null,
                pos: { ...match.pos },
                ...trace
            };
            match.removalResult = result;
            report.results.push(result);
            if (result.applied) report.appliedCount++;
        }
    }
    return report;
}
