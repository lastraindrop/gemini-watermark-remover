/**
 * Recall Boundary & Anchor Tolerance Tests (v2.0)
 * 
 * Verifies that:
 * 1. Loosened gradient penalty (0.45x) prevents obvious watermark suppression.
 * 2. Relaxed anchor position tolerance (12%) accepts slightly shifted watermarks.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateProbeConfidence } from '../src/core/detector.js';
import { detectWatermarks } from '../src/core/detectionPipeline.js';
import '../src/core/catalog.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Recall Enhancement Validation (v2.0)', () => {

    test('T1.1: Weak watermark with weak gradients is preserved by 0.45 penalty', () => {
        const size = 96;
        const alphaMap = createMockAlphaMap(size);
        // Create a very smooth gradient background to minimize image gradients
        const img = createMockImageData(512, 512, 'gradient', 128);
        
        // Inject watermark with low alpha (weak)
        // Previous 0.25x penalty might drop it below 0.18 threshold
        // New 0.45x penalty should keep it visible
        applyWatermark(img, 300, 300, size, size, alphaMap, 255);

        // Simulate a case where gradientConf is low (< 0.05)
        // We can't force calculateGradientCorrelation but we can check the result of calculateProbeConfidence
        const pos = { x: 300, y: 300, width: size, height: size };
        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
        
        assert.ok(result.confidence > 0.18, `Confidence ${result.confidence} should stay above probe threshold (0.18) with 0.45x penalty`);
    });

    test('T1.2: Shifted watermark (10% offset) is accepted as "near anchor"', async () => {
        const w = 1536, h = 672;
        const size = 96;
        const img = createMockImageData(w, h, 'grid', 128);
        const alphaMap = createMockAlphaMap(size);

        // Standard position: x=1536-64-96=1376, y=672-64-96=512
        // Shift by 8% of 96px ≈ 8px
        const offsetX = 8;
        const offsetY = 7;
        const targetX = 1376 + offsetX;
        const targetY = 512 + offsetY;

        applyWatermark(img, targetX, targetY, size, size, alphaMap);

        // detectionPipeline.isNearExpectedAnchor now uses 12% tolerance
        // 96 * 0.12 = 11.5px. Our 8px shift should be ACCEPTED.
        
        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async () => ({ data: alphaMap, width: size, height: size }),
            options: { globalFallbackMinConfidence: 0.20 }
        });

        if (!result.winner) {
            console.log('Detection failed completely. Matches:', result.matches);
        } else {
            console.log(`Detected at (${result.winner.pos.x}, ${result.winner.pos.y}) with conf ${result.winner.confidence}, source: ${result.winner.source}`);
        }

        assert.ok(result.winner, 'Should detect shifted watermark');
        assert.ok(result.confidence > 0.20, `Confidence ${result.confidence} should pass global fallback`);
        assert.ok(Math.abs(result.winner.pos.x - targetX) <= 4, `Should match shifted X. Got ${result.winner.pos.x}, expected ${targetX}`);
    });
});
