/**
 * Catalog Tests — merged from catalog.test.js, catalog_tolerance.test.js,
 * scale_tolerance.test.js, scaled_catalog.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { GEMINI_SIZE_CATALOG, getCatalogConfig, getScaledCatalogConfigs } from '../src/core/catalog.js';
import { registry } from '../src/core/templates/registry.js';
import '../src/core/catalog.js';
import { TC } from './test_utils.js';

// ---- 1. Official catalog matching (data-driven) ----
describe('Catalog Matching', () => {

    describe('Official size catalog', () => {
        for (const entry of GEMINI_SIZE_CATALOG) {
            test(`${entry.width}x${entry.height} (${entry.tier})`, () => {
                const config = getCatalogConfig(entry.width, entry.height);
                assert.ok(config, `Entry ${entry.width}x${entry.height} should exist`);
                assert.strictEqual(config.isOfficial, true);
            });
        }

        test('Tolerance match: ±0.2% should still match', () => {
            const entry = GEMINI_SIZE_CATALOG[0];
            const config = getCatalogConfig(entry.width + 1, entry.height - 1);
            assert.ok(config, 'Fuzzy matching within 0.6% margin');
            assert.strictEqual(config.isOfficial, true);
        });

        test('Outside tolerance: 50% difference should return null', () => {
            const entry = GEMINI_SIZE_CATALOG[0];
            assert.strictEqual(getCatalogConfig(entry.width * 1.5, entry.height), null);
        });
    });

    // ---- 2. Scale tolerance (findMatches 10%) ----
    describe('Scale tolerance (10%)', () => {
        test('Matches within 1% mismatch', () => {
            const matches = registry.findMatches('gemini', 1030, 1030);
            assert.strictEqual(matches.length, 1);
        });

        test('Matches within 10% mismatch', () => {
            const matches = registry.findMatches('gemini', 1080, 1080);
            assert.strictEqual(matches.length, 1);
        });

        test('Rejects beyond 10% mismatch', () => {
            const matches = registry.findMatches('gemini', 1130, 1130);
            assert.strictEqual(matches.length, 0);
        });
    });

    // ---- 3. findCloseMatches (new v2.2 API) ----
    describe('findCloseMatches', () => {
        test('Finds entries at loose tolerance', () => {
            const matches = registry.findCloseMatches('gemini', 1000, 1000, 0.25);
            assert.ok(matches.length > 0);
            assert.strictEqual(matches[0].isOfficial, false);
        });

        test('Empty for very different resolutions', () => {
            const matches = registry.findCloseMatches('gemini', 5000, 5000, 0.10);
            assert.strictEqual(matches.length, 0);
        });

        test('Includes scaled logo and margin values', () => {
            const matches = registry.findCloseMatches('gemini', 2000, 2000, 0.25);
            assert.ok(matches.length > 0);
            assert.ok(matches[0].logoSize || matches[0].logoWidth);
            assert.ok(matches[0].marginRight > 0);
            assert.ok(matches[0].marginBottom > 0);
            assert.ok(matches[0].scaledFrom);
        });
    });

    // ---- 4. Scaled catalog configs ----
    describe('Scaled catalog configs', () => {
        test('Generates entries for nearby resolutions', () => {
            const result = getScaledCatalogConfigs(1030, 1030, TC.PROFILES.GEMINI);
            assert.ok(Array.isArray(result));
            assert.ok(result.length > 0);
            result.forEach(cfg => {
                assert.strictEqual(cfg.isOfficial, false);
                assert.ok(cfg.scaledFrom);
            });
        });

        test('Respects maxRelativeAspectRatioDelta', () => {
            const strict = getScaledCatalogConfigs(1024, 200, TC.PROFILES.GEMINI, { maxRelativeAspectRatioDelta: 0.01 });
            const loose = getScaledCatalogConfigs(1024, 200, TC.PROFILES.GEMINI, { maxRelativeAspectRatioDelta: 1.0 });
            assert.ok(strict.length <= loose.length);
        });

        test('Respects maxScaleMismatchRatio', () => {
            const mismatched = getScaledCatalogConfigs(1024, 2000, TC.PROFILES.GEMINI, { maxScaleMismatchRatio: 0.01 });
            const matched = getScaledCatalogConfigs(1024, 1024, TC.PROFILES.GEMINI, { maxScaleMismatchRatio: 0.01 });
            assert.ok(mismatched.length === 0 || mismatched.length < matched.length);
        });

        test('Respects minLogoSize and maxLogoSize', () => {
            const result = getScaledCatalogConfigs(1024, 1024, TC.PROFILES.GEMINI, { minLogoSize: 100, maxLogoSize: 200 });
            result.forEach(cfg => assert.ok(cfg.logoSize >= 100 && cfg.logoSize <= 200));
        });

        test('Respects limit parameter', () => {
            const l1 = getScaledCatalogConfigs(1030, 1030, TC.PROFILES.GEMINI, { limit: 1 });
            const l3 = getScaledCatalogConfigs(1030, 1030, TC.PROFILES.GEMINI, { limit: 3 });
            assert.ok(l1.length <= 1 && l3.length <= 3 && l1.length <= l3.length);
        });

        test('Scaled configs have isOfficial=false and scaledFrom set', () => {
            const exact = getScaledCatalogConfigs(1024, 1024, TC.PROFILES.GEMINI);
            exact.forEach(cfg => {
                assert.strictEqual(cfg.isOfficial, false);
                assert.ok(typeof cfg.scaledFrom === 'string' && cfg.scaledFrom.includes('x'));
            });
        });

        test('Maintains aspect ratio constraints', () => {
            const result = getScaledCatalogConfigs(848, 1264, TC.PROFILES.GEMINI, { maxRelativeAspectRatioDelta: 0.05 });
            const targetRatio = 848 / 1264;
            result.forEach(cfg => {
                const [w, h] = cfg.scaledFrom.split('x').map(Number);
                assert.ok(Math.abs(targetRatio - w / h) / (w / h) <= 0.05);
            });
        });

        test('Non-gemini profile returns array', () => {
            assert.ok(Array.isArray(getScaledCatalogConfigs(1024, 1024, TC.PROFILES.DOUBAO)));
        });

        test('Deduplicates by scaledFrom+logoSize+margins', () => {
            const result = getScaledCatalogConfigs(1030, 1030, TC.PROFILES.GEMINI, { limit: 10 });
            const keys = result.map(c => `${c.logoSize}:${c.marginRight}:${c.marginBottom}:${c.scaledFrom}`);
            assert.strictEqual(keys.length, new Set(keys).size);
        });
    });
});
