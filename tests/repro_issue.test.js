import { test } from 'node:test';
import assert from 'node:assert';
import { detectWatermarkConfig } from '../src/core/config.js';
import { detectWatermark } from '../src/core/detector.js';

test('Reproduction: 1589x672 should use 48px watermark according to user report', () => {
    const w = 1589;
    const h = 672;
    const config = detectWatermarkConfig(w, h);
    
    console.log(`Current config for ${w}x${h}: ${config.logoSize}px`);
    // This should now pass
    assert.strictEqual(config.logoSize, 48, 'Should use 48px for 1589x672');
});

test('Reproduction: Detection with 48px watermark on 1589x672 image', () => {
    const w = 1589, h = 672;
    const size = 48;
    const targetX = w - 32 - size; 
    const targetY = h - 32 - size;
    
    // Create a noisy alpha map (variance > 0)
    const alphaMap48 = new Float32Array(48 * 48);
    for (let i = 0; i < alphaMap48.length; i++) alphaMap48[i] = (i % 7) / 10.0 + 0.2;
    
    const alphaMap96 = new Float32Array(96 * 96);
    for (let i = 0; i < alphaMap96.length; i++) alphaMap96[i] = (i % 13) / 15.0 + 0.1;

    // Mock image data with 48px watermark blended in
    const data = new Uint8ClampedArray(w * h * 4).fill(100); 
    const logoColor = 255;
    const bgColor = 100;
    
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const alpha = alphaMap48[r * size + c];
            const idx = ((targetY + r) * w + (targetX + c)) * 4;
            const val = Math.round(alpha * logoColor + (1 - alpha) * bgColor);
            data[idx] = data[idx+1] = data[idx+2] = val;
            data[idx+3] = 255;
        }
    }
    
    const img = { width: w, height: h, data };
    const alphaMaps = { 48: alphaMap48, 96: alphaMap96 };
    
    const result = detectWatermark(img, alphaMaps);
    
    if (result) {
        console.log(`Detected: ${result.size}px at (${result.x}, ${result.y}) with confidence ${result.confidence.toFixed(4)}`);
        assert.strictEqual(result.size, 48, 'Should detect 48px watermark even if config says 96');
    } else {
        console.log('Detection failed completely');
        assert.ok(result, 'Should detect something');
    }
});
