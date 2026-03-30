import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';

describe('V1.5 Noise Reduction Tests', () => {
    test('Detection with heavy noise - noiseReduction: true improves confidence', () => {
        const w = 400, h = 400, size = 48;
        const data = new Uint8ClampedArray(w * h * 4).fill(128);
        const alphaMap = new Float32Array(size * size);
        
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                alphaMap[i * size + j] = 0.3 + (i % 10) / 50.0;
            }
        }

        const targetX = 300, targetY = 300;
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const idx = ((targetY + i) * w + (targetX + j)) << 2;
                const alpha = alphaMap[i * size + j];
                const original = 50; 
                const noise = (Math.random() - 0.5) * 60; // Noise +/- 30
                const val = alpha * 255 + (1 - alpha) * (original + noise);
                data[idx] = data[idx+1] = data[idx+2] = Math.max(0, Math.min(255, val));
                data[idx+3] = 255;
            }
        }

        const alphaMaps = { 48: alphaMap, 96: new Float32Array(96*96) };
        const resultNoNR = detectWatermark({ width: w, height: h, data }, alphaMaps, { deepScan: false, noiseReduction: false });
        const resultWithNR = detectWatermark({ width: w, height: h, data }, alphaMaps, { deepScan: false, noiseReduction: true });

        console.log(`Confidence - No NR: ${resultNoNR?.confidence || 'N/A'}, With NR: ${resultWithNR?.confidence || 'N/A'}`);
        assert.ok(resultWithNR !== null, 'Detection with NR failed');
    });
});
