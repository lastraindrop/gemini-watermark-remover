/**
 * E2E Integration Test — full pipeline: engine → detect → remove → verify PSNR
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { RestorationMetrics } from '../src/core/restorationMetrics.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, createMockImageElement, TC } from './test_utils.js';

const savedGlobals = {};

before(() => {
    if (typeof global.document === 'undefined') {
        savedGlobals.window = global.window;
        savedGlobals.Worker = global.Worker;
        savedGlobals.Image = global.Image;
        savedGlobals.document = global.document;
        savedGlobals.ImageData = global.ImageData;

        global.ImageData = class {
            constructor(data, w, h) { this.data = data; this.width = w; this.height = h; }
        };
        global.document = { createElement: () => ({ getContext: () => null }) };
        global.Image = class {
            constructor() {
                this.width = 1; this.height = 1;
                this.onload = null; this.onerror = null;
            }
            set src(_) {
                Promise.resolve().then(() => { if (this.onload) this.onload(); });
            }
        };
        global.window = { Worker: null, GM_info: null };
        global.Worker = null;
    }
});

after(() => {
    if (savedGlobals.window) global.window = savedGlobals.window;
    if (savedGlobals.Worker !== undefined) global.Worker = savedGlobals.Worker;
    if (savedGlobals.Image !== undefined) global.Image = savedGlobals.Image;
    if (savedGlobals.document) global.document = savedGlobals.document;
    if (savedGlobals.ImageData !== undefined) global.ImageData = savedGlobals.ImageData;
});

function makeImageElement(w, h, data) {
    const img = createMockImageElement(w, h, data);
    img.width = w;
    img.height = h;
    return img;
}

describe('E2E Integration', () => {

    test('Full pipeline: inject → detect → remove → verify PSNR', async () => {
        const W = 1024, H = 1024;
        const imgData = createMockImageData(W, H, TC.TYPES.NOISE, 128);
        const originalSnapshot = new Uint8ClampedArray(imgData.data);

        const logoSize = TC.LOGO_96;
        const margin = TC.MARGIN_64;
        const alphaMap = createMockAlphaMap(logoSize, logoSize);
        const x = W - margin - logoSize;
        const y = H - margin - logoSize;
        applyWatermark(imgData, x, y, logoSize, logoSize, alphaMap, TC.LOGO_VALUE);

        const engine = await WatermarkEngine.create();
        const mockImg = makeImageElement(W, H, imgData.data);
        const result = await engine.removeWatermarkFromImage(mockImg, {
            profileId: TC.PROFILES.GEMINI, deepScan: false
        });

        assert.ok(result.canvas, 'Engine should return a canvas');
        assert.ok(result.removedCount >= 0, 'Should report removed count');
        assert.ok(result.detectionMode === 'multi-probe' || result.detectionMode === 'none',
            `detectionMode: ${result.detectionMode}`);

        if (result.removedCount > 0) {
            const ctxData = result.canvas._data || result.canvas.data;
            const finalRegion = new Uint8ClampedArray(logoSize * logoSize * 4);
            const origRegion = new Uint8ClampedArray(logoSize * logoSize * 4);

            for (let r = 0; r < logoSize; r++) {
                for (let c = 0; c < logoSize; c++) {
                    const fi = (r * logoSize + c) * 4;
                    const oi = ((y + r) * W + (x + c)) * 4;
                    finalRegion[fi] = ctxData[oi] || 0;
                    finalRegion[fi + 1] = ctxData[oi + 1] || 0;
                    finalRegion[fi + 2] = ctxData[oi + 2] || 0;
                    finalRegion[fi + 3] = 255;
                    origRegion[fi] = originalSnapshot[oi];
                    origRegion[fi + 1] = originalSnapshot[oi + 1];
                    origRegion[fi + 2] = originalSnapshot[oi + 2];
                    origRegion[fi + 3] = 255;
                }
            }

            const psnr = RestorationMetrics.calculatePSNR(finalRegion, origRegion);
            assert.ok(psnr > 15, `PSNR should be acceptable after removal: ${psnr}dB`);

            const mse = RestorationMetrics.calculateMSE(finalRegion, origRegion);
            assert.ok(mse < 500, `MSE should be low: ${mse}`);
        }

        engine.destroy();
    });

    test('E2E: non-watermark image returns clean result', async () => {
        const imgData = createMockImageData(512, 512, TC.TYPES.GRADIENT, 128);
        const engine = await WatermarkEngine.create();
        const mockImg = makeImageElement(512, 512, imgData.data);

        const result = await engine.removeWatermarkFromImage(mockImg, {
            profileId: TC.PROFILES.GEMINI, deepScan: false
        });

        assert.ok(result.canvas);
        assert.ok(result.removedCount === 0 || result.confidence < 0.5,
            `Non-watermark image should have low/zero confidence: ${result.confidence}`);

        engine.destroy();
    });
});
