import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { detectWatermark, resetDetectorBuffers } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';

function readPositiveIntEnv(name, fallback) {
    const value = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

describe('Memory Pressure & Pooling Tests (v1.7.0)', () => {

    before(() => {
        resetDetectorBuffers();
    });

    after(() => {
        resetDetectorBuffers();
    });

    test('Loop processing stability check', () => {
        const isStress = process.env.STRESS_TEST === 'true';
        const iterations = isStress ? readPositiveIntEnv('STRESS_ITERATIONS', 80) : 50;
        const width = isStress ? readPositiveIntEnv('STRESS_WIDTH', 512) : 512;
        const height = isStress ? readPositiveIntEnv('STRESS_HEIGHT', 512) : 512;
        
        console.log(`Running memory test: ${iterations} iterations, ${width}x${height}`);

        const data = new Uint8ClampedArray(width * height * 4);
        data.fill(128); // Medium gray
        
        const imageData = { width, height, data };
        const alphaMap = new Float32Array(96 * 96);
        alphaMap.fill(0.5);
        const alphaMaps = { 96: alphaMap };
        
        const initialUsage = process.memoryUsage().heapUsed;
        const checkInterval = Math.max(20, Math.floor(iterations / 4));
        
        for (let i = 0; i < iterations; i++) {
            // Detection
            detectWatermark(imageData, alphaMaps, { deepScan: true });
            
            // Removal (mock position)
            const pos = {
                x: Math.max(0, width - 96 - 32),
                y: Math.max(0, height - 96 - 32),
                width: 96,
                height: 96
            };
            removeWatermark(imageData, alphaMap, pos);
            
            if (i % checkInterval === 0 && i > 0) {
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
