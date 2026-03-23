/**
 * Web Worker for watermark removal
 * Offloads heavy pixel manipulation from the main thread
 */

self.onmessage = function(e) {
    const { imageData, alphaMap, position } = e.data;
    const { x, y, width, height } = position;
    const { data, width: imgWidth } = imageData;

    const ALPHA_THRESHOLD = 0.002;
    const MAX_ALPHA = 0.99;
    const LOGO_VALUE = 255;

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const imgIdx = ((y + row) * imgWidth + (x + col)) * 4;
            const alphaIdx = row * width + col;
            
            let alpha = alphaMap[alphaIdx];
            if (alpha < ALPHA_THRESHOLD) continue;

            alpha = Math.min(alpha, MAX_ALPHA);
            const oneMinusAlpha = 1.0 - alpha;

            for (let c = 0; c < 3; c++) {
                const watermarked = data[imgIdx + c];
                const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;
                data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
            }
        }
    }

    self.postMessage({ imageData }, [imageData.data.buffer]);
};
