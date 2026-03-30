import { test, describe } from 'node:test';
import assert from 'node:assert';
import { removeWatermark } from '../src/core/blendModes.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Blend Modes Logic - Precision & Boundaries', () => {
    
    test('Pixel reconstruction accuracy (Standard α=0.5)', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0.5);
        const originalColor = 100;
        const img = createMockImageData(100, 100, 'solid', originalColor);
        
        // Apply: 0.5 * 255 + 0.5 * 100 = 127.5 + 50 = 177.5 -> 178
        applyWatermark(img, 10, 10, size, alphaMap);
        
        const pos = { x: 10, y: 10, width: size, height: size };
        removeWatermark(img, alphaMap, pos);
        
        const idx = (11 * 100 + 11) << 2;
        const result = img.data[idx];
        // Expected: 100. Tolerance ±2 for rounding.
        assert.ok(Math.abs(result - originalColor) <= 2, `Expected ~100, got ${result}`);
    });

    test('Zero Alpha pixels should remain unchanged', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0);
        const img = createMockImageData(100, 100, 'solid', 150);
        const originalData = new Uint8ClampedArray(img.data);
        
        const pos = { x: 10, y: 10, width: size, height: size };
        removeWatermark(img, alphaMap, pos);
        
        assert.deepStrictEqual(img.data, originalData);
    });

    test('Boundary safety: Negative coordinates', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0.5);
        const img = createMockImageData(100, 100, 'solid', 128);
        const originalData = new Uint8ClampedArray(img.data);
        
        // Standard position: overflow left/top
        const pos = { x: -10, y: -10, width: size, height: size };
        // Should not crash and should skip pixels outside [0, 100)
        assert.doesNotThrow(() => removeWatermark(img, alphaMap, pos));
        
        // Pixels at (0,0) should have been processed
        const idx = (0 * 100 + 0) << 2;
        assert.notStrictEqual(img.data[idx], originalData[idx]);
    });

    test('Extreme Alpha tolerance (MAX_ALPHA ≈ 0.98)', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0.98);
        const originalColor = 50;
        const img = createMockImageData(100, 100, 'solid', originalColor);
        
        applyWatermark(img, 0, 0, size, alphaMap);
        const pos = { x: 0, y: 0, width: size, height: size };
        removeWatermark(img, alphaMap, pos);
        
        const result = img.data[0];
        // High alpha is very sensitive, tolerance ±15 is reasonable for 98% alpha
        assert.ok(Math.abs(result - originalColor) <= 15, `High alpha recovery: expected ~50, got ${result}`);
    });

    test('Multi-channel independence', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0.5);
        const img = createMockImageData(10, 10, 'solid', 0);
        
        // Set specific color (R=100, G=150, B=200)
        const idx = (5 * 10 + 5) << 2;
        img.data[idx] = 100;
        img.data[idx+1] = 150;
        img.data[idx+2] = 200;
        
        const originalColors = [100, 150, 200];
        applyWatermark(img, 0, 0, 10, alphaMap);
        
        const pos = { x: 0, y: 0, width: 10, height: 10 };
        removeWatermark(img, alphaMap, pos);
        
        assert.ok(Math.abs(img.data[idx] - originalColors[0]) <= 2);
        assert.ok(Math.abs(img.data[idx+1] - originalColors[1]) <= 2);
        assert.ok(Math.abs(img.data[idx+2] - originalColors[2]) <= 2);
    });
});
