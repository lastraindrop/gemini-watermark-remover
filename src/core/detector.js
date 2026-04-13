/**
 * Watermark detection engine (Precision & Speed Optimized)
 * 
 * Architectural Note: This module uses function-level state mutation (detectWatermark._blurBuffer, etc.)
 * as a memory pooling optimization to prevent multiple 60MB+ allocations during 4K image processing.
 * 
 * Phases:
 * 1. Catalog & Anchor Check (Ultra-Fast)
 * 2. Heuristic Global Search (Exhaustive)
 * 3. Confidence Ranking & Post-processing
 * 4. Entropy-Adaptive Weighting (v1.7)
 */

import { getCatalogConfig } from './catalog.js';

// Shared state for variance tracking during coarse search
let _lastVar = 0;

const SEARCH_CONFIG = {
    RANGE_X: 0.45,
    RANGE_Y: 0.45,
    CANDIDATES_LIMIT_PER_SIZE: 5,
    PROXIMITY_THRESHOLD: 8,
    FINE_TUNE_RANGE: 4,
    THRESHOLDS: {
        ANCHORED_OFFICIAL: 0.30,
        ANCHORED_OTHER: 0.40,
        STRICT_EXIT: 0.6,
        COARSE: 0.3,
        STAGE2_NR: 0.3,
        STAGE2_CLEAN: 0.35,
        FINAL_ANCHORED: 0.3,
        FINAL_ALIGNED: 0.35,
        FINAL_FREE: 0.45
    }
};

/**
 * Detect watermark position and size using pixel correlation
 * @param {ImageData} imageData - Full image data
 * @param {Object} alphaMaps - Map of size_str -> Float32Array
 * @param {Object} options - { deepScan: boolean }
 * @returns {Object|null} {x, y, width, height, confidence} or null if not found
 */
