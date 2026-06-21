/**
 * BUG-C6 fix (STAGE_PLAN_v2.7 Phase A-1):
 * Verify that the WATERMARK_CONFIGS proxy exposes the new Gemini anchor
 * tier variants ('2k-new-margin', 'v2-small', 'large-margin') defined in
 * catalogs.json. Previously the proxy only exposed '0.5k'/'1k'/'2k'/'4k',
 * making the new tier definitions completely unreachable at runtime.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { WATERMARK_CONFIGS } from '../src/core/catalog.js';

describe('WATERMARK_CONFIGS new tier reachability (BUG-C6)', () => {

    test('2k-new-margin tier is accessible and has correct config', () => {
        const config = WATERMARK_CONFIGS['2k-new-margin'];
        assert.ok(config, 'WATERMARK_CONFIGS["2k-new-margin"] must be defined');
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 192);
        assert.strictEqual(config.marginBottom, 192);
    });

    test('v2-small tier is accessible and has correct config', () => {
        const config = WATERMARK_CONFIGS['v2-small'];
        assert.ok(config, 'WATERMARK_CONFIGS["v2-small"] must be defined');
        assert.strictEqual(config.logoSize, 36);
        // v2.7 A-2: margins corrected from 32→96 to match upstream
        // GEMINI_3X_V2_SMALL_WATERMARK_CONFIG
        assert.strictEqual(config.marginRight, 96);
        assert.strictEqual(config.marginBottom, 96);
    });

    test('large-margin tier is accessible and has correct config', () => {
        const config = WATERMARK_CONFIGS['large-margin'];
        assert.ok(config, 'WATERMARK_CONFIGS["large-margin"] must be defined');
        assert.strictEqual(config.logoSize, 48);
        assert.strictEqual(config.marginRight, 96);
        assert.strictEqual(config.marginBottom, 96);
    });

    test('existing tiers still work (regression check)', () => {
        assert.ok(WATERMARK_CONFIGS['0.5k'], '0.5k must still be accessible');
        assert.ok(WATERMARK_CONFIGS['1k'], '1k must still be accessible');
        assert.ok(WATERMARK_CONFIGS['2k'], '2k must still be accessible');
        assert.ok(WATERMARK_CONFIGS['4k'], '4k must still be accessible');
        assert.strictEqual(WATERMARK_CONFIGS['0.5k'].logoSize, 48);
        assert.strictEqual(WATERMARK_CONFIGS['1k'].logoSize, 96);
    });
});
