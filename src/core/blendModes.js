/**
 * Reverse alpha blending module
 * Core algorithm for removing watermarks
 */

// Constants definition
export const ALPHA_THRESHOLD = 0.002;  // Ignore very small alpha values (noise)
export const MAX_ALPHA = 0.99;          // Avoid division by near-zero values
export const LOGO_VALUE = 255.0;        // Color value for white watermark (float)

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
    const { data, width: imgWidth } = imageData;

    // Pre-calculate constants for efficiency
    const logoVal = Math.fround(LOGO_VALUE);

    // Process each pixel in the watermark area
    for (let row = 0; row < height; row++) {
        const curY = y + row;
        if (curY < 0 || curY >= imageData.height) continue; // Image boundary check

        const rowOffset = curY * imgWidth;
        const alphaRowOffset = row * width;

        for (let col = 0; col < width; col++) {
            const curX = x + col;
            if (curX < 0 || curX >= imgWidth) continue; // Image boundary check

            // Get alpha value from map
            const alpha = Math.fround(alphaMap[alphaRowOffset + col]);

            // Skip invalid or very small alpha values (noise)
            if (isNaN(alpha) || alpha < ALPHA_THRESHOLD) continue;

            const effectiveAlpha = Math.min(alpha, MAX_ALPHA);
            const oneMinusAlpha = Math.fround(1.0 - effectiveAlpha);
            const alphaLogo = Math.fround(effectiveAlpha * logoVal);

            // Calculate index in original image (RGBA format, 4 bytes per pixel)
            const imgIdx = (rowOffset + curX) << 2;

            // Apply reverse alpha blending to RGB channels
            for (let c = 0; c < 3; c++) {
                const watermarked = Math.fround(data[imgIdx + c]);
                const original = Math.fround((watermarked - alphaLogo) / oneMinusAlpha);
                
                data[imgIdx + c] = Math.min(255, Math.max(0, Math.round(original)));
            }
        }
    }

}

