import { detectWatermarkConfig } from './config.js';
import { getCatalogConfig } from './catalog.js';

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
        searchData = {
            ...imageData,
            data: fastBoxBlur(imageData.data, width, height)
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
        const threshold = cfg.isOfficial ? 0.35 : 0.45; // v1.5: Lowered official threshold
        if (confidence > threshold) {
            anchoredCandidates.push({ x, y, size: logoSize, confidence, status: 'anchored' });
        }
    }
    
    if (anchoredCandidates.length > 0) {
        anchoredCandidates.sort((a, b) => b.confidence - a.confidence);
        const bestAnchored = anchoredCandidates[0];
        // If anchored confidence is very high, return immediately
        if (bestAnchored.confidence > 0.6) return bestAnchored;
        allCandidates.push(bestAnchored);
    }

    // --- Phase 2: Heuristic-based Global Search ---

    const searchRangeX = Math.floor(width * 0.45);
    const searchRangeY = Math.floor(height * 0.45);
    const sizes = [96, 48];

    for (const size of sizes) {
        const alphaMap = alphaMaps[size];
        if (!alphaMap) continue;

        // v1.5: Allow searching slightly beyond borders for edge-cropped watermarks
        const startX = Math.max(-size / 2, width - searchRangeX - size);
        const startY = Math.max(-size / 2, height - searchRangeY - size);
        const sizeCandidates = [];
        
        console.log(`Searching size ${size}: startX=${startX}, startY=${startY}, rangeX=${searchRangeX}, rangeY=${searchRangeY}`);

        // Stage 1: Coarse search
        for (let y = startY; y < height - size / 2; y += 2) {
            for (let x = startX ; x < width - size / 2; x += 2) {
                const confidence = calculateCorrelation(searchData, x, y, size, alphaMap);
                
                if (confidence > 0.3) {

                    const candidate = { x, y, size, confidence };
                    
                    let tooClose = false;
                    for (let i = 0; i < sizeCandidates.length; i++) {
                        const dist = Math.abs(sizeCandidates[i].x - x) + Math.abs(sizeCandidates[i].y - y);
                        if (dist < 8) {
                            tooClose = true;
                            if (confidence > sizeCandidates[i].confidence) {
                                sizeCandidates[i] = candidate;
                            }
                            break;
                        }
                    }

                    if (!tooClose) {
                        if (sizeCandidates.length < 5) {
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
            const fineRange = 4;
            for (let fy = Math.max(startY, candidate.y - fineRange); fy <= Math.min(height - size / 2, candidate.y + fineRange); fy++) {
                for (let fx = Math.max(startX, candidate.x - fineRange); fx <= Math.min(width - size / 2, candidate.x + fineRange); fx++) {
                    let confidence = calculateCorrelation(searchData, fx, fy, size, alphaMap, true);

                    
                    // Deep Scan Enhancement (v1.4): Sobel Gradient Matching
                    if (deepScan && confidence > 0.3) {
                        const gradientConf = calculateGradientCorrelation(searchData, fx, fy, size, alphaMap);
                        // Blend scores: Grayscale (0.6) + Gradient (0.4)
                        confidence = confidence * 0.6 + gradientConf * 0.4;
                    }

                    const stage2Threshold = noiseReduction ? 0.3 : 0.35; // v1.5: Adaptive threshold for noise
                    if (confidence > stage2Threshold) {
                        const marginX = width - fx - size;
                        const marginY = height - fy - size;
                        const isAligned = (marginX === 32 || marginX === 64) && (marginY === 32 || marginY === 64);
                        allCandidates.push({ x: fx, y: fy, size, confidence, status: isAligned ? 'aligned' : 'free' });
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
        const { x, y, size, confidence, status } = candidate;
        let score = confidence;

        // Scoring Bias: Aligned or Anchored get a boost
        if (status === 'anchored') score += 0.2;
        else if (status === 'aligned') score += 0.1;

        if (score > maxScore) {
            maxScore = score;
            bestResult = { x, y, size, confidence, score, status };
        }
    }

    if (bestResult) {
        const thresholds = { 'anchored': 0.35, 'aligned': 0.4, 'free': 0.5 }; // v1.5: Lowered from 0.4/0.45/0.55
        if (bestResult.confidence > (thresholds[bestResult.status] || 0.5)) {
            return bestResult;
        }
    }


    return null;
}

/**
 * Grayscale NCC
 * v1.5: Added out-of-bounds safety
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
            const brightness = Math.max(data[imgIdx], data[imgIdx + 1], data[imgIdx + 2]) / 255.0;
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
    return (count * sumIA - sumI * sumA) / Math.sqrt(varI * varA);
}


/**
 * Sobel Gradient NCC (v1.4)
 * v1.5: Added out-of-bounds safety
 */
function calculateGradientCorrelation(imageData, x, y, size, alphaMap) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const gradientsI = new Float32Array(size * size);
    const gradientsA = new Float32Array(size * size);

    // 1. Precompute gradients for image and alpha map
    for (let row = 1; row < size - 1; row++) {
        const curY = y + row;
        if (curY < 1 || curY >= imgHeight - 1) continue;

        for (let col = 1; col < size - 1; col++) {
            const curX = x + col;
            if (curX < 1 || curX >= imgWidth - 1) continue;

            const idx = row * size + col;
            
            const getB = (r, c) => {
                const i = ((y + r) * imgWidth + (x + c)) << 2;
                return Math.max(data[i], data[i+1], data[i+2]);
            };
            
            const gxI = (getB(row-1, col+1) + 2*getB(row, col+1) + getB(row+1, col+1)) - 
                        (getB(row-1, col-1) + 2*getB(row, col-1) + getB(row+1, col-1));
            const gyI = (getB(row+1, col-1) + 2*getB(row+1, col) + getB(row+1, col+1)) - 
                        (getB(row-1, col-1) + 2*getB(row-1, col) + getB(row-1, col+1));
            gradientsI[idx] = Math.sqrt(gxI*gxI + gyI*gyI);

            const getA = (r, c) => alphaMap[r * size + c];
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
 */
function fastBoxBlur(data, width, height) {
    const output = new Uint8ClampedArray(data);
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

