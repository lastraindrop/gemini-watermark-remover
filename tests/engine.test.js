import { describe, it, expect } from 'vitest';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/watermarkEngine.js';

describe('Engine - Logic and Configuration', () => {
    const testCases = [
        { w: 2000, h: 2000, expectedSize: 96, expectedMargin: 64 },
        { w: 1024, h: 1024, expectedSize: 48, expectedMargin: 32 }, // Boundary
        { w: 1025, h: 1025, expectedSize: 96, expectedMargin: 64 }, // Boundary
        { w: 800, h: 1200, expectedSize: 48, expectedMargin: 32 },  // Mixed
    ];

    it.each(testCases)('should detect correct config for %ow x %oh', ({ w, h, expectedSize, expectedMargin }) => {
        const config = detectWatermarkConfig(w, h);
        expect(config.logoSize).toBe(expectedSize);
        expect(config.marginRight).toBe(expectedMargin);
        expect(config.marginBottom).toBe(expectedMargin);
    });

    it('should calculate correct watermark position in the bottom-right corner', () => {
        const w = 1200, h = 1200;
        const config = detectWatermarkConfig(w, h); // 96, 64, 64
        const pos = calculateWatermarkPosition(w, h, config);
        
        // x = w - margin - size = 1200 - 64 - 96 = 1040
        // y = h - margin - size = 1200 - 64 - 96 = 1040
        expect(pos.x).toBe(1040);
        expect(pos.y).toBe(1040);
        expect(pos.width).toBe(96);
        expect(pos.height).toBe(96);
    });
});
