import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
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
    
    applyWatermark(img, cfg.marginLeft, cfg.marginTop, cfg.logoWidth, cfg.logoHeight, alphaMap);

    const result = detectWatermark(img, { [cfg.logoWidth + 'x' + cfg.logoHeight]: alphaMap }, 'doubao');
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

  test('Slightly scaled image (non-catalog)', () => {
    const img = createMockImageData(1050, 1050, 'gradient');
    const config = detectWatermarkConfig(1050, 1050);

    // Should use heuristic, not catalog
    assert.strictEqual(config.isOfficial, false);
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
