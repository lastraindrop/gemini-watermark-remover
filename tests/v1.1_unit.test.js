import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';
import { detectWatermark } from '../src/core/detector.js';

describe('Unit Tests - Core Logic (v1.1 Optimized)', () => {
    
    describe('1. Alpha Mapping', () => {
        test('Parameterized brightness levels', () => {
            const testLevels = [0, 51, 102, 153, 204, 255]; // Integer steps of 51
            const data = new Uint8ClampedArray(testLevels.length * 4);
            testLevels.forEach((val, i) => {
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = val;
                data[i * 4 + 3] = 255;
            });
            const alphaMap = calculateAlphaMap({ width: testLevels.length, height: 1, data });
            testLevels.forEach((val, i) => {
                const expected = val / 255.0;
                assert.ok(Math.abs(alphaMap[i] - expected) < 1e-6, `Failed at ${val}: got ${alphaMap[i]}, expected ${expected}`);
            });
        });
    });

    describe('2. Reverse Alpha Blending', () => {
        test('Comprehensive color & alpha combinations', () => {
            const alphas = [0.1, 0.5, 0.9, 0.99]; // High alpha is hardest
            const originals = [0, 128, 255];
            const logo = 255;

            for (const alpha of alphas) {
                for (const original of originals) {
                    const watermarked = Math.round(alpha * logo + (1 - alpha) * original);
                    const data = new Uint8ClampedArray([watermarked, watermarked, watermarked, 255]);
                    const alphaMap = new Float32Array([alpha]);
                    const pos = { x: 0, y: 0, width: 1, height: 1 };
                    
                    removeWatermark({ width: 1, height: 1, data }, alphaMap, pos);
                    
                    // Tolerance increases with alpha due to rounding amplification: error ~ 0.5 / (1-alpha)
                    const tolerance = Math.ceil(0.51 / (1 - alpha));
                    assert.ok(Math.abs(data[0] - original) <= tolerance, `Alpha ${alpha} failed: got ${data[0]}, expected ${original}`);
                }
            }
        });
    });

    describe('3. Configuration & Positioning', () => {
        test('Scaling rules for tiny vs giant images', () => {
            const cases = [
                { w: 100, h: 100, expectedSize: 48 },
                { w: 1025, h: 1025, expectedSize: 96 },
                { w: 2000, h: 500, expectedSize: 96 }, // Either side > 1024
            ];
            cases.forEach(c => {
                const config = detectWatermarkConfig(c.w, c.h);
                assert.strictEqual(config.logoSize, c.expectedSize);
            });
        });

        test('Positioning safety for edge cases', () => {
            const config = { logoSize: 48, marginRight: 32, marginBottom: 32 };
            // Extremely narrow image
            const pos = calculateWatermarkPosition(10, 1000, config);
            assert.strictEqual(pos.x, 10 - 32 - 48); // -70
            assert.strictEqual(pos.y, 1000 - 32 - 48); // 920
        });
    });

    describe('4. Pixel Detection', () => {
        test('Detects structured watermark with high confidence', () => {
            const w = 300, h = 300, size = 48;
            const data = new Uint8ClampedArray(w * h * 4).fill(0); // Use black background for contrast
            const targetX = 200, targetY = 200;
            
            // Mock a specific logo pattern (a 2x2 block at 10,10)
            for (let r = 10; r < 12; r++) {
                for (let c = 10; c < 12; c++) {
                    const idx = ((targetY + r) * w + (targetX + c)) * 4;
                    data[idx] = data[idx+1] = data[idx+2] = 255;
                    data[idx+3] = 255;
                }
            }

            const alphaMap = new Float32Array(size * size).fill(0);
            for (let r = 10; r < 12; r++) {
                for (let c = 10; c < 12; c++) alphaMap[r * size + c] = 1.0;
            }

            const result = detectWatermark({ width: w, height: h, data }, { 48: alphaMap, 96: new Float32Array(96*96) });
            assert.ok(result !== null, 'Detection returned null');
            assert.strictEqual(result.size, 48);
            assert.ok(Math.abs(result.x - targetX) <= 2, `X mismatch: got ${result.x}, expected ~${targetX}`);
            assert.ok(result.confidence > 0.8, `Confidence too low: ${result.confidence}`);
        });
    });
});
