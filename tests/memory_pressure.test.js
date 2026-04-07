import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { detectWatermark, resetDetectorBuffers } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';

describe('Memory Pressure & Pooling Tests (v1.7.0)', () => {

    before(() => {
        resetDetectorBuffers();
    });

    after(() => {
        resetDetectorBuffers();
    });

    test('Loop processing stability check', () => {
        const isStress = process.env.STRESS_TEST === 'true';
        const iterations = isStress ? 500 : 50;
        const width = isStress ? 1024 : 512;
        const height = isStress ? 1024 : 512;
        
        console.log(`Running memory test: ${iterations} iterations, ${width}x${height}`);

        const data = new Uint8ClampedArray(width * height * 4);
        data.fill(128); // Medium gray
        
        const imageData = { width, height, data };
        const alphaMap = new Float32Array(96 * 96);
        alphaMap.fill(0.5);
        const alphaMaps = { 96: alphaMap };
        
        const initialUsage = process.memoryUsage().heapUsed;
        
        for (let i = 0; i < iterations; i++) {
            // Detection
            detectWatermark(imageData, alphaMaps, { deepScan: true });
            
            // Removal (mock position)
            const pos = { x: 928, y: 928, width: 96, height: 96 };
            removeWatermark(imageData, alphaMap, pos);
            
            // Every 100 iterations, we check if we're exploding
            if (i % 100 === 0 && i > 0) {
                const curUsage = process.memoryUsage().heapUsed;
                const growth = (curUsage - initialUsage) / (1024 * 1024); // MB
                // If we leaked 60MB per image (size of one 4K buffer), 
                // we'd be at GBs by now. If pooling is working, it should be stable.
                assert.ok(growth < 50, `Memory growth too high: ${growth.toFixed(1)}MB at iteration ${i}`);
            }
        }
        
        const finalUsage = process.memoryUsage().heapUsed;
        const totalGrowth = (finalUsage - initialUsage) / (1024 * 1024);
        
        // Final sanity check
        assert.ok(totalGrowth < 100, `Final memory growth exceeded limit: ${totalGrowth.toFixed(1)}MB`);
    });
});
