import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';

describe('Engine Logic - Configurations', () => {
    test('detectWatermarkConfig returns 96 for large images', () => {
        const config = detectWatermarkConfig(1025, 1025);
        assert.strictEqual(config.logoSize, 96);
        assert.strictEqual(config.marginRight, 64);
    });

    test('detectWatermarkConfig returns 48 for small/medium images (Boundary check)', () => {
        assert.strictEqual(detectWatermarkConfig(1024, 1024).logoSize, 48);
        assert.strictEqual(detectWatermarkConfig(1024, 2000).logoSize, 48);
        assert.strictEqual(detectWatermarkConfig(2000, 1024).logoSize, 48);
    });

    test('calculateWatermarkPosition handles alignment correctly', () => {
        const config = { logoSize: 48, marginRight: 32, marginBottom: 32 };
        const pos = calculateWatermarkPosition(1000, 1000, config);
        
        // x = 1000 - 32 - 48 = 920
        assert.strictEqual(pos.x, 920);
        assert.strictEqual(pos.y, 920);
        assert.strictEqual(pos.width, 48);
    });
});
