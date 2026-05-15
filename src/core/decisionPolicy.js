/**
 * Watermark Decision Policy (Phase 5)
 *
 * Classifies detection signals into tiers for consistent decision-making
 * across the pipeline. Replaces ad-hoc threshold comparisons.
 *
 * Tiers:
 *   direct-match     – strong evidence, safe to apply removal
 *   needs-validation – some evidence, additional checks recommended
 *   insufficient     – no reliable evidence of watermark
 */

// ============================================================
// Standard signal thresholds
// ============================================================

const STANDARD_DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.30;
const STANDARD_DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.10;
const STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.28;
const STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.45;

// ============================================================
// Adaptive signal thresholds
// ============================================================

const ADAPTIVE_DIRECT_MATCH_MIN_CONFIDENCE = 0.48;
const ADAPTIVE_DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.42;
const ADAPTIVE_DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.10;
const ADAPTIVE_DIRECT_MATCH_MIN_SIZE = 40;
const ADAPTIVE_DIRECT_MATCH_MAX_SIZE = 192;

// ============================================================
// Attribution thresholds (post-removal)
// ============================================================

const ATTRIBUTION_MIN_SIZE = 24;
const ATTRIBUTION_MAX_SIZE = 192;
const ATTRIBUTION_MAX_RESIDUAL_SCORE = 0.20;
const ATTRIBUTION_MIN_SUPPRESSION_GAIN = 0.25;
const ATTRIBUTION_MIN_SPATIAL_SCORE = 0.22;
// Adaptive attribution threshold: ATTRIBUTION_MIN_ADAPTIVE_CONFIDENCE = 0.35

// ============================================================
// Helpers
// ============================================================

function toFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ============================================================
// Standard signal classification
// ============================================================

/**
 * Classify a standard (catalog-probe / heuristic-probe) detection signal.
 *
 * @param {Object} params
 * @param {number} params.spatialScore - NCC spatial correlation
 * @param {number} params.gradientScore - NCC gradient correlation
 * @returns {{ tier: 'direct-match'|'needs-validation'|'insufficient' }}
 */
export function classifyStandardWatermarkSignal({ spatialScore, gradientScore }) {
    const spatial = toFiniteNumber(spatialScore);
    const gradient = toFiniteNumber(gradientScore);

    if (spatial === null || gradient === null) {
        return { tier: 'insufficient' };
    }

    if (
        (spatial >= STANDARD_DIRECT_MATCH_MIN_SPATIAL_SCORE &&
         gradient >= STANDARD_DIRECT_MATCH_MIN_GRADIENT_SCORE) ||
        (spatial >= STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_SPATIAL_SCORE &&
         gradient >= STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_GRADIENT_SCORE)
    ) {
        return { tier: 'direct-match' };
    }

    if (spatial > 0 || gradient > 0) {
        return { tier: 'needs-validation' };
    }

    return { tier: 'insufficient' };
}

// ============================================================
// Adaptive signal classification
// ============================================================

/**
 * Classify an adaptive detection result.
 *
 * @param {Object|null} adaptiveResult - From detectAdaptiveWatermarkRegion
 * @returns {{ tier: 'direct-match'|'needs-validation'|'insufficient' }}
 */
