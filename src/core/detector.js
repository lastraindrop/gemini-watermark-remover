/**
 * Watermark detection engine (Precision & Speed Optimized)
 *
 * Phases:
 * 1. Catalog & Anchor Check (Ultra-Fast)
 * 2. Heuristic Global Search (Exhaustive)
 * 3. Confidence Ranking & Post-processing
 * 4. Entropy-Adaptive Weighting (v1.7)
 * 5. Multi-Dimensional Scoring (v2.2): spatial(NCC) + gradient(Sobel) + variance(stdDev)
 */

import { getCatalogConfig, getAllCatalogConfigs } from './catalog.js';
import { registry } from './templates/registry.js';
import { regionStdDev } from './utils.js';
import { DETECTION_THRESHOLDS } from './config.js';

export class DetectorContext {
    constructor() {
        this._blurBuffer = undefined;
        this._sharedGradientsI = undefined;
        this._sharedGradientsA = undefined;
    }

    getBlurBuffer(requiredLength) {
        if (!this._blurBuffer || this._blurBuffer.length !== requiredLength) {
            this._blurBuffer = new Uint8ClampedArray(requiredLength);
        }
        return this._blurBuffer;
    }

    getGradientBuffers(requiredLength) {
        if (!this._sharedGradientsI || this._sharedGradientsI.length < requiredLength) {
            this._sharedGradientsI = new Float32Array(requiredLength);
            this._sharedGradientsA = new Float32Array(requiredLength);
        }
        return { gradientsI: this._sharedGradientsI, gradientsA: this._sharedGradientsA };
    }

    reset() {
        this._blurBuffer = null;
        this._sharedGradientsI = null;
        this._sharedGradientsA = null;
    }
}

const _defaultContext = new DetectorContext();

const SEARCH_CONFIG = {
    RANGE_X: DETECTION_THRESHOLDS.SEARCH_RANGE_X,
    RANGE_Y: DETECTION_THRESHOLDS.SEARCH_RANGE_Y,
    CANDIDATES_LIMIT_PER_SIZE: DETECTION_THRESHOLDS.CANDIDATES_LIMIT_PER_SIZE,
    PROXIMITY_THRESHOLD: DETECTION_THRESHOLDS.PROXIMITY_THRESHOLD,
    FINE_TUNE_RANGE: DETECTION_THRESHOLDS.FINE_TUNE_RANGE,
    JITTER_RANGE: DETECTION_THRESHOLDS.JITTER_RANGE,
    JITTER_OFFICIAL: DETECTION_THRESHOLDS.JITTER_OFFICIAL,
    THRESHOLDS: {
        ANCHORED_OFFICIAL: DETECTION_THRESHOLDS.ANCHORED_OFFICIAL,
        ANCHORED_OTHER: DETECTION_THRESHOLDS.ANCHORED_OTHER,
        STRICT_EXIT: DETECTION_THRESHOLDS.STRICT_EXIT,
        COARSE: DETECTION_THRESHOLDS.COARSE,
        STAGE2_NR: DETECTION_THRESHOLDS.STAGE2_NR,
        STAGE2_CLEAN: DETECTION_THRESHOLDS.STAGE2_CLEAN,
        FINAL_ANCHORED: DETECTION_THRESHOLDS.FINAL_ANCHORED,
        FINAL_ALIGNED: DETECTION_THRESHOLDS.FINAL_ALIGNED,
        FINAL_FREE: DETECTION_THRESHOLDS.FINAL_FREE
    }
};

/**
 * Detect watermark position and size using pixel correlation
 * @param {ImageData} imageData - Full image data
 * @param {Object} alphaMaps - Map of size_str -> Float32Array
 * @param {Object} options - { deepScan: boolean }
 * @returns {Object|null} {x, y, width, height, confidence} or null if not found
 */
