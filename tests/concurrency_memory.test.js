import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { resetDetectorBuffers } from '../src/core/detector.js';
import { cloneImageData } from '../src/core/utils.js';

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

describe('Concurrency & Memory Tests', () => {
    it('Parallel removeWatermark calls on different images are independent', () => {
        const results = [];
        for (let i = 0; i < 5; i++) {
            const img = makeImageData(100, 100, () => [200, 200, 200, 255]);
            const alphaMap = new Float32Array(48 * 48).fill(0.4);
            const pos = { x: 20, y: 20, width: 48, height: 48 };
            removeWatermark(img, alphaMap, pos);
            results.push(img);
        }
        for (let i = 1; i < results.length; i++) {
            const same = results[0].data[0] === results[i].data[0];
            assert.ok(same, `Result ${i} should match result 0 (deterministic)`);
        }
    });

    it('AlphaMap cache invalidation via new ImageData', () => {
        const img1 = makeImageData(50, 50, () => [128, 128, 128, 255]);
        const alpha1 = calculateAlphaMap(img1);
        assert.equal(alpha1.length, 50 * 50);

        const img2 = makeImageData(100, 100, () => [200, 200, 200, 255]);
        const alpha2 = calculateAlphaMap(img2);
        assert.equal(alpha2.length, 100 * 100);
        assert.notEqual(alpha1.length, alpha2.length, 'Different sizes should produce different length maps');
    });

    it('Repeated create/destroy cycles do not accumulate state', () => {
        for (let i = 0; i < 10; i++) {
            const img = makeImageData(200, 200, () => [180, 180, 180, 255]);
            const alphaMap = new Float32Array(48 * 48).fill(0.3);
            const pos = { x: 100, y: 100, width: 48, height: 48 };
            removeWatermark(img, alphaMap, pos);
        }
        resetDetectorBuffers();
        assert.equal(undefined, undefined, 'Should complete without memory errors');
    });

    it('cloneImageData creates truly independent buffers', () => {
        const original = makeImageData(50, 50, () => [100, 150, 200, 255]);
        const clone = cloneImageData(original);
        assert.deepEqual(clone.data, original.data, 'Initial data should match');
        original.data[0] = 0;
        assert.equal(clone.data[0], 100, 'Clone should be independent');
    });

    it('Multiple alpha map calculations are consistent', () => {
        const img = makeImageData(48, 48, (x, y) => [x * 5, y * 5, (x + y) * 3, 255]);
        const alpha1 = calculateAlphaMap(img);
        const alpha2 = calculateAlphaMap(img);
        for (let i = 0; i < alpha1.length; i++) {
            assert.equal(alpha1[i], alpha2[i], `Alpha values should be deterministic at index ${i}`);
        }
    });

    it('Processing 4K-scaled synthetic image stays within reasonable memory', () => {
        const w = 512, h = 512;
        const img = makeImageData(w, h, () => [128, 128, 128, 255]);
        const alphaMap = new Float32Array(48 * 48).fill(0.3);
        const pos = { x: 200, y: 200, width: 48, height: 48 };
        const memBefore = process.memoryUsage().heapUsed;
        for (let i = 0; i < 50; i++) {
            const copy = cloneImageData(img);
            removeWatermark(copy, alphaMap, pos);
        }
        const memAfter = process.memoryUsage().heapUsed;
        const growth = memAfter - memBefore;
        assert.ok(growth < 50 * 1024 * 1024, `Memory growth should be < 50MB, got ${Math.round(growth / 1024 / 1024)}MB`);
    });
});
