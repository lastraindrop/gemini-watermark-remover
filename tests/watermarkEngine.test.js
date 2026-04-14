import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { createMockImageData, MockCanvas } from './test_utils.js';

const savedGlobals = {};

before(() => {
    if (typeof global.document === 'undefined') {
        savedGlobals.window = global.window;
        savedGlobals.document = global.document;
        savedGlobals.Image = global.Image;

        global.window = { process: process };
        // Mock HTMLImageElement for _loadAsset — returns dimensions based on asset src
        global.Image = class {
            constructor() {
                this.onload = null;
                this.onerror = null;
                this._src = '';
            }
            set src(val) {
                this._src = val;
                // Infer size from file name: bg_48.png → 48, bg_96.png → 96, else 1
                const m = String(val).match(/bg_(\d+)\.png$/);
                const s = m ? parseInt(m[1], 10) : 1;
                this.width = s;
                this.height = s;
                Promise.resolve().then(() => {
                    if (this.onload) this.onload();
                });
            }
        };
        global.document = {
            createElement: (tag) => {
                if (tag === 'canvas') {
                    return new MockCanvas(100, 100);
                }
                return {};
            }
        };
    }
});

after(() => {
    if (savedGlobals.window) global.window = savedGlobals.window;
    if (savedGlobals.document) global.document = savedGlobals.document;
    if (savedGlobals.Image !== undefined) global.Image = savedGlobals.Image;
});

describe('WatermarkEngine Coordination & Cache', () => {
    let engine;
    const mockBg = {
        bg48: { width: 48, height: 48 },
        bg96: { width: 96, height: 96 }
    };

    before(() => {
        engine = new WatermarkEngine(mockBg);
    });

    after(() => {
        if (engine) engine.destroy();
    });

    test('AlphaMap Caching: Multiple calls should return same instance', async () => {
        const map1 = await engine.getAlphaMap(48);
        const map2 = await engine.getAlphaMap(48);
        
        assert.strictEqual(map1, map2, 'Should cache and return the same object instance');
        // getAlphaMap returns { data: Float32Array, width, height }
        assert.strictEqual(map1.data.length, 48 * 48);
    });

    test('Different sizes should have independent caches', async () => {
        const map48 = await engine.getAlphaMap(48);
        const map96 = await engine.getAlphaMap(96);
        
        assert.notStrictEqual(map48, map96);
        assert.strictEqual(map48.data.length, 48 * 48);
        assert.strictEqual(map96.data.length, 96 * 96);
    });

    test('Engine Destruction: Should clear caches and workers', () => {
        const localEngine = new WatermarkEngine(mockBg);
        localEngine.alphaMaps[48] = new Float32Array(10);
        localEngine.destroy();
        assert.strictEqual(Object.keys(localEngine.alphaMaps).length, 0);
    });

    test('Worker Fallback: Should use main thread if worker initialization fails', async () => {
        // Force worker to fail by blocking the Worker constructor
        const originalWorker = global.Worker;
        global.Worker = function() { throw new Error('Worker blocked'); };
        
        const localEngine = new WatermarkEngine(mockBg);
        const img = createMockImageData(100, 100);
        
        // This should not throw, but fallback internally
        const result = await localEngine.removeWatermarkFromImage(img);
        assert.ok(result.canvas, 'Should still return a canvas via main thread fallback');
        assert.strictEqual(localEngine._useWorker, false, 'Worker should be disabled after failure');
        
        localEngine.destroy();
        global.Worker = originalWorker;
    });

    test('Protocol Compliance: Engine has asset cache and alphaMaps', async () => {
        assert.strictEqual(typeof engine.alphaMaps, 'object', 'Should have alphaMaps map');
        assert.strictEqual(typeof engine._assetCache, 'object', 'Should have assetCache map');
    });
});
