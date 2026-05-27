/**
 * Adaptive Watermark Detector (Phase 2.2)
 *
 * Provides coarse-to-fine multi-scale search for watermark detection.
 * Uses 3D scoring: spatial NCC (0.5) + gradient NCC (0.3) + variance (0.2).
 *
 * Ported and adapted from the original GargantuaX gemini-watermark-remover.
 */

import { calculateCorrelation, calculateGradientCorrelation } from './detector.js';
import { removeWatermark } from './blendModes.js';
import { regionStdDev } from './utils.js';

const DEFAULT_THRESHOLD = 0.35;
const EPSILON = 1e-8;

// ============================================================
// Utility functions
// ============================================================

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function toGrayscale(imageData) {
    const { width, height, data } = imageData;
    const out = new Float32Array(width * height);
    for (let i = 0; i < out.length; i++) {
        const j = i * 4;
        out[i] = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255;
    }
    return out;
}

function sobelMagnitude(gray, width, height) {
    const grad = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const gx =
                -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] +
                gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
            const gy =
                -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
                gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
            grad[i] = Math.sqrt(gx * gx + gy * gy);
        }
    }
    return grad;
}

// ============================================================
// Alpha map utilities
// ============================================================

export function interpolateAlphaMap(sourceAlpha, sourceSize, targetSize, targetHeight) {
    const tw = targetSize;
    const th = targetHeight || targetSize;
    if (tw <= 0 || th <= 0) return new Float32Array(0);

    const sourceW = sourceSize;
    const sourceH = sourceSize;
    if (sourceW === tw && sourceH === th) return new Float32Array(sourceAlpha);

    const out = new Float32Array(tw * th);
    const scaleX = (sourceW - 1) / Math.max(1, tw - 1);
    const scaleY = (sourceH - 1) / Math.max(1, th - 1);

    for (let y = 0; y < th; y++) {
        const sy = y * scaleY;
        const y0 = Math.floor(sy);
        const y1 = Math.min(sourceH - 1, y0 + 1);
        const fy = sy - y0;

        for (let x = 0; x < tw; x++) {
            const sx = x * scaleX;
            const x0 = Math.floor(sx);
            const x1 = Math.min(sourceW - 1, x0 + 1);
            const fx = sx - x0;

            const p00 = sourceAlpha[y0 * sourceW + x0];
            const p10 = sourceAlpha[y0 * sourceW + x1];
            const p01 = sourceAlpha[y1 * sourceW + x0];
            const p11 = sourceAlpha[y1 * sourceW + x1];

            const top = p00 + (p10 - p00) * fx;
            const bottom = p01 + (p11 - p01) * fx;
            out[y * tw + x] = top + (bottom - top) * fy;
        }
    }

    return out;
}

export function warpAlphaMap(alphaMap, size, { dx = 0, dy = 0, scale = 1 } = {}, targetHeight) {
    const tw = size;
    const th = targetHeight || size;
    if (tw <= 0 || th <= 0) return new Float32Array(0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(scale) || scale <= 0) {
        return new Float32Array(0);
    }
    if (dx === 0 && dy === 0 && scale === 1) return new Float32Array(alphaMap);

    const sw = size;
    const sh = targetHeight || size;

    const sample = (sx, sy) => {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;

        const ix0 = clamp(x0, 0, sw - 1);
        const iy0 = clamp(y0, 0, sh - 1);
        const ix1 = clamp(x0 + 1, 0, sw - 1);
        const iy1 = clamp(y0 + 1, 0, sh - 1);

        const p00 = alphaMap[iy0 * sw + ix0];
        const p10 = alphaMap[iy0 * sw + ix1];
        const p01 = alphaMap[iy1 * sw + ix0];
        const p11 = alphaMap[iy1 * sw + ix1];

        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        return top + (bottom - top) * fy;
    };

    const out = new Float32Array(tw * th);
    const cx = (sw - 1) / 2;
    const cy = (sh - 1) / 2;
    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            const sx = (x - cx) / scale + cx + dx;
            const sy = (y - cy) / scale + cy + dy;
            out[y * tw + x] = sample(sx, sy);
        }
    }
    return out;
}

