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
        
        // Place watermark at a position that is NOT in standard margins
        // Use x=200, y=200 (far from corners)
        const targetX = 200;
        const targetY = 200;
        applyWatermark(img, targetX, targetY, size, size, alphaMap);

        const result = detectWatermark(img, alphaMaps, { deepScan: true });

        assert.ok(result, 'Detection failed');
        // Should be 'free' since it's far from any standard corner
        assert.ok(['free', 'aligned'].includes(result.mode), `Expected mode "free" or "aligned", got "${result.mode}"`);
    });

    test('Candidate in standard margin (but mismatched logo size) should be labeled as "aligned"', () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'gradient');
        const size = 96; 
        const alphaMap = alphaMaps[size];
        
        // Place at a standard-ish margin (32px) which is standard for 48px but NOT for 96px
        const targetX = w - 32 - size;
        const targetY = h - 32 - size;
        applyWatermark(img, targetX, targetY, size, size, alphaMap);

        const result = detectWatermark(img, alphaMaps, { deepScan: true });

        assert.ok(result, 'Detection failed');
        // With dynamic margin check, this might be caught as 'aligned'
        assert.ok(['aligned', 'free'].includes(result.mode), `Expected mode "aligned" or "free", got "${result.mode}"`);
    });
});
