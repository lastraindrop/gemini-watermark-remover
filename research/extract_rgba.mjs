import sharp from 'sharp';

async function run() {
    // 2730x1535 samples
    const w_tl = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const o_tl = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_raw_b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    
    const w_br = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b-2.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const o_br = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_raw_b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});

    async function extract(wData, oData, loc, width, outName) {
        const w = loc.maxX - loc.minX + 1;
        const h = loc.maxY - loc.minY + 1;
        const rgba = new Uint8ClampedArray(w * h * 4);

        for (let y = loc.minY; y <= loc.maxY; y++) {
            for (let x = loc.minX; x <= loc.maxX; x++) {
                const i = (y * width + x) * 4;
                const mi = ((y - loc.minY) * w + (x - loc.minX)) * 4;

                // Solve w = a*L + (1-a)*o
                // Delta = w - o = a*(L - o)
                // We assume L is constant for Text (white) and Box (dark).
                // Actually, let's just solve for "a" assuming L is (255, 255, 255) for white text
                // and L is (24, 24, 24) or so for the box? 
                
                // Simplified: use max delta to estimate alpha, and then estimate L.
                let maxDiff = 0;
                for(let c=0; c<3; c++) {
                    const d = Math.abs(wData[i+c] - oData[i+c]);
                    if(d > maxDiff) maxDiff = d;
                }

                // If delta is high, it's either white text or dark box.
                // Let's assume a "Pure Mask" approach:
                // a = |w - o| / |L - o|
                // This is still hard.
                
                // BETTER: Just save the COLOR of the watermark by subtracting the background
                // and normalizing by an estimated alpha.
                // Or easier: Just save the DELTA as a signed signal? No.
                
                // Let's just save the WATERMARKED patch as a template!
                // Since the background was blue sky / gray bridge, it's a good enough template.
                rgba[mi] = wData[i];
                rgba[mi+1] = wData[i+1];
                rgba[mi+2] = wData[i+2];
                rgba[mi+3] = 255; 
            }
        }
        await sharp(rgba, {raw:{width:w, height:h, channels:4}}).png().toFile(outName);
    }

    await extract(w_tl.data, o_tl.data, {minX:38, minY:25, maxX:344, maxY:191}, w_tl.info.width, 'src/assets/doubao_tl_2k_tpl.png');
    await extract(w_br.data, o_br.data, {minX:2305, minY:1352, maxX:2705, maxY:1524}, w_br.info.width, 'src/assets/doubao_br_2k_tpl.png');
}
run();
