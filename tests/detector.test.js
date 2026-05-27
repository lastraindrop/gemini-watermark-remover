import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCorrelation, calculateProbeConfidence, detectWatermark, DetectorContext } from '../src/core/detector.js';
import { calculateWatermarkPosition } from '../src/core/config.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, generateParameterMatrix } from './test_utils.js';
import { PROFILES } from '../src/core/profiles.js';

describe('Detector Architecture Validation (v1.8)', () => {

    const matrix = generateParameterMatrix();

    test('Verification: calculateCorrelation basic logic', () => {
        const w = 100, h = 100;
        const img = createMockImageData(w, h, 'noise', 100);
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
        const img = createMockImageData(w, h, 'noise', 100); 
        const alphaMap = createMockAlphaMap(w, h);
        
        // Apply at (10, 10)
        applyWatermark(img, 10, 10, w, h, alphaMap);
        
        // Probe at (12, 12) - offset by 2
        const initialPos = { x: 12, y: 12, width: w, height: h };
        const result = calculateProbeConfidence(img, initialPos, alphaMap, 'gemini');
        
        const foundX = Math.round(result.x); 
        assert.ok(Math.abs(foundX - 10) <= 2, `Should find X near 10, got ${foundX}`);
        assert.ok(Math.abs(Math.round(result.y) - 10) <= 2, 'Should find correct Y');
        assert.ok(result.confidence > 0.3, `Confidence too low: ${result.confidence}`);
    });

    describe('Cross-Profile Matrix Validation', () => {
        for (const { profileId, resolution } of matrix) {
            test(`Profile [${profileId}] at ${resolution.w}x${resolution.h}`, () => {
                const profile = PROFILES[profileId];
                const config = resolution.config;
                const pos = calculateWatermarkPosition(resolution.w, resolution.h, config);
                const img = createMockImageData(resolution.w, resolution.h, 'noise', 128);
                
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

    // -- Merged from detector_buffers.test.js --
    test('DetectorContext: blur buffer allocated during noise-reduced detection', () => {
        const ctx = new DetectorContext();
        const img = createMockImageData(512, 512, 'gradient');
        const alphaMaps = { 96: createMockAlphaMap(96), 48: createMockAlphaMap(48) };
        detectWatermark(img, alphaMaps, { deepScan: false, noiseReduction: true }, ctx);
        assert.ok(ctx._blurBuffer);
    });

    test('DetectorContext: reset clears all buffers', () => {
        const ctx = new DetectorContext();
        ctx._blurBuffer = new Uint8ClampedArray(100);
        ctx._sharedGradientsI = new Float32Array(50);
        ctx._sharedGradientsA = new Float32Array(50);
        ctx.reset();
        assert.strictEqual(ctx._blurBuffer, null);
        assert.strictEqual(ctx._sharedGradientsI, null);
        assert.strictEqual(ctx._sharedGradientsA, null);
    });

    // -- Merged from detector_modes.test.js --
    test('Mode: non-standard position labels as free/aligned, not anchored', () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'gradient');
        const alphaMaps = { 48: createMockAlphaMap(48), 96: createMockAlphaMap(96) };
        applyWatermark(img, 700, 700, 96, 96, alphaMaps[96]);
        const result = detectWatermark(img, alphaMaps, { deepScan: true });
        assert.ok(result);
        assert.ok(['free', 'aligned'].includes(result.mode), `Expected free/aligned, got ${result.mode}`);
    });
});
