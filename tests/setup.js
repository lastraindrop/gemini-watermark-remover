/**
 * Unified DOM/Browser mock environment for Node.js test execution.
 *
 * 4 files (worker_resilience, parameter_matrix, product_audit, e2e_integration)
 * previously duplicated ~180 lines of mock setup. This module centralizes it.
 *
 * Usage:
 *   import { setupNodeDOM, teardownNodeDOM } from './setup.js';
 *   const saved = setupNodeDOM({ canvas: true, image: true, worker: true });
 *   // ... tests ...
 *   teardownNodeDOM(saved);
 */

import { MockCanvas, MockImageElement } from './test_utils.js';
import { PROFILES } from '../src/core/profiles.js';

// ============================================================
// Default mock factories
// ============================================================

function defaultWorker(behavior = 'noop') {
    return class {
        _inUse = false;
        constructor() { this.onmessage = null; this.onerror = null; }
        postMessage() {
            if (behavior === 'noop') return;
            if (behavior === 'echo') {
                // Used by worker_resilience: modify data and reply
            }
        }
        terminate() {}
    };
}

function defaultDocument(canvasW = 100, canvasH = 100) {
    const mockEl = (tag) => {
        if (tag === 'canvas') return new MockCanvas(canvasW, canvasH);
        const el = {
            appendChild(e) { this.children.push(e); return e; },
            prepend(e) { this.children.unshift(e); return e; },
            children: [],
            style: {},
            classList: { add() {}, remove() {}, replace() {}, contains() { return false; }, toggle() {} },
            getAttribute() { return ''; },
            setAttribute() {},
            tagName: (tag || 'div').toUpperCase(),
            querySelector() { return mockEl('div'); },
            querySelectorAll() { return []; },
            textContent: '',
            value: '',
            onclick: null,
            click() {},
            href: '',
            src: '',
            id: '',
            innerHTML: '',
            append() {},
            remove() {},
            closest() { return null; },
            addEventListener() {},
            removeEventListener() {},
            insertAdjacentHTML() {},
            dataset: {},
            disabled: false,
            checked: false,
            parentNode: null,
            class: '',
            type: 'text',
        };
        return el;
    };
    return {
        documentElement: { lang: 'en' },
        body: mockEl('body'),
        title: '',
        getElementById: () => mockEl('div'),
        createElement: (tag) => mockEl(tag),
        createTextNode: (text) => ({ textContent: text }),
        querySelectorAll: () => [],
    };
}

// ============================================================
// Public API
// ============================================================

const KNOWN_GLOBALS = ['window', 'Worker', 'ImageData', 'Image', 'document', 'Blob', 'localStorage', 'URL', 'FileReader'];

/**
 * Set up browser-like globals for Node.js test execution.
 * Always call teardownNodeDOM() with the returned saved state.
 *
 * @param {Object} opts
 * @param {boolean} [opts.canvas]      - Provide HTMLCanvasElement mock via MockCanvas
 * @param {boolean} [opts.image]       - Provide HTMLImageElement mock (async load)
 * @param {string}  [opts.worker]      - 'noop' (default) | 'echo' | 'throw'
 * @param {boolean} [opts.document]    - Provide minimal document mock
 * @param {boolean} [opts.blob]        - Provide Node Blob as global Blob
 * @param {boolean} [opts.localStorage]- Provide minimal localStorage mock
 * @param {boolean} [opts.fileReader]  - Provide minimal FileReader mock
 * @param {Object}  [opts.customWorkerClass] - Custom Worker class to use
 * @returns {{ saved: Object }}
 */
