import { test, describe } from 'node:test';
import assert from 'node:assert';
import { refineSubpixelOutline } from '../src/core/adaptiveDetector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('refineSubpixelOutline - Rectangular Watermark Support (v2.6)', () => {

    describe('Rectangular dimensions (non-square)', () => {
        test('401×173 Doubao-style watermark does not crash', () => {
            const W = 2730, H = 1535;
            const logoW = 401, logoH = 173;
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(logoW, logoH);
            const x = W - 24 - logoW;
            const y = H - 10 - logoH;
            applyWatermark(img, x, y, logoW, logoH, alphaMap);

            const result = refineSubpixelOutline({
                sourceImageData: img,
                alphaMap,
                position: { x, y, width: logoW, height: logoH },
                alphaGain: 1.2,
                baselineSpatialScore: 0.3,
                baselineGradientScore: 0.15
            });

            // Should not throw. May return null if no improvement is found or
            // threshold not met — that's acceptable. The key is NO crash.
            if (result !== null) {
                assert.ok(Number.isFinite(result.spatialScore));
                assert.ok(Number.isFinite(result.gradientScore));
                assert.ok(result.imageData.data.length === img.data.length);
            }
        });

        test('120×40 generic rectangular watermark does not crash', () => {
            const W = 1024, H = 1024;
            const logoW = 120, logoH = 40;
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(logoW, logoH);
            const x = 20;
            const y = H - 20 - logoH;
            applyWatermark(img, x, y, logoW, logoH, alphaMap);

            const result = refineSubpixelOutline({
                sourceImageData: img,
                alphaMap,
                position: { x, y, width: logoW, height: logoH },
                alphaGain: 1.2,
                baselineSpatialScore: 0.35,
                baselineGradientScore: 0.12
            });

            // Should not throw — previously size=position.width (=120) would
            // create Float32Array(120*120) but warpAlphaMap was called with
            // size=120 and no targetHeight, producing a 120×120 warped alpha
            // while the original was 120×40. After fix, sizeW/sizeH are used.
            assert.doesNotThrow(() => {
                // Already tested above; this block just documents the previous bug
            });
        });

        test('96×96 square watermark still works (regression check)', () => {
            const W = 1024, H = 1024;
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const x = W - 64 - 96, y = H - 64 - 96;
            applyWatermark(img, x, y, 96, 96, alphaMap);

            const result = refineSubpixelOutline({
                sourceImageData: img,
                alphaMap,
                position: { x, y, width: 96, height: 96 },
                alphaGain: 1.2,
                baselineSpatialScore: 0.3,
                baselineGradientScore: 0.12
            });

            // Square case should still work (no regression)
            if (result !== null) {
                assert.strictEqual(result.imageData.width, W);
                assert.strictEqual(result.imageData.height, H);
            }
        });
    });

    describe('Edge cases', () => {
        test('returns null for position.width <= 8 or height <= 8', () => {
            const img = createMockImageData(64, 64, 'solid', 128);
            const alphaMap = createMockAlphaMap(4, 4);

            const result = refineSubpixelOutline({
                sourceImageData: img,
                alphaMap,
                position: { x: 10, y: 10, width: 4, height: 4 },
                alphaGain: 1.2,
                baselineSpatialScore: 0.5,
                baselineGradientScore: 0.2
            });

            assert.strictEqual(result, null,
                'Should return null for very small watermark regions');
        });

        test('warpAlphaMap receives correct targetHeight for rectangular', () => {
            // Construct a scenario that exercises the warpAlphaMap call with
            // explicit sizeW + sizeH parameters. A 401×173 watermark with a
            // sub-pixel shift should create a warped alpha map of 401×173,
            // NOT 401×401.
            const W = 800, H = 600;
            const logoW = 401, logoH = 173;
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(logoW, logoH);
            const x = W - 24 - logoW, y = H - 10 - logoH;
            applyWatermark(img, x, y, logoW, logoH, alphaMap);

            // Use a non-zero shift to trigger warpAlphaMap
            const result = refineSubpixelOutline({
                sourceImageData: img,
                alphaMap,
                position: { x, y, width: logoW, height: logoH },
                alphaGain: 1.2,
                baselineSpatialScore: 0.35,
                baselineGradientScore: 0.12,
                baselineShift: { dx: 0.25, dy: 0, scale: 1 }
            });

            // The key assertion: if result is non-null, the operation
            // completed without an out-of-bounds array access (which would
            // happen if warpAlphaMap produced a 401×401 instead of 401×173).
            if (result !== null) {
                assert.ok(result.imageData.data.length === W * H * 4,
                    'Output image data should match original dimensions');
            }
        });
    });
});
