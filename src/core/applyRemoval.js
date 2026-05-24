import { removeWatermark } from './blendModes.js';
import { removeRepeatedWatermarkLayers } from './multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from './alphaCalibration.js';

export function applyRemovalStrategy(imageData, matches) {
    for (const match of matches) {
        const useMultiPass = match.profileId === 'gemini';
        if (useMultiPass) {
            const multiPassResult = removeRepeatedWatermarkLayers({
                imageData,
                alphaMap: match.alphaMap,
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