// ============================================================
// 3D Candidate Scoring
// ============================================================

function scoreCandidate(imageData, alphaMap, alphaGrad, { x, y, size }, buffers) {
    const { width: imgWidth, height: imgHeight, data } = imageData;
    if (x < 0 || y < 0 || x + size > imgWidth || y + size > imgHeight) {
        return null;
    }

    const spatial = Math.max(0, calculateCorrelation(imageData, x, y, size, size, alphaMap, true));

    const gradientsI = buffers?.gradientsI || new Float32Array(size * size);
    const gradientsA = buffers?.gradientsA || new Float32Array(size * size);
    const gradient = Math.max(0, calculateGradientCorrelation(
        imageData, x, y, size, size, alphaMap, gradientsI, gradientsA
    ));

    let varianceScore = 0;
    if (y > size) {
        const refY = Math.max(0, y - Math.round(size * 1.2));
        const refH = Math.min(size, y - refY);
        if (refH > 8) {
            const wmStd = regionStdDev(data, imgWidth, x, y, size);
            const refStd = regionStdDev(data, imgWidth, x, refY, refH);
            if (refStd > EPSILON) {
                varianceScore = clamp(1 - wmStd / refStd, 0, 1);
            }
        }
    }

    const confidence = spatial * 0.5 + gradient * 0.3 + varianceScore * 0.2;

    return {
        confidence: clamp(confidence, 0, 1),
        spatialScore: spatial,
        gradientScore: gradient,
        varianceScore
    };
}

// ============================================================
// Multi-scale search helper
// ============================================================

function createScaleList(minSize, maxSize) {
    const set = new Set();
    for (let s = minSize; s <= maxSize; s += 8) set.add(s);
    if (48 >= minSize && 48 <= maxSize) set.add(48);
    if (96 >= minSize && 96 <= maxSize) set.add(96);
    return [...set].sort((a, b) => a - b);
}

// ============================================================
// Main adaptive detection function
// ============================================================

/**
 * Detect watermark using adaptive coarse-to-fine multi-scale search.
 *
 * @param {Object} params
 * @param {ImageData} params.imageData - Full image data
 * @param {Object} params.alphaMaps - Map of size -> alpha map (Float32Array)
 * @param {Object} params.defaultConfig - { logoSize, marginRight, marginBottom }
 * @param {number} [params.threshold] - Minimum confidence threshold (default 0.32)
 * @param {number} [params.maxSearchSize] - Maximum search size (default 192)
 * @returns {Object|null} Detection result or null
 */
