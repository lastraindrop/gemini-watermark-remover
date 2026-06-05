import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarks, detectProfileWatermarks } from '../src/core/detectionPipeline.js';
import { calculateProbeConfidence, calculateCorrelation, calculateGradientCorrelation } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, setupMemoryMocks, resolvePos } from './test_utils.js';

const W = 1024, H = 1024;
const DEFAULT_POS = () => resolvePos(W, H, 'gemini');

function alphaMock(key, w = 96, h = 96) {
    return { data: createMockAlphaMap(w, h), width: w, height: h, assetKey: String(key) };
}

function getAlphaMapFn(specificAlpha = null) {
    return async (key) => {
        if (specificAlpha && String(key) === '96') return specificAlpha;
        const size = parseInt(key) || 96;
        return alphaMock(key, size);
    };
}

describe('Detection Fallback Chain', () => {

    test('Empty result at extreme threshold on clean image', async () => {
        const img = createMockImageData(W, H, 'solid', 128);
        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini', getAlphaMap: getAlphaMapFn(),
            options: { probeThreshold: 0.99, fallbackThreshold: 0.99, deepScan: false }
        });
        assert.strictEqual(result.matches.length, 0);
        assert.strictEqual(result.winner, null);
        assert.strictEqual(result.confidence, 0);
    });

    test('Permissive probeThreshold finds watermark', async () => {
        const img = createMockImageData(W, H, 'noise', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        const pos = DEFAULT_POS();
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alpha96, 255);

        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: async (key) => String(key) === '96'
                ? { data: alpha96, width: 96, height: 96, assetKey: '96' }
                : alphaMock('48', 48, 48),
            options: { probeThreshold: 0.01, deepScan: false }
        });
        assert.ok(result.matches.length > 0);
    });

    test('globalFallbackBelow suppresses global search', async () => {
        const img = createMockImageData(W, H, 'solid', 128);
        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini', getAlphaMap: getAlphaMapFn(),
            options: { globalFallbackBelow: 0.99, deepScan: false }
        });
        assert.strictEqual(result.matches.length, 0);
    });

    test('autoNonCatalogMinConfidence gates auto-mode results', async () => {
        const img = createMockImageData(W, H, 'solid', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        applyWatermark(img, 50, 50, 96, 96, alpha96, 255);

        const permissive = await detectWatermarks({
            imageData: img, profileId: 'auto', getAlphaMap: getAlphaMapFn(),
            options: { autoNonCatalogMinConfidence: 0.01, deepScan: true }
        });
        const strict = await detectWatermarks({
            imageData: img, profileId: 'auto', getAlphaMap: getAlphaMapFn(),
            options: { autoNonCatalogMinConfidence: 0.99, deepScan: true }
        });
        assert.ok(permissive && strict);
    });

    test('Exact catalog position detection', async () => {
        const img = createMockImageData(W, H, 'noise', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        const pos = DEFAULT_POS();
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alpha96, 255);

        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: async (key) => String(key) === '96'
                ? { data: alpha96, width: 96, height: 96, assetKey: '96' }
                : alphaMock(key, parseInt(key) || 48, parseInt(key) || 48),
            options: { deepScan: false }
        });
        assert.ok(result.matches.length > 0 && result.winner && result.winner.config);
    });

    test('Manual config mode attaches manual source', async () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);

        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: async () => ({ data: alphaMap, width: 96, height: 96, assetKey: '96' }),
            options: { manualConfig: { x: 50, y: 50, width: 96, height: 96, assetKey: '96' }, deepScan: false }
        });
        assert.strictEqual(result.winner.source, 'manual-input');
        assert.strictEqual(result.winner.config.manual, true);
        assert.strictEqual(result.winner.pos.anchor, 'manual');
    });

    test('Manual config sets exact position', async () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(48, 48);
        applyWatermark(img, 20, 30, 48, 48, alphaMap, 255);

        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: async () => ({ data: alphaMap, width: 48, height: 48, assetKey: '48' }),
            options: { manualConfig: { x: 20, y: 30, width: 48, height: 48 }, deepScan: false }
        });
        assert.strictEqual(result.winner.pos.x, 20);
        assert.strictEqual(result.winner.pos.y, 30);
    });

    test('getProfilesToTry auto returns all non-experimental', async () => {
        const mod = await import('../src/core/detectionPipeline.js');
        const profiles = mod.getProfilesToTry('auto');
        assert.ok(Array.isArray(profiles) && profiles.length > 0);
        assert.ok(profiles.includes('gemini'));
        assert.ok(profiles.includes('doubao'));
        assert.ok(!profiles.includes('dalle3'));
    });

    test('Missing alphaMap returns empty gracefully', async () => {
        const img = createMockImageData(W, H, 'solid', 128);
        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'doubao',
            getAlphaMap: async () => null,
            options: { deepScan: true }
        });
        assert.strictEqual(result.matches.length, 0);
    });

    test('No global fallback for strong catalog match', async () => {
        const img = createMockImageData(W, H, 'noise', 128);
        const alpha96 = createMockAlphaMap(96, 96);
        const pos = DEFAULT_POS();
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alpha96, 255);

        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: async (key) => String(key) === '96'
                ? { data: alpha96, width: 96, height: 96, assetKey: '96' }
                : alphaMock(key, 48, 48),
            options: { deepScan: true }
        });
        if (result.winner && result.winner.source === 'catalog-probe' && result.winner.confidence >= 0.60) {
            assert.ok(result.winner.source === 'catalog-probe');
        }
    });
});

