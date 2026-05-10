import { test, describe } from 'node:test';
import assert from 'node:assert';
import { registry, TemplateRegistry } from '../src/core/templates/registry.js';
import { PROFILES } from '../src/core/profiles.js';
import { CATALOGS } from '../src/core/catalog.js';

describe('TemplateRegistry Core Tests', () => {

    test('Registry should be a singleton instance', () => {
        assert.ok(registry instanceof TemplateRegistry);
    });

    test('Should register and retrieve a profile', () => {
        const testProfile = {
            id: 'test-profile-1',
            name: 'Test Profile',
            logoValue: 255.0
        };
        const r = new TemplateRegistry();
        r.registerProfile(testProfile);
        
        const retrieved = r.getProfile('test-profile-1');
        assert.strictEqual(retrieved.id, 'test-profile-1');
        assert.strictEqual(retrieved.name, 'Test Profile');
    });

    test('Should throw when profile has no id', () => {
        const r = new TemplateRegistry();
        const invalidProfile = { name: 'No ID' };
        assert.throws(() => r.registerProfile(invalidProfile));
    });

    test('getAllProfiles should return all registered profiles', () => {
        const r = new TemplateRegistry();
        r.registerProfile({ id: 'a' });
        r.registerProfile({ id: 'b' });
        
        const all = r.getAllProfiles();
        assert.ok(Array.isArray(all));
        assert.strictEqual(all.length, 2);
        const ids = all.map(p => p.id);
        assert.ok(ids.includes('a'));
        assert.ok(ids.includes('b'));
    });

    test('Should add and retrieve catalog entries', () => {
        const r = new TemplateRegistry();
        r.registerProfile({ id: 'test-x' });
        r.addCatalogEntries('test-x', [
            { width: 1024, height: 1024, logoSize: 96 }
        ]);
        
        const catalog = r.getCatalog('test-x');
        assert.strictEqual(catalog.length, 1);
        assert.strictEqual(catalog[0].width, 1024);
    });

    test('findMatches should return empty for unmatched resolution', () => {
        const r = new TemplateRegistry();
        r.registerProfile({ id: 'test-gem' });
        r.addCatalogEntries('test-gem', [
            { width: 1024, height: 1024 }
        ]);
        
        const matches = r.findMatches('test-gem', 2048, 2048);
        assert.strictEqual(matches.length, 0);
    });

    test('findMatches should return entries within 0.015 tolerance', () => {
        const r = new TemplateRegistry();
        r.registerProfile({ id: 'test-tol' });
        r.addCatalogEntries('test-tol', [
            { width: 1000, height: 1000 },
            { width: 2000, height: 1000 }
        ]);
        
        const matches = r.findMatches('test-tol', 1000, 1000);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].width, 1000);
        assert.strictEqual(matches[0].isOfficial, true);
    });

    test('Should handle near-matches at tolerance boundary', () => {
        const r = new TemplateRegistry();
        r.registerProfile({ id: 'boundary-test' });
        r.addCatalogEntries('boundary-test', [
            { width: 1000, height: 1000 }
        ]);
        
        const withinTol = r.findMatches('boundary-test', 1014, 1014);
        const outsideTol = r.findMatches('boundary-test', 1020, 1020);
        
        assert.strictEqual(withinTol.length, 1);
        assert.strictEqual(outsideTol.length, 0);
    });

    test('getCatalog for non-existent profile returns empty array', () => {
        const r = new TemplateRegistry();
        const catalog = r.getCatalog('non-existent');
        assert.deepStrictEqual(catalog, []);
    });

    test('getProfile for non-existent profile returns undefined', () => {
        const r = new TemplateRegistry();
        const profile = r.getProfile('non-existent');
        assert.strictEqual(profile, undefined);
    });

    test('Re-registering same profile id replaces previous', () => {
        const r = new TemplateRegistry();
        r.registerProfile({ id: 'dup', name: 'First' });
        r.registerProfile({ id: 'dup', name: 'Second' });
        
        const profile = r.getProfile('dup');
        assert.strictEqual(profile.name, 'Second');
    });

    test('Global registry should have profiles loaded', () => {
        const profiles = registry.getAllProfiles();
        assert.ok(profiles.length >= 1);
        const gemini = profiles.find(p => p.id === 'gemini');
        assert.ok(gemini);
    });

    test('Global registry gemini catalog should have entries', () => {
        const gemCatalog = registry.getCatalog('gemini');
        assert.ok(gemCatalog.length > 0);
    });
});
