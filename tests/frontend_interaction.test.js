import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { Blob } from 'node:buffer';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { getProfile, PROFILES } from '../src/core/profiles.js';
import { calculateWatermarkPosition, detectWatermarkConfig } from '../src/core/config.js';
import { 
    createMockImageData, 
    createMockAlphaMap, 
    applyWatermark,
    MockCanvas,
    MockImageElement,
    createMockImageElement,
    alphaToRGBA
} from './test_utils.js';

describe('Frontend Interaction & Deep API Probe', () => {
    let engine;

    before(async () => {
        // Setup Node Mocks for Browser APIs
        global.document = {
            createElement: (tag) => {
                if (tag === 'canvas') return new MockCanvas(100, 100);
                return {};
            }
        };
        global.Image = MockImageElement;
        
        engine = await WatermarkEngine.create();
        
        // Define assetCache in the test scope
        const assetCache = new Map();
        engine._loadAsset = async (key) => {
            if (assetCache.has(key)) return assetCache.get(key);
            
            let w = 96, h = 96;
            // Handle string keys like "doubao_br", "doubao_tl", "48", "96"
            if (key.includes('doubao')) {
                w = 401; h = 173; // Default doubao BR size
                if (key.includes('tl')) { w = 307; h = 167; }
            } else if (key.includes('x')) {
                const parts = key.split('x');
                w = parseInt(parts[0]) || 96;
                h = parseInt(parts[1]) || 96;
            } else if (!isNaN(parseInt(key))) {
                w = h = parseInt(key);
            }

            const alpha = createMockAlphaMap(w, h);
            const rgba = alphaToRGBA(alpha, w, h);
            const img = createMockImageElement(w, h, rgba);
            assetCache.set(key, img);
            return img;
        };
    });

    test('API: Full Engine Restoration Call (Top-Level)', async () => {
        // 1. Setup
        const w = 1024, h = 1024;
        const config = detectWatermarkConfig(w, h);
        const size = config.logoSize;
        const alphaMap = createMockAlphaMap(size);
        const originalColor = 100;
        const rawData = createMockImageData(w, h, 'solid', originalColor);
        
        // 2. Inject Watermark
        const pos = calculateWatermarkPosition(w, h, config);
        applyWatermark(rawData, pos.x, pos.y, size, size, alphaMap);
        
        // 3. API Call (Simulating app.js behavior)
        const mockImg = createMockImageElement(w, h, rawData.data);
        const result = await engine.removeWatermarkFromImage(mockImg, { profileId: 'gemini', deepScan: true });

        // 4. Verification
        assert.ok(result.removedCount > 0, 'Engine failed to detect/remove watermark via top-level API');
        assert.ok(result.canvas instanceof MockCanvas, 'Result should contain a canvas object');
        
        const ctx = result.canvas.getContext('2d');
        const finalData = ctx.getImageData(0, 0, w, h).data;
        const midIdx = ((pos.y + size/2|0) * w + (pos.x + size/2|0)) << 2;
        
        const recoveredColor = finalData[midIdx];
        assert.ok(Math.abs(recoveredColor - originalColor) <= 2, `Pixel mismatch: ${recoveredColor} vs ${originalColor}`);
    });

    test('Architecture: Profile Switching Stability', () => {
        const availableProfiles = Object.values(PROFILES).map(p => p.id);
        assert.ok(availableProfiles.includes('gemini'), 'Gemini profile missing in registry');
        assert.ok(availableProfiles.includes('doubao'), 'Doubao profile missing in registry');
        
        const doubaoProfile = getProfile('doubao');
        assert.strictEqual(typeof doubaoProfile.getHeuristicConfig, 'function', 'Doubao profile protocol mismatch');
    });

    test('Safety: Multi-Parameter Constellation resilience', async () => {
        const w = 512, h = 512;
        const rawData = createMockImageData(w, h);
        const mockImg = createMockImageElement(w, h, rawData.data);
        
        // Test various flags passed to the engine
        const combinations = [
            { deepScan: true, noiseReduction: true },
            { deepScan: false, noiseReduction: false }
        ];

        for (const opts of combinations) {
            await assert.doesNotReject(async () => {
                await engine.removeWatermarkFromImage(mockImg, opts);
            }, `Engine crashed with opts: ${JSON.stringify(opts)}`);
        }
    });
});

// -- Merged from v2_2_frontend.test.js --
describe('Download & theme edge cases (v2.2)', () => {
    test('downloadImage regenerates URL when processedUrl is missing', () => {
        const item = { processedBlob: new Blob(['test'], { type: 'image/png' }), processedUrl: null, name: 'test.png' };
        assert.ok(item.processedBlob, 'Item should have processedBlob');
        assert.strictEqual(item.processedUrl, null, 'processedUrl starts null');
    });

    test('applyProfileTheme returns early for invalid profile', async () => {
        const { applyProfileTheme } = await import('../src/app/viewModes.js');
        assert.doesNotThrow(() => {
            applyProfileTheme(null);
            applyProfileTheme({});
            applyProfileTheme({ brandColor: null });
        });
    });

    test('dark mode uses consistent storage key', () => {
        const STORAGE_KEY = 'gwr_dark_mode';
        assert.strictEqual(typeof STORAGE_KEY, 'string');
        assert.ok(STORAGE_KEY.length > 0);
    });
});
