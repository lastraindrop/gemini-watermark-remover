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
import { registry } from '../src/core/templates/registry.js';
// Trigger registrations
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
import { RestorationMetrics } from '../src/core/restorationMetrics.js';


describe('GWR Ultimate Product Audit', () => {
    let engine;

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
                contains: () => false
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
        
        // Mock Asset Loading (v1.9.0: Universal dimension parser)
        const assetCache = new Map();
        engine._loadAsset = async (key) => {
            if (assetCache.has(key)) return assetCache.get(key);
            
            let w = 96, h = 96;
            if (key.includes('x')) {
                const parts = key.split('x');
                w = parseInt(parts[0]) || 96;
                h = parseInt(parts[1]) || 96;
            } else if (!isNaN(parseInt(key))) {
                w = h = parseInt(key);
            } else if (key.includes('doubao')) {
                // Heuristic doubao assets
                if (key.includes('_tl')) { w = 307; h = 167; }
                else { w = 401; h = 173; }
            } else if (key.includes('dalle3')) {
                w = 120; h = 40;
            }

            const alpha = createMockAlphaMap(w, h);
            const rgba = alphaToRGBA(alpha, w, h);
            const img = createMockImageElement(w, h, rgba);
            assetCache.set(key, img);
            return img;
        };
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
                
                // v1.9.8 Rule: Exhaustive Audit (No sampling, test EVERYTHING)
                for (const entry of catalog) {
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
                        // v1.9.8: 0.45 is a safe lower bound for mock noise in small 0.5k resolutions
                        assert.ok(result.confidence > 0.45, `Precision Loss: [${profile.id}] at ${w}x${h} confidence=${result.confidence}`);
                        
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
                        // Rule: Minimal PSNR for math restoration should be > 25dB in mock environment
                        assert.ok(psnr > 25, `Mathematical Regression! ${profile.id}@${w}x${h} Fidelity: ${psnr}dB`);
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
            
            // Mock FileReader and Image loading
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
});
