import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';
import { detectWatermark } from '../src/core/detector.js';

describe('Integration Tests - High Fidelity Simulations', () => {
    
    const runSimulation = (usePixelDetect) => {
        const width = 1200, height = 1200;
        const originalColor = usePixelDetect ? 30 : 100; // Use darker background for pixel detect to pass 0.6 threshold
        const alphaValue = 0.6;
        const logoColor = 255;

        // 1. Prepare Watermark Info
        const config = detectWatermarkConfig(width, height);
        const refPos = calculateWatermarkPosition(width, height, config);
        
        // 2. Prepare Alpha Map (Mock logo capture)
        const alphaMapData = new Uint8ClampedArray(config.logoSize * config.logoSize * 4).fill(0);
        const alphaMap = new Float32Array(config.logoSize * config.logoSize);
        // Create a simple cross shape for the logo
        for (let i = 0; i < config.logoSize; i++) {
            const idx1 = i * config.logoSize + i;
            const idx2 = i * config.logoSize + (config.logoSize - 1 - i);
            alphaMap[idx1] = alphaMap[idx2] = alphaValue;
        }

        // 3. Create Watermarked Image
        const data = new Uint8ClampedArray(width * height * 4).fill(originalColor);
        for (let r = 0; r < config.logoSize; r++) {
            for (let c = 0; c < config.logoSize; c++) {
                const a = alphaMap[r * config.logoSize + c];
                if (a === 0) continue;
                const idx = ((refPos.y + r) * width + (refPos.x + c)) * 4;
                const val = Math.round(a * logoColor + (1 - a) * originalColor);
                data[idx] = data[idx+1] = data[idx+2] = val;
                data[idx+3] = 255;
            }
        }
        const img = { width, height, data };

        // 4. Execution Flow
        let targetPos, targetAlpha;
        if (usePixelDetect) {
            const alphaMaps = { 
                48: new Float32Array(48*48), 
                96: new Float32Array(96*96) 
            };
            alphaMaps[config.logoSize] = alphaMap;

            const detect = detectWatermark(img, alphaMaps);
            assert.ok(detect, 'Pixel detection failed in integration test');
            targetPos = { x: detect.x, y: detect.y, width: detect.size, height: detect.size };
            targetAlpha = alphaMap;
        } else {
            targetPos = refPos;
            targetAlpha = alphaMap;
        }

        removeWatermark(img, targetAlpha, targetPos);

        // 5. Verification
        // Check a point on the cross
        const testX = refPos.x + 10;
        const testY = refPos.y + 10;
        const checkIdx = (testY * width + testX) * 4;
        assert.ok(Math.abs(img.data[checkIdx] - originalColor) <= 2, `Value at (${testX},${testY}) is ${img.data[checkIdx]}, expected ~${originalColor}`);
    };

    test('Full Flow: Standard Config-based path', () => runSimulation(false));
    test('Full Flow: Robust Pixel-based path', () => runSimulation(true));
});
