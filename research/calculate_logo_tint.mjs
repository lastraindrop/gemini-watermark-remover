import sharp from 'sharp';

async function run() {
    const o = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_raw_b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const w = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b-2.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const width = o.info.width;
    const loc = {minX:2305, minY:1352, maxX:2705, maxY:1524};

    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    for (let y = loc.minY; y <= loc.maxY; y++) {
        for (let x = loc.minX; x <= loc.maxX; x++) {
            const i = (y * width + x) * 4;
            // Find pixels where alpha is high (text areas)
            const diff = w.data[i] - o.data[i];
            if (diff > 50) {
                 // assume a is roughly 0.5?
                 // Let's use proportional alpha: a = diff / (255 - o)
                 const a = (w.data[i] - o.data[i]) / (255 - o.data[i]);
                 if (a > 0.3) {
                     const r = (w.data[i] - (1-a)*o.data[i])/a;
                     const g = (w.data[i+1] - (1-a)*o.data[i+1])/a;
                     const b = (w.data[i+2] - (1-a)*o.data[i+2])/a;
                     sumR += r; sumG += g; sumB += b; count++;
                 }
            }
        }
    }
    console.log({ r: sumR/count, g: sumG/count, b: sumB/count });
}
run();
