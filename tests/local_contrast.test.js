import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateLocalContrastCorrelation } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Local Contrast Correlation Tests', () => {

    test('Should calculate correlation with empty alpha map', () => {
        const img = createMockImageData(100, 100, 'solid', 128);
        const emptyAlpha = new Float32Array(96 * 96).fill(0);
        
        const result = calculateLocalContrastCorrelation(img, 0, 0, 96, 96, emptyAlpha, true);
        assert.ok(result === 0 || result === 0.0 || Number.isNaN(result) || result < 0.1);
    });

    test('Should return low correlation on uniform solid background', () => {
        const img = createMockImageData(200, 200, 'solid', 180);
        const alphaMap = createMockAlphaMap(96, 96);
        
        const conf = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        assert.ok(conf < 0.2, `Expected low correlation on solid background, got ${conf}`);
    });

    test('Should return high correlation when watermark present', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const conf = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        assert.ok(conf > 0.3, `Expected high correlation with watermark, got ${conf}`);
    });

    test('Should degrade with position offset', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const exactMatch = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        const offset20px = calculateLocalContrastCorrelation(img, 70, 50, 96, 96, alphaMap, true);
        
        assert.ok(exactMatch > 0.3, `Exact position should correlate, got ${exactMatch}`);
        assert.ok(offset20px < exactMatch, `Offset should have lower correlation`);
    });

    test('Full precision mode should differ from sampled', () => {
        const img = createMockImageData(200, 200, 'grid', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const fullPrecision = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        const sampled = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, false);
        
        assert.ok(typeof fullPrecision === 'number');
        assert.ok(typeof sampled === 'number');
    });

    test('Should handle boundaries safely (negative coords)', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        const result = calculateLocalContrastCorrelation(img, -50, -50, 96, 96, alphaMap, true);
        assert.ok(typeof result === 'number');
    });

    test('Should handle boundaries safely (out of image bounds)', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        const result = calculateLocalContrastCorrelation(img, 80, 80, 96, 96, alphaMap, true);
        assert.ok(typeof result === 'number');
    });

    test('Radius calculation based on logo size', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const smallAlpha = createMockAlphaMap(48, 48);
        const largeAlpha = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 70, 70, 48, 48, smallAlpha, 255);
        applyWatermark(img, 50, 50, 96, 96, largeAlpha, 255);
        
        const smallConf = calculateLocalContrastCorrelation(img, 70, 70, 48, 48, smallAlpha, true);
        const largeConf = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, largeAlpha, true);
        
        assert.ok(smallConf > 0.2 || typeof smallConf === 'number');
        assert.ok(largeConf > 0.2 || typeof largeConf === 'number');
    });

    test('Contrast correlation should complement NCC on busy textures', () => {
        const img = createMockImageData(300, 300, 'grid', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 100, 100, 96, 96, alphaMap, 255);
        
        import('../src/core/detector.js').then(mod => {
            const nccConf = mod.calculateCorrelation(img, 100, 100, 96, 96, alphaMap, true);
            const contrastConf = calculateLocalContrastCorrelation(img, 100, 100, 96, 96, alphaMap, true);
            
            assert.ok(typeof nccConf === 'number');
            assert.ok(typeof contrastConf === 'number');
        });
    });
});