export function detectWatermark(imageData, alphaMaps, options = { deepScan: true, noiseReduction: false }, context = _defaultContext) {
    const { width, height } = imageData;
    const { deepScan, noiseReduction, overrides = {} } = options;
    
    const config = {
        ...SEARCH_CONFIG,
        ...overrides,
        THRESHOLDS: { ...SEARCH_CONFIG.THRESHOLDS, ...(overrides.THRESHOLDS || {}) }
    };

    let searchData = imageData;
    if (noiseReduction) {
        const blurBuf = context.getBlurBuffer(imageData.data.length);
        searchData = {
            ...imageData,
            data: fastBoxBlur(imageData.data, width, height, blurBuf)
        };
    }

    const allCandidates = [];

    // --- Phase 1: Catalog & Anchor Check ---
    const catalogConfig = getCatalogConfig(width, height);
    // Include doubao catalog entries that match this resolution
    const doubaoMatches = getAllCatalogConfigs(width, height, 'doubao');
    const standardConfigs = [
        catalogConfig,
        { logoSize: 96, marginRight: 64, marginBottom: 64 },
        { logoSize: 48, marginRight: 32, marginBottom: 32 },
        ...doubaoMatches
    ].filter(Boolean);

    for (const cfg of standardConfigs) {
        const logoW = cfg.logoWidth || cfg.logoSize;
        const logoH = cfg.logoHeight || cfg.logoSize;
        const dimKey = cfg.logoWidth ? `${logoW}x${logoH}` : `${logoW}`;
        let alphaMapObj = alphaMaps[dimKey] || alphaMaps[cfg.assetKey];
        if (!alphaMapObj) continue;
        const alphaMap = alphaMapObj.data || alphaMapObj;

        let x, y;
        if (cfg.anchor === 'top-left') {
            x = cfg.marginLeft || 0;
            y = cfg.marginTop || 0;
        } else {
            x = width - (cfg.marginRight || 0) - logoW;
            y = height - (cfg.marginBottom || 0) - logoH;
        }
        if (x < 0 || y < 0) continue;

        let bestConf = 0;
        let bestX = x, bestY = y;
        
        // Initial check
        bestConf = calculateCorrelation(searchData, x, y, logoW, logoH, alphaMap, true);
        
        // v2.6: Coarse relocation scan. When the watermark is offset 5-20px
        // from the expected anchor (common with Gemini's slight placement
        // variation), the initial NCC is very low because the alpha map is
        // completely misaligned. Before entering fine jitter, do a coarse
        // ±16px scan at step 4 to find the approximate offset. This is much
        // cheaper than a full ±16px fine scan (81 vs 1089 evaluations) yet
        // reliably finds watermarks that fine jitter alone would miss.
        const coarseRelocateRange = 16;
        const coarseStep = 4;
        const coarseTrigger = 0.30;  // only relocate if initial conf is weak
        if (bestConf < coarseTrigger) {
            for (let dy = -coarseRelocateRange; dy <= coarseRelocateRange; dy += coarseStep) {
                for (let dx = -coarseRelocateRange; dx <= coarseRelocateRange; dx += coarseStep) {
                    if (dx === 0 && dy === 0) continue;
                    const c = calculateCorrelation(searchData, x + dx, y + dy, logoW, logoH, alphaMap, false);
                    if (c > bestConf) {
                        bestConf = c;
                        bestX = x + dx;
                        bestY = y + dy;
                    }
                }
            }
        }

        // Jitter search if not already perfect (v1.9.0)
        // v2.6: Removed JITTER_TRIGGER_MIN gate. Previously, low initial
        // confidence (common when watermark is offset 5-15px from the anchor)
        // would SKIP the jitter search entirely — exactly when jitter is most
        // needed. Now jitter runs whenever confidence is below near-perfect,
        // so offset watermarks get a chance to be found. The coarse scan above
        // may have already moved bestX/bestY closer to the true position.
        if (bestConf < DETECTION_THRESHOLDS.JITTER_TRIGGER_MAX) {
            const jitter = cfg.isOfficial ? config.JITTER_OFFICIAL : config.JITTER_RANGE;
            for (let dy = -jitter; dy <= jitter; dy++) {
                for (let dx = -jitter; dx <= jitter; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const c = calculateCorrelation(searchData, bestX + dx, bestY + dy, logoW, logoH, alphaMap, true);
                    // Distance penalty to avoid drift from the coarse-relocated center
                    const penalty = (Math.abs(dx) + Math.abs(dy)) * 0.01;
                    if (c - penalty > bestConf) {
                        bestConf = c;
                        bestX = bestX + dx;
                        bestY = bestY + dy;
                    }
                }
            }
        }

        const threshold = cfg.isOfficial ? config.THRESHOLDS.ANCHORED_OFFICIAL : config.THRESHOLDS.ANCHORED_OTHER; 
        if (bestConf >= threshold) {
            allCandidates.push({ x: bestX, y: bestY, width: logoW, height: logoH, confidence: bestConf, mode: 'anchored' });
        }
    }
    
    if (allCandidates.length > 0) {
        allCandidates.sort((a, b) => b.confidence - a.confidence);
        // Removed early exit (v1.9.1): Always run full pipeline to ensure best match
        // if (allCandidates[0].confidence > config.THRESHOLDS.STRICT_EXIT) return allCandidates[0];
    }

    // --- Phase 2: Heuristic Global Search (All known sizes) ---
    const searchRangeX = Math.floor(width * config.RANGE_X);
    const searchRangeY = Math.floor(height * config.RANGE_Y);
    
    // Dynamic sizes: derive from catalog entries (supports rectangular watermarks)
    const dynamicSizes = new Map();
    for (const profile of registry.getAllProfiles()) {
        for (const entry of registry.getCatalog(profile.id)) {
            const w = entry.logoWidth || entry.logoSize;
            const h = entry.logoHeight || entry.logoSize;
            dynamicSizes.set(`${w}x${h}`, { w, h });
        }
    }
    // Add standard square fallbacks
    for (const s of [96, 48]) {
        if (!dynamicSizes.has(`${s}x${s}`)) dynamicSizes.set(`${s}x${s}`, { w: s, h: s });
    }
    // Add sizes from any alphaMaps keys passed by caller (heuristic sizes)
    for (const key of Object.keys(alphaMaps)) {
        const parts = key.split('x');
        if (parts.length === 2) {
            const kw = parseInt(parts[0]);
            const kh = parseInt(parts[1]);
            if (kw > 0 && kh > 0 && !dynamicSizes.has(key)) {
                dynamicSizes.set(key, { w: kw, h: kh });
            }
        } else if (/^\d+$/.test(key)) {
            const s = parseInt(key);
            if (s > 0 && !dynamicSizes.has(`${s}x${s}`)) {
                dynamicSizes.set(`${s}x${s}`, { w: s, h: s });
            }
        }
    }
    const sizes = Array.from(dynamicSizes.values());

    for (const { w: sizeW, h: sizeH } of sizes) {
        // v2.3: Safer alpha map lookup. Non-square watermarks (Doubao 401×173,
        // DALL-E 120×40) must match the exact WxH key — single-dimension fallbacks
        // (alphaMaps[401], alphaMaps[173]) would match unrelated square templates.
        const isRect = sizeW !== sizeH;
        let alphaMap = alphaMaps[`${sizeW}x${sizeH}`];
        if (!alphaMap && !isRect) {
            alphaMap = alphaMaps[sizeW] || alphaMaps[sizeH];
        }
        if (!alphaMap) {
            alphaMap = alphaMaps[`${sizeW}`] || alphaMaps[`${sizeH}`];
        }
        if (!alphaMap) {
            const sizeKey = Object.keys(alphaMaps).find(k => {
                const parts = k.split('x');
                if (parts.length === 2) {
                    return parseInt(parts[0]) === sizeW && parseInt(parts[1]) === sizeH;
                }
                return false;
            });
            if (sizeKey) alphaMap = alphaMaps[sizeKey];
        }
        if (!alphaMap) continue;

        const startX = Math.max(-sizeW / 2, width - searchRangeX - sizeW);
        const startY = Math.max(-sizeH / 2, height - searchRangeY - sizeH);
        const sizeCandidates = [];
        const step = sizeW <= 48 ? 1 : 2;

        for (let y = startY; y < height - sizeH / 2; y += step) {
            for (let x = startX ; x < width - sizeW / 2; x += step) {
                const confidence = calculateCorrelation(searchData, x, y, sizeW, sizeH, alphaMap);
                
                if (confidence > config.THRESHOLDS.COARSE) {
                    const candidate = { x, y, width: sizeW, height: sizeH, confidence, mode: 'heuristic' };
                    let tooClose = false;
                    for (let i = 0; i < sizeCandidates.length; i++) {
                        const dist = Math.abs(sizeCandidates[i].x - x) + Math.abs(sizeCandidates[i].y - y);
                        if (dist < config.PROXIMITY_THRESHOLD) {
                            tooClose = true;
                            if (confidence > sizeCandidates[i].confidence) sizeCandidates[i] = candidate;
                            break;
                        }
                    }

                    if (!tooClose) {
                        if (sizeCandidates.length < config.CANDIDATES_LIMIT_PER_SIZE) {
                            sizeCandidates.push(candidate);
                        } else if (confidence > sizeCandidates[sizeCandidates.length - 1].confidence) {
                            sizeCandidates[sizeCandidates.length - 1] = candidate;
                        }
                    }
                    for (let k = sizeCandidates.length - 1; k > 0 && sizeCandidates[k].confidence > sizeCandidates[k-1].confidence; k--) {
                        [sizeCandidates[k], sizeCandidates[k-1]] = [sizeCandidates[k-1], sizeCandidates[k]];
                    }
                }
            }
        }

        for (const candidate of sizeCandidates) {
            const fineRange = config.FINE_TUNE_RANGE;
            for (let fy = Math.max(startY, candidate.y - fineRange); fy <= Math.min(height - sizeH / 2, candidate.y + fineRange); fy++) {
                for (let fx = Math.max(startX, candidate.x - fineRange); fx <= Math.min(width - sizeW / 2, candidate.x + fineRange); fx++) {
                    let confidence = calculateCorrelation(searchData, fx, fy, sizeW, sizeH, alphaMap, true);
                    
                    if (deepScan && confidence > DETECTION_THRESHOLDS.DEEPSCAN_GRADIENT_GATE) {
                        const bufferSizeNeeded = sizeW * sizeH;
                        const { gradientsI, gradientsA } = context.getGradientBuffers(bufferSizeNeeded);
                        const gradientConf = calculateGradientCorrelation(
                            searchData, fx, fy, sizeW, sizeH, alphaMap, 
                            gradientsI, 
                            gradientsA
                        );
                        // Phase 2.1: Multi-dimensional scoring — use shared helper
                        // to ensure formula consistency across all 3 gradient sites.
                        confidence = blendMultiDimensionalScore(searchData, fx, fy, sizeW, sizeH, confidence, gradientConf);
                    }

                    const stage2Threshold = noiseReduction ? config.THRESHOLDS.STAGE2_NR : config.THRESHOLDS.STAGE2_CLEAN;
                    if (confidence > stage2Threshold) {
                        const marginX = width - fx - sizeW;
                        const marginY = height - fy - sizeH;
                        const standardMargins = [32, 64, 96, 192];
                        const marginTol = DETECTION_THRESHOLDS.STANDARD_MARGIN_TOLERANCE;
                        const rightAligned = standardMargins.some(m => Math.abs(marginX - m) <= marginTol);
                        const bottomAligned = standardMargins.some(m => Math.abs(marginY - m) <= marginTol);
                        const isAligned = rightAligned && bottomAligned;
                        allCandidates.push({ x: fx, y: fy, width: sizeW, height: sizeH, confidence, mode: isAligned ? 'aligned' : 'free' });
                    }
                }
            }
        }
    }


    // Stage 3: Global Ranking
    let bestResult = null;
    let maxScore = -1;

    allCandidates.sort((a, b) => {
        const modePriority = { 'anchored': 3, 'aligned': 2, 'free': 1 };
        const boostFactor = DETECTION_THRESHOLDS.MODE_BOOST_FACTOR;
        const scoreA = a.confidence + (modePriority[a.mode] || 0) * boostFactor;
        const scoreB = b.confidence + (modePriority[b.mode] || 0) * boostFactor;
        return scoreB - scoreA;
    });
    const finalCandidates = [];
    
    for (const cand of allCandidates) {
        let isOverlapping = false;
        for (const existing of finalCandidates) {
            const distX = Math.abs((cand.x + cand.width / 2) - (existing.x + existing.width / 2));
            const distY = Math.abs((cand.y + cand.height / 2) - (existing.y + existing.height / 2));
            if (distX < DETECTION_THRESHOLDS.CANDIDATE_OVERLAP_DISTANCE && distY < DETECTION_THRESHOLDS.CANDIDATE_OVERLAP_DISTANCE) {
                isOverlapping = true;
                break;
            }
        }
        if (!isOverlapping) finalCandidates.push(cand);
    }

    for (const candidate of finalCandidates) {
        const { x, y, width: candW, height: candH, confidence, mode } = candidate;
        let score = confidence;

        // Scoring Bias: Aligned or Anchored get a significant boost (v1.9.0 hardened)
        if (mode === 'anchored') score += DETECTION_THRESHOLDS.MODE_BOOST_ANCHORED;
        else if (mode === 'aligned') score += DETECTION_THRESHOLDS.MODE_BOOST_ALIGNED;

        if (score > maxScore) {
            maxScore = score;
            bestResult = { x, y, width: candW, height: candH, confidence, score, mode };
        }
    }

    if (bestResult) {
        const thresholds = { 
            'anchored': config.THRESHOLDS.FINAL_ANCHORED, 
            'aligned': config.THRESHOLDS.FINAL_ALIGNED, 
            'free': config.THRESHOLDS.FINAL_FREE 
        }; 
        if (bestResult.confidence >= (thresholds[bestResult.mode] || config.THRESHOLDS.FINAL_FREE)) {
            return bestResult;
        }
    }


    return null;
}

