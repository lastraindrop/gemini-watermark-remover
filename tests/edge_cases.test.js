import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Edge Cases & Stress Tests', () => {

  test('Watermark at exact image corner (0,0)', () => {
    const size = 48;
    const img = createMockImageData(size, size, 'gradient');
    const alphaMap = createMockAlphaMap(size);
    applyWatermark(img, 0, 0, size, alphaMap);

    const result = detectWatermark(img, { 48: alphaMap, 96: createMockAlphaMap(96) });
    assert.ok(result, 'Should detect watermark at (0,0)');
  });

  test('Image exactly watermark size', () => {
    const size = 48;
    const img = createMockImageData(size, size, 'solid', 128);
    const alphaMap = createMockAlphaMap(size);
    applyWatermark(img, 0, 0, size, alphaMap);

    const result = detectWatermark(img, { 48: alphaMap, 96: createMockAlphaMap(96) });
    assert.ok(result, 'Should detect on image that IS the watermark');
  });

  test('Quantization resilience (JPEG simulation)', () => {
    const w = 1024, h = 1024, size = 96;
    const img = createMockImageData(w, h, 'gradient');
    const alphaMap = createMockAlphaMap(size);
    const pos = calculateWatermarkPosition(w, h, { logoSize: size, marginRight: 64, marginBottom: 64 });

    applyWatermark(img, pos.x, pos.y, size, alphaMap);

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
    assert.strictEqual(config.logoSize, 96); // maxSide >= 1500

    const pos = calculateWatermarkPosition(4000, 500, config);
    assert.ok(pos.x > 0 && pos.y > 0, 'Position should be valid');
  });
});
