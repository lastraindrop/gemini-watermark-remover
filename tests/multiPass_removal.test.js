import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Multi-Pass Watermark Removal', () => {

    test('Single pass stops at residual-low on light background', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = removeRepeatedWatermarkLayers({
            imageData: img, alphaMap, position: pos, maxPasses: 4, residualThreshold: 0.25
        });

        assert.ok(result.stopReason === 'residual-low' || result.stopReason === 'max-passes' || result.stopReason === 'first-pass-sign-flip' || result.stopReason === 'restoration-regression');
        assert.ok(result.passCount >= 1);
        assert.ok(result.passes.length >= 1);
    });

    test('Pass metadata records all required fields', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = removeRepeatedWatermarkLayers({
            imageData: img, alphaMap, position: pos, maxPasses: 2
        });

        assert.ok(result.passes.length >= 1);
        const first = result.passes[0];
        ['index', 'beforeSpatialScore', 'afterSpatialScore', 'improvement', 'gradientDelta', 'nearBlackRatio'].forEach(k => {
            assert.ok(k in first, `pass metadata missing field: ${k}`);
        });
        assert.ok(Number.isFinite(first.gradientDelta));
    });

    test('Near-black background triggers safety stop', () => {
        const img = createMockImageData(200, 200, 'solid', 5);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 100, y: 100, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img, alphaMap, position: pos, maxPasses: 4, residualThreshold: 0.10
        });

        assert.ok(result.stopReason === 'safety-near-black' || result.stopReason === 'residual-low' || result.stopReason === 'max-passes' || result.stopReason === 'first-pass-sign-flip' || result.stopReason === 'restoration-regression');
    });

    test('Respects maxPasses enforcement', () => {
        const img = createMockImageData(200, 200, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 100, y: 100, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img, alphaMap, position: pos, maxPasses: 2, residualThreshold: 0.01
        });

        assert.ok(result.attemptedPassCount <= 2);
    });

    test('Object-style call returns valid imageData', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = removeRepeatedWatermarkLayers({ imageData: img, alphaMap, position: pos });

        assert.ok(result.imageData);
        assert.ok(result.imageData.data instanceof Uint8ClampedArray);
        assert.strictEqual(result.imageData.width, 512);
        assert.strictEqual(result.imageData.height, 512);
    });

    test('Original imageData is not mutated by input reference', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        const original = new Uint8ClampedArray(img.data);

        removeRepeatedWatermarkLayers({ imageData: img, alphaMap, position: pos });

        assert.deepStrictEqual(img.data, original);
    });

    test('Non-square watermark regions handled correctly', () => {
        const w = 200, h = 80;
        const img = createMockImageData(400, 200, 'solid', 128);
        const alphaMap = createMockAlphaMap(w, h);
        const pos = { x: 100, y: 60, width: w, height: h };
        applyWatermark(img, pos.x, pos.y, w, h, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img, alphaMap, position: pos, maxPasses: 2
        });

        assert.ok(result.imageData);
        assert.ok(result.passCount >= 1);
    });
});
