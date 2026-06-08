import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';
import { getProfile } from '../src/core/profiles.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Edge Cases & Stress Tests', () => {

  test('Watermark at adaptive position (Doubao TL mode)', () => {
    const w = 1000, h = 1000;
    const img = createMockImageData(w, h, 'gradient');
    const profile = getProfile('doubao');
    const cfg = profile.getHeuristicConfig(w, h, 'top-left');
    const alphaMap = createMockAlphaMap(cfg.logoWidth, cfg.logoHeight);
    
    // Key format should match detector's expectation: either size or "WxH"
    const mapKey = cfg.logoWidth + 'x' + cfg.logoHeight;
    applyWatermark(img, cfg.marginLeft, cfg.marginTop, cfg.logoWidth, cfg.logoHeight, alphaMap);

    const result = detectWatermark(img, { [mapKey]: alphaMap }, { deepScan: true });
    assert.ok(result, 'Should detect Doubao watermark at adaptive TL position');
  });

  test('Image exactly watermark size (with standard margin offset)', () => {
    const size = 48;
    // 48px logo + 32px margin = 80px image
    const w = 80, h = 80;
    const originalColor = 50; // Darker background for better contrast in quantization-limited mock
    const img = createMockImageData(w, h, 'gradient', originalColor);
    const alphaMap = createMockAlphaMap(size);
    // Gemini 48px uses 32px margin
    applyWatermark(img, w - 32 - size, h - 32 - size, size, size, alphaMap);

    const result = detectWatermark(img, { 48: alphaMap, 96: createMockAlphaMap(96) });
    assert.ok(result, 'Should detect on image that fits the watermark + margins');
  });

  test('Quantization resilience (JPEG simulation)', () => {
    const w = 1024, h = 1024, size = 96;
    const img = createMockImageData(w, h, 'gradient');
    const alphaMap = createMockAlphaMap(size);
    const pos = calculateWatermarkPosition(w, h, { logoSize: size, marginRight: 64, marginBottom: 64 });

    applyWatermark(img, pos.x, pos.y, size, size, alphaMap);

    const radius = Math.min(w, h) / 3;
    const centerX = w / 2;
    const centerY = h / 2;
    for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
            const dist = Math.sqrt((i - centerY) ** 2 + (j - centerX) ** 2);
            if (dist < radius) {
                // Steeper slope for stronger gradients (v1.8.6 tuning)
                const idx = (i * w + j) << 2;
                const val = Math.max(0, 255 * (1 - dist / radius)) | 0;
                img.data[idx] = val; // Set R channel to create noise
            }
        }
    }

    // Simulate JPEG quantization (destructive)
    for (let i = 0; i < img.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        img.data[i + c] = Math.round(img.data[i + c] / 16) * 16;
      }
    }

    const result = detectWatermark(img, { 48: createMockAlphaMap(48), 96: alphaMap });
    assert.ok(result, 'Should detect after heavy JPEG-like quantization');
  });

  test('Slightly scaled image (near-catalog, matches within 10% tolerance)', () => {
    // 1100x1100 is ~7.4% larger than 1024x1024, now within 10% catalog tolerance
    const config = detectWatermarkConfig(1100, 1100);
    // The 1024x1024 catalog entry matches with isOfficial: true under relaxed tolerance
    assert.strictEqual(config.isOfficial, true, 'Should match catalog at relaxed tolerance');
    assert.strictEqual(config.logoSize, 96);
  });

  test('Very wide image (panoramic)', () => {
    const img = createMockImageData(4000, 500, 'gradient');
    const config = detectWatermarkConfig(4000, 500);
    // Height 500 < 1024, so heuristic gives 48px logo regardless of width
    assert.strictEqual(config.logoSize, 48);

    const pos = calculateWatermarkPosition(4000, 500, config);
    assert.ok(pos.x > 0 && pos.y > 0, 'Position should be valid');
  });
});

// ─── Alpha Map Edge Cases (v2.3: merged from edge_alpha_maps) ───────────────

describe('Alpha Map Edge Cases', () => {

    test('All-zero alpha map leaves pixels unchanged', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = new Float32Array(48 * 48).fill(0);
        const original = new Uint8ClampedArray(img.data);
        removeWatermark(img, alphaMap, { x: 10, y: 10, width: 48, height: 48 });
        for (let i = 0; i < img.data.length; i += 4) {
            assert.strictEqual(img.data[i], original[i], `Pixel ${i} changed with zero alpha`);
        }
    });

    test('All-white alpha map (1.0) should not produce NaN', () => {
        const img = createMockImageData(100, 100, 'solid', 50);
        const alphaMap = new Float32Array(48 * 48).fill(1.0);
        assert.doesNotThrow(() => {
            removeWatermark(img, alphaMap, { x: 10, y: 10, width: 48, height: 48 });
        });
        for (let i = 0; i < img.data.length; i++) {
            assert.ok(Number.isFinite(img.data[i]), `NaN at index ${i}`);
        }
    });

    test('Very small alpha below noise floor is skipped', () => {
        const img = createMockImageData(50, 50, 'solid', 100);
        const alphaMap = new Float32Array(20 * 20).fill(0.001);
        const original = new Uint8ClampedArray(img.data);
        removeWatermark(img, alphaMap, { x: 5, y: 5, width: 20, height: 20 });
        for (let i = 5; i < 25; i++) {
            const idx = ((15 * 50 + i) << 2);
            assert.strictEqual(img.data[idx], original[idx]);
        }
    });

    test('NaN in alpha map is skipped gracefully', () => {
        const img = createMockImageData(100, 100, 'solid', 128);
        const alphaMap = new Float32Array(48 * 48).fill(0.5);
        alphaMap[100] = NaN;
        assert.doesNotThrow(() => {
            removeWatermark(img, alphaMap, { x: 10, y: 10, width: 48, height: 48 });
        });
        for (let i = 0; i < img.data.length; i++) {
            assert.ok(Number.isFinite(img.data[i]), `NaN produced at index ${i}`);
        }
    });

    test('1x1 alpha map processes single pixel and restores original', () => {
        const img = createMockImageData(50, 50, 'solid', 100);
        const alphaMap = new Float32Array(1).fill(0.5);
        const idx = (10 * 50 + 10) << 2;
        const original = img.data[idx];
        const wm = Math.round(0.5 * 255 + 0.5 * original);
        img.data[idx] = wm; img.data[idx + 1] = wm; img.data[idx + 2] = wm;
        assert.doesNotThrow(() => {
            removeWatermark(img, alphaMap, { x: 10, y: 10, width: 1, height: 1 });
        });
        assert.ok(Math.abs(img.data[idx] - original) <= 5, '1x1 removal should restore original');
    });

    test('calculateAlphaMap produces [0,1] for random 100x100 input', () => {
        const data = new Uint8ClampedArray(100 * 100 * 4);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 256 | 0;
        const result = calculateAlphaMap({ width: 100, height: 100, data });
        for (let i = 0; i < result.length; i++) {
            assert.ok(result[i] >= 0 && result[i] <= 1, `Out of range at ${i}: ${result[i]}`);
        }
    });
});
