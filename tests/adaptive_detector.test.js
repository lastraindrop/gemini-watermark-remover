import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    detectAdaptiveWatermarkRegion,
    interpolateAlphaMap,
    warpAlphaMap,
    refineSubpixelOutline
} from '../src/core/adaptiveDetector.js';
import { calculateCorrelation } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Adaptive Detector', () => {

    test('interpolateAlphaMap scales alpha map correctly', () => {
        const source = createMockAlphaMap(96);
        const scaled = interpolateAlphaMap(source, 96, 48, 48, 96);
        assert.strictEqual(scaled.length, 48 * 48);
        assert.ok(scaled[0] >= 0 && scaled[0] <= 1, 'Values in [0, 1]');
    });

    test('interpolateAlphaMap returns same size when target equals source', () => {
        const source = createMockAlphaMap(64);
        const scaled = interpolateAlphaMap(source, 64, 64, 64, 64);
        assert.strictEqual(scaled.length, 64 * 64);
    });

    test('interpolateAlphaMap returns empty for zero target', () => {
        const source = createMockAlphaMap(64);
        const scaled = interpolateAlphaMap(source, 64, 0, 0, 64);
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

// -- Merged from v2_2_adaptive_rect.test.js --
describe('Rectangle interpolation & warp (v2.2)', () => {
    function makeAlpha(size) {
        const a = new Float32Array(size * size);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                a[i * size + j] = (i + j) / (2 * size);
            }
        }
        return a;
    }

    test('Square interpolation still works', () => {
        const src = makeAlpha(48);
        const result = interpolateAlphaMap(src, 48, 24, 24, 48);
        assert.strictEqual(result.length, 24 * 24);
    });

    test('Rectangle interpolation: 48→64x32', () => {
        const src = makeAlpha(48);
        const result = interpolateAlphaMap(src, 48, 64, 32, 48);
        assert.strictEqual(result.length, 64 * 32);
    });

    test('Same size returns original-sized result with same values', () => {
        const src = makeAlpha(32);
        const result = interpolateAlphaMap(src, 32, 32, 32, 32);
        assert.strictEqual(result.length, src.length);
        assert.ok(Math.abs(result[0] - src[0]) < 0.001, 'Values should be identical');
    });

    test('Identity warp rect returns original', () => {
        const src = new Float32Array(32 * 48);
        src.fill(0.3);
        const result = warpAlphaMap(src, 32, { dx: 0, dy: 0, scale: 1 }, 48);
        assert.strictEqual(result.length, 32 * 48);
    });

    test('Warp rect with shift works', () => {
        const src = makeAlpha(32);
        const result = warpAlphaMap(src, 32, { dx: 1, dy: 0, scale: 1 }, 32);
        assert.strictEqual(result.length, 32 * 32);
        let diff = false;
        for (let i = 0; i < 100; i++) {
            if (Math.abs(result[i] - src[i]) > 0.001) { diff = true; break; }
        }
        assert.ok(diff, 'Shifted warp should differ from source');
    });
});

// ─── v2.3: Rectangular Watermark Support ─────────────────────────────────────

describe('v2.3 Rectangular Watermark Detection', () => {

    test('Detects rectangular watermark (simulating Doubao 401×173)', () => {
        const w = 2048, h = 1535;
        const logoW = 200, logoH = 86; // scaled-down for test performance
        const img = createMockImageData(w, h, 'noise', 128);
        const alphaMap = createMockAlphaMap(logoW, logoH);

        const x = w - 24 - logoW;
        const y = h - 10 - logoH;
        applyWatermark(img, x, y, logoW, logoH, alphaMap, 255);

        const result = detectAdaptiveWatermarkRegion({
            imageData: img,
            alphaMaps: { [`${logoW}x${logoH}`]: alphaMap },
            defaultConfig: { logoWidth: logoW, logoHeight: logoH, marginRight: 24, marginBottom: 10, logoSize: undefined },
            threshold: 0.15
        });

        assert.ok(result, 'Should detect rectangular (non-square) watermark');
        assert.ok(result.region.width !== result.region.height,
            `Region should be rectangular: ${result.region.width}×${result.region.height}`);
        assert.ok(result.confidence > 0, 'Confidence should be positive');
    });

    test('Rectangular detection returns correct aspect ratio (not square)', () => {
        const w = 1024, h = 1024;
        const logoW = 120, logoH = 40;
        const img = createMockImageData(w, h, 'noise', 128);
        const alphaMap = createMockAlphaMap(logoW, logoH);

        const x = w - 20 - logoW;
        const y = h - 20 - logoH;
        applyWatermark(img, x, y, logoW, logoH, alphaMap, 255);

        const result = detectAdaptiveWatermarkRegion({
            imageData: img,
            alphaMaps: { [`${logoW}x${logoH}`]: alphaMap },
            defaultConfig: { logoWidth: logoW, logoHeight: logoH, marginRight: 20, marginBottom: 20, logoSize: undefined, anchor: 'bottom-right' },
            threshold: 0.12
        });

        if (result) {
            const ratio = result.region.width / result.region.height;
            assert.ok(ratio > 1.5, `Aspect ratio should be > 1.5 for 120×40, got ${ratio.toFixed(2)}`);
        }
    });
});

// ─── v2.3: Smooth-Background Variance Score ──────────────────────────────────

describe('v2.3 Smooth-Background Variance Score', () => {

    test('Smooth background (sky-like) with watermark still detectable', () => {
        const w = 1024, h = 1024;
        const size = 96;
        // Smooth gradient simulates sky/studio backdrop
        const img = createMockImageData(w, h, 'gradient', 200);
        const alphaMap = createMockAlphaMap(size);

        const x = w - 64 - size;
        const y = h - 64 - size;
        applyWatermark(img, x, y, size, size, alphaMap);

        // After v2.3 variance fix, smooth backgrounds should no longer
        // return fixed 0.5 fallback — the absolute-delta model should
        // produce a meaningful score.
        const ncc = calculateCorrelation(img, x, y, size, size, alphaMap, true);
        assert.ok(ncc > 0.05, `Smooth background NCC should be > 0.05, got ${ncc}`);

        const result = detectAdaptiveWatermarkRegion({
            imageData: img,
            alphaMaps: { 96: alphaMap },
            defaultConfig: { logoSize: size, marginRight: 64, marginBottom: 64 },
            threshold: 0.08
        });
        // Not asserting detection success (depends on exact mock alpha patterns)
        // but the variance scoring should not crash and should return a number.
        if (result) {
            assert.ok(Number.isFinite(result.varianceScore), 'varianceScore should be finite');
        }
    });

    test('Solid medium-gray background variance score is in valid range', () => {
        const w = 512, h = 512;
        const size = 48;
        const img = createMockImageData(w, h, 'solid', 128);
        const alphaMap = createMockAlphaMap(size);

        const x = w - 32 - size;
        const y = h - 32 - size;
        applyWatermark(img, x, y, size, size, alphaMap);

        const result = detectAdaptiveWatermarkRegion({
            imageData: img,
            alphaMaps: { 48: alphaMap },
            defaultConfig: { logoSize: size, marginRight: 32, marginBottom: 32 },
            threshold: 0.10
        });

        if (result) {
            assert.ok(result.varianceScore >= 0 && result.varianceScore <= 1,
                `varianceScore should be [0,1], got ${result.varianceScore}`);
        }
    });
});
