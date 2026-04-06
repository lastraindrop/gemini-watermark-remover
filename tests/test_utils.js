/**
 * Test Utility for Gemini Watermark Remover
 * Provides functions for generating mock images and injecting watermarks.
 */

/**
 * Create mock image data with specific aspect ratios
 * @param {number} width 
 * @param {number} height 
 * @param {string} type - 'solid', 'gradient', 'random', 'grid'
 * @param {number} baseColor - default 128
 */
export function createMockImageData(width, height, type = 'solid', baseColor = 128) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) << 2;
            let val = baseColor;
            if (type === 'gradient') {
                val = ((x / width) * 255 + (y / height) * 255) / 2;
            } else if (type === 'random') {
                val = Math.random() * 255;
            } else if (type === 'grid') {
                val = ((x >> 4) + (y >> 4)) % 2 === 0 ? 200 : 50;
            }
            data[idx] = data[idx + 1] = data[idx + 2] = val;
            data[idx + 3] = 255;
        }
    }
    return { width, height, data };
}

/**
 * Add random noise to image data
 */
export function addNoise(imageData, level) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * level;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
}

/**
 * Inject watermark into image data (Simulating Gemini blending)
 * formula: watermarked = α × logo + (1 - α) × original
 */
export function applyWatermark(imageData, x, y, size, alphaMap, noiseLevel = 0) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const logoColor = 255;

    for (let r = 0; r < size; r++) {
        const curY = y + r;
        if (curY < 0 || curY >= imgHeight) continue;

        for (let c = 0; c < size; c++) {
            const curX = x + c;
            if (curX < 0 || curX >= imgWidth) continue;

            const alpha = alphaMap[r * size + c];
            if (alpha < 0.001) continue;

            const idx = (curY * imgWidth + curX) << 2;
            for (let channel = 0; channel < 3; channel++) {
                const original = data[idx + channel];
                let val = alpha * logoColor + (1 - alpha) * original;
                if (noiseLevel > 0) {
                    val += (Math.random() - 0.5) * noiseLevel;
                }
                data[idx + channel] = Math.max(0, Math.min(255, Math.round(val)));
            }
        }
    }
}

/**
 * Generate a standard mock alpha map with variance for NCC
 */
export function createMockAlphaMap(size) {
    const alphaMap = new Float32Array(size * size).fill(0);
    // Create a structured pattern (a solid square with strong diagonal gradient)
    for (let i = size/4|0; i < 3*size/4|0; i++) {
        for (let j = size/4|0; j < 3*size/4|0; j++) {
            // High variance diagonal gradient
            const dist = (i + j) / (2 * size);
            alphaMap[i * size + j] = 0.2 + dist * 0.6;
        }
    }
    return alphaMap;
}

/**
 * Generate a combinations of all parameters for exhaustive testing
 * @returns {Array<Object>}
 */
export function generateParameterMatrix() {
    const deepScans = [true, false];
    const noiseReductions = [true, false];
    const resolutions = [
        // Catalog entries (one per tier)
        { w: 512, h: 512 }, // 0.5k tier
        { w: 384, h: 688 }, // 0.5k 9:16
        { w: 1024, h: 1024 }, // 1k tier
        { w: 1536, h: 672 }, // 1k 21:9
        { w: 2048, h: 2048 }, // 2k tier
        { w: 4096, h: 4096 }, // 4k tier
        // Near-miss entries
        { w: 1000, h: 1000 }, // Close to 1k
        { w: 530, h: 530 }, // Close to 0.5k
        // Non-standard
        { w: 800, h: 600 }, // Non-standard
        { w: 3000, h: 3000 }, // Large non-standard
        { w: 200, h: 200 } // Tiny
    ];
    
    const matrix = [];
    for (const res of resolutions) {
        for (const deepScan of deepScans) {
            for (const noiseReduction of noiseReductions) {
                // Skip exhaustive high-res combinations to speed up testing
                if (res.w >= 2000 && (deepScan === false || noiseReduction === true)) continue; 
                matrix.push({ options: { deepScan, noiseReduction }, resolution: res });
            }
        }
    }
    return matrix;
}

/**
 * Advanced mock implementation for Blob and URL for memory tracking tests
 */
export function setupMemoryMocks() {
    if (typeof global.URL === 'undefined') {
        const urls = new Set();
        global.URL = {
            createObjectURL: (blob) => {
                const url = `blob:mock-${Math.random()}`;
                urls.add(url);
                return url;
            },
            revokeObjectURL: (url) => {
                urls.delete(url);
            }
        };
        global.MockMemoryTracker = urls;
    }
}