export function setupNodeDOM(opts = {}) {
    const {
        canvas = true,
        image = true,
        document: needDoc = true,
        blob = false,
        localStorage: needLS = false,
        fileReader = false,
        workerBehavior = 'noop',
        customWorkerClass = null,
    } = opts;

    const saved = {};
    for (const k of KNOWN_GLOBALS) {
        if (k in global) saved[k] = global[k];
    }

    // Image
    if (image && typeof global.Image === 'undefined') {
        global.Image = MockImageElement;
    }

    // ImageData
    if (typeof global.ImageData === 'undefined') {
        global.ImageData = class {
            constructor(data, w, h) { this.data = data; this.width = w; this.height = h; }
        };
    }

    // Canvas via document
    if (needDoc && typeof global.document === 'undefined') {
        global.document = defaultDocument(100, 100);
    }

    // Worker
    if ((customWorkerClass || workerBehavior !== 'noop') && typeof global.Worker === 'undefined') {
        const WorkerClass = customWorkerClass || defaultWorker();
        global.window = { ...global.window, Worker: WorkerClass, GM_info: null };
        global.Worker = WorkerClass;
    } else if (typeof global.window === 'undefined' && typeof global.Worker !== 'undefined') {
        global.window = { Worker: global.Worker, GM_info: null };
    }

    // Blob (for processing pipeline)
    if (blob) {
        try { const { Blob } = require('node:buffer'); global.Blob = Blob; } catch {}
    }

    // localStorage
    if (needLS && typeof global.localStorage === 'undefined') {
        global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
    }

    // FileReader
    if (fileReader) {
        global.FileReader = class {
            readAsDataURL() { this.onload?.({ target: { result: 'data:image/png;base64,test' } }); }
        };
    }

    // URL (blob URL tracking)
    if (typeof global.URL === 'undefined') {
        const urls = new Set();
        global.URL = {
            createObjectURL: () => { const u = `blob:mock-${Math.random()}`; urls.add(u); return u; },
            revokeObjectURL: (u) => urls.delete(u),
        };
        global.MockMemoryTracker = urls;
    }

    return saved;
}

/**
 * Restore globals to their pre-setup state.
 * @param {Object} saved - Return value from setupNodeDOM()
 */
export function teardownNodeDOM(saved) {
    for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) {
            delete global[k];
        } else {
            global[k] = v;
        }
    }
}

function dimensionsFromProfileAsset(assetKey) {
    for (const profile of Object.values(PROFILES)) {
        if (!profile.assets) continue;
        const assetEntry = Object.entries(profile.assets).find(([, value]) => value === assetKey);
        if (!assetEntry) continue;

        const [anchor] = assetEntry;
        const tier = Object.values(profile.tiers || {}).find(entry => entry.anchor === anchor);
        if (!tier) continue;

        const width = tier.logoWidth || tier.logoSize;
        const height = tier.logoHeight || tier.logoSize;
        if (Number.isFinite(width) && Number.isFinite(height)) {
            return { width, height };
        }
    }
    return null;
}

/**
 * Resolve a synthetic asset size from the same profile metadata used by the app.
 * Supports explicit WxH keys, profile asset aliases, and Gemini square variants.
 */
export function resolveMockAssetDimensions(key) {
    const raw = String(key || '');
    const explicitSize = raw.match(/^(\d+)x(\d+)$/);
    if (explicitSize) {
        return {
            width: parseInt(explicitSize[1], 10),
            height: parseInt(explicitSize[2], 10)
        };
    }

    const profileDimensions = dimensionsFromProfileAsset(raw);
    if (profileDimensions) return profileDimensions;

    const squareSize = parseInt(raw, 10);
    if (Number.isFinite(squareSize) && squareSize > 0) {
        return { width: squareSize, height: squareSize };
    }

    return { width: 96, height: 96 };
}

/**
 * Create a mock WatermarkEngine asset loader that returns synthetic alpha maps.
 * Eliminates duplicate _loadAsset override patterns across integration suites.
 *
 * @param {WatermarkEngine} engine - Engine instance to install on
 * @param {Object} utils - { createMockAlphaMap, alphaToRGBA, createMockImageElement }
 * @returns {Map} The shared asset cache (useful for assertions)
 */
export function installMockAssetLoader(engine, { createMockAlphaMap, alphaToRGBA, createMockImageElement }) {
    const cache = new Map();

    engine._loadAsset = async (key) => {
        const assetKey = String(key || '');
        if (cache.has(assetKey)) return cache.get(assetKey);

        const { width, height } = resolveMockAssetDimensions(assetKey);
        const alpha = createMockAlphaMap(width, height);
        const rgba = alphaToRGBA(alpha, width, height);
        const img = createMockImageElement(width, height, rgba);
        // Synthetic maps are exact mathematical alpha, not captured PNGs with
        // the positive baseline calibrated in the production asset registry.
        img.__gwrAlphaBias = 0;
        cache.set(assetKey, img);
        return img;
    };

    return cache;
}
