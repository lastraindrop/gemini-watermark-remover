import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getCatalogConfig } from '../src/core/catalog.js';
import { GEMINI_SIZE_CATALOG } from '../src/core/catalog.js';

describe('Official Size Catalog Matching', () => {
    // Data-driven testing for all catalog entries
    for (const entry of GEMINI_SIZE_CATALOG) {
        test(`Catalog entry match: ${entry.width}x${entry.height} (${entry.name})`, () => {
            const config = getCatalogConfig(entry.width, entry.height);
            assert.ok(config, `Entry ${entry.width}x${entry.height} should exist in catalog`);
            assert.strictEqual(config.isOfficial, true);
        });
    }

    test('Tolerance match: Standard +/- 2% should still match', () => {
        // Find a representative entry
        const entry = GEMINI_SIZE_CATALOG[0];
        const config = getCatalogConfig(entry.width + 5, entry.height - 5);
        assert.ok(config, 'Fuzzy matching should still work within 2% margin');
        assert.strictEqual(config.isOfficial, true);
    });

    test('Outside tolerance: Should return null', () => {
        const entry = GEMINI_SIZE_CATALOG[0];
        const config = getCatalogConfig(entry.width * 1.5, entry.height);
        assert.strictEqual(config, null, '50% difference should not match catalog');
    });
});
