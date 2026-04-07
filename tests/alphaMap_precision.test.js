import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';

describe('Alpha Map Precision - Perceptual Luminance', () => {
    test('Perceptual weights for RGB channels', () => {
        // Red: (255, 0, 0) -> 255 * 0.299 = 76.245
        // Green: (0, 255, 0) -> 255 * 0.587 = 149.685
        // Blue: (0, 0, 255) -> 255 * 0.114 = 29.07
        const data = new Uint8ClampedArray([
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 0, 255, 255
        ]);
        
        const alphaMap = calculateAlphaMap({ width: 3, height: 1, data });
        
        const expectedRed = 76.245 / 255.0;
        const expectedGreen = 149.685 / 255.0;
        const expectedBlue = 29.07 / 255.0;
        
        assert.ok(Math.abs(alphaMap[0] - expectedRed) < 0.001, `Red: got ${alphaMap[0]}, expected ${expectedRed}`);
        assert.ok(Math.abs(alphaMap[1] - expectedGreen) < 0.001, `Green: got ${alphaMap[1]}, expected ${expectedGreen}`);
        assert.ok(Math.abs(alphaMap[2] - expectedBlue) < 0.001, `Blue: got ${alphaMap[2]}, expected ${expectedBlue}`);
    });

    test('Consistency with detector perceptual formula', () => {
        const data = new Uint8ClampedArray([100, 150, 200, 255]);
        const alphaMap = calculateAlphaMap({ width: 1, height: 1, data });
        
        const expected = (100 * 0.299 + 150 * 0.587 + 200 * 0.114) / 255.0;
        assert.ok(Math.abs(alphaMap[0] - expected) < 0.0001);
    });
});