/**
 * Grayscale NCC
 * v1.5: Added out-of-bounds safety
 * v1.7: Perceptual luminance update
 */
export function calculateCorrelation(imageData, x, y, logoW, logoH, alphaMap, fullPrecision = false) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const step = fullPrecision ? 1 : 2;
    
    let sumI = 0, sumI2 = 0, sumA = 0, sumA2 = 0, sumIA = 0, count = 0;
    
    for (let row = 0; row < logoH; row += step) {
        const curY = Math.floor(y + row);
        if (curY < 0 || curY >= imgHeight) continue;

        const imgRowOffset = curY * imgWidth;
        const alphaRowOffset = row * logoW;
        for (let col = 0; col < logoW; col += step) {
            const curX = Math.floor(x + col);
            if (curX < 0 || curX >= imgWidth) continue;

            const imgIdx = (imgRowOffset + curX) << 2;
            const brightness = (data[imgIdx] * 0.2126 + data[imgIdx + 1] * 0.7152 + data[imgIdx + 2] * 0.0722) / 255.0;
            const alpha = alphaMap[alphaRowOffset + col];
            if (!Number.isFinite(alpha)) continue;
            
            sumI += brightness;
            sumI2 += brightness * brightness;
            sumA += alpha;
            sumA2 += alpha * alpha;
            sumIA += brightness * alpha;
            count++;
        }
    }

    if (count < (logoW * logoH) / (8 * step * step)) return 0;

    const varI = count * sumI2 - sumI * sumI;
    const varA = count * sumA2 - sumA * sumA;
    if (varA <= 0.0001) return 0;
    // v2.6: Near-zero image variance (smooth/solid backgrounds like sky, walls)
    // should not kill detection entirely. Return a value that passes the COARSE
    // gate (0.10) so that calculateProbeConfidence's localContrast path gets a
    // meaningful base NCC to compare against. Previously 0.001 was too low to
    // contribute — Math.max(0.001, 0.12) = 0.12 was indistinguishable from
    // localContrast alone, making the NCC path useless for smooth backgrounds.
    if (varI <= 0.0001) return 0.10;

    return (count * sumIA - sumI * sumA) / Math.sqrt(varI * varA);
}

