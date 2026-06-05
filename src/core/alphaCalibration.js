/**
 * Alpha Strength Calibration (Phase 3.2)
 *
 * When the initial watermark removal leaves residual correlation, this module
 * searches for the optimal alpha gain multiplier to minimize the residual,
 * staying within safety bounds (near-black prevention).
 *
 * Ported and adapted from GargantuaX gemini-watermark-remover.
 */

import { removeWatermark } from './blendModes.js';
import { calculateCorrelation } from './detector.js';
import { cloneImageData, calculateNearBlackRatio } from './utils.js';

const ALPHA_GAIN_CANDIDATES = [1.05, 1.12, 1.2, 1.28, 1.36, 1.45, 1.52, 1.6, 1.7, 1.85, 2.0, 2.2, 2.4, 2.6];
const MAX_NEAR_BLACK_RATIO_INCREASE = 0.05;

const RESIDUAL_RECALIBRATION_THRESHOLD = 0.5;
const MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION = 0.18;
const MIN_RECALIBRATION_SCORE_DELTA = 0.10;

// ============================================================
// Decision function
// ============================================================

/**
 * Determine whether alpha gain recalibration should be attempted.
 * Only runs when the original watermark was strong but removal left high residual.
 */
export function shouldRecalibrateAlphaStrength(params) {
    const { originalScore, processedScore, suppressionGain } = params;
    return originalScore >= 0.6 &&
        processedScore >= RESIDUAL_RECALIBRATION_THRESHOLD &&
        suppressionGain <= MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION;
}

// ============================================================
// Main calibration function
// ============================================================

/**
 * Search for the optimal alpha gain to minimize residual spatial correlation.
 *
 * @param {Object} params
 * @param {Object} params.sourceImageData - Current (post-first-pass) image data
 * @param {Float32Array} params.alphaMap - Alpha map
 * @param {Object} params.position - Watermark position {x, y, width, height}
 * @param {number} params.originalSpatialScore - Pre-removal spatial score
 * @param {number} params.processedSpatialScore - Post-removal spatial score
 * @returns {{ imageData, alphaGain, processedSpatialScore, suppressionGain }|null}
 */
export function recalibrateAlphaStrength(params) {
    const {
        sourceImageData,
        alphaMap,
        position,
        originalSpatialScore,
        processedSpatialScore
    } = params;

    const sizeW = position.width;
    const sizeH = position.height;
    const originalNearBlackRatio = calculateNearBlackRatio(sourceImageData, position);
    const maxAllowedNearBlackRatio = Math.min(1, originalNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);

    let bestScore = processedSpatialScore;
    let bestGain = 1;
    let bestImageData = null;

    // Coarse search over predefined gain candidates
    for (const alphaGain of ALPHA_GAIN_CANDIDATES) {
        const candidate = cloneImageData(sourceImageData);
        removeWatermark(candidate, alphaMap, position, { alphaGain });
        const candidateNearBlackRatio = calculateNearBlackRatio(candidate, position);
        if (candidateNearBlackRatio > maxAllowedNearBlackRatio) {
            continue;
        }

        const score = Math.abs(calculateCorrelation(candidate, position.x, position.y, sizeW, sizeH, alphaMap, true));
        if (score < bestScore) {
            bestScore = score;
            bestGain = alphaGain;
            bestImageData = candidate;
        }
    }

    // Fine search around best coarse gain
    const refinedCandidates = [];
    for (let delta = -0.05; delta <= 0.05; delta += 0.01) {
        const v = Number((bestGain + delta).toFixed(2));
        // Allow testing gains both below and above the coarse best,
        // including gain=1.0 when bestGain was improved by a coarse candidate
        if (v > 0.8 && v < 3) refinedCandidates.push(v);
    }

    for (const alphaGain of refinedCandidates) {
        if (alphaGain <= 0.8 || alphaGain >= 3) continue;
        const candidate = cloneImageData(sourceImageData);
        removeWatermark(candidate, alphaMap, position, { alphaGain });
        const candidateNearBlackRatio = calculateNearBlackRatio(candidate, position);
        if (candidateNearBlackRatio > maxAllowedNearBlackRatio) {
            continue;
        }

        const score = Math.abs(calculateCorrelation(candidate, position.x, position.y, sizeW, sizeH, alphaMap, true));
        if (score < bestScore) {
            bestScore = score;
            bestGain = alphaGain;
            bestImageData = candidate;
        }
    }

    const scoreDelta = Math.abs(processedSpatialScore) - bestScore;
    if (!bestImageData || scoreDelta < MIN_RECALIBRATION_SCORE_DELTA) {
        return null;
    }

    return {
        imageData: bestImageData,
        alphaGain: bestGain,
        processedSpatialScore: bestScore,
        suppressionGain: Math.abs(originalSpatialScore) - bestScore
    };
}
