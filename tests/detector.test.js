import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { createMockImageData, applyWatermark, createMockAlphaMap, addNoise } from './test_utils.js';

describe('Watermark Detector Engine - Generalized Scenarios', () => {

    const combinations = [
        { w: 1024, h: 1024, size: 96, bg: 'solid', status: 'aligned' },
        { w: 2048, h: 800, size: 96, bg: 'gradient', status: 'anchored' }, // 21:9
        { w: 800, h: 2048, size: 48, bg: 'gradient', status: 'free' } // Portrait
    ];

    const alphaMaps = { 48: createMockAlphaMap(48), 96: createMockAlphaMap(96) };

    for (const combo of combinations) {
        test(`Robustness: ${combo.w}x${combo.h} (${combo.bg})`, () => {
            const img = createMockImageData(combo.w, combo.h, combo.bg);
            const alphaMap = alphaMaps[combo.size];
            
            // Random offset within reasonable margin for 'free' or aligned for 'anchored'
            let targetX, targetY;
            if (combo.status === 'anchored' || combo.status === 'aligned') {
                targetX = combo.w - 64 - combo.size;
                targetY = combo.h - 64 - combo.size;
            } else {
                targetX = combo.w - 200 - Math.floor(Math.random() * 50);
                targetY = combo.h - 200 - Math.floor(Math.random() * 50);
            }
            
            applyWatermark(img, targetX, targetY, combo.size, alphaMap);
            const result = detectWatermark(img, alphaMaps);

            assert.ok(result, `Failed to detect size ${combo.size} on ${combo.w}x${combo.h}`);
            assert.ok(Math.abs(result.x - targetX) <= 1, `X mismatch: got ${result.x}, expected ${targetX}`);
            assert.ok(Math.abs(result.y - targetY) <= 1, `Y mismatch: got ${result.y}, expected ${targetY}`);
        });
    }

    test('V1.5 Edge Crop Recovery (Partial Overflow)', () => {
        const w = 400, h = 400, size = 96;
        const img = createMockImageData(w, h, 'solid', 50);
        const alphaMap = alphaMaps[size];
        
        // 40% outside (60% visible)
        const targetX = 50, targetY = 400 - (size * 0.6); 
        applyWatermark(img, targetX, targetY, size, alphaMap);

        const result = detectWatermark(img, alphaMaps);
        assert.ok(result, 'Edge detection failed');
        assert.ok(Math.abs(result.y - targetY) <= 1);
        assert.ok(result.confidence > 0.45);
    });

    test('V1.5 High-Noise Resilience (Adaptive NR)', () => {
        const w = 512, h = 512, size = 96;
        const img = createMockImageData(w, h, 'solid', 128);
        const alphaMap = alphaMaps[size];
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        
        applyWatermark(img, targetX, targetY, size, alphaMap);
        addNoise(img, 60); // Apply heavy noise after watermark injection

        const result = detectWatermark(img, alphaMaps, { deepScan: false, noiseReduction: true });
        assert.ok(result, 'Noise Reduction detection failed');
        assert.ok(result.confidence > 0.3);
    });
});
