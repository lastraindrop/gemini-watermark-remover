import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';

describe('System Integration - Full Flow Simulation', () => {
    test('Simulate full unwatermarking process and verify output integrity', () => {
        // 1. Setup Environment
        const width = 1200, height = 1200;
        const originalColor = 100; // Original flat color
        const logoColor = 255;    // White logo
        const alphaValue = 0.5;   // 50% transparency logo
        
        // 2. 模拟配置与位置计算 (Architecture Flow Part 1)
        const config = detectWatermarkConfig(width, height);
        const pos = calculateWatermarkPosition(width, height, config);
        
        // 3. 构造具有水印的模拟数据 (Simulate input)
        // watermarked = alpha * logo + (1 - alpha) * original
        const watermarkedColor = Math.round(alphaValue * logoColor + (1 - alphaValue) * originalColor);
        
        const data = new Uint8ClampedArray(width * height * 4).fill(originalColor);
        // Add watermark area
        for (let r = 0; r < pos.height; r++) {
            for (let c = 0; c < pos.width; c++) {
                const idx = ((pos.y + r) * width + (pos.x + c)) * 4;
                data[idx] = data[idx+1] = data[idx+2] = watermarkedColor;
                data[idx+3] = 255;
            }
        }
        const watermarkedImage = { width, height, data: new Uint8ClampedArray(data) };

        // 4. 模拟背景图抽取 Alpha Map (Flow Part 2)
        // Simulate a solid white logo capture for the alpha map
        const bgData = new Uint8ClampedArray(pos.width * pos.height * 4).fill(255);
        // Actually, alpha map in Gemini is based on the logo's grayscale intensity
        // Here we simulate a uniform alpha mask derived from a white logo capture
        const alphaMap = calculateAlphaMap({ width: pos.width, height: pos.height, data: bgData });
        // Adjust alpha map to match our simulated alphaValue (assuming capture was normalized)
        for(let i=0; i<alphaMap.length; i++) alphaMap[i] = alphaValue;

        // 5. 执行核心算法整合 (Flow Part 3)
        removeWatermark(watermarkedImage, alphaMap, pos);

        // 6. 结果验证 (Verification)
        // Check center of the watermark area
        const centerX = pos.x + Math.floor(pos.width / 2);
        const centerY = pos.y + Math.floor(pos.height / 2);
        const checkIdx = (centerY * width + centerX) * 4;
        
        // Result: watermarked(178) -> original(100)
        // (178 - 0.5 * 255) / 0.5 = (178 - 127.5) * 2 = 50.5 * 2 = 101
        // (177.5 rounded to 178)
        assert.ok(Math.abs(watermarkedImage.data[checkIdx] - originalColor) <= 1, 
            `Integration Failure: Expected ~${originalColor}, but got ${watermarkedImage.data[checkIdx]}`);
            
        // Check corner outside watermark
        assert.strictEqual(watermarkedImage.data[0], originalColor, 'Spatial corruption detected outside watermark area');
    });
});