export function detectAdaptiveWatermarkRegion({
    imageData,
    alphaMaps,
    defaultConfig,
    threshold = DEFAULT_THRESHOLD,
    maxSearchSize = 192
}) {
    const { width, height } = imageData;
    const baseSize = defaultConfig.logoSize;

    const alphaBase = alphaMaps[baseSize] || alphaMaps['96'] || alphaMaps['48'];
    if (!alphaBase) return null;

    const buffers = {
        gradientsI: new Float32Array(baseSize * baseSize),
        gradientsA: new Float32Array(baseSize * baseSize)
    };

    // Cache alpha maps at different sizes
    const alphaCache = new Map();
    alphaCache.set(baseSize, { data: alphaBase, grad: sobelMagnitude(alphaBase, baseSize, baseSize) });

    function getAlphaTemplate(size) {
        if (alphaCache.has(size)) return alphaCache.get(size);
        let alpha;
        if (size === baseSize) {
            alpha = alphaBase;
        } else {
            alpha = interpolateAlphaMap(alphaBase, baseSize, size);
        }
        const tpl = { data: alpha, grad: sobelMagnitude(alpha, size, size) };
        alphaCache.set(size, tpl);
        return tpl;
    }

    const minSize = clamp(Math.round(baseSize * 0.65), 24, 144);
    const maxSize = clamp(
        Math.min(Math.round(baseSize * 2.8), Math.floor(Math.min(width, height) * 0.4)),
        minSize,
        maxSearchSize
    );
    const scaleList = createScaleList(minSize, maxSize);

    const marginRange = Math.max(32, Math.round(baseSize * 0.75));
    const minMarginRight = clamp(defaultConfig.marginRight - marginRange, 8, width - minSize - 1);
    const maxMarginRight = clamp(defaultConfig.marginRight + marginRange, minMarginRight, width - minSize - 1);
    const minMarginBottom = clamp(defaultConfig.marginBottom - marginRange, 8, height - minSize - 1);
    const maxMarginBottom = clamp(defaultConfig.marginBottom + marginRange, minMarginBottom, height - minSize - 1);

    // Top-K candidates
    const topK = [];
    const pushTopK = (candidate, adjustedScore) => {
        topK.push({ ...candidate, adjustedScore });
        topK.sort((a, b) => b.adjustedScore - a.adjustedScore);
        if (topK.length > 5) topK.length = 5;
    };

    // Check default anchor first as seed
    {
        const seedSize = defaultConfig.logoSize;
        const seedX = width - defaultConfig.marginRight - seedSize;
        const seedY = height - defaultConfig.marginBottom - seedSize;
        if (seedX >= 0 && seedY >= 0 && seedX + seedSize <= width && seedY + seedSize <= height) {
            const tpl = getAlphaTemplate(seedSize);
            const score = scoreCandidate(imageData, tpl.data, tpl.grad, { x: seedX, y: seedY, size: seedSize }, buffers);
            if (score) {
                pushTopK({ x: seedX, y: seedY, size: seedSize, ...score }, score.confidence);
            }
        }
    }

    // Coarse search over scale × position grid
    for (const size of scaleList) {
        const tpl = getAlphaTemplate(size);
        for (let mr = minMarginRight; mr <= maxMarginRight; mr += 8) {
            const x = width - mr - size;
            if (x < 0) continue;
            for (let mb = minMarginBottom; mb <= maxMarginBottom; mb += 8) {
                const y = height - mb - size;
                if (y < 0) continue;

                const score = scoreCandidate(imageData, tpl.data, tpl.grad, { x, y, size }, buffers);
                if (!score) continue;

                const adjustedScore = score.confidence * Math.min(1, Math.sqrt(size / 96));
                if (adjustedScore < 0.06) continue;

                pushTopK({ x, y, size, ...score }, adjustedScore);
            }
        }
    }

    if (topK.length === 0) return null;

    // Fine search around top-K candidates
    let best = null;
    for (const coarse of topK) {
        const scaleLo = clamp(coarse.size - 10, minSize, maxSize);
        const scaleHi = clamp(coarse.size + 10, minSize, maxSize);

        for (let size = scaleLo; size <= scaleHi; size += 2) {
            const tpl = getAlphaTemplate(size);
            for (let dx = -8; dx <= 8; dx += 2) {
                const x = coarse.x + dx;
                if (x < 0 || x + size > width) continue;
                for (let dy = -8; dy <= 8; dy += 2) {
                    const y = coarse.y + dy;
                    if (y < 0 || y + size > height) continue;

                    const score = scoreCandidate(imageData, tpl.data, tpl.grad, { x, y, size }, buffers);
                    if (!score) continue;

                    if (!best || score.confidence > best.confidence) {
                        best = { x, y, size, ...score };
                    }
                }
            }
        }
    }

    if (!best || best.confidence < threshold) return null;

    return {
        found: true,
        confidence: best.confidence,
        spatialScore: best.spatialScore,
        gradientScore: best.gradientScore,
        varianceScore: best.varianceScore,
        region: {
            x: best.x,
            y: best.y,
            width: best.size,
            height: best.size
        }
    };
}

// ============================================================
// Sub-pixel Refinement (Phase 3.3)
// ============================================================

