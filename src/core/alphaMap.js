/**
 * Alpha Map calculator
 * calculate alpha map from capture background image
 */

/**
 * Calculate alpha map from background captured image
 * @param {ImageData} bgCaptureImageData -ImageData object for background capture
 * @returns {Float32Array} Alpha map (value range 0.0-1.0)
 */
export function calculateAlphaMap(bgCaptureImageData) {
    const { width, height, data } = bgCaptureImageData;
    const alphaMap = new Float32Array(width * height);

    // For each pixel, take the maximum value of the three RGB channels and normalize it to [0, 1]
    for (let i = 0; i < alphaMap.length; i++) {
        const idx = i * 4; // RGBA format, 4 bytes per pixel
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Use max-channel: the watermark logo is white (all channels equal),
        // so the brightest channel best represents the alpha presence.
        // BT.709 luminance would systematically underestimate alpha on
        // anti-aliased edge pixels, lowering NCC detection scores.
        const maxChannel = Math.max(r, g, b);

        // Normalize to [0, 1] range
        alphaMap[i] = maxChannel / 255.0;
    }

    return alphaMap;
}
