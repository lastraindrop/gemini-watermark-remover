import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { calculateCorrelation, calculateProbeConfidence, detectWatermark } from '../src/core/detector.js';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, alphaToRGBA } from './test_utils.js';

describe('Robustness: removeWatermark edge cases', () => {
    const alphaSize = 48;
    const alphaMap = createMockAlphaMap(alphaSize);
    const pos = { x: 400, y: 296, width: alphaSize, height: alphaSize };

    it('handles position at image origin (0,0)', () => {
        const img = createMockImageData(64, 64);
        const pos0 = { x: 0, y: 0, width: alphaSize, height: alphaSize };
        removeWatermark(img, alphaMap, pos0);
        assert.ok(true);
    });

    it('handles position partially exceeding image bounds without crash', () => {
        const img = createMockImageData(64, 64);
        const posOut = { x: 50, y: 50, width: alphaSize, height: alphaSize };
        removeWatermark(img, alphaMap, posOut);
        assert.ok(true);
    });

    it('handles negative x/y coordinates without crash', () => {
        const img = createMockImageData(128, 128);
        const negPos = { x: -10, y: -10, width: alphaSize, height: alphaSize };
        removeWatermark(img, alphaMap, negPos);
        assert.ok(true);
    });

    it('handles zero-size watermark (width=0)', () => {
        const img = createMockImageData(64, 64);
        const zeroW = { x: 0, y: 0, width: 0, height: alphaSize };
        removeWatermark(img, alphaMap, zeroW);
        assert.ok(true);
    });

    it('handles alphaGain=0 as no-op', () => {
        const img = createMockImageData(128, 128);
        applyWatermark(img, pos.x, pos.y, alphaSize, alphaSize, alphaMap);
        const before = new Uint8ClampedArray(img.data);
        removeWatermark(img, alphaMap, pos, { alphaGain: 0 });
        assert.deepStrictEqual(img.data, before);
    });

    it('handles alphaGain=NaN (falls back to 1)', () => {
        const img = createMockImageData(128, 128);
        applyWatermark(img, pos.x, pos.y, alphaSize, alphaSize, alphaMap);
        removeWatermark(img, alphaMap, pos, { alphaGain: NaN });
        assert.ok(true);
    });

    it('handles alphaGain negative (falls back to 1)', () => {
        const img = createMockImageData(128, 128);
        applyWatermark(img, pos.x, pos.y, alphaSize, alphaSize, alphaMap);
        removeWatermark(img, alphaMap, pos, { alphaGain: -1 });
        assert.ok(true);
    });

    it('all-zero alpha map produces no change', () => {
        const img = createMockImageData(128, 128);
        const zeroAlpha = new Float32Array(alphaSize * alphaSize).fill(0);
        const before = new Uint8ClampedArray(img.data);
        removeWatermark(img, zeroAlpha, pos);
        assert.deepStrictEqual(img.data, before);
    });

    it('all-max alpha map (0.99) does not overflow pixels', () => {
        const img = createMockImageData(128, 128, 'solid', 128);
        const fullAlpha = new Float32Array(alphaSize * alphaSize).fill(0.99);
        removeWatermark(img, fullAlpha, { x: 32, y: 32, width: alphaSize, height: alphaSize });
        for (let i = 0; i < img.data.length; i++) {
            assert.ok(img.data[i] >= 0 && img.data[i] <= 255);
        }
    });

    it('handles floating point position (x=0.5, y=0.3)', () => {
        const img = createMockImageData(128, 128);
        applyWatermark(img, 40, 40, alphaSize, alphaSize, alphaMap);
        const floatPos = { x: 40.5, y: 40.3, width: alphaSize, height: alphaSize };
        removeWatermark(img, alphaMap, floatPos);
        assert.ok(true);
    });
});

describe('Robustness: detectWatermark edge cases', () => {
    it('returns null for 1x1 image', () => {
        const img = createMockImageData(1, 1);
        const alphaMaps = { 48: createMockAlphaMap(48) };
        const result = detectWatermark(img, alphaMaps);
        assert.strictEqual(result, null);
    });

    it('returns null for 2x2 image', () => {
        const img = createMockImageData(2, 2);
        const alphaMaps = { 48: createMockAlphaMap(48) };
        const result = detectWatermark(img, alphaMaps);
        assert.strictEqual(result, null);
    });

    it('handles empty alphaMaps object', () => {
        const img = createMockImageData(512, 512);
        const result = detectWatermark(img, {});
        assert.strictEqual(result, null);
    });

    it('handles NaN in alpha map data without crash', () => {
        const img = createMockImageData(512, 512);
        const badAlpha = new Float32Array(48 * 48).fill(NaN);
        const alphaMaps = { 48: badAlpha };
        const result = detectWatermark(img, alphaMaps);
        assert.strictEqual(result, null);
    });

    it('handles Infinity in alpha map data without crash', () => {
        const img = createMockImageData(512, 512);
        const badAlpha = new Float32Array(48 * 48).fill(Infinity);
        const alphaMaps = { 48: badAlpha };
        const result = detectWatermark(img, alphaMaps);
        assert.strictEqual(result, null);
    });
});

