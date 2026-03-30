import sharp from 'sharp';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function findDiff(ori, fin, filename) {
    const imgOri = sharp(ori);
    const imgFin = sharp(fin);
    
    const metaOri = await imgOri.metadata();
    const metaFin = await imgFin.metadata();
    
    if (metaOri.width !== metaFin.width || metaOri.height !== metaFin.height) {
        console.log(`${filename}: Dimension mismatch!`);
        return;
    }

    const bufOri = await imgOri.ensureAlpha().raw().toBuffer();
    const bufFin = await imgFin.ensureAlpha().raw().toBuffer();
    
    let diffs = [];
    const width = metaOri.width;
    const height = metaOri.height;
    
    for (let i = 0; i < bufOri.length; i += 4) {
        const dr = Math.abs(bufOri[i] - bufFin[i]);
        const dg = Math.abs(bufOri[i+1] - bufFin[i+1]);
        const db = Math.abs(bufOri[i+2] - bufFin[i+2]);
        if (dr > 1 || dg > 1 || db > 1) {
            const idx = i / 4;
            diffs.push({ x: idx % width, y: Math.floor(idx / width) });
        }
    }

    if (diffs.length === 0) {
        console.log(`${filename}: No difference found!`);
        return;
    }

    // Find bounding box of differences
    let minX = width, maxX = 0, minY = height, maxY = 0;
    diffs.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    console.log(`${filename}: Diff Box -> x: ${minX}, y: ${minY}, w: ${maxX - minX + 1}, h: ${maxY - minY + 1}`);
    console.log(`Margins from bottom-right: x_margin: ${width - maxX - 1}, y_margin: ${height - maxY - 1}`);
}

async function run() {
    const files = [
        'Gemini_Generated_Image_37qym837qym837qy.png',
        'Gemini_Generated_Image_kvpuhxkvpuhxkvpu.png',
        'Gemini_Generated_Image_93bvnk93bvnk93bv.png'
    ];

    for (const file of files) {
        const ori = resolve(__dirname, '../test_sample/ori', file);
        const fin = resolve(__dirname, '../test_sample/fin', file);
        await findDiff(ori, fin, file);
    }
}

run().catch(console.error);
