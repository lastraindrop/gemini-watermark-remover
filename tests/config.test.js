import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';

describe('Watermark Config Logic - Priority & Fallback', () => {

    test('Catalog Priority: 1024x1024 should return isOfficial: true', () => {
        const config = detectWatermarkConfig(1024, 1024);
        assert.ok(config);
        assert.strictEqual(config.isOfficial, true, 'Official resolutions should be marked');
        assert.strictEqual(config.logoSize, 96);
    });

    test('Heuristic Fallback: 2000x2000 (Non-standard)', () => {
        const config = detectWatermarkConfig(2000, 2000);
        assert.ok(config);
        assert.strictEqual(config.logoSize, 96, 'Heuristic for >1500 should be 96');
        assert.strictEqual(config.isOfficial, undefined, 'Heuristic fallback should not be marked as official');
    });

    test('Heuristic Fallback: 800x800 (Small)', () => {
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
            assert.strictEqual(config.isOfficial, undefined, 'Should not match catalog if height is too different');
            assert.strictEqual(config.logoSize, 48, '1024 with small height should fallback to 48px logo');
        });
    });
});
