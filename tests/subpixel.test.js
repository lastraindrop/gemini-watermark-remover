import { test, describe } from 'node:test';
import assert from 'node:assert';
import { removeWatermark } from '../src/core/blendModes.js';

describe('Sub-pixel Accuracy Tests (v1.7.0)', () => {

    test('Bilinear reconstruction for X-offset (0.5)', () => {
        const original = 100;
        const logo = 255;
        const alpha = 0.5;
        const watermarked = Math.round(alpha * logo + (1 - alpha) * original); // 178
        
        // 4x4 image
        const imgWidth = 4;
        const imgHeight = 4;
        const data = new Uint8ClampedArray(imgWidth * imgHeight * 4);
        data.fill(watermarked);
        for(let i=3; i<data.length; i+=4) data[i] = 255;
        
        const alphaMap = new Float32Array([alpha]);
        const pos = { x: 0.5, y: 0, width: 1, height: 1 };
        
        removeWatermark({ width: imgWidth, height: imgHeight, data }, alphaMap, pos);
        
        // Pixel at x=0.5, y=0 writes to floor(0.5)=0
        const result = data[0];
        assert.ok(Math.abs(result - original) <= 2, `Got ${result}, expected ~${original}`);
    });

    test('Bilinear reconstruction for XY-offset (0.3, 0.7)', () => {
        const original = 50;
        const alpha = 0.8;
        const logo = 255;
        const watermarked = Math.round(alpha * logo + (1 - alpha) * original); // 214
        
        const imgWidth = 4;
        const imgHeight = 4;
        const data = new Uint8ClampedArray(imgWidth * imgHeight * 4);
        data.fill(watermarked);
        for(let i=3; i<data.length; i+=4) data[i] = 255;

        const alphaMap = new Float32Array([alpha]);
        const pos = { x: 0.3, y: 0.7, width: 1, height: 1 };
        
        removeWatermark({ width: imgWidth, height: imgHeight, data }, alphaMap, pos);
        
        const result = data[0];
        assert.ok(Math.abs(result - original) <= 5, `Got ${result}, expected ~${original}`);
    });
});
