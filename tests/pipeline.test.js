import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { createMockImageData, applyWatermark, createMockAlphaMap, resolvePos } from './test_utils.js';

describe('Detection-to-Removal Pipeline', () => {

    test('Full journey: inject → detect → remove → verify', () => {
        const w = 800, h = 600;
        const originalColor = 100;
        const processedImg = createMockImageData(w, h, 'noise', originalColor);

        const size = 96;
        const alphaMap = createMockAlphaMap(size);
        const pos = resolvePos(w, h);
        const targetX = pos.x, targetY = pos.y;

        applyWatermark(processedImg, targetX, targetY, size, size, alphaMap);

        const alphaMaps = { 96: alphaMap, 48: new Float32Array(48 * 48) };
        const detection = detectWatermark(processedImg, alphaMaps);

        assert.ok(detection, 'Detection must succeed');
        assert.strictEqual(detection.width, 96);

        removeWatermark(processedImg, alphaMap, { x: detection.x, y: detection.y, width: detection.width, height: detection.height });

        const checkPoints = [
            { x: targetX + 10, y: targetY + 10 },
            { x: targetX + 40, y: targetY + 40 }
        ];
        for (const pt of checkPoints) {
            if (pt.x < w && pt.y < h) {
                const idx = (pt.y * w + pt.x) << 2;
                const diff = Math.abs(processedImg.data[idx] - originalColor);
                assert.ok(diff <= 120, `Reconstruction error too large: ${diff} at (${pt.x},${pt.y})`);
            }
        }
    });

    test('Clean image with no watermark returns null', () => {
        const img = createMockImageData(200, 200, 'random');
        const alphaMaps = { 48: createMockAlphaMap(48), 96: createMockAlphaMap(96) };
        assert.strictEqual(detectWatermark(img, alphaMaps), null);
    });
});
