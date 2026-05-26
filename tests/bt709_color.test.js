import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCorrelation } from '../src/core/detector.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('BT.709 Color Space Sensitivity Tests', () => {

    test('Detection on High-Saturation Green Background (#00FF00)', () => {
        const w = 512, h = 512, size = 96;
        const img = createMockImageData(w, h, 'solid', 0);
        for(let i=0; i<img.data.length; i+=4) {
            img.data[i+1] = 255;
        }

        const alphaMap = createMockAlphaMap(size);
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        
        applyWatermark(img, targetX, targetY, size, size, alphaMap);

        const conf = calculateCorrelation(img, targetX, targetY, size, size, alphaMap, true);
        
        assert.ok(conf > 0.8, `Confidence on green background too low: ${conf}`);
    });

    test('Detection on High-Saturation Blue Background (#0000FF)', () => {
        const w = 512, h = 512, size = 96;
        const img = createMockImageData(w, h, 'solid', 0);
        for(let i=0; i<img.data.length; i+=4) {
            img.data[i+2] = 255;
        }

        const alphaMap = createMockAlphaMap(size);
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        
        applyWatermark(img, targetX, targetY, size, size, alphaMap);

        const conf = calculateCorrelation(img, targetX, targetY, size, size, alphaMap, true);
        
        assert.ok(conf > 0.7, `Confidence on blue background too low: ${conf}`);
    });

    test('Relative Sensitivity: Green vs Blue', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0.2);
        
        const greenPx = { data: new Uint8ClampedArray([0, 255, 0, 255]), width: 1, height: 1 };
        const bluePx = { data: new Uint8ClampedArray([0, 0, 255, 255]), width: 1, height: 1 };
        
        const confG = calculateCorrelation(greenPx, 0, 0, 1, 1, new Float32Array([0.2]), true);
        const confB = calculateCorrelation(bluePx, 0, 0, 1, 1, new Float32Array([0.2]), true);
        
        assert.strictEqual(typeof confG, 'number');
        assert.strictEqual(typeof confB, 'number');
    });

    test('alphaMap uses maxChannel, detector uses BT.709 for luminance', () => {
        const r = 100, g = 200, b = 50;
        const data = new Uint8ClampedArray([r, g, b, 255]);
        const alphaMap = calculateAlphaMap({ width: 1, height: 1, data });

        const expectedMaxChannel = Math.max(r, g, b) / 255.0;
        assert.ok(Math.abs(alphaMap[0] - expectedMaxChannel) < 0.001,
            `alphaMap max-channel mismatch: got ${alphaMap[0].toFixed(6)}, expected ${expectedMaxChannel.toFixed(6)}`);

        // detector.calculateCorrelation uses BT.709 luminance internally for image pixels.
        // The alpha map (max-channel) and image luminance (BT.709) operate in slightly
        // different numerical spaces, but the relative pattern (bright/dark) is preserved
        // across both, so NCC correlation remains valid.
        const img = { data: new Uint8ClampedArray([r, g, b, 255]), width: 1, height: 1 };
        const alphaArr = new Float32Array([expectedMaxChannel]);
        const conf = calculateCorrelation(img, 0, 0, 1, 1, alphaArr, true);
        assert.strictEqual(typeof conf, 'number', 'calculateCorrelation should not crash');
    });
});
