import { test, describe } from 'node:test';
import assert from 'node:assert';
import { removeWatermark, ALPHA_THRESHOLD } from '../src/core/blendModes.js';
import { createMockImageData, applyWatermark } from './test_utils.js';

const ALPHA_NOISE_FLOOR = 3 / 255;

describe('Blend Modes — Precision, Boundaries & Noise Floor', () => {

    describe('Pixel reconstruction accuracy', () => {
        test('Standard α=0.5 restores original', () => {
            const size = 48;
            const alphaMap = new Float32Array(size * size).fill(0.5);
            const originalColor = 100;
            const img = createMockImageData(100, 100, 'solid', originalColor);
            applyWatermark(img, 10, 10, size, size, alphaMap);
            const pos = { x: 10, y: 10, width: size, height: size };
            removeWatermark(img, alphaMap, pos);
            const idx = (11 * 100 + 11) << 2;
            assert.ok(Math.abs(img.data[idx] - originalColor) <= 5,
                `Expected ~100, got ${img.data[idx]}`);
        });

        test('Zero alpha => pixels unchanged', () => {
            const img = createMockImageData(100, 100, 'solid', 150);
            const alphaMap = new Float32Array(48 * 48).fill(0);
            const original = new Uint8ClampedArray(img.data);
            removeWatermark(img, alphaMap, { x: 10, y: 10, width: 48, height: 48 });
            assert.deepStrictEqual(img.data, original);
        });

        test('Extreme alpha (0.98) reconstructs within tolerance', () => {
            const alphaMap = new Float32Array(48 * 48).fill(0.98);
            const originalColor = 50;
            const img = createMockImageData(100, 100, 'solid', originalColor);
            applyWatermark(img, 0, 0, 48, 48, alphaMap);
            removeWatermark(img, alphaMap, { x: 0, y: 0, width: 48, height: 48 });
            assert.ok(Math.abs(img.data[0] - originalColor) <= 15,
                `Expected ~50, got ${img.data[0]}`);
        });

        test('Multi-channel independence (R/G/B different values)', () => {
            const alphaMap = new Float32Array(10 * 10).fill(0.5);
            const img = createMockImageData(10, 10, 'solid', 0);
            const idx = (5 * 10 + 5) << 2;
            img.data[idx] = 100;  img.data[idx + 1] = 150;  img.data[idx + 2] = 200;
            const originalColors = [100, 150, 200];
            applyWatermark(img, 0, 0, 10, 10, alphaMap);
            removeWatermark(img, alphaMap, { x: 0, y: 0, width: 10, height: 10 });
            for (let c = 0; c < 3; c++) {
                assert.ok(Math.abs(img.data[idx + c] - originalColors[c]) <= 2,
                    `Channel ${c}: expected ~${originalColors[c]}, got ${img.data[idx + c]}`);
            }
        });
    });

    describe('Boundary safety', () => {
        test('Negative coordinates — no crash, in-bound pixels processed', () => {
            const alphaMap = new Float32Array(48 * 48).fill(0.5);
            const img = createMockImageData(100, 100, 'solid', 128);
            const original = new Uint8ClampedArray(img.data);
            assert.doesNotThrow(() => removeWatermark(img, alphaMap, { x: -10, y: -10, width: 48, height: 48 }));
            // Pixels at (0,0) within overlapping region should be modified
            assert.notStrictEqual(img.data[0], original[0]);
        });
    });

    describe('Noise floor (ALPHA_NOISE_FLOOR = 3/255)', () => {
        test('Alpha below noise floor => pixels untouched', () => {
            const img = createMockImageData(10, 10, 'solid', 100);
            const alphaMap = new Float32Array(100).fill(ALPHA_NOISE_FLOOR / 2);
            const original = new Uint8ClampedArray(img.data);
            removeWatermark(img, alphaMap, { x: 0, y: 0, width: 10, height: 10 });
            for (let i = 0; i < img.data.length; i += 4) {
                assert.strictEqual(img.data[i], original[i]);
            }
        });

        test('Alpha at exactly noise floor => still skipped', () => {
            const img = createMockImageData(8, 8, 'solid', 128);
            const alphaMap = new Float32Array(64).fill(ALPHA_NOISE_FLOOR);
            const original = new Uint8ClampedArray(img.data);
            removeWatermark(img, alphaMap, { x: 0, y: 0, width: 8, height: 8 });
            assert.deepStrictEqual(img.data, original);
        });

        test('Alpha above noise floor => pixels processed', () => {
            const img = createMockImageData(10, 10, 'solid', 100);
            const alpha = ALPHA_NOISE_FLOOR + ALPHA_THRESHOLD + 0.01;
            const alphaMap = new Float32Array(100).fill(alpha);
            const original = new Uint8ClampedArray(img.data);
            removeWatermark(img, alphaMap, { x: 0, y: 0, width: 10, height: 10 });
            let changed = false;
            for (let i = 0; i < img.data.length; i += 4) {
                if (img.data[i] !== original[i]) { changed = true; break; }
            }
            assert.ok(changed, 'Pixels should be modified when alpha > noise floor');
        });

        test('Strong alpha (0.5) restores to original correctly', () => {
            const originalColor = 100;
            const img = createMockImageData(10, 10, 'solid', originalColor);
            const alphaMap = new Float32Array(100).fill(0.5);
            for (let i = 0; i < img.data.length; i += 4) {
                for (let c = 0; c < 3; c++) {
                    img.data[i + c] = Math.round(0.5 * 255 + 0.5 * originalColor);
                }
            }
            removeWatermark(img, alphaMap, { x: 0, y: 0, width: 10, height: 10 });
            for (let i = 0; i < img.data.length; i += 4) {
                assert.ok(Math.abs(img.data[i] - originalColor) <= 5,
                    `Expected ~${originalColor}, got ${img.data[i]}`);
            }
        });

        test('Noise floor is ~3/255 ≈ 0.01176', () => {
            assert.ok(ALPHA_NOISE_FLOOR > 0.01 && ALPHA_NOISE_FLOOR < 0.015);
        });
    });
});
