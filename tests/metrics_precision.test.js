import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RestorationMetrics } from '../src/core/restorationMetrics.js';

describe('Restoration Metrics Precision Tests', () => {

    test('calculateMSE should return 0 for identical buffers', () => {
        const buf1 = new Uint8Array([100, 100, 100, 255, 50, 50, 50, 255]);
        const buf2 = new Uint8Array([100, 100, 100, 255, 50, 50, 50, 255]);
        
        const mse = RestorationMetrics.calculateMSE(buf1, buf2);
        assert.strictEqual(mse, 0);
    });

    test('calculateMSE should throw for mismatched lengths', () => {
        const buf1 = new Uint8Array([100, 100]);
        const buf2 = new Uint8Array([100, 100, 100]);
        
        assert.throws(() => RestorationMetrics.calculateMSE(buf1, buf2));
    });

    test('calculateMSE should calculate correct value for differences', () => {
        const buf1 = new Uint8Array([0, 4]);
        const buf2 = new Uint8Array([3, 0]);
        
        const mse = RestorationMetrics.calculateMSE(buf1, buf2);
        assert.strictEqual(mse, (9 + 16) / 2);
    });

    test('calculatePSNR should return Infinity for identical buffers', () => {
        const buf1 = new Uint8Array([100, 100, 100]);
        const buf2 = new Uint8Array([100, 100, 100]);
        
        const psnr = RestorationMetrics.calculatePSNR(buf1, buf2);
        assert.strictEqual(psnr, Infinity);
    });

    test('calculatePSNR should calculate in dB for non-identical', () => {
        const buf1 = new Uint8Array([0, 0, 0, 0]);
        const buf2 = new Uint8Array([100, 100, 100, 100]);
        
        const psnr = RestorationMetrics.calculatePSNR(buf1, buf2);
        assert.ok(typeof psnr === 'number');
        assert.ok(Number.isFinite(psnr));
        assert.ok(psnr > 0);
    });

    test('estimateQualityFromPSNR should map to 0-1 range', () => {
        const buf1 = new Uint8Array([0, 255, 128]);
        
        const bufPerfect = new Uint8Array([0, 255, 128]);
        const qualityPerfect = RestorationMetrics.estimateQualityFromPSNR(buf1, bufPerfect);
        assert.strictEqual(qualityPerfect, 1);
        
        const bufVeryDifferent = new Uint8Array([255, 0, 255]);
        const qualityLow = RestorationMetrics.estimateQualityFromPSNR(buf1, bufVeryDifferent);
        assert.ok(qualityLow >= 0);
        assert.ok(qualityLow <= 1);
    });

    test('calculateSSIM is deprecated and maps to PSNR quality', () => {
        const buf1 = new Uint8Array([100, 100, 100]);
        const buf2 = new Uint8Array([100, 100, 100]);
        
        const ssim = RestorationMetrics.calculateSSIM(buf1, buf2);
        const quality = RestorationMetrics.estimateQualityFromPSNR(buf1, buf2);
        
        assert.strictEqual(ssim, quality);
    });

    test('Should handle ArrayBuffer views (Uint8ClampedArray, etc.)', () => {
        const buf1 = new Uint8ClampedArray([100, 100, 100]);
        const buf2 = new Uint8ClampedArray([100, 100, 100]);
        
        const mse = RestorationMetrics.calculateMSE(buf1, buf2);
        assert.strictEqual(mse, 0);
    });

    test('PSNR should decrease as error increases', () => {
        const base = new Uint8Array([0, 0, 0, 0]);
        const smallError = new Uint8Array([1, 1, 1, 1]);
        const largeError = new Uint8Array([100, 100, 100, 100]);
        
        const psnrSmall = RestorationMetrics.calculatePSNR(base, smallError);
        const psnrLarge = RestorationMetrics.calculatePSNR(base, largeError);
        
        assert.ok(psnrSmall > psnrLarge, 'Smaller error should have higher PSNR');
    });

    test('Quality estimate should be higher for similar images', () => {
        const base = new Uint8Array(100).fill(128);
        const similar = new Uint8Array(100).fill(130);
        const different = new Uint8Array(100).fill(200);
        
        const qualitySimilar = RestorationMetrics.estimateQualityFromPSNR(base, similar);
        const qualityDifferent = RestorationMetrics.estimateQualityFromPSNR(base, different);
        
        assert.ok(qualitySimilar > qualityDifferent);
    });

    test('Quality estimate boundary cases', () => {
        const a = new Uint8Array([0]);
        const b = new Uint8Array([255]);
        
        const quality = RestorationMetrics.estimateQualityFromPSNR(a, b);
        
        assert.ok(quality >= 0);
        assert.ok(quality <= 1);
    });
});
