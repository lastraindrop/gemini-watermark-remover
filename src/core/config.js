import { getCatalogConfig } from './catalog.js';

/**
 * Detect watermark configuration based on image size
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Object} Watermark configuration {logoSize, marginRight, marginBottom}
 */
export function detectWatermarkConfig(imageWidth, imageHeight) {
    // 1. Try Catalog-based matching (Highly precise)
    const catalog = getCatalogConfig(imageWidth, imageHeight);
    if (catalog) return catalog;

    // 2. Heuristic fallback for non-cataloged sizes
    const maxSide = Math.max(imageWidth, imageHeight);
    const minSide = Math.min(imageWidth, imageHeight);

    // v1.4.0 Refined Heuristic:
    if (maxSide >= 1500 || (maxSide > 1024 && minSide >= 900)) {
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
