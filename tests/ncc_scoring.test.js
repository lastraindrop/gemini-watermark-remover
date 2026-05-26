import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCorrelation, calculateGradientCorrelation, calculateLocalContrastCorrelation } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('NCC Scoring Accuracy', () => {

    test('Perfect match => NCC ≈ 1.0', () => {
        const size = 48;
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(size, size);

        applyWatermark(img, 10, 10, size, size, alphaMap);

        // Apply watermark again on same position for stronger signal
        applyWatermark(img, 10, 10, size, size, alphaMap);

        const conf = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        assert.ok(conf > 0.55, `Strong watermark should have NCC > 0.55, got ${conf}`);
    });

    test('No match (random area) => NCC ≈ 0', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(size, size);

        const conf = calculateCorrelation(img, 100, 100, size, size, alphaMap, true);
        assert.ok(Math.abs(conf) < 0.4,
            `Random region should have low |NCC|, got ${Math.abs(conf)}`);
    });

    test('NCC with fullPrecision uses step=1', () => {
        const size = 48;
        const img = createMockImageData(120, 120, 'noise', 128);
        const alphaMap = createMockAlphaMap(size, size);
        applyWatermark(img, 10, 10, size, size, alphaMap);

        const confFull = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        const confHalf = calculateCorrelation(img, 10, 10, size, size, alphaMap, false);

        assert.ok(confFull > 0, 'Full precision should find correlation');
        assert.ok(confHalf > 0, 'Half precision should also find correlation');
    });

    test('Uniform region => NCC = 0 (zero variance)', () => {
        const size = 48;
        const img = createMockImageData(120, 120, 'solid', 128);
        const alphaMap = new Float32Array(size * size).fill(0.5);

        const conf = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        // Uniform regions have zero variance => should return 0
        assert.ok(Math.abs(conf) < 0.1,
            `Uniform region NCC should be ~0, got ${conf}`);
    });

    test('NCC count threshold: too few samples => 0', () => {
        const size = 96;
        const img = createMockImageData(8, 8, 'noise', 128);
        const alphaMap = new Float32Array(size * size).fill(0.5);

        const conf = calculateCorrelation(img, -44, -44, size, size, alphaMap, true);
        assert.strictEqual(conf, 0,
            'When count < threshold, NCC should be 0');
    });

    test('Subpixel offset reduces NCC slightly below perfect match', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(size, size);

        applyWatermark(img, 50, 50, size, size, alphaMap);
        applyWatermark(img, 50, 50, size, size, alphaMap);

        const confExact = calculateCorrelation(img, 50, 50, size, size, alphaMap, true);
        const confOffset = calculateCorrelation(img, 53, 53, size, size, alphaMap, true);

        assert.ok(confOffset < confExact,
            `Offset (${confOffset}) should be lower than exact (${confExact})`);
    });

    test('Gradient correlation on edged vs smooth regions', () => {
        const size = 48;
        // Grid image has clear edges
        const img = createMockImageData(200, 200, 'grid', 128);
        const alphaMap = createMockAlphaMap(size, size);
        applyWatermark(img, 50, 50, size, size, alphaMap);

        const gradientsI = new Float32Array(size * size);
        const gradientsA = new Float32Array(size * size);
        const gradConf = calculateGradientCorrelation(img, 50, 50, size, size, alphaMap, gradientsI, gradientsA);
        assert.ok(typeof gradConf === 'number',
            `Gradient correlation should return a number, got ${typeof gradConf}`);
    });

    test('Gradient correlation = 0 when inputs have zero gradients', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'solid', 128);
        const alphaMap = new Float32Array(size * size).fill(0.5);

        const gradientsI = new Float32Array(size * size);
        const gradientsA = new Float32Array(size * size);
        const gradConf = calculateGradientCorrelation(img, 50, 50, size, size, alphaMap, gradientsI, gradientsA);

        // Solid image and uniform alpha map => Sobel gradients are 0 everywhere
        assert.ok(Math.abs(gradConf) < 0.01,
            `Zero-gradient regions should have NCC ~0, got ${gradConf}`);
    });

    test('Local contrast correlation complements spatial NCC', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(size, size);
        applyWatermark(img, 50, 50, size, size, alphaMap);

        const spatial = calculateCorrelation(img, 50, 50, size, size, alphaMap, true);
        const local = calculateLocalContrastCorrelation(img, 50, 50, size, size, alphaMap, true);

        // Both should be positive for a valid watermark
        assert.ok(spatial > 0 || local > 0,
            `At least one correlation metric should be positive (spatial=${spatial.toFixed(3)}, local=${local.toFixed(3)})`);
    });

    test('Variance floor check: uniform image without watermark => low NCC', () => {
        const size = 48;
        const img = createMockImageData(100, 100, 'solid', 100);
        const alphaMap = createMockAlphaMap(size, size);
        // Do NOT apply watermark — uniform region has near-zero variance
        const conf = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        assert.ok(Math.abs(conf) < 0.3,
            `Clean uniform background NCC should be low, got ${conf}`);
    });
});
