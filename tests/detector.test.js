import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCorrelation, calculateProbeConfidence } from '../src/core/detector.js';
import { calculateWatermarkPosition } from '../src/core/config.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, generateParameterMatrix } from './test_utils.js';
import { PROFILES } from '../src/core/profiles.js';

describe('Detector Architecture Validation (v1.8)', () => {

    const matrix = generateParameterMatrix();

    test('Verification: calculateCorrelation basic logic', () => {
        const w = 100, h = 100;
        const img = createMockImageData(w, h, 'solid', 100);
        const alphaMap = createMockAlphaMap(w, h);
        
        // Perfect match apply
        applyWatermark(img, 0, 0, w, h, alphaMap);
        const conf = calculateCorrelation(img, 0, 0, w, h, alphaMap, true);
        assert.ok(conf > 0.9, `Should have high correlation, got ${conf}`);
        
        // Offset match
        const confOffset = calculateCorrelation(img, 5, 5, w, h, alphaMap, true);
        assert.ok(confOffset < conf, 'Offset should decrease correlation');
    });

    test('Verification: calculateProbeConfidence (Sliding Window)', () => {
        const w = 100, h = 100;
        const img = createMockImageData(w, h, 'grid'); // Grid is better for alignment testing
        const alphaMap = createMockAlphaMap(w, h);
        
        // Apply at (10, 10)
        applyWatermark(img, 10, 10, w, h, alphaMap);
        
        // Probe at (12, 12) - offset by 2
        const initialPos = { x: 12, y: 12, width: w, height: h };
        const result = calculateProbeConfidence(img, initialPos, alphaMap, 'gemini');
        
        assert.strictEqual(result.x, 10, 'Should find the correct X after fine-tuning');
        assert.strictEqual(result.y, 10, 'Should find the correct Y after fine-tuning');
        assert.ok(result.confidence > 0.3, `Confidence too low: ${result.confidence}`);
    });

    describe('Cross-Profile Matrix Validation', () => {
        for (const { profileId, resolution } of matrix) {
            test(`Profile [${profileId}] at ${resolution.w}x${resolution.h}`, () => {
                const profile = PROFILES[profileId];
                const config = resolution.config;
                const img = createMockImageData(resolution.w, resolution.h, 'gradient');
                
                const pos = calculateWatermarkPosition(resolution.w, resolution.h, config);
                const alphaMap = createMockAlphaMap(pos.width, pos.height);
                
                applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, profile.logoValue);
                
                const result = calculateProbeConfidence(img, pos, alphaMap, profileId);
                assert.ok(result.confidence > 0.7, `Detection failed for ${profileId} at ${resolution.w}x${resolution.h}. Conf: ${result.confidence}`);
            });
        }
    });

    test('Safety: Out of bounds probe', () => {
        const img = createMockImageData(500, 500);
        const alphaMap = createMockAlphaMap(100);
        const pos = { x: 450, y: 450, width: 100, height: 100 }; // 50px overflow
        const conf = calculateCorrelation(img, pos.x, pos.y, pos.width, pos.height, alphaMap, true);
        // Should not crash and return 0 or low value
        assert.strictEqual(typeof conf, 'number');
    });
});
