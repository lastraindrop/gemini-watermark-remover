import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, DEFAULT_PROFILE, GEMINI_PROFILE, getProfile, getAllProfiles } from '../src/core/profiles.js';
import { detectWatermarkConfig, getAllPotentialConfigs, calculateWatermarkPosition, ENGINE_LIMITS } from '../src/core/config.js';
import { registry } from '../src/core/templates/registry.js';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Profile System Tests', () => {
    it('Each profile has required fields', () => {
        for (const profile of Object.values(PROFILES)) {
            assert.ok(profile.id, `${profile.id || 'unknown'}: must have id`);
            assert.ok(profile.name, `${profile.id}: must have name`);
            assert.ok(typeof profile.logoValue === 'number', `${profile.id}: logoValue must be number`);
            assert.ok(Array.isArray(profile.anchors), `${profile.id}: anchors must be array`);
            assert.ok(profile.anchors.length > 0, `${profile.id}: must have at least one anchor`);
            assert.ok(typeof profile.getHeuristicConfig === 'function', `${profile.id}: must have getHeuristicConfig`);
        }
    });

    it('getHeuristicConfig returns finite positive values for various resolutions', () => {
        const resolutions = [
            [100, 100], [320, 240], [512, 512], [1024, 1024],
            [1920, 1080], [2048, 2048], [2730, 1535], [4096, 4096],
            [500, 3000], [8000, 8000]
        ];
        for (const profile of Object.values(PROFILES)) {
            for (const [w, h] of resolutions) {
                const anchors = profile.anchors || ['bottom-right'];
                for (const anchor of anchors) {
                    const config = profile.getHeuristicConfig(w, h, anchor);
                    assert.ok(config, `${profile.id} ${w}x${h} ${anchor}: config should exist`);
                    const lw = config.logoWidth || config.logoSize;
                    const lh = config.logoHeight || config.logoSize;
                    assert.ok(Number.isFinite(lw) && lw > 0, `${profile.id} ${w}x${h}: logoWidth should be finite positive, got ${lw}`);
                    assert.ok(Number.isFinite(lh) && lh > 0, `${profile.id} ${w}x${h}: logoHeight should be finite positive, got ${lh}`);
                }
            }
        }
    });

    it('getHeuristicConfig never returns extremely negative coordinates', () => {
        const smallSizes = [[50, 50], [80, 80], [100, 50], [50, 100]];
        for (const profile of Object.values(PROFILES)) {
            for (const [w, h] of smallSizes) {
                for (const anchor of (profile.anchors || ['bottom-right'])) {
                    const config = profile.getHeuristicConfig(w, h, anchor);
                    const pos = calculateWatermarkPosition(w, h, config);
                    assert.ok(pos.x > -200, `${profile.id} ${w}x${h} ${anchor}: x=${pos.x} should be > -200`);
                    assert.ok(pos.y > -200, `${profile.id} ${w}x${h} ${anchor}: y=${pos.y} should be > -200`);
                }
            }
        }
    });

    it('Non-experimental profiles have asset files for all anchors', () => {
        const assetsDir = resolve(__dirname, '../src/assets');
        for (const profile of Object.values(PROFILES)) {
            if (profile.experimental) continue;
            if (profile.assets) {
                for (const [anchor, key] of Object.entries(profile.assets)) {
                    const assetPath = resolve(assetsDir, `bg_${key}.png`);
                    assert.ok(existsSync(assetPath), `${profile.id} anchor ${anchor}: asset bg_${key}.png should exist at ${assetPath}`);
                }
            }
        }
    });

    it('Re-registering profile replaces previous', () => {
        const testProfile = { id: '__test_profile__', name: 'Test' };
        registry.registerProfile(testProfile);
        assert.equal(registry.getProfile('__test_profile__').name, 'Test');

        const updatedProfile = { id: '__test_profile__', name: 'Updated' };
        registry.registerProfile(updatedProfile);
        assert.equal(registry.getProfile('__test_profile__').name, 'Updated');
        registry.profiles.delete('__test_profile__');
    });

    it('getAllProfiles returns non-experimental for auto-detect', () => {
        const profiles = getAllProfiles().filter(p => !p.experimental);
        assert.ok(profiles.length >= 2, 'Should have at least 2 non-experimental profiles');
        const ids = profiles.map(p => p.id);
        assert.ok(ids.includes('gemini'), 'Should include gemini');
        assert.ok(ids.includes('doubao'), 'Should include doubao');
    });

    it('calculateWatermarkPosition for all anchor types', () => {
        const cases = [
            { anchor: 'bottom-right', logoSize: 96, marginRight: 64, marginBottom: 64 },
            { anchor: 'top-left', logoSize: 96, marginLeft: 32, marginTop: 32 },
            { anchor: 'top-right', logoSize: 48, marginRight: 32, marginTop: 16 },
            { anchor: 'bottom-left', logoSize: 48, marginLeft: 16, marginBottom: 16 }
        ];
        const imgW = 1024, imgH = 1024;
        for (const config of cases) {
            const pos = calculateWatermarkPosition(imgW, imgH, config);
            assert.ok(Number.isFinite(pos.x), `${config.anchor}: x should be finite`);
            assert.ok(Number.isFinite(pos.y), `${config.anchor}: y should be finite`);
            assert.equal(pos.width, config.logoSize, `${config.anchor}: width should match logoSize`);
            assert.equal(pos.height, config.logoSize, `${config.anchor}: height should match logoSize`);
            assert.equal(pos.anchor, config.anchor);
        }
    });

    it('ENGINE_LIMITS are reasonable', () => {
        assert.ok(ENGINE_LIMITS.MAX_PIXELS > 0, 'MAX_PIXELS should be positive');
        assert.ok(ENGINE_LIMITS.MAX_FILE_SIZE > 0, 'MAX_FILE_SIZE should be positive');
        assert.ok(ENGINE_LIMITS.MAX_CONCURRENCY > 0, 'MAX_CONCURRENCY should be positive');
        assert.ok(ENGINE_LIMITS.MAX_PIXELS >= 4096 * 4096, 'Should support at least 4K images');
    });
});
