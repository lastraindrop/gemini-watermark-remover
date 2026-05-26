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
 * Calculate the ratio of near-black pixels (all three RGB channels <= 5) in a region.
 * Uses per-channel check matching upstream behavior — a pixel must have all
 * channels dark to be considered near-black, avoiding false positives on
 * colored-but-dim pixels.
 */
export function calculateNearBlackRatio(imageData, position) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const { x, y, width: w, height: h } = position;
    const NEAR_BLACK_THRESHOLD = 5;
    let nearBlack = 0;
    let total = 0;

    for (let row = 0; row < h; row++) {
        const cy = Math.floor(y + row);
        if (cy < 0 || cy >= imgHeight) continue;
        for (let col = 0; col < w; col++) {
            const cx = Math.floor(x + col);
            if (cx < 0 || cx >= imgWidth) continue;
            const idx = ((cy * imgWidth) + cx) << 2;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (r <= NEAR_BLACK_THRESHOLD && g <= NEAR_BLACK_THRESHOLD && b <= NEAR_BLACK_THRESHOLD) {
                nearBlack++;
            }
            total++;
        }
    }

    return total > 0 ? nearBlack / total : 0;
}

/**
 * Compute luminance standard deviation for a square region of image data.
 */
export function regionStdDev(data, imgWidth, x, y, size) {
    if (x < 0 || y < 0 || x + size > imgWidth || size <= 0) return 0;
    let sum = 0, sq = 0, n = 0;
    const maxY = Math.min(y + size, Math.floor(data.length / (imgWidth * 4)));
    for (let row = y; row < maxY; row++) {
        const base = (row * imgWidth + x) << 2;
        for (let col = 0; col < size && (base + (col << 2) + 2) < data.length; col++) {
            const idx = base + (col << 2);
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
