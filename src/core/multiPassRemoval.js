/**
 * Multi-Pass Watermark Removal (Phase 3.1)
 *
 * Iteratively removes watermark layers with safety checks:
 * - Near-black detection prevents over-darkening
 * - Texture alignment prevents pattern destruction
 * - Residual threshold stops when watermark is sufficiently suppressed
 *
 * Ported and adapted from GargantuaX gemini-watermark-remover.
 */

import { removeWatermark } from './blendModes.js';
import { calculateCorrelation, calculateGradientCorrelation } from './detector.js';
import { cloneImageData, calculateNearBlackRatio } from './utils.js';
import { assessAlphaBandHalo } from './restorationMetrics.js';

const DEFAULT_MAX_PASSES = 4;
const DEFAULT_RESIDUAL_THRESHOLD = 0.25;
const MAX_NEAR_BLACK_RATIO_INCREASE = 0.05;

function scoreRegion(imageData, alphaMap, position) {
    const { x, y, width, height } = position;
    const spatialScore = calculateCorrelation(imageData, x, y, width, height, alphaMap, true);
    return { spatialScore };
}

function assessReferenceTextureAlignment(params) {
    const { referenceImageData, candidateImageData, position } = params;
    const { data: refData, width: imgWidth, height: imgHeight } = referenceImageData;
    const { data: candData } = candidateImageData;
    const { x, y, width: w, height: h } = position;

    let refSum = 0;
    let candSum = 0;
    let count = 0;

    for (let row = 0; row < h; row++) {
        const cy = Math.floor(y + row);
        if (cy < 0 || cy >= imgHeight) continue;
        for (let col = 0; col < w; col++) {
            const cx = Math.floor(x + col);
            if (cx < 0 || cx >= imgWidth) continue;
            const idx = ((cy * imgWidth) + cx) << 2;
            const refLum = refData[idx] * 0.2126 + refData[idx + 1] * 0.7152 + refData[idx + 2] * 0.0722;
            const candLum = candData[idx] * 0.2126 + candData[idx + 1] * 0.7152 + candData[idx + 2] * 0.0722;
            refSum += refLum;
            candSum += candLum;
            count++;
        }
    }

    if (count === 0) return { hardReject: false };

    const refMean = refSum / count;
    const candMean = candSum / count;
    const meanShift = Math.abs(candMean - refMean) / Math.max(1, refMean);

    // Hard reject if region became too dark
    return { hardReject: meanShift > 0.5 && candMean < 30 };
}

// ============================================================
// Main function
// ============================================================

/**
 * Remove watermark with multiple passes and safety gates.
 *
 * @param {Object|ImageData} imageDataOrOptions - Image data or options object
 * @param {Float32Array} [alphaMapArg] - Alpha map
 * @param {Object} [positionArg] - Position {x, y, width, height}
 * @param {Object} [optionsArg] - Options
 * @returns {{ imageData, passCount, attemptedPassCount, stopReason, passes }}
 */
export function removeRepeatedWatermarkLayers(imageDataOrOptions, alphaMapArg, positionArg, optionsArg = {}) {
    const isObjectCall =
        imageDataOrOptions &&
        typeof imageDataOrOptions === 'object' &&
        'imageData' in imageDataOrOptions &&
        alphaMapArg === undefined;

    const imageData = isObjectCall ? imageDataOrOptions.imageData : imageDataOrOptions;
    const alphaMap = isObjectCall ? imageDataOrOptions.alphaMap : alphaMapArg;
    const position = isObjectCall ? imageDataOrOptions.position : positionArg;
    const options = isObjectCall ? imageDataOrOptions : optionsArg;

    const maxPasses = Math.max(1, options.maxPasses ?? DEFAULT_MAX_PASSES);
    const residualThreshold = options.residualThreshold ?? DEFAULT_RESIDUAL_THRESHOLD;
    const startingPassIndex = Math.max(0, options.startingPassIndex ?? 0);
    const alphaGain = Number.isFinite(options.alphaGain) && options.alphaGain > 0
        ? options.alphaGain
        : 1;

    let currentImageData = cloneImageData(imageData);
    const referenceImageData = currentImageData;
    const baseNearBlackRatio = calculateNearBlackRatio(currentImageData, position);
    const maxNearBlackRatio = Math.min(1, baseNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);
    const passes = [];
    let stopReason = 'max-passes';
    let appliedPassCount = startingPassIndex;
    let attemptedPassCount = startingPassIndex;

    const bufferSize = position.width * position.height;
    const gradientsI = new Float32Array(bufferSize);
    const gradientsA = new Float32Array(bufferSize);

    for (let passIndex = 0; passIndex < maxPasses; passIndex++) {
        attemptedPassCount = startingPassIndex + passIndex + 1;
        const before = scoreRegion(currentImageData, alphaMap, position);
        const beforeGradient = calculateGradientCorrelation(currentImageData, position.x, position.y, position.width, position.height, alphaMap, gradientsI, gradientsA);
        const candidate = cloneImageData(currentImageData);
        removeWatermark(candidate, alphaMap, position, { alphaGain });

        const after = scoreRegion(candidate, alphaMap, position);
        const afterGradient = calculateGradientCorrelation(candidate, position.x, position.y, position.width, position.height, alphaMap, gradientsI, gradientsA);
        const nearBlackRatio = calculateNearBlackRatio(candidate, position);
        const improvement = Math.abs(before.spatialScore) - Math.abs(after.spatialScore);
        const gradientDelta = afterGradient - beforeGradient;

        const textureAssessment = assessReferenceTextureAlignment({
            referenceImageData,
            candidateImageData: candidate,
            position
        });

        if (nearBlackRatio > maxNearBlackRatio) {
            stopReason = 'safety-near-black';
            break;
        }

        if (textureAssessment.hardReject) {
            stopReason = 'safety-texture-collapse';
            break;
        }

        // v2.6: Detect alpha-band halo after each pass. A halo appears as a
        // dark or bright ring around the watermark edge, caused by alpha-gain
        // mismatch or sub-pixel position error. If detected, stop early;
        // applyRemovalStrategy will retry with subpixel refinement instead.
        const haloAssessment = assessAlphaBandHalo(candidate, alphaMap, position);
        if (haloAssessment.hasHalo && haloAssessment.severity > 0.5) {
            stopReason = 'safety-halo';
            break;
        }

        currentImageData = candidate;
        appliedPassCount = startingPassIndex + passIndex + 1;
        passes.push({
            index: appliedPassCount,
            beforeSpatialScore: before.spatialScore,
            afterSpatialScore: after.spatialScore,
            improvement,
            gradientDelta,
            beforeGradientScore: beforeGradient,
            afterGradientScore: afterGradient,
            nearBlackRatio
        });

        if (Math.abs(after.spatialScore) <= residualThreshold) {
            stopReason = 'residual-low';
            break;
        }

        // After the first pass, check if sign flipped and gradient dropped —
        // this indicates over-correction and we should stop early.
        if (passIndex === 0 && before.spatialScore >= 0 && after.spatialScore < 0 &&
            afterGradient <= 0.08 && (beforeGradient - afterGradient) >= 0.2) {
            stopReason = 'first-pass-sign-flip';
            break;
        }
    }

    return {
        imageData: currentImageData,
        passCount: appliedPassCount,
        attemptedPassCount,
        stopReason,
        passes
    };
}