function getLuminanceAt(data, imgWidth, x, y) {
    const idx = (y * imgWidth + x) << 2;
    return (data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722) / 255.0;
}

function getAlphaAt(alphaMap, logoW, logoH, col, row) {
    if (col < 0 || row < 0 || col >= logoW || row >= logoH) return 0;
    const alpha = alphaMap[row * logoW + col];
    return Number.isFinite(alpha) ? alpha : 0;
}

/**
 * Local residual NCC for weak watermarks on busy backgrounds.
 * It compares each pixel against nearby pixels before correlating with the
 * alpha template, so broad landscape/flower texture has less influence.
 */
export function calculateLocalContrastCorrelation(imageData, x, y, logoW, logoH, alphaMap, fullPrecision = false) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const step = fullPrecision ? 1 : 2;
    const radius = Math.max(4, Math.round(Math.min(logoW, logoH) * 0.06));
    const offsets = [
        [-radius, 0],
        [radius, 0],
        [0, -radius],
        [0, radius],
        [-radius, -radius],
        [radius, -radius],
        [-radius, radius],
        [radius, radius]
    ];

    let sumI = 0, sumI2 = 0, sumA = 0, sumA2 = 0, sumIA = 0, count = 0;

    for (let row = 0; row < logoH; row += step) {
        const curY = Math.floor(y + row);
        if (curY < 0 || curY >= imgHeight) continue;

        for (let col = 0; col < logoW; col += step) {
            const curX = Math.floor(x + col);
            if (curX < 0 || curX >= imgWidth) continue;

            let imgNeighborSum = 0;
            let imgNeighborCount = 0;
            let alphaNeighborSum = 0;

            for (const [dx, dy] of offsets) {
                const nx = curX + dx;
                const ny = curY + dy;
                if (nx >= 0 && ny >= 0 && nx < imgWidth && ny < imgHeight) {
                    imgNeighborSum += getLuminanceAt(data, imgWidth, nx, ny);
                    imgNeighborCount++;
                }
                alphaNeighborSum += getAlphaAt(alphaMap, logoW, logoH, col + dx, row + dy);
            }

            if (imgNeighborCount < 4) continue;

            const imageResidual = getLuminanceAt(data, imgWidth, curX, curY) - imgNeighborSum / imgNeighborCount;
            const alpha = alphaMap[row * logoW + col];
            if (!Number.isFinite(alpha)) continue;

            const alphaResidual = alpha - alphaNeighborSum / offsets.length;

            // v2.3: Lowered from 0.015→0.008 to retain faint-watermark pixels
            // that were previously filtered out, improving detection on low-opacity overlays.
            if (Math.abs(alphaResidual) < DETECTION_THRESHOLDS.LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN) continue;

            sumI += imageResidual;
            sumI2 += imageResidual * imageResidual;
            sumA += alphaResidual;
            sumA2 += alphaResidual * alphaResidual;
            sumIA += imageResidual * alphaResidual;
            count++;
        }
    }

    if (count < Math.max(24, (logoW * logoH) / (20 * step * step))) return 0;

    const varI = count * sumI2 - sumI * sumI;
    const varA = count * sumA2 - sumA * sumA;
    if (varI <= 0.000001 || varA <= 0.000001) return 0;

    return Math.max(0, (count * sumIA - sumI * sumA) / Math.sqrt(varI * varA));
}

