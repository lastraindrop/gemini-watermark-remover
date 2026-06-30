import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES } from '../src/core/profiles.js';

describe('Gemini heuristic returns new-margin tier (BUG-C6 A-3)', () => {
    function assertNewMarginConfig(config) {
        assert.equal(config.logoSize, 96);
        assert.equal(config.marginRight, 192);
        assert.equal(config.marginBottom, 192);
        assert.equal(config.alphaVariant, '20260520');
        assert.equal(config.isOfficial, false);
    }

    test('exact 2816x1536 dimension returns 2k-new-margin', () => {
        assertNewMarginConfig(PROFILES.gemini.getHeuristicConfig(2816, 1536));
    });

    test('nearby 2026-05 wide dimensions outside exact catalog still return 2k-new-margin', () => {
        assertNewMarginConfig(PROFILES.gemini.getHeuristicConfig(2800, 1536));
        assertNewMarginConfig(PROFILES.gemini.getHeuristicConfig(2816, 1500));
        assertNewMarginConfig(PROFILES.gemini.getHeuristicConfig(3000, 1680));
    });

    test('standard square dimensions keep existing tiers', () => {
        assert.equal(PROFILES.gemini.getHeuristicConfig(2048, 2048).marginRight, 64);
        assert.equal(PROFILES.gemini.getHeuristicConfig(4096, 4096).marginRight, 64);
    });
});
