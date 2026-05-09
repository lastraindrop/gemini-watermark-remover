import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getCatalogConfig } from '../src/core/catalog.js';
import { GEMINI_SIZE_CATALOG } from '../src/core/catalog.js';

describe('Official Size Catalog Matching', () => {
    // Data-driven testing for all catalog entries
    for (const entry of GEMINI_SIZE_CATALOG) {
        test(`Catalog entry match: ${entry.width}x${entry.height} (${entry.tier})`, () => {
            const config = getCatalogConfig(entry.width, entry.height);
            assert.ok(config, `Entry ${entry.width}x${entry.height} should exist in catalog`);
            assert.strictEqual(config.isOfficial, true);
        });
    }

    test('Tolerance match: Standard +/- 0.2% should still match', () => {
        // Find a representative entry
        const entry = GEMINI_SIZE_CATALOG[0];
        // 512 * 0.002 = 1.024px. Use 1px to stay within 0.6% (3.07px)
        const config = getCatalogConfig(entry.width + 1, entry.height - 1);
        assert.ok(config, 'Fuzzy matching should still work within 0.6% margin');
        assert.strictEqual(config.isOfficial, true);
    });

    test('Outside tolerance: Should return null', () => {
        const entry = GEMINI_SIZE_CATALOG[0];
        const config = getCatalogConfig(entry.width * 1.5, entry.height);
        assert.strictEqual(config, null, '50% difference should not match catalog');
    });
});
