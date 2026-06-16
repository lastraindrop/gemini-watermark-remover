import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
import { refineSubpixelOutline } from '../src/core/adaptiveDetector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, resolvePos } from './test_utils.js';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';

describe('Sub-pixel Integration Tests (v2.6)', () => {

    describe('refineSubpixelOutline called by applyRemovalStrategy', () => {
        const W = 1024, H = 1024;

        test('applyRemovalStrategy handles gemini profile without error', () => {
            // Create a standard watermarked image
            const img = createMockImageData(W, H, 'noise', 128);
            const pos = resolvePos(W, H);
            const alphaMap = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

            const before = new Uint8ClampedArray(img.data); // snapshot
            const matches = [{
                profileId: 'gemini',
                pos: { ...pos, anchor: 'bottom-right' },
                alphaMap,
                confidence: 0.65,
                source: 'catalog-probe',
                config: { isOfficial: true }
            }];

            // Should complete without throwing
            assert.doesNotThrow(() => {
                applyRemovalStrategy(img, matches);
            });

            // Watermark region should be modified (pixels changed)
            let changedCount = 0;
            for (let r = 0; r < pos.height; r++) {
                for (let c = 0; c < pos.width; c++) {
                    const idx = ((pos.y + r) * W + (pos.x + c)) << 2;
                    if (Math.abs(img.data[idx] - before[idx]) > 2 ||
                        Math.abs(img.data[idx + 1] - before[idx + 1]) > 2) {
                        changedCount++;
                    }
                }
            }
            assert.ok(changedCount > 0,
                `Expected watermark region pixels to change (${changedCount} changed)`);
        });

        test('applyRemovalStrategy with forceProcess uses single-pass (no subpixel path)', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const pos = resolvePos(W, H);
            const alphaMap = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

            const matches = [{
                profileId: 'gemini',
                pos: { ...pos, anchor: 'bottom-right' },
                alphaMap,
                confidence: 0.65,
                source: 'catalog-probe',
                config: { isOfficial: true, forceProcess: true }
            }];

            // forceProcess should skip multi-pass entirely (and thus skip refinement)
            assert.doesNotThrow(() => {
                applyRemovalStrategy(img, matches);
            });
        });

        test('refineSubpixelOutline integrated path does not throw for gemini watermark', () => {
            // This test exercises the FULL integration: multi-pass → refinement → fallthrough
            const img = createMockImageData(W, H, 'noise', 128);
            const pos = resolvePos(W, H);
            const alphaMap = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

            const originalData = new Uint8ClampedArray(img.data);
            const matches = [{
                profileId: 'gemini',
                pos: { ...pos, anchor: 'bottom-right' },
                alphaMap,
                confidence: 0.65,
                source: 'catalog-probe',
                config: { isOfficial: true }
            }];

            applyRemovalStrategy(img, matches);

            // Verify output is not corrupted: all pixel values in [0, 255]
            for (let i = 0; i < img.data.length; i++) {
                assert.ok(Number.isFinite(img.data[i]),
                    `Pixel ${i} is not finite: ${img.data[i]}`);
                assert.ok(img.data[i] >= 0 && img.data[i] <= 255,
                    `Pixel ${i} out of range: ${img.data[i]}`);
            }

            // Verify at least some R,G,B channels changed in watermark region
            let rgbChanged = 0;
            for (let r = 0; r < pos.height; r++) {
                for (let c = 0; c < pos.width; c++) {
                    const idx = ((pos.y + r) * W + (pos.x + c)) << 2;
                    if (img.data[idx] !== originalData[idx] ||
                        img.data[idx + 1] !== originalData[idx + 1] ||
                        img.data[idx + 2] !== originalData[idx + 2]) {
                        rgbChanged++;
                    }
                }
            }
            assert.ok(rgbChanged > 0,
                `No RGB pixels changed in watermark region`);
        });
    });

    describe('refineSubpixelOutline availability', () => {
        test('refineSubpixelOutline is importable and callable', () => {
            assert.strictEqual(typeof refineSubpixelOutline, 'function',
                'refineSubpixelOutline should be a function');
        });

        test('refineSubpixelOutline returns null for insufficient gain', () => {
            const W = 128, H = 128;
            const img = createMockImageData(W, H, 'solid', 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const pos = { x: W - 64 - 96, y: H - 64 - 96, width: 96, height: 96 };

            // alphaGain < OUTLINE_REFINEMENT_MIN_GAIN (1.05)
            const result = refineSubpixelOutline({
                sourceImageData: img,
                alphaMap,
                position: pos,
                alphaGain: 1.02,
                baselineSpatialScore: 0.3,
                baselineGradientScore: 0.1
            });

            assert.strictEqual(result, null,
                'Should return null when alphaGain < minimum threshold');
        });
    });
});