export function classifyAdaptiveWatermarkSignal(adaptiveResult) {
    if (!adaptiveResult || adaptiveResult.found !== true) {
        return { tier: 'insufficient' };
    }

    const confidence = toFiniteNumber(adaptiveResult.confidence);
    const spatial = toFiniteNumber(adaptiveResult.spatialScore);
    const gradient = toFiniteNumber(adaptiveResult.gradientScore);
    const size = toFiniteNumber(adaptiveResult?.region?.width);

    if (confidence === null || spatial === null || gradient === null || size === null) {
        return { tier: 'insufficient' };
    }

    if (
        confidence >= ADAPTIVE_DIRECT_MATCH_MIN_CONFIDENCE &&
        spatial >= ADAPTIVE_DIRECT_MATCH_MIN_SPATIAL_SCORE &&
        gradient >= ADAPTIVE_DIRECT_MATCH_MIN_GRADIENT_SCORE &&
        size >= ADAPTIVE_DIRECT_MATCH_MIN_SIZE &&
        size <= ADAPTIVE_DIRECT_MATCH_MAX_SIZE
    ) {
        return { tier: 'direct-match' };
    }

    if (
        size >= ADAPTIVE_DIRECT_MATCH_MIN_SIZE &&
        size <= ADAPTIVE_DIRECT_MATCH_MAX_SIZE &&
        gradient >= ADAPTIVE_DIRECT_MATCH_MIN_GRADIENT_SCORE &&
        (confidence > 0 || spatial > 0)
    ) {
        return { tier: 'needs-validation' };
    }

    return { tier: 'insufficient' };
}

// ============================================================
// Detection result decision
// ============================================================

/**
 * Determine the decision tier for a detection result.
 *
 * @param {Object} result - Detection result from detectProfileWatermarks
 * @returns {{ tier: 'direct-match'|'needs-validation'|'insufficient', reason: string }}
 */
export function decideDetectionTier(result) {
    if (!result || !result.winner) {
        return { tier: 'insufficient', reason: 'no-winner' };
    }

    const { source, confidence } = result.winner;

    if (source === 'catalog-probe') {
        return confidence >= 0.60
            ? { tier: 'direct-match', reason: 'catalog-probe-high' }
            : { tier: 'needs-validation', reason: 'catalog-probe-moderate' };
    }

    if (source === 'adaptive-search') {
        return confidence >= ADAPTIVE_DIRECT_MATCH_MIN_CONFIDENCE
            ? { tier: 'direct-match', reason: 'adaptive-high' }
            : { tier: 'needs-validation', reason: 'adaptive-moderate' };
    }

    if (source === 'heuristic-probe') {
        return confidence >= 0.70
            ? { tier: 'direct-match', reason: 'heuristic-high' }
            : { tier: 'needs-validation', reason: 'heuristic-moderate' };
    }

    if (source && source.startsWith('global-')) {
        return confidence >= 0.55
            ? { tier: 'direct-match', reason: 'global-high' }
            : confidence >= 0.35
                ? { tier: 'needs-validation', reason: 'global-moderate' }
                : { tier: 'insufficient', reason: 'global-low' };
    }

    return { tier: 'insufficient', reason: 'unknown-source' };
}

// ============================================================
// Post-removal attribution
// ============================================================

/**
 * Classify the quality of watermark removal for attribution purposes.
 *
 * @param {Object} watermarkMeta - Metadata from removal process
 * @returns {{ tier: 'direct-match'|'safe-removal'|'insufficient' }}
 */
export function classifyRemovalAttribution(watermarkMeta) {
    if (!watermarkMeta || typeof watermarkMeta !== 'object') {
        return { tier: 'insufficient' };
    }

    const size = toFiniteNumber(watermarkMeta.size);
    if (size === null || size < ATTRIBUTION_MIN_SIZE || size > ATTRIBUTION_MAX_SIZE) {
        return { tier: 'insufficient' };
    }

    const detection = watermarkMeta.detection || {};
    const originalSpatialScore = toFiniteNumber(detection.originalSpatialScore);
    const processedSpatialScore = toFiniteNumber(detection.processedSpatialScore);
    const suppressionGain = toFiniteNumber(detection.suppressionGain);

    if (originalSpatialScore === null || processedSpatialScore === null || suppressionGain === null) {
        return { tier: 'insufficient' };
    }

    if (
        originalSpatialScore >= ATTRIBUTION_MIN_SPATIAL_SCORE &&
        processedSpatialScore <= ATTRIBUTION_MAX_RESIDUAL_SCORE &&
        suppressionGain >= ATTRIBUTION_MIN_SUPPRESSION_GAIN
    ) {
        return { tier: 'safe-removal' };
    }

    return { tier: 'insufficient' };
}
