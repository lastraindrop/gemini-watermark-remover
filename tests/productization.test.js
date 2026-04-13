import { registry } from '../src/core/templates/registry.js';
import { PROFILES } from '../src/core/profiles.js';
import { CATALOGS } from '../src/core/catalog.js';
import assert from 'node:assert';
import { test, describe } from 'node:test';

describe('GWR Productization - Template Registry', () => {
    test('Registry should contain Gemini and Doubao profiles', () => {
        const gemini = registry.getProfile('gemini');
        const doubao = registry.getProfile('doubao');
        
        assert.ok(gemini, 'Gemini profile should exist');
        assert.ok(doubao, 'Doubao profile should exist');
        assert.strictEqual(gemini.id, 'gemini');
        assert.strictEqual(doubao.id, 'doubao');
    });

    test('Catalog should return correct matches for standard resolution', () => {
        const matches = registry.findMatches('gemini', 1024, 1024);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].tier, '1k');
        assert.strictEqual(matches[0].logoSize, 96);
    });

    test('Doubao catalog should support multiple anchors for same resolution', () => {
        const matches = registry.findMatches('doubao', 2730, 1535);
        assert.strictEqual(matches.length, 2, 'Should find 2 matches (TL and BR)');
        
        const anchors = matches.map(m => m.anchor);
        assert.ok(anchors.includes('top-left'));
        assert.ok(anchors.includes('bottom-right'));
    });

    test('Heuristic fallback should work for unknown resolutions', () => {
        const profile = registry.getProfile('gemini');
        const matches = registry.findMatches('gemini', 1234, 5678);
        assert.strictEqual(matches.length, 0, 'No official catalog match');
    });
});
