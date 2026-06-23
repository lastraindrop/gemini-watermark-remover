import { regionStdDev } from './utils.js';

/**
 * Edge Cleanup Module (v2.7 Phase B-3)
 *
 * After multi-pass removal, quantization artifacts (banding) appear at
 * smooth gradient edges due to Math.round() in blendModes.js. This
 * module applies a lightweight edge-aware blur: it computes the alpha
 * gradient mask (Sobel on the alpha map), then blends a radius-1 blur
 * into the edge pixels weighted by the gradient strength.
 *
 * Ported from upstream GargantuaX watermarkProcessor stage 7 edge cleanup.
 */

/**
 * Compute a simple alpha gradient magnitude using 3×3 Sobel kernels.
 * Returns a Float32Array of gradient magnitude per pixel in [0, 1].
 * @param {Float32Array} alphaMap
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array}
 */
function computeAlphaGradient(alphaMap, width, height) {
    const grad = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            // Sobel X
            const gx = -alphaMap[i - width - 1] - 2 * alphaMap[i - 1] - alphaMap[i + width - 1]
                      + alphaMap[i - width + 1] + 2 * alphaMap[i + 1] + alphaMap[i + width + 1];
            // Sobel Y
            const gy = -alphaMap[i - width - 1] - 2 * alphaMap[i - width] - alphaMap[i - width + 1]
                      + alphaMap[i + width - 1] + 2 * alphaMap[i + width] + alphaMap[i + width + 1];
            grad[i] = Math.min(1, Math.sqrt(gx * gx + gy * gy));
        }
    }
    return grad;
}

/**
 * Apply edge cleanup to a watermark removal region using the alpha gradient
 * as a blending mask. Pixels at the alpha edge (where alpha transitions from
 * non-zero to near-zero) get a radius-1 box blur to smooth quantization steps.
 *
 * This is a targeted fix for the "micro-deviation" banding visible on smooth
 * backgrounds after removal. The blur radius is small (1px) to avoid smearing
 * real image detail.
 *
 * @param {ImageData|Object} imageData - Processed image (modified in place)
 * @param {Float32Array} alphaMap - Alpha map used for removal
 * @param {{x:number,y:number,width:number,height:number}} position
 */
export function applyEdgeCleanup(imageData, alphaMap, position) {
    const { x, y, width, height } = position;
    const { data, width: imgWidth } = imageData;
    const regionTexture = regionStdDev(data, imgWidth, Math.floor(x), Math.floor(y), width, height);
    if (regionTexture > 24) return;

    const grad = computeAlphaGradient(alphaMap, width, height);

    // Find the edge zone: pixels where alpha gradient > 0.02 (transition region)
    // Apply a 1px-radius box blur weighted by gradient strength.
    // Skip the border pixels (1px margin) since they can't be blurred.

    for (let row = 1; row < height - 1; row++) {
        const py = Math.floor(y + row);
        if (py < 0 || py >= Math.floor(data.length / (imgWidth * 4))) continue;

        for (let col = 1; col < width - 1; col++) {
            const alphaIdx = row * width + col;
            const edgeWeight = grad[alphaIdx];
            if (edgeWeight < 0.02) continue; // not an edge pixel

            const px = Math.floor(x + col);
            if (px < 1 || px >= imgWidth - 1) continue;

            const imgIdx = (py * imgWidth + px) << 2;

            // 3×3 box blur (radius 1) blended with original using edgeWeight
            for (let c = 0; c < 3; c++) {
                const center = data[imgIdx + c];
                const neighbors = [];
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIdx = ((py + dy) * imgWidth + (px + dx)) * 4;
                        neighbors.push(data[nIdx + c]);
                    }
                }
                const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
                // Blend: move toward blurred average, weighted by edge strength
                data[imgIdx + c] = Math.round(center + (avg - center) * edgeWeight * 0.5);
            }
        }
    }
}
