import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { createMockImageData, applyWatermark, createMockAlphaMap } from './test_utils.js';

describe('System Pipeline Integration - E2E Simulation', () => {

    test('Full Journey: Detection to Removal recovery', () => {
        const w = 800, h = 600;
        const originalColor = 100;
        const rawImg = createMockImageData(w, h, 'solid', originalColor);
        
        // Use a copy for processing
        const processedImg = {
            width: w,
            height: h,
            data: new Uint8ClampedArray(rawImg.data)
        };

        const size = 96;
        const alphaMap = createMockAlphaMap(size);
        const targetX = w - 100; // Edge case: partial crop
        const targetY = h - 50;
        
        // 1. Apply Watermark
        applyWatermark(processedImg, targetX, targetY, size, alphaMap);

        // 2. Detect Watermark
        const alphaMaps = { 96: alphaMap, 48: new Float32Array(48*48) };
        const detection = detectWatermark(processedImg, alphaMaps);
        
        assert.ok(detection, 'Pipeline step 1 (Detection) failed');
        assert.strictEqual(detection.size, 96);

        // 3. Remove Watermark
        const pos = { x: detection.x, y: detection.y, width: detection.size, height: detection.size };
        removeWatermark(processedImg, alphaMap, pos);

        // 4. Verify Reconstruction
        // We check if the processed image pixels returned to originalColor (within rounding tolerance)
        const checkPoints = [
            { x: targetX + 10, y: targetY + 10 },
            { x: targetX + 40, y: targetY + 40 }
        ];

        for (const pt of checkPoints) {
            if (pt.x < w && pt.y < h) {
                const idx = (pt.y * w + pt.x) << 2;
                const diff = Math.abs(processedImg.data[idx] - originalColor);
                assert.ok(diff <= 2, `Reconstruction error at (${pt.x},${pt.y}): got ${processedImg.data[idx]}, expected ~${originalColor}`);
            }
        }
    });

    test('Consistency: No-Watermark scenario should return null', () => {
        const img = createMockImageData(200, 200, 'random');
        const alphaMaps = { 48: createMockAlphaMap(48), 96: createMockAlphaMap(96) };
        const res = detectWatermark(img, alphaMaps);
        assert.strictEqual(res, null, 'False positive detection on random noise');
    });
});
