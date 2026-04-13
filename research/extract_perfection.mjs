import sharp from 'sharp';

async function run() {
    // 2730x1535 samples (6b) - THE BEST ONES
    const i_tl_w = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const i_raw = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_raw_b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const i_br_w = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b-2.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});

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
                alphaMap[mi] = val;
                alphaMap[mi+1] = val;
                alphaMap[mi+2] = val;
                alphaMap[mi+3] = 255;
            }
        }
        await sharp(alphaMap, {raw:{width:w, height:h, channels:4}}).png().toFile(outName);
        console.log(`Extracted: ${outName} (${w}x${h})`);
    }

    await solve(i_tl_w.data, i_raw.data, {minX:38, minY:25, maxX:344, maxY:191}, i_tl_w.info.width, 'src/assets/bg_doubao_tl.png');
    await solve(i_br_w.data, i_raw.data, {minX:2305, minY:1352, maxX:2705, maxY:1524}, i_br_w.info.width, 'src/assets/bg_doubao_br.png');
}
run();
