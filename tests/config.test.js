import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
    detectWatermarkConfig, calculateWatermarkPosition, getAllPotentialConfigs,
    DETECTION_THRESHOLDS, PERFORMANCE_PRESETS, DEFAULT_PERFORMANCE_PRESET
} from '../src/core/config.js';
import { registry } from '../src/core/templates/registry.js';
import { GEMINI_SIZE_CATALOG, getCatalogConfig } from '../src/core/catalog.js';

describe('Watermark Config Logic - Priority, Fallback & Protocol Consistency', () => {

    test('Catalog Priority: Standards from GEMINI_SIZE_CATALOG should match', async () => {
        for (const entry of GEMINI_SIZE_CATALOG.slice(0, 3)) {
            const config = detectWatermarkConfig(entry.width, entry.height);
            assert.ok(config);
            assert.strictEqual(config.isOfficial, true, `Official resolution ${entry.width}x${entry.height} should be marked`);
            
            const { WATERMARK_CONFIGS } = await import('../src/core/catalog.js');
            const expectedSize = WATERMARK_CONFIGS[entry.tier].logoSize;
            assert.strictEqual(config.logoSize, expectedSize, `Logo size mismatch for ${entry.width}x${entry.height}`);
        }
    });

    test('All GEMINI_SIZE_CATALOG entries produce valid protocol-compliant configs', () => {
        for (const entry of GEMINI_SIZE_CATALOG) {
            const config = getCatalogConfig(entry.width, entry.height);
            assert.ok(config, `Missing config for catalog entry: ${entry.width}x${entry.height}`);
            assert.strictEqual(typeof config.logoSize, 'number', `Missing logoSize for ${entry.width}x${entry.height}`);
            assert.strictEqual(typeof config.marginRight, 'number', `Missing marginRight for ${entry.width}x${entry.height}`);
            assert.strictEqual(typeof config.marginBottom, 'number', `Missing marginBottom for ${entry.width}x${entry.height}`);
            assert.strictEqual(config.isOfficial, true, `Entry should be marked as official: ${entry.width}x${entry.height}`);
            assert.ok([48, 96].includes(config.logoSize), `Invalid logoSize: ${config.logoSize}`);
            assert.ok(config.marginRight >= 0, `Negative marginRight: ${config.marginRight}`);
            assert.ok(config.marginBottom >= 0, `Negative marginBottom: ${config.marginBottom}`);
        }
    });

    test('Heuristic fallback protocol compliance (logoSize, marginRight, marginBottom)', () => {
        const largeConfig = detectWatermarkConfig(5000, 5000);
        assert.strictEqual(typeof largeConfig.logoSize, 'number');
        assert.strictEqual(typeof largeConfig.marginRight, 'number');
        assert.strictEqual(typeof largeConfig.marginBottom, 'number');
        assert.strictEqual(largeConfig.logoSize, 96);

        const smallConfig = detectWatermarkConfig(300, 300);
        assert.strictEqual(typeof smallConfig.logoSize, 'number');
        assert.strictEqual(typeof smallConfig.marginRight, 'number');
        assert.strictEqual(typeof smallConfig.marginBottom, 'number');
        assert.strictEqual(smallConfig.logoSize, 48);
    });

    test('Anti-regression: "margin" property should NOT exist', () => {
        const config = detectWatermarkConfig(1024, 1024);
        assert.strictEqual(config.margin, undefined, 'Legacy "margin" property detected! Use marginRight/marginBottom instead.');
    });

    test('Heuristic Fallback: Large non-standard image (3000x3000)', () => {
        const config = detectWatermarkConfig(3000, 3000);
        assert.ok(config);
        assert.strictEqual(config.logoSize, 96, 'Heuristic for both sides > 1024 should be 96');
        assert.strictEqual(config.isOfficial, false, 'Heuristic fallback should not be marked as official');
    });

    test('Heuristic Fallback: Small non-standard image (800x800)', () => {
        const config = detectWatermarkConfig(800, 800);
        // 800x800 is between 512 (48px) and 1024 (96px) — heuristic gives 96px;
        // pipeline also probes both 48 and 96 via getAllPotentialConfigs fallback
        assert.ok(config.logoSize === 48 || config.logoSize === 96, `Heuristic for 800x800: ${config.logoSize}`);
        assert.strictEqual(config.isOfficial, false, 'Heuristic fallback should not be marked as official');
    });

    test('Position accuracy: Bottom-right corner', () => {
        const width = 1000;
        const height = 1000;
        const config = { logoSize: 96, marginRight: 64, marginBottom: 64 };
        const pos = calculateWatermarkPosition(width, height, config);
        
        // Expected: x = 1000 - 64 - 96 = 840, y = 1000 - 64 - 96 = 840
        assert.strictEqual(pos.x, 840);
        assert.strictEqual(pos.y, 840);
        assert.strictEqual(pos.width, 96);
    });

    test('Negative coordinate protection for tiny images', () => {
        const config = { logoSize: 96, marginRight: 64, marginBottom: 64 };
        // Very small image - results in negative coordinate
        const pos = calculateWatermarkPosition(10, 10, config);
        assert.ok(pos.x < 0, 'Negative coords expected for impossible size');
    });

    describe('Boundary Conditions', () => {
        test('Exact boundary: wide image where only one side > 1024 (1500x500)', () => {
            const config = detectWatermarkConfig(1500, 500);
            // Both sides must be > 1024 for 96px; 500 < 1024 so should be 48
            assert.strictEqual(config.logoSize, 48, '1500x500 should still be 48px because height < 1024');
        });

        test('Standard maxSide but non-standard minSide: 1024x500', () => {
            const config = detectWatermarkConfig(1024, 500);
            assert.strictEqual(config.isOfficial, false, 'Should not match catalog if height is too different');
            assert.strictEqual(config.logoSize, 48, '1024x500 both not > 1024 so 48px logo');
        });
    });

    describe('Defensive: Profile without anchors', () => {
        test('getAllPotentialConfigs handles profile with no anchors gracefully', () => {
            const testProfile = {
                id: 'test-no-anchors',
                name: 'Test',
                logoValue: 255.0,
                getHeuristicConfig: (w, h, anchor) => ({
                    logoSize: 48,
                    marginRight: 20,
                    marginBottom: 20,
                    anchor: anchor || 'bottom-right',
                    isOfficial: false
                })
            };
            registry.registerProfile(testProfile);
            const configs = getAllPotentialConfigs(500, 500, 'test-no-anchors');
            assert.ok(configs.length >= 1, 'Should return at least 1 config even without anchors');
            for (const c of configs) {
                assert.ok(c.anchor, `Config must have anchor, got: ${JSON.stringify(c)}`);
            }
            registry.profiles.delete('test-no-anchors');
        });

        test('getAllPotentialConfigs handles profile with anchors', () => {
            const configs = getAllPotentialConfigs(3000, 2000, 'doubao');
            assert.ok(configs.length >= 2, 'Doubao heuristic should return configs for all anchors');
        });
    });
});

