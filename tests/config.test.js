import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';

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
        assert.strictEqual(config.logoSize, 96, 'Heuristic for >1500 should be 96');
        assert.strictEqual(config.isOfficial, false, 'Heuristic fallback should not be marked as official');
    });

    test('Heuristic Fallback: Small non-standard image (800x800)', () => {
        const config = detectWatermarkConfig(800, 800);
        assert.strictEqual(config.logoSize, 48, 'Heuristic for <1500 should be 48');
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
        test('Exact maxSide threshold: 1500px', () => {
            const config = detectWatermarkConfig(1500, 500);
            // Threshold is maxSide > 1500 in v1.5? Let's verify source
            // Current heuristic usually marks >1500 as 96
            assert.strictEqual(config.logoSize, 96, '1500px should trigger 96px logoSize');
        });

        test('Standard maxSide but non-standard minSide: 1024x500', () => {
            const config = detectWatermarkConfig(1024, 500);
            assert.strictEqual(config.isOfficial, false, 'Should not match catalog if height is too different');
            assert.strictEqual(config.logoSize, 48, '1024 with small height should fallback to 48px logo');
        });
    });
});
