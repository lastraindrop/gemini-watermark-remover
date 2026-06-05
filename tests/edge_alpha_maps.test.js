/**
 * Edge Alpha Map Tests — empty, full-white, NaN, and single-pixel alpha maps.
 * Covers gap: removeWatermark behavior with degenerate alpha map inputs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { createMockImageData } from './test_utils.js';

describe('Edge Alpha Maps', () => {

    test('All-zero alpha map leaves pixels unchanged', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = new Float32Array(48 * 48).fill(0);
        const original = new Uint8ClampedArray(img.data);
        removeWatermark(img, alphaMap, { x: 10, y: 10, width: 48, height: 48 });
        for (let i = 0; i < img.data.length; i += 4) {
            assert.strictEqual(img.data[i], original[i], `Pixel ${i} changed with zero alpha`);
        }
    });

    test('All-white alpha map (1.0) should not produce NaN', () => {
        const img = createMockImageData(100, 100, 'solid', 50);
        const alphaMap = new Float32Array(48 * 48).fill(1.0);
        assert.doesNotThrow(() => {
            removeWatermark(img, alphaMap, { x: 10, y: 10, width: 48, height: 48 });
        });
        for (let i = 0; i < img.data.length; i++) {
            assert.ok(Number.isFinite(img.data[i]), `NaN at index ${i}`);
        }
    });

    test('Very small alpha below noise floor is skipped', () => {
        const img = createMockImageData(50, 50, 'solid', 100);
        const alphaMap = new Float32Array(20 * 20).fill(0.001);
        const original = new Uint8ClampedArray(img.data);
        removeWatermark(img, alphaMap, { x: 5, y: 5, width: 20, height: 20 });
        for (let i = 5; i < 25; i++) {
            const idx = ((15 * 50 + i) << 2);
            assert.strictEqual(img.data[idx], original[idx]);
        }
    });

    test('NaN in alpha map is skipped gracefully', () => {
        const img = createMockImageData(100, 100, 'solid', 128);
        const alphaMap = new Float32Array(48 * 48).fill(0.5);
        alphaMap[100] = NaN;
        assert.doesNotThrow(() => {
            removeWatermark(img, alphaMap, { x: 10, y: 10, width: 48, height: 48 });
        });
        for (let i = 0; i < img.data.length; i++) {
            assert.ok(Number.isFinite(img.data[i]), `NaN produced at index ${i}`);
        }
    });

    test('1x1 alpha map processes single pixel', () => {
        const img = createMockImageData(50, 50, 'solid', 100);
        const alphaMap = new Float32Array(1).fill(0.5);
        const idx = (10 * 50 + 10) << 2;
        const original = img.data[idx];
        const wm = Math.round(0.5 * 255 + 0.5 * original);
        img.data[idx] = wm; img.data[idx + 1] = wm; img.data[idx + 2] = wm;
        assert.doesNotThrow(() => {
            removeWatermark(img, alphaMap, { x: 10, y: 10, width: 1, height: 1 });
        });
        assert.ok(Math.abs(img.data[idx] - original) <= 5, '1x1 removal should restore original');
    });

    test('calculateAlphaMap produces [0,1] for random 100x100 input', () => {
        const data = new Uint8ClampedArray(100 * 100 * 4);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 256 | 0;
        const result = calculateAlphaMap({ width: 100, height: 100, data });
        for (let i = 0; i < result.length; i++) {
            assert.ok(result[i] >= 0 && result[i] <= 1, `Out of range at ${i}: ${result[i]}`);
        }
    });
});
