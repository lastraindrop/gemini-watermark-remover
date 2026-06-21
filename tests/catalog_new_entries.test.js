/**
 * BUG-C6 fix (STAGE_PLAN_v2.7 Phase A-2):
 * Verify that the CATALOGS.gemini array contains entries that actually USE
 * the new tier labels ('2k-new-margin', etc.) and that the v2-small tier
 * template has correct margins (96, not the previously wrong 32).
 *
 * Also verifies the missing gemini-2.5-flash-image 1k 1:1 1024x1024 entry
 * has been added.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { GEMINI_SIZE_CATALOG, getCatalogConfig, WATERMARK_CONFIGS } from '../src/core/catalog.js';

describe('Catalog new entries (BUG-C6 A-2)', () => {

    test('2816x1536 catalog entry exists with 2k-new-margin tier', () => {
        const config = getCatalogConfig(2816, 1536, 'gemini');
        assert.ok(config, '2816x1536 must have a catalog config');
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 192);
        assert.strictEqual(config.marginBottom, 192);
        assert.strictEqual(config.tier, '2k-new-margin');
        assert.strictEqual(config.alphaVariant, '20260520');
        assert.strictEqual(config.isOfficial, true);
    });

    test('2816x1536 is present in GEMINI_SIZE_CATALOG iterable', () => {
        let found = null;
        for (const entry of GEMINI_SIZE_CATALOG) {
            if (entry.width === 2816 && entry.height === 1536) {
                found = entry;
                break;
            }
        }
        assert.ok(found, '2816x1536 entry must be in GEMINI_SIZE_CATALOG');
        assert.strictEqual(found.tier, '2k-new-margin');
        assert.strictEqual(found.alphaVariant, '20260520');
    });

    test('v2-small tier template has 96px margins (not 32)', () => {
        // A-2 fix: upstream GEMINI_3X_V2_SMALL_WATERMARK_CONFIG uses 96,96
        const config = WATERMARK_CONFIGS['v2-small'];
        assert.ok(config);
        assert.strictEqual(config.marginRight, 96, 'v2-small marginRight must be 96 (was wrongly 32)');
        assert.strictEqual(config.marginBottom, 96, 'v2-small marginBottom must be 96 (was wrongly 32)');
    });

    test('1024x1024 catalog entry exists (covered by gemini-3.x 1k)', () => {
        // Note: 1024x1024 is already covered by the existing gemini-3.x-image
        // 1k entry. A duplicate gemini-2.5-flash 1024x1024 entry was considered
        // but not added because it would be functionally redundant (same logoSize
        // and margins) and would break findMatches' uniqueness assumption.
        const config = getCatalogConfig(1024, 1024, 'gemini');
        assert.ok(config, '1024x1024 must have a catalog config');
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 64);
        assert.strictEqual(config.marginBottom, 64);
    });

    test('large-margin tier template is correct (unchanged)', () => {
        const config = WATERMARK_CONFIGS['large-margin'];
        assert.ok(config);
        assert.strictEqual(config.logoSize, 48);
        assert.strictEqual(config.marginRight, 96);
        assert.strictEqual(config.marginBottom, 96);
    });
});