/**
 * Verify if a watermark is likely present at the given position
 */
/**
 * Compute the weighted multi-dimensional score from spatial, gradient, and
 * variance components. This is the single source of truth for the
 * spatial×0.5 + gradient×0.3 + variance×0.2 blend — all three gradient-filtering
 * sites in detectWatermark/calculateProbeConfidence MUST call this helper to
 * keep their formulas identical (DEVELOPER_GUIDE.md §5 rule 6).
 *
 * Returns max(spatial, weighted) to avoid NCC dilution on high-confidence matches.
 */
function blendMultiDimensionalScore(imageData, x, y, logoW, logoH, spatial, gradient) {
    const varianceScore = calculateVarianceScore(imageData, x, y, logoW, logoH);
    const s = Math.max(0, spatial);
    const g = Math.max(0, gradient);
    const weighted = s * DETECTION_THRESHOLDS.SPATIAL_WEIGHT
        + g * DETECTION_THRESHOLDS.GRADIENT_WEIGHT
        + varianceScore * DETECTION_THRESHOLDS.VARIANCE_WEIGHT;
    return Math.max(s, weighted);
}

export function calculateProbeConfidence(imageData, pos, alphaMap, profile = 'gemini', options = {}, context = null) {
    const { deepScan = false, isScaledMatch = false } = options;

    // Pre-allocate gradient buffers once for the whole function (BUG-H3 fix).
    // Previously each jitter iteration allocated 2 new Float32Arrays (338 allocs).
    const bufferSize = pos.width * pos.height;
    let gradientsI, gradientsA;
    if (context && context.getGradientBuffers) {
        const bufs = context.getGradientBuffers(bufferSize);
        gradientsI = bufs.gradientsI;
        gradientsA = bufs.gradientsA;
    } else {
        gradientsI = new Float32Array(bufferSize);
        gradientsA = new Float32Array(bufferSize);
    }

    if (profile === 'doubao') {
        const logoW = pos.width;
        const logoH = pos.height;
        let confidence = calculateGradientCorrelation(imageData, pos.x, pos.y, logoW, logoH, alphaMap, gradientsI, gradientsA);

        const nccConf = calculateCorrelation(imageData, pos.x, pos.y, logoW, logoH, alphaMap, true);
        confidence = Math.max(confidence, nccConf);

        if (confidence < DETECTION_THRESHOLDS.DOUBAO_NCC_GATE) {
             let bestConf = confidence;
             let bestX = pos.x;
             let bestY = pos.y;
        // v2.6: Use configurable JITTER_RANGE instead of hardcoded 6
        const jitter = DETECTION_THRESHOLDS.JITTER_RANGE;
             for(let dy=-jitter; dy<=jitter; dy++) {
                 for(let dx=-jitter; dx<=jitter; dx++) {
                     const conf = calculateGradientCorrelation(imageData, pos.x+dx, pos.y+dy, logoW, logoH, alphaMap, gradientsI, gradientsA);
                     // Apply small distance penalty (v1.9.0) to prevent drift in low-contrast mock backgrounds
                     const penalty = (Math.abs(dx) + Math.abs(dy)) * 0.005;
                     if(conf - penalty > bestConf) { bestConf = conf; bestX = pos.x+dx; bestY = pos.y+dy; }
                 }
             }
             return { confidence: bestConf, x: bestX, y: bestY };
         }
         return { confidence, x: pos.x, y: pos.y };
     }

    let confidence = calculateCorrelation(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true);
    const baseNcc = confidence;
    const baseNccGate = isScaledMatch ? DETECTION_THRESHOLDS.SCALED_NCC_GATE : DETECTION_THRESHOLDS.EXACT_NCC_GATE;

    // v2.4: Even when NCC is very low (smooth/uniform backgrounds), the watermark may
    // still be detectable through local contrast patterns. Try localContrast before
    // giving up — only bail if BOTH signals are weak.
    if (baseNcc < baseNccGate) {
        const localContrastConf = calculateLocalContrastCorrelation(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true);
        if (localContrastConf < baseNccGate) return { confidence: Math.max(baseNcc, localContrastConf), x: pos.x, y: pos.y };
        confidence = localContrastConf;
    } else {
        const localContrastConf = calculateLocalContrastCorrelation(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true);
        confidence = Math.max(confidence, localContrastConf);
    }

    // If deepScan enabled, also compute gradient correlation and use hybrid score
    if (deepScan) {
        const logoW = pos.width;
        const logoH = pos.height;
        const gradientConf = calculateGradientCorrelation(imageData, pos.x, pos.y, logoW, logoH, alphaMap, gradientsI, gradientsA);

        if (gradientConf < DETECTION_THRESHOLDS.GRADIENT_IGNORE_GATE) {
            // v2.5: Use weighted multi-dimensional blend instead of aggressive multiplicative
            // penalty. Dark/moody images (e.g. anime scenes) naturally have low gradient
            // in the watermark region but the watermark pattern is still detectable via NCC.
            // The old formula (confidence *= gradientPenalty) could slash NCC from 0.50→0.15,
            // causing false negatives on valid catalog-probe matches.
            confidence = blendMultiDimensionalScore(imageData, pos.x, pos.y, logoW, logoH, confidence, gradientConf);
        } else {
            const gradGate = isScaledMatch ? DETECTION_THRESHOLDS.GRADIENT_BOOST_GATE_SCALED : DETECTION_THRESHOLDS.GRADIENT_BOOST_GATE_EXACT;
            if (confidence >= gradGate) confidence = Math.max(confidence, gradientConf);
        }
    }

    // Sliding window fine-tuning (exact/official matches only)
    if (confidence < DETECTION_THRESHOLDS.JITTER_FINETUNE_TRIGGER && !isScaledMatch) {
        let bestConf = confidence;
        let bestX = pos.x;
        let bestY = pos.y;
        const jitter = 6;

        for(let dy=-jitter; dy<=jitter; dy++) {
            for(let dx=-jitter; dx<=jitter; dx++) {
                if(dx === 0 && dy === 0) continue;

                let conf;
                if (deepScan) {
                    // v2.5.1 (BUG-C1): Use the SAME weighted blend as the main probe path
                    // above and detectWatermark Phase 2. Previously this site used the old
                    // `combined * min(gradientPenalty, 0.50)` multiplicative penalty formula,
                    // violating DEVELOPER_GUIDE.md §5 rule 6 (three gradient sites must agree).
                    const nccConf = calculateCorrelation(imageData, pos.x+dx, pos.y+dy, pos.width, pos.height, alphaMap, true);
                    const localConf = calculateLocalContrastCorrelation(imageData, pos.x+dx, pos.y+dy, pos.width, pos.height, alphaMap, true);
                    const gradientConf = calculateGradientCorrelation(imageData, pos.x+dx, pos.y+dy, pos.width, pos.height, alphaMap, gradientsI, gradientsA);
                    const combined = Math.max(nccConf, localConf);
                    if (gradientConf < DETECTION_THRESHOLDS.GRADIENT_IGNORE_GATE) {
                        conf = blendMultiDimensionalScore(imageData, pos.x+dx, pos.y+dy, pos.width, pos.height, combined, gradientConf);
                    } else if (nccConf >= DETECTION_THRESHOLDS.GRADIENT_BOOST_GATE_EXACT) {
                        // Gradient boost gate for exact matches (0.12)
                        conf = Math.max(combined, gradientConf);
                    } else {
                        conf = combined;
                    }
                } else {
                    const nccConf = calculateCorrelation(imageData, pos.x+dx, pos.y+dy, pos.width, pos.height, alphaMap, true);
                    const localConf = calculateLocalContrastCorrelation(imageData, pos.x+dx, pos.y+dy, pos.width, pos.height, alphaMap, true);
                    conf = Math.max(nccConf, localConf);
                }
                // Distance penalty to favor anchor positions
                const penalty = (Math.abs(dx) + Math.abs(dy)) * 0.005;
                if(conf - penalty > bestConf) {
                    bestConf = conf;
                    bestX = pos.x + dx;
                    bestY = pos.y + dy;
                }
            }
        }
        return { confidence: bestConf, x: bestX, y: bestY };
    }

    return { confidence, x: pos.x, y: pos.y };
}


