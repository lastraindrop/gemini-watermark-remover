import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';
import { detectWatermark } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';

describe('Final Adversarial Stability Test', () => {

    // Realistic Alpha Map: Moderate alpha (0.1 - 0.6)
    const createAlphaMap = (size) => {
        const am = new Float32Array(size * size).fill(0);
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (Math.abs(r - c) <= 1 || Math.abs(r - (size - 1 - c)) <= 1) {
                    am[r * size + c] = 0.4; // Typical watermark alpha
                }
                if ((r % 12 === 0 && c % 12 === 0)) am[r * size + c] = 0.5;
            }
        }
        return am;
    };

    const alphaMaps = {
        48: createAlphaMap(48),
        96: createAlphaMap(96)
    };

    const runTrial = (width, height, id) => {
        const originalColor = 40 + (Math.random() * 160);
        const logoColor = 255;

        const config = detectWatermarkConfig(width, height);
        const refPos = calculateWatermarkPosition(width, height, config);
        const refAlphaMap = alphaMaps[config.logoSize];

        const data = new Uint8ClampedArray(width * height * 4).fill(originalColor);
        for (let r = 0; r < config.logoSize; r++) {
            for (let c = 0; c < config.logoSize; c++) {
                const a = refAlphaMap[r * config.logoSize + c];
                if (a === 0) continue;
                const px = refPos.x + c;
                const py = refPos.y + r;
                if (px < 0 || px >= width || py < 0 || py >= height) continue;
                const idx = (py * width + px) * 4;
                const val = Math.round(a * logoColor + (1 - a) * originalColor);
                data[idx] = data[idx+1] = data[idx+2] = val;
                data[idx+3] = 255;
            }
        }
        const img = { width, height, data };

        const detect = detectWatermark(img, alphaMaps);
        
        assert.ok(detect, `Trial ${id}: Detection failed for ${width}x${height}`);
        assert.strictEqual(detect.size, config.logoSize, `Trial ${id}: Size mismatch`);
        assert.strictEqual(detect.x, refPos.x, `Trial ${id}: X mismatch`);
        assert.strictEqual(detect.y, refPos.y, `Trial ${id}: Y mismatch`);

        removeWatermark(img, refAlphaMap, { x: detect.x, y: detect.y, width: detect.size, height: detect.size });
        for (let i = 0; i < 20; i++) {
            const r = Math.floor(Math.random() * config.logoSize);
            const c = Math.floor(Math.random() * config.logoSize);
            const idx = ((refPos.y + r) * width + (refPos.x + c)) * 4;
            // 2-pixel tolerance is reasonable for 8-bit color rounding
            assert.ok(Math.abs(img.data[idx] - originalColor) <= 2, `Pixel error at ${r},${c}`);
        }
    };

    // 20 Randomized trials
    for (let i = 0; i < 20; i++) {
        const w = Math.floor(Math.random() * 2000) + 400;
        const h = Math.floor(Math.random() * 2000) + 400;
        test(`Trial #${i+1} (${w}x${h})`, () => runTrial(w, h, i));
    }

    // Edge Cases
    test('Edge Case: 1024x1024', () => runTrial(1024, 1024, 'E1'));
    test('Edge Case: 1025x1025', () => runTrial(1025, 1025, 'E2'));
    test('Edge Case: Ultra-Wide', () => runTrial(3000, 400, 'E3'));
    test('Edge Case: Ultra-Tall', () => runTrial(400, 3000, 'E4'));
});
