/**
 * Restoration Quality Metrics
 * 
 * Provides quantitative assessment of watermark removal quality.
 */

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
    }
};
