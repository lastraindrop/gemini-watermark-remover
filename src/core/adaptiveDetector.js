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
import { DETECTION_THRESHOLDS } from './config.js';

const DEFAULT_THRESHOLD = DETECTION_THRESHOLDS.ADAPTIVE_MIN_CONFIDENCE;
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

export function interpolateAlphaMap(sourceAlpha, sourceWidth, targetSize, targetHeight, sourceHeight) {
    const tw = targetSize;
    const th = targetHeight || targetSize;
    if (tw <= 0 || th <= 0) return new Float32Array(0);

    const sourceW = sourceWidth;
    const sourceH = sourceHeight || sourceWidth;
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

function scoreCandidate(imageData, alphaMap, alphaGrad, { x, y, size, width: w, height: h }, buffers) {
    const candW = w || size;
    const candH = h || size;
    const { width: imgWidth, height: imgHeight, data } = imageData;
    if (x < 0 || y < 0 || x + candW > imgWidth || y + candH > imgHeight) {
        return null;
    }

    const spatial = Math.max(0, calculateCorrelation(imageData, x, y, candW, candH, alphaMap, true));

    const bufferSizeNeeded = candW * candH;
    const gradientsI = buffers?.gradientsI || new Float32Array(bufferSizeNeeded);
    const gradientsA = buffers?.gradientsA || new Float32Array(bufferSizeNeeded);
    const gradient = Math.max(0, calculateGradientCorrelation(
        imageData, x, y, candW, candH, alphaMap, gradientsI, gradientsA
    ));

    let varianceScore = 0;
    if (y > candH) {
        // Reference region ABOVE the candidate (preferred — independent of watermark content)
        const refY = Math.max(0, y - Math.round(candH * 1.2));
        const refH = Math.min(candH, y - refY);
        if (refH > 8) {
            const wmStd = regionStdDev(data, imgWidth, x, y, candW, candH);
            const refStd = regionStdDev(data, imgWidth, x, refY, candW, refH);
            if (refStd > EPSILON) {
                varianceScore = clamp(1 - wmStd / refStd, 0, 1);
            }
        }
    } else {
        // v2.4: Watermark near top edge — use reference region BELOW instead.
        // Previously this path was missing, causing varianceScore=0 for top-anchored watermarks.
        const refY = y + Math.round(candH * 1.2);
        const maxY = Math.floor(data.length / (imgWidth * 4));
        const refH = Math.min(candH, maxY - refY);
        if (refH > 8) {
            const wmStd = regionStdDev(data, imgWidth, x, y, candW, candH);
            const refStd = regionStdDev(data, imgWidth, x, refY, candW, refH);
            if (refStd > EPSILON) {
                varianceScore = clamp(1 - wmStd / refStd, 0, 1);
            }
        }
    }

    const confidence = spatial * DETECTION_THRESHOLDS.SPATIAL_WEIGHT + gradient * DETECTION_THRESHOLDS.GRADIENT_WEIGHT + varianceScore * DETECTION_THRESHOLDS.VARIANCE_WEIGHT;

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

    // Support rectangular watermarks such as Doubao 401×173.
    // Derive base width/height from config, falling back to logoSize for square profiles.
    const baseW = defaultConfig.logoWidth || defaultConfig.logoSize;
    const baseH = defaultConfig.logoHeight || defaultConfig.logoSize;
    const isRectangular = baseW !== baseH;
    const baseArea = baseW * baseH;

    // Look up alpha map using the primary dimension key
    const dimKey = isRectangular ? `${baseW}x${baseH}` : String(baseW);
    let alphaBase = alphaMaps[dimKey] || alphaMaps[baseW];
    // v2.7 C-4: Only fall back to generic 96/48 for square Gemini profiles.
    // For rectangular profiles such as Doubao 401×173, these
    // square fallbacks would attempt to detect the watermark using a
    // completely wrong alpha map shape — producing garbage correlations.
    if (!alphaBase && !isRectangular) {
        alphaBase = alphaMaps['96'] || alphaMaps['48'];
    }
    if (!alphaBase) return null;

    const buffers = {
        gradientsI: new Float32Array(baseArea),
        gradientsA: new Float32Array(baseArea)
    };

    // Cache alpha maps at different sizes; key = "WxH" to avoid collisions.
    const alphaCache = new Map();
    const cacheKey = (w, h) => `${w}x${h}`;
    alphaCache.set(cacheKey(baseW, baseH), { data: alphaBase, grad: sobelMagnitude(alphaBase, baseW, baseH) });

    function getAlphaTemplate(tw, th) {
        const key = cacheKey(tw, th);
        if (alphaCache.has(key)) return alphaCache.get(key);
        let alpha;
        if (tw === baseW && th === baseH) {
            alpha = alphaBase;
        } else {
            alpha = interpolateAlphaMap(alphaBase, baseW, tw, th, baseH);
        }
        const tpl = { data: alpha, grad: sobelMagnitude(alpha, tw, th) };
        alphaCache.set(key, tpl);
        return tpl;
    }

    // Scale list: generate sizes for the reference dimension (larger of baseW/baseH
    // for rectangular, or the single size for square). Aspect ratio is preserved.
    const refDim = Math.max(baseW, baseH);
    const aspectW = baseW / refDim;
    const aspectH = baseH / refDim;
    const minRef = clamp(Math.round(refDim * 0.65), 24, 144);
    const maxRef = clamp(
        Math.min(Math.round(refDim * 2.8), Math.floor(Math.min(width, height) * 0.4)),
        minRef,
        maxSearchSize
    );
    const scaleList = createScaleList(minRef, maxRef);

    const marginRange = Math.max(32, Math.round(refDim * 0.75));
    const minSize = Math.min(minRef, Math.round(minRef * Math.min(aspectW, aspectH)));
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
        const seedW = baseW;
        const seedH = baseH;
        const seedX = width - defaultConfig.marginRight - seedW;
        const seedY = height - defaultConfig.marginBottom - seedH;
        if (seedX >= 0 && seedY >= 0 && seedX + seedW <= width && seedY + seedH <= height) {
            const tpl = getAlphaTemplate(seedW, seedH);
            const score = scoreCandidate(imageData, tpl.data, tpl.grad, { x: seedX, y: seedY, size: seedW, width: seedW, height: seedH }, buffers);
            if (score) {
                pushTopK({ x: seedX, y: seedY, w: seedW, h: seedH, ...score }, score.confidence);
            }
        }
    }

    // Coarse search over scale × position grid
    for (const ref of scaleList) {
        const cw = Math.round(ref * aspectW);
        const ch = Math.round(ref * aspectH);
        if (cw < 4 || ch < 4) continue;
        const tpl = getAlphaTemplate(cw, ch);
        for (let mr = minMarginRight; mr <= maxMarginRight; mr += 8) {
            const x = width - mr - cw;
            if (x < 0) continue;
            for (let mb = minMarginBottom; mb <= maxMarginBottom; mb += 8) {
                const y = height - mb - ch;
                if (y < 0) continue;

                const score = scoreCandidate(imageData, tpl.data, tpl.grad, { x, y, size: ref, width: cw, height: ch }, buffers);
                if (!score) continue;

                const adjustedScore = score.confidence * Math.min(1, Math.sqrt(ref / 96));
                if (adjustedScore < DETECTION_THRESHOLDS.ADAPTIVE_MIN_ADJUSTED_SCORE) continue;

                pushTopK({ x, y, w: cw, h: ch, ...score }, adjustedScore);
            }
        }
    }

    if (topK.length === 0) return null;

    // Fine search around top-K candidates
    let best = null;
    for (const coarse of topK) {
        const coarseW = coarse.w || coarse.size;
        const coarseH = coarse.h || coarse.size;
        const coarseRef = isRectangular ? Math.max(coarseW, coarseH) : coarseW;
        const scaleLo = clamp(coarseRef - 10, minRef, maxRef);
        const scaleHi = clamp(coarseRef + 10, minRef, maxRef);

        for (let ref = scaleLo; ref <= scaleHi; ref += 2) {
            const fw = isRectangular ? Math.round(ref * aspectW) : ref;
            const fh = isRectangular ? Math.round(ref * aspectH) : ref;
            if (fw < 4 || fh < 4) continue;
            const tpl = getAlphaTemplate(fw, fh);
            for (let dx = -8; dx <= 8; dx += 2) {
                const x = coarse.x + dx;
                if (x < 0 || x + fw > width) continue;
                for (let dy = -8; dy <= 8; dy += 2) {
                    const y = coarse.y + dy;
                    if (y < 0 || y + fh > height) continue;

                    const score = scoreCandidate(imageData, tpl.data, tpl.grad, { x, y, size: ref, width: fw, height: fh }, buffers);
                    if (!score) continue;

                    if (!best || score.confidence > best.confidence) {
                        best = { x, y, w: fw, h: fh, ...score };
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
            width: best.w,
            height: best.h
        }
    };
}

// ============================================================
// Sub-pixel Refinement (Phase 3.3)
// ============================================================

const SUBPIXEL_REFINE_SHIFTS = [-0.25, 0, 0.25];
const SUBPIXEL_REFINE_SCALES = [0.99, 1, 1.01];
const OUTLINE_REFINEMENT_MIN_GAIN = 1.05;  // v2.6: lowered from 1.2 so normal-contrast watermarks also benefit

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
        alphaBias = 0,
        baselineShift = { dx: 0, dy: 0, scale: 1 },
        minGain = OUTLINE_REFINEMENT_MIN_GAIN,
        shiftCandidates = SUBPIXEL_REFINE_SHIFTS,
        scaleCandidates = SUBPIXEL_REFINE_SCALES,
        minGradientImprovement = 0.04,
        maxSpatialDrift = 0.08
    } = params;

    const sizeW = position.width;
    const sizeH = position.height;
    if (!sizeW || !sizeH || sizeW <= 8 || sizeH <= 8) return null;
    if (alphaGain < minGain) return null;

    const baseDx = baselineShift?.dx ?? 0;
    const baseDy = baselineShift?.dy ?? 0;
    const baseScale = baselineShift?.scale ?? 1;

    const gainCandidates = [alphaGain];
    const lower = Number((alphaGain - 0.01).toFixed(2));
    const upper = Number((alphaGain + 0.01).toFixed(2));
    if (lower !== alphaGain && lower > 1) gainCandidates.push(lower);
    if (upper !== alphaGain && upper < 3) gainCandidates.push(upper);

    const gradientsI = new Float32Array(sizeW * sizeH);
    const gradientsA = new Float32Array(sizeW * sizeH);

    let best = null;

    for (const scaleDelta of scaleCandidates) {
        const scale = Number((baseScale * scaleDelta).toFixed(4));
        for (const dyDelta of shiftCandidates) {
            const dy = baseDy + dyDelta;
            for (const dxDelta of shiftCandidates) {
                const dx = baseDx + dxDelta;
                const warped = warpAlphaMap(alphaMap, sizeW, { dx, dy, scale }, sizeH);
                for (const gain of gainCandidates) {
                    const candidate = { ...sourceImageData, data: new Uint8ClampedArray(sourceImageData.data) };
                    removeWatermark(candidate, warped, position, { alphaGain: gain, alphaBias });

                    const spatialScore = calculateCorrelation(candidate, position.x, position.y, sizeW, sizeH, warped, true);
                    const gradientScore = calculateGradientCorrelation(
                        candidate, position.x, position.y, sizeW, sizeH, warped,
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
