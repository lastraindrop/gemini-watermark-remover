/**
 * Scale Tolerance (1%) Validation Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { registry } from '../src/core/templates/registry.js';
import '../src/core/catalog.js';

describe('Scale Tolerance (1%) Validation', () => {

    test('T1.3: Catalog matches within 1% mismatch', () => {
        // 1024x1024 is a standard entry
        // Test 1030x1030 -> 1030/1024 = 1.0058 (0.58% mismatch) -> SHOULD MATCH
        const matches = registry.findMatches('gemini', 1030, 1030);
        assert.strictEqual(matches.length, 1, 'Should match 0.58% difference');
    });

    test('T1.3: Catalog rejects beyond 5% mismatch', () => {
        // Test 1080x1080 -> 1080/1024 = 1.0547 (5.47% mismatch) -> SHOULD REJECT
        const matches = registry.findMatches('gemini', 1080, 1080);
        assert.strictEqual(matches.length, 0, 'Should reject 5.47% difference');
    });
});
