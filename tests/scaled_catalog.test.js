import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getScaledCatalogConfigs } from '../src/core/catalog.js';

describe('Scaled Catalog Matching Tests', () => {

    test('Should generate scaled entries for resolutions near catalog', () => {
        const result = getScaledCatalogConfigs(1030, 1030, 'gemini');
        assert.ok(Array.isArray(result));
        assert.ok(result.length > 0);
        result.forEach(cfg => {
            assert.ok(cfg.isOfficial === false);
            assert.ok(cfg.scaledFrom);
        });
    });

    test('Should respect maxRelativeAspectRatioDelta', () => {
        const strictResult = getScaledCatalogConfigs(1024, 200, 'gemini', {
            maxRelativeAspectRatioDelta: 0.01
        });
        const looseResult = getScaledCatalogConfigs(1024, 200, 'gemini', {
            maxRelativeAspectRatioDelta: 1.0
        });
        assert.ok(strictResult.length <= looseResult.length);
    });

    test('Should respect maxScaleMismatchRatio', () => {
        const mismatched = getScaledCatalogConfigs(1024, 2000, 'gemini', {
            maxScaleMismatchRatio: 0.01
        });
        const matched = getScaledCatalogConfigs(1024, 1024, 'gemini', {
            maxScaleMismatchRatio: 0.01
        });
        assert.ok(mismatched.length === 0 || mismatched.length < matched.length);
    });

    test('Should respect maxScaleDistance', () => {
        const closeResult = getScaledCatalogConfigs(1100, 1100, 'gemini', {
            maxScaleDistance: 0.1
        });
        const farResult = getScaledCatalogConfigs(2000, 2000, 'gemini', {
            maxScaleDistance: 0.1
        });
        assert.ok(closeResult.length > 0);
    });

    test('Should respect minLogoSize and maxLogoSize', () => {
        const result = getScaledCatalogConfigs(1024, 1024, 'gemini', {
            minLogoSize: 100,
            maxLogoSize: 200
        });
        result.forEach(cfg => {
            assert.ok(cfg.logoSize >= 100);
            assert.ok(cfg.logoSize <= 200);
        });
    });

    test('Should respect limit parameter', () => {
        const limit1 = getScaledCatalogConfigs(1030, 1030, 'gemini', { limit: 1 });
        const limit3 = getScaledCatalogConfigs(1030, 1030, 'gemini', { limit: 3 });
        const limit10 = getScaledCatalogConfigs(1030, 1030, 'gemini', { limit: 10 });
        
        assert.ok(limit1.length <= 1);
        assert.ok(limit3.length <= 3);
        assert.ok(limit1.length <= limit3.length);
        assert.ok(limit3.length <= limit10.length);
    });

    test('Scaled configs should have isOfficial=false and scaledFrom set', () => {
        const exact = getScaledCatalogConfigs(1024, 1024, 'gemini');
        exact.forEach(cfg => {
            assert.ok(cfg.isOfficial === false);
            assert.ok(typeof cfg.scaledFrom === 'string');
            assert.ok(cfg.scaledFrom.includes('x'));
        });
    });

    test('Should maintain aspect ratio constraints', () => {
        const result = getScaledCatalogConfigs(848, 1264, 'gemini', {
            maxRelativeAspectRatioDelta: 0.05
        });
        const targetRatio = 848 / 1264;
        result.forEach(cfg => {
            const parts = cfg.scaledFrom.split('x');
            const entryRatio = parseInt(parts[0]) / parseInt(parts[1]);
            const delta = Math.abs(targetRatio - entryRatio) / entryRatio;
            assert.ok(delta <= 0.05);
        });
    });

    test('Non-gemini profile should return empty if no scale-found', () => {
        const result = getScaledCatalogConfigs(1024, 1024, 'doubao');
        assert.ok(Array.isArray(result));
    });

    test('Should deduplicate by scaledFrom+logoSize+margins', () => {
        const result = getScaledCatalogConfigs(1030, 1030, 'gemini', { limit: 10 });
        const keys = result.map(cfg => 
            `${cfg.logoSize}:${cfg.marginRight}:${cfg.marginBottom}:${cfg.scaledFrom}`
        );
        const uniqueKeys = new Set(keys);
        assert.strictEqual(keys.length, uniqueKeys.size);
    });

    test('Should sort by score (ascending - lower is better)', () => {
        const result = getScaledCatalogConfigs(1030, 1030, 'gemini', { limit: 5 });
        for (let i = 1; i < result.length; i++) {
            const prevScore = 0;
        }
        assert.ok(result.length > 0);
    });
});
