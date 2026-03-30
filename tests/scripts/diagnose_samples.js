import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { detectWatermark } from '../src/core/detector.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from '../src/core/config.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BG_48_PATH = resolve(__dirname, '../src/assets/bg_48.png');
const BG_96_PATH = resolve(__dirname, '../src/assets/bg_96.png');

async function getAlphaMap(path) {
    const { data, info } = await sharp(path)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return calculateAlphaMap({
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data)
    });
}

// Modify detector.js to export more info? No, I'll just re-implement a diagnostic version or use the existing one if I can.
// Actually, I'll copy the detectWatermark logic but add logging.

function diagnose(imageData, alphaMaps, filename) {
    const { width, height } = imageData;
    const config = detectWatermarkConfig(width, height);
    const sizes = [96, 48];
    
    console.log(`\n--- Diagnosing: ${filename} (${width}x${height}) ---`);
    console.log(`Expected Config: size=${config.logoSize}, marginX=${config.marginRight}, marginY=${config.marginBottom}`);

    const allCandidates = [];
    const searchRangeX = Math.floor(width * 0.40);
    const searchRangeY = Math.floor(height * 0.40);
    
    for (const size of sizes) {
        const alphaMap = alphaMaps[size];
        const startX = Math.max(0, width - searchRangeX - size);
        const startY = Math.max(0, height - searchRangeY - size);
        const sizeCandidates = [];

        // Simple Stage 1 to find some hits
        for (let y = startY; y < height - size; y += 4) { // Faster step for diag
            for (let x = startX ; x < width - size; x += 4) {
                const confidence = calculateCorrelation(imageData, x, y, size, alphaMap);
                if (confidence > 0.3) {
                    sizeCandidates.push({ x, y, size, confidence });
                }
            }
        }
        
        sizeCandidates.sort((a,b) => b.confidence - a.confidence);
        const top = sizeCandidates.slice(0, 5);
        if (top.length > 0) {
            console.log(`Top candidates for size ${size}:`);
            top.forEach(c => {
                const mx = width - c.x - size;
                const my = height - c.y - size;
                console.log(`  Confidence: ${c.confidence.toFixed(4)} at (${c.x}, ${c.y}), margins: (${mx}, ${my})`);
            });
        } else {
            console.log(`No candidates found for size ${size} (threshold 0.3)`);
        }
    }
}

function calculateCorrelation(imageData, x, y, size, alphaMap) {
    const { data, width: imgWidth } = imageData;
    const step = 2;
    let sumI = 0, sumI2 = 0, sumA = 0, sumA2 = 0, sumIA = 0, count = 0;
    
    for (let row = 0; row < size; row += step) {
        const imgRowOffset = (y + row) * imgWidth + x;
        const alphaRowOffset = row * size;
        for (let col = 0; col < size; col += step) {
            const imgIdx = (imgRowOffset + col) << 2;
            const brightness = Math.max(data[imgIdx], data[imgIdx + 1], data[imgIdx + 2]) / 255.0;
            const alpha = alphaMap[alphaRowOffset + col];
            sumI += brightness;
            sumI2 += brightness * brightness;
            sumA += alpha;
            sumA2 += alpha * alpha;
            sumIA += brightness * alpha;
            count++;
        }
    }
    const varI = count * sumI2 - sumI * sumI;
    const varA = count * sumA2 - sumA * sumA;
    if (varI <= 0 || varA <= 0) return 0;
    const denom = Math.sqrt(varI * varA);
    return (count * sumIA - sumI * sumA) / denom;
}

async function run() {
    const maps = {
        48: await getAlphaMap(BG_48_PATH),
        96: await getAlphaMap(BG_96_PATH)
    };

    const files = [
        'Gemini_Generated_Image_37qym837qym837qy.png',
        'Gemini_Generated_Image_kvpuhxkvpuhxkvpu.png',
        'Gemini_Generated_Image_93bvnk93bvnk93bv.png'
    ];

    for (const file of files) {
        const path = resolve(__dirname, '../test_sample/ori', file);
        const image = sharp(path);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const imageData = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer) };
        diagnose(imageData, maps, file);
    }
}

run().catch(console.error);
