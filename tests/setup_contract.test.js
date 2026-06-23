import { describe, test } from 'node:test';
import assert from 'node:assert';
import { resolveMockAssetDimensions } from './setup.js';
import { PROFILES } from '../src/core/profiles.js';

function tierForAnchor(profile, anchor) {
    return Object.values(profile.tiers || {}).find(tier => tier.anchor === anchor);
}

describe('Shared Test Setup Contracts', () => {
    test('profile asset aliases derive dimensions from profile tiers', () => {
        for (const profile of Object.values(PROFILES)) {
            if (!profile.assets) continue;
            for (const [anchor, assetKey] of Object.entries(profile.assets)) {
                const tier = tierForAnchor(profile, anchor);
                assert.ok(tier, `Missing tier for ${profile.id}/${anchor}`);
                assert.deepStrictEqual(resolveMockAssetDimensions(assetKey), {
                    width: tier.logoWidth || tier.logoSize,
                    height: tier.logoHeight || tier.logoSize
                });
            }
        }
    });

    test('explicit rectangular asset keys are parsed directly', () => {
        assert.deepStrictEqual(resolveMockAssetDimensions('401x173'), { width: 401, height: 173 });
        assert.deepStrictEqual(resolveMockAssetDimensions('307x167'), { width: 307, height: 167 });
    });

    test('square Gemini alpha variants keep their numeric template size', () => {
        assert.deepStrictEqual(resolveMockAssetDimensions('96-20260520'), { width: 96, height: 96 });
    });
});
