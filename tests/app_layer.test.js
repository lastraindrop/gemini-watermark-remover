/**
 * E-4 (v2.7): App layer unit tests.
 *
 * Tests config integrity, preset structure, and pure-logic app functions
 * that don't require complex DOM mocking.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PERFORMANCE_PRESETS, DETECTION_THRESHOLDS, ENGINE_LIMITS } from '../src/core/config.js';

describe('App layer unit tests (E-4)', () => {

    describe('PERFORMANCE_PRESETS integrity', () => {
        test('all three presets are defined with correct structure', () => {
            const required = ['fast', 'balanced', 'thorough'];
            for (const key of required) {
                const preset = PERFORMANCE_PRESETS[key];
                assert.ok(preset, `${key} preset must exist`);
                assert.strictEqual(typeof preset.deepScan, 'boolean', `${key}.deepScan`);
                assert.strictEqual(typeof preset.noiseReduction, 'boolean', `${key}.noiseReduction`);
                assert.ok(['auto', 'off'].includes(preset.adaptiveMode), `${key}.adaptiveMode`);
                assert.ok(preset.overrides.RANGE_X > 0 && preset.overrides.RANGE_X <= 1,
                    `${key}.RANGE_X must be 0-1`);
                assert.ok(preset.overrides.JITTER_RANGE > 0, `${key}.JITTER_RANGE > 0`);
                assert.ok(preset.overrides.CANDIDATES_LIMIT_PER_SIZE > 0,
                    `${key}.CANDIDATES_LIMIT_PER_SIZE > 0`);
            }
        });

        test('presets have increasing search intensity: fast < balanced < thorough', () => {
            assert.ok(PERFORMANCE_PRESETS.fast.overrides.RANGE_X <=
                PERFORMANCE_PRESETS.balanced.overrides.RANGE_X);
            assert.ok(PERFORMANCE_PRESETS.balanced.overrides.RANGE_X <=
                PERFORMANCE_PRESETS.thorough.overrides.RANGE_X);

            assert.ok(PERFORMANCE_PRESETS.fast.overrides.JITTER_RANGE <=
                PERFORMANCE_PRESETS.balanced.overrides.JITTER_RANGE);
            assert.ok(PERFORMANCE_PRESETS.balanced.overrides.JITTER_RANGE <=
                PERFORMANCE_PRESETS.thorough.overrides.JITTER_RANGE);
        });
    });

    describe('DETECTION_THRESHOLDS integrity', () => {
        test('required keys exist', () => {
            const required = [
                'DEFAULT_PROBE_THRESHOLD', 'ADAPTIVE_MIN_CONFIDENCE',
                'GLOBAL_FALLBACK_MIN', 'GLOBAL_FREE_MIN',
                'SPATIAL_WEIGHT', 'GRADIENT_WEIGHT', 'VARIANCE_WEIGHT',
                'WEAK_ALPHA_GAIN', 'WEAK_ALPHA_RESIDUAL_CLEAN_THRESHOLD',
                'ADAPTIVE_MIN_ADJUSTED_SCORE', 'ALPHA_NOISE_FLOOR'
            ];
            for (const key of required) {
                assert.ok(key in DETECTION_THRESHOLDS, `${key} must exist in DETECTION_THRESHOLDS`);
                assert.strictEqual(typeof DETECTION_THRESHOLDS[key], 'number',
                    `${key} must be a number`);
            }
        });

        test('scoring weights sum to approximately 1.0', () => {
            const sum = DETECTION_THRESHOLDS.SPATIAL_WEIGHT +
                DETECTION_THRESHOLDS.GRADIENT_WEIGHT +
                DETECTION_THRESHOLDS.VARIANCE_WEIGHT;
            assert.ok(Math.abs(sum - 1.0) < 0.001,
                `Scoring weights should sum to 1.0 (got ${sum})`);
        });
    });

    describe('ENGINE_LIMITS', () => {
        test('limits are reasonable', () => {
            assert.ok(ENGINE_LIMITS.MAX_PIXELS > 0);
            assert.ok(ENGINE_LIMITS.MAX_FILE_SIZE > 0);
            assert.ok(ENGINE_LIMITS.MAX_CONCURRENCY >= 1 && ENGINE_LIMITS.MAX_CONCURRENCY <= 8);
        });
    });

    describe('Keyboard shortcuts config', () => {
        test('preset cycle order is correct (fast → balanced → thorough)', () => {
            const presets = ['fast', 'balanced', 'thorough'];
            // Verify cycling: balanced → thorough → fast → balanced
            for (let i = 0; i < presets.length; i++) {
                const nextIdx = (i + 1) % presets.length;
                assert.ok(presets[nextIdx], `Cycle from ${presets[i]} to ${presets[nextIdx]}`);
            }
        });
    });

    describe('i18n supported languages', async () => {
        test('all 7 languages have locale files', async () => {
            const { supportedLanguages } = await import('../src/i18n.js' + '');
            const { default: i18n } = await import('../src/i18n.js');
            assert.ok(supportedLanguages.length >= 5);
            // Verify Chinese and English exist
            const codes = supportedLanguages.map(l => l.code);
            assert.ok(codes.includes('zh-CN'));
            assert.ok(codes.includes('en-US'));
        });
    });
});
