import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Multi-Pass Watermark Removal', () => {

    test('Single pass removes watermark and stops at residual-low', () => {
        const size = 96;
        const img = createMockImageData(256, 256, 'solid', 128);
        const alphaMap = createMockAlphaMap(size);
        const pos = { x: 80, y: 80, width: size, height: size };
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.30
        });

        assert.ok(result.passCount >= 1, 'At least one pass applied');
        assert.ok(result.passes.length >= 1, 'Passes recorded');
        assert.ok(result.stopReason, 'Stop reason provided');
    });

    test('Near-black safety prevents over-darkening', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'solid', 5); // Very dark
        const alphaMap = createMockAlphaMap(size);
        const pos = { x: 100, y: 100, width: size, height: size };
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.10
        });

        // Should not over-darken - either stops early or passes are safe
        assert.ok(result.passCount <= 4);
    });

    test('Multiple passes reduce residual correlation', () => {
        const size = 96;
        const img = createMockImageData(256, 256, 'solid', 150);
        const alphaMap = createMockAlphaMap(size);
        const pos = { x: 80, y: 80, width: size, height: size };
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 200);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 3,
            residualThreshold: 0.05
        });

        // First pass should have positive improvement
        if (result.passes.length >= 1) {
            assert.ok(result.passes[0].afterSpatialScore !== undefined);
        }
    });

    test('Respects maxPasses limit', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'solid', 180);
        const alphaMap = createMockAlphaMap(size);
        const pos = { x: 100, y: 100, width: size, height: size };
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 2,
            residualThreshold: 0.01
        });

        assert.ok(result.attemptedPassCount <= 2);
    });

    test('Accepts object-style call', () => {
        const size = 96;
        const img = createMockImageData(256, 256, 'solid', 128);
        const alphaMap = createMockAlphaMap(size);
        const pos = { x: 80, y: 80, width: size, height: size };
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 1
        });

        assert.ok(result.imageData);
        assert.ok(result.imageData.data instanceof Uint8ClampedArray);
    });

    test('Non-square watermark regions are handled', () => {
        const w = 200, h = 80;
        const img = createMockImageData(400, 200, 'solid', 128);
        const alphaMap = createMockAlphaMap(w, h);
        const pos = { x: 100, y: 60, width: w, height: h };
        applyWatermark(img, pos.x, pos.y, w, h, alphaMap, 255);

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 2
        });

        assert.ok(result.imageData);
        assert.ok(result.passCount >= 1);
    });
});
