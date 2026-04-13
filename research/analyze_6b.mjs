import sharp from 'sharp';

async function run() {
    const o = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_raw_b.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const w = await sharp('sample/other/6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b-2.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const width = o.info.width; const height = o.info.height;

    function findInRect(xStart, yStart, xEnd, yEnd) {
        let minX = width, minY = height, maxX = 0, maxY = 0;
        let count = 0;
        for(let y=Math.floor(yStart); y<Math.floor(yEnd); y++){
            for(let x=Math.floor(xStart); x<Math.floor(xEnd); x++){
                const i = (y*width+x)*4;
                if(Math.abs(o.data[i]-w.data[i]) + Math.abs(o.data[i+1]-w.data[i+1]) + Math.abs(o.data[i+2]-w.data[i+2]) > 5){
                    if(x<minX) minX=x; if(y<minY) minY=y; if(x>maxX) maxX=x; if(y>maxY) maxY=y;
                    count++;
                }
            }
        }
        return count > 0 ? {minX, minY, maxX, maxY, width: maxX-minX+1, height: maxY-minY+1, marginRight: width-maxX-1, marginBottom: height-maxY-1} : null;
    }

    console.log('TL:', findInRect(0, 0, width/2, height/2));
    console.log('BR:', findInRect(width/2, height/2, width, height));
}
run();
