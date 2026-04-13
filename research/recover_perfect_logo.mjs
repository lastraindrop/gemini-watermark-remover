import sharp from 'sharp';

async function run() {
    const i1 = await sharp('sample/other/b53f8dbf6fe1448c9f902d49030cbd80.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const i2 = await sharp('sample/other/b53f8dbf6fe1448c9f902d49030cbd80.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b2.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const width = i1.info.width;
    console.log(`Resolution: ${width}x${i1.info.height}`);

    async function extract(wData, oData, loc, outPrefix) {
        const w = loc.maxX - loc.minX + 1;
        const h = loc.maxY - loc.minY + 1;
        const alphaBuf = new Uint8ClampedArray(w * h);
        const rgbBuf = new Uint8ClampedArray(w * h * 3);

        for (let y = loc.minY; y <= loc.maxY; y++) {
            for (let x = loc.minX; x <= loc.maxX; x++) {
                const i = (y * width + x) * 4;
                const mi = (y - loc.minY) * w + (x - loc.minX);
                
                // Solve for a and L
                // w = a*L + (1-a)*o  =>  Delta = w - o = a*(L - o)
                // We have one pixel. We assume L is the same for all channels? No.
                // Let's assume L is white or black.
                // For Doubao, let's assume L is fixed.
                
                let maxA = 0;
                for (let c = 0; c < 3; c++) {
                    const diff = wData[i + c] - oData[i + c];
                    // If diff > 0, L must be > o. If diff < 0, L must be < o.
                    // This is hard with one sample. 
                    // But we can approximate a by assuming L is 255 or 0.
                }
                
                // Actually, I'll just save the DELTA as a 4-channel image (RGB + Alpha)
                // where Alpha is the overall intensity of the change.
                const dr = wData[i] - oData[i];
                const dg = wData[i+1] - oData[i+1];
                const db = wData[i+2] - oData[i+2];
                const da = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
                
                alphaBuf[mi] = Math.min(255, da * 2); // Boost it for visibility
            }
        }
        await sharp(alphaBuf, {raw:{width:w, height:h, channels:1}}).png().toFile(`${outPrefix}_mask.png`);
    }

    // Coordinates for TL in 2048x2048 (b53f samples are 2048x2048 likely)
    // Let's find them precisely
    function findBounds(d1, d2, xS, yS, xE, yE) {
        let minX=width, minY=i1.info.height, maxX=0, maxY=0;
        for(let y=yS; y<yE; y++) for(let x=xS; x<xE; x++) {
            const i=(y*width+x)*4;
            if(Math.abs(d1[i]-d2[i])>10) {
                if(x<minX) minX=x; if(y<minY) minY=y; if(x>maxX) maxX=x; if(y>maxY) maxY=y;
            }
        }
        return {minX, minY, maxX, maxY};
    }

    const locTL = findBounds(i1.data, i2.data, 0, 0, width/2, i1.info.height/2);
    const locBR = findBounds(i1.data, i2.data, width/2, i1.info.height/2, width, i1.info.height);

    console.log('TL Bounds:', locTL);
    console.log('BR Bounds:', locBR);

    await extract(i1.data, i2.data, locTL, 'src/assets/doubao_tl_refined');
    await extract(i2.data, i1.data, locBR, 'src/assets/doubao_br_refined');
}
run();
