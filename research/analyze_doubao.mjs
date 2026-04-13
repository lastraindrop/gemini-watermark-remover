import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

async function analyze() {
    const watermarkedPath = 'sample/v2-5e9ce569399fc173e2afa85ecbfa56f3_r.png';
    const originalPath = 'sample/v2-c1e77438152417b175a2e130a80e2f77_r.png';
    
    const [wmk, org] = await Promise.all([
        sharp(watermarkedPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        sharp(originalPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    ]);
    
    const { width, height } = wmk.info;
    const wData = wmk.data;
    const oData = org.data;
    
    // 1. Detect bounding box of difference (search bottom-right)
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const diffThreshold = 5;
    
    for (let y = height / 2; y < height; y++) {
        for (let x = width / 2; x < width; x++) {
            const idx = (y * width + x) * 4;
            const diff = Math.abs(wData[idx] - oData[idx]) + 
                         Math.abs(wData[idx+1] - oData[idx+1]) + 
                         Math.abs(wData[idx+2] - oData[idx+2]);
            
            if (diff > diffThreshold) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    console.log(`Detected Watermark Bounding Box: [${minX}, ${minY}] to [${maxX}, ${maxY}]`);
    console.log(`Size: ${maxX - minX + 1}x${maxY - minY + 1}`);
    
    // 2. Extract Alpha Map
    // Formula: wmk = (1-a)*org + a*logo  => a = (wmk - org) / (logo - org)
    // Assume logo is white (255, 255, 255)
    const logoR = 255, logoG = 255, logoB = 255;
    
    const maskWidth = maxX - minX + 11; // add padding
    const maskHeight = maxY - minY + 11;
    const startX = Math.max(0, minX - 5);
    const startY = Math.max(0, minY - 5);
    
    const alphaBuffer = Buffer.alloc(maskWidth * maskHeight * 4);
    
    for (let y = 0; y < maskHeight; y++) {
        for (let x = 0; x < maskWidth; x++) {
            const gx = startX + x;
            const gy = startY + y;
            if (gx >= width || gy >= height) continue;
            
            const gIdx = (gy * width + gx) * 4;
            const mIdx = (y * maskWidth + x) * 4;
            
            // Channel-wise alpha estimate
            const getAlpha = (w, o, l) => {
                const num = w - o;
                const den = l - o;
                if (Math.abs(den) < 10) return 0; // Avoid division by zero/low contrast
                return Math.max(0, Math.min(1, num / den));
            };
            
            const ar = getAlpha(wData[gIdx], oData[gIdx], logoR);
            const ag = getAlpha(wData[gIdx+1], oData[gIdx+1], logoG);
            const ab = getAlpha(wData[gIdx+2], oData[gIdx+2], logoB);
            
            let a = (ar + ag + ab) / 3;
            // Boost visibility for mask extraction
            const alphaByte = Math.round(a * 255);
            
            alphaBuffer[mIdx] = logoR;
            alphaBuffer[mIdx+1] = logoG;
            alphaBuffer[mIdx+2] = logoB;
            alphaBuffer[mIdx+3] = alphaByte;
        }
    }
    
    const outputPath = 'sample/extracted_doubao_mask.png';
    await sharp(alphaBuffer, { raw: { width: maskWidth, height: maskHeight, channels: 4 } })
        .png()
        .toFile(outputPath);
    
    console.log(`Saved extracted mask to: ${outputPath}`);
    
    // Export a "Profile" suggestion
    const marginRight = width - maxX;
    const marginBottom = height - maxY;
    console.log(`Suggested Margin: marginRight=${marginRight}, marginBottom=${marginBottom}`);
}

analyze().catch(err => console.error(err));
