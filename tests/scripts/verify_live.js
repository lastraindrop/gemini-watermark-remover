import sharp from 'sharp';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function verify(live, fin, filename) {
    const imgLive = sharp(live);
    const imgFin = sharp(fin);
    
    const bufLive = await imgLive.ensureAlpha().raw().toBuffer();
    const bufFin = await imgFin.ensureAlpha().raw().toBuffer();
    
    let diffCount = 0;
    for (let i = 0; i < bufLive.length; i += 4) {
        if (Math.abs(bufLive[i] - bufFin[i]) > 2 || 
            Math.abs(bufLive[i+1] - bufFin[i+1]) > 2 || 
            Math.abs(bufLive[i+2] - bufFin[i+2]) > 2) {
            diffCount++;
        }
    }
    
    const percentage = (diffCount / (bufLive.length / 4) * 100).toFixed(4);
    console.log(`${filename}: Diff Pixels: ${diffCount} (${percentage}%)`);
}

async function run() {
    const files = [
        'Gemini_Generated_Image_37qym837qym837qy.png',
        'Gemini_Generated_Image_kvpuhxkvpuhxkvpu.png'
    ];

    for (const file of files) {
        const live = resolve(__dirname, '../test_output/live_v131', `unwatermarked_${file}`);
        const fin = resolve(__dirname, '../test_sample/fin', file);
        await verify(live, fin, file);
    }
}

run().catch(console.error);
