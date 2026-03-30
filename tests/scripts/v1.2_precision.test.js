import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig } from '../src/core/config.js';
import { detectWatermark } from '../src/core/detector.js';

describe('V1.2 Precision & Robustness Tests', () => {

    describe('1. Threshold Refinement (config.js)', () => {
        test('Should use 96px ONLY if Max > 1024 and Min >= 720', () => {
            const cases = [
                { w: 1500, h: 800, expected: 96 },
                { w: 800, h: 1500, expected: 96 },
                { w: 1024, h: 1024, expected: 48 },
                { w: 1589, h: 672, expected: 48 }, // User's reported case
                { w: 1025, h: 500, expected: 48 }  // Too thin
            ];
            cases.forEach(c => {
                const config = detectWatermarkConfig(c.w, c.h);
                assert.strictEqual(config.logoSize, c.expected, `Failed for ${c.w}x${c.h}`);
            });
        });
    });

    describe('2. Detection Precision (detector.js)', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0);
        // Create a simple distinct triangle pattern
        for (let r = 0; r < size; r++) {
            for (let c = 0; c <= r; c++) {
                alphaMap[r * size + c] = 1.0;
            }
        }

        const setupImage = (w, h, tx, ty) => {
            const data = new Uint8ClampedArray(w * h * 4).fill(0);
            for (let r = 0; r < size; r++) {
                for (let c = 0; c <= r; c++) {
                    const idx = ((ty + r) * w + (tx + c)) * 4;
                    data[idx] = data[idx+1] = data[idx+2] = 255;
                    data[idx+3] = 255;
                }
            }
            return { width: w, height: h, data };
        };

        test('Should find exact coordinates even if coarse search is off-by-one', () => {
            const w = 500, h = 500;
            const targetX = 401; // Odd number, coarse search (step=2) might land on 400 or 402
            const targetY = 401;
            
            const img = setupImage(w, h, targetX, targetY);
            const result = detectWatermark(img, { 48: alphaMap, 96: new Float32Array(96*96) });
            
            assert.ok(result, 'Detection failed');
            assert.strictEqual(result.x, targetX, `X mismatch: got ${result.x}, expected ${targetX}`);
            assert.strictEqual(result.y, targetY, `Y mismatch: got ${result.y}, expected ${targetY}`);
        });

        test('Should find watermark in expanded range (30% area)', () => {
            const w = 1000, h = 1000;
            // 25% from bottom-right (outside old 20% range)
            const targetX = 1000 - Math.floor(1000 * 0.28) - size;
            const targetY = 1000 - Math.floor(1000 * 0.28) - size;
            
            const img = setupImage(w, h, targetX, targetY);
            const result = detectWatermark(img, { 48: alphaMap, 96: new Float32Array(96*96) });
            
            assert.ok(result, 'Detection failed in expanded range');
            assert.strictEqual(result.size, 48);
            assert.ok(result.confidence > 0.8);
        });

        test('Should prefer standard margins if confidence is similar', () => {
             // This is harder to test without noise, but ensuring it still finds standard ones is key
             const w = 1000, h = 1000;
             const targetX = 1000 - 64 - size; // Standard 64px margin
             const targetY = 1000 - 64 - size;
             
             const img = setupImage(w, h, targetX, targetY);
             const result = detectWatermark(img, { 48: alphaMap, 96: new Float32Array(96*96) });
             
             assert.ok(result, 'Standard margin detection failed');
             assert.strictEqual(result.x, targetX);
             assert.strictEqual(result.y, targetY);
        });
    });
});
