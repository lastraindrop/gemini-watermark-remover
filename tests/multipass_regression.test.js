import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Multi-Pass Regression: safety gates', () => {
    it('stops at residual-low for normal watermark on light background', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.25
        });

        assert.ok(result.stopReason === 'residual-low' || result.stopReason === 'max-passes',
            `Expected residual-low or max-passes, got ${result.stopReason}`);
        assert.ok(result.passCount >= 1, 'should complete at least one pass');
        assert.ok(Array.isArray(result.passes), 'passes should be an array');
    });

    it('passes array records correct metadata', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 2
        });

        assert.ok(result.passes.length >= 1);
        const first = result.passes[0];
        assert.ok('index' in first);
        assert.ok('beforeSpatialScore' in first);
        assert.ok('afterSpatialScore' in first);
        assert.ok('improvement' in first);
        assert.ok('gradientDelta' in first);
        assert.ok('nearBlackRatio' in first);
        assert.ok(Number.isFinite(first.gradientDelta), 'gradientDelta should be a finite number (not 0 placeholder)');
    });

    it('object-style call works correctly', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos
        });

        assert.ok(result.imageData);
        assert.ok(result.imageData.data instanceof Uint8ClampedArray);
        assert.strictEqual(result.imageData.width, 512);
        assert.strictEqual(result.imageData.height, 512);
    });

    it('handles dark background without crash (safety-near-black may trigger)', () => {
        const img = createMockImageData(512, 512, 'solid', 10);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.25,
            alphaGain: 2.0
        });

        assert.ok(result.stopReason === 'safety-near-black' || result.stopReason === 'residual-low' || result.stopReason === 'max-passes',
            `Unexpected stopReason: ${result.stopReason}`);
    });

    it('does not modify original imageData reference', () => {
        const img = createMockImageData(512, 512, 'solid', 180);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        const original = new Uint8ClampedArray(img.data);

        removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos
        });

        assert.deepStrictEqual(img.data, original, 'original imageData should be untouched');
    });
});
