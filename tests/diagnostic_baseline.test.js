/**
 * Diagnostic Baseline Tests (Phase 0.1)
 *
 * This test suite establishes a baseline for detection accuracy BEFORE
 * any fixes are applied. It covers the key scenarios reported as misses.
 *
 * After each Phase fix, re-run this suite to quantify improvement.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCorrelation, calculateProbeConfidence, detectWatermark } from '../src/core/detector.js';
import { detectWatermarks, detectProfileWatermarks } from '../src/core/detectionPipeline.js';
import { calculateWatermarkPosition, getAllPotentialConfigs } from '../src/core/config.js';
import { GEMINI_PROFILE, PROFILES } from '../src/core/profiles.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, alphaToRGBA, resolvePos } from './test_utils.js';
import { WATERMARK_CONFIGS } from '../src/core/catalog.js';

function geminiWatermarkPos(imageWidth, imageHeight, size = 96) {
    const tierConfig = Object.values(WATERMARK_CONFIGS).find(t => t.logoSize === size)
        || (size === 48 ? { logoSize: 48, marginRight: 32, marginBottom: 32 }
                        : { logoSize: 96, marginRight: 64, marginBottom: 64 });
    return calculateWatermarkPosition(imageWidth, imageHeight, {
        ...tierConfig,
        logoSize: size
    });
}

// ============================================================
// Utility: Build mock alpha map provider for detection pipeline
// ============================================================
function buildAlphaMapProvider(size) {
    const alphaMap = createMockAlphaMap(size);
    return async (assetKey, w, h) => ({
        data: assetKey === String(size) ? alphaMap : createMockAlphaMap(w || size, h || size),
        width: w || size,
        height: h || size,
        assetKey: assetKey || String(size)
    });
}

// ============================================================
// Scenario 1: Standard Gemini 1:1 1K output (exact catalog match)
// ============================================================
describe('DIAG: Standard Gemini 1024x1024 Output', () => {

    test('S1.1: Uniform light background with 96px watermark at anchor', async () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'solid', 220);
        const pos = geminiWatermarkPos(w, h, 96);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S1.1] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} matches=${result.matches.length} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on uniform light background');
        assert.ok(result.confidence > 0.15, `Confidence ${result.confidence} should be > 0.15`);
        if (result.winner) {
            assert.ok(Math.abs(result.winner.pos.x - pos.x) <= 6, `X pos within 6px. Got ${result.winner.pos.x}, expected ${pos.x}`);
        }
    });

    test('S1.2: Uniform white background (worst case for gradient penalty)', async () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'solid', 250);
        const pos = geminiWatermarkPos(w, h, 96);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S1.2] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        // KEY: should NOT be suppressed by gradient penalty on uniform background
        assert.ok(result.winner, 'Should detect watermark on uniform white background');
    });

    test('S1.3: Dark background with watermark', async () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'solid', 30);
        const pos = geminiWatermarkPos(w, h, 96);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S1.3] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on dark background');
    });

    test('S1.4: Textured background (gradient)', async () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'gradient', 140);
        const pos = geminiWatermarkPos(w, h, 96);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S1.4] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on gradient background');
    });

    test('S1.5: Noise/textured background (grid pattern)', async () => {
        const w = 1024, h = 1024;
        const img = createMockImageData(w, h, 'grid', 128);
        const pos = geminiWatermarkPos(w, h, 96);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S1.5] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on grid/noise background');
    });
});

// ============================================================
// Scenario 2: Scaled/resized images (common user scenario)
// ============================================================
describe('DIAG: Scaled/Resized Images', () => {

    test('S2.1: 95% scaled (972x972 from 1024x1024)', async () => {
        const w = 972, h = 972;
        const img = createMockImageData(w, h, 'solid', 180);
        const pos = geminiWatermarkPos(w, h, 91); // ~95% of 96
        const alphaMap = createMockAlphaMap(91);
        applyWatermark(img, pos.x, pos.y, 91, 91, alphaMap, 255);

        const customProvider = async (key, rw, rh) => {
            const sz = rw || 91;
            return { data: createMockAlphaMap(sz), width: sz, height: sz, assetKey: key || '96' };
        };

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: customProvider,
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S2.1] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on 95% scaled image');
    });

    test('S2.2: 105% scaled (1075x1075 from 1024x1024)', async () => {
        const w = 1075, h = 1075;
        const img = createMockImageData(w, h, 'solid', 180);
        const size = Math.round(96 * 1.05);
        const pos = geminiWatermarkPos(w, h, size);
        const alphaMap = createMockAlphaMap(size);
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const customProvider = async (key, rw, rh) => {
            const sz = rw || size;
            return { data: createMockAlphaMap(sz), width: sz, height: sz, assetKey: key || '96' };
        };

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: customProvider,
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S2.2] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on 105% scaled image');
    });

    test('S2.3: 1080x1080 (common screenshot/crop size)', async () => {
        const w = 1080, h = 1080;
        const img = createMockImageData(w, h, 'solid', 180);
        const size = 96; // still 96px watermark
        const pos = geminiWatermarkPos(w, h, 96);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S2.3] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on 1080x1080 image');
    });
});

// ============================================================
// Scenario 3: 48px watermark sizes (small Gemini outputs)
// ============================================================
describe('DIAG: 48px Watermark Size', () => {

    test('S3.1: 512x512 with 48px watermark', async () => {
        const w = 512, h = 512;
        const img = createMockImageData(w, h, 'solid', 180);
        const pos = geminiWatermarkPos(w, h, 48);
        const alphaMap = createMockAlphaMap(48);
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(48),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S3.1] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect 48px watermark on 512x512');
    });

    test('S3.2: 16:9 1K (1376x768) with 96px watermark', async () => {
        const w = 1376, h = 768;
        const img = createMockImageData(w, h, 'solid', 180);
        const pos = geminiWatermarkPos(w, h, 96);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.15, fallbackThreshold: 0.18, deepScan: true }
        });

        console.log(`[S3.2] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner} source=${result.winner?.source || 'none'}`);
        assert.ok(result.winner, 'Should detect watermark on 16:9 aspect');
    });
});

// ============================================================
// Scenario 4: Negative tests (no watermark present)
// ============================================================
describe('DIAG: Negative - No Watermark Present', () => {

    test('S4.1: No watermark on 1024x1024 solid background', async () => {
        const img = createMockImageData(1024, 1024, 'solid', 128);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.20, fallbackThreshold: 0.30, deepScan: true }
        });

        console.log(`[S4.1] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner}`);
        // Should NOT detect a watermark where none exists
        if (result.winner) {
            // If detected, confidence must be low enough that we know it's a false positive
            assert.ok(result.confidence < 0.40, `False positive confidence ${result.confidence} should be < 0.40`);
        }
    });

    test('S4.2: No watermark on complex background', async () => {
        const img = createMockImageData(1024, 1024, 'random', 128);

        const result = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: buildAlphaMapProvider(96),
            options: { probeThreshold: 0.20, fallbackThreshold: 0.30, deepScan: true }
        });

        console.log(`[S4.2] conf=${result.confidence?.toFixed(4)} winner=${!!result.winner}`);
        if (result.winner) {
            assert.ok(result.confidence < 0.40, `False positive confidence ${result.confidence} should be < 0.40`);
        }
    });
});

// ============================================================
// Scenario 5: Gradient penalty effect measurement
// ============================================================
describe('DIAG: Gradient Penalty Impact', () => {

    test('S5.1: Measure gradient penalty effect on low-gradient image', () => {
        // Low-gradient background (smooth gradient) - gradients naturally low
        const img = createMockImageData(512, 512, 'gradient', 200);
        const size = 96;
        const alphaMap = createMockAlphaMap(size);
        const pos = geminiWatermarkPos(512, 512, 96);
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        // Measure NCC WITHOUT deepScan (no gradient penalty applied)
        const nccOnly = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: false });
        // Measure NCC WITH deepScan (gradient penalty applied)
        const nccWithGrad = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

        console.log(`[S5.1] NCC-only: ${nccOnly.confidence.toFixed(4)}, With gradient: ${nccWithGrad.confidence.toFixed(4)}`);
        console.log(`[S5.1] Penalty ratio: ${(nccWithGrad.confidence / Math.max(nccOnly.confidence, 0.001)).toFixed(4)}`);

        // With deepScan should not be drastically lower than without
        if (nccOnly.confidence > 0.15) {
            const ratio = nccWithGrad.confidence / nccOnly.confidence;
            // Current code may produce ratio as low as 0.30 due to gradientPenalty
            // This documents the CURRENT behavior before fixes
            console.log(`[S5.1] Current penalty ratio: ${ratio.toFixed(4)} (target: >= 0.30)`);
        }
    });

    test('S5.2: Measure gradient penalty effect on uniform background', () => {
        const img = createMockImageData(512, 512, 'solid', 200);
        const size = 96;
        const alphaMap = createMockAlphaMap(size);
        const pos = geminiWatermarkPos(512, 512, 96);
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const nccOnly = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: false });
        const nccWithGrad = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

        console.log(`[S5.2] NCC-only: ${nccOnly.confidence.toFixed(4)}, With gradient: ${nccWithGrad.confidence.toFixed(4)}`);
        console.log(`[S5.2] Penalty ratio: ${(nccWithGrad.confidence / Math.max(nccOnly.confidence, 0.001)).toFixed(4)}`);

        if (nccOnly.confidence > 0.15) {
            const ratio = nccWithGrad.confidence / nccOnly.confidence;
            console.log(`[S5.2] Current penalty ratio on uniform bg: ${ratio.toFixed(4)}`);
        }
    });
});

// ============================================================
// Scenario 6: detectWatermark global search coverage
// ============================================================
describe('DIAG: Global Detection Coverage', () => {

    test('S6.1: detectWatermark finds watermark at standard position', () => {
        const w = 1024, h = 1024;
        const size = 96;
        const img = createMockImageData(w, h, 'solid', 180);
        const alphaMap = createMockAlphaMap(size);
        const pos = geminiWatermarkPos(w, h, size);
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const alphaMaps = { '96': { data: alphaMap, width: size, height: size } };
        const result = detectWatermark(img, alphaMaps, { deepScan: true, noiseReduction: false });

        console.log(`[S6.1] result=${JSON.stringify(result)}`);
        if (result) {
            console.log(`[S6.1] conf=${result.confidence.toFixed(4)} mode=${result.mode} pos=(${result.x},${result.y})`);
            assert.ok(result.confidence > 0.15, `Global detection confidence ${result.confidence} too low`);
            assert.ok(Math.abs(result.x - pos.x) <= 4, `X position off: got ${result.x}, expected ${pos.x}`);
            assert.ok(Math.abs(result.y - pos.y) <= 4, `Y position off: got ${result.y}, expected ${pos.y}`);
        } else {
            console.log('[S6.1] detectWatermark returned null - GLOBAL SEARCH FAILED');
            // We don't assert.fail here because we're recording baseline
        }
    });

    test('S6.2: detectWatermark on 512x512 with 48px watermark', () => {
        const w = 512, h = 512;
        const size = 48;
        const img = createMockImageData(w, h, 'solid', 180);
        const alphaMap = createMockAlphaMap(size);
        const pos = geminiWatermarkPos(w, h, size);
        applyWatermark(img, pos.x, pos.y, size, size, alphaMap, 255);

        const alphaMaps = { '48': { data: alphaMap, width: size, height: size } };
        const result = detectWatermark(img, alphaMaps, { deepScan: true, noiseReduction: false });

        console.log(`[S6.2] result=${JSON.stringify(result)}`);
        if (result) {
            console.log(`[S6.2] conf=${result.confidence.toFixed(4)} mode=${result.mode} pos=(${result.x},${result.y})`);
            assert.ok(result.confidence > 0.15, `Global detection confidence ${result.confidence} too low`);
        } else {
            console.log('[S6.2] detectWatermark returned null');
        }
    });
});

// ============================================================
// Scenario 7: calculateCorrelation sanity checks
// ============================================================
describe('DIAG: calculateCorrelation Sanity', () => {

    test('S7.1: Perfect match returns high correlation', () => {
        const size = 96;
        const alphaMap = createMockAlphaMap(size);
        const img = createMockImageData(size * 4, size * 4, 'solid', 128);
        applyWatermark(img, 10, 10, size, size, alphaMap, 255);

        const conf = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        console.log(`[S7.1] Correlation at injection point: ${conf.toFixed(4)}`);
        assert.ok(conf > 0.85, `Perfect match correlation ${conf} should be > 0.85`);
    });

    test('S7.2: Offset by half window returns lower correlation', () => {
        const size = 48;
        const alphaMap = createMockAlphaMap(size);
        const img = createMockImageData(200, 200, 'solid', 128);
        applyWatermark(img, 40, 40, size, size, alphaMap, 255);

        const atWatermark = calculateCorrelation(img, 40, 40, size, size, alphaMap, true);
        const offset = calculateCorrelation(img, 100, 100, size, size, alphaMap, true);
        console.log(`[S7.2] At watermark: ${atWatermark.toFixed(4)}, Offset: ${offset.toFixed(4)}`);
        assert.ok(atWatermark > offset, 'Correlation at watermark should exceed offset');
    });
});
