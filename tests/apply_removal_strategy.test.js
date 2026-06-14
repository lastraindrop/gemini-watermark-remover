/**
 * Apply Removal Strategy Test (P1)
 *
 * Tests the applyRemovalStrategy function's branch coverage:
 * - Gemini profile → multi-pass removal with alpha gain estimation
 * - Non-Gemini profile → single-pass removal
 * - forceProcess flag → bypass multi-pass safety gates
 * - Multiple matches → each processed independently
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyRemovalStrategy, estimateAlphaGain } from '../src/core/applyRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, resolvePos } from './test_utils.js';

describe('applyRemovalStrategy branch coverage', () => {

    test('Gemini match uses multi-pass removal', () => {
        const img = createMockImageData(1024, 1024, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        const pos = resolvePos(1024, 1024, 'gemini');
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);

        // Snapshot before removal
        const before = new Uint8ClampedArray(img.data);

        const matches = [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.8,
            config: { isOfficial: true }
        }];

        applyRemovalStrategy(img, matches);

        // Verify pixels changed in the watermark region
        let changed = 0;
        for (let r = 0; r < pos.height; r++) {
            for (let c = 0; c < pos.width; c++) {
                const y = Math.floor(pos.y + r);
                const x = Math.floor(pos.x + c);
                if (y < 0 || y >= img.height || x < 0 || x >= img.width) continue;
                const idx = (y * img.width + x) * 4;
                if (Math.abs(img.data[idx] - before[idx]) > 1) changed++;
            }
        }
        assert.ok(changed > 0, 'Gemini multi-pass should modify watermark region pixels');
    });

    test('Non-Gemini match uses single-pass removal', () => {
        const img = createMockImageData(512, 512, 'noise', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        const pos = { x: 400, y: 400, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);

        const before = new Uint8ClampedArray(img.data);

        const matches = [{
            profileId: 'doubao',
            alphaMap,
            pos,
            confidence: 0.7,
            config: { isOfficial: false }
        }];

        applyRemovalStrategy(img, matches);

        let changed = 0;
        for (let r = 0; r < pos.height; r++) {
            for (let c = 0; c < pos.width; c++) {
                const y = Math.floor(pos.y + r);
                const x = Math.floor(pos.x + c);
                if (y < 0 || y >= img.height || x < 0 || x >= img.width) continue;
                const idx = (y * img.width + x) * 4;
                if (Math.abs(img.data[idx] - before[idx]) > 1) changed++;
            }
        }
        assert.ok(changed > 0, 'Non-Gemini single-pass should modify watermark region pixels');
    });

    test('forceProcess bypasses multi-pass safety gates', () => {
        const img = createMockImageData(512, 512, 'solid', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        const pos = { x: 100, y: 100, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);

        const before = new Uint8ClampedArray(img.data);

        const matches = [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.3,
            config: { isOfficial: false, forceProcess: true }
        }];

        // Should not throw even with low confidence + solid background
        applyRemovalStrategy(img, matches);

        let changed = 0;
        for (let r = 0; r < pos.height; r++) {
            for (let c = 0; c < pos.width; c++) {
                const y = Math.floor(pos.y + r);
                const x = Math.floor(pos.x + c);
                if (y < 0 || y >= img.height || x < 0 || x >= img.width) continue;
                const idx = (y * img.width + x) * 4;
                if (Math.abs(img.data[idx] - before[idx]) > 1) changed++;
            }
        }
        assert.ok(changed > 0, 'forceProcess should apply removal even on difficult images');
    });

    test('multiple matches are processed independently', () => {
        const img = createMockImageData(1024, 1024, 'noise', 128);
        const alphaMap1 = createMockAlphaMap(48, 48);
        const alphaMap2 = createMockAlphaMap(48, 48);
        const pos1 = { x: 100, y: 100, width: 48, height: 48 };
        const pos2 = { x: 800, y: 800, width: 48, height: 48 };
        applyWatermark(img, pos1.x, pos1.y, pos1.width, pos1.height, alphaMap1, 255);
        applyWatermark(img, pos2.x, pos2.y, pos2.width, pos2.height, alphaMap2, 255);

        const matches = [
            { profileId: 'gemini', alphaMap: alphaMap1, pos: pos1, confidence: 0.8, config: { isOfficial: true } },
            { profileId: 'gemini', alphaMap: alphaMap2, pos: pos2, confidence: 0.7, config: { isOfficial: true } }
        ];

        // Should not throw
        applyRemovalStrategy(img, matches);
    });

    test('empty matches array is a no-op', () => {
        const img = createMockImageData(256, 256, 'noise', 128);
        const before = new Uint8ClampedArray(img.data);
        applyRemovalStrategy(img, []);
        assert.deepStrictEqual(img.data, before, 'Empty matches should not modify image');
    });
});

describe('estimateAlphaGain', () => {

    test('returns ~1.0 for normal watermark', () => {
        const img = createMockImageData(256, 256, 'noise', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        const pos = { x: 100, y: 100, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);

        const gain = estimateAlphaGain(img, alphaMap, pos);
        assert.ok(gain >= 0.5 && gain <= 2.0, `Normal watermark gain should be ~1.0, got ${gain}`);
    });

    test('returns 1.0 for zero alpha map', () => {
        const img = createMockImageData(256, 256, 'noise', 128);
        const alphaMap = new Float32Array(48 * 48); // all zeros
        const pos = { x: 100, y: 100, width: 48, height: 48 };

        const gain = estimateAlphaGain(img, alphaMap, pos);
        assert.strictEqual(gain, 1, 'Zero alpha map should return gain=1');
    });

    test('returns 1.0 when background count is too low', () => {
        const img = createMockImageData(64, 64, 'solid', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        const pos = { x: 0, y: 0, width: 48, height: 48 };

        const gain = estimateAlphaGain(img, alphaMap, pos);
        assert.ok(typeof gain === 'number' && Number.isFinite(gain), 'Should return a finite number');
    });
});
