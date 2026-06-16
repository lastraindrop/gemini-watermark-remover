import { test, describe } from 'node:test';
import assert from 'node:assert';
import { estimateAlphaGain } from '../src/core/applyRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('estimateAlphaGain — Center-Pixel Robustness (v2.6)', () => {

    describe('Low center-alpha template', () => {
        /**
         * Constructs an alpha map where the center pixel (normally used as
         * the template-alpha reference by estimateAlphaGain) is very low,
         * but the watermark alpha is actually present in the surrounding region.
         * This simulates misaligned or atypical templates.
         */
        function createOffCenterAlphaMap(w, h) {
            const alphaMap = new Float32Array(w * h).fill(0);
            const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
            // Place a low value at exact center
            alphaMap[cy * w + cx] = 0.005;
            // Place substantial alpha values in a ring around center
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const dx = c - cx, dy = r - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist >= 4 && dist <= 20) {
                        alphaMap[r * w + c] = 0.6;
                    }
                }
            }
            return alphaMap;
        }

        test('returns gain=1.0 when center template alpha is near zero', () => {
            const W = 512, H = 512;
            const img = createMockImageData(W, H, 'noise', 128);
            const offCenterMap = createOffCenterAlphaMap(96, 96);
            const x = W - 64 - 96, y = H - 64 - 96;
            applyWatermark(img, x, y, 96, 96, offCenterMap);

            const gain = estimateAlphaGain(img, offCenterMap, { x, y, width: 96, height: 96 });

            // When center alpha ≤ 0.01, estimateAlphaGain returns 1.0 (no adjustment).
            // This is the current behavior — we want to document it and ensure it's
            // stable (not NaN, not negative, not zero).
            assert.strictEqual(gain, 1,
                `Center-alpha-gated return should be exactly 1, got ${gain}`);
            assert.ok(Number.isFinite(gain));
        });
    });

    describe('Center-alpha at boundary values', () => {
        function createCenteredAlphaMap(w, h, centerVal) {
            const alphaMap = new Float32Array(w * h).fill(0);
            const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
            alphaMap[cy * w + cx] = centerVal;
            // Surrounding ring with moderate values
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const dx = c - cx, dy = r - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist >= 4 && dist <= 20) {
                        alphaMap[r * w + c] = 0.5;
                    }
                }
            }
            return alphaMap;
        }

        test('estimateAlphaGain works for exact-boundary center alpha (0.01)', () => {
            const W = 512, H = 512;
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createCenteredAlphaMap(96, 96, 0.01);
            const x = W - 64 - 96, y = H - 64 - 96;
            applyWatermark(img, x, y, 96, 96, alphaMap);

            const gain = estimateAlphaGain(img, alphaMap, { x, y, width: 96, height: 96 });

            // With center alpha exactly 0.01 (≤ 0.01), returns 1
            assert.strictEqual(gain, 1,
                `Boundary center alpha should trigger gating, got ${gain}`);
        });

        test('estimateAlphaGain returns adjusted value for normal center alpha', () => {
            const W = 512, H = 512;
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createCenteredAlphaMap(96, 96, 0.6);
            const x = W - 64 - 96, y = H - 64 - 96;
            applyWatermark(img, x, y, 96, 96, alphaMap);

            const gain = estimateAlphaGain(img, alphaMap, { x, y, width: 96, height: 96 });

            // With substantial center alpha, should compute actual gain
            assert.ok(Number.isFinite(gain));
            assert.ok(gain >= 0.01 && gain <= 2.0,
                `Gain should be in [0.01, 2.0], got ${gain}`);
        });
    });

    describe('Edge inputs', () => {
        test('returns 1.0 when totalWeight is zero (no alpha > 0.15)', () => {
            const W = 256, H = 256;
            const img = createMockImageData(W, H, 'solid', 128);

            // Alpha map where ALL values are below the 0.15 threshold
            const alphaMap = new Float32Array(48 * 48).fill(0.10);

            const gain = estimateAlphaGain(img, alphaMap, {
                x: W - 32 - 48, y: H - 32 - 48, width: 48, height: 48
            });

            assert.strictEqual(gain, 1,
                `Zero totalWeight should gate to 1, got ${gain}`);
        });

        test('returns 1.0 when background pixel count is too low', () => {
            // Create a very small alpha map with >0.15 values covering almost
            // the entire area, leaving fewer than 10 background pixels.
            const W = 64, H = 64;
            const img = createMockImageData(W, H, 'solid', 128);
            const alphaMap = new Float32Array(4 * 4).fill(0.2);  // all > 0.15

            const gain = estimateAlphaGain(img, alphaMap, {
                x: 10, y: 10, width: 4, height: 4
            });

            assert.strictEqual(gain, 1,
                `Low background count should gate to 1, got ${gain}`);
        });

        test('returns 1.0 when estAlpha is near zero', () => {
            const W = 256, H = 256;
            // Nearly identical luminance → estAlpha ≈ 0
            const img = createMockImageData(W, H, 'solid', 200);
            const alphaMap = createMockAlphaMap(48, 48);
            const x = W - 32 - 48, y = H - 32 - 48;
            // Apply very faint watermark
            applyWatermark(img, x, y, 48, 48, alphaMap, 200);  // logoValue close to bg

            const gain = estimateAlphaGain(img, alphaMap, { x, y, width: 48, height: 48 });

            assert.ok(Number.isFinite(gain));
            // estAlpha might be 0, so gain should clamp to at least 0.01
            assert.ok(gain >= 0.01 && gain <= 2.0,
                `Gain should be clamped to [0.01, 2.0], got ${gain}`);
        });
    });
});
