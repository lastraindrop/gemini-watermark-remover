/**
 * Threshold Single-Source-of-Truth Integrity Test (P0)
 *
 * Verifies that detector.js does not contain hardcoded numeric literals for
 * detection-tuning thresholds that should be sourced from DETECTION_THRESHOLDS
 * in config.js. This catches the Phase 2.1 regression: magic numbers scattered
 * across detector.js that diverge from the config center.
 *
 * Strategy: Parse detector.js source and check that known threshold values
 * appear only as DETECTION_THRESHOLDS.XXX references, not as bare literals.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const detectorSource = readFileSync(resolve(process.cwd(), 'src/core/detector.js'), 'utf8');

// These are the threshold values that MUST be referenced via DETECTION_THRESHOLDS
// (not hardcoded as bare literals in detector.js logic).
// Each entry: { value, name, allowedContexts }
// allowedContexts: regex patterns where the literal is OK (e.g., in comments, in config.js imports)
const THRESHOLD_LITERALS = [
    { value: '0.02', name: 'GRADIENT_IGNORE_GATE', pattern: /DETECTION_THRESHOLDS\.GRADIENT_IGNORE_GATE/ },
    { value: '0.12', name: 'GRADIENT_BOOST_GATE_EXACT', pattern: /DETECTION_THRESHOLDS\.GRADIENT_BOOST_GATE_EXACT/ },
    { value: '0.18', name: 'GRADIENT_BOOST_GATE_SCALED', pattern: /DETECTION_THRESHOLDS\.GRADIENT_BOOST_GATE_SCALED/ },
    { value: '0.10', name: 'EXACT_NCC_GATE', pattern: /DETECTION_THRESHOLDS\.EXACT_NCC_GATE/ },
    { value: '0.14', name: 'SCALED_NCC_GATE', pattern: /DETECTION_THRESHOLDS\.SCALED_NCC_GATE/ },
    { value: '0.50', name: 'JITTER_FINETUNE_TRIGGER', pattern: /DETECTION_THRESHOLDS\.JITTER_FINETUNE_TRIGGER/ },
    { value: '0.30', name: 'MODE_BOOST_ANCHORED', pattern: /DETECTION_THRESHOLDS\.MODE_BOOST_ANCHORED/ },
];

describe('Threshold Single-Source-of-Truth Integrity', () => {

    test('DETECTION_THRESHOLDS is imported in detector.js', () => {
        assert.ok(
            detectorSource.includes("import { DETECTION_THRESHOLDS }") ||
            detectorSource.includes("DETECTION_THRESHOLDS } from './config.js'"),
            'detector.js must import DETECTION_THRESHOLDS from config.js'
        );
    });

    for (const { value, name, pattern } of THRESHOLD_LITERALS) {
        test(`${name} (${value}) is referenced via DETECTION_THRESHOLDS, not hardcoded`, () => {
            // Check that the DETECTION_THRESHOLDS reference exists
            assert.ok(
                pattern.test(detectorSource),
                `${name} should be referenced as DETECTION_THRESHOLDS.${name} in detector.js`
            );
        });
    }

    test('LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN is referenced via DETECTION_THRESHOLDS', () => {
        assert.ok(
            detectorSource.includes('DETECTION_THRESHOLDS.LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN'),
            'Local contrast alpha residual threshold must use DETECTION_THRESHOLDS reference'
        );
    });

    test('no bare 0.008 literal in calculateLocalContrastCorrelation', () => {
        // Extract the function body
        const fnBody = detectorSource.match(/function calculateLocalContrastCorrelation[\s\S]*?^}/m)?.[0] || '';
        // Check that 0.008 doesn't appear as a bare literal (it should be DETECTION_THRESHOLDS.LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN)
        const bareLiteral = /(?<!DETECTION_THRESHOLDS\.\w+\s*[=!<>]+\s*)\b0\.008\b/;
        // More precise: check lines that contain 0.008 but NOT DETECTION_THRESHOLDS
        const lines = fnBody.split('\n');
        const badLines = lines.filter(line =>
            line.includes('0.008') &&
            !line.includes('DETECTION_THRESHOLDS') &&
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*')
        );
        assert.strictEqual(
            badLines.length, 0,
            `Found bare 0.008 literal in calculateLocalContrastCorrelation: ${badLines.join('; ')}`
        );
    });

    test('config.js DETECTION_THRESHOLDS contains all expected keys', async () => {
        const { DETECTION_THRESHOLDS } = await import('../src/core/config.js');
        const requiredKeys = [
            'GRADIENT_IGNORE_GATE',
            'GRADIENT_BOOST_GATE_EXACT',
            'GRADIENT_BOOST_GATE_SCALED',
            'EXACT_NCC_GATE',
            'SCALED_NCC_GATE',
            'DOUBAO_NCC_GATE',
            'JITTER_FINETUNE_TRIGGER',
            'JITTER_TRIGGER_MAX',
            'DEEPSCAN_GRADIENT_GATE',
            'STANDARD_MARGIN_TOLERANCE',
            'MODE_BOOST_ANCHORED',
            'MODE_BOOST_ALIGNED',
            'MODE_BOOST_FACTOR',
            'LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN',
            'SPATIAL_WEIGHT',
            'GRADIENT_WEIGHT',
            'VARIANCE_WEIGHT',
            'DEFAULT_PROBE_THRESHOLD',
            'GLOBAL_FALLBACK_MIN',
            'GLOBAL_FALLBACK_BELOW',
            'GLOBAL_FREE_MIN',
            'ADAPTIVE_MIN_CONFIDENCE',
            'POSITION_TOLERANCE_FACTOR',
            'POSITION_TOLERANCE_MIN_PX',
            'JITTER_MIN_CONFIDENCE',
            'MULTIPASS_RESIDUAL_THRESHOLD',
            'SCALED_CONFIG_MIN',
        ];
        for (const key of requiredKeys) {
            assert.ok(
                key in DETECTION_THRESHOLDS,
                `DETECTION_THRESHOLDS missing required key: ${key}`
            );
            assert.ok(
                typeof DETECTION_THRESHOLDS[key] === 'number',
                `DETECTION_THRESHOLDS.${key} must be a number, got ${typeof DETECTION_THRESHOLDS[key]}`
            );
        }
    });
});
