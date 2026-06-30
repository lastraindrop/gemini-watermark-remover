/**
 * product_audit stress layer — exhaustive catalog×profiles matrix.
 *
 * This file was split from product_audit.test.js (Phase 5) because the
 * O(catalogs × profiles × deepScan × engine) loop takes 120s+ and
 * belongs in the stress group, not standard integration/audit.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { registry } from '../src/core/templates/registry.js';
import { calculateWatermarkPosition } from '../src/core/config.js';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
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

describe('GWR Stress Audit — exhaustive catalog matrix', () => {
    let engine;
    const maxSyntheticPixels = 2048 * 2048;
    const keyGeminiDimensions = new Set([
        '512x512', '1024x1024', '1536x672', '832x1248', '1344x768', '2048x2048', '512x2048'
    ]);

    function selectAuditCatalog(profile, catalog) {
        if (profile.id === 'gemini') return catalog.filter(e => keyGeminiDimensions.has(`${e.width}x${e.height}`));
        return catalog.filter(e => e.width * e.height <= maxSyntheticPixels);
    }

    before(async () => {
        global.Blob = Blob;
        const mockEl = () => ({
            appendChild(e) { this.children.push(e); return e; }, prepend(e) { this.children.unshift(e); return e; },
            children: [], style: {}, classList: { add() {}, remove() {}, replace() {}, contains() { return false; }, toggle() {} },
            getAttribute: () => '', setAttribute: () => {}, tagName: 'div'.toUpperCase(),
            querySelector: () => mockEl(), querySelectorAll: () => [], textContent: '', value: '',
            onclick: null, click: () => {}
        });
        global.document = { documentElement: { lang: 'en' }, body: mockEl(), title: '',
            getElementById: () => mockEl(), createElement: (t) => t === 'canvas' ? new MockCanvas(100, 100) : mockEl(),
            createTextNode: (t) => ({ textContent: t }), querySelectorAll: () => [] };
        global.Image = MockImageElement;
        global.localStorage = { getItem: () => null, setItem: () => null };
        setupMemoryMocks();
        engine = await WatermarkEngine.create();
        installMockAssetLoader(engine, { createMockAlphaMap, alphaToRGBA, createMockImageElement });
    });

    test('Exhaustive probe across ALL catalog entries & profiles', async () => {
        const profiles = registry.getAllProfiles();
        for (const profile of profiles) {
            const catalog = registry.getCatalog(profile.id);
            for (const entry of selectAuditCatalog(profile, catalog)) {
                const { width: w, height: h } = entry;
                const rawData = createMockImageData(w, h, 'grid', 100);
                const originalSnapshot = new Uint8ClampedArray(rawData.data);

                const pos = calculateWatermarkPosition(w, h, entry);
                const alpha = createMockAlphaMap(pos.width, pos.height);
                applyWatermark(rawData, pos.x, pos.y, pos.width, pos.height, alpha, profile.logoValue);

                const mockImg = createMockImageElement(w, h, rawData.data);
                for (const deepScan of [true, false]) {
                    const result = await engine.removeWatermarkFromImage(mockImg, { profileId: profile.id, deepScan });

                    assert.ok(result.removedCount >= 1, `Detection Fault: [${profile.id}] at ${w}x${h} (DeepScan:${deepScan})`);
                    assert.ok(result.pos, `Position missing: [${profile.id}] at ${w}x${h}`);
                    assert.ok(Math.abs(result.pos.x - pos.x) <= 1, `X drift: [${profile.id}] expected ${pos.x}, got ${result.pos.x}`);
                    assert.ok(Math.abs(result.pos.y - pos.y) <= 1, `Y drift: [${profile.id}] expected ${pos.y}, got ${result.pos.y}`);
                    assert.ok(result.confidence > 0.40, `Precision Loss: [${profile.id}] at ${w}x${h} confidence=${result.confidence}`);

                    const ctx = result.canvas.getContext('2d');
                    const final = ctx.getImageData(pos.x, pos.y, pos.width, pos.height).data;
                    const subOriginal = new Uint8ClampedArray(pos.width * pos.height * 4);
                    for (let r = 0; r < pos.height; r++) {
                        for (let c = 0; c < pos.width; c++) {
                            const idx = (r * pos.width + c) << 2;
                            const oIdx = ((pos.y + r) * w + (pos.x + c)) << 2;
                            subOriginal[idx] = originalSnapshot[oIdx];
                            subOriginal[idx + 1] = originalSnapshot[oIdx + 1];
                            subOriginal[idx + 2] = originalSnapshot[oIdx + 2];
                            subOriginal[idx + 3] = originalSnapshot[oIdx + 3];
                        }
                    }
                    const psnr = RestorationMetrics.calculatePSNR(final, subOriginal);
                    assert.ok(psnr > 24, `Math Regression! ${profile.id}@${w}x${h} Fidelity: ${psnr}dB`);
                }
            }
        }
    });
});
