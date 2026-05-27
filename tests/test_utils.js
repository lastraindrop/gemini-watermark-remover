import { registry } from '../src/core/templates/registry.js';
import { getCatalogConfig, getAllCatalogConfigs } from '../src/core/catalog.js';
import { calculateWatermarkPosition } from '../src/core/config.js';

export const TC = {
    RES_0_5K: 512, RES_1K: 1024, RES_2K: 2048, RES_4K: 4096,
    LOGO_48: 48, LOGO_96: 96,
    MARGIN_32: 32, MARGIN_64: 64,
    THRESHOLD: 0.18, PROBE_THRESHOLD: 0.18, FALLBACK_THRESHOLD: 0.30,
    SCALED_THRESHOLD: 0.35, ADAPTIVE_THRESHOLD: 0.22,
    PROFILES: { GEMINI: 'gemini', DOUBAO: 'doubao', DALLE3: 'dalle3', AUTO: 'auto' },
    LOGO_VALUE: 255,
    TYPES: { SOLID: 'solid', GRADIENT: 'gradient', RANDOM: 'random', GRID: 'grid', NOISE: 'noise' },
};

function pseudoRandom01(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Resolve expected watermark position from catalog config, avoiding hardcoding.
 * Falls back to heuristic config if no exact catalog match.
 */
export function resolvePos(imageWidth, imageHeight, profileId = 'gemini') {
    const cfg = getCatalogConfig(imageWidth, imageHeight, profileId);
    const config = cfg || (() => {
        const all = getAllCatalogConfigs(imageWidth, imageHeight, profileId);
        return all.length > 0 ? all[0] : null;
    })();
    return calculateWatermarkPosition(imageWidth, imageHeight, config || {
        logoSize: 96, marginRight: 64, marginBottom: 64
    });
}

/**
 * Returns the standard logo size for a given resolution from catalog.
 */
export function resolveLogoSize(imageWidth, imageHeight, profileId = 'gemini') {
    const cfg = getCatalogConfig(imageWidth, imageHeight, profileId);
    return cfg ? (cfg.logoWidth || cfg.logoSize) : 96;
}

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
                val = pseudoRandom01((x + 1) * 12.9898 + (y + 1) * 78.233) * 255;
            } else if (type === 'grid') {
                val = ((x >> 4) + (y >> 4)) % 2 === 0 ? 200 : 50;
            }
            // Add tiny jitter to avoid pure zero variance (v1.9.0 stability fix)
            val = Math.max(0, Math.min(255, val + (pseudoRandom01((x + 17) * 39.3467 + (y + 23) * 11.135) - 0.5) * 4));
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
export function applyWatermark(imageData, x, y, sizeW, sizeH, alphaMap, logoValue = 255, jitter = { x: 0, y: 0 }) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const realSizeH = sizeH || sizeW;

    const startX = x + (jitter.x || 0);
    const startY = y + (jitter.y || 0);

    for (let r = 0; r < realSizeH; r++) {
        const curY = Math.floor(startY + r);
        if (curY < 0 || curY >= imgHeight) continue;
        for (let c = 0; c < sizeW; c++) {
            const curX = Math.floor(startX + c);
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
    const centerX = w / 2;
    const centerY = realH / 2;
    const radius = Math.min(w, realH) / 2.5;
    
    for (let i = 0; i < realH; i++) {
        for (let j = 0; j < w; j++) {
            const dx = j - centerX;
            const dy = i - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius) {
                const ratio = 1 - dist / radius;
                const val = Math.pow(ratio, 0.3);
                alphaMap[i * w + j] = Math.min(0.95, val);
            } else {
                alphaMap[i * w + j] = 0.01;
            }
        }
    }
    return alphaMap;
}

/**
 * Convert an AlphaMap (Float32Array) to RGBA data (Uint8ClampedArray) for asset mocking
 */
export function alphaToRGBA(alphaMap, width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < alphaMap.length; i++) {
        const val = Math.round(alphaMap[i] * 255);
        const idx = i * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = val; // Grayscale
        data[idx + 3] = 255;
    }
    return data;
}

/**
 * Generate a full Cartesian product of parameters for exhaustive testing (v1.8.1)
 * combinations: Profiles x Anchors x Flags
 */

export function generateParameterMatrix() {
    const maxSyntheticPixels = 2048 * 2048;
    const keyGeminiDimensions = new Set([
        '512x512',
        '1024x1024',
        '1536x672',
        '832x1248',
        '1344x768',
        '2048x2048',
        '512x2048'
    ]);
    const flags = [
        { deepScan: true, noiseReduction: false },
        { deepScan: false, noiseReduction: false }
    ];
    
    const matrix = [];
    const allProfiles = registry.getAllProfiles();

    for (const profile of allProfiles) {
        const catalog = registry.getCatalog(profile.id);
        const entries = profile.id === 'gemini'
            ? catalog.filter(entry => keyGeminiDimensions.has(`${entry.width}x${entry.height}`))
            : catalog.filter(entry => entry.width * entry.height <= maxSyntheticPixels);
        for (const entry of entries) {
            for (const f of flags) {
                matrix.push({
                    profileId: profile.id,
                    options: f,
                    resolution: { w: entry.width, h: entry.height, config: entry }
                });
            }
        }
    }
    return matrix;
}

