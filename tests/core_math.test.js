import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { detectWatermarkConfig } from '../src/core/config.js';

describe('Core Math & Logic Tests', () => {

    describe('Alpha Mapping', () => {
        test('Brightness normalization', () => {
            const data = new Uint8ClampedArray([0,0,0,255, 127,127,127,255, 255,255,255,255]);
            const alphaMap = calculateAlphaMap({ width: 3, height: 1, data });
            assert.strictEqual(alphaMap.length, 3);
            assert.ok(Math.abs(alphaMap[0] - 0) < 0.01);
            assert.ok(Math.abs(alphaMap[1] - 127/255) < 0.01);
            assert.ok(Math.abs(alphaMap[2] - 1) < 0.01);
        });
    });

    describe('Reverse Alpha Blending Math', () => {
        test('Pixel reconstruction accuracy', () => {
            const original = 100;
            const logo = 255;
            const alpha = 0.5;
            // watermarked = 0.5 * 255 + 0.5 * 100 = 127.5 + 50 = 177.5 -> 178
            const watermarked = Math.round(alpha * logo + (1 - alpha) * original);
            
            const data = new Uint8ClampedArray([watermarked, watermarked, watermarked, 255]);
            const alphaMap = new Float32Array([alpha]);
            const pos = { x: 0, y: 0, width: 1, height: 1 };
            
            removeWatermark({ width: 1, height: 1, data }, alphaMap, pos);
            
            // Allow small error due to rounding
            assert.ok(Math.abs(data[0] - original) <= 1, `Got ${data[0]}, expected ~${original}`);
        });

        test('Extreme alpha tolerance (99%)', () => {
            const original = 50;
            const alpha = 0.99;
            const logo = 255;
            const watermarked = Math.round(alpha * logo + (1 - alpha) * original);
            const data = new Uint8ClampedArray([watermarked, watermarked, watermarked, 255]);
            const alphaMap = new Float32Array([alpha]);
            
            removeWatermark({ width: 1, height: 1, data }, alphaMap, { x: 0, y: 0, width: 1, height: 1 });
            
            // Error amplification at 99% alpha is huge (1 / 0.01 = 100x rounding error)
            // 0.5 / (1-0.99) = 50.
            assert.ok(Math.abs(data[0] - original) <= 51);
        });
    });

    describe('Config & Scaling', () => {
        test('Official resolution thresholds', () => {
            // Small image (<512) - Heuristic 48
            assert.strictEqual(detectWatermarkConfig(500, 500).logoSize, 48);
            // Large image (maxSide > 1500) - Heuristic 96
            assert.strictEqual(detectWatermarkConfig(2048, 400).logoSize, 96);
            // Non-catalog medium image - Heuristic 48
            assert.strictEqual(detectWatermarkConfig(1200, 600).logoSize, 48);
        });

    });
});
