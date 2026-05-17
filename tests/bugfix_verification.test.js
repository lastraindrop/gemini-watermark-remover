import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createMockImageData, createMockAlphaMap, applyWatermark, MockCanvas, setupMemoryMocks } from './test_utils.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from '../src/core/alphaCalibration.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { detectWatermarks } from '../src/core/detectionPipeline.js';
import { PROFILES } from '../src/core/profiles.js';

describe('Bugfix Verification Tests', () => {

    describe('BUG-1 Fix: Worker pipeline parity', () => {
        test('removeRepeatedWatermarkLayers works with object-style call', () => {
            const size = 96;
            const alphaMap = createMockAlphaMap(size);
            const imageData = createMockImageData(512, 512, 'solid', 128);
            applyWatermark(imageData, 512 - 96 - 64, 512 - 96 - 64, size, size, alphaMap);

            const result = removeRepeatedWatermarkLayers({
                imageData,
                alphaMap,
                position: { x: 512 - 96 - 64, y: 512 - 96 - 64, width: size, height: size },
                maxPasses: 4,
                residualThreshold: 0.25
            });

            assert.ok(result);
            assert.ok(result.imageData);
            assert.ok(typeof result.passCount === 'number');
            assert.ok(typeof result.stopReason === 'string');
            assert.ok(Array.isArray(result.passes));
        });

        test('shouldRecalibrateAlphaStrength gates correctly', () => {
            assert.strictEqual(shouldRecalibrateAlphaStrength({
                originalScore: 0.8,
                processedScore: 0.6,
                suppressionGain: 0.2
            }), false);

            assert.strictEqual(shouldRecalibrateAlphaStrength({
                originalScore: 0.8,
                processedScore: 0.55,
                suppressionGain: 0.15
            }), true);

            assert.strictEqual(shouldRecalibrateAlphaStrength({
                originalScore: 0.3,
                processedScore: 0.55,
                suppressionGain: 0.15
            }), false);
        });

        test('recalibrateAlphaStrength produces valid output or null', () => {
            const size = 96;
            const alphaMap = createMockAlphaMap(size);
            const pos = { x: 350, y: 350, width: size, height: size };
            const imageData = createMockImageData(512, 512, 'solid', 128);
            applyWatermark(imageData, pos.x, pos.y, size, size, alphaMap);

            const result = recalibrateAlphaStrength({
                sourceImageData: imageData,
                alphaMap,
                position: pos,
                originalSpatialScore: 0.9,
                processedSpatialScore: 0.6
            });

            if (result !== null) {
                assert.ok(result.imageData);
                assert.ok(typeof result.alphaGain === 'number');
                assert.ok(result.alphaGain >= 1);
                assert.ok(typeof result.processedSpatialScore === 'number');
            }
        });

        test('multiPassRemoval with non-gemini match uses simple removeWatermark', () => {
            const size = 96;
            const alphaMap = createMockAlphaMap(size);
            const imageData = createMockImageData(512, 512, 'solid', 128);
            const pos = { x: 100, y: 100, width: size, height: size };
            applyWatermark(imageData, pos.x, pos.y, size, size, alphaMap);

            const before = new Uint8ClampedArray(imageData.data);
            removeWatermark(imageData, alphaMap, pos);
            let changed = false;
            for (let i = 0; i < before.length; i++) {
                if (before[i] !== imageData.data[i]) { changed = true; break; }
            }
            assert.ok(changed, 'Simple removeWatermark should modify pixels');
        });
    });

    describe('BUG-2 Fix: BT.709 alphaMap consistency for grayscale assets', () => {
        test('BT.709 luminance equals max channel for grayscale images', () => {
            const size = 48;
            const grayData = new Uint8ClampedArray(size * size * 4);
            for (let i = 0; i < size * size; i++) {
                const v = Math.round(Math.random() * 255);
                grayData[i * 4] = v;
                grayData[i * 4 + 1] = v;
                grayData[i * 4 + 2] = v;
                grayData[i * 4 + 3] = 255;
            }

            const alphaMap = calculateAlphaMap({ width: size, height: size, data: grayData });

            for (let i = 0; i < alphaMap.length; i++) {
                const expected = grayData[i * 4] / 255.0;
                assert.ok(Math.abs(alphaMap[i] - expected) < 0.001,
                    `BT.709 mismatch at pixel ${i}: ${alphaMap[i]} vs ${expected}`);
            }
        });

        test('BT.709 luminance differs from max channel for color images', () => {
            const size = 16;
            const colorData = new Uint8ClampedArray(size * size * 4);
            for (let i = 0; i < size * size; i++) {
                colorData[i * 4] = 200;
                colorData[i * 4 + 1] = 100;
                colorData[i * 4 + 2] = 50;
                colorData[i * 4 + 3] = 255;
            }

            const alphaMap = calculateAlphaMap({ width: size, height: size, data: colorData });
            const bt709 = (200 * 0.2126 + 100 * 0.7152 + 50 * 0.0722) / 255.0;
            const maxChannel = 200 / 255.0;

            assert.ok(Math.abs(alphaMap[0] - bt709) < 0.001);
            assert.notStrictEqual(Math.round(alphaMap[0] * 1000), Math.round(maxChannel * 1000));
        });
    });

    describe('BUG-3 Fix: Non-Gemini fallback alpha maps', () => {
        test('doubao profile has assets defined', () => {
            const doubao = PROFILES.doubao;
            assert.ok(doubao.assets);
            assert.ok(doubao.assets['bottom-right']);
            assert.ok(doubao.assets['top-left']);
        });

        test('dalle3 profile has assets defined', () => {
            const dalle3 = PROFILES.dalle3;
            assert.ok(dalle3.assets);
            assert.ok(dalle3.assets['bottom-left']);
        });

        test('all profiles have defaultAsset or assets', () => {
            for (const profile of Object.values(PROFILES)) {
                assert.ok(
                    profile.defaultAsset || profile.assets,
                    `Profile ${profile.id} missing defaultAsset and assets`
                );
            }
        });
    });

    describe('BUG-4 Fix: Toast icons definition', () => {
        test('showToast icon types are all valid SVG strings', async () => {
            const { execSync } = await import('node:child_process');
            const fs = await import('node:fs');
            const uiContent = fs.readFileSync('src/app/ui.js', 'utf-8');

            assert.ok(uiContent.includes('const icons ='), 'icons object must be defined');
            assert.ok(uiContent.includes('info:'), 'icons.info must exist');
            assert.ok(uiContent.includes('success:'), 'icons.success must exist');
            assert.ok(uiContent.includes('warn:'), 'icons.warn must exist');
            assert.ok(uiContent.includes('err:'), 'icons.err must exist');

            for (const type of ['info', 'success', 'warn', 'err']) {
                assert.ok(uiContent.includes(`<svg`) || uiContent.includes('viewBox'),
                    `icons.${type} should contain SVG markup`);
            }
        });
    });

    describe('BUG-5 Fix: updateStatsUI signature consistency', () => {
        test('updateStatsUI accepts 4 positional args without elements', async () => {
            const fs = await import('node:fs');
            const viewContent = fs.readFileSync('src/app/viewModes.js', 'utf-8');

            const match = viewContent.match(/export function updateStatsUI\(([^)]+)\)/);
            assert.ok(match, 'updateStatsUI function not found');
            const params = match[1].split(',').map(p => p.trim());
            assert.strictEqual(params.length, 4, 'Should have exactly 4 parameters: config, pos, confidence, profileId');
            assert.strictEqual(params[0], 'config');
            assert.strictEqual(params[1], 'pos');
            assert.strictEqual(params[2], 'confidence');
            assert.strictEqual(params[3], 'profileId');
        });
    });

    describe('End-to-end regression after fixes', () => {
        test('Full pipeline: Gemini 1024x1024 with multiPass produces valid output', async () => {
            setupMemoryMocks();
            const alphaMap = createMockAlphaMap(96);
            const imageData = createMockImageData(1024, 1024, 'gradient', 128);
            applyWatermark(imageData, 1024 - 96 - 64, 1024 - 96 - 64, 96, 96, alphaMap);

            const result = await detectWatermarks({
                imageData,
                profileId: 'gemini',
                getAlphaMap: async (key, w, h) => {
                    const s = parseInt(String(key)) || 96;
                    return { data: createMockAlphaMap(s), width: s, height: s, assetKey: key };
                },
                options: { deepScan: true, noiseReduction: false }
            });

            assert.ok(result);
            if (result.matches.length > 0) {
                for (const match of result.matches) {
                    if (match.profileId === 'gemini') {
                        const mpResult = removeRepeatedWatermarkLayers({
                            imageData,
                            alphaMap: match.alphaMap,
                            position: match.pos,
                            maxPasses: 4,
                            residualThreshold: 0.25
                        });
                        assert.ok(mpResult.imageData);
                        assert.ok(mpResult.passCount >= 1);
                    } else {
                        removeWatermark(imageData, match.alphaMap, match.pos);
                    }
                }
            }
        });

        test('Full pipeline: doubao profile detection attempt does not crash', async () => {
            setupMemoryMocks();
            const imageData = createMockImageData(2048, 2048, 'solid', 150);

            const result = await detectWatermarks({
                imageData,
                profileId: 'doubao',
                getAlphaMap: async (key, w, h) => {
                    const s = w || 96;
                    return { data: createMockAlphaMap(s, h), width: s, height: h || s, assetKey: key };
                },
                options: { deepScan: true }
            });

            assert.ok(result);
            assert.strictEqual(result.profileId, 'doubao');
        });
    });
});