/**
 * Mocking Browser DOM elements for E2E node tests (v1.8.1)
 */
export class MockCanvas {
    constructor(width, height) {
        this._width = width || 300;
        this._height = height || 150;
        this.data = new Uint8ClampedArray(this._width * this._height * 4);
    }
    get width() { return this._width; }
    set width(val) {
        if (this._width !== val) {
            this._width = val;
            this.data = new Uint8ClampedArray(this._width * this._height * 4);
        }
    }
    get height() { return this._height; }
    set height(val) {
        if (this._height !== val) {
            this._height = val;
            this.data = new Uint8ClampedArray(this._width * this._height * 4);
        }
    }
    getContext(type) {
        if (type !== '2d') return null;
        return {
            clearRect: (x, y, w, h) => {
                for (let r = 0; r < h; r++) {
                    const rowOff = ((y + r) * this._width + x) * 4;
                    if (rowOff >= 0 && rowOff < this.data.length) {
                        this.data.fill(0, rowOff, rowOff + w * 4);
                    }
                }
            },
            drawImage: (img, ...args) => {
                let srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH;
                if (args.length === 2) {
                    dstX = args[0]; dstY = args[1];
                    dstW = img.width; dstH = img.height;
                    srcX = 0; srcY = 0; srcW = img.width; srcH = img.height;
                } else if (args.length === 4) {
                    dstX = args[0]; dstY = args[1]; dstW = args[2]; dstH = args[3];
                    srcX = 0; srcY = 0; srcW = img.width; srcH = img.height;
                } else if (args.length === 8) {
                    srcX = args[0]; srcY = args[1]; srcW = args[2]; srcH = args[3];
                    dstX = args[4]; dstY = args[5]; dstW = args[6]; dstH = args[7];
                } else {
                    return;
                }
                
                const finalData = img._data;
                if (!finalData) return;
                
                if (srcW === dstW && srcH === dstH && dstW === this._width && dstH === this._height) {
                    const len = Math.min(this.data.length, finalData.length);
                    this.data.set(finalData.subarray(0, len));
                } else {
                    for (let r = 0; r < dstH; r++) {
                        const srcRow = Math.floor(r * srcH / dstH);
                        for (let c = 0; c < dstW; c++) {
                            const srcCol = Math.floor(c * srcW / dstW);
                            const srcIdx = ((srcY + srcRow) * img.width + (srcX + srcCol)) * 4;
                            const dstIdx = ((dstY + r) * this._width + (dstX + c)) * 4;
                            if (dstIdx >= 0 && dstIdx + 3 < this.data.length) {
                                this.data[dstIdx] = finalData[srcIdx] || 0;
                                this.data[dstIdx + 1] = finalData[srcIdx + 1] || 0;
                                this.data[dstIdx + 2] = finalData[srcIdx + 2] || 0;
                                this.data[dstIdx + 3] = 255;
                            }
                        }
                    }
                }
            },
            getImageData: (x, y, w, h) => {
                // v1.8.1 Fix: Ensure returned data matches requested dimensions
                const buffer = new Uint8ClampedArray(w * h * 4);
                // For simplicity in tests, if x,y=0 and sizes match, just return a slice
                if (x === 0 && y === 0 && w === this._width && h === this._height) {
                    return { width: w, height: h, data: this.data };
                }
                // Otherwise do a proper crop simulation (needed for asset extraction)
                for (let r = 0; r < h; r++) {
                    const srcY = y + r;
                    if (srcY < 0 || srcY >= this._height) continue;
                    const srcOff = (srcY * this._width + x) * 4;
                    const dstOff = (r * w) * 4;
                    if (srcOff >= 0 && srcOff < this.data.length) {
                        const copyLen = Math.min(w * 4, this.data.length - srcOff);
                        buffer.set(this.data.subarray(srcOff, srcOff + copyLen), dstOff);
                    }
                }
                return { width: w, height: h, data: buffer };
            },
            putImageData: (imgData) => {
                this.data.set(imgData.data);
            }
        };
    }
    toBlob(callback) {
        callback(new Blob(['mock-blob-data'], { type: 'image/png' }));
    }
}

export class MockImageElement {
    constructor() {
        this.width = 0;
        this.height = 0;
        this._src = '';
        this._data = null;
    }
    set src(val) {
        this._src = val;
        // Simulate async load
        setTimeout(() => {
            if (this.onload) this.onload();
        }, 1);
    }
    get src() { return this._src; }
}

export function createMockImageElement(width, height, data) {
    const img = new MockImageElement();
    img.width = width;
    img.height = height;
    img._data = data;
    return img;
}

/**
 * Blob/URL Mocks for memory tracking
 */
export function setupMemoryMocks() {
        const urls = new Set();
        global.URL.createObjectURL = (obj) => {
            const url = `blob:mock-${Math.random()}`;
            urls.add(url);
            return url;
        };
        global.URL.revokeObjectURL = (url) => urls.delete(url);
        global.MockMemoryTracker = urls;
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
