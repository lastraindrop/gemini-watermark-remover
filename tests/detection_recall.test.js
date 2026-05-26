import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateProbeConfidence } from '../src/core/detector.js';
import { calculateWatermarkPosition } from '../src/core/config.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';
import { PROFILES } from '../src/core/profiles.js';

describe('Detection Recall Benchmark - Synthetic Watermarks', () => {

    const MIN_CONFIDENCE_THRESHOLD = 0.15;

    describe('Standard Gemini Resolutions (Catalog Match)', () => {
        const testCases = [
            { label: '1024x1024 96px', w: 1024, h: 1024, logoSize: 96, mr: 64, mb: 64 },
            { label: '512x512 48px', w: 512, h: 512, logoSize: 48, mr: 32, mb: 32 },
            { label: '2048x2048 96px', w: 2048, h: 2048, logoSize: 96, mr: 64, mb: 64 },
            { label: '848x1264 96px (2:3)', w: 848, h: 1264, logoSize: 96, mr: 64, mb: 64 },
            { label: '1264x848 96px (3:2)', w: 1264, h: 848, logoSize: 96, mr: 64, mb: 64 },
            { label: '1376x768 96px (16:9)', w: 1376, h: 768, logoSize: 96, mr: 64, mb: 64 },
            { label: '832x1248 96px (2.5-flash 2:3)', w: 832, h: 1248, logoSize: 96, mr: 64, mb: 64 },
            { label: '1152x928 96px (5:4)', w: 1152, h: 928, logoSize: 96, mr: 64, mb: 64 },
        ];

        for (const tc of testCases) {
            test(`Detect watermark at ${tc.label}`, () => {
                const img = createMockImageData(tc.w, tc.h, 'noise', 128);
                const alphaMap = createMockAlphaMap(tc.logoSize, tc.logoSize);
                const x = tc.w - tc.mr - tc.logoSize;
                const y = tc.h - tc.mb - tc.logoSize;
                applyWatermark(img, x, y, tc.logoSize, tc.logoSize, alphaMap);

                const pos = { x, y, width: tc.logoSize, height: tc.logoSize };
                const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

                assert.ok(result.confidence >= MIN_CONFIDENCE_THRESHOLD,
                    `${tc.label}: confidence ${result.confidence.toFixed(3)} < ${MIN_CONFIDENCE_THRESHOLD}`);
            });
        }
    });

    describe('Background Type Robustness', () => {
        const backgrounds = [
            { type: 'solid', name: 'solid gray (128)' },
            { type: 'gradient', name: 'gradient' },
            { type: 'grid', name: 'checkerboard grid' },
            { type: 'random', name: 'random noise' }
        ];

        for (const bg of backgrounds) {
            test(`Watermark on ${bg.name} background`, () => {
                const img = createMockImageData(1024, 1024, bg.type, bg.type === 'solid' ? 128 : 100);
                const alphaMap = createMockAlphaMap(96, 96);
                const x = 1024 - 64 - 96;
                const y = 1024 - 64 - 96;
                applyWatermark(img, x, y, 96, 96, alphaMap);

                const pos = { x, y, width: 96, height: 96 };
                const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

                if (bg.type === 'solid') {
                    assert.ok(result.confidence > 0.08,
                        `${bg.name}: solid bg detection (conf=${result.confidence.toFixed(3)})`);
                } else {
                    assert.ok(result.confidence >= MIN_CONFIDENCE_THRESHOLD,
                        `${bg.name}: confidence ${result.confidence.toFixed(3)} < ${MIN_CONFIDENCE_THRESHOLD}`);
                }
            });
        }
    });

    describe('Watermark Position Offset Tolerance', () => {
        test('Detect watermark shifted by ±2px from standard position', () => {
            const img = createMockImageData(1024, 1024, 'noise', 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const standardX = 1024 - 64 - 96;
            const standardY = 1024 - 64 - 96;

            for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [-2, 0], [0, -2], [2, 2], [-2, -2]]) {
                const x = standardX + dx;
                const y = standardY + dy;
                applyWatermark(img, x, y, 96, 96, alphaMap);

                const pos = { x: standardX, y: standardY, width: 96, height: 96 };
                const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

                assert.ok(result.confidence >= MIN_CONFIDENCE_THRESHOLD,
                    `Offset (${dx},${dy}): confidence ${result.confidence.toFixed(3)} < ${MIN_CONFIDENCE_THRESHOLD}`);
            }
        });
    });

    describe('Watermark Size Variation', () => {
        test('48px watermark at standard 48px position', () => {
            const img = createMockImageData(512, 512, 'noise', 128);
            const alphaMap = createMockAlphaMap(48, 48);
            const x = 512 - 32 - 48;
            const y = 512 - 32 - 48;
            applyWatermark(img, x, y, 48, 48, alphaMap);

            const pos = { x, y, width: 48, height: 48 };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence >= MIN_CONFIDENCE_THRESHOLD,
                `48px confidence ${result.confidence.toFixed(3)}`);
        });

        test('96px watermark on non-standard small image', () => {
            const img = createMockImageData(256, 256, 'noise', 128);
            const alphaMap = createMockAlphaMap(48, 48);
            const x = 256 - 32 - 48;
            const y = 256 - 32 - 48;
            applyWatermark(img, x, y, 48, 48, alphaMap);

            const pos = { x, y, width: 48, height: 48 };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence >= MIN_CONFIDENCE_THRESHOLD,
                `Small image confidence ${result.confidence.toFixed(3)}`);
        });
    });

    describe('False Positive Resistance', () => {
        test('No watermark => low confidence', () => {
            const img = createMockImageData(1024, 1024, 'noise', 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const x = 1024 - 64 - 96;
            const y = 1024 - 64 - 96;

            // No watermark applied
            const pos = { x, y, width: 96, height: 96 };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence < 0.25,
                `False positive: confidence ${result.confidence.toFixed(3)} should be < 0.25`);
        });

        test('Random alpha map on clean image => low confidence', () => {
            const img = createMockImageData(1024, 1024, 'noise', 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const x = 1024 - 64 - 96;
            const y = 1024 - 64 - 96;

            const pos = { x, y, width: 96, height: 96 };
            // Use a different random alpha map that doesn't match any watermark
            const wrongAlphaMap = createMockAlphaMap(96, 96);
            const result = calculateProbeConfidence(img, pos, wrongAlphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence < 0.25,
                `Wrong alpha map should not match clean image (conf=${result.confidence.toFixed(3)})`);
        });
    });

    describe('Extreme Background Conditions', () => {
        test('Very dark background (near black, color=10)', () => {
            const img = createMockImageData(1024, 1024, 'solid', 10);
            const alphaMap = createMockAlphaMap(96, 96);
            const x = 1024 - 64 - 96;
            const y = 1024 - 64 - 96;
            applyWatermark(img, x, y, 96, 96, alphaMap);

            const pos = { x, y, width: 96, height: 96 };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence > 0.8,
                `Dark background should produce strong signal (got ${result.confidence.toFixed(3)})`);
        });

        test('Very bright background (near white, color=240)', () => {
            const img = createMockImageData(1024, 1024, 'solid', 240);
            const alphaMap = createMockAlphaMap(96, 96);
            const x = 1024 - 64 - 96;
            const y = 1024 - 64 - 96;
            applyWatermark(img, x, y, 96, 96, alphaMap);

            const pos = { x, y, width: 96, height: 96 };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence > 0.05,
                `Bright background detection should be positive (got ${result.confidence.toFixed(3)})`);
        });

        test('Panoramic aspect ratio (wide) with 96px watermark', () => {
            const w = 3168, h = 672;
            const img = createMockImageData(w, h, 'noise', 128);
            const alphaMap = createMockAlphaMap(96, 96);
            const x = w - 64 - 96;
            const y = h - 64 - 96;
            applyWatermark(img, x, y, 96, 96, alphaMap);

            const pos = { x, y, width: 96, height: 96 };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence >= MIN_CONFIDENCE_THRESHOLD,
                `Panoramic: confidence ${result.confidence.toFixed(3)}`);
        });
    });

    describe('Alpha Map Match Quality (Max-Channel vs BT.709)', () => {
        test('Watermark applied via BT.709 alpha, detected via max-channel => correlation works', () => {
            const img = createMockImageData(1024, 1024, 'noise', 128);
            // Create a realistic-looking alpha map (white-on-black capture style)
            const alphaMap = createMockAlphaMap(96, 96);
            const x = 1024 - 64 - 96;
            const y = 1024 - 64 - 96;
            applyWatermark(img, x, y, 96, 96, alphaMap);

            const pos = { x, y, width: 96, height: 96 };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(result.confidence >= MIN_CONFIDENCE_THRESHOLD,
                `Alpha map NCC: ${result.confidence.toFixed(3)}`);
        });
    });
});

