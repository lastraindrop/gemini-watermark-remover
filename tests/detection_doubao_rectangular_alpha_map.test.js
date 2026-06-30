/**
 * Missed-Detection Regression: Doubao Rectangular AlphaMap Invariants
 *
 * Verifies that rectangular (non-square) Doubao watermarks are detected
 * with correct dimension invariants — the v2.3 guard that prevents
 * single-dimension square fallback from matching unrelated templates.
 *
 * Invariants covered:
 *  - detected candidate width !== height (rectangular shape preserved)
 *  - candidate width/height match the injected rectangular logo dims
 *  - alphaMap length === width * height
 *  - WxH key lookup is required (square-only maps cannot match a rect watermark)
 *  - both top-left and bottom-right anchors are handled
 *  - detected rectangular region stays inside the image bounds
 *
 * Uses synthetic ImageData + direct detectWatermark (Phase 2) API on
 * small images to keep the suite fast.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectWatermark } from '../src/core/detector.js';
import { calculateWatermarkPosition } from '../src/core/config.js';
import { PROFILES } from '../src/core/profiles.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Missed-Detection Regression: Doubao Rectangular AlphaMap', () => {
    describe('rectangular dimensions are preserved in detection', () => {
        test('BR rectangular watermark detected with exact WxH dimensions', () => {
            const w = 600, h = 400;
            const cfg = PROFILES.doubao.getHeuristicConfig(w, h, 'bottom-right');
            const logoW = cfg.logoWidth;
            const logoH = cfg.logoHeight;
            assert.notEqual(logoW, logoH, 'precondition: heuristic must produce rectangular dims');

            const alphaMap = createMockAlphaMap(logoW, logoH);
            const img = createMockImageData(w, h, 'gradient', 100);
            const pos = calculateWatermarkPosition(w, h, cfg);
            applyWatermark(img, pos.x, pos.y, logoW, logoH, alphaMap);

            const mapKey = `${logoW}x${logoH}`;
            const result = detectWatermark(img, { [mapKey]: alphaMap }, { deepScan: true });

            assert.ok(result, 'rectangular BR watermark should be detected');
            assert.equal(result.width, logoW, 'width must match rectangular logo width');
            assert.equal(result.height, logoH, 'height must match rectangular logo height');
            assert.notEqual(result.width, result.height, 'detected dims must remain rectangular');
            assert.equal(alphaMap.length, logoW * logoH, 'alphaMap length must equal width*height');
        });

        test('TL rectangular watermark detected with exact WxH dimensions', () => {
            const w = 600, h = 400;
            const cfg = PROFILES.doubao.getHeuristicConfig(w, h, 'top-left');
            const logoW = cfg.logoWidth;
            const logoH = cfg.logoHeight;
            assert.notEqual(logoW, logoH, 'precondition: TL heuristic must produce rectangular dims');

            const alphaMap = createMockAlphaMap(logoW, logoH);
            const img = createMockImageData(w, h, 'gradient', 120);
            const pos = calculateWatermarkPosition(w, h, cfg);
            applyWatermark(img, pos.x, pos.y, logoW, logoH, alphaMap);

            const mapKey = `${logoW}x${logoH}`;
            const result = detectWatermark(img, { [mapKey]: alphaMap }, { deepScan: true });

            assert.ok(result, 'rectangular TL watermark should be detected');
            assert.equal(result.width, logoW, 'TL width must match');
            assert.equal(result.height, logoH, 'TL height must match');
            assert.notEqual(result.width, result.height, 'TL dims must remain rectangular');
        });
    });

    describe('coordinate invariants for rectangular watermarks', () => {
        test('detected BR rectangular region is in-bounds', () => {
            const w = 500, h = 500;
            const cfg = PROFILES.doubao.getHeuristicConfig(w, h, 'bottom-right');
            const logoW = cfg.logoWidth;
            const logoH = cfg.logoHeight;

            const alphaMap = createMockAlphaMap(logoW, logoH);
            const img = createMockImageData(w, h, 'gradient', 100);
            const pos = calculateWatermarkPosition(w, h, cfg);
            applyWatermark(img, pos.x, pos.y, logoW, logoH, alphaMap);

            const mapKey = `${logoW}x${logoH}`;
            const result = detectWatermark(img, { [mapKey]: alphaMap }, { deepScan: true });

            assert.ok(result, 'rectangular watermark should be detected');
            assert.ok(result.x >= 0 && result.y >= 0, `negative coords (${result.x},${result.y})`);
            assert.ok(
                result.x + result.width <= w,
                `x+width=${result.x + result.width} exceeds ${w}`
            );
            assert.ok(
                result.y + result.height <= h,
                `y+height=${result.y + result.height} exceeds ${h}`
            );
        });

        test('detected TL rectangular region is in-bounds', () => {
            // 600×400 keeps the TL anchor inside detectWatermark's Phase-2
            // search window (startY covers the top edge). Squarer sizes push
            // startY below the TL watermark's marginTop.
            const w = 600, h = 400;
            const cfg = PROFILES.doubao.getHeuristicConfig(w, h, 'top-left');
            const logoW = cfg.logoWidth;
            const logoH = cfg.logoHeight;

            const alphaMap = createMockAlphaMap(logoW, logoH);
            const img = createMockImageData(w, h, 'gradient', 110);
            const pos = calculateWatermarkPosition(w, h, cfg);
            applyWatermark(img, pos.x, pos.y, logoW, logoH, alphaMap);

            const mapKey = `${logoW}x${logoH}`;
            const result = detectWatermark(img, { [mapKey]: alphaMap }, { deepScan: true });

            assert.ok(result, 'TL rectangular watermark should be detected');
            assert.ok(result.x >= 0 && result.y >= 0, `negative coords (${result.x},${result.y})`);
            assert.ok(result.x + result.width <= w, `x+width exceeds ${w}`);
            assert.ok(result.y + result.height <= h, `y+height exceeds ${h}`);
        });
    });

    describe('square single-dimension fallback guard (v2.3)', () => {
        test('rectangular watermark is NOT matched when only square alphaMaps are provided', () => {
            // Place a rectangular watermark; supply ONLY square alphaMaps keyed
            // by single dimensions. The v2.3 guard ensures alphaMaps[logoW]
            // (a square logoW×logoW template) is not used to detect a
            // logoW×logoH rectangular watermark.
            const w = 500, h = 500;
            const cfg = PROFILES.doubao.getHeuristicConfig(w, h, 'bottom-right');
            const logoW = cfg.logoWidth;
            const logoH = cfg.logoHeight;
            assert.notEqual(logoW, logoH, 'precondition: rectangular');

            const rectAlpha = createMockAlphaMap(logoW, logoH);
            const img = createMockImageData(w, h, 'noise', 128);
            const pos = calculateWatermarkPosition(w, h, cfg);
            applyWatermark(img, pos.x, pos.y, logoW, logoH, rectAlpha);

            // Square templates keyed by single dimension only.
            const alphaMaps = {
                [logoW]: createMockAlphaMap(logoW, logoW),
                [logoH]: createMockAlphaMap(logoH, logoH),
                [`${logoW}x${logoW}`]: createMockAlphaMap(logoW, logoW),
                [`${logoH}x${logoH}`]: createMockAlphaMap(logoH, logoH)
            };

            const result = detectWatermark(img, alphaMaps, { deepScan: true });

            // No rectangular WxH alphaMap was provided, so the detector must
            // not return a match at the true rectangular dimensions.
            if (result) {
                const matchesTrueRect = result.width === logoW && result.height === logoH;
                assert.ok(
                    !matchesTrueRect,
                    `square-only alphaMaps must not produce a match at true rectangular dims ${logoW}x${logoH}`
                );
            }
        });

        test('providing the WxH key enables detection that single-dim key alone would not', () => {
            const w = 500, h = 500;
            const cfg = PROFILES.doubao.getHeuristicConfig(w, h, 'bottom-right');
            const logoW = cfg.logoWidth;
            const logoH = cfg.logoHeight;

            const rectAlpha = createMockAlphaMap(logoW, logoH);
            const img = createMockImageData(w, h, 'gradient', 100);
            const pos = calculateWatermarkPosition(w, h, cfg);
            applyWatermark(img, pos.x, pos.y, logoW, logoH, rectAlpha);

            // Only the exact WxH key — no single-dim fallback entries.
            const result = detectWatermark(
                img,
                { [`${logoW}x${logoH}`]: rectAlpha },
                { deepScan: true }
            );

            assert.ok(result, 'WxH key alone must be sufficient for rectangular detection');
            assert.equal(result.width, logoW);
            assert.equal(result.height, logoH);
        });
    });

    describe('rectangular alphaMap dimension invariant holds across anchors', () => {
        test('BR and TL watermarks never report square dimensions for a rectangular logo', () => {
            const w = 600, h = 400;
            for (const anchor of ['bottom-right', 'top-left']) {
                const cfg = PROFILES.doubao.getHeuristicConfig(w, h, anchor);
                const logoW = cfg.logoWidth;
                const logoH = cfg.logoHeight;
                if (logoW === logoH) continue; // skip if heuristic happens to be square

                const alphaMap = createMockAlphaMap(logoW, logoH);
                const img = createMockImageData(w, h, 'gradient', 110);
                const pos = calculateWatermarkPosition(w, h, cfg);
                applyWatermark(img, pos.x, pos.y, logoW, logoH, alphaMap);

                const result = detectWatermark(
                    img,
                    { [`${logoW}x${logoH}`]: alphaMap },
                    { deepScan: true }
                );

                assert.ok(result, `${anchor}: should be detected`);
                assert.notEqual(
                    result.width,
                    result.height,
                    `${anchor}: reported dims must be rectangular, got ${result.width}x${result.height}`
                );
            }
        });
    });
});
