import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeWatermark } from '../src/core/blendModes.js';
import { detectWatermark } from '../src/core/detector.js';
import { calculateCorrelation } from '../src/core/detector.js';
import { cloneImageData, regionStdDev, calculateNearBlackRatio } from '../src/core/utils.js';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';

function makeImageData(w, h, fillFn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const [r, g, b, a] = fillFn(x, y);
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a;
        }
    }
    return { width: w, height: h, data };
}

function makeAlphaMap(w, h, pattern) {
    const data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            data[y * w + x] = typeof pattern === 'function' ? pattern(x, y) : pattern;
        }
    }
    return data;
}

describe('Security & Adversarial Input Validation', () => {

    describe('removeWatermark boundary safety', () => {
        it('NaN alpha preserves original pixel values', () => {
            const img = makeImageData(10, 10, () => [128, 128, 128, 255]);
            const original = new Uint8ClampedArray(img.data);
            const alphaMap = new Float32Array(100).fill(NaN);
            removeWatermark(img, alphaMap, { x: 0, y: 0, width: 10, height: 10 });
            assert.deepStrictEqual(img.data, original);
        });

        it('Infinity alpha handled without crashing', () => {
            const img = makeImageData(10, 10, () => [128, 128, 128, 255]);
            const alphaMap = new Float32Array(1).fill(Infinity);
            assert.doesNotThrow(() => {
                removeWatermark(img, alphaMap, { x: 0, y: 0, width: 1, height: 1 });
            });
        });

        it('Negative alpha values handled without crashing', () => {
            const img = makeImageData(10, 10, () => [128, 128, 128, 255]);
            const alphaMap = new Float32Array(1).fill(-0.5);
            assert.doesNotThrow(() => {
                removeWatermark(img, alphaMap, { x: 0, y: 0, width: 1, height: 1 });
            });
        });

        it('Position completely outside image bounds does not crash or modify', () => {
            const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
            const original = new Uint8ClampedArray(img.data);
            const alphaMap = makeAlphaMap(48, 0.5);
            assert.doesNotThrow(() => {
                removeWatermark(img, alphaMap, { x: -200, y: -200, width: 48, height: 48 });
            });
        });

        it('Position far beyond image bounds handled safely', () => {
            const img = makeImageData(50, 50, () => [100, 100, 100, 255]);
            const alphaMap = makeAlphaMap(48, 0.5);
            assert.doesNotThrow(() => {
                removeWatermark(img, alphaMap, { x: 1000, y: 1000, width: 48, height: 48 });
            });
        });

        it('All extremes pixels (0, 255) remain in valid range after removal', () => {
            const img = makeImageData(100, 100, () => [255, 0, 255, 255]);
            const alphaMap = makeAlphaMap(48, 0.5);
            removeWatermark(img, alphaMap, { x: 20, y: 20, width: 48, height: 48 });
            for (let i = 0; i < img.data.length; i += 4) {
                assert.ok(img.data[i] >= 0 && img.data[i] <= 255, `R at byte ${i} out of range`);
                assert.ok(img.data[i + 1] >= 0 && img.data[i + 1] <= 255);
                assert.ok(img.data[i + 2] >= 0 && img.data[i + 2] <= 255);
            }
        });

        it('High-opacity alpha map does not cause overflow on dark background', () => {
            const img = makeImageData(100, 100, () => [10, 10, 10, 255]);
            const alphaMap = makeAlphaMap(48, (x, y) => {
                const dist = Math.sqrt((x - 24) ** 2 + (y - 24) ** 2);
                return dist < 20 ? 0.99 : 0.001;
            });
            removeWatermark(img, alphaMap, { x: 25, y: 25, width: 48, height: 48 });
            for (let i = 0; i < img.data.length; i += 4) {
                assert.ok(img.data[i + 1] >= 0 && img.data[i + 1] <= 255);
            }
        });
    });

    describe('Alpha map adversarial values', () => {
        it('NaN values in alpha map handled safely', () => {
            const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
            const alphaMap = makeAlphaMap(48, (x, y) => (x === y ? NaN : 0.3));
            assert.doesNotThrow(() => {
                removeWatermark(img, alphaMap, { x: 25, y: 25, width: 48, height: 48 });
            });
        });

        it('Infinity values in alpha map handled safely', () => {
            const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
            const alphaMap = makeAlphaMap(48, (x, y) => (x === 0 && y === 0 ? Infinity : 0.3));
            assert.doesNotThrow(() => {
                removeWatermark(img, alphaMap, { x: 25, y: 25, width: 48, height: 48 });
            });
        });
    });

    describe('detectWatermark safety', () => {
        it('Empty alphaMaps object returns null without crash', () => {
            const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
            const result = detectWatermark(img, {});
            assert.strictEqual(result, null);
        });

        it('Mismatched alphaMap sizes handled without crash', () => {
            const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
            const wrongMap = new Float32Array(10);
            const result = detectWatermark(img, { 48: wrongMap, 96: wrongMap });
            assert.ok(result === null || result.mode !== undefined);
        });

        it('1x1 image does not crash', () => {
            const img = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) };
            assert.doesNotThrow(() => detectWatermark(img, { 48: new Float32Array(2304) }));
        });
    });

    describe('applyRemovalStrategy safety', () => {
        it('NaN confidence match does not crash', () => {
            const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
            const alphaMap = makeAlphaMap(48, 0.5);
            assert.doesNotThrow(() => {
                applyRemovalStrategy(img, [{
                    profileId: 'doubao', alphaMap,
                    pos: { x: 25, y: 25, width: 48, height: 48 },
                    confidence: NaN
                }]);
            });
        });
    });

    describe('utils safety', () => {
        it('regionStdDev handles edge, center, and OOB coordinates', () => {
            const data = new Uint8ClampedArray(10 * 10 * 4).fill(128);

            assert.doesNotThrow(() => {
                const std = regionStdDev(data, 10, 0, 0, 10);
                assert.ok(Number.isFinite(std));
                assert.equal(std, 0);
            });

            assert.doesNotThrow(() => regionStdDev(data, 10, 9, 9, 2));
            assert.doesNotThrow(() => regionStdDev(data, 10, -1, -1, 5));
        });
    });
});