/**
 * Calculate variance-based watermark likelihood score.
 * Compares luminance standard deviation of the candidate watermark region
 * against a reference region above it. Watermarks typically reduce local
 * variance because the semi-transparent overlay smooths out detail.
 *
 * @returns {number} Score [0, 1] where higher means more watermark-like
 */
/**
 * v2.3: Improved variance score with adaptive handling for smooth backgrounds.
 *
 * On smooth/solid backgrounds (e.g. sky, studio backdrop) the reference region
 * has very low stdDev, making a simple ratio unreliable. Instead we use:
 *   - Ratio-based scoring (as before) when reference is textured (refStd >= 5.0)
 *   - Absolute-delta scoring when reference is smooth (refStd < 5.0):
 *     even a tiny watermark overlay reduces variance measurably relative to
 *     pure noise floor. We compare wmStd against a noise-floor estimate.
 */
function calculateVarianceScore(imageData, x, y, logoW, logoH) {
    const { data, width: imgWidth } = imageData;
    if (logoW < 8 || logoH < 8) return 0.5;

    const wmStd = regionStdDev(data, imgWidth, x, y, logoW, logoH);

    // When watermark region is near the top edge, use a reference region below it
    let refY, refH;
    if (y < logoH * 2) {
        refY = y + Math.round(logoH * 1.2);
        refH = Math.min(logoH, imgWidth > 0 ? Math.min(logoH, Math.floor(data.length / (imgWidth * 4)) - refY) : 0);
        if (refH < 8) return 0.5;
    } else {
        refY = Math.max(0, y - Math.round(logoH * 1.2));
        refH = Math.min(logoH, y - refY);
        if (refH < 8) return 0.5;
    }

    const refStd = regionStdDev(data, imgWidth, x, refY, logoW, refH);

    // Reference has meaningful texture: use ratio-based scoring
    if (refStd >= 5.0) {
        const ratio = wmStd / Math.max(refStd, 1e-6);
        return Math.max(0, Math.min(1, 1 - ratio));
    }

    // Smooth background: use absolute-delta scoring with noise-floor estimate.
    if (refStd < 1e-6) return 0.5;

    const absDelta = refStd - wmStd;
    if (absDelta <= 0) return 0.5;

    // Normalize: if delta > 0.3 * (refStd + 1), score = 1.0
    const noiseFloor = 1.0;
    const normalized = clamp01(absDelta / (0.3 * (refStd + noiseFloor)));
    return normalized;
}

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

