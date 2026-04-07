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

        // Use perceptual luminance (0.299R + 0.587G + 0.114B) to determine the alpha value
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114);

        // Normalize to [0, 1] range
        alphaMap[i] = brightness / 255.0;
    }

    return alphaMap;
}
