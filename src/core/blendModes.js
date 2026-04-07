/**
 * Reverse alpha blending module
 * Core algorithm for removing watermarks
 */

// Constants definition
export const ALPHA_THRESHOLD = 0.002;  // Ignore very small alpha values (noise)
export const MAX_ALPHA = 0.99;          // Avoid division by near-zero values
export const LOGO_VALUE = 255.0;        // Color value for white watermark (float)

/**
 * Sample pixel color using bilinear interpolation
 * @param {Uint8ClampedArray} data - Image data buffer
 * @param {number} x - Float X coordinate
 * @param {number} y - Float Y coordinate
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} channel - RGB channel index (0-2)
 * @returns {number} Interpolated color value
 */
function sampleBilinear(data, x, y, width, height, channel) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    const dx = x - x0;
    const dy = y - y0;

    const getIdx = (px, py) => (py * width + px) << 2;

    const v00 = data[getIdx(x0, y0) + channel];
    const v10 = data[getIdx(x1, y0) + channel];
    const v01 = data[getIdx(x0, y1) + channel];
    const v11 = data[getIdx(x1, y1) + channel];

    const top = v00 + dx * (v10 - v00);
    const bottom = v01 + dx * (v11 - v01);

    return top + dy * (bottom - top);
}

/**
 * Remove watermark using reverse alpha blending
 *
 * Principle:
 * Gemini adds watermark: watermarked = α × logo + (1 - α) × original
 * Reverse solve: original = (watermarked - α × logo) / (1 - α)
 *
 * @param {ImageData|Object} imageData - Image data to process (will be modified in place)
 * @param {Float32Array} alphaMap - Alpha channel data
 * @param {Object} position - Watermark position {x, y, width, height}
 */
export function removeWatermark(imageData, alphaMap, position) {
    const { x, y, width, height } = position;
    const { data, width: imgWidth, height: imgHeight } = imageData;

    // Pre-calculate constants for efficiency
    const logoVal = Math.fround(LOGO_VALUE);

    // Create a copy of the processing area to avoid artifacts during bilinear sampling
    // Only if interpolation is actually needed (float coordinates)
    const isSubpixel = x % 1 !== 0 || y % 1 !== 0;
    const srcData = isSubpixel ? new Uint8ClampedArray(data) : data;

    // Process each pixel in the watermark area
    for (let row = 0; row < height; row++) {
        const curY = y + row;
        if (curY < 0 || curY >= imgHeight) continue; // Image boundary check

        const isFloatY = curY % 1 !== 0;
        const rowOffset = Math.floor(curY) * imgWidth;
        const alphaRowOffset = row * width;

        for (let col = 0; col < width; col++) {
            const curX = x + col;
            if (curX < 0 || curX >= imgWidth) continue; // Image boundary check

            const isFloatX = curX % 1 !== 0;

            // Get alpha value from map
            const alpha = Math.fround(alphaMap[alphaRowOffset + col]);

            // Skip invalid or very small alpha values (noise)
            if (isNaN(alpha) || alpha < ALPHA_THRESHOLD) continue;

            const effectiveAlpha = Math.min(alpha, MAX_ALPHA);
            const oneMinusAlpha = Math.fround(1.0 - effectiveAlpha);
            const alphaLogo = Math.fround(effectiveAlpha * logoVal);

            // Calculate index in original image (RGBA format, 4 bytes per pixel)
            const imgIdx = (rowOffset + Math.floor(curX)) << 2;

            // Apply reverse alpha blending to RGB channels
            for (let c = 0; c < 3; c++) {
                let watermarked;
                if (isFloatX || isFloatY) {
                    // Use bilinear sampling for sub-pixel accuracy
                    watermarked = Math.fround(sampleBilinear(srcData, curX, curY, imgWidth, imgHeight, c));
                } else {
                    watermarked = Math.fround(data[imgIdx + c]);
                }

                const original = Math.fround((watermarked - alphaLogo) / oneMinusAlpha);
                
                data[imgIdx + c] = Math.min(255, Math.max(0, Math.round(original)));
            }
        }
    }
}
