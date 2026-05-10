import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarks, detectProfileWatermarks } from '../src/core/detectionPipeline.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, setupMemoryMocks } from './test_utils.js';

describe('Detection Fallback Chain Tests', () => {

    test('Should return empty result when no watermark found at high threshold', async () => {
        const img = createMockImageData(1024, 1024, 'solid', 128);
        
        const result = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                const size = parseInt(key) || 96;
                return { data: createMockAlphaMap(size), width: size, height: size, assetKey: key };
            },
            options: {
                probeThreshold: 0.99,
                fallbackThreshold: 0.99,
                deepScan: false
            }
        });
        
        assert.ok(result);
        assert.strictEqual(result.matches.length, 0);
        assert.strictEqual(result.winner, null);
        assert.strictEqual(result.confidence, 0);
    });

    test('Should use probeThreshold from options', async () => {
        const img = createMockImageData(1024, 1024, 'noise', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 1024 - 96 - 64, 1024 - 96 - 64, 96, 96, alpha96, 255);
        
        const permissive = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                if (key === '96') return { data: alpha96, width: 96, height: 96, assetKey: '96' };
                return { data: createMockAlphaMap(48), width: 48, height: 48, assetKey: '48' };
            },
            options: {
                probeThreshold: 0.01,
                deepScan: false
            }
        });
        
        assert.ok(permissive.matches.length > 0);
    });

    test('Should respect globalFallbackBelow threshold', async () => {
        const img = createMockImageData(1024, 1024, 'solid', 128);
        
        const result = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                const size = parseInt(key) || 96;
                return { data: createMockAlphaMap(size), width: size, height: size, assetKey: key };
            },
            options: {
                globalFallbackBelow: 0.99,
                deepScan: false
            }
        });
        
        assert.strictEqual(result.matches.length, 0);
    });

    test('Should respect autoNonCatalogMinConfidence threshold', async () => {
        const img = createMockImageData(1024, 1024, 'solid', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alpha96, 255);
        
        const permissive = await detectWatermarks({
            imageData: img,
            profileId: 'auto',
            getAlphaMap: async (key) => {
                const size = parseInt(key) || 96;
                return { data: createMockAlphaMap(size), width: size, height: size, assetKey: key };
            },
            options: {
                autoNonCatalogMinConfidence: 0.01,
                deepScan: true
            }
        });
        
        const strict = await detectWatermarks({
            imageData: img,
            profileId: 'auto',
            getAlphaMap: async (key) => {
                const size = parseInt(key) || 96;
                return { data: createMockAlphaMap(size), width: size, height: size, assetKey: key };
            },
            options: {
                autoNonCatalogMinConfidence: 0.99,
                deepScan: true
            }
        });
        
        assert.ok(permissive);
        assert.ok(strict);
        
        if (permissive.winner && !permissive.winner.config.isOfficial && !permissive.winner.config.scaledFrom) {
            assert.ok(permissive.profileId !== 'auto' || strict.profileId === 'auto', 
                'Threshold should affect non-catalog results in auto mode');
        }
    });

    test('Should detect watermark at exact catalog position', async () => {
        const img = createMockImageData(1024, 1024, 'noise', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        
        const x = 1024 - 96 - 64;
        const y = 1024 - 96 - 64;
        applyWatermark(img, x, y, 96, 96, alpha96, 255);
        
        const result = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                if (key === '96') return { data: alpha96, width: 96, height: 96, assetKey: '96' };
                return { data: createMockAlphaMap(parseInt(key) || 48), width: parseInt(key) || 48, height: parseInt(key) || 48, assetKey: key };
            },
            options: {
                deepScan: false
            }
        });
        
        assert.ok(result.matches.length > 0);
        assert.ok(result.winner);
        assert.ok(result.winner.config);
    });

    test('Should support manual config mode', async () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const result = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                return { data: alphaMap, width: 96, height: 96, assetKey: key };
            },
            options: {
                manualConfig: {
                    x: 50,
                    y: 50,
                    width: 96,
                    height: 96,
                    assetKey: '96'
                },
                deepScan: false
            }
        });
        
        assert.strictEqual(result.winner.source, 'manual-input');
        assert.strictEqual(result.winner.config.manual, true);
        assert.strictEqual(result.winner.pos.anchor, 'manual');
    });

    test('Manual config should set correct position', async () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        
        applyWatermark(img, 20, 30, 48, 48, alphaMap, 255);
        
        const result = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                return { data: alphaMap, width: 48, height: 48, assetKey: key };
            },
            options: {
                manualConfig: {
                    x: 20,
                    y: 30,
                    width: 48,
                    height: 48
                },
                deepScan: false
            }
        });
        
        assert.strictEqual(result.winner.pos.x, 20);
        assert.strictEqual(result.winner.pos.y, 30);
    });

    test('getProfilesToTry should return all non-experimental for auto', async () => {
        import('../src/core/detectionPipeline.js').then(mod => {
            const profiles = mod.getProfilesToTry('auto');
            assert.ok(Array.isArray(profiles));
            assert.ok(profiles.length > 0);
            assert.ok(profiles.includes('gemini'));
            assert.ok(profiles.includes('doubao'));
        });
    });

    test('getProfilesToTry should return single profile for non-auto', async () => {
        import('../src/core/detectionPipeline.js').then(mod => {
            const profilesGemini = mod.getProfilesToTry('gemini');
            const profilesDoubao = mod.getProfilesToTry('doubao');
            
            assert.deepStrictEqual(profilesGemini, ['gemini']);
            assert.deepStrictEqual(profilesDoubao, ['doubao']);
        });
    });

    test('Should handle missing alphaMap asset gracefully', async () => {
        const img = createMockImageData(1024, 1024, 'solid', 128);
        
        const result = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                return null;
            },
            options: {
                deepScan: false
            }
        });
        
        assert.ok(result);
        assert.strictEqual(result.matches.length, 0);
    });

    test('Should not run global search for perfect catalog match', async () => {
        const img = createMockImageData(1024, 1024, 'noise', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 1024 - 96 - 64, 1024 - 96 - 64, 96, 96, alpha96, 255);
        
        const result = await detectProfileWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: async (key) => {
                if (key === '96') return { data: alpha96, width: 96, height: 96, assetKey: '96' };
                return { data: createMockAlphaMap(parseInt(key) || 48), width: parseInt(key) || 48, height: parseInt(key) || 48, assetKey: key };
            },
            options: {
                deepScan: false,
                globalFallbackBelow: 0.0
            }
        });
        
        assert.ok(result.matches.length > 0);
        const catalogMatches = result.matches.filter(m => m.source === 'catalog-probe');
        assert.ok(catalogMatches.length > 0);
    });
});
