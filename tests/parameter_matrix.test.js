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
        
        const assetCache = new Map();
        engine._loadAsset = async (key) => {
            if (assetCache.has(key)) return assetCache.get(key);
            
            let w = 96, h = 96;
            // Handle all key formats: "48", "96", "WxH", "doubao_br", "doubao_tl"
            if (key.includes('doubao')) {
                w = 401; h = 173; // Default doubao BR
                if (key.includes('tl')) { w = 307; h = 167; }
            } else if (key.includes('x')) {
                const parts = key.split('x');
                w = parseInt(parts[0]) || 96;
                h = parseInt(parts[1]) || 96;
            } else {
                w = h = parseInt(key) || 96;
            }

            const alpha = createMockAlphaMap(w, h);
            const rgba = alphaToRGBA(alpha, w, h);
            const img = createMockImageElement(w, h, rgba);
            assetCache.set(key, img);
            return img;
        };
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
});
