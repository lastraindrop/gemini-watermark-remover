import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DetectorContext, detectWatermark } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
import { __internalCatalogData } from '../src/core/catalog.js';

describe('DetectorContext isolation', () => {

    test('Two independent contexts do not share state', () => {
        const ctxA = new DetectorContext();
        const ctxB = new DetectorContext();
        const img1 = createMockImageData(100, 100, 'noise', 128);
        const img2 = createMockImageData(200, 200, 'solid', 64);

        detectWatermark(img1, { '48': createMockAlphaMap(48) }, { noiseReduction: true, deepScan: false }, ctxA);
        detectWatermark(img2, { '96': createMockAlphaMap(96) }, { noiseReduction: true, deepScan: false }, ctxB);

        assert.notStrictEqual(ctxA._blurBuffer, ctxB._blurBuffer);
        assert.ok(ctxA._blurBuffer, 'ctxA should have a blur buffer');
        assert.ok(ctxB._blurBuffer, 'ctxB should have a blur buffer');
        assert.ok(ctxA._blurBuffer.length !== ctxB._blurBuffer.length, 'Buffers should have different sizes');
    });

    test('Default context is shared via detectWatermark property accessors', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(48);

        detectWatermark(img, { '48': alphaMap }, { noiseReduction: true, deepScan: false });

        assert.ok(detectWatermark._blurBuffer instanceof Uint8ClampedArray);
        assert.ok(detectWatermark._blurBuffer.length > 0);
    });

    test('resetDetectorBuffers() clears the default context', async () => {
        const { resetDetectorBuffers } = await import('../src/core/detector.js');
        const img = createMockImageData(100, 100, 'noise', 128);

        detectWatermark(img, { '48': createMockAlphaMap(48) }, { noiseReduction: true, deepScan: false });

        resetDetectorBuffers();
        assert.strictEqual(detectWatermark._blurBuffer, null);
    });
});

describe('Lazy catalog loading', () => {

    test('Catalog data can be loaded on demand', () => {
        const data = __internalCatalogData;
        assert.ok(data, 'Catalog data should be accessible');
        assert.ok(data.WATERMARK_CONFIGS, 'WATERMARK_CONFIGS should exist');
        assert.ok(data.CATALOGS, 'CATALOGS should exist');
        assert.ok(data.CATALOGS.gemini.length > 0, 'Gemini catalog should have entries');
        assert.ok(data.CATALOGS.doubao.length > 0, 'Doubao catalog should have entries');
    });

    test('WATERMARK_CONFIGS is accessible via import', async () => {
        const { WATERMARK_CONFIGS } = await import('../src/core/catalog.js');
        assert.ok(WATERMARK_CONFIGS['0.5k']);
        assert.ok(WATERMARK_CONFIGS['1k']);
        assert.ok(WATERMARK_CONFIGS['2k']);
        assert.ok(WATERMARK_CONFIGS['4k']);
        assert.strictEqual(WATERMARK_CONFIGS['0.5k'].logoSize, 48);
        assert.strictEqual(WATERMARK_CONFIGS['1k'].logoSize, 96);
    });
});

describe('applyRemovalStrategy edge cases', () => {

    function makeImg(w, h, fill) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i++) data[i] = fill;
        return { width: w, height: h, data };
    }

    test('Empty matches array is a no-op', () => {
        const img = makeImg(100, 100, 128);
        const before = new Uint8ClampedArray(img.data);

        assert.doesNotThrow(() => {
            applyRemovalStrategy(img, []);
        });

        assert.deepStrictEqual(img.data, before, 'Pixels should be unchanged');
    });

    test('gemini profile match uses multiPassRemoval', () => {
        const img = makeImg(200, 200, 150);
        const alphaMap = createMockAlphaMap(48);
        applyWatermark(img, 100, 100, 48, 48, alphaMap, 255);

        const before = new Uint8ClampedArray(img.data);
        assert.doesNotThrow(() => {
            applyRemovalStrategy(img, [{
                profileId: 'gemini',
                alphaMap,
                pos: { x: 100, y: 100, width: 48, height: 48 },
                confidence: 0.6
            }]);
        });

        let changed = false;
        for (let i = 0; i < before.length; i++) {
            if (before[i] !== img.data[i]) { changed = true; break; }
        }
        assert.ok(changed, 'Gemini match should modify pixels via multiPassRemoval');
    });

    test('non-gemini profile match uses direct removeWatermark', () => {
        const img = makeImg(200, 200, 150);
        const alphaMap = createMockAlphaMap(48);
        applyWatermark(img, 100, 100, 48, 48, alphaMap, 255);

        const before = new Uint8ClampedArray(img.data);
        assert.doesNotThrow(() => {
            applyRemovalStrategy(img, [{
                profileId: 'doubao',
                alphaMap,
                pos: { x: 100, y: 100, width: 48, height: 48 },
                confidence: 0.6
            }]);
        });

        let changed = false;
        for (let i = 0; i < before.length; i++) {
            if (before[i] !== img.data[i]) { changed = true; break; }
        }
        assert.ok(changed, 'Doubao match should modify pixels via removeWatermark');
    });

    test('Multiple matches are processed sequentially', () => {
        const img = makeImg(300, 300, 150);
        const alphaMap1 = createMockAlphaMap(48);
        const alphaMap2 = createMockAlphaMap(48);

        applyWatermark(img, 50, 50, 48, 48, alphaMap1, 255);
        applyWatermark(img, 200, 50, 48, 48, alphaMap2, 255);

        assert.doesNotThrow(() => {
            applyRemovalStrategy(img, [
                { profileId: 'gemini', alphaMap: alphaMap1, pos: { x: 50, y: 50, width: 48, height: 48 }, confidence: 0.6 },
                { profileId: 'doubao', alphaMap: alphaMap2, pos: { x: 200, y: 50, width: 48, height: 48 }, confidence: 0.6 }
            ]);
        });

        for (let i = 0; i < img.data.length; i += 4) {
            assert.ok(img.data[i] >= 0 && img.data[i] <= 255);
        }
    });
});
