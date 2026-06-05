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

/**
 * Create a mock WatermarkEngine asset loader that returns synthetic alpha maps.
 * Eliminates the duplicate _loadAsset override pattern in parameter_matrix and product_audit.
 *
 * @param {WatermarkEngine} engine - Engine instance to install on
 * @param {Object} utils - { createMockAlphaMap, alphaToRGBA, createMockImageElement }
 * @returns {Map} The shared asset cache (useful for assertions)
 */
export function installMockAssetLoader(engine, { createMockAlphaMap, alphaToRGBA, createMockImageElement }) {
    const cache = new Map();

    engine._loadAsset = async (key) => {
        const k = String(key);
        if (cache.has(k)) return cache.get(k);

        let w = 96, h = 96;
        if (key.includes('doubao')) {
            w = 401; h = 173;
            if (key.includes('_tl')) { w = 307; h = 167; }
        } else if (key.includes('dalle3')) {
            w = 120; h = 40;
        } else if (key.includes('x')) {
            const parts = key.split('x');
            w = parseInt(parts[0]) || 96;
            h = parseInt(parts[1]) || 96;
        } else {
            w = h = parseInt(key) || 96;
        }

        const alpha = createMockAlphaMap(w, h);
        const rgba = alphaToRGBA(alpha, w, h);
        const img = createMockImageElement(w, h, rgba);
        cache.set(k, img);
        return img;
    };

    return cache;
}