export function detectWatermark(imageData, alphaMaps, options = { deepScan: true, noiseReduction: false }) {
    const { width, height } = imageData;
    const { deepScan, noiseReduction } = options;

    let searchData = imageData;
    if (noiseReduction) {
        if (!detectWatermark._blurBuffer || detectWatermark._blurBuffer.length !== imageData.data.length) {
            detectWatermark._blurBuffer = new Uint8ClampedArray(imageData.data.length);
        }
        searchData = {
            ...imageData,
            data: fastBoxBlur(imageData.data, width, height, detectWatermark._blurBuffer)
        };
    }

    const allCandidates = [];

    // --- Phase 1: Catalog & Anchor Check ---
    const catalogConfig = getCatalogConfig(width, height);
    const standardConfigs = [
        catalogConfig,
        { logoSize: 96, marginRight: 64, marginBottom: 64 },
        { logoSize: 48, marginRight: 32, marginBottom: 32 },
        // Doubao 2k Standard
        { logoWidth: 373, logoHeight: 165, marginRight: 11, marginBottom: 4, profile: 'doubao' }
    ].filter(Boolean);

    for (const cfg of standardConfigs) {
        const logoW = cfg.logoWidth || cfg.logoSize;
        const logoH = cfg.logoHeight || cfg.logoSize;
        const key = cfg.logoWidth ? `${logoW}x${logoH}` : `${logoW}`;
        const alphaMap = alphaMaps[key];
        if (!alphaMap) continue;

        const x = width - cfg.marginRight - logoW;
        const y = height - cfg.marginBottom - logoH;
        if (x < 0 || y < 0) continue;

        let confidence = calculateCorrelation(searchData, x, y, logoW, logoH, alphaMap, true);
        const threshold = cfg.isOfficial ? SEARCH_CONFIG.THRESHOLDS.ANCHORED_OFFICIAL : SEARCH_CONFIG.THRESHOLDS.ANCHORED_OTHER; 
        if (confidence >= threshold) {
            allCandidates.push({ x, y, width: logoW, height: logoH, confidence, mode: 'anchored' });
        }
    }
    
    if (allCandidates.length > 0) {
        allCandidates.sort((a, b) => b.confidence - a.confidence);
        if (allCandidates[0].confidence > SEARCH_CONFIG.THRESHOLDS.STRICT_EXIT) return allCandidates[0];
    }

    // --- Phase 2: Heuristic Global Search (Gemini Standard Only for Perf) ---
    const searchRangeX = Math.floor(width * SEARCH_CONFIG.RANGE_X);
    const searchRangeY = Math.floor(height * SEARCH_CONFIG.RANGE_Y);
    const sizes = [96, 48];

    for (const size of sizes) {
        const alphaMap = alphaMaps[size];
        if (!alphaMap) continue;

        const startX = Math.max(-size / 2, width - searchRangeX - size);
        const startY = Math.max(-size / 2, height - searchRangeY - size);
        const sizeCandidates = [];

        for (let y = startY; y < height - size / 2; y += 2) {
            for (let x = startX ; x < width - size / 2; x += 2) {
                const confidence = calculateCorrelation(searchData, x, y, size, size, alphaMap);
                const currentVar = _lastVar;
                
                if (confidence > SEARCH_CONFIG.THRESHOLDS.COARSE) {
                    const candidate = { x, y, size, confidence, mode: 'heuristic', _lastVar: currentVar };
                    let tooClose = false;
                    for (let i = 0; i < sizeCandidates.length; i++) {
                        const dist = Math.abs(sizeCandidates[i].x - x) + Math.abs(sizeCandidates[i].y - y);
                        if (dist < SEARCH_CONFIG.PROXIMITY_THRESHOLD) {
                            tooClose = true;
                            if (confidence > sizeCandidates[i].confidence) sizeCandidates[i] = candidate;
                            break;
                        }
                    }

                    if (!tooClose) {
                        if (sizeCandidates.length < SEARCH_CONFIG.CANDIDATES_LIMIT_PER_SIZE) {
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
            const fineRange = SEARCH_CONFIG.FINE_TUNE_RANGE;
            for (let fy = Math.max(startY, candidate.y - fineRange); fy <= Math.min(height - size / 2, candidate.y + fineRange); fy++) {
                for (let fx = Math.max(startX, candidate.x - fineRange); fx <= Math.min(width - size / 2, candidate.x + fineRange); fx++) {
                    let confidence = calculateCorrelation(searchData, fx, fy, size, size, alphaMap, true);
                    
                    if (deepScan && confidence > SEARCH_CONFIG.THRESHOLDS.COARSE) {
                        const bufferSizeNeeded = size * size;
                        if (!detectWatermark._sharedGradientsI || detectWatermark._sharedGradientsI.length < bufferSizeNeeded) {
                            detectWatermark._sharedGradientsI = new Float32Array(bufferSizeNeeded);
                            detectWatermark._sharedGradientsA = new Float32Array(bufferSizeNeeded);
                        }
                        const gradientConf = calculateGradientCorrelation(
                            searchData, fx, fy, size, size, alphaMap, 
                            detectWatermark._sharedGradientsI, 
                            detectWatermark._sharedGradientsA
                        );
                        const adaptiveWeightGradient = Math.min(0.4, (candidate._lastVar || 0.01) * 20);
                        confidence = confidence * (1.0 - adaptiveWeightGradient) + gradientConf * adaptiveWeightGradient;
                    }

                    const stage2Threshold = noiseReduction ? SEARCH_CONFIG.THRESHOLDS.STAGE2_NR : SEARCH_CONFIG.THRESHOLDS.STAGE2_CLEAN;
                    if (confidence > stage2Threshold) {
                        const marginX = width - fx - size;
                        const marginY = height - fy - size;
                        const isAligned = (marginX === 32 || marginX === 64) && (marginY === 32 || marginY === 64);
                        allCandidates.push({ x: fx, y: fy, width: size, height: size, confidence, mode: isAligned ? 'aligned' : 'free' });
                    }
                }
            }
        }
    }


    // Stage 3: Global Ranking
    let bestResult = null;
    let maxScore = -1;

    allCandidates.sort((a, b) => b.confidence - a.confidence);
    const finalCandidates = [];
    
    for (const cand of allCandidates) {
        let isOverlapping = false;
        for (const existing of finalCandidates) {
            const distX = Math.abs((cand.x + cand.width / 2) - (existing.x + existing.width / 2));
            const distY = Math.abs((cand.y + cand.height / 2) - (existing.y + existing.height / 2));
            if (distX < 32 && distY < 32) {
                isOverlapping = true;
                if (cand.width === 48 && cand.confidence > existing.confidence - 0.1) {
                    finalCandidates[finalCandidates.indexOf(existing)] = cand;
                }
                break;
            }
        }
        if (!isOverlapping) finalCandidates.push(cand);
    }

    for (const candidate of finalCandidates) {
        const { x, y, width: candW, height: candH, confidence, mode } = candidate;
        let score = confidence;

        // Scoring Bias: Aligned or Anchored get a boost
        if (mode === 'anchored') score += 0.2;
        else if (mode === 'aligned') score += 0.1;

        if (score > maxScore) {
            maxScore = score;
            bestResult = { x, y, width: candW, height: candH, confidence, score, mode };
        }
    }

    if (bestResult) {
        const thresholds = { 
            'anchored': SEARCH_CONFIG.THRESHOLDS.FINAL_ANCHORED, 
            'aligned': SEARCH_CONFIG.THRESHOLDS.FINAL_ALIGNED, 
            'free': SEARCH_CONFIG.THRESHOLDS.FINAL_FREE 
        }; 
        if (bestResult.confidence >= (thresholds[bestResult.mode] || SEARCH_CONFIG.THRESHOLDS.FINAL_FREE)) {
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
            const brightness = (data[imgIdx] + data[imgIdx + 1] + data[imgIdx + 2]) / (3 * 255.0);
            const alpha = alphaMap[alphaRowOffset + col];
            
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
    if (varI <= 0.0001 || varA <= 0.0001) return 0;

    return (count * sumIA - sumI * sumA) / Math.sqrt(varI * varA);
}

/**
 * Verify if a watermark is likely present at the given position
 */
export function calculateProbeConfidence(imageData, pos, alphaMap, profile = 'gemini') {
    if (profile === 'doubao') {
        const logoW = pos.width;
        const logoH = pos.height;
        const gradientsI = new Float32Array(logoW * logoH);
        const gradientsA = new Float32Array(logoW * logoH);
        let confidence = calculateGradientCorrelation(imageData, pos.x, pos.y, logoW, logoH, alphaMap, gradientsI, gradientsA);

        if (confidence < 0.2) {
             let bestConf = confidence;
             let bestX = pos.x;
             let bestY = pos.y;
             for(let dy=-4; dy<=4; dy++) {
                 for(let dx=-4; dx<=4; dx++) {
                     const conf = calculateGradientCorrelation(imageData, pos.x+dx, pos.y+dy, logoW, logoH, alphaMap, gradientsI, gradientsA);
                     if(conf > bestConf) { bestConf = conf; bestX = pos.x+dx; bestY = pos.y+dy; }
                 }
             }
             return { confidence: bestConf, x: bestX, y: bestY };
        }
        return { confidence, x: pos.x, y: pos.y };
    }

    let confidence = calculateCorrelation(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true);
    
    // Slinding window fine-tuning
    if (confidence < 0.4) {
        let bestConf = confidence;
        let bestX = pos.x;
        let bestY = pos.y;
        for(let dy=-4; dy<=4; dy++) {
            for(let dx=-4; dx<=4; dx++) {
                if(dx === 0 && dy === 0) continue;
                const conf = calculateCorrelation(imageData, pos.x+dx, pos.y+dy, pos.width, pos.height, alphaMap, true);
                if(conf > bestConf) {
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
 * Sobel Gradient NCC (v1.4)
 * v1.5: Added out-of-bounds safety
 * v1.6: Memory pooling: receives pre-allocated Float32Array for gradients
 * v1.7: Perceptual luminance update
 */
function calculateGradientCorrelation(imageData, x, y, logoW, logoH, alphaMap, gradientsI, gradientsA) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    
    const bufferSizeNeeded = logoW * logoH;
    if (!gradientsI) gradientsI = new Float32Array(bufferSizeNeeded);
    if (!gradientsA) gradientsA = new Float32Array(bufferSizeNeeded);
    
    gradientsI.fill(0);
    gradientsA.fill(0);

    const getB = (r, c) => {
        const i = ((y + r) * imgWidth + (x + c)) << 2;
        return data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
    };
    const getA = (r, c) => alphaMap[r * logoW + c];

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
    if (varI <= 0 || varA <= 0) return 0;
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
export function resetDetectorBuffers() {
    detectWatermark._blurBuffer = null;
    detectWatermark._sharedGradientsI = null;
    detectWatermark._sharedGradientsA = null;
}
