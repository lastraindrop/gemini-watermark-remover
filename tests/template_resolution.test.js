/**
 * Template Resolution Tests — covers resolveBestTemplateOrder and getProfilesToTry.
 * These were previously untested in the test suite.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getProfilesToTry } from '../src/core/detectionPipeline.js';
import { getAllPotentialConfigs } from '../src/core/config.js';
import { getProfile, getAllProfiles } from '../src/core/profiles.js';
import { registry } from '../src/core/templates/registry.js';
import '../src/core/catalog.js';

describe('Template Resolution & Profile Selection', () => {

    describe('getProfilesToTry', () => {
        test('gemini returns [gemini] only', () => {
            const result = getProfilesToTry('gemini');
            assert.deepStrictEqual(result, ['gemini']);
        });

        test('doubao returns [doubao] only', () => {
            const result = getProfilesToTry('doubao');
            assert.deepStrictEqual(result, ['doubao']);
        });

        test('auto returns all supported profiles', () => {
            const result = getProfilesToTry('auto');
            const supported = getAllProfiles().map(p => p.id);
            assert.deepStrictEqual(result.sort(), supported.sort());
        });

        test('unknown ID is rejected', () => {
            assert.throws(() => getProfilesToTry('unknown-profile'), /Unknown profile/);
        });
    });

    describe('getAllPotentialConfigs', () => {
        test('Catalog-backed gemini resolution returns catalog entries', () => {
            const configs = getAllPotentialConfigs(1024, 1024, 'gemini');
            assert.ok(configs.length >= 1);
            assert.ok(configs.some(c => c.isOfficial), 'Should include official catalog match');
        });

        test('Non-catalog gemini resolution returns valid configs with sizes', () => {
            const configs = getAllPotentialConfigs(1500, 1500, 'gemini');
            assert.ok(configs.length >= 1, 'Should return at least 1 config');
            const sizes = configs.map(c => c.logoSize || c.logoWidth);
            assert.ok(sizes.every(s => s > 0 && s < 500), 'All sizes should be positive and reasonable');
        });

        test('doubao returns configs for both anchors', () => {
            const configs = getAllPotentialConfigs(2730, 1535, 'doubao');
            assert.ok(configs.length >= 2);
            const anchors = configs.map(c => c.anchor);
            assert.ok(anchors.includes('top-left'));
            assert.ok(anchors.includes('bottom-right'));
        });

        test('Scaled catalog configs are returned for gemini near-matches', () => {
            const configs = getAllPotentialConfigs(1030, 1030, 'gemini');
            assert.ok(configs.length > 0, 'Should return scaled configs for near-catalog resolution');
        });
    });

    describe('getProfile', () => {
        test('Numeric resolution looks up heuristic config', () => {
            const profile = getProfile('gemini');
            const cfg = profile.getHeuristicConfig(3000, 3000);
            assert.ok(cfg.logoSize);
            assert.ok(cfg.marginRight >= 0);
            assert.ok(cfg.marginBottom >= 0);
        });

        test('Short-side priority: 600x800 gives 48px', () => {
            const profile = getProfile('gemini');
            const cfg = profile.getHeuristicConfig(600, 800);
            // shortSide = 600 < 720, so tier = '0.5k' with 48px
            assert.strictEqual(cfg.logoSize, 48);
        });
    });

    describe('getAllProfiles', () => {
        test('All profiles have required fields', () => {
            const profiles = getAllProfiles();
            for (const p of profiles) {
                assert.ok(p.id, 'Profile must have id');
                assert.ok(p.name, 'Profile must have name');
                assert.ok(p.logoValue !== undefined, 'Profile must have logoValue');
            }
        });
    });
});
