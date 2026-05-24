import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCorrelation, detectWatermark, DetectorContext } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, addNoise } from './test_utils.js';

describe('DetectorContext Buffer Management', () => {
    test('Blur buffer allocated on first noiseReduction call', () => {
        const ctx = new DetectorContext();
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);

        assert.strictEqual(ctx._blurBuffer, undefined);

        detectWatermark(img, { '96': alphaMap }, { noiseReduction: true, deepScan: false }, ctx);

        assert.ok(ctx._blurBuffer instanceof Uint8ClampedArray);
        assert.strictEqual(ctx._blurBuffer.length, 200 * 200 * 4);
    });

    test('Blur buffer reused for same-size images', () => {
        const ctx = new DetectorContext();
        const img1 = createMockImageData(100, 100, 'noise', 128);
        const img2 = createMockImageData(100, 100, 'solid', 64);
        const alphaMap = createMockAlphaMap(48, 48);

        detectWatermark(img1, { '48': alphaMap }, { noiseReduction: true, deepScan: false }, ctx);
        const buffer1 = ctx._blurBuffer;

        detectWatermark(img2, { '48': alphaMap }, { noiseReduction: true, deepScan: false }, ctx);
        const buffer2 = ctx._blurBuffer;

        assert.strictEqual(buffer1, buffer2);
    });

    test('Blur buffer reallocated when image size changes', () => {
        const ctx = new DetectorContext();
        const smallImg = createMockImageData(50, 50, 'noise', 128);
        const largeImg = createMockImageData(200, 200, 'solid', 64);
        const smallAlpha = createMockAlphaMap(24, 24);
        const largeAlpha = createMockAlphaMap(96, 96);

        detectWatermark(smallImg, { '24': smallAlpha }, { noiseReduction: true, deepScan: false }, ctx);
        const buffer1 = ctx._blurBuffer;

        detectWatermark(largeImg, { '96': largeAlpha }, { noiseReduction: true, deepScan: false }, ctx);
        const buffer2 = ctx._blurBuffer;

        assert.ok(buffer1.length < buffer2.length);
    });

    test('Noise reduction does not break detection on clean images', () => {
        const ctx = new DetectorContext();
        const img = createMockImageData(200, 200, 'solid', 128);
        const alphaMap = createMockAlphaMap(96, 96);

        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);

        const withoutNR = detectWatermark(img, { '96': alphaMap }, { noiseReduction: false, deepScan: false }, ctx);
        const withNR = detectWatermark(img, { '96': alphaMap }, { noiseReduction: true, deepScan: false }, ctx);

        assert.ok(withoutNR || withNR);
        if (withoutNR && withNR) {
            assert.ok(Math.abs(withoutNR.confidence - withNR.confidence) < 0.5);
        }
    });

    test('reset clears all buffers', () => {
        const ctx = new DetectorContext();
        const img = createMockImageData(100, 100, 'solid', 128);
        const alphaMap = createMockAlphaMap(48, 48);

        detectWatermark(img, { '48': alphaMap }, { deepScan: true }, ctx);

        assert.ok(ctx._blurBuffer || ctx._sharedGradientsI);

        ctx.reset();

        assert.strictEqual(ctx._blurBuffer, null);
        assert.strictEqual(ctx._sharedGradientsI, null);
        assert.strictEqual(ctx._sharedGradientsA, null);
    });

    test('Gradient buffers reused across calls with same watermark size', () => {
        const ctx = new DetectorContext();
        const img = createMockImageData(200, 200, 'grid', 128);
        const alphaMap = createMockAlphaMap(96, 96);

        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);

        detectWatermark(img, { '96': alphaMap }, { deepScan: true }, ctx);
        const buffer1 = ctx._sharedGradientsI;

        detectWatermark(img, { '96': alphaMap }, { deepScan: true }, ctx);
        const buffer2 = ctx._sharedGradientsI;

        assert.ok(buffer1);
        assert.strictEqual(buffer1, buffer2);
    });
});
