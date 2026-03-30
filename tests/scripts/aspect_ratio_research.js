import { detectWatermarkConfig } from '../src/core/config.js';
import { detectWatermark } from '../src/core/detector.js';

const mockAlphaMaps = {
    48: new Float32Array(48 * 48).map((_, i) => (i % 7) / 10 + 0.2),
    96: new Float32Array(96 * 96).map((_, i) => (i % 13) / 15 + 0.1)
};

function runSimulation(w, h, actualSize) {
    const config = detectWatermarkConfig(w, h);
    const targetX = w - 32 - actualSize;
    const targetY = h - 32 - actualSize;
    
    // Create image with actual watermark
    const data = new Uint8ClampedArray(w * h * 4).fill(100);
    const alphaMap = mockAlphaMaps[actualSize];
    for (let r = 0; r < actualSize; r++) {
        for (let c = 0; c < actualSize; c++) {
            const a = alphaMap[r * actualSize + c];
            const idx = ((targetY + r) * w + (targetX + c)) * 4;
            const val = Math.round(a * 255 + (1 - a) * 100);
            data[idx] = data[idx+1] = data[idx+2] = val;
            data[idx+3] = 255;
        }
    }
    
    // Add some noise to the "wrong" size area to see if bias causes a false positive
    // For example, if actual is 48, add 96px noise
    const wrongSize = actualSize === 48 ? 96 : 48;
    const noiseX = w - 64 - wrongSize;
    const noiseY = h - 64 - wrongSize;
    for (let r = 0; r < wrongSize; r++) {
        for (let c = 0; c < wrongSize; c++) {
            const idx = ((noiseY + r) * w + (noiseX + c)) * 4;
            // Noise that slightly resembles the alpha map but isn't a perfect match
            const val = 120 + (Math.random() * 20); 
            data[idx] = data[idx+1] = data[idx+2] = val;
        }
    }

    const result = detectWatermark({ width: w, height: h, data }, mockAlphaMaps);
    return {
        size: w + 'x' + h,
        predicted: config.logoSize,
        actual: actualSize,
        detected: result ? result.size : 'NONE',
        confidence: result ? result.confidence.toFixed(4) : 0,
        correct: result && result.size === actualSize
    };
}

const scenarios = [
    [800, 600, 48],
    [1024, 1024, 48],
    [1025, 1025, 96],
    [1589, 672, 48],   // User case
    [2000, 500, 48],   // Ultra-wide
    [500, 2000, 48],   // Ultra-tall
    [2000, 2000, 96],  // Giant
    [1280, 720, 48],   // 720p (was 96 in v1.2, now 48)
    [1920, 1080, 96]   // 1080p
];

console.log('Size | Predicted | Actual | Detected | Confidence | Correct');
console.log('-----|-----------|--------|----------|------------|--------');
scenarios.forEach(([w, h, actual]) => {
    const res = runSimulation(w, h, actual);
    console.log(`${res.size.padEnd(10)} | ${res.predicted}px | ${res.actual}px | ${res.detected}px | ${res.confidence} | ${res.correct ? '✅' : '❌'}`);
});
