import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getProfile, GEMINI_PROFILE } from '../src/core/profiles.js';
import { detectWatermarkConfig } from '../src/core/config.js';

describe('Profile System Abstraction', () => {
    
    test('Gemini profile registration', () => {
        const profile = getProfile('gemini');
        assert.strictEqual(profile.id, 'gemini');
        assert.strictEqual(profile.logoColor.r, 255);
    });

    test('Default profile fallback', () => {
        const profile = getProfile('non-existent');
        assert.strictEqual(profile.id, 'gemini'); // Should fallback to gemini for now
    });

    test('Config detection using profile heuristics', () => {
        // Test 1k tier heuristic (maxSide >= 1500)
        const config4k = detectWatermarkConfig(4096, 4096);
        assert.strictEqual(config4k.logoSize, 96);
        
        // Test 0.5k tier heuristic
        const configSmall = detectWatermarkConfig(512, 512);
        assert.strictEqual(configSmall.logoSize, 48);
    });

    test('Profile tiered config integrity', () => {
        assert.strictEqual(GEMINI_PROFILE.tiers['0.5k'].logoSize, 48);
        assert.strictEqual(GEMINI_PROFILE.tiers['1k'].logoSize, 96);
    });
});
