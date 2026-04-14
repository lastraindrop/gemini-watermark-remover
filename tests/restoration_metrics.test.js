import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RestorationMetrics } from '../src/core/restorationMetrics.js';

describe('Restoration Quality Metrics Tests', () => {
    test('Identity should have zero MSE and infinite PSNR', () => {
        const buf = new Uint8ClampedArray([255, 128, 64, 32]);
        const mse = RestorationMetrics.calculateMSE(buf, buf);
        const psnr = RestorationMetrics.calculatePSNR(buf, buf);
        
        assert.strictEqual(mse, 0);
        assert.strictEqual(psnr, Infinity);
    });

    test('MSE calculation should be correct', () => {
        const buf1 = new Uint8ClampedArray([100, 100]);
        const buf2 = new Uint8ClampedArray([105, 95]); // diffs are 5 and -5
        // MSE = (5^2 + (-5)^2) / 2 = 50 / 2 = 25
        const mse = RestorationMetrics.calculateMSE(buf1, buf2);
        assert.strictEqual(mse, 25);
    });

    test('PSNR should decrease as noise increases', () => {
        const buf1 = new Uint8ClampedArray(100).fill(128);
        const buf2 = new Uint8ClampedArray(100).fill(130); // small diff
        const buf3 = new Uint8ClampedArray(100).fill(200); // large diff
        
        const psnr1 = RestorationMetrics.calculatePSNR(buf1, buf2);
        const psnr2 = RestorationMetrics.calculatePSNR(buf1, buf3);
        
        assert.ok(psnr1 > psnr2, 'Small error should have higher PSNR');
    });
});
