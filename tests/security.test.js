import { test, describe } from 'node:test';
import assert from 'node:assert';
import { removeWatermark } from '../src/core/blendModes.js';
import { detectWatermark } from '../src/core/detector.js';
import { createMockImageData } from './test_utils.js';

describe('Security & Input Validation', () => {

  test('removeWatermark handles NaN alpha gracefully', () => {
    const alphaMap = new Float32Array(1).fill(NaN);
    const img = createMockImageData(10, 10, 'solid', 128);
    assert.doesNotThrow(() => {
      removeWatermark(img, alphaMap, { x: 0, y: 0, width: 1, height: 1 });
    });
  });

  test('removeWatermark handles Infinity alpha gracefully', () => {
    const alphaMap = new Float32Array(1).fill(Infinity);
    const img = createMockImageData(10, 10, 'solid', 128);
    assert.doesNotThrow(() => {
      removeWatermark(img, alphaMap, { x: 0, y: 0, width: 1, height: 1 });
    });
  });

  test('removeWatermark handles negative alpha gracefully', () => {
    const alphaMap = new Float32Array(1).fill(-0.5);
    const img = createMockImageData(10, 10, 'solid', 128);
    assert.doesNotThrow(() => {
      removeWatermark(img, alphaMap, { x: 0, y: 0, width: 1, height: 1 });
    });
  });

  test('detectWatermark handles empty alphaMaps', () => {
    const img = createMockImageData(100, 100, 'solid', 128);
    const result = detectWatermark(img, {});
    assert.strictEqual(result, null);
  });

  test('detectWatermark handles mismatched alphaMap size', () => {
    const img = createMockImageData(100, 100, 'solid', 128);
    const wrongMap = new Float32Array(10); // Too small
    const result = detectWatermark(img, { 48: wrongMap, 96: wrongMap });
    // Should not crash; result depends on behavior, but usually it should be null or return what it found safely
    assert.ok(result === null || result.size !== undefined);
  });
});
