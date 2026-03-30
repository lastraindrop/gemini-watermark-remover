import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getCatalogConfig } from '../src/core/catalog.js';

describe('Official Size Catalog Matching', () => {

    test('Exact match: 1024x1024 (1k tier)', () => {
        const config = getCatalogConfig(1024, 1024);
        assert.ok(config, 'Should match 1024x1024');
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 64);
        assert.strictEqual(config.isOfficial, true);
    });

    test('Exact match: 2048x2048 (2k tier)', () => {
        const config = getCatalogConfig(2048, 2048);
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 64);
    });

    test('Tolerance match: 1044x1044 (within 2%)', () => {
        const config = getCatalogConfig(1044, 1044);
        assert.ok(config, '1044x1044 should match 1k tier (1.9% diff)');
        assert.strictEqual(config.logoSize, 96);
    });

    test('Outside tolerance: 1100x1100 (7.4% diff)', () => {
        const config = getCatalogConfig(1100, 1100);
        assert.strictEqual(config, null, '1100x1100 should not match 1k tier');
    });

    test('Portrait match: 768x1376', () => {
        const config = getCatalogConfig(768, 1376);
        assert.ok(config);
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 64);
    });

    test('Wide screen match: 1536x672', () => {
        const config = getCatalogConfig(1536, 672);
        assert.ok(config);
        assert.strictEqual(config.logoSize, 96);
    });

    test('Tiny image should not match', () => {
        const config = getCatalogConfig(50, 50);
        assert.strictEqual(config, null);
    });
});
