import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';

describe('Core Logic - Alpha Map', () => {
    test('calculateAlphaMap extracts max RGB channel correctly', () => {
        const data = new Uint8ClampedArray([
            255, 128, 0, 255,  // Max is 255 (1.0)
            10, 20, 30, 255    // Max is 30 (30/255.0)
        ]);
        const imageData = { width: 2, height: 1, data };
        
        const alphaMap = calculateAlphaMap(imageData);
        
        assert.strictEqual(alphaMap.length, 2);
        assert.strictEqual(alphaMap[0], 1.0);
        assert.ok(Math.abs(alphaMap[1] - 30/255.0) < 1e-6);
    });
});

describe('Core Logic - Blend Modes (Safety & Precision)', () => {
    test('removeWatermark leaves pixels outside target area untouched', () => {
        const width = 10, height = 10;
        const data = new Uint8ClampedArray(width * height * 4).fill(100);
        const imageData = { width, height, data };
        
        const targetPos = { x: 5, y: 5, width: 2, height: 2 };
        const alphaMap = new Float32Array(4).fill(0.5);
        
        removeWatermark(imageData, alphaMap, targetPos);
        
        // Check a pixel outside (0, 0)
        assert.strictEqual(imageData.data[0], 100);
        // Check a pixel inside (5, 5) -> index: (5*10 + 5)*4 = 220
        const insideIdx = (5 * 10 + 5) * 4;
        // original = (100 - 0.5 * 255) / 0.5 = (100 - 127.5) * 2 = -27.5 * 2 = -55 -> clipped to 0
        assert.strictEqual(imageData.data[insideIdx], 0);
    });

    test('reverses alpha blending accurately', () => {
        const alpha = 0.4;
        const original = 150;
        const logo = 255;
        // w = a*l + (1-a)*o = 0.4*255 + 0.6*150 = 102 + 90 = 192
        const watermarked = 192;
        
        const data = new Uint8ClampedArray([watermarked, watermarked, watermarked, 255]);
        const imageData = { width: 1, height: 1, data };
        const alphaMap = new Float32Array([alpha]);
        const pos = { x: 0, y: 0, width: 1, height: 1 };
        
        removeWatermark(imageData, alphaMap, pos);
        
        assert.strictEqual(imageData.data[0], original);
    });
});
