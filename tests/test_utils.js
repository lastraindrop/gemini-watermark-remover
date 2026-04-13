import { CATALOGS } from '../src/core/catalog.js';

/**
 * Build a map of alpha maps for all required sizes in a profile
 */
export function buildAlphaMaps(profile) {
    const maps = {};
    if (profile.tiers) {
        Object.values(profile.tiers).forEach(t => {
            const size = t.logoSize || t.logoWidth; // simplify
            if (!maps[size]) maps[size] = createMockAlphaMap(size);
        });
    }
    return maps;
}

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
export function applyWatermark(imageData, x, y, sizeW, sizeH, alphaMap, logoValue = 255) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const realSizeH = sizeH || sizeW;

    for (let r = 0; r < realSizeH; r++) {
        const curY = Math.floor(y + r);
        if (curY < 0 || curY >= imgHeight) continue;
        for (let c = 0; c < sizeW; c++) {
            const curX = Math.floor(x + c);
            if (curX < 0 || curX >= imgWidth) continue;
            const alpha = alphaMap[r * sizeW + c];
            if (alpha < 0.001) continue;
            const idx = (curY * imgWidth + curX) << 2;
            for (let channel = 0; channel < 3; channel++) {
                const original = data[idx + channel];
                let val = alpha * logoValue + (1 - alpha) * original;
                data[idx + channel] = Math.max(0, Math.min(255, Math.round(val)));
            }
        }
    }
}

/**
 * Generate a standard mock alpha map
 */
export function createMockAlphaMap(w, h) {
    const realH = h || w;
    const alphaMap = new Float32Array(w * realH).fill(0);
    // Draw something complex
    for (let i = 0; i < realH; i++) {
        for (let j = 0; j < w; j++) {
            if (i > realH/4 && i < 3*realH/4 && j > w/4 && j < 3*w/4) {
                alphaMap[i * w + j] = 0.5;
            }
        }
    }
    return alphaMap;
}

/**
 * Generate dynamic combinations for exhaustive testing
 */
export function generateParameterMatrix() {
    const profiles = ['gemini', 'doubao'];
    const matrix = [];
    
    for (const pid of profiles) {
        const catalog = CATALOGS[pid];
        if (!catalog) continue;
        
        // Sample first entry and some variation
        const sample = catalog[0];
        matrix.push({ 
            profileId: pid,
            options: { deepScan: true, noiseReduction: false }, 
            resolution: { w: sample.width, h: sample.height, config: sample } 
        });
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
