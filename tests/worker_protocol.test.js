import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { calculateCorrelation } from '../src/core/detector.js';

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

function makeAlphaMap(size, alpha) {
    return new Float32Array(size * size).fill(alpha);
}

describe('Worker Protocol & applyRemoval Strategy', () => {
    it('applyRemovalStrategy modifies imageData in place for gemini match', () => {
        const w = 200, h = 200;
        const img = makeImageData(w, h, () => [200, 200, 200, 255]);
        const originalPixel = img.data[0];
        const alphaMap = makeAlphaMap(48, 0.5);

        const matches = [{
            profileId: 'gemini',
            alphaMap,
            pos: { x: 100, y: 100, width: 48, height: 48 },
            confidence: 0.8
        }];

        applyRemovalStrategy(img, matches);

        const idx = (101 * w + 101) * 4;
        assert.notEqual(img.data[idx], originalPixel, 'Pixel should be modified');
    });

    it('applyRemovalStrategy uses direct removal for non-gemini match', () => {
        const w = 200, h = 200;
        const img = makeImageData(w, h, () => [200, 200, 200, 255]);
        const alphaMap = makeAlphaMap(48, 0.4);

        const matches = [{
            profileId: 'doubao',
            alphaMap,
            pos: { x: 100, y: 100, width: 48, height: 48 },
            confidence: 0.7
        }];

        applyRemovalStrategy(img, matches);

        const idx = (101 * w + 101) * 4;
        assert.ok(img.data[idx] < 200, 'Pixel should be modified by direct removal');
    });

    it('applyRemovalStrategy handles empty matches array', () => {
        const w = 100, h = 100;
        const img = makeImageData(w, h, () => [128, 128, 128, 255]);
        const originalData = new Uint8ClampedArray(img.data);

        applyRemovalStrategy(img, []);

        assert.deepEqual(img.data, originalData, 'No changes with empty matches');
    });

    it('applyRemovalStrategy processes multiple matches sequentially', () => {
        const w = 300, h = 300;
        const img = makeImageData(w, h, () => [200, 200, 200, 255]);
        const alphaMap = makeAlphaMap(48, 0.3);

        const matches = [
            { profileId: 'doubao', alphaMap, pos: { x: 10, y: 10, width: 48, height: 48 }, confidence: 0.6 },
            { profileId: 'doubao', alphaMap, pos: { x: 200, y: 200, width: 48, height: 48 }, confidence: 0.7 }
        ];

        applyRemovalStrategy(img, matches);

        const idx1 = (11 * w + 11) * 4;
        const idx2 = (201 * w + 201) * 4;
        assert.ok(img.data[idx1] < 200, 'First match should be removed');
        assert.ok(img.data[idx2] < 200, 'Second match should be removed');
    });

    it('applyRemovalStrategy with zero-alpha map should not modify pixels', () => {
        const w = 200, h = 200;
        const img = makeImageData(w, h, () => [200, 200, 200, 255]);
        const originalData = new Uint8ClampedArray(img.data);
        const alphaMap = makeAlphaMap(48, 0.0);

        const matches = [{
            profileId: 'doubao',
            alphaMap,
            pos: { x: 100, y: 100, width: 48, height: 48 },
            confidence: 0.5
        }];

        applyRemovalStrategy(img, matches);

        assert.deepEqual(img.data, originalData, 'Zero alpha should not modify pixels');
    });

    it('applyRemovalStrategy with very high alpha on dark image does not crash', () => {
        const w = 100, h = 100;
        const img = makeImageData(w, h, () => [10, 10, 10, 255]);
        const alphaMap = makeAlphaMap(48, 0.95);

        const matches = [{
            profileId: 'gemini',
            alphaMap,
            pos: { x: 20, y: 20, width: 48, height: 48 },
            confidence: 0.9
        }];

        assert.doesNotThrow(() => {
            applyRemovalStrategy(img, matches);
        });

        for (let i = 0; i < img.data.length; i += 4) {
            assert.ok(Number.isFinite(img.data[i]), 'R should be finite');
            assert.ok(Number.isFinite(img.data[i + 1]), 'G should be finite');
            assert.ok(Number.isFinite(img.data[i + 2]), 'B should be finite');
            assert.ok(img.data[i] >= 0 && img.data[i] <= 255, 'R should be in [0,255]');
            assert.ok(img.data[i + 1] >= 0 && img.data[i + 1] <= 255, 'G should be in [0,255]');
            assert.ok(img.data[i + 2] >= 0 && img.data[i + 2] <= 255, 'B should be in [0,255]');
        }
    });
});
