/**
 * GWR v1.8.1 - Deep Parameter Matrix Regression Suite
 * 
 * This suite verifies the entire Cartesian product of:
 * Profiles (Gemini, Doubao) x Tiers/Resolutions (Catalog) x Flags (DeepScan, NR)
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { 
    generateParameterMatrix, 
    createMockImageData, 
    applyWatermark, 
    createMockAlphaMap,
    MockCanvas,
    MockImageElement,
    createMockImageElement,
    alphaToRGBA
} from './test_utils.js';
import { installMockAssetLoader } from './setup.js';
import { PROFILES } from '../src/core/profiles.js';
import { calculateWatermarkPosition } from '../src/core/config.js';

describe('Deep Regression: Parameter Matrix', () => {
    let engine;
    const matrix = generateParameterMatrix();

    before(async () => {
        // Setup Browser Environment Mocks in Node
        global.document = {
            createElement: (tag) => {
                if (tag === 'canvas') return new MockCanvas(100, 100);
                return {};
            }
        };
        global.Image = MockImageElement;
        
        engine = await WatermarkEngine.create();
        
        installMockAssetLoader(engine, { createMockAlphaMap, alphaToRGBA, createMockImageElement });
    });

    // We split the matrix into batches to prevent log overflow while keeping exhaustive coverage
    const BATCH_SIZE = 20;
    for (let i = 0; i < matrix.length; i += BATCH_SIZE) {
        const batch = matrix.slice(i, i + BATCH_SIZE);
        
        test(`Matrix Batch ${i/BATCH_SIZE + 1}: ${batch[0].profileId}...`, async () => {
            for (const item of batch) {
                const { profileId, options, resolution } = item;
                const { w, h, config: targetCatalogConfig } = resolution;
                
                const bgType = profileId === 'doubao' ? 'grid' : 'gradient';
                const rawData = createMockImageData(w, h, bgType, 150);
                const originalSnapshot = new Uint8ClampedArray(rawData.data);
                
                const pos = calculateWatermarkPosition(w, h, targetCatalogConfig);
                const logoW = pos.width;
                const logoH = pos.height;
                const alphaMap = createMockAlphaMap(logoW, logoH);
                const profile = PROFILES[profileId];

                applyWatermark(rawData, pos.x, pos.y, logoW, logoH, alphaMap, profile.logoValue);

                const mockImg = createMockImageElement(w, h, rawData.data);
                const result = await engine.removeWatermarkFromImage(mockImg, {
                    profileId,
                    ...options
                });

                assert.ok(result, `Null result for ${profileId} @ ${w}x${h}`);
                assert.ok(result.removedCount > 0, `Detection failure for ${profileId} @ ${w}x${h} [Anchor: ${pos.anchor}] with ${JSON.stringify(options)}`);
                
                const minConf = profileId === 'doubao' ? 0.08 : 0.2;
                assert.ok(result.confidence > minConf, `Low confidence for ${profileId} @ ${w}x${h} [Anchor: ${pos.anchor}] with ${JSON.stringify(options)}: got ${result.confidence}`);

                const midX = Math.floor(pos.x + pos.width / 2);
                const midY = Math.floor(pos.y + pos.height / 2);
                const ctx = result.canvas.getContext('2d');
                const finalData = ctx.getImageData(0, 0, w, h).data;
                const idx = (midY * w + midX) << 2;
                
                const diff = Math.abs(finalData[idx] - originalSnapshot[idx]);
                assert.ok(diff <= 12, `Recovery error for ${profileId} at (${midX},${midY}): diff=${diff}`);
            }
        });
    }

    test('Safety: Empty/Random image processing', async () => {
        const img = createMockImageElement(500, 500, new Uint8ClampedArray(500*500*4));
        const result = await engine.removeWatermarkFromImage(img, { profileId: 'gemini' });
        assert.strictEqual(result.removedCount, 0, 'Should not detect watermark in empty image');
    });

    test('Adversarial: Partially cropped watermark (v1.9.8)', async () => {
        const w = 512, h = 512;
        const rawData = createMockImageData(w, h, 'gradient');
        const alphaMap = createMockAlphaMap(48);
        
        // Inject at edge (partially outside)
        const pos = { x: 500, y: 500, width: 48, height: 48 };
        applyWatermark(rawData, pos.x, pos.y, 48, 48, alphaMap);
        
        const img = createMockImageElement(w, h, rawData.data);
        const result = await engine.removeWatermarkFromImage(img, { profileId: 'gemini' });
        
        // Should either detect it or fail gracefully without throwing
        assert.ok(typeof result.removedCount === 'number');
    });

    test('Adversarial: Extreme Noise (v1.9.8)', async () => {
        const w = 256, h = 256;
        const rawData = createMockImageData(w, h, 'random'); // Pure random
        const img = createMockImageElement(w, h, rawData.data);
        
        const result = await engine.removeWatermarkFromImage(img, { profileId: 'auto' });
        // In case of random hits, confidence should be extremely low
        if (result.removedCount > 0) {
            // v1.9.8: Raising limit to 0.25 which is the actual "confidence" threshold for standard removal
            assert.ok(result.confidence < 0.25, `False positive with high confidence: ${result.confidence}`);
        } else {
            assert.strictEqual(result.removedCount, 0);
        }
    });
});
