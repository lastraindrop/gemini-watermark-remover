import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';

describe('Core Logic - Alpha Map (Parameterized)', () => {
    test('calculateAlphaMap handles various brightness levels', () => {
        // Test 0, 128, 255 and some intermediate values
        const levels = [0, 64, 128, 192, 255];
        const data = new Uint8ClampedArray(levels.length * 4);
        levels.forEach((val, i) => {
            data[i * 4] = val;     // R
            data[i * 4 + 1] = val; // G
            data[i * 4 + 2] = val; // B
            data[i * 4 + 3] = 255; // A
        });

        const alphaMap = calculateAlphaMap({ width: levels.length, height: 1, data });
        
        levels.forEach((val, i) => {
            const expected = val / 255.0;
            assert.ok(Math.abs(alphaMap[i] - expected) < 1e-6, `Failed at level ${val}`);
        });
    });

    test('calculateAlphaMap takes max channel for colored pixels', () => {
        const data = new Uint8ClampedArray([
            255, 0, 0, 255,   // R=255 -> 1.0
            0, 255, 0, 255,   // G=255 -> 1.0
            0, 0, 255, 255    // B=255 -> 1.0
        ]);
        const alphaMap = calculateAlphaMap({ width: 3, height: 1, data });
        assert.strictEqual(alphaMap[0], 1.0);
        assert.strictEqual(alphaMap[1], 1.0);
        assert.strictEqual(alphaMap[2], 1.0);
    });
});

describe('Core Logic - Blend Modes (Safety & Precision)', () => {
    test('removeWatermark reverses alpha blending across full range', () => {
        const alphas = [0.1, 0.3, 0.5, 0.8, 0.95];
        const colors = [0, 50, 128, 200, 255];
        const logo = 255;

        alphas.forEach(alpha => {
            colors.forEach(original => {
                // watermarked = alpha * logo + (1 - alpha) * original
                const watermarked = Math.round(alpha * logo + (1 - alpha) * original);
                
                const data = new Uint8ClampedArray([watermarked, watermarked, watermarked, 255]);
                const imageData = { width: 1, height: 1, data };
                const alphaMap = new Float32Array([alpha]);
                const pos = { x: 0, y: 0, width: 1, height: 1 };
                
                removeWatermark(imageData, alphaMap, pos);
                
                // Mathematical precision note: 
                // Rounding error of 0.5 in watermarked value is amplified by 1/(1-alpha)
                // For alpha=0.8, error can be 0.5 * 5 = 2.5. 
                // For alpha=0.95, error can be 0.5 * 20 = 10.
                const tolerance = Math.ceil(0.51 / (1 - alpha));
                assert.ok(Math.abs(imageData.data[0] - original) <= tolerance, 
                    `Failed for alpha=${alpha}, original=${original}, got=${imageData.data[0]} (tol=${tolerance})`);
            });
        });
    });

    test('removeWatermark applies MAX_ALPHA safety limit', () => {
        // If alpha is 1.0, the calculation would divide by zero. 
        // Our engine limits it to 0.99.
        const alpha = 1.0; 
        const watermarked = 200;
        const data = new Uint8ClampedArray([watermarked, 0, 0, 255]);
        const imageData = { width: 1, height: 1, data };
        const alphaMap = new Float32Array([alpha]);
        const pos = { x: 0, y: 0, width: 1, height: 1 };

        removeWatermark(imageData, alphaMap, pos);
        
        // original = (200 - 0.99 * 255) / (1 - 0.99) = (200 - 252.45) / 0.01 = -52.45 / 0.01 = -5245 -> clipped to 0
        assert.strictEqual(imageData.data[0], 0);
    });

    test('spatial safety: only modifies target area', () => {
        const width = 5, height = 5;
        const fillValue = 123;
        const data = new Uint8ClampedArray(width * height * 4).fill(fillValue);
        const imageData = { width, height, data };
        
        const pos = { x: 1, y: 1, width: 2, height: 2 };
        const alphaMap = new Float32Array(4).fill(0.5);
        
        removeWatermark(imageData, alphaMap, pos);
        
        for (let i = 0; i < width * height; i++) {
            const row = Math.floor(i / width);
            const col = i % width;
            const inTarget = row >= pos.y && row < pos.y + pos.height && col >= pos.x && col < pos.x + pos.width;
            
            if (!inTarget) {
                assert.strictEqual(imageData.data[i * 4], fillValue, `Pixel at (${col},${row}) changed`);
            }
        }
    });
});
