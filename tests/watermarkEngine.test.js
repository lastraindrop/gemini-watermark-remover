import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { createMockImageData } from './test_utils.js';

const savedGlobals = {};

before(() => {
    if (typeof global.document === 'undefined') {
        savedGlobals.window = global.window;
        savedGlobals.document = global.document;

        global.window = { process: process };
        global.document = {
            createElement: (tag) => {
                if (tag === 'canvas') {
                    return {
                        width: 0,
                        height: 0,
                        getContext: () => ({
                            drawImage: () => {},
                            getImageData: (x, y, w, h) => createMockImageData(w, h, 'solid', 128),
                            putImageData: () => {}
                        })
                    };
                }
                return {};
            }
        };
    }
});

after(() => {
    if (savedGlobals.window) global.window = savedGlobals.window;
    if (savedGlobals.document) global.document = savedGlobals.document;
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
        
        assert.strictEqual(map1, map2, 'Should cache and return the same Float32Array instance');
        assert.strictEqual(map1.length, 48 * 48);
    });

    test('Different sizes should have independent caches', async () => {
        const map48 = await engine.getAlphaMap(48);
        const map96 = await engine.getAlphaMap(96);
        
        assert.notStrictEqual(map48, map96);
        assert.strictEqual(map48.length, 48 * 48);
        assert.strictEqual(map96.length, 96 * 96);
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

    test('Protocol Compliance: Watermark info structure', async () => {
        const image = { width: 1024, height: 1024 };
        assert.ok(engine.bgCaptures.bg48, 'Should have bg48 capture');
        assert.ok(engine.bgCaptures.bg96, 'Should have bg96 capture');
    });
});
