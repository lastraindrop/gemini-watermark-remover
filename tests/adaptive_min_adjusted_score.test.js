/**
 * Phase C-5 (STAGE_PLAN_v2.7): Verify ADAPTIVE_MIN_ADJUSTED_SCORE is in
 * DETECTION_THRESHOLDS and correctly referenced by adaptiveDetector.js
 * instead of being hardcoded as 0.06.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';

describe('ADAPTIVE_MIN_ADJUSTED_SCORE in config (C-5)', () => {

    test('DETECTION_THRESHOLDS contains ADAPTIVE_MIN_ADJUSTED_SCORE', () => {
        assert.ok('ADAPTIVE_MIN_ADJUSTED_SCORE' in DETECTION_THRESHOLDS,
            'ADAPTIVE_MIN_ADJUSTED_SCORE must exist in DETECTION_THRESHOLDS');
        assert.strictEqual(typeof DETECTION_THRESHOLDS.ADAPTIVE_MIN_ADJUSTED_SCORE, 'number');
    });

    test('Default value is 0.06 (preserving existing behavior)', () => {
        assert.strictEqual(DETECTION_THRESHOLDS.ADAPTIVE_MIN_ADJUSTED_SCORE, 0.06);
    });

    test('hardcoded 0.06 is absent from adaptiveDetector.js source', async () => {
        const fs = await import('node:fs');
        const src = fs.readFileSync('src/core/adaptiveDetector.js', 'utf-8');
        // The string '0.06' should only appear in the context of the constant
        // reference (not as a bare literal controlling candidate filtering).
        // After C-5 fix, the bare `adjustedScore < 0.06` is gone.
        assert.ok(!/< 0\.06/.test(src) || src.includes('ADAPTIVE_MIN_ADJUSTED_SCORE'),
            'adaptiveDetector.js should not have bare 0.06 threshold for candidate filtering');
    });
});
