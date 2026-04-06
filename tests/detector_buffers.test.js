import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { detectWatermark, resetDetectorBuffers } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap } from './test_utils.js';

describe('Detector Buffer Management', () => {
  after(() => {
    resetDetectorBuffers();
  });

  test('Buffers are allocated during detection', () => {
    const img = createMockImageData(512, 512, 'gradient');
    const alphaMaps = { 96: createMockAlphaMap(96), 48: createMockAlphaMap(48) };
    // Trigger allocation via noiseReduction
    detectWatermark(img, alphaMaps, { deepScan: false, noiseReduction: true });
    assert.ok(detectWatermark._blurBuffer, 'Blur buffer should be allocated');
  });

  test('resetDetectorBuffers clears all buffers', () => {
    resetDetectorBuffers();
    assert.strictEqual(detectWatermark._blurBuffer, null);
    assert.strictEqual(detectWatermark._sharedGradientsI, null);
    assert.strictEqual(detectWatermark._sharedGradientsA, null);
  });

  test('Re-allocation works after reset', () => {
    resetDetectorBuffers();
    const img = createMockImageData(256, 256, 'gradient');
    const alphaMaps = { 48: createMockAlphaMap(48), 96: createMockAlphaMap(96) };
    
    // This should not throw — fresh allocation after reset
    // We use a gradient image to ensure confidence > threshold, triggering gradient buffer allocation
    detectWatermark(img, alphaMaps, { deepScan: true });
    assert.ok(detectWatermark._sharedGradientsI, 'Gradients buffer should be re-allocated');
  });
});
