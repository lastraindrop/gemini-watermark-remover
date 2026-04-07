/**
 * Reverse alpha blending module
 * Core algorithm for removing watermarks
 */

// Constants definition
export const ALPHA_THRESHOLD = 0.002;  // Ignore very small alpha values (noise)
export const MAX_ALPHA = 0.99;          // Avoid division by near-zero values
export const LOGO_VALUE = 255.0;        // Color value for white watermark (float)

/**
 * Sample alpha value from map using bilinear interpolation
 * @param {Float32Array} alphaMap - Alpha channel data
 * @param {number} x - Relative X coordinate in alphaMap space
 * @param {number} y - Relative Y coordinate in alphaMap space
 * @param {number} width - AlphaMap width
 * @param {number} height - AlphaMap height
 * @returns {number} Interpolated alpha value
 */
function sampleBilinearAlpha(alphaMap, x, y, width, height) {
    // Boundary check for alphaMap space
    if (x <= -1 || x >= width || y <= -1 || y >= height) return 0;

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const dx = x - x0;
    const dy = y - y0;

    const getAlpha = (px, py) => {
        if (px < 0 || px >= width || py < 0 || py >= height) return 0;
        return alphaMap[py * width + px];
    };

    const v00 = getAlpha(x0, y0);
    const v10 = getAlpha(x1, y0);
    const v01 = getAlpha(x0, y1);
    const v11 = getAlpha(x1, y1);

    const top = v00 + dx * (v10 - v00);
    const bottom = v01 + dx * (v11 - v01);

    return top + dy * (bottom - top);
}

/**
 * Remove watermark using reverse alpha blending with sub-pixel accuracy
 *
 * Principle:
 * Gemini adds watermark: watermarked = α × logo + (1 - α) × original
 * Reverse solve: original = (watermarked - α × logo) / (1 - α)
 *
 * v1.7.0 Optimized: Iterates over target image pixels and samples AlphaMap.
 *
 * @param {ImageData|Object} imageData - Image data to process (will be modified in place)
 * @param {Float32Array} alphaMap - Alpha channel data
 * @param {Object} position - Watermark position {x, y, width, height}
 */
export function removeWatermark(imageData, alphaMap, position) {
    const { x, y, width, height } = position;
    const { data, width: imgWidth, height: imgHeight } = imageData;

    const logoVal = Math.fround(LOGO_VALUE);

    // Calculate the bounding box of affected pixels in the image
    const startY = Math.floor(y);
    const endY = Math.ceil(y + height);
    const startX = Math.floor(x);
    const endX = Math.ceil(x + width);

    for (let iy = startY; iy < endY; iy++) {
        if (iy < 0 || iy >= imgHeight) continue;
        
        const rowOffset = iy * imgWidth;
        const relY = iy - y; // Float relative Y in alphaMap space

        for (let ix = startX; ix < endX; ix++) {
            if (ix < 0 || ix >= imgWidth) continue;
            
            const relX = ix - x; // Float relative X in alphaMap space

            // Sample alpha value for this specific image pixel
            const alpha = Math.fround(sampleBilinearAlpha(alphaMap, relX, relY, width, height));

            // Skip invalid or very small alpha values
            if (isNaN(alpha) || alpha < ALPHA_THRESHOLD) continue;

            const effectiveAlpha = Math.min(alpha, MAX_ALPHA);
            const oneMinusAlpha = Math.fround(1.0 - effectiveAlpha);
            const alphaLogo = Math.fround(effectiveAlpha * logoVal);

            const imgIdx = (rowOffset + ix) << 2;

            // Apply reverse alpha blending to RGB channels
            for (let c = 0; c < 3; c++) {
                const watermarked = Math.fround(data[imgIdx + c]);
                const original = Math.fround((watermarked - alphaLogo) / oneMinusAlpha);
                
                // Clamp and round
                data[imgIdx + c] = Math.min(255, Math.max(0, Math.round(original)));
            }
        }
    }
}
