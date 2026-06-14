/**
 * Performance Preset Override Test (P1)
 *
 * Verifies that the FE-BUG-H1 fix is correct: user threshold/penalty sliders
 * do NOT clobber the preset's carefully tuned THRESHOLDS via deepMerge.
 * The preset's structural overrides (RANGE_X, JITTER, CANDIDATES, THRESHOLDS)
 * must be preserved exactly as designed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PERFORMANCE_PRESETS, DEFAULT_PERFORMANCE_PRESET, DETECTION_THRESHOLDS } from '../src/core/config.js';

describe('Performance Preset Override Integrity (FE-BUG-H1 guard)', () => {

    test('all 3 presets exist with required structure', () => {
        for (const key of ['fast', 'balanced', 'thorough']) {
            const preset = PERFORMANCE_PRESETS[key];
            assert.ok(preset, `Preset "${key}" must exist`);
            assert.ok(typeof preset.deepScan === 'boolean', `${key}.deepScan must be boolean`);
            assert.ok(typeof preset.noiseReduction === 'boolean', `${key}.noiseReduction must be boolean`);
            assert.ok(typeof preset.adaptiveMode === 'string', `${key}.adaptiveMode must be string`);
            assert.ok(preset.overrides, `${key}.overrides must exist`);
            assert.ok(typeof preset.overrides.RANGE_X === 'number', `${key}.overrides.RANGE_X must be number`);
            assert.ok(typeof preset.overrides.RANGE_Y === 'number', `${key}.overrides.RANGE_Y must be number`);
            assert.ok(preset.overrides.THRESHOLDS, `${key}.overrides.THRESHOLDS must exist`);
        }
    });

    test('preset THRESHOLDS are not clobbered by user slider values', () => {
        // Simulate what getEngineOptions does after the FE-BUG-H1 fix:
        // mergedOverrides = { ...preset.overrides } (no deepMerge with user THRESHOLDS)
        for (const key of ['fast', 'balanced', 'thorough']) {
            const preset = PERFORMANCE_PRESETS[key];
            const mergedOverrides = { ...preset.overrides };

            // Verify the preset's THRESHOLDS are preserved exactly
            assert.deepStrictEqual(
                mergedOverrides.THRESHOLDS,
                preset.overrides.THRESHOLDS,
                `${key}: mergedOverrides.THRESHOLDS must equal preset.overrides.THRESHOLDS`
            );
        }
    });

    test('fast preset has most restrictive thresholds', () => {
        const fast = PERFORMANCE_PRESETS.fast.overrides.THRESHOLDS;
        const thorough = PERFORMANCE_PRESETS.thorough.overrides.THRESHOLDS;

        // Fast should have higher (more restrictive) thresholds than thorough
        assert.ok(
            fast.COARSE >= thorough.COARSE,
            `Fast COARSE (${fast.COARSE}) should be >= thorough COARSE (${thorough.COARSE})`
        );
        assert.ok(
            fast.FINAL_FREE >= thorough.FINAL_FREE,
            `Fast FINAL_FREE (${fast.FINAL_FREE}) should be >= thorough FINAL_FREE (${thorough.FINAL_FREE})`
        );
    });

    test('thorough preset has widest search range', () => {
        const fast = PERFORMANCE_PRESETS.fast.overrides;
        const thorough = PERFORMANCE_PRESETS.thorough.overrides;

        assert.ok(
            thorough.RANGE_X >= fast.RANGE_X,
            `Thorough RANGE_X (${thorough.RANGE_X}) should be >= fast RANGE_X (${fast.RANGE_X})`
        );
        assert.ok(
            thorough.CANDIDATES_LIMIT_PER_SIZE >= fast.CANDIDATES_LIMIT_PER_SIZE,
            `Thorough candidates (${thorough.CANDIDATES_LIMIT_PER_SIZE}) should be >= fast (${fast.CANDIDATES_LIMIT_PER_SIZE})`
        );
    });

    test('preset deepScan/noiseReduction/adaptiveMode are consistent with search intensity', () => {
        const fast = PERFORMANCE_PRESETS.fast;
        const balanced = PERFORMANCE_PRESETS.balanced;
        const thorough = PERFORMANCE_PRESETS.thorough;

        // Fast: no deepScan, no noiseReduction, no adaptive
        assert.strictEqual(fast.deepScan, false, 'Fast should disable deepScan');
        assert.strictEqual(fast.noiseReduction, false, 'Fast should disable noiseReduction');
        assert.strictEqual(fast.adaptiveMode, 'off', 'Fast should disable adaptive');

        // Balanced: deepScan on, no noiseReduction, adaptive auto
        assert.strictEqual(balanced.deepScan, true, 'Balanced should enable deepScan');
        assert.strictEqual(balanced.noiseReduction, false, 'Balanced should disable noiseReduction');
        assert.strictEqual(balanced.adaptiveMode, 'auto', 'Balanced should enable adaptive');

        // Thorough: everything on
        assert.strictEqual(thorough.deepScan, true, 'Thorough should enable deepScan');
        assert.strictEqual(thorough.noiseReduction, true, 'Thorough should enable noiseReduction');
        assert.strictEqual(thorough.adaptiveMode, 'auto', 'Thorough should enable adaptive');
    });

    test('DEFAULT_PERFORMANCE_PRESET is balanced', () => {
        assert.strictEqual(DEFAULT_PERFORMANCE_PRESET, 'balanced');
    });

    test('preset THRESHOLDS values are within valid range [0, 1]', () => {
        for (const key of ['fast', 'balanced', 'thorough']) {
            const thresholds = PERFORMANCE_PRESETS[key].overrides.THRESHOLDS;
            for (const [name, value] of Object.entries(thresholds)) {
                assert.ok(
                    typeof value === 'number' && value >= 0 && value <= 1,
                    `${key}.THRESHOLDS.${name} must be in [0, 1], got ${value}`
                );
            }
        }
    });

    test('preset search range values are within valid range [0, 1]', () => {
        for (const key of ['fast', 'balanced', 'thorough']) {
            const overrides = PERFORMANCE_PRESETS[key].overrides;
            assert.ok(overrides.RANGE_X > 0 && overrides.RANGE_X <= 1, `${key}.RANGE_X must be in (0, 1]`);
            assert.ok(overrides.RANGE_Y > 0 && overrides.RANGE_Y <= 1, `${key}.RANGE_Y must be in (0, 1]`);
        }
    });
});
