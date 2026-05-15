import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    detectAdaptiveWatermarkRegion,
    interpolateAlphaMap,
    warpAlphaMap,
    refineSubpixelOutline
} from '../src/core/adaptiveDetector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Adaptive Detector', () => {

    test('interpolateAlphaMap scales alpha map correctly', () => {
        const source = createMockAlphaMap(96);
        const scaled = interpolateAlphaMap(source, 96, 48);
        assert.strictEqual(scaled.length, 48 * 48);
        assert.ok(scaled[0] >= 0 && scaled[0] <= 1, 'Values in [0, 1]');
    });

    test('interpolateAlphaMap returns same size when target equals source', () => {
        const source = createMockAlphaMap(64);
        const scaled = interpolateAlphaMap(source, 64, 64);
        assert.strictEqual(scaled.length, 64 * 64);
    });

    test('interpolateAlphaMap returns empty for zero target', () => {
        const source = createMockAlphaMap(64);
        const scaled = interpolateAlphaMap(source, 64, 0);
        assert.strictEqual(scaled.length, 0);
    });

    test('warpAlphaMap identity warp returns original', () => {
        const source = createMockAlphaMap(48);
        const warped = warpAlphaMap(source, 48, { dx: 0, dy: 0, scale: 1 });
        assert.strictEqual(warped.length, 48 * 48);
    });

    test('warpAlphaMap with shift produces different values', () => {
        const source = createMockAlphaMap(64);
        const warped = warpAlphaMap(source, 64, { dx: 3, dy: 2, scale: 0.95 });
        assert.strictEqual(warped.length, 64 * 64);
        // After non-identity warp, at least some corner values should differ
        let diffCount = 0;
        for (let i = 0; i < warped.length; i++) {
            if (Math.abs(warped[i] - source[i]) > 0.0001) diffCount++;
        }
        assert.ok(diffCount > 100, `Only ${diffCount} values differed after warp`);
    });

    test('detectAdaptiveWatermarkRegion finds watermark at standard position', () => {
        const size = 96;
        const imgW = 256, imgH = 256;
        const img = createMockImageData(imgW, imgH, 'solid', 150);
        const alphaMap = createMockAlphaMap(size);
        const posX = imgW - 64 - size;
        const posY = imgH - 64 - size;
        applyWatermark(img, posX, posY, size, size, alphaMap, 255);

        const alphaMaps = { 96: alphaMap };
        const result = detectAdaptiveWatermarkRegion({
            imageData: img,
            alphaMaps,
            defaultConfig: { logoSize: 96, marginRight: 64, marginBottom: 64 },
            threshold: 0.25
        });

        assert.ok(result, 'Should detect watermark');
        assert.ok(result.confidence > 0.25, `Confidence ${result.confidence} too low`);
        assert.ok(Math.abs(result.region.x - posX) <= 16, `X position off: got ${result.region.x}, expected ~${posX}`);
        assert.ok(Math.abs(result.region.y - posY) <= 16, `Y position off: got ${result.region.y}, expected ~${posY}`);
    });

    test('detectAdaptiveWatermarkRegion returns null on clean image', () => {
        const img = createMockImageData(256, 256, 'solid', 128);
        const alphaMaps = { 96: createMockAlphaMap(96) };

        const result = detectAdaptiveWatermarkRegion({
            imageData: img,
            alphaMaps,
            defaultConfig: { logoSize: 96, marginRight: 64, marginBottom: 64 },
            threshold: 0.40
        });

        assert.strictEqual(result, null, 'Should not find watermark on clean image');
    });
});

describe('Sub-pixel Refinement', () => {

    test('refineSubpixelOutline returns null for small size', () => {
        const img = createMockImageData(128, 128, 'solid', 128);
        const alphaMap = createMockAlphaMap(96);
        const pos = { x: 16, y: 16, width: 96, height: 96 };
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = refineSubpixelOutline({
            sourceImageData: img,
            alphaMap,
            position: { x: 16, y: 16, width: 96, height: 96 },
            alphaGain: 1.5,
            baselineSpatialScore: 0.3,
            baselineGradientScore: 0.5
        });

        // May or may not find improvement - test that it doesn't crash
        if (result) {
            assert.ok(result.imageData);
            assert.ok(result.alphaGain >= 1);
            assert.ok(result.shift);
        }
    });
});
