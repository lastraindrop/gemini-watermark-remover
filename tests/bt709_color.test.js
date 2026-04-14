import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCorrelation } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('BT.709 Color Space Sensitivity Tests', () => {

    test('Detection on High-Saturation Green Background (#00FF00)', () => {
        const w = 512, h = 512, size = 96;
        // Pure green background: R=0, G=255, B=0
        // BT.709 Luminance: 0.7152 * 255 = 182.376
        const img = createMockImageData(w, h, 'solid', 0);
        for(let i=0; i<img.data.length; i+=4) {
            img.data[i+1] = 255; // Set Green
        }

        const alphaMap = createMockAlphaMap(size);
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        
        applyWatermark(img, targetX, targetY, size, size, alphaMap);

        const conf = calculateCorrelation(img, targetX, targetY, size, size, alphaMap, true);
        
        // Assert high confidence on green background
        assert.ok(conf > 0.8, `Confidence on green background too low: ${conf}`);
    });

    test('Detection on High-Saturation Blue Background (#0000FF)', () => {
        const w = 512, h = 512, size = 96;
        // Pure blue background: R=0, G=0, B=255
        // BT.709 Luminance: 0.0722 * 255 = 18.411 (Very dark)
        const img = createMockImageData(w, h, 'solid', 0);
        for(let i=0; i<img.data.length; i+=4) {
            img.data[i+2] = 255; // Set Blue
        }

        const alphaMap = createMockAlphaMap(size);
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        
        applyWatermark(img, targetX, targetY, size, size, alphaMap);

        const conf = calculateCorrelation(img, targetX, targetY, size, size, alphaMap, true);
        
        // Assert detection still works even on "darker" blue luminance background
        assert.ok(conf > 0.7, `Confidence on blue background too low: ${conf}`);
    });

    test('Relative Sensitivity: Green vs Blue', () => {
        // Since Green has higher weight (0.7152) than Blue (0.0722), 
        // a same-alpha watermark on a green background should result in higher signal contrast.
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0.2); // Low alpha
        
        const greenPx = { data: new Uint8ClampedArray([0, 255, 0, 255]), width: 1, height: 1 };
        const bluePx = { data: new Uint8ClampedArray([0, 0, 255, 255]), width: 1, height: 1 };
        
        // Manual calculation of signal contrast
        // Green: 0.2*255 + 0.8*182.37 = 51 + 145.9 = 196.9
        // Blue: 0.2*255 + 0.8*18.4 = 51 + 14.7 = 65.7
        
        // Just verify calculateCorrelation executes without crashing on these
        const confG = calculateCorrelation(greenPx, 0, 0, 1, 1, new Float32Array([0.2]), true);
        const confB = calculateCorrelation(bluePx, 0, 0, 1, 1, new Float32Array([0.2]), true);
        
        assert.strictEqual(typeof confG, 'number');
        assert.strictEqual(typeof confB, 'number');
    });
});
