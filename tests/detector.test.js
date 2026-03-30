import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { calculateWatermarkPosition } from '../src/core/config.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, addNoise } from './test_utils.js';

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

    test('Robustness: 800x2048 (gradient) - High Conf', () => {
        const img = createMockImageData(800, 2048, 'gradient');
        const alphaMap = alphaMaps[48];
        const config = { logoSize: 48, marginRight: 32, marginBottom: 32 };
        const pos = calculateWatermarkPosition(800, 2048, config);
        applyWatermark(img, pos.x, pos.y, 48, alphaMap);
        
        const result = detectWatermark(img, alphaMaps);
        assert.ok(result);
        assert.strictEqual(result.size, 48);
    });

    describe('Full Catalog Tier Verification', () => {
        const tiers = [
            { w: 1024, h: 1024, s: 96 },
            { w: 1536, h: 672, s: 96 },
            { w: 768, h: 1376, s: 96 },
            { w: 1584, h: 672, s: 96 },
            { w: 2048, h: 2048, s: 96 }
        ];

        tiers.forEach(({ w, h, s }) => {
            test(`Detection accuracy: ${w}x${h} (size=${s})`, () => {
                const img = createMockImageData(w, h, 'grid');
                const alphaMap = createMockAlphaMap(s);
                const config = { logoSize: s, marginRight: (s === 96 ? 64 : 32), marginBottom: (s === 96 ? 64 : 32) };
                const pos = calculateWatermarkPosition(w, h, config);
                applyWatermark(img, pos.x, pos.y, s, alphaMap);
                
                const result = detectWatermark(img, alphaMaps);
                assert.ok(result, `Should detect ${s} on ${w}x${h}`);
                assert.strictEqual(result.size, s);
            });
        });
    });

    test('Safety: tiny image (50x50) returns null', () => {
        const img = createMockImageData(50, 50);
        const result = detectWatermark(img, alphaMaps);
        assert.strictEqual(result, null);
    });

    test('V1.5 High-Noise Resilience (Adaptive NR)', () => {
        const w = 512, h = 512, size = 96;
        const img = createMockImageData(w, h, 'solid', 128);
        const alphaMap = alphaMaps[size];
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        
        applyWatermark(img, targetX, targetY, size, alphaMap);
        addNoise(img, 60); 

        const result = detectWatermark(img, alphaMaps, { deepScan: false, noiseReduction: true });
        assert.ok(result, 'Noise Reduction detection failed');
        assert.ok(result.confidence > 0.3);
    });
});
