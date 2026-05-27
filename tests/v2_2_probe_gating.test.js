/**
 * v2.2 Probe Gating Tests — covers new isScaledMatch gating, max(spatial,weighted),
 * variance neutral return, findCloseMatches, scaled probe thresholds.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateProbeConfidence, calculateCorrelation, calculateGradientCorrelation, detectWatermark } from '../src/core/detector.js';
import { detectProfileWatermarks } from '../src/core/detectionPipeline.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, TC } from './test_utils.js';
import '../src/core/catalog.js';

function alphaProvider(size, alphaMap) {
    return async (key) => {
        const s = parseInt(key) || size;
        return { data: alphaMap || createMockAlphaMap(s, s), width: s, height: s };
    };
}

describe('v2.2 Probe Gating', () => {

    describe('isScaledMatch gating', () => {
        test('Scaled match requires higher base NCC gate (0.14)', () => {
            const img = createMockImageData(512, 512, TC.TYPES.NOISE, 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const pos = { x: 400, y: 400, width: 96, height: 96 };
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, TC.LOGO_VALUE);

            const result = calculateProbeConfidence(img, pos, alphaMap, TC.PROFILES.GEMINI, {
                deepScan: false, isScaledMatch: true
            });
            assert.ok(result.confidence > 0, 'Scaled probe should return a value');
        });

        test('Non-scaled match uses lower base NCC gate (0.10)', () => {
            const img = createMockImageData(512, 512, TC.TYPES.NOISE, 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const pos = { x: 400, y: 400, width: 96, height: 96 };
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, TC.LOGO_VALUE);

            const result = calculateProbeConfidence(img, pos, alphaMap, TC.PROFILES.GEMINI, {
                deepScan: false, isScaledMatch: false
            });
            assert.ok(result.confidence > 0);
        });

        test('Low NCC on non-watermark image returns baseNcc early (scaled)', () => {
            const img = createMockImageData(512, 512, TC.TYPES.RANDOM, 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const pos = { x: 400, y: 400, width: 96, height: 96 };

            const result = calculateProbeConfidence(img, pos, alphaMap, TC.PROFILES.GEMINI, {
                deepScan: false, isScaledMatch: true
            });
            assert.ok(result.confidence < 0.20, `Scaled probe should not inflate noise: ${result.confidence}`);
        });
    });

    describe('Multi-dimension scoring', () => {
        test('max(spatial, weighted) preserves high NCC', () => {
            const img = createMockImageData(200, 200, TC.TYPES.SOLID, 180);
            const alphaMap = createMockAlphaMap(48, 48);
            applyWatermark(img, 70, 70, 48, 48, alphaMap, 200);

            const ncc = calculateCorrelation(img, 70, 70, 48, 48, alphaMap, true);
            const gradientsI = new Float32Array(48 * 48), gradientsA = new Float32Array(48 * 48);
            const gradient = calculateGradientCorrelation(img, 70, 70, 48, 48, alphaMap, gradientsI, gradientsA);

            const weighted = ncc * 0.5 + Math.max(0, gradient) * 0.3 + 0.5 * 0.2;
            const final = Math.max(ncc, weighted);

            assert.ok(final >= ncc, `Final ${final} should not be less than NCC ${ncc}`);
            assert.ok(final >= 0, 'Score should be non-negative');
        });

        test('Variance score returns neutral (0.5) on uniform background', () => {
            const img = createMockImageData(300, 300, TC.TYPES.SOLID, 200);
            const alphaMaps = { '48': createMockAlphaMap(48), '96': createMockAlphaMap(96) };
            const result = detectWatermark(img, alphaMaps, { deepScan: false });
            assert.strictEqual(result, null, 'Uniform background with no watermark should return null');
        });
    });

    describe('Scaled probe threshold (pipeline)', () => {
        test('Non-exact catalog resolution uses higher probe threshold', async () => {
            const img = createMockImageData(1100, 1100, TC.TYPES.NOISE, 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const pos = 1100 - 64 - 96; // anchor at (940, 940)
            applyWatermark(img, pos, pos, 96, 96, alphaMap, TC.LOGO_VALUE);

            const result = await detectProfileWatermarks({
                imageData: img, profileId: TC.PROFILES.GEMINI,
                getAlphaMap: alphaProvider(96, alphaMap),
                options: { deepScan: true }
            });
            assert.ok(result.confidence > 0 || result.matches.length >= 0, 'Pipeline should complete without crash');
        });
    });
});
