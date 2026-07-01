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
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
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

    test('NMS keeps low-confidence matches when they are spatially independent', () => {
        const img = createMockImageData(512, 512, 'solid', 96);
        const alphaMap1 = createMockAlphaMap(48, 48);
        const alphaMap2 = createMockAlphaMap(48, 48);
        const pos1 = { x: 24, y: 24, width: 48, height: 48 };
        const pos2 = { x: 420, y: 420, width: 48, height: 48 };
        applyWatermark(img, pos1.x, pos1.y, pos1.width, pos1.height, alphaMap1, 255);
        applyWatermark(img, pos2.x, pos2.y, pos2.width, pos2.height, alphaMap2, 255);

        const before = new Uint8ClampedArray(img.data);
        const matches = [
            { profileId: 'unknown-profile', alphaMap: alphaMap1, pos: pos1, confidence: 0.9, config: {} },
            { profileId: 'unknown-profile', alphaMap: alphaMap2, pos: pos2, confidence: 0.3, config: {} }
        ];

        applyRemovalStrategy(img, matches);

        let secondRegionChanged = 0;
        for (let r = 0; r < pos2.height; r++) {
            for (let c = 0; c < pos2.width; c++) {
                const idx = ((pos2.y + r) * img.width + pos2.x + c) << 2;
                if (Math.abs(img.data[idx] - before[idx]) > 1) secondRegionChanged++;
            }
        }
        assert.ok(secondRegionChanged > 0, 'NMS must not drop a non-overlapping lower-confidence watermark');
    });

    test('standard Gemini watermark uses physical alpha gain and avoids bright residue', () => {
        const img = createMockImageData(512, 512, 'grid', 100);
        const original = new Uint8ClampedArray(img.data);
        const alphaMap = createMockAlphaMap(48, 48);
        const pos = { x: 432, y: 432, width: 48, height: 48, anchor: 'bottom-right' };
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);

        applyRemovalStrategy(img, [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.48,
            config: { logoSize: 48, marginRight: 32, marginBottom: 32, isOfficial: true }
        }]);

        let maxDiff = 0;
        for (let r = 0; r < pos.height; r++) {
            for (let c = 0; c < pos.width; c++) {
                const idx = ((pos.y + r) * img.width + pos.x + c) << 2;
                maxDiff = Math.max(maxDiff, Math.abs(img.data[idx] - original[idx]));
            }
        }
        assert.ok(maxDiff <= 50, `standard Gemini removal should not leave bright residue, maxDiff=${maxDiff}`);
    });

    test('standard Doubao rectangular watermark does not use underestimated alpha gain', () => {
        const img = createMockImageData(768, 432, 'grid', 96);
        const original = new Uint8ClampedArray(img.data);
        const alphaMap = createMockAlphaMap(120, 52);
        const pos = { x: 38, y: 25, width: 120, height: 52, anchor: 'top-left' };
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);

        applyRemovalStrategy(img, [{
            profileId: 'doubao',
            alphaMap,
            pos,
            confidence: 0.52,
            config: { logoWidth: 120, logoHeight: 52, marginLeft: 38, marginTop: 25, anchor: 'top-left', isOfficial: true }
        }]);

        const centerX = Math.floor(pos.x + pos.width / 2);
        const centerY = Math.floor(pos.y + pos.height / 2);
        const idx = (centerY * img.width + centerX) << 2;
        assert.ok(Math.abs(img.data[idx] - original[idx]) <= 12,
            `standard Doubao removal should restore center pixel, diff=${img.data[idx] - original[idx]}`);
    });

    test('empty matches array is a no-op', () => {
        const img = createMockImageData(256, 256, 'noise', 128);
        const before = new Uint8ClampedArray(img.data);
        applyRemovalStrategy(img, []);
        assert.deepStrictEqual(img.data, before, 'Empty matches should not modify image');
    });
});