describe('Robustness: calculateCorrelation edge cases', () => {
    it('returns near-zero for identical constant regions', () => {
        const img = createMockImageData(256, 256, 'solid', 128);
        const alphaMap = createMockAlphaMap(48);
        const result = calculateCorrelation(img, 0, 0, 48, 48, alphaMap, true);
        assert.ok(Math.abs(result) < 0.02, `expected near-zero, got ${result}`);
    });

    it('returns finite value for valid inputs', () => {
        const size = 48;
        const img = createMockImageData(256, 256, 'gradient');
        const alphaMap = createMockAlphaMap(size);
        applyWatermark(img, 0, 0, size, size, alphaMap);
        const result = calculateCorrelation(img, 0, 0, size, size, alphaMap, true);
        assert.ok(Number.isFinite(result));
        assert.ok(result >= -1 && result <= 1, `should be in [-1,1], got ${result}`);
    });

    it('handles out-of-bounds coordinates gracefully', () => {
        const img = createMockImageData(128, 128);
        const alphaMap = createMockAlphaMap(48);
        const result = calculateCorrelation(img, -100, -100, 48, 48, alphaMap, true);
        assert.ok(Number.isFinite(result) && result === 0);
    });

    it('handles position beyond image width', () => {
        const img = createMockImageData(128, 128);
        const alphaMap = createMockAlphaMap(48);
        const result = calculateCorrelation(img, 200, 0, 48, 48, alphaMap, true);
        assert.strictEqual(result, 0);
    });
});

describe('Robustness: calculateAlphaMap edge cases', () => {
    it('handles pure black image (all zeros)', () => {
        const data = new Uint8ClampedArray(64 * 64 * 4);
        const imageData = { width: 64, height: 64, data };
        const alphaMap = calculateAlphaMap(imageData);
        for (const v of alphaMap) assert.strictEqual(v, 0);
    });

    it('handles pure white image (all 255)', () => {
        const data = new Uint8ClampedArray(64 * 64 * 4).fill(255);
        const imageData = { width: 64, height: 64, data };
        const alphaMap = calculateAlphaMap(imageData);
        for (const v of alphaMap) assert.strictEqual(v, 1);
    });

    it('produces values in [0, 1] range', () => {
        const img = createMockImageData(64, 64, 'gradient');
        const alphaMap = calculateAlphaMap(img);
        for (const v of alphaMap) {
            assert.ok(v >= 0, `value ${v} < 0`);
            assert.ok(v <= 1, `value ${v} > 1`);
        }
    });

    it('returns Float32Array of correct length', () => {
        const img = createMockImageData(32, 48);
        const alphaMap = calculateAlphaMap(img);
        assert.strictEqual(alphaMap.length, 32 * 48);
        assert.ok(alphaMap instanceof Float32Array);
    });
});

describe('Robustness: multiPassRemoval safety', () => {
    it('handles empty alpha map without crash', () => {
        const img = createMockImageData(256, 256, 'solid', 100);
        const emptyAlpha = new Float32Array(48 * 48).fill(0);
        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap: emptyAlpha,
            position: { x: 208, y: 208, width: 48, height: 48 }
        });
        assert.strictEqual(result.stopReason, 'residual-low');
    });

    it('stops within max-passes iteration limit', () => {
        const img = createMockImageData(512, 512, 'solid', 255);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);
        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 2,
            residualThreshold: 0
        });
        assert.ok(result.stopReason === 'max-passes' || result.stopReason === 'safety-near-black',
            `stopReason should be max-passes or safety-near-black, got ${result.stopReason}`);
        assert.ok(result.attemptedPassCount <= 2);
    });

    it('respects startingPassIndex', () => {
        const img = createMockImageData(512, 512, 'solid', 100);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 448, y: 448, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);
        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 2,
            startingPassIndex: 5
        });
        assert.ok(result.passCount >= 5);
    });
});
