/**
 * BUG-C6 fix (STAGE_PLAN_v2.7 Phase A-3):
 * Verify that PROFILES.gemini.tiers includes the new variant tiers
 * ('2k-new-margin', 'large-margin', 'v2-small') with correct values,
 * and that getHeuristicConfig returns the 2k-new-margin config for
 * the 2816x1536 dimension.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PROFILES } from '../src/core/profiles.js';

describe('Profiles new variant tiers (BUG-C6 A-3)', () => {

    test('2k-new-margin tier exists with 192px margins and alphaVariant', () => {
        const tier = PROFILES.gemini.tiers['2k-new-margin'];
        assert.ok(tier, '2k-new-margin tier must exist');
        assert.strictEqual(tier.logoSize, 96);
        assert.strictEqual(tier.marginRight, 192);
        assert.strictEqual(tier.marginBottom, 192);
        assert.strictEqual(tier.alphaVariant, '20260520');
    });

    test('large-margin tier exists with 96px margins', () => {
        const tier = PROFILES.gemini.tiers['large-margin'];
        assert.ok(tier, 'large-margin tier must exist');
        assert.strictEqual(tier.logoSize, 48);
        assert.strictEqual(tier.marginRight, 96);
        assert.strictEqual(tier.marginBottom, 96);
    });

    test('v2-small tier exists with 36px logo, 96px margins, alphaVariant', () => {
        const tier = PROFILES.gemini.tiers['v2-small'];
        assert.ok(tier, 'v2-small tier must exist');
        assert.strictEqual(tier.logoSize, 36);
        assert.strictEqual(tier.marginRight, 96);
        assert.strictEqual(tier.marginBottom, 96);
        assert.strictEqual(tier.alphaVariant, 'v2');
    });

    test('old 2k-new key is renamed to 2k-new-margin', () => {
        // The old key '2k-new' should no longer exist (renamed for consistency)
        assert.ok(!PROFILES.gemini.tiers['2k-new'], 'old 2k-new key should be removed');
    });

    test('getHeuristicConfig returns 2k-new-margin for 2816x1536', () => {
        const config = PROFILES.gemini.getHeuristicConfig(2816, 1536);
        assert.ok(config);
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 192);
        assert.strictEqual(config.marginBottom, 192);
        assert.strictEqual(config.alphaVariant, '20260520');
        assert.strictEqual(config.isOfficial, false);
    });

    test('getHeuristicConfig still works for standard sizes (regression)', () => {
        // 0.5k: short side < 720
        const cfg512 = PROFILES.gemini.getHeuristicConfig(512, 512);
        assert.strictEqual(cfg512.logoSize, 48);
        assert.strictEqual(cfg512.marginRight, 32);

        // 1k: short side 720-1200
        const cfg1024 = PROFILES.gemini.getHeuristicConfig(1024, 1024);
        assert.strictEqual(cfg1024.logoSize, 96);
        assert.strictEqual(cfg1024.marginRight, 64);

        // 2k: short side >= 1200, pixels <= 4.5M
        const cfg2048 = PROFILES.gemini.getHeuristicConfig(2048, 2048);
        assert.strictEqual(cfg2048.logoSize, 96);
        assert.strictEqual(cfg2048.marginRight, 64);

        // 4k: pixels > 4.5M
        const cfg4096 = PROFILES.gemini.getHeuristicConfig(4096, 4096);
        assert.strictEqual(cfg4096.logoSize, 96);
        assert.strictEqual(cfg4096.marginRight, 64);
    });
});