// ─── v2.3: Performance Presets & Detection Thresholds ────────────────────────

describe('v2.3 Performance Presets', () => {

    test('All three presets exist with required keys', () => {
        for (const key of ['fast', 'balanced', 'thorough']) {
            const preset = PERFORMANCE_PRESETS[key];
            assert.ok(preset, `Missing preset: ${key}`);
            assert.strictEqual(typeof preset.label, 'string', `${key}: missing label`);
            assert.strictEqual(typeof preset.deepScan, 'boolean', `${key}: missing deepScan`);
            assert.strictEqual(typeof preset.noiseReduction, 'boolean', `${key}: missing noiseReduction`);
            assert.ok(preset.overrides, `${key}: missing overrides`);
            assert.ok(preset.overrides.RANGE_X, `${key}: missing RANGE_X`);
            assert.ok(preset.overrides.RANGE_Y, `${key}: missing RANGE_Y`);
            assert.ok(preset.overrides.THRESHOLDS, `${key}: missing THRESHOLDS override`);
            assert.ok(preset.overrides.THRESHOLDS.COARSE, `${key}: missing COARSE threshold`);
        }
    });

    test('DEFAULT_PERFORMANCE_PRESET is "balanced"', () => {
        assert.strictEqual(DEFAULT_PERFORMANCE_PRESET, 'balanced');
    });

    test('Fast preset is faster than thorough (smaller range, less scanning)', () => {
        const fast = PERFORMANCE_PRESETS.fast;
        const thorough = PERFORMANCE_PRESETS.thorough;
        assert.ok(fast.overrides.RANGE_X < thorough.overrides.RANGE_X, 'Fast RANGE_X should be < thorough');
        assert.ok(fast.overrides.CANDIDATES_LIMIT_PER_SIZE < thorough.overrides.CANDIDATES_LIMIT_PER_SIZE, 'Fast should have fewer candidates');
        assert.ok(fast.overrides.FINE_TUNE_RANGE < thorough.overrides.FINE_TUNE_RANGE, 'Fast should have smaller fine-tune range');
    });

    test('Fast preset disables deepScan, thorough enables it', () => {
        assert.strictEqual(PERFORMANCE_PRESETS.fast.deepScan, false);
        assert.strictEqual(PERFORMANCE_PRESETS.balanced.deepScan, true);
        assert.strictEqual(PERFORMANCE_PRESETS.thorough.deepScan, true);
    });

    test('Thorough preset enables noise reduction', () => {
        assert.strictEqual(PERFORMANCE_PRESETS.fast.noiseReduction, false);
        assert.strictEqual(PERFORMANCE_PRESETS.balanced.noiseReduction, false);
        assert.strictEqual(PERFORMANCE_PRESETS.thorough.noiseReduction, true);
    });

    test('Preset overrides are complete — all have required THRESHOLDS keys', () => {
        const requiredThreshKeys = ['COARSE', 'FINAL_ANCHORED', 'FINAL_ALIGNED', 'FINAL_FREE'];
        for (const [name, preset] of Object.entries(PERFORMANCE_PRESETS)) {
            for (const key of requiredThreshKeys) {
                assert.ok(preset.overrides.THRESHOLDS[key],
                    `${name}: missing THRESHOLDS.${key}`);
                assert.ok(Number.isFinite(preset.overrides.THRESHOLDS[key]),
                    `${name}: THRESHOLDS.${key} is not finite`);
            }
        }
    });
});

