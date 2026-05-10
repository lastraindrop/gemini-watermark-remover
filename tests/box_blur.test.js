import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCorrelation, detectWatermark } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, addNoise } from './test_utils.js';

describe('Box Blur / Noise Reduction Tests', () => {

    test('Should reuse blur buffer across calls', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        assert.strictEqual(detectWatermark._blurBuffer, undefined);
        
        detectWatermark(img, { '96': alphaMap }, { noiseReduction: true, deepScan: false });
        
        assert.ok(detectWatermark._blurBuffer instanceof Uint8ClampedArray);
        assert.strictEqual(detectWatermark._blurBuffer.length, 200 * 200 * 4);
    });

    test('Should handle same-size images without reallocating', () => {
        const img1 = createMockImageData(100, 100, 'noise', 128);
        const img2 = createMockImageData(100, 100, 'solid', 64);
        const alphaMap = createMockAlphaMap(48, 48);
        
        detectWatermark(img1, { '48': alphaMap }, { noiseReduction: true, deepScan: false });
        const buffer1 = detectWatermark._blurBuffer;
        
        detectWatermark(img2, { '48': alphaMap }, { noiseReduction: true, deepScan: false });
        const buffer2 = detectWatermark._blurBuffer;
        
        assert.strictEqual(buffer1, buffer2);
    });

    test('Should reallocate buffer when image size changes', () => {
        const smallImg = createMockImageData(50, 50, 'noise', 128);
        const largeImg = createMockImageData(200, 200, 'solid', 64);
        const smallAlpha = createMockAlphaMap(24, 24);
        const largeAlpha = createMockAlphaMap(96, 96);
        
        detectWatermark(smallImg, { '24': smallAlpha }, { noiseReduction: true, deepScan: false });
        const buffer1 = detectWatermark._blurBuffer;
        
        detectWatermark(largeImg, { '96': largeAlpha }, { noiseReduction: true, deepScan: false });
        const buffer2 = detectWatermark._blurBuffer;
        
        assert.ok(buffer1.length < buffer2.length);
    });

    test('Noise reduction should not break detection on clean images', () => {
        const img = createMockImageData(200, 200, 'solid', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const withoutNR = detectWatermark(img, { '96': alphaMap }, { noiseReduction: false, deepScan: false });
        const withNR = detectWatermark(img, { '96': alphaMap }, { noiseReduction: true, deepScan: false });
        
        assert.ok(withoutNR || withNR);
        if (withoutNR && withNR) {
            assert.ok(Math.abs(withoutNR.confidence - withNR.confidence) < 0.5);
        }
    });

    test('resetDetectorBuffers should clear shared buffers', () => {
        import('../src/core/detector.js').then(mod => {
            const img = createMockImageData(100, 100, 'solid', 128);
            const alphaMap = createMockAlphaMap(48, 48);
            
            mod.detectWatermark(img, { '48': alphaMap }, { deepScan: true });
            
            assert.ok(mod.detectWatermark._blurBuffer || mod.detectWatermark._sharedGradientsI);
            
            mod.resetDetectorBuffers();
            
            assert.strictEqual(mod.detectWatermark._blurBuffer, null);
            assert.strictEqual(mod.detectWatermark._sharedGradientsI, null);
            assert.strictEqual(mod.detectWatermark._sharedGradientsA, null);
        });
    });

    test('Shared gradients buffer should be reused', () => {
        import('../src/core/detector.js').then(mod => {
            const img = createMockImageData(200, 200, 'grid', 128);
            const alphaMap = createMockAlphaMap(96, 96);
            
            applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
            
            mod.detectWatermark(img, { '96': alphaMap }, { deepScan: true });
            const buffer1 = mod.detectWatermark._sharedGradientsI;
            
            mod.detectWatermark(img, { '96': alphaMap }, { deepScan: true });
            const buffer2 = mod.detectWatermark._sharedGradientsI;
            
            assert.ok(buffer1);
            assert.strictEqual(buffer1, buffer2);
        });
    });
});
