import sharp from 'sharp';

async function run() {
    const o = await sharp('sample/other/c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_raw_b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const w1 = await sharp('sample/other/c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_5b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const w2 = await sharp('sample/other/c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_5b-2.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const width = o.info.width; const height = o.info.height;
    console.log(`Resolution: ${width}x${height}`);

    function find(data1, data2) {
        let minX = width, minY = height, maxX = 0, maxY = 0;
        let count = 0;
        for(let y=0; y<height; y++){
            for(let x=0; x<width; x++){
                const i = (y*width+x)*4;
                if(Math.abs(data1[i]-data2[i]) + Math.abs(data1[i+1]-data2[i+1]) + Math.abs(data1[i+2]-data2[i+2]) > 5){
                    if(x<minX) minX=x; if(y<minY) minY=y; if(x>maxX) maxX=x; if(y>maxY) maxY=y;
                    count++;
                }
            }
        }
        return count > 0 ? {minX, minY, maxX, maxY, w:maxX-minX+1, h:maxY-minY+1, MR: width-maxX-1, MB: height-maxY-1, ML: minX, MT: minY} : null;
    }

    console.log('5b vs Raw (TL):', find(w1.data, o.data));
    console.log('5b2 vs Raw (BR):', find(w2.data, o.data));
}
run();