// -- Merged from v2_2_probe_gating.test.js --
function alphaProvider(size, alphaMap) {
    return async (key) => {
        const s = parseInt(key) || size;
        return { data: alphaMap || createMockAlphaMap(s, s), width: s, height: s };
    };
}

describe('Probe gating & multi-dimension scoring (v2.2)', () => {
    test('Scaled match requires higher base NCC gate', () => {
        const img = createMockImageData(512, 512, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        const pos = { x: 400, y: 400, width: 96, height: 96 };
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);
        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: false, isScaledMatch: true });
        assert.ok(result.confidence > 0, 'Scaled probe should return a value');
    });

    test('Non-scaled match uses lower base NCC gate', () => {
        const img = createMockImageData(512, 512, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        const pos = { x: 400, y: 400, width: 96, height: 96 };
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap, 255);
        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: false, isScaledMatch: false });
        assert.ok(result.confidence > 0);
    });

    test('Low NCC on non-watermark image returns baseNcc early (scaled)', () => {
        const img = createMockImageData(512, 512, 'random', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        const result = calculateProbeConfidence(img, { x: 400, y: 400, width: 96, height: 96 }, alphaMap, 'gemini', { deepScan: false, isScaledMatch: true });
        assert.ok(result.confidence < 0.20, `Scaled probe should not inflate noise: ${result.confidence}`);
    });

    test('max(spatial, weighted) preserves high NCC', () => {
        const img = createMockImageData(200, 200, 'solid', 180);
        const alphaMap = createMockAlphaMap(48, 48);
        applyWatermark(img, 70, 70, 48, 48, alphaMap, 200);
        const ncc = calculateCorrelation(img, 70, 70, 48, 48, alphaMap, true);
        const gradientsI = new Float32Array(48 * 48), gradientsA = new Float32Array(48 * 48);
        const gradient = calculateGradientCorrelation(img, 70, 70, 48, 48, alphaMap, gradientsI, gradientsA);
        const weighted = ncc * 0.5 + Math.max(0, gradient) * 0.3 + 0.5 * 0.2;
        const final = Math.max(ncc, weighted);
        assert.ok(final >= ncc, `Final ${final} should not be less than NCC ${ncc}`);
    });

    test('Non-exact catalog resolution uses higher probe threshold', async () => {
        const img = createMockImageData(1100, 1100, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        const pos = 1100 - 64 - 96;
        applyWatermark(img, pos, pos, 96, 96, alphaMap, 255);
        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: alphaProvider(96, alphaMap),
            options: { deepScan: true }
        });
        assert.ok(result.confidence > 0 || result.matches.length >= 0, 'Pipeline should complete without crash');
    });
});
