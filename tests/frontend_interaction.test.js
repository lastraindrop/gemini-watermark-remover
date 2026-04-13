import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getProfile, PROFILES } from '../src/core/profiles.js';
import { detectWatermark } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateWatermarkPosition, detectWatermarkConfig } from '../src/core/config.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Frontend Interaction & Deep Probe', () => {

    test('End-to-End: Full Restoration Pipeline', () => {
        // 1. Setup Environment
        const w = 1024, h = 1024;
        const profile = getProfile('gemini');
        const config = detectWatermarkConfig(w, h);
        const size = config.logoSize;
        const alphaMap = createMockAlphaMap(size);
        const originalColor = 100;
        const canvasImg = createMockImageData(w, h, 'solid', originalColor);
        
        // 2. Simulate Watermark Application (Simulating Gemini result)
        const pos = calculateWatermarkPosition(w, h, config);
        applyWatermark(canvasImg, pos.x, pos.y, size, size, alphaMap);
        
        // Verify we have a watermark now
        const midIdx = ( (pos.y + size/2|0) * w + (pos.x + size/2|0) ) << 2;
        assert.notStrictEqual(canvasImg.data[midIdx], originalColor, 'Watermark injection failed');

        // 3. Detection Phase
        const alphaMaps = { [size]: alphaMap };
        const detection = detectWatermark(canvasImg, alphaMaps, { deepScan: true });
        assert.ok(detection, 'Frontend probe: Detection failed in E2E flow');
        assert.strictEqual(detection.mode, 'anchored', 'Should reach anchored state for cataloged sizes');

        // 4. Removal Phase
        removeWatermark(canvasImg, alphaMap, detection);

        // 5. Pixel Verification (Deep Probe)
        const recoveredColor = canvasImg.data[midIdx];
        // Mathematical tolerance check
        assert.ok(Math.abs(recoveredColor - originalColor) <= 2, `Deep probe failed: pixel mismatch ${recoveredColor} vs ${originalColor}`);
    });

    test('Architecture: Profile Switching Stability', () => {
        const availableProfiles = Object.values(PROFILES).map(p => p.id);
        assert.ok(availableProfiles.includes('gemini'), 'Gemini profile missing in registry');
        assert.ok(availableProfiles.includes('doubao'), 'Doubao profile missing in registry');
        
        // Doubao profile has heuristic config; Gemini uses catalog-only
        const doubaoProfile = getProfile('doubao');
        assert.strictEqual(typeof doubaoProfile.getHeuristicConfig, 'function', 'Doubao profile protocol mismatch: getHeuristicConfig missing');
    });

    test('Data Handling: Multi-Protocol Parameter Support', () => {
        // Verify that passing different profile options doesn't crash the core
        const w = 512, h = 512;
        const img = createMockImageData(w, h);
        const alphaMaps = { 48: new Float32Array(48*48) };
        
        // Test with various parameter constellations
        const combinations = [
            { deepScan: true, noiseReduction: true },
            { deepScan: false, noiseReduction: false },
            { deepScan: true, noiseReduction: false }
        ];

        for (const opts of combinations) {
            assert.doesNotThrow(() => {
                detectWatermark(img, alphaMaps, opts);
            }, `Crash detected with params: ${JSON.stringify(opts)}`);
        }
    });
});
