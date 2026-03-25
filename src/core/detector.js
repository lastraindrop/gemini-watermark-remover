/**
 * Watermark Detector
 * Uses pixel-correlation to locate watermarks without relying on EXIF/dimensions.
 */

/**
 * Detect watermark position and size using pixel correlation
 * @param {ImageData} imageData - Full image data
 * @param {Object} alphaMaps - Map of size -> Float32Array
 * @returns {Object|null} {x, y, size, confidence} or null if not found
 */
export function detectWatermark(imageData, alphaMaps) {
    const { width, height, data } = imageData;
    const sizes = [96, 48]; // Try larger first
    
    let bestResult = null;
    let maxConfidence = -1;

    for (const size of sizes) {
        const alphaMap = alphaMaps[size];
        if (!alphaMap) continue;

        // Gemini watermarks are always in the bottom-right quadrant.
        // We search in a region: [width/2, height/2] to [width, height]
        // Specifically, standard margins are 32 or 64. 
        // We'll search with a margin of error.
        const searchRangeX = Math.floor(width * 0.2); // Last 20%
        const searchRangeY = Math.floor(height * 0.2); // Last 20%
        
        const startX = width - searchRangeX - size;
        const startY = height - searchRangeY - size;

        for (let y = startY; y < height - size; y += 2) {
            for (let x = startX; x < width - size; x += 2) {
                const confidence = calculateCorrelation(imageData, x, y, size, alphaMap);
                if (confidence > maxConfidence) {
                    maxConfidence = confidence;
                    bestResult = { x, y, size, confidence };
                }
            }
        }
        
        if (maxConfidence > 0.9) break; 
    }

    // Threshold for detection (0.6 is safer for varied backgrounds)
    if (maxConfidence > 0.6) {
        return bestResult;
    }

    return null;
}

/**
 * Calculate similarity between image region and alpha map
 * Simplified Cross-Correlation
 */
function calculateCorrelation(imageData, x, y, size, alphaMap) {
    const { data, width: imgWidth } = imageData;
    let dotProduct = 0;
    let imgMag = 0;
    let alphaMag = 0;

    for (let row = 0; row < size; row += 2) { // Downsample for speed
        const imgRowOffset = (y + row) * imgWidth + x;
        const alphaRowOffset = row * size;

        for (let col = 0; col < size; col += 2) {
            const imgIdx = (imgRowOffset + col) << 2;
            const alphaIdx = alphaRowOffset + col;

            // Use max channel as brightness proxy
            const brightness = Math.max(data[imgIdx], data[imgIdx + 1], data[imgIdx + 2]) / 255.0;
            const alpha = alphaMap[alphaIdx];

            dotProduct += brightness * alpha;
            imgMag += brightness * brightness;
            alphaMag += alpha * alpha;
        }
    }

    if (imgMag === 0 || alphaMag === 0) return 0;
    return dotProduct / (Math.sqrt(imgMag) * Math.sqrt(alphaMag));
}
