import sharp from 'sharp';

async function run() {
    // 1536x2727 samples (5b)
    const i_tl_w = await sharp('sample/other/c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_5b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const i_raw = await sharp('sample/other/c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_raw_b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const i_br_w = await sharp('sample/other/c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_5b-2.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const width = 1536;

    async function solve(wData, oData, loc, width, outName) {
        const w = loc.maxX - loc.minX + 1;
        const h = loc.maxY - loc.minY + 1;
        const alphaMap = new Uint8ClampedArray(w * h * 4);
        for (let y = loc.minY; y <= loc.maxY; y++) {
            for (let x = loc.minX; x <= loc.maxX; x++) {
                const i = (y * width + x) * 4;
                const mi = ((y - loc.minY) * w + (x - loc.minX)) * 4;
                let maxA = 0;
                for (let c = 0; c < 3; c++) {
                    if (oData[i+c] < 240) {
                        const a = (wData[i+c] - oData[i+c]) / (255 - oData[i+c]);
                        if (a > maxA) maxA = a;
                    }
                }
                let boxA = 0;
                for (let c = 0; c < 3; c++) {
                    if (oData[i+c] > 50) {
                        const a = (oData[i+c] - wData[i+c]) / oData[i+c];
                        if (a > boxA) boxA = a;
                    }
                }
                const finalA = Math.max(maxA, boxA);
                const val = Math.round(Math.min(255, finalA * 255));
                alphaMap[mi] = val; alphaMap[mi+1] = val; alphaMap[mi+2] = val; alphaMap[mi+3] = 255;
            }
        }
        await sharp(alphaMap, {raw:{width:w, height:h, channels:4}}).png().toFile(outName);
        console.log(`Extracted: ${outName} (${w}x${h})`);
    }

    // 5b vs Raw (TL): { minX: 16, minY: 16, maxX: 236, maxY: 124, w: 221, h: 109 }
    // 5b2 vs Raw (BR): { minX: 1250, minY: 2600, maxX: 1525, maxY: 2724, w: 276, h: 125 }
    await solve(i_tl_w.data, i_raw.data, {minX:16, minY:16, maxX:236, maxY:124}, width, 'src/assets/bg_doubao_tl_tall.png');
    await solve(i_br_w.data, i_raw.data, {minX:1250, minY:2600, maxX:1525, maxY:2724}, width, 'src/assets/bg_doubao_br_tall.png');
}
run();
