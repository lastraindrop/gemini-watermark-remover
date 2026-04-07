import { test, describe } from 'node:test';
import assert from 'node:assert';
import { removeWatermark } from '../src/core/blendModes.js';

describe('Sub-pixel Accuracy Tests (v1.7.0)', () => {

    test('Bilinear reconstruction for X-offset (0.5)', () => {
        const original = 100;
        const logo = 255;
        const alphaBase = 0.6;
        const size = 1;
        const alphaMap = new Float32Array([alphaBase]);
        
        const imgWidth = 4;
        const imgHeight = 1;
        const data = new Uint8ClampedArray(imgWidth * imgHeight * 4);
        data.fill(original);
        for(let i=3; i<data.length; i+=4) data[i] = 255;

        // Watermark at x=0.5, size=1. 
        // Covers half of pixel 0 (relX = -0.5) and half of pixel 1 (relX = 0.5)
        // Effective alpha for pixel 0: bilinear(-0.5) between 0 and 0.6 = 0.3
        // Effective alpha for pixel 1: bilinear(0.5) between 0.6 and 0 = 0.3
        
        const effAlpha0 = 0.3;
        const val0 = Math.round(effAlpha0 * logo + (1 - effAlpha0) * original); // 0.3*255 + 0.7*100 = 76.5 + 70 = 146.5 -> 147
        data[0] = data[1] = data[2] = val0;

        const effAlpha1 = 0.3;
        const val1 = Math.round(effAlpha1 * logo + (1 - effAlpha1) * original); // 147
        data[4] = data[5] = data[6] = val1;

        const pos = { x: 0.5, y: 0, width: 1, height: 1 };
        removeWatermark({ width: imgWidth, height: imgHeight, data }, alphaMap, pos);
        
        assert.ok(Math.abs(data[0] - original) <= 2, `Pixel 0: Got ${data[0]}, expected ~${original}`);
        assert.ok(Math.abs(data[4] - original) <= 2, `Pixel 1: Got ${data[4]}, expected ~${original}`);
    });

    test('Bilinear reconstruction for larger watermark (2x2) at (0.2, 0.2)', () => {
        const original = 50;
        const logo = 255;
        const size = 2;
        const alphaMap = new Float32Array([
            0.5, 0.5,
            0.5, 0.5
        ]);
        
        const w = 4, h = 4;
        const data = new Uint8ClampedArray(w * h * 4);
        data.fill(original);
        for(let i=3; i<data.length; i+=4) data[i] = 255;

        const tx = 0.2, ty = 0.2;
        // Pixel (0,0): relX = -0.2, relY = -0.2. 
        // Alpha sample: bilinear of [[0,0],[0,0.5]] at offsets... wait.
        // Simplified: let's use the actual forward formula to prepare data
        
        const getAlpha = (x, y) => {
            if (x <= -1 || x >= size || y <= -1 || y >= size) return 0;
            const x0 = Math.floor(x), y0 = Math.floor(y);
            const x1 = x0 + 1, y1 = y0 + 1;
            const dx = x - x0, dy = y - y0;
            const a = (p, q) => (p < 0 || p >= size || q < 0 || q >= size) ? 0 : alphaMap[q * size + p];
            return a(x0, y0)*(1-dx)*(1-dy) + a(x1, y0)*dx*(1-dy) + a(x0, y1)*(1-dx)*dy + a(x1, y1)*dx*dy;
        };

        for (let iy = 0; iy < h; iy++) {
            for (let ix = 0; ix < w; ix++) {
                const alpha = getAlpha(ix - tx, iy - ty);
                if (alpha <= 0) continue;
                const idx = (iy * w + ix) << 2;
                const val = Math.round(alpha * logo + (1 - alpha) * original);
                data[idx] = data[idx+1] = data[idx+2] = val;
            }
        }

        const pos = { x: tx, y: ty, width: size, height: size };
        removeWatermark({ width: w, height: h, data }, alphaMap, pos);
        
        for (let i = 0; i < w * h; i++) {
            const val = data[i * 4];
            assert.ok(Math.abs(val - original) <= 2, `Pixel ${i}: Got ${val}, expected ~${original}`);
        }
    });
});
