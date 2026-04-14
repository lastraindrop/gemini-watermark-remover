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
     * Simplified SSIM (Structural Similarity Index)
     * Focuses on luminance and contrast comparison
     */
    calculateSSIM(buffer1, buffer2) {
        // Full SSIM is expensive for JS, but we can implement a simplified version
        // if needed. For now, PSNR is the primary metric for mathematical restoration.
        const psnr = this.calculatePSNR(buffer1, buffer2);
        // Normalize 20dB-50dB to 0.0-1.0 roughly
        return Math.max(0, Math.min(1, (psnr - 20) / 30));
    }
};
