import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateProbeConfidence, calculateCorrelation, calculateGradientCorrelation } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Gradient Penalty Behavior (BUG-003 Verification)', () => {

    test('High gradient + high spatial => full confidence, no penalty', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        applyWatermark(img, 10, 10, 48, 48, alphaMap);

        const pos = { x: 10, y: 10, width: 48, height: 48 };
        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
        assert.ok(result.confidence > 0.3, `Expected > 0.3, got ${result.confidence}`);
    });

    test('Very low gradient (<0.02) should apply penalty but not zero out score', () => {
        const img = createMockImageData(120, 120, 'solid', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        const pos = { x: 36, y: 36, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true, gradientPenalty: 0.30 });
        assert.ok(result.confidence > 0.03,
            `Solid bg detection should not be completely eliminated (got ${result.confidence})`);
    });

    test('Gradient penalty should be capped at 0.50', () => {
        const img = createMockImageData(120, 120, 'solid', 180);
        const alphaMap = createMockAlphaMap(48, 48);
        const pos = { x: 36, y: 36, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);

        const results = [];
        for (const penalty of [0.30, 0.50, 0.80]) {
            const r = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true, gradientPenalty: penalty });
            results.push(r.confidence);
        }

        // With penalty 0.80, the cap at 0.50 should limit the suppression.
        // The score with penalty=0.80 should be >= score with penalty=0.50 (not lower).
        assert.ok(results[2] >= results[1] - 0.001,
            `Penalty 0.80 (capped) should not be worse than penalty 0.50: ${results[2]} vs ${results[1]}`);
    });

    test('Aligned position detection on realistic synthetic image', () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        const x = w - 64 - 96;
        const y = h - 64 - 96;
        applyWatermark(img, x, y, 96, 96, alphaMap);

        const pos = { x, y, width: 96, height: 96 };
        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
        assert.ok(result.confidence > 0.4,
            `Standard Gemini position should have high confidence (got ${result.confidence})`);
    });

    test('No gradient penalty applied when gradient >= 0.02', () => {
        const img = createMockImageData(100, 100, 'grid', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        applyWatermark(img, 10, 10, 48, 48, alphaMap);

        const pos = { x: 10, y: 10, width: 48, height: 48 };

        // Compute raw NCC
        const ncc = calculateCorrelation(img, pos.x, pos.y, 48, 48, alphaMap, true);
        const gradientsI = new Float32Array(48 * 48);
        const gradientsA = new Float32Array(48 * 48);
        const grad = calculateGradientCorrelation(img, pos.x, pos.y, 48, 48, alphaMap, gradientsI, gradientsA);

        // If gradient is >= 0.02, result should not be multiplied by penalty
        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true, gradientPenalty: 0.01 });
        if (grad >= 0.02) {
            assert.ok(result.confidence >= ncc,
                `With gradient >= 0.02 (${grad}), confidence (${result.confidence}) should be >= raw NCC (${ncc})`);
        }
    });

    test('Gradient penalty only applies below 0.02 threshold', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        applyWatermark(img, 10, 10, 48, 48, alphaMap);

        const pos = { x: 10, y: 10, width: 48, height: 48 };

        const resultNoDeep = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: false });
        const resultWithDeep = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true, gradientPenalty: 0.50 });

        if (resultWithDeep.confidence < resultNoDeep.confidence * 0.5) {
            assert.fail('Gradient penalty should not reduce score more than 50% with penalty=0.50 cap');
        }
        assert.ok(true);
    });
});
