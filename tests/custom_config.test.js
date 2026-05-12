/**
 * Custom Configuration Mode (v2.1) Validation Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarks } from '../src/core/detectionPipeline.js';
import '../src/core/catalog.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Custom Configuration Validation (v2.1)', () => {

    test('Custom Threshold: Low probeThreshold should catch extremely weak watermarks', async () => {
        const size = 96;
        const img = createMockImageData(512, 512, 'solid', 100);
        
        // Create an extremely weak alpha map (avg 0.08)
        const alphaMap = new Float32Array(size * size).fill(0.08);
        
        // Inject weak watermark
        applyWatermark(img, 200, 200, size, size, alphaMap, 255);
        
        // Standard probeThreshold is 0.18. 
        // NCC for solid background with constant alpha should be high? 
        // Wait, NCC subtracts mean. If both are constant, it's undefined (0).
        // Let's use 'grid' background to make it harder.
        const imgGrid = createMockImageData(512, 512, 'grid', 100);
        applyWatermark(imgGrid, 200, 200, size, size, alphaMap, 255);

        const resDefault = await detectWatermarks({
            imageData: imgGrid,
            profileId: 'gemini',
            getAlphaMap: async () => ({ data: alphaMap, width: size, height: size }),
            options: { probeThreshold: 0.50 } // Use a high threshold that SHOULD fail
        });
        
        const resCustom = await detectWatermarks({
            imageData: imgGrid,
            profileId: 'gemini',
            getAlphaMap: async () => ({ data: alphaMap, width: size, height: size }),
            options: { probeThreshold: 0.01 } // Should pass
        });

        assert.strictEqual(resDefault.winner, null, 'High threshold should reject weak watermark');
        assert.ok(resCustom.winner, 'Ultra-low threshold should accept weak watermark');
    });

    test('Manual Config: Forces removal at specific coordinates bypassing detection', async () => {
        const img = createMockImageData(200, 200, 'solid', 50);
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(1.0); // Solid block
        
        // Inject watermark at (10, 10)
        applyWatermark(img, 10, 10, size, size, alphaMap, 255);
        
        // Call with manualConfig
        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async () => ({ data: alphaMap, width: size, height: size }),
            options: { 
                manualConfig: { x: 10, y: 10, width: size, height: size } 
            }
        });

        assert.ok(result.winner, 'Manual config should return a winner');
        assert.strictEqual(result.winner.pos.x, 10, 'Should use manual X');
        assert.strictEqual(result.winner.source, 'manual-input', 'Source should be manual-input');
    });

    test('Manual Config: Rejects invalid or out-of-bounds regions', async () => {
        const img = createMockImageData(200, 200, 'solid', 50);
        const alphaMap = new Float32Array(48 * 48).fill(1.0);
        const getAlphaMap = async () => ({ data: alphaMap, width: 48, height: 48 });

        const invalidConfigs = [
            { x: -1, y: 0, width: 48, height: 48 },
            { x: 0, y: 0, width: 0, height: 48 },
            { x: 180, y: 180, width: 48, height: 48 },
            { x: Number.NaN, y: 0, width: 48, height: 48 }
        ];

        for (const manualConfig of invalidConfigs) {
            await assert.rejects(
                () => detectWatermarks({
                    imageData: img,
                    profileId: 'gemini',
                    getAlphaMap,
                    options: { manualConfig }
                }),
                RangeError,
                `Expected manual config to be rejected: ${JSON.stringify(manualConfig)}`
            );
        }
    });
});
