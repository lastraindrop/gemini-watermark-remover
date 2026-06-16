/**
 * Restoration Quality Metrics
 * 
 * Provides quantitative assessment of watermark removal quality.
 */

const HALO_LUMINANCE_THRESHOLD = 3.0; // noticeable luminance step
const BANDING_STREAK_LENGTH = 4; // consecutive pixels with same diff for banding

export const RestorationMetrics = {
    /**
     * Calculate Mean Squared Error (MSE) between two image buffers
     */
    calculateMSE(buffer1, buffer2) {
        if (buffer1.length !== buffer2.length) {
            throw new Error('Buffer lengths must match');
        }
        let squaredErrorSum = 0;
        for (let i = 0; i < buffer1.length; i++) {
            const diff = buffer1[i] - buffer2[i];
            squaredErrorSum += diff * diff;
        }
        return squaredErrorSum / buffer1.length;
    },

    /**
     * Calculate Peak Signal-to-Noise Ratio (PSNR)
     * Values > 40dB are generally considered excellent (imperceptible loss)
     */
    calculatePSNR(buffer1, buffer2) {
        const mse = this.calculateMSE(buffer1, buffer2);
        if (mse === 0) return Infinity;
        const max = 255;
        return 10 * Math.log10((max * max) / mse);
    },

    /**
     * Simplified quality estimate derived from PSNR (not a true SSIM implementation)
     * Maps PSNR range [20dB, 50dB] to [0.0, 1.0] as a rough quality indicator.
     * For production use, consider implementing a proper sliding-window SSIM.
     */
    estimateQualityFromPSNR(buffer1, buffer2) {
        const psnr = this.calculatePSNR(buffer1, buffer2);
        return Math.max(0, Math.min(1, (psnr - 20) / 30));
    },

    /**
     * @deprecated Use estimateQualityFromPSNR instead. This is not a real SSIM calculation.
     */
    calculateSSIM(buffer1, buffer2) {
        return this.estimateQualityFromPSNR(buffer1, buffer2);
    },

    /**
     * v2.6: Detect alpha-band halo artifacts around the watermark boundary.
     *
     * When removal over-corrects (alphaGain too high) or the alpha map is
     * slightly misaligned, the reverse-alpha-blend formula leaves a visible
     * dark or bright ring at the watermark edge. This function scans the
     * outer 1-3 pixel ring of the alpha mask for abnormally bright/dark
     * pixels compared to the inner region and background.
     *
     * @param {ImageData} imageData - Processed image
     * @param {Float32Array} alphaMap - Alpha map used for removal
     * @param {{x:number, y:number, width:number, height:number}} position
     * @returns {{hasHalo: boolean, severity: number}} severity in [0,1]
     */
    assessAlphaBandHalo(imageData, alphaMap, position) {
        const { x, y, width, height } = position;
        const { data, width: imgWidth, height: imgHeight } = imageData;

        // Sample luminance at three concentric bands:
        //   inner: inside watermark, near edge (center of alpha region)
        //   edge:  at the alpha boundary (alpha drops from ~0.3 to ~0)
        //   outer: just outside watermark (should be clean background)
        const innerPixels = [];
        const edgePixels = [];
        const outerPixels = [];

        const getLum = (px, py) => {
            if (px < 0 || py < 0 || px >= imgWidth || py >= imgHeight) return -1;
            const idx = ((Math.floor(py) * imgWidth + Math.floor(px)) << 2);
            return (data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722);
        };

        const getAlpha = (col, row) => {
            if (col < 0 || row < 0 || col >= width || row >= height) return 0;
            return alphaMap[row * width + col];
        };

        // Scan the four edges of the watermark region
        const scanEdge = (col, row) => {
            const px = x + col, py = y + row;
            const lum = getLum(px, py);
            const a = getAlpha(col, row);
            if (lum < 0) return;
            if (a > 0.1) {
                innerPixels.push(lum);
            } else if (a > 0.001) {
                edgePixels.push(lum);
            } else {
                // Outer: just beyond alpha boundary
                outerPixels.push(lum);
            }
        };

        // Sample perimeter at regular intervals (avoid scanning every pixel)
        const step = Math.max(2, Math.round(Math.min(width, height) / 32));
        for (let i = 0; i < width; i += step) {
            scanEdge(i, 0);                      // top edge
            scanEdge(i, height - 1);             // bottom edge
        }
        for (let i = 0; i < height; i += step) {
            scanEdge(0, i);                      // left edge
            scanEdge(width - 1, i);             // right edge
        }

        if (edgePixels.length < 4 || innerPixels.length < 4 || outerPixels.length < 4) {
            return { hasHalo: false, severity: 0 };
        }

        const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        const innerAvg = avg(innerPixels);
        const edgeAvg = avg(edgePixels);
        const outerAvg = avg(outerPixels);

        // A halo is present when the edge band's luminance deviates from
        // the smooth transition expected between inner and outer regions.
        const expectedEdge = (innerAvg + outerAvg) / 2;
        const edgeDeviation = Math.abs(edgeAvg - expectedEdge);
        const range = Math.max(1, Math.max(innerAvg, outerAvg) - Math.min(innerAvg, outerAvg));
        const severity = Math.min(1, edgeDeviation / Math.max(HALO_LUMINANCE_THRESHOLD, range * 0.5));

        return {
            hasHalo: severity > 0.3,
            severity: Math.round(severity * 100) / 100
        };
    },

    /**
     * v2.6: Detect banding/posterization artifacts in the removal region.
     *
     * When Math.round() quantizes each channel per pixel (blendModes.js:111),
     * smooth gradients develop visible banding. This function detects the
     * characteristic pattern: consecutive pixels sharing the same value.
     *
     * @param {Uint8ClampedArray} originalData - Original image pixel data
     * @param {Uint8ClampedArray} processedData - Processed image pixel data
     * @param {{x:number, y:number, width:number, height:number}} position
     * @param {number} imgWidth - Image width
     * @returns {{hasBanding: boolean, score: number, streakCount: number}}
     */
    assessRemovalDiffArtifacts(originalData, processedData, position, imgWidth) {
        const { x, y, width, height } = position;
        const bsl = BANDING_STREAK_LENGTH;
        let streakCount = 0;
        let totalSampled = 0;
        const maxStreaks = 20; // cap to limit computation

        const getLum = (dataBuf, px, py) => {
            if (px < 0 || py < 0 || px >= imgWidth) return -1;
            const idx = ((py * imgWidth + px) << 2);
            return dataBuf[idx] * 0.2126 + dataBuf[idx + 1] * 0.7152 + dataBuf[idx + 2] * 0.0722;
        };

        // Scan horizontal streaks (each row)
        for (let row = Math.max(0, y); row < Math.min(y + height, Math.floor(originalData.length / (imgWidth * 4))); row += 2) {
            let runStart = -1;
            let runVal = -1;
            let runLen = 0;
            for (let col = x; col < x + width; col++) {
                const diff = Math.abs(
                    getLum(originalData, col, row) -
                    getLum(processedData, col, row)
                );
                if (diff > 0.5 && diff < 10) { // meaningful but not large changes
                    const roundedDiff = Math.round(diff);
                    if (roundedDiff === runVal) {
                        runLen++;
                        if (runLen >= bsl && runStart >= 0) {
                            streakCount++;
                            runStart = -1;
                            if (streakCount >= maxStreaks) break;
                        }
                    } else {
                        runVal = roundedDiff;
                        runLen = 1;
                        runStart = col;
                    }
                } else {
                    runVal = -1;
                    runLen = 0;
                    runStart = -1;
                }
                totalSampled++;
            }
            if (streakCount >= maxStreaks) break;
        }

        // Also scan vertical streaks (every other column)
        for (let col = x; col < x + width; col += 2) {
            let runStart = -1;
            let runVal = -1;
            let runLen = 0;
            const maxRow = Math.min(y + height, Math.floor(originalData.length / (imgWidth * 4)));
            for (let row = y; row < maxRow; row++) {
                const diff = Math.abs(
                    getLum(originalData, col, row) -
                    getLum(processedData, col, row)
                );
                if (diff > 0.5 && diff < 10) {
                    const roundedDiff = Math.round(diff);
                    if (roundedDiff === runVal) {
                        runLen++;
                        if (runLen >= bsl && runStart >= 0) {
                            streakCount++;
                            runStart = -1;
                            if (streakCount >= maxStreaks) break;
                        }
                    } else {
                        runVal = roundedDiff;
                        runLen = 1;
                        runStart = row;
                    }
                } else {
                    runVal = -1;
                    runLen = 0;
                    runStart = -1;
                }
                totalSampled++;
            }
            if (streakCount >= maxStreaks) break;
        }

        const score = totalSampled > 0
            ? Math.min(1, streakCount / Math.max(10, totalSampled / 100))
            : 0;

        return {
            hasBanding: score > 0.15,
            score: Math.round(score * 100) / 100,
            streakCount
        };
    }
};

// v2.6: Standalone exports for direct use in removal pipeline
export const assessAlphaBandHalo = RestorationMetrics.assessAlphaBandHalo.bind(RestorationMetrics);
export const assessRemovalDiffArtifacts = RestorationMetrics.assessRemovalDiffArtifacts.bind(RestorationMetrics);