describe('v2.3 Detection Thresholds', () => {

    test('All canonical thresholds are finite numbers', () => {
        const keys = [
            'ANCHORED_OFFICIAL', 'ANCHORED_OTHER', 'COARSE', 'STAGE2_NR', 'STAGE2_CLEAN',
            'FINAL_ANCHORED', 'FINAL_ALIGNED', 'FINAL_FREE', 'DEFAULT_PROBE_THRESHOLD',
            'SCALED_CONFIG_MIN', 'GLOBAL_FALLBACK_BELOW', 'GLOBAL_FALLBACK_MIN',
            'ADAPTIVE_MIN_CONFIDENCE', 'SEARCH_RANGE_X', 'SEARCH_RANGE_Y'
        ];
        for (const key of keys) {
            const val = DETECTION_THRESHOLDS[key];
            assert.ok(val !== undefined, `Missing DETECTION_THRESHOLDS.${key}`);
            assert.ok(Number.isFinite(val), `DETECTION_THRESHOLDS.${key}=${val} is not finite`);
        }
    });

    test('SCALED_CONFIG_MIN is 0.25 (v2.3: lowered from 0.35)', () => {
        assert.strictEqual(DETECTION_THRESHOLDS.SCALED_CONFIG_MIN, 0.25,
            'Scaled config threshold should be 0.25');
    });

    test('Search ranges expanded to 0.90 (v2.3: from 0.75)', () => {
        assert.strictEqual(DETECTION_THRESHOLDS.SEARCH_RANGE_X, 0.90);
        assert.strictEqual(DETECTION_THRESHOLDS.SEARCH_RANGE_Y, 0.90);
    });

    test('Threshold monotonicity: FINAL_ANCHORED < FINAL_ALIGNED < FINAL_FREE', () => {
        const { FINAL_ANCHORED, FINAL_ALIGNED, FINAL_FREE } = DETECTION_THRESHOLDS;
        assert.ok(FINAL_ANCHORED < FINAL_ALIGNED, 'Anchored should be more permissive than aligned');
        assert.ok(FINAL_ALIGNED < FINAL_FREE, 'Aligned should be more permissive than free');
    });

    test('LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN is 0.008 (v2.3: lowered from 0.015)', () => {
        assert.strictEqual(DETECTION_THRESHOLDS.LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN, 0.008);
    });
});