/**
 * Sobel Gradient NCC (v1.4)
 * v1.5: Added out-of-bounds safety
 * v1.6: Memory pooling: receives pre-allocated Float32Array for gradients
 * v1.7: Perceptual luminance update
 */
export function calculateGradientCorrelation(imageData, x, y, logoW, logoH, alphaMap, gradientsI, gradientsA) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    
    const bufferSizeNeeded = logoW * logoH;
    if (!gradientsI || gradientsI.length < bufferSizeNeeded) gradientsI = new Float32Array(bufferSizeNeeded);
    if (!gradientsA || gradientsA.length < bufferSizeNeeded) gradientsA = new Float32Array(bufferSizeNeeded);
    
    gradientsI.fill(0);
    gradientsA.fill(0);

    const getB = (r, c) => {
        const i = ((y + r) * imgWidth + (x + c)) << 2;
        return data[i] * 0.2126 + data[i+1] * 0.7152 + data[i+2] * 0.0722;
    };
    const getA = (r, c) => {
        const alpha = alphaMap[r * logoW + c];
        return Number.isFinite(alpha) ? alpha : 0;
    };

    for (let row = 1; row < logoH - 1; row++) {
        const curY = y + row;
        if (curY < 1 || curY >= imgHeight - 1) continue;

        for (let col = 1; col < logoW - 1; col++) {
            const curX = x + col;
            if (curX < 1 || curX >= imgWidth - 1) continue;

            const idx = row * logoW + col;
            
            const gxI = (getB(row-1, col+1) + 2*getB(row, col+1) + getB(row+1, col+1)) - 
                        (getB(row-1, col-1) + 2*getB(row, col-1) + getB(row+1, col-1));
            const gyI = (getB(row+1, col-1) + 2*getB(row+1, col) + getB(row+1, col+1)) - 
                        (getB(row-1, col-1) + 2*getB(row-1, col) + getB(row-1, col+1));
            gradientsI[idx] = Math.sqrt(gxI*gxI + gyI*gyI);

            const gxA = (getA(row-1, col+1) + 2*getA(row, col+1) + getA(row+1, col+1)) - 
                        (getA(row-1, col-1) + 2*getA(row, col-1) + getA(row+1, col-1));
            const gyA = (getA(row+1, col-1) + 2*getA(row+1, col) + getA(row+1, col+1)) - 
                        (getA(row-1, col-1) + 2*getA(row-1, col) + getA(row-1, col+1));
            gradientsA[idx] = Math.sqrt(gxA*gxA + gyA*gyA);
        }
    }

    let sumI = 0, sumI2 = 0, sumA = 0, sumA2 = 0, sumIA = 0, count = 0;
    for (let i = 0; i < bufferSizeNeeded; i++) {
        const iVal = gradientsI[i];
        const aVal = gradientsA[i];
        if (!Number.isFinite(iVal) || !Number.isFinite(aVal)) continue;
        if (iVal === 0 && aVal === 0) continue; 
        sumI += iVal;
        sumI2 += iVal * iVal;
        sumA += aVal;
        sumA2 += aVal * aVal;
        sumIA += iVal * aVal;
        count++;
    }

    if (count < 10) return 0;
    const varI = count * sumI2 - sumI * sumI;
    const varA = count * sumA2 - sumA * sumA;
    if (varI <= 0.0001 || varA <= 0.0001) return 0;
    return (count * sumIA - sumI * sumA) / Math.sqrt(varI * varA);
}

