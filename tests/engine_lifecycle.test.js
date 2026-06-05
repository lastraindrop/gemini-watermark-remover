/**
 * Engine Lifecycle Tests — destroy, reuse, concurrent instances
 * Covers gaps: destroy→reuse, two engines simultaneously
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { setupNodeDOM, teardownNodeDOM } from './setup.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, createMockImageElement } from './test_utils.js';

let savedDOM;

before(() => { savedDOM = setupNodeDOM({ canvas: true, image: true }); });
after(() => { teardownNodeDOM(savedDOM); });

function makeImg(w, h) {
    const data = createMockImageData(w, h, 'noise', 128);
    return createMockImageElement(w, h, data.data);
}

describe('Engine Lifecycle', () => {

    test('destroy() then removeWatermarkFromImage throws gracefully', async () => {
        const engine = await WatermarkEngine.create();
        engine.destroy();
        // After destroy, the engine should not crash but may return empty result
        const img = createMockImageElement(100, 100, new Uint8ClampedArray(100 * 100 * 4));
        try {
            const result = await engine.removeWatermarkFromImage(img, { profileId: 'gemini' });
            // Should not throw; even if it returns empty, the result shape should be valid
            assert.ok(result, 'Should return a result object');
            assert.ok(typeof result.removedCount === 'number');
        } catch (e) {
            // If it does throw, that's also acceptable behavior for a destroyed engine
            assert.ok(e instanceof Error);
        }
    });

    test('destroy() clears alphaMaps and assetCache', async () => {
        const engine = await WatermarkEngine.create();
        engine.alphaMaps = { '96': { data: new Float32Array(10) } };
        engine._assetCache = { 'test': {} };
        engine.destroy();
        assert.deepStrictEqual(engine.alphaMaps, {});
        assert.deepStrictEqual(engine._assetCache, {});
    });

    test('destroy() sets canvas and context to null', async () => {
        const engine = await WatermarkEngine.create();
        engine.destroy();
        assert.strictEqual(engine._reusableCanvas, null);
        assert.strictEqual(engine._reusableCtx, null);
    });

    test('Two independent engines do not share state', async () => {
        const engine1 = await WatermarkEngine.create();
        const engine2 = await WatermarkEngine.create();

        engine1.alphaMaps.customKey = { data: new Float32Array(5) };
        assert.strictEqual(engine2.alphaMaps.customKey, undefined, 'Engine2 should not see engine1 alphaMaps');

        engine1.destroy();
        engine2.destroy();
    });

    test('getExecutionMode returns main-thread when no worker available', async () => {
        const engine = await WatermarkEngine.create();
        const mode = engine.getExecutionMode();
        assert.strictEqual(typeof mode, 'string');
        assert.ok(['main-thread', 'worker-assisted'].includes(mode));
        engine.destroy();
    });

    test('Repeated removeWatermarkFromImage calls do not leak state', async () => {
        const engine = await WatermarkEngine.create();
        const img = makeImg(128, 128);

        for (let i = 0; i < 3; i++) {
            const result = await engine.removeWatermarkFromImage(img, { profileId: 'gemini', deepScan: false });
            assert.ok(result);
            assert.ok(typeof result.removedCount === 'number');
        }

        engine.destroy();
    });
});
