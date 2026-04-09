import { GEMINI_SIZE_CATALOG } from '../src/core/catalog.js';

/**
 * Create mock image data with specific aspect ratios
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
 * Inject watermark into image data (Simulating alpha blending)
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
                if (noiseLevel > 0) val += (Math.random() - 0.5) * noiseLevel;
                data[idx + channel] = Math.max(0, Math.min(255, Math.round(val)));
            }
        }
    }
}

/**
 * Generate a standard mock alpha map
 */
export function createMockAlphaMap(size) {
    const alphaMap = new Float32Array(size * size).fill(0);
    for (let i = size/4|0; i < 3*size/4|0; i++) {
        for (let j = size/4|0; j < 3*size/4|0; j++) {
            const dist = (i + j) / (2 * size);
            alphaMap[i * size + j] = 0.2 + dist * 0.6;
        }
    }
    return alphaMap;
}

/**
 * Generate dynamic combinations for exhaustive testing
 */
export function generateParameterMatrix() {
    const deepScans = [true, false];
    const noiseReductions = [true, false];
    const resolutionSamples = [];
    const tiersFound = new Set();
    for (const entry of GEMINI_SIZE_CATALOG) {
        if (!tiersFound.has(entry.tier)) {
            resolutionSamples.push({ w: entry.width, h: entry.height, tier: entry.tier });
            tiersFound.add(entry.tier);
        }
    }
    resolutionSamples.push({ w: 1000, h: 1000, type: 'non-catalog' });
    resolutionSamples.push({ w: 530, h: 530, type: 'non-catalog' });
    resolutionSamples.push({ w: 200, h: 200, type: 'tiny' });

    const matrix = [];
    for (const res of resolutionSamples) {
        for (const deepScan of deepScans) {
            for (const noiseReduction of noiseReductions) {
                if (res.w >= 2048 && (deepScan === false || noiseReduction === true)) continue; 
                matrix.push({ options: { deepScan, noiseReduction }, resolution: res });
            }
        }
    }
    return matrix;
}

/**
 * Blob/URL Mocks for memory tracking
 */
export function setupMemoryMocks() {
    if (typeof global.URL === 'undefined') {
        const urls = new Set();
        global.URL = {
            createObjectURL: () => {
                const url = `blob:mock-${Math.random()}`;
                urls.add(url);
                return url;
            },
            revokeObjectURL: (url) => urls.delete(url)
        };
        global.MockMemoryTracker = urls;
    }
}

/**
 * Mocks profiles
 */
export function setupMockProfile() {
    return {
        id: 'mock-ai',
        name: 'Mock AI',
        logoColor: { r: 255, g: 0, b: 0 },
        tiers: { 'default': { logoSize: 50, marginRight: 20, marginBottom: 20 } },
        getHeuristicConfig: () => ({ logoSize: 50, marginRight: 20, marginBottom: 20 })
    };
}
