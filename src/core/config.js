/**
 * Watermark configuration logic
 * Pure functions for detecting and calculating watermark parameters
 */

/**
 * Detect watermark configuration based on image size
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Object} Watermark configuration {logoSize, marginRight, marginBottom}
 */
export function detectWatermarkConfig(imageWidth, imageHeight) {
    // Gemini's watermark rules (Refined v1.2.1):
    // Use 96px only if the image is sufficiently large in BOTH dimensions
    // or very large in one while maintaining reasonable size in the other.
    // Rule: Max side > 1024 AND Min side >= 720 (v1.2.2 Refined)
    const maxSide = Math.max(imageWidth, imageHeight);
    const minSide = Math.min(imageWidth, imageHeight);

    if (maxSide > 1024 && minSide >= 720) {
        return {
            logoSize: 96,
            marginRight: 64,
            marginBottom: 64
        };
    } else {
        return {
            logoSize: 48,
            marginRight: 32,
            marginBottom: 32
        };
    }
}

/**
 * Calculate watermark position in image based on image size and watermark configuration
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @param {Object} config - Watermark configuration {logoSize, marginRight, marginBottom}
 * @returns {Object} Watermark position {x, y, width, height}
 */
export function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { logoSize, marginRight, marginBottom } = config;

    return {
        x: imageWidth - marginRight - logoSize,
        y: imageHeight - marginBottom - logoSize,
        width: logoSize,
        height: logoSize
    };
}
