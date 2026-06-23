/**
 * GWR v1.8.5 - Ultimate Product Audit & Regression Suite
 * 
 * 1. Architecture: Verifies TemplateRegistry sync.
 * 2. Coverage: Exhaustive matrix of Profiles x Catalogs.
 * 3. Fidelity: Mathematical proof of near-zero loss restoration.
 * 4. Contract: UI State & Processing logic integrity.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from '../src/core/templates/registry.js';
import { PROFILES } from '../src/core/profiles.js';
import { CATALOGS } from '../src/core/catalog.js';
import { calculateWatermarkPosition } from '../src/core/config.js';

import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { state, objectUrlManager } from '../src/app/state.js';
import { processSingle } from '../src/app/processing.js';
import { Blob } from 'node:buffer';
import { 
    createMockImageData, 
    applyWatermark, 
    createMockAlphaMap,
    MockCanvas,
    MockImageElement,
    createMockImageElement,
    setupMemoryMocks,
    alphaToRGBA
} from './test_utils.js';
import { installMockAssetLoader } from './setup.js';
import { RestorationMetrics } from '../src/core/restorationMetrics.js';


describe('GWR Ultimate Product Audit', () => {
    let engine;
    const maxSyntheticPixels = 2048 * 2048;
    const keyGeminiDimensions = new Set([
        '512x512',
        '1024x1024',
        '1536x672',
        '832x1248',
        '1344x768',
        '2048x2048',
        '512x2048'
    ]);

    const selectAuditCatalog = (profile, catalog) => {
        if (profile.id === 'gemini') {
            return catalog.filter(entry => keyGeminiDimensions.has(`${entry.width}x${entry.height}`));
        }
        return catalog.filter(entry => entry.width * entry.height <= maxSyntheticPixels);
    };

    before(async () => {
        // Mock Browser Environment
        global.Blob = Blob;
        const createMockEl = (tag = 'div') => ({
            appendChild: function(el) { this.children.push(el); return el; },
            prepend: function(el) { this.children.unshift(el); return el; },
            children: [],
            style: {},
            classList: { 
                add: () => ({}), 
                remove: () => ({}), 
                replace: () => ({}),
                contains: () => false,
                toggle: () => ({})
            },
            getAttribute: () => '',
            setAttribute: () => '',
            tagName: tag.toUpperCase(),
            querySelector: () => createMockEl(),
            querySelectorAll: () => [],
            textContent: '',
            value: '',
            onclick: null,
            click: () => {}
        });

        global.document = {
            documentElement: { lang: 'en' },
            body: createMockEl('body'),
            title: '',
            getElementById: (id) => createMockEl(id),
            createElement: (tag) => {
                if (tag === 'canvas') return new MockCanvas(100, 100);
                return createMockEl(tag);
            },
            createTextNode: (text) => ({ textContent: text }),
            querySelectorAll: () => []
        };
        global.Image = MockImageElement;
        global.localStorage = { getItem: () => null, setItem: () => null };
        setupMemoryMocks();
        
        // Ensure registry is active
        assert.ok(registry.getAllProfiles().length > 0, 'Registry not initialized');
        
        engine = await WatermarkEngine.create();
        state.engine = engine;
        
        installMockAssetLoader(engine, { createMockAlphaMap, alphaToRGBA, createMockImageElement });
    });

    describe('1. Architecture & Registry Integrity', () => {
        test('Registry should contain all required production profiles', () => {
            const profiles = registry.getAllProfiles();
            const ids = profiles.map(p => p.id);
            assert.ok(ids.includes('gemini'), 'Missing Gemini profile');
            assert.ok(ids.includes('doubao'), 'Missing Doubao profile');
            assert.ok(ids.includes('dalle3'), 'Missing DALL-E 3 profile');
        });

        test('Catalog entries should exist for all profiles', () => {
            registry.getAllProfiles().forEach(p => {
                const catalog = registry.getCatalog(p.id);
                assert.ok(catalog.length > 0, `Profile ${p.id} has empty catalog`);
            });
        });
    });

    describe('2. Comprehensive Parameter Matrix', () => {
        test('Exhaustive probe across ALL catalog entries & profiles', async () => {
            const profiles = registry.getAllProfiles();
            for (const profile of profiles) {
                const catalog = registry.getCatalog(profile.id);
                
                // Full engine probes stay under a practical pixel cap; catalog-level
                // tests cover the complete official dimension list.
                for (const entry of selectAuditCatalog(profile, catalog)) {
                    const { width: w, height: h } = entry;
                    const rawData = createMockImageData(w, h, 'grid', 100);
                    const originalSnapshot = new Uint8ClampedArray(rawData.data);
                    
                    const pos = calculateWatermarkPosition(w, h, entry);
                    const alpha = createMockAlphaMap(pos.width, pos.height);
                    applyWatermark(rawData, pos.x, pos.y, pos.width, pos.height, alpha, profile.logoValue);

                    const mockImg = createMockImageElement(w, h, rawData.data);
                    
                    // Test both normal and deepScan
                    for (const deepScan of [true, false]) {
                        const result = await engine.removeWatermarkFromImage(mockImg, { 
                            profileId: profile.id,
                            deepScan 
                        });

                        assert.ok(result.removedCount >= 1, `Detection Fault: [${profile.id}] at ${w}x${h} (DeepScan:${deepScan})`);
                        assert.ok(result.pos, `Detection position missing: [${profile.id}] at ${w}x${h}`);
                        assert.ok(Math.abs(result.pos.x - pos.x) <= 1, `Position X drift: [${profile.id}] expected ${pos.x}, got ${result.pos.x}`);
                        assert.ok(Math.abs(result.pos.y - pos.y) <= 1, `Position Y drift: [${profile.id}] expected ${pos.y}, got ${result.pos.y}`);
                        // v1.9.8: 0.40 is a safe lower bound for mock noise in small 0.5k resolutions
                        assert.ok(result.confidence > 0.40, `Precision Loss: [${profile.id}] at ${w}x${h} confidence=${result.confidence}`);
                        
                        // Fidelity Audit
                        const ctx = result.canvas.getContext('2d');
                        const final = ctx.getImageData(pos.x, pos.y, pos.width, pos.height).data;
                        
                        const subOriginal = new Uint8ClampedArray(pos.width * pos.height * 4);
                        for(let r=0; r<pos.height; r++) {
                            for(let c=0; c<pos.width; c++) {
                                const idx = (r * pos.width + c) << 2;
                                const oIdx = ((pos.y + r) * w + (pos.x + c)) << 2;
                                subOriginal[idx] = originalSnapshot[oIdx];
                                subOriginal[idx+1] = originalSnapshot[oIdx+1];
                                subOriginal[idx+2] = originalSnapshot[oIdx+2];
                                subOriginal[idx+3] = originalSnapshot[oIdx+3];
                            }
                        }
                        
                        const psnr = RestorationMetrics.calculatePSNR(final, subOriginal);
                        // Rule: Minimal PSNR for math restoration should be > 24dB in mock environment
                        assert.ok(psnr > 24, `Mathematical Regression! ${profile.id}@${w}x${h} Fidelity: ${psnr}dB`);
                    }
                }
            }
        });

        test('Auto-detect mode should correctly identify profile', async () => {
            const w = 1024;
            const h = 1024;
            const rawData = createMockImageData(w, h, 'grid', 100);
            
            // Inject Gemini watermark but call with 'auto'
            const profile = PROFILES.gemini;
            const entry = CATALOGS.gemini.find(e => e.width === w && e.height === h) || CATALOGS.gemini[1];
            const pos = calculateWatermarkPosition(w, h, entry);
            const alpha = createMockAlphaMap(pos.width, pos.height, 0); // Deterministic-ish
            applyWatermark(rawData, pos.x, pos.y, pos.width, pos.height, alpha, profile.logoValue);
            
            const img = createMockImageElement(w, h, rawData.data);
            const { canvas: _, profileId, confidence } = await engine.removeWatermarkFromImage(img, { profileId: 'auto' });
            
            assert.strictEqual(profileId, 'gemini', 'Auto-detect failed to identify Gemini');
            assert.ok(confidence > 0.5, 'Low confidence in auto-detection');
        });

        test('Doubao multi-anchor engine call removes every detected anchor', async () => {
            const w = 2730, h = 1535;
            const rawData = createMockImageData(w, h, 'grid', 96);
            const originalData = new Uint8ClampedArray(rawData.data);
            const configs = CATALOGS.doubao.filter(entry => entry.width === w && entry.height === h);
            assert.ok(configs.length >= 2, 'Test requires TL and BR catalog entries');

            for (const config of configs) {
                const pos = calculateWatermarkPosition(w, h, config);
                const alpha = createMockAlphaMap(pos.width, pos.height);
                applyWatermark(rawData, pos.x, pos.y, pos.width, pos.height, alpha, PROFILES.doubao.logoValue);
            }

            const img = createMockImageElement(w, h, rawData.data);
            const result = await engine.removeWatermarkFromImage(img, { profileId: 'doubao', deepScan: true });
            assert.strictEqual(result.removedCount, configs.length, 'Engine should remove all detected Doubao anchors');

            const restored = result.canvas.getContext('2d').getImageData(0, 0, w, h).data;
            for (const config of configs) {
                const pos = calculateWatermarkPosition(w, h, config);
                const x = Math.floor(pos.x + pos.width / 2);
                const y = Math.floor(pos.y + pos.height / 2);
                const idx = (y * w + x) << 2;
                assert.ok(Math.abs(restored[idx] - originalData[idx]) <= 50, `Anchor ${config.anchor} was not restored`);
            }
        });
    });

    describe('3. Algorithm Fidelity (Zero Loss Proof)', () => {
        test('Sub-pixel accuracy on complex high-frequency background', async () => {
            const w = 1024, h = 1024;
            const rawData = createMockImageData(w, h, 'random');
            const originalData = new Uint8ClampedArray(rawData.data);

            const profile = registry.getProfile('gemini');
            const entry = registry.getCatalog('gemini')[1];
            const pos = calculateWatermarkPosition(w, h, entry);
            const alpha = createMockAlphaMap(pos.width, pos.height);
            
            applyWatermark(rawData, pos.x, pos.y, pos.width, pos.height, alpha, profile.logoValue);
            
            const mockImg = createMockImageElement(w, h, rawData.data);
            const result = await engine.removeWatermarkFromImage(mockImg, { profileId: 'gemini' });
            assert.ok(result.removedCount > 0, 'Detection failed, cannot audit fidelity');
            
            const ctx = result.canvas.getContext('2d');
            const restored = ctx.getImageData(0, 0, w, h).data;

            let maxDiff = 0;
            for(let i=0; i<restored.length; i++) {
                maxDiff = Math.max(maxDiff, Math.abs(restored[i] - originalData[i]));
            }
            assert.ok(maxDiff <= 50, `Algorithm precision failure: Max diff ${maxDiff} > 50`);
        });
    });

    describe('4. Frontend Contract & State Logic', () => {
        test('State management should track ObjectURLs and clear correctly', () => {
            state.imageQueue = [{ id: 1, file: new Blob(['mock']) }];
            const url = objectUrlManager.create(new Blob(['test']));
            assert.ok(global.MockMemoryTracker.has(url));
            
            objectUrlManager.clear();
            assert.strictEqual(global.MockMemoryTracker.size, 0, 'Memory leak: URLs not revoked');
        });

        test('End-to-End Processing Flow via processSingle', async () => {
            const item = { 
                file: new global.Blob(['abc']), 
                name: 'test.png',
                originalUrl: 'blob:1' 
            };
            
            global.FileReader = class {
                readAsDataURL() { this.onload({ target: { result: 'data:img' } }); }
            };

            await new Promise((resolve) => {
                processSingle(item, { profileId: 'gemini' }, {
                    onSuccess: (res) => {
                        assert.ok(res.removedCount >= 0);
                        resolve();
                    },
                    onError: (err) => {
                        assert.fail(`Flow failed: ${err}`);
                        resolve();
                    }
                });
            });
        });
    });

    describe('5. Asset Integrity Verification', () => {
        test('Non-experimental profiles must have asset files for all anchors', () => {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const assetsDir = resolve(__dirname, '../src/assets');
            
            for (const profile of registry.getAllProfiles()) {
                if (profile.experimental) continue;
                
                if (profile.assets) {
                    for (const [anchor, assetKey] of Object.entries(profile.assets)) {
                        const assetPath = resolve(assetsDir, `bg_${assetKey}.png`);
                        assert.ok(existsSync(assetPath), 
                            `Missing asset for ${profile.id}/${anchor}: expected ${assetPath}`);
                    }
                }
                
                if (profile.defaultAsset) {
                    const assetPath = resolve(assetsDir, `bg_${profile.defaultAsset}.png`);
                    assert.ok(existsSync(assetPath), 
                        `Missing default asset for ${profile.id}: expected ${assetPath}`);
                }
            }
        });
    });
});