/**
 * Fast 3x3 Box Blur for noise reduction in detection
 * v1.6: Support pre-allocated output buffer to reduce GC pressure
 */
function fastBoxBlur(data, width, height, outputBuffer = null) {
    const output = outputBuffer || new Uint8ClampedArray(data.length);
    // If outputBuffer is reused, we don't necessarily want to copy EVERYTHING unless needed.
    // However, the blur only writes to middle pixels. For safety, we copy edges or the whole thing first.
    if (output !== data) {
        output.set(data);
    }

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) << 2;
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        sum += data[((y + dy) * width + (x + dx)) * 4 + c];
                    }
                }
                output[idx + c] = (sum / 9) | 0;
            }
            output[idx + 3] = data[idx + 3];
        }
    }
    return output;
}

/**
 * Explicitly clear reusable buffers to free memory (v1.6)
 */
export function resetDetectorBuffers(context) {
    if (context) {
        context.reset();
    } else {
        _defaultContext.reset();
    }
}

/**
 * @deprecated Use DetectorContext instance via context parameter of detectWatermark() instead.
 * These properties were exposed for testing and are maintained for backward compatibility.
 * They will be removed in a future major version.
 */
Object.defineProperty(detectWatermark, '_blurBuffer', {
    get() { return _defaultContext._blurBuffer; },
    set(v) { _defaultContext._blurBuffer = v; },
    enumerable: true
});
Object.defineProperty(detectWatermark, '_sharedGradientsI', {
    get() { return _defaultContext._sharedGradientsI; },
    set(v) { _defaultContext._sharedGradientsI = v; },
    enumerable: true
});
Object.defineProperty(detectWatermark, '_sharedGradientsA', {
    get() { return _defaultContext._sharedGradientsA; },
    set(v) { _defaultContext._sharedGradientsA = v; },
    enumerable: true
});
