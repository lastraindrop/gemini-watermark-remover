/**
 * Reverse alpha blending module
 * Core algorithm for removing watermarks
 */

// Constants definition
// v2.7 A-7: ALPHA_NOISE_FLOOR exported as default; callers can override via
// removeWatermark({ alphaNoiseFloor }) without breaking Foundation-layer
// independence (blendModes.js stays zero-import).
export const DEFAULT_ALPHA_NOISE_FLOOR = 3 / 255;  // Remove low-level quantization noise from alpha map
export const ALPHA_THRESHOLD = 0.002;   // Ignore very small alpha values after noise floor removal
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
 * @param {Object} [options] - Optional config { alphaGain: number, alphaNoiseFloor: number, alphaBias: number }
 */
export function removeWatermark(imageData, alphaMap, position, options = {}) {
    const { x, y, width, height } = position;
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const alphaGain = Number.isFinite(options.alphaGain) && options.alphaGain > 0 ? options.alphaGain : 1;
    // v2.7 A-7: allow caller to override the alpha noise floor (default 3/255).
    // Useful for experimenting with lower floors (1/255) to reduce faint-watermark residue.
    const alphaNoiseFloor = Number.isFinite(options.alphaNoiseFloor) && options.alphaNoiseFloor >= 0
        ? options.alphaNoiseFloor
        : DEFAULT_ALPHA_NOISE_FLOOR;
    // Some captured templates contain a small positive RGB baseline. Keep the
    // correction opt-in so exact/synthetic alpha maps retain the original math.
    const alphaBias = Number.isFinite(options.alphaBias) && options.alphaBias >= 0
        ? options.alphaBias
        : 0;

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
            const rawAlpha = Math.fround(sampleBilinearAlpha(alphaMap, relX, relY, width, height));

            // Skip invalid values
            if (isNaN(rawAlpha)) continue;

            // Remove low-level alpha noise from compressed background capture.
            // This noise floor is applied only for activation gating; the actual
            // blend still uses the full raw alpha to preserve edge fidelity.
            const signalAlpha = Math.max(0, rawAlpha - alphaNoiseFloor) * alphaGain;
            if (signalAlpha < ALPHA_THRESHOLD) continue;

            const effectiveAlpha = Math.min(Math.max(0, rawAlpha - alphaBias) * alphaGain, MAX_ALPHA);
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
