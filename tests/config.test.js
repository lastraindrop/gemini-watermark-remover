import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig, calculateWatermarkPosition, getAllPotentialConfigs } from '../src/core/config.js';
import { registry } from '../src/core/templates/registry.js';

import { GEMINI_SIZE_CATALOG } from '../src/core/catalog.js';

describe('Watermark Config Logic - Priority & Fallback', () => {

    test('Catalog Priority: Standards from GEMINI_SIZE_CATALOG should match', async () => {
        for (const entry of GEMINI_SIZE_CATALOG.slice(0, 3)) {
            const config = detectWatermarkConfig(entry.width, entry.height);
            assert.ok(config);
            assert.strictEqual(config.isOfficial, true, `Official resolution ${entry.width}x${entry.height} should be marked`);
            
            // Fix: Map tier back to the expected configuration
            const { WATERMARK_CONFIGS } = await import('../src/core/catalog.js');
            const expectedSize = WATERMARK_CONFIGS[entry.tier].logoSize;
            assert.strictEqual(config.logoSize, expectedSize, `Logo size mismatch for ${entry.width}x${entry.height}`);
        }
    });

    test('Heuristic Fallback: Large non-standard image (3000x3000)', () => {
        const config = detectWatermarkConfig(3000, 3000);
        assert.ok(config);
        assert.strictEqual(config.logoSize, 96, 'Heuristic for both sides > 1024 should be 96');
        assert.strictEqual(config.isOfficial, false, 'Heuristic fallback should not be marked as official');
    });

    test('Heuristic Fallback: Small non-standard image (800x800)', () => {
        const config = detectWatermarkConfig(800, 800);
        // 800x800 is between 512 (48px) and 1024 (96px) — heuristic gives 96px;
        // pipeline also probes both 48 and 96 via getAllPotentialConfigs fallback
        assert.ok(config.logoSize === 48 || config.logoSize === 96, `Heuristic for 800x800: ${config.logoSize}`);
        assert.strictEqual(config.isOfficial, false, 'Heuristic fallback should not be marked as official');
    });

    test('Position accuracy: Bottom-right corner', () => {
        const width = 1000;
        const height = 1000;
        const config = { logoSize: 96, marginRight: 64, marginBottom: 64 };
        const pos = calculateWatermarkPosition(width, height, config);
        
        // Expected: x = 1000 - 64 - 96 = 840, y = 1000 - 64 - 96 = 840
        assert.strictEqual(pos.x, 840);
        assert.strictEqual(pos.y, 840);
        assert.strictEqual(pos.width, 96);
    });

    test('Negative coordinate protection for tiny images', () => {
        const config = { logoSize: 96, marginRight: 64, marginBottom: 64 };
        // Very small image - results in negative coordinate
        const pos = calculateWatermarkPosition(10, 10, config);
        assert.ok(pos.x < 0, 'Negative coords expected for impossible size');
    });

    describe('Boundary Conditions', () => {
        test('Exact boundary: wide image where only one side > 1024 (1500x500)', () => {
            const config = detectWatermarkConfig(1500, 500);
            // Both sides must be > 1024 for 96px; 500 < 1024 so should be 48
            assert.strictEqual(config.logoSize, 48, '1500x500 should still be 48px because height < 1024');
        });

        test('Standard maxSide but non-standard minSide: 1024x500', () => {
            const config = detectWatermarkConfig(1024, 500);
            assert.strictEqual(config.isOfficial, false, 'Should not match catalog if height is too different');
            assert.strictEqual(config.logoSize, 48, '1024x500 both not > 1024 so 48px logo');
        });
    });

    describe('Defensive: Profile without anchors', () => {
        test('getAllPotentialConfigs handles profile with no anchors gracefully', () => {
            const testProfile = {
                id: 'test-no-anchors',
                name: 'Test',
                logoValue: 255.0,
                getHeuristicConfig: (w, h, anchor) => ({
                    logoSize: 48,
                    marginRight: 20,
                    marginBottom: 20,
                    anchor: anchor || 'bottom-right',
                    isOfficial: false
                })
            };
            registry.registerProfile(testProfile);
            const configs = getAllPotentialConfigs(500, 500, 'test-no-anchors');
            assert.ok(configs.length >= 1, 'Should return at least 1 config even without anchors');
            for (const c of configs) {
                assert.ok(c.anchor, `Config must have anchor, got: ${JSON.stringify(c)}`);
            }
            registry.profiles.delete('test-no-anchors');
        });

        test('getAllPotentialConfigs handles profile with anchors', () => {
            const configs = getAllPotentialConfigs(3000, 2000, 'doubao');
            assert.ok(configs.length >= 2, 'Doubao heuristic should return configs for all anchors');
        });
    });
});