const SUBPIXEL_REFINE_SHIFTS = [-0.25, 0, 0.25];
const SUBPIXEL_REFINE_SCALES = [0.99, 1, 1.01];
const OUTLINE_REFINEMENT_MIN_GAIN = 1.2;

/**
 * Refine watermark removal at sub-pixel level by testing small shifts
 * and scale adjustments of the alpha map.
 *
 * @param {Object} params
 * @param {Object} params.sourceImageData - Image data after initial removal
 * @param {Float32Array} params.alphaMap - Alpha map
 * @param {Object} params.position - {x, y, width, height}
 * @param {number} params.alphaGain - Current alpha gain
 * @param {number} params.baselineSpatialScore - Current residual spatial score
 * @param {number} params.baselineGradientScore - Current residual gradient score
 * @param {Object} [params.baselineShift] - Existing shift {dx, dy, scale}
 * @returns {{ imageData, alphaMap, alphaGain, shift, spatialScore, gradientScore }|null}
 */
export function refineSubpixelOutline(params) {
    const {
        sourceImageData,
        alphaMap,
        position,
        alphaGain,
        baselineSpatialScore,
        baselineGradientScore,
        baselineShift = { dx: 0, dy: 0, scale: 1 },
        minGain = OUTLINE_REFINEMENT_MIN_GAIN,
        shiftCandidates = SUBPIXEL_REFINE_SHIFTS,
        scaleCandidates = SUBPIXEL_REFINE_SCALES,
        minGradientImprovement = 0.04,
        maxSpatialDrift = 0.08
    } = params;

    const size = position.width;
    if (!size || size <= 8) return null;
    if (alphaGain < minGain) return null;

    const baseDx = baselineShift?.dx ?? 0;
    const baseDy = baselineShift?.dy ?? 0;
    const baseScale = baselineShift?.scale ?? 1;

    const gainCandidates = [alphaGain];
    const lower = Number((alphaGain - 0.01).toFixed(2));
    const upper = Number((alphaGain + 0.01).toFixed(2));
    if (lower !== alphaGain && lower > 1) gainCandidates.push(lower);
    if (upper !== alphaGain && upper < 3) gainCandidates.push(upper);

    const gradientsI = new Float32Array(size * size);
    const gradientsA = new Float32Array(size * size);

    let best = null;

    for (const scaleDelta of scaleCandidates) {
        const scale = Number((baseScale * scaleDelta).toFixed(4));
        for (const dyDelta of shiftCandidates) {
            const dy = baseDy + dyDelta;
            for (const dxDelta of shiftCandidates) {
                const dx = baseDx + dxDelta;
                const warped = warpAlphaMap(alphaMap, size, { dx, dy, scale });
                for (const gain of gainCandidates) {
                    const candidate = { ...sourceImageData, data: new Uint8ClampedArray(sourceImageData.data) };
                    removeWatermark(candidate, warped, { ...position, width: size, height: size }, { alphaGain: gain });

                    const spatialScore = calculateCorrelation(candidate, position.x, position.y, size, size, warped, true);
                    const gradientScore = calculateGradientCorrelation(
                        candidate, position.x, position.y, size, size, warped,
                        gradientsI, gradientsA
                    );

                    const cost = Math.abs(spatialScore) * 0.6 + Math.max(0, gradientScore);
                    if (!best || cost < best.cost) {
                        best = {
                            imageData: candidate,
                            alphaMap: warped,
                            alphaGain: gain,
                            shift: { dx, dy, scale },
                            spatialScore,
                            gradientScore,
                            cost
                        };
                    }
                }
            }
        }
    }

    if (!best) return null;

    const improvedGradient = best.gradientScore <= baselineGradientScore - minGradientImprovement;
    const keptSpatial = Math.abs(best.spatialScore) <= Math.abs(baselineSpatialScore) + maxSpatialDrift;
    if (!improvedGradient || !keptSpatial) return null;

    return best;
}
