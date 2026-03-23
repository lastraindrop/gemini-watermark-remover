import { describe, it, expect } from 'vitest';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';

describe('Core Logic - alphaMap', () => {
    it('should correctly calculate alpha map from grayscale-like values', () => {
        const width = 2, height = 2;
        const data = new Uint8ClampedArray([
            255, 255, 255, 255, // White
            0, 0, 0, 255,       // Black
            128, 128, 128, 255, // Gray
            255, 0, 0, 255      // Red (alpha should be 1.0 based on max(r,g,b))
        ]);
        const imageData = { width, height, data };
        
        const alphaMap = calculateAlphaMap(imageData);
        
        expect(alphaMap).toBeInstanceOf(Float32Array);
        expect(alphaMap[0]).toBeCloseTo(1.0);
        expect(alphaMap[1]).toBeCloseTo(0.0);
        expect(alphaMap[2]).toBeCloseTo(128/255.0);
        expect(alphaMap[3]).toBeCloseTo(1.0);
    });
});

describe('Core Logic - blendModes (Safety Focus)', () => {
    it('should only modify pixels within the defined position', () => {
        const width = 10, height = 10;
        const originalData = new Uint8ClampedArray(width * height * 4).fill(100);
        const imageData = { width, height, data: new Uint8ClampedArray(originalData) };
        
        const alphaMapSize = 2;
        const alphaMap = new Float32Array(alphaMapSize * alphaMapSize).fill(0.5);
        const position = { x: 2, y: 2, width: alphaMapSize, height: alphaMapSize };
        
        removeWatermark(imageData, alphaMap, position);
        
        // Verify pixels outside position are UNTOUCHED
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const idx = (row * width + col) * 4;
                const isInPosition = row >= position.y && row < position.y + position.height &&
                                   col >= position.x && col < position.x + position.width;
                
                if (!isInPosition) {
                    expect(imageData.data[idx]).toBe(100);
                    expect(imageData.data[idx+1]).toBe(100);
                    expect(imageData.data[idx+2]).toBe(100);
                    expect(imageData.data[idx+3]).toBe(100);
                }
            }
        }
    });

    it('should correctly solve reverse alpha blending for known values', () => {
        const alpha = 0.5; // 50% transparency
        const logo = 255;  // White logo
        const original = 100;
        // watermarked = alpha * logo + (1 - alpha) * original
        // watermarked = 0.5 * 255 + 0.5 * 100 = 127.5 + 50 = 177.5 (~178)
        const watermarked = Math.round(alpha * logo + (1 - alpha) * original);
        
        const imageData = { 
            width: 1, height: 1, 
            data: new Uint8ClampedArray([watermarked, watermarked, watermarked, 255]) 
        };
        const alphaMap = new Float32Array([alpha]);
        const position = { x: 0, y: 0, width: 1, height: 1 };
        
        removeWatermark(imageData, alphaMap, position);
        
        expect(imageData.data[0]).toBeCloseTo(original, 0);
    });
});
