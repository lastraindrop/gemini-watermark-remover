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
    
    let bestResult = null;
    let maxConfidence = -1;

    for (const size of sizes) {
        const alphaMap = alphaMaps[size];
        if (!alphaMap) continue;

        // Expanded search range: Last 35% of the image to handle padding/cropping
        const searchRangeX = Math.floor(width * 0.35);
        const searchRangeY = Math.floor(height * 0.35);
        
        const startX = Math.max(0, width - searchRangeX - size);
        const startY = Math.max(0, height - searchRangeY - size);

        const candidates = [];
        const maxCandidates = 3;

        for (let y = startY; y < height - size; y += 2) {
            for (let x = startX ; x < width - size; x += 2) {
                const confidence = calculateCorrelation(imageData, x, y, size, alphaMap);
                if (confidence > 0.4) { // Minimum threshold for a candidate
                    candidates.push({ x, y, confidence });
                    candidates.sort((a, b) => b.confidence - a.confidence);
                    if (candidates.length > maxCandidates) candidates.pop();
                }
            }
        }

        // Stage 2: Fine-tuning (step=1) for all top candidates
        for (const candidate of candidates) {
            const fineRange = 4;
            for (let fy = Math.max(startY, candidate.y - fineRange); fy <= Math.min(height - size, candidate.y + fineRange); fy++) {
                for (let fx = Math.max(startX, candidate.x - fineRange); fx <= Math.min(width - size, candidate.x + fineRange); fx++) {
                    let confidence = calculateCorrelation(imageData, fx, fy, size, alphaMap, true);
                    
                    // Final decision scoring (coordinate-precise)
                    let score = confidence;
                    if (size === expectedSize) score += 0.05;
                    const marginX = width - fx - size;
                    const marginY = height - fy - size;
                    if ([32, 48, 64].includes(marginX) || [32, 48, 64].includes(marginY)) {
                        score += 0.02;
                    }

                    if (score > maxConfidence) {
                        maxConfidence = score;
                        bestResult = { x: fx, y: fy, size, confidence };
                    }
                }
            }
        }
        
        if (maxConfidence > 1.05) break; 
    }

    // Threshold for detection
    // NCC usually has higher contrast between match and no-match
    if (maxConfidence > 0.65) {
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
