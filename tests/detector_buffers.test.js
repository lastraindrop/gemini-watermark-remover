import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateGradientCorrelation, detectWatermark, DetectorContext } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap } from './test_utils.js';

describe('DetectorContext Lifecycle', () => {

  test('Buffers allocated during noise-reduced detection', () => {
    const ctx = new DetectorContext();
    const img = createMockImageData(512, 512, 'gradient');
    const alphaMaps = { 96: createMockAlphaMap(96), 48: createMockAlphaMap(48) };

    detectWatermark(img, alphaMaps, { deepScan: false, noiseReduction: true }, ctx);
    assert.ok(ctx._blurBuffer, 'Blur buffer should be allocated');
  });

  test('reset clears all buffers to null', () => {
    const ctx = new DetectorContext();
    ctx._blurBuffer = new Uint8ClampedArray(100);
    ctx._sharedGradientsI = new Float32Array(50);
    ctx._sharedGradientsA = new Float32Array(50);

    ctx.reset();

    assert.strictEqual(ctx._blurBuffer, null);
    assert.strictEqual(ctx._sharedGradientsI, null);
    assert.strictEqual(ctx._sharedGradientsA, null);
  });

  test('Re-allocation after reset works without errors', () => {
    const ctx = new DetectorContext();
    ctx.reset();
    const img = createMockImageData(256, 256, 'gradient');
    const alphaMaps = { 48: createMockAlphaMap(48), 96: createMockAlphaMap(96) };

    detectWatermark(img, alphaMaps, { deepScan: true }, ctx);
    assert.ok(ctx._sharedGradientsI, 'Gradients buffer should be re-allocated');
  });

  test('gradient correlation handles undersized buffer gracefully', () => {
    const size = 128;
    const img = createMockImageData(256, 256, 'gradient');
    const alphaMap = createMockAlphaMap(size);
    const tooSmallGradientsI = new Float32Array(96 * 96);
    const tooSmallGradientsA = new Float32Array(96 * 96);

    const result = calculateGradientCorrelation(
      img, 40, 40, size, size,
      alphaMap, tooSmallGradientsI, tooSmallGradientsA
    );

    assert.ok(Number.isFinite(result), `Expected finite gradient score, got ${result}`);
    assert.ok(result >= -1 && result <= 1, `Expected score in [-1, 1], got ${result}`);
  });
});
