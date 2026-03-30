import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';

describe('V1.5 Edge Crop Tests', () => {
    test('Detect and remove watermark on bottom edge (partially outside)', () => {
        const w = 200, h = 200, size = 96;
        const data = new Uint8ClampedArray(w * h * 4).fill(10);
        const alphaMap = new Float32Array(size * size);
        
        const targetX = 50, targetY = 150;
        
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                alphaMap[r * size + c] = 0.5 + (r % 10) / 100.0;
                const curY = targetY + r;
                const curX = targetX + c;
                if (curY >= 0 && curY < h && curX >= 0 && curX < w) {
                    const idx = (curY * w + curX) << 2;
                    const original = 50; 
                    const alpha = alphaMap[r * size + c];
                    const val = alpha * 255 + (1 - alpha) * original;
                    data[idx] = data[idx+1] = data[idx+2] = val;
                    data[idx+3] = 255;
                }
            }
        }

        const alphaMaps = { 96: alphaMap, 48: new Float32Array(48*48) };
        const result = detectWatermark({ width: w, height: h, data }, alphaMaps, { deepScan: false });

        assert.ok(result !== null, 'Detection on edge failed');
        assert.ok(Math.abs(result.y - targetY) <= 1, `Y mismatch: got ${result.y}, expected ${targetY}`);
        
        const pos = { x: result.x, y: result.y, width: size, height: size };
        removeWatermark({ width: w, height: h, data }, alphaMap, pos);
        
        // Success if reached here without error
    });
});
