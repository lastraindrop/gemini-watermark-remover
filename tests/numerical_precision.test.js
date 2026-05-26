import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { calculateCorrelation, calculateGradientCorrelation } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { RestorationMetrics } from '../src/core/restorationMetrics.js';
import { regionStdDev, calculateNearBlackRatio } from '../src/core/utils.js';

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

describe('Numerical Precision Tests', () => {
    it('Alpha map max-channel: pure red channel => 1.0', () => {
        const data = makeImageData(4, 4, () => [255, 0, 0, 255]);
        const alpha = calculateAlphaMap(data);
        for (let i = 0; i < alpha.length; i++) {
            assert.ok(Math.abs(alpha[i] - 1.0) < 0.001, `Red max-channel: expected 1.0, got ${alpha[i]}`);
        }
    });

    it('Alpha map max-channel: pure green channel => 1.0', () => {
        const data = makeImageData(4, 4, () => [0, 255, 0, 255]);
        const alpha = calculateAlphaMap(data);
        for (let i = 0; i < alpha.length; i++) {
            assert.ok(Math.abs(alpha[i] - 1.0) < 0.001, `Green max-channel: expected 1.0, got ${alpha[i]}`);
        }
    });

    it('Alpha map max-channel: pure blue channel => 1.0', () => {
        const data = makeImageData(4, 4, () => [0, 0, 255, 255]);
        const alpha = calculateAlphaMap(data);
        for (let i = 0; i < alpha.length; i++) {
            assert.ok(Math.abs(alpha[i] - 1.0) < 0.001, `Blue max-channel: expected 1.0, got ${alpha[i]}`);
        }
    });

    it('Bilinear interpolation at alpha map boundaries', () => {
        const w = 100, h = 100;
        const img = makeImageData(w, h, () => [200, 200, 200, 255]);
        const alphaMap = new Float32Array(48 * 48);
        alphaMap[0] = 0.5;
        alphaMap[47] = 0.5;
        alphaMap[47 * 48] = 0.5;
        alphaMap[47 * 48 + 47] = 0.5;
        for (let i = 0; i < 48 * 48; i++) alphaMap[i] = 0.5;

        const pos = { x: 0.5, y: 0.3, width: 48, height: 48 };
        assert.doesNotThrow(() => {
            removeWatermark(img, alphaMap, pos);
        });

        const idx = (0 * w + 1) * 4;
        assert.ok(img.data[idx] < 200, 'Pixel should be modified with sub-pixel offset');
    });

    it('NCC returns near-zero for constant regions', () => {
        const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
        const alphaMap = new Float32Array(48 * 48).fill(0.5);
        const ncc = calculateCorrelation(img, 20, 20, 48, 48, alphaMap, true);
        assert.ok(Math.abs(ncc) < 0.01, `NCC for constant image should be near-zero, got ${ncc}`);
    });

    it('PSNR calculation accuracy with known values', () => {
        const buf1 = new Uint8ClampedArray([100, 100, 100, 100]);
        const buf2 = new Uint8ClampedArray([110, 110, 110, 110]);
        const mse = RestorationMetrics.calculateMSE(buf1, buf2);
        assert.equal(mse, 100, 'MSE should be 100 for +10 difference');
        const psnr = RestorationMetrics.calculatePSNR(buf1, buf2);
        const expectedPSNR = 10 * Math.log10(255 * 255 / 100);
        assert.ok(Math.abs(psnr - expectedPSNR) < 0.01, `PSNR should be ${expectedPSNR}, got ${psnr}`);
    });

    it('regionStdDev for known distribution', () => {
        const data = new Uint8ClampedArray(10 * 4);
        for (let i = 0; i < 10; i++) {
            data[i * 4] = i * 10;
            data[i * 4 + 1] = i * 10;
            data[i * 4 + 2] = i * 10;
            data[i * 4 + 3] = 255;
        }
        const std = regionStdDev(data, 10, 0, 0, 1);
        assert.equal(std, 0, 'Single pixel region should have 0 stdDev');
    });

    it('Near-black ratio calculation for known image', () => {
        const w = 10, h = 10;
        const img = makeImageData(w, h, (x, y) => {
            const val = (x + y) < 10 ? 5 : 200;
            return [val, val, val, 255];
        });
        const pos = { x: 0, y: 0, width: 10, height: 10 };
        const ratio = calculateNearBlackRatio(img, pos);
        assert.ok(ratio > 0, 'Should have some near-black pixels');
        assert.ok(ratio < 1, 'Should not have all near-black pixels');
    });

    it('Sobel gradient at image edges returns zero', () => {
        const w = 10, h = 10;
        const img = makeImageData(w, h, () => [128, 128, 128, 255]);
        const alphaMap = new Float32Array(48 * 48).fill(0.3);
        const gradientsI = new Float32Array(48 * 48);
        const gradientsA = new Float32Array(48 * 48);
        const grad = calculateGradientCorrelation(img, -5, -5, 48, 48, alphaMap, gradientsI, gradientsA);
        assert.ok(Number.isFinite(grad), 'Should return finite value for out-of-bounds position');
    });
});
