import { removeWatermark } from './blendModes.js';
import { removeRepeatedWatermarkLayers } from './multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from './alphaCalibration.js';

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

export function applyRemovalStrategy(imageData, matches) {
    for (const match of matches) {
        const useMultiPass = match.profileId === 'gemini';
        if (useMultiPass) {
            const alphaGain = estimateAlphaGain(imageData, match.alphaMap, match.pos);
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