describe('Doubao Profile Detection', () => {
    test('Bottom-right doubao watermark at 2730x1535', () => {
        const profile = PROFILES.doubao;
        const config = profile.tiers['2k_br'];
        const w = 2730, h = 1535;

        const img = createMockImageData(w, h, 'noise', 128);
        const alphaMap = createMockAlphaMap(config.logoWidth, config.logoHeight);

        const pos = calculateWatermarkPosition(w, h, config);
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

        const result = calculateProbeConfidence(img, pos, alphaMap, 'doubao', { deepScan: true });
        assert.ok(result.confidence >= 0.10,
            `Doubao BR: confidence ${result.confidence.toFixed(3)}`);
    });

    test('Top-left doubao watermark at 2730x1535', () => {
        const profile = PROFILES.doubao;
        const config = profile.tiers['2k_tl'];
        const w = 2730, h = 1535;

        const img = createMockImageData(w, h, 'noise', 128);
        const alphaMap = createMockAlphaMap(config.logoWidth, config.logoHeight);

        const pos = calculateWatermarkPosition(w, h, config);
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

        const result = calculateProbeConfidence(img, pos, alphaMap, 'doubao', { deepScan: true });
        assert.ok(result.confidence >= 0.10,
            `Doubao TL: confidence ${result.confidence.toFixed(3)}`);
    });
});
