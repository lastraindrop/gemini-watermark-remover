/**
 * Gradient Formula Consistency Test (P0)
 *
 * Verifies that all 3 gradient-filtering sites in detector.js use the same
 * weighted blend formula via the shared `blendMultiDimensionalScore` helper.
 * This catches the BUG-C1 regression: the jitter search site previously used
 * an old multiplicative penalty formula instead of the weighted blend.
 *
 * The 3 sites are:
 *   1. detectWatermark Phase 2 fine-tune (detector.js ~L274)
 *   2. calculateProbeConfidence main probe (detector.js ~L558)
 *   3. calculateProbeConfidence jitter search (detector.js ~L585)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const detectorSource = readFileSync(resolve(process.cwd(), 'src/core/detector.js'), 'utf8');

describe('Gradient Formula Consistency (BUG-C1 guard)', () => {

    test('blendMultiDimensionalScore helper exists and is called from all 3 sites', () => {
        // The helper must be defined
        assert.ok(
            detectorSource.includes('function blendMultiDimensionalScore'),
            'blendMultiDimensionalScore helper must be defined in detector.js'
        );

        // Count call sites — should be exactly 3 (Phase 2, main probe, jitter)
        const callPattern = /blendMultiDimensionalScore\(/g;
        const matches = detectorSource.match(callPattern) || [];
        // 1 definition + 3 call sites = 4 total occurrences of the name
        assert.ok(
            matches.length >= 4,
            `blendMultiDimensionalScore should be called from 3 sites (found ${matches.length - 1} calls)`
        );
    });

    test('no old multiplicative penalty formula remains in gradient paths', () => {
        // The old formula was: `combined * Math.min(gradientPenalty, 0.50)`
        // This must NOT appear anywhere in detector.js
        const oldFormula = /combined\s*\*\s*Math\.min\s*\(\s*gradientPenalty/;
        assert.ok(
            !oldFormula.test(detectorSource),
            'Old multiplicative penalty formula (combined * min(gradientPenalty, 0.50)) must not exist'
        );
    });

    test('weighted blend uses DETECTION_THRESHOLDS weights, not hardcoded values', () => {
        // The blendMultiDimensionalScore function must reference DETECTION_THRESHOLDS
        // for SPATIAL_WEIGHT, GRADIENT_WEIGHT, VARIANCE_WEIGHT
        const helperBody = detectorSource.match(/function blendMultiDimensionalScore[\s\S]*?^}/m)?.[0] || '';
        assert.ok(
            helperBody.includes('DETECTION_THRESHOLDS.SPATIAL_WEIGHT'),
            'blendMultiDimensionalScore must use DETECTION_THRESHOLDS.SPATIAL_WEIGHT'
        );
        assert.ok(
            helperBody.includes('DETECTION_THRESHOLDS.GRADIENT_WEIGHT'),
            'blendMultiDimensionalScore must use DETECTION_THRESHOLDS.GRADIENT_WEIGHT'
        );
        assert.ok(
            helperBody.includes('DETECTION_THRESHOLDS.VARIANCE_WEIGHT'),
            'blendMultiDimensionalScore must use DETECTION_THRESHOLDS.VARIANCE_WEIGHT'
        );
    });

    test('jitter search gradient path calls blendMultiDimensionalScore (not inline formula)', () => {
        // Extract the jitter search block (inside the `for(let dy=-jitter` loop)
        // and verify it calls the helper instead of inlining the formula
        const jitterBlock = detectorSource.match(/for\s*\(\s*let\s+dy\s*=\s*-jitter[\s\S]*?return\s*\{\s*confidence:\s*bestConf/m)?.[0] || '';
        assert.ok(
            jitterBlock.length > 0,
            'Jitter search block should be found'
        );
        assert.ok(
            jitterBlock.includes('blendMultiDimensionalScore'),
            'Jitter search deepScan path must call blendMultiDimensionalScore'
        );
    });

    test('DETECTION_THRESHOLDS weights sum to 1.0', async () => {
        const { DETECTION_THRESHOLDS } = await import('../src/core/config.js');
        const sum = DETECTION_THRESHOLDS.SPATIAL_WEIGHT
            + DETECTION_THRESHOLDS.GRADIENT_WEIGHT
            + DETECTION_THRESHOLDS.VARIANCE_WEIGHT;
        assert.ok(
            Math.abs(sum - 1.0) < 0.001,
            `Weights must sum to 1.0, got ${sum}`
        );
    });
});
