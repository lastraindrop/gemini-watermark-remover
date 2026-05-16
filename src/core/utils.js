/**
 * Shared utility functions for core watermark modules.
 */

/**
 * Deep-clone an ImageData-like object (width, height, data).
 */
export function cloneImageData(imageData) {
    return {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data)
    };
}

/**
 * Calculate the ratio of near-black pixels (<15 luminance) in a region.
 * Used by multi-pass removal and alpha calibration safety gates.
 */
export function calculateNearBlackRatio(imageData, position) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const { x, y, width: w, height: h } = position;
    let nearBlack = 0;
    let total = 0;

    for (let row = 0; row < h; row++) {
        const cy = Math.floor(y + row);
        if (cy < 0 || cy >= imgHeight) continue;
        for (let col = 0; col < w; col++) {
            const cx = Math.floor(x + col);
            if (cx < 0 || cx >= imgWidth) continue;
            const idx = ((cy * imgWidth) + cx) << 2;
            const lum = data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
            total++;
            if (lum < 15) nearBlack++;
        }
    }

    return total > 0 ? nearBlack / total : 0;
}

/**
 * Compute luminance standard deviation for a square region of image data.
 */
export function regionStdDev(data, imgWidth, x, y, size) {
    let sum = 0, sq = 0, n = 0;
    for (let row = 0; row < size; row++) {
        const base = ((y + row) * imgWidth + x) << 2;
        for (let col = 0; col < size; col++) {
            const idx = base + (col << 2);
            if (idx < 0 || idx + 2 >= data.length) continue;
            const lum = data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
            sum += lum;
            sq += lum * lum;
            n++;
        }
    }
    if (n === 0) return 0;
    const mean = sum / n;
    const variance = Math.max(0, sq / n - mean * mean);
    return Math.sqrt(variance);
}
