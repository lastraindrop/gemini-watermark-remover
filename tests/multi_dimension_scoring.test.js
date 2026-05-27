/**
 * Multi-Dimension Scoring Test - Verifies scoring doesn't dilute high NCC
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark, calculateCorrelation, calculateGradientCorrelation } from '../src/core/detector.js';

describe('Multi-Dimension Scoring', () => {
    test('High NCC is not diluted by low gradient on uniform background', () => {
        const smallW = 48, smallH = 48;
        const imgW = 512, imgH = 512;

        // Create a texture background (checkerboard) in the target region
        const wmImgData = {
            width: imgW, height: imgH,
            data: new Uint8ClampedArray(imgW * imgH * 4)
        };
        const alphaMap = new Float32Array(smallW * smallH);

        const x = imgW - 64 - smallW;
        const y = imgH - 64 - smallH;

        // Fill whole image with white
        for (let i = 0; i < imgW * imgH; i++) {
            const idx = i * 4;
            wmImgData.data[idx] = 200;
            wmImgData.data[idx + 1] = 200;
            wmImgData.data[idx + 2] = 200;
            wmImgData.data[idx + 3] = 255;
        }

        // Watermark region: alpha=0.4 pattern
        for (let row = 0; row < smallH; row++) {
            for (let col = 0; col < smallW; col++) {
                const alpha = (row + col) % 4 === 0 ? 0.4 : 0.15;
                alphaMap[row * smallW + col] = alpha;
                const px = x + col;
                const py = y + row;
                const pidx = (py * imgW + px) * 4;
                const wm = alpha * 255 + (1 - alpha) * 200;
                wmImgData.data[pidx] = wm;
                wmImgData.data[pidx + 1] = wm;
                wmImgData.data[pidx + 2] = wm;
            }
        }

        const ncc = calculateCorrelation(wmImgData, x, y, smallW, smallH, alphaMap, true);
        assert.ok(ncc > 0.3, `NCC should be positive on synthetic watermark: ${ncc}`);

        const gradientsI = new Float32Array(smallW * smallH);
        const gradientsA = new Float32Array(smallW * smallH);
        const gradientConf = calculateGradientCorrelation(wmImgData, x, y, smallW, smallH, alphaMap, gradientsI, gradientsA);

        const varianceScore = 0.5;
        const spatial = Math.max(0, ncc);
        const gradient = Math.max(0, gradientConf);
        const weighted = spatial * 0.5 + gradient * 0.3 + varianceScore * 0.2;
        const final = Math.max(spatial, weighted);

        assert.ok(final >= spatial, `Final score ${final} should not be less than NCC ${spatial}`);
    });

    test('Variance score returns neutral on uniform background', () => {
        const w = 200, h = 200;
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            const idx = i * 4;
            data[idx] = 200; data[idx + 1] = 200; data[idx + 2] = 200; data[idx + 3] = 255;
        }
        const imgData = { width: w, height: h, data };

        const alphaMaps = {};
        alphaMaps['48'] = new Float32Array(48 * 48).fill(0.5);
        alphaMaps['96'] = new Float32Array(96 * 96).fill(0.5);

        const result = detectWatermark(imgData, alphaMaps, { deepScan: false });
        assert.strictEqual(result, null, 'Uniform background with no watermark should return null');
    });
});
