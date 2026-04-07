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

const SEARCH_CONFIG = {
    RANGE_X: 0.45,
    RANGE_Y: 0.45,
    CANDIDATES_LIMIT_PER_SIZE: 5,
    PROXIMITY_THRESHOLD: 8,
    FINE_TUNE_RANGE: 4,
    WEIGHT_CORRELATION: 0.6,
    WEIGHT_GRADIENT: 0.4,
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
 * @param {Object} alphaMaps - Map of size -> Float32Array
 * @param {Object} options - { deepScan: boolean }
 * @returns {Object|null} {x, y, size, confidence} or null if not found
 */
export function detectWatermark(imageData, alphaMaps, options = { deepScan: true, noiseReduction: false }) {
    const { width, height } = imageData;
    const { deepScan, noiseReduction } = options;

    let searchData = imageData;
    if (noiseReduction) {
        // Reuse blur buffer to avoid massive allocations (67MB+ for 4K)
        if (!detectWatermark._blurBuffer || detectWatermark._blurBuffer.length !== imageData.data.length) {
            detectWatermark._blurBuffer = new Uint8ClampedArray(imageData.data.length);
        }
        searchData = {
            ...imageData,
            data: fastBoxBlur(imageData.data, width, height, detectWatermark._blurBuffer)
        };
    }

    const allCandidates = [];

    // --- Phase 1: Catalog & Anchor Check (Fast) ---

    const catalogConfig = getCatalogConfig(width, height);
    const standardConfigs = [
        catalogConfig,
        { logoSize: 96, marginRight: 64, marginBottom: 64 },
        { logoSize: 48, marginRight: 32, marginBottom: 32 }
    ].filter(Boolean);

    const anchoredCandidates = [];
    for (const cfg of standardConfigs) {
        const { logoSize, marginRight, marginBottom } = cfg;
        const alphaMap = alphaMaps[logoSize];
        if (!alphaMap) continue;

        const x = width - marginRight - logoSize;
        const y = height - marginBottom - logoSize;
        if (x < 0 || y < 0) continue;

        let confidence = calculateCorrelation(searchData, x, y, logoSize, alphaMap, true);
        const threshold = cfg.isOfficial ? SEARCH_CONFIG.THRESHOLDS.ANCHORED_OFFICIAL : SEARCH_CONFIG.THRESHOLDS.ANCHORED_OTHER; 
        if (confidence >= threshold) {
            anchoredCandidates.push({ x, y, size: logoSize, confidence, mode: 'anchored' });
        }
    }
    
    if (anchoredCandidates.length > 0) {
        anchoredCandidates.sort((a, b) => b.confidence - a.confidence);
        const bestAnchored = anchoredCandidates[0];
        // If anchored confidence is very high, return immediately
        if (bestAnchored.confidence > SEARCH_CONFIG.THRESHOLDS.STRICT_EXIT) return bestAnchored;
        allCandidates.push(bestAnchored);
    }

    // --- Phase 2: Heuristic-based Global Search ---

    const searchRangeX = Math.floor(width * SEARCH_CONFIG.RANGE_X);
    const searchRangeY = Math.floor(height * SEARCH_CONFIG.RANGE_Y);
    const sizes = [96, 48];

    for (const size of sizes) {
        const alphaMap = alphaMaps[size];
        if (!alphaMap) continue;

        // v1.5: Allow searching slightly beyond borders for edge-cropped watermarks
        const startX = Math.max(-size / 2, width - searchRangeX - size);
        const startY = Math.max(-size / 2, height - searchRangeY - size);
        const sizeCandidates = [];

        // Stage 1: Coarse search
        for (let y = startY; y < height - size / 2; y += 2) {
            for (let x = startX ; x < width - size / 2; x += 2) {
                const confidence = calculateCorrelation(searchData, x, y, size, alphaMap);
                const lastVar = calculateCorrelation._lastVar || 0;
                
                if (confidence > SEARCH_CONFIG.THRESHOLDS.COARSE) {

                    const candidate = { x, y, size, confidence, mode: 'anchored', _lastVar: lastVar };
                    
                    let tooClose = false;
                    for (let i = 0; i < sizeCandidates.length; i++) {
                        const dist = Math.abs(sizeCandidates[i].x - x) + Math.abs(sizeCandidates[i].y - y);
                        if (dist < SEARCH_CONFIG.PROXIMITY_THRESHOLD) {
                            tooClose = true;
                            if (confidence > sizeCandidates[i].confidence) {
                                sizeCandidates[i] = candidate;
                            }
                            break;
                        }
                    }

                    if (!tooClose) {
                        if (sizeCandidates.length < SEARCH_CONFIG.CANDIDATES_LIMIT_PER_SIZE) {
                            sizeCandidates.push(candidate);
                        } else if (confidence > sizeCandidates[sizeCandidates.length - 1].confidence) {
                            sizeCandidates[sizeCandidates.length - 1] = candidate;
                        } else {
                            continue;
                        }
                    }

                    for (let k = sizeCandidates.length - 1; k > 0 && sizeCandidates[k].confidence > sizeCandidates[k-1].confidence; k--) {
                        [sizeCandidates[k], sizeCandidates[k-1]] = [sizeCandidates[k-1], sizeCandidates[k]];
                    }
                }
            }
        }

        // Stage 2: Fine-tuning
        for (const candidate of sizeCandidates) {
            const fineRange = SEARCH_CONFIG.FINE_TUNE_RANGE;
            for (let fy = Math.max(startY, candidate.y - fineRange); fy <= Math.min(height - size / 2, candidate.y + fineRange); fy++) {
                for (let fx = Math.max(startX, candidate.x - fineRange); fx <= Math.min(width - size / 2, candidate.x + fineRange); fx++) {
                    let confidence = calculateCorrelation(searchData, fx, fy, size, alphaMap, true);

                    
                    // Deep Scan Enhancement (v1.4): Sobel Gradient Matching
                    if (deepScan && confidence > SEARCH_CONFIG.THRESHOLDS.COARSE) {
                        // Reuse shared buffers for gradient calculation to reduce GC pressure
                        // v1.6 Hardening: Dynamic sizing for buffers to support any logo scale safely
                        const bufferSizeNeeded = size * size;
                        if (!detectWatermark._sharedGradientsI || detectWatermark._sharedGradientsI.length < bufferSizeNeeded) {
                            detectWatermark._sharedGradientsI = new Float32Array(bufferSizeNeeded);
                            detectWatermark._sharedGradientsA = new Float32Array(bufferSizeNeeded);
                        }
                        const gradientConf = calculateGradientCorrelation(
                            searchData, fx, fy, size, alphaMap, 
                            detectWatermark._sharedGradientsI, 
                            detectWatermark._sharedGradientsA
                        );
                        
                        // v1.7 Adaptive Weighting: If background has very low texture, reduce gradient weight
                        // to prevent noise from dragging down the correlation score.
                        const localVariance = candidate._lastVar || 0.01;
                        const adaptiveWeightGradient = Math.min(SEARCH_CONFIG.WEIGHT_GRADIENT, localVariance * 20);
                        const adaptiveWeightCorr = 1.0 - adaptiveWeightGradient;

                        if (gradientConf > 0) {
                            confidence = confidence * adaptiveWeightCorr + gradientConf * adaptiveWeightGradient;
                        }
                    }

                    const stage2Threshold = noiseReduction ? SEARCH_CONFIG.THRESHOLDS.STAGE2_NR : SEARCH_CONFIG.THRESHOLDS.STAGE2_CLEAN; // v1.5: Adaptive threshold for noise
                    if (confidence > stage2Threshold) {
                        const marginX = width - fx - size;
                        const marginY = height - fy - size;
                        const isAligned = (marginX === 32 || marginX === 64) && (marginY === 32 || marginY === 64);
                        // v1.5: Prefer anchored status if inherited, otherwise aligned/free
                        const mode = candidate.mode === 'anchored' ? 'anchored' : (isAligned ? 'aligned' : 'free');
                        allCandidates.push({ x: fx, y: fy, size, confidence, mode });
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
            const distX = Math.abs((cand.x + cand.size/2) - (existing.x + existing.size/2));
            const distY = Math.abs((cand.y + cand.size/2) - (existing.y + existing.size/2));
            if (distX < 32 && distY < 32) {
                isOverlapping = true;
                if (cand.size === 48 && cand.confidence > existing.confidence - 0.1) {
                    finalCandidates[finalCandidates.indexOf(existing)] = cand;
                }
                break;
            }
        }
        if (!isOverlapping) finalCandidates.push(cand);
    }

    for (const candidate of finalCandidates) {
        const { x, y, size, confidence, mode } = candidate;
        let score = confidence;

        // Scoring Bias: Aligned or Anchored get a boost
        if (mode === 'anchored') score += 0.2;
        else if (mode === 'aligned') score += 0.1;

        if (score > maxScore) {
            maxScore = score;
            bestResult = { x, y, size, confidence, score, mode };
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
function calculateCorrelation(imageData, x, y, size, alphaMap, fullPrecision = false) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const step = fullPrecision ? 1 : 2;
    
    let sumI = 0, sumI2 = 0, sumA = 0, sumA2 = 0, sumIA = 0, count = 0;
    
    for (let row = 0; row < size; row += step) {
        const curY = y + row;
        if (curY < 0 || curY >= imgHeight) continue;

        const imgRowOffset = curY * imgWidth;
        const alphaRowOffset = row * size;
        for (let col = 0; col < size; col += step) {
            const curX = x + col;
            if (curX < 0 || curX >= imgWidth) continue;

            const imgIdx = (imgRowOffset + curX) << 2;
            // v1.7: Perceptual Grayscale (0.299R + 0.587G + 0.114B)
            const brightness = (data[imgIdx] * 0.299 + data[imgIdx + 1] * 0.587 + data[imgIdx + 2] * 0.114) / 255.0;
            const alpha = alphaMap[alphaRowOffset + col];
            
            sumI += brightness;
            sumI2 += brightness * brightness;
            sumA += alpha;
            sumA2 += alpha * alpha;
            sumIA += brightness * alpha;
            count++;
        }
    }

    if (count < (size * size) / (6 * step * step)) return 0; // Too little visible area (allow ~16% visibility)


    const varI = count * sumI2 - sumI * sumI;
    const varA = count * sumA2 - sumA * sumA;
    if (varI <= 0 || varA <= 0) return 0;

    // Store variance for adaptive weighting in Phase 2
    if (!fullPrecision) {
        const normalizedVar = varI / (count * count);
        calculateCorrelation._lastVar = normalizedVar;
    }

    return (count * sumIA - sumI * sumA) / Math.sqrt(varI * varA);
}


/**
 * Sobel Gradient NCC (v1.4)
 * v1.5: Added out-of-bounds safety
 * v1.6: Memory pooling: receives pre-allocated Float32Array for gradients
 * v1.7: Perceptual luminance update
 */
function calculateGradientCorrelation(imageData, x, y, size, alphaMap, gradientsI, gradientsA) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    
    // Fallback if buffers not provided (e.g. legacy calls)
    if (!gradientsI) gradientsI = new Float32Array(size * size);
    if (!gradientsA) gradientsA = new Float32Array(size * size);
    
    // Clear reuse buffers
    gradientsI.fill(0);
    gradientsA.fill(0);

    // 1. Precompute gradients for image and alpha map
    const getB = (r, c) => {
        const i = ((y + r) * imgWidth + (x + c)) << 2;
        // v1.7: Perceptual Grayscale
        return data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
    };
    const getA = (r, c) => alphaMap[r * size + c];

    for (let row = 1; row < size - 1; row++) {
        const curY = y + row;
        if (curY < 1 || curY >= imgHeight - 1) continue;

        for (let col = 1; col < size - 1; col++) {
            const curX = x + col;
            if (curX < 1 || curX >= imgWidth - 1) continue;

            const idx = row * size + col;
            
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
    for (let i = 0; i < size * size; i++) {
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
