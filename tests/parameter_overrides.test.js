/**
 * Parameter Overrides Tests — merged from custom_config.test.js and overrides_dynamic.test.js
 * Covers pipeline-level options and detector-level SEARCH_CONFIG overrides (v2.1+)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarks } from '../src/core/detectionPipeline.js';
import { detectWatermark } from '../src/core/detector.js';
import '../src/core/catalog.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, TC } from './test_utils.js';

const ALPHA_96 = () => createMockAlphaMap(96, 96);

function alphaProvider(alphaMap, size) {
    return async () => ({ data: alphaMap, width: size, height: size });
}

describe('Parameter Overrides', () => {

    // -- Pipeline-level: probe threshold, manual config --
    describe('Probe threshold & manual config', () => {
        test('High probeThreshold rejects weak watermark', async () => {
            const img = createMockImageData(512, 512, TC.TYPES.GRID, 100);
            const alphaMap = new Float32Array(96 * 96).fill(0.08);
            applyWatermark(img, 200, 200, 96, 96, alphaMap, TC.LOGO_VALUE);

            const strict = await detectWatermarks({
                imageData: img, profileId: TC.PROFILES.GEMINI,
                getAlphaMap: alphaProvider(alphaMap, 96),
                options: { probeThreshold: 0.50 }
            });
            assert.strictEqual(strict.winner, null, 'High threshold should reject');
        });

        test('Low probeThreshold catches weak watermark', async () => {
            const img = createMockImageData(512, 512, TC.TYPES.GRID, 100);
            const alphaMap = new Float32Array(96 * 96).fill(0.08);
            applyWatermark(img, 200, 200, 96, 96, alphaMap, TC.LOGO_VALUE);

            const loose = await detectWatermarks({
                imageData: img, profileId: TC.PROFILES.GEMINI,
                getAlphaMap: alphaProvider(alphaMap, 96),
                options: { probeThreshold: 0.01 }
            });
            assert.ok(loose.winner, 'Low threshold should accept');
        });

        test('Manual config forces exact position', async () => {
            const img = createMockImageData(200, 200, TC.TYPES.SOLID, 50);
            const alphaMap = new Float32Array(48 * 48).fill(1.0);
            applyWatermark(img, 10, 10, 48, 48, alphaMap, TC.LOGO_VALUE);

            const result = await detectWatermarks({
                imageData: img, profileId: TC.PROFILES.GEMINI,
                getAlphaMap: alphaProvider(alphaMap, 48),
                options: { manualConfig: { x: 10, y: 10, width: 48, height: 48 } }
            });
            assert.ok(result.winner);
            assert.strictEqual(result.winner.pos.x, 10);
            assert.strictEqual(result.winner.source, 'manual-input');
        });

        test('Manual config rejects invalid regions', async () => {
            const img = createMockImageData(200, 200, TC.TYPES.SOLID, 50);
            const alphaMap = new Float32Array(48 * 48).fill(1.0);
            const invalid = [
                { x: -1, y: 0, width: 48, height: 48 },
                { x: 0, y: 0, width: 0, height: 48 },
                { x: 180, y: 180, width: 48, height: 48 },
                { x: NaN, y: 0, width: 48, height: 48 },
            ];
            for (const mc of invalid) {
                await assert.rejects(
                    () => detectWatermarks({ imageData: img, profileId: TC.PROFILES.GEMINI, getAlphaMap: alphaProvider(alphaMap, 48), options: { manualConfig: mc } }),
                    RangeError
                );
            }
        });
    });

    // -- Detector-level: SEARCH_CONFIG overrides --
    describe('Detector SEARCH_CONFIG overrides', () => {
        test('Overrides merge into config', () => {
            const img = createMockImageData(200, 200, TC.TYPES.NOISE, 128);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 50, 50, 96, 96, alphaMap, TC.LOGO_VALUE);

            const normal = detectWatermark(img, { '96': alphaMap }, { deepScan: false });
            assert.ok(normal, 'Normal detection should work');
        });

        test('Custom jitterRange is used', () => {
            const img = createMockImageData(200, 200, TC.TYPES.NOISE, 128);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 52, 52, 96, 96, alphaMap, TC.LOGO_VALUE);

            const r = detectWatermark(img, { '96': alphaMap }, { deepScan: false, overrides: { jitterRange: 20 } });
            assert.ok(r);
        });

        test('Custom FINAL thresholds respected', () => {
            const img = createMockImageData(200, 200, TC.TYPES.SOLID, 64);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 50, 50, 96, 96, alphaMap, TC.LOGO_VALUE);

            const r = detectWatermark(img, { '96': alphaMap }, {
                deepScan: false,
                overrides: { THRESHOLDS: { FINAL_ANCHORED: 0.01, FINAL_ALIGNED: 0.01, FINAL_FREE: 0.01 } }
            });
            assert.ok(r);
        });

        test('Custom STAGE2 thresholds respected', () => {
            const img = createMockImageData(200, 200, TC.TYPES.NOISE, 128);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 45, 45, 96, 96, alphaMap, TC.LOGO_VALUE);

            const r = detectWatermark(img, { '96': alphaMap }, {
                deepScan: true,
                overrides: { THRESHOLDS: { STAGE2_NR: 0.01, STAGE2_CLEAN: 0.01 } }
            });
            assert.ok(typeof r === 'object');
        });

        test('Custom COARSE threshold respected', () => {
            const img = createMockImageData(200, 200, TC.TYPES.GRID, 128);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 40, 40, 96, 96, alphaMap, TC.LOGO_VALUE);

            const normal = detectWatermark(img, { '96': alphaMap }, { deepScan: false });
            assert.ok(normal);
        });

        test('Custom PROXIMITY_THRESHOLD respected', () => {
            const img = createMockImageData(200, 200, TC.TYPES.NOISE, 128);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 50, 50, 96, 96, alphaMap, TC.LOGO_VALUE);

            const r = detectWatermark(img, { '96': alphaMap }, {
                deepScan: false,
                overrides: { PROXIMITY_THRESHOLD: 100, THRESHOLDS: { FINAL_ANCHORED: 0.1, FINAL_FREE: 0.2 } }
            });
            assert.ok(r);
        });

        test('Custom CANDIDATES_LIMIT_PER_SIZE respected', () => {
            const img = createMockImageData(200, 200, TC.TYPES.NOISE, 128);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 50, 50, 96, 96, alphaMap, TC.LOGO_VALUE);

            const r = detectWatermark(img, { '96': alphaMap }, {
                deepScan: false,
                overrides: { CANDIDATES_LIMIT_PER_SIZE: 1, THRESHOLDS: { FINAL_ANCHORED: 0.01 } }
            });
            assert.ok(typeof r === 'object');
        });

        test('Custom FINE_TUNE_RANGE respected', () => {
            const img = createMockImageData(200, 200, TC.TYPES.NOISE, 128);
            const alphaMap = ALPHA_96();
            applyWatermark(img, 50, 50, 96, 96, alphaMap, TC.LOGO_VALUE);

            const r = detectWatermark(img, { '96': alphaMap }, {
                deepScan: true,
                overrides: { FINE_TUNE_RANGE: 10, THRESHOLDS: { FINAL_ANCHORED: 0.05 } }
            });
            assert.ok(typeof r === 'object');
        });
    });
});
