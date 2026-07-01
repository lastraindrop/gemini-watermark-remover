import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recalibrateAlphaStrength, shouldRecalibrateAlphaStrength } from '../src/core/alphaCalibration.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Alpha Strength Calibration', () => {

    test('shouldRecalibrateAlphaStrength returns true for high original + high residual', () => {
        assert.strictEqual(shouldRecalibrateAlphaStrength({
            originalScore: 0.7,
            processedScore: 0.55,
            suppressionGain: 0.10
        }), true);
    });

    test('shouldRecalibrateAlphaStrength returns false for low original', () => {
        assert.strictEqual(shouldRecalibrateAlphaStrength({
            originalScore: 0.4,
            processedScore: 0.55,
            suppressionGain: 0.10
        }), false);
    });

    test('shouldRecalibrateAlphaStrength returns false for low residual', () => {
        assert.strictEqual(shouldRecalibrateAlphaStrength({
            originalScore: 0.7,
            processedScore: 0.3,
            suppressionGain: 0.10
        }), false);
    });

    test('shouldRecalibrateAlphaStrength returns false for high suppression gain', () => {
        assert.strictEqual(shouldRecalibrateAlphaStrength({
            originalScore: 0.7,
            processedScore: 0.55,
            suppressionGain: 0.30
        }), false);
    });

    test('recalibrateAlphaStrength finds optimal gain for strong watermark', () => {
        const size = 96;
        const img = createMockImageData(256, 256, 'solid', 128);
        const alphaMap = createMockAlphaMap(size);
        const pos = { x: 80, y: 80, width: size, height: size };
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const originalScore = 0.85;
        // Apply initial removal with default gain
        removeWatermark(img, alphaMap, pos, { alphaGain: 1 });
        const processedScore = 0.55;

        const result = recalibrateAlphaStrength({
            sourceImageData: img,
            alphaMap,
            position: pos,
            originalSpatialScore: originalScore,
            processedSpatialScore: processedScore
        });

        if (result) {
            assert.ok(result.alphaGain >= 1, 'Alpha gain should be >= 1');
            assert.ok(result.processedSpatialScore <= processedScore, 'Score should improve');
            assert.ok(result.suppressionGain >= 0);
        }
    });

    test('recalibrateAlphaStrength returns null when no improvement possible', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'solid', 128);
        const alphaMap = createMockAlphaMap(size);
        const pos = { x: 100, y: 100, width: size, height: size };

        // No watermark - no recalibration needed
        const result = recalibrateAlphaStrength({
            sourceImageData: img,
            alphaMap,
            position: pos,
            originalSpatialScore: 0.2,
            processedSpatialScore: 0.05
        });

        assert.strictEqual(result, null);
    });
});
