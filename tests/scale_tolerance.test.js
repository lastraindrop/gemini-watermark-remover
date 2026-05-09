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

    test('T1.3: Catalog rejects beyond 1% mismatch', () => {
        // Test 1040x1040 -> 1040/1024 = 1.0156 (1.56% mismatch) -> SHOULD REJECT
        const matches = registry.findMatches('gemini', 1040, 1040);
        assert.strictEqual(matches.length, 0, 'Should reject 1.56% difference');
    });
});
