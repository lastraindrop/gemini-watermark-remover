import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { detectWatermark } from '../src/core/detector.js';
import fs from 'fs';
import { PNG } from 'pngjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function __calculateCorrelation(imageData, x, y, size, alphaMap) {
    const data = imageData.data;
    const imgWidth = imageData.width;
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

function loadPNG(filepath) {
    return new Promise((resolve) => {
        fs.createReadStream(filepath)
            .pipe(new PNG())
            .on('parsed', function() {
                resolve({ data: this.data, width: this.width, height: this.height });
            });
    });
}

async function run() {
    const bg48 = await loadPNG(path.join(__dirname, '../assets/bg_48.png'));
    const bg96 = await loadPNG(path.join(__dirname, '../assets/bg_96.png'));
    
    const map48 = calculateAlphaMap(bg48);
    const map96 = calculateAlphaMap(bg96);

    // If real image is 96x96, how much does 48x48 correlate with it?
    let maxConf48 = 0;
    for(let y=0; y<=96-48; y+=2) {
        for(let x=0; x<=96-48; x+=2) {
            let conf = __calculateCorrelation(bg96, x, y, 48, map48);
            if(conf > maxConf48) maxConf48 = conf;
        }
    }

    // If real image is 48x48 (padded to 96x96), how much does 96x96 correlate with it?
    const padded48 = { data: new Uint8ClampedArray(96*96*4), width: 96, height: 96 };
    // Fill with empty background
    for(let i=0; i<padded48.data.length; i++) padded48.data[i] = 128;
    // Put 48x48 in the middle
    for(let y=0; y<48; y++) {
        for(let x=0; x<48; x++) {
            const dstIdx = ((y+24)*96 + (x+24))*4;
            const srcIdx = (y*48 + x)*4;
            padded48.data[dstIdx] = bg48.data[srcIdx];
            padded48.data[dstIdx+1] = bg48.data[srcIdx+1];
            padded48.data[dstIdx+2] = bg48.data[srcIdx+2];
            padded48.data[dstIdx+3] = bg48.data[srcIdx+3];
        }
    }
    
    let maxConf96 = __calculateCorrelation(padded48, 0, 0, 96, map96);

    console.log("Max CC of 48-template on 96-image: " + maxConf48);
    console.log("Max CC of 96-template on 48-image: " + maxConf96);
}
run();
