/**
 * v2.3 Scaled-config & Non-Square AlphaMap detection (heavy pipeline tests).
 *
 * Split from detection_fallback_chain.test.js (Phase 5) — these tests use
 * deepScan:true on non-trivial resolutions (1200×1200, 2048×1535) and
 * belong in the precision group.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarks, detectProfileWatermarks } from '../src/core/detectionPipeline.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, resolvePos } from './test_utils.js';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';

const W = 1024, H = 1024;
const DEFAULT_POS = () => resolvePos(W, H, 'gemini');

function alphaMock(key, w = 96, h = 96) {
    return { data: createMockAlphaMap(w, h), width: w, height: h, assetKey: String(key) };
}

describe('v2.3 Scaled Config Detection', () => {
    test('Scaled-config probe uses 0.25 threshold (lowered from 0.35)', () => {
        assert.strictEqual(DETECTION_THRESHOLDS.SCALED_CONFIG_MIN, 0.25,
            'Scaled config threshold should be 0.25');
    });

    test('Non-catalog resolution with watermark still traverses pipeline stages', async () => {
        const img = createMockImageData(1200, 1200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96);
        const x = 1200 - 64 - 96;
        const y = 1200 - 64 - 96;
        applyWatermark(img, x, y, 96, 96, alphaMap, 255);
        const result = await detectWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: async (key) => alphaMock(key, 96),
            options: { deepScan: true, probeThreshold: 0.18 }
        });
        assert.ok(result, 'Should return a result object');
        assert.ok(Number.isFinite(result.confidence), 'Confidence should be a number');
    });
});

describe('v2.3 Non-Square AlphaMap Lookup Guard', () => {
    test('Rectangular alphaMap key (WxH) is correctly handled by pipeline', async () => {
        const w = 2048, h = 1535;
        const logoW = 200, logoH = 86;
        const img = createMockImageData(w, h, 'noise', 128);
        const alphaMap = createMockAlphaMap(logoW, logoH);
        const x = w - 24 - logoW;
        const y = h - 10 - logoH;
        applyWatermark(img, x, y, logoW, logoH, alphaMap, 255);
        const result = await detectProfileWatermarks({
            imageData: img, profileId: 'doubao',
            getAlphaMap: async (key) => {
                if (key === 'doubao_br') return { data: alphaMap, width: logoW, height: logoH, assetKey: 'doubao_br' };
                return null;
            },
            options: { deepScan: true, probeThreshold: 0.10, adaptiveMode: false, globalFallback: false }
        });
        assert.ok(result, 'Pipeline should handle rectangular alpha maps without crash');
    });

    test('Square alphaMaps still work correctly (regression guard)', async () => {
        const img = createMockImageData(1024, 1024, 'noise', 128);
        const pos = DEFAULT_POS();
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, pos.x, pos.y, 96, 96, alphaMap, 255);
        const result = await detectWatermarks({
            imageData: img, profileId: 'gemini',
            getAlphaMap: async (key) => alphaMock(key, 96),
            options: { deepScan: true }
        });
        assert.ok(result.winner, 'Square watermarks should still be detected normally');
    });
});
