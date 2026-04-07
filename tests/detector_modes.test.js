import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Detector Mode Labeling Accuracy', () => {
    const alphaMaps = { 48: createMockAlphaMap(48), 96: createMockAlphaMap(96) };

    test('Heuristic candidate in non-standard position should NOT be labeled as "anchored"', () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'gradient');
        const size = 96;
        const alphaMap = alphaMaps[size];
        
        // Place watermark in a random free position (not 32 or 64 margin)
        const targetX = 500;
        const targetY = 500;
        applyWatermark(img, targetX, targetY, size, alphaMap);

        const result = detectWatermark(img, alphaMaps, { deepScan: true });

        assert.ok(result, 'Detection failed');
        assert.strictEqual(result.mode, 'free', `Expected mode "free" for random position, got "${result.mode}"`);
    });

    test('Candidate in standard margin (but mismatched logo size) should be labeled as "aligned"', () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'solid', 128);
        const size = 48; 
        const alphaMap = alphaMaps[size];
        
        // Use 64px margin (which is standard for 96px logo, but here we use 48px)
        // This is ALIGNED but NOT ANCHORED (because standardConfigs for 48px expects 32px margin)
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        applyWatermark(img, targetX, targetY, size, alphaMap);

        const result = detectWatermark(img, alphaMaps, { deepScan: true });

        assert.ok(result, 'Detection failed');
        assert.strictEqual(result.mode, 'aligned', `Expected mode "aligned" for mismatched but standard margin, got "${result.mode}"`);
    });
});
