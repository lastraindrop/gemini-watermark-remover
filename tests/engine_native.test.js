import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';

describe('Engine Logic - Configurations', () => {
    test('detectWatermarkConfig returns correct sizes for various images', () => {
        const testCases = [
            { w: 2000, h: 2000, expectedSize: 96, expectedMargin: 64 },
            { w: 1024, h: 1024, expectedSize: 48, expectedMargin: 32 },
            { w: 1025, h: 1025, expectedSize: 96, expectedMargin: 64 },
            { w: 800, h: 1200, expectedSize: 48, expectedMargin: 32 },
        ];

        testCases.forEach(({ w, h, expectedSize, expectedMargin }) => {
            const config = detectWatermarkConfig(w, h);
            assert.strictEqual(config.logoSize, expectedSize, `Failed for ${w}x${h}`);
        });
    });

    test('calculateWatermarkPosition handles various alignments (Parameterized)', () => {
        const views = [
            { w: 1200, h: 1200, size: 96, margin: 64, ex: 1040, ey: 1040 },
            { w: 800, h: 600, size: 48, margin: 32, ex: 720, ey: 520 },
            { w: 2000, h: 1000, size: 48, margin: 32, ex: 1920, ey: 920 }
        ];

        views.forEach(({ w, h, size, margin, ex, ey }) => {
            const pos = calculateWatermarkPosition(w, h, { logoSize: size, marginRight: margin, marginBottom: margin });
            assert.strictEqual(pos.x, ex);
            assert.strictEqual(pos.y, ey);
            assert.strictEqual(pos.width, size);
        });
    });

    test('Robustness: handle extremely small images gracefully', () => {
        // 10x10 image with 48px logo and 32px margin
        // x = 10 - 32 - 48 = -70
        const config = detectWatermarkConfig(10, 10);
        const pos = calculateWatermarkPosition(10, 10, config);
        
        assert.ok(pos.x < 0, 'X should be negative for small image');
        // Our blendModes.js loop should handle this because it iterates over width/height 
        // but uses (y + row) and (x + col) to index into imageData. 
        // We should ensure it doesn't crash if these are out of bounds.
    });
});
