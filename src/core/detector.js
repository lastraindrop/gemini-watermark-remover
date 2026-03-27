import { detectWatermarkConfig } from './config.js';

/**
 * Detect watermark position and size using pixel correlation
 * @param {ImageData} imageData - Full image data
 * @param {Object} alphaMaps - Map of size -> Float32Array
 * @returns {Object|null} {x, y, size, confidence} or null if not found
 */
export function detectWatermark(imageData, alphaMaps) {
    const { width, height } = imageData;
    const config = detectWatermarkConfig(width, height);
    const expectedSize = config.logoSize;
    const sizes = [96, 48];
    
    const allCandidates = [];
    const searchRangeX = Math.floor(width * 0.40); // Expanded range (v1.2.2)
    const searchRangeY = Math.floor(height * 0.40);
    
    for (const size of sizes) {
        const alphaMap = alphaMaps[size];
        if (!alphaMap) continue;

        const startX = Math.max(0, width - searchRangeX - size);
        const startY = Math.max(0, height - searchRangeY - size);
        const sizeCandidates = [];

        // Stage 1: Coarse search
        for (let y = startY; y < height - size; y += 2) {
            for (let x = startX ; x < width - size; x += 2) {
                const confidence = calculateCorrelation(imageData, x, y, size, alphaMap);
                if (confidence > 0.4) {
                    // Maintain top-5 via insertion (avoid full sort on every hit)
                    const candidate = { x, y, size, confidence };
                    if (sizeCandidates.length < 5) {
                        sizeCandidates.push(candidate);
                    } else if (confidence > sizeCandidates[sizeCandidates.length - 1].confidence) {
                        sizeCandidates[sizeCandidates.length - 1] = candidate;
                    } else {
                        continue;
                    }
                    // Insert sort: move the new element to its correct position
                    for (let k = sizeCandidates.length - 1; k > 0 && sizeCandidates[k].confidence > sizeCandidates[k-1].confidence; k--) {
                        [sizeCandidates[k], sizeCandidates[k-1]] = [sizeCandidates[k-1], sizeCandidates[k]];
                    }
                }
            }
        }

        // Stage 2: Fine-tuning for this size's candidates
        for (const candidate of sizeCandidates) {
            const fineRange = 4;
            for (let fy = Math.max(startY, candidate.y - fineRange); fy <= Math.min(height - size, candidate.y + fineRange); fy++) {
                for (let fx = Math.max(startX, candidate.x - fineRange); fx <= Math.min(width - size, candidate.x + fineRange); fx++) {
                    let confidence = calculateCorrelation(imageData, fx, fy, size, alphaMap, true);
                    if (confidence > 0.5) {
                        allCandidates.push({ x: fx, y: fy, size, confidence });
                    }
                }
            }
        }
    }

    // Stage 3: Global Ranking (v1.2.2 Intelligent Scoring)
    let bestResult = null;
    let maxScore = -1;

    for (const candidate of allCandidates) {
        const { x, y, size, confidence } = candidate;
        let score = confidence;

        // 1. Margin Alignment Bonus (+0.03)
        const marginX = width - x - size;
        const marginY = height - y - size;
        if ([32, 48, 64].includes(marginX) || [32, 48, 64].includes(marginY)) {
            score += 0.03;
        }

        // 2. Predictive Size Bonus (+0.02)
        if (size === expectedSize) {
            score += 0.02;
        }

        if (score > maxScore) {
            maxScore = score;
            bestResult = { x, y, size, confidence, score };
        }
    }

    // Minimum quality threshold for the winner
    if (bestResult && bestResult.confidence > 0.6) {
        return bestResult;
    }

    return null;
}

/**
 * Calculate similarity between image region and alpha map
 * @param {boolean} fullPrecision - If true, do not downsample
 */
function calculateCorrelation(imageData, x, y, size, alphaMap, fullPrecision = false) {
    const { data, width: imgWidth } = imageData;
    const step = fullPrecision ? 1 : 2;
    
    let sumI = 0, sumI2 = 0, sumA = 0, sumA2 = 0, sumIA = 0, count = 0;
    
    for (let row = 0; row < size; row += step) {
        const imgRowOffset = (y + row) * imgWidth + x;
        const alphaRowOffset = row * size;
        for (let col = 0; col < size; col += step) {
            const imgIdx = (imgRowOffset + col) << 2;
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

    const varI = count * sumI2 - sumI * sumI;
    const varA = count * sumA2 - sumA * sumA;
    
    if (varI <= 0 || varA <= 0) return 0;
    
    const denom = Math.sqrt(varI * varA);
    return (count * sumIA - sumI * sumA) / denom;
}
