import { getCatalogConfig } from './catalog.js';
import { GEMINI_PROFILE } from './profiles.js';

/**
 * Detect watermark configuration based on image size using profiles
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @param {string} profileId - ID of the watermark profile (default: 'gemini')
 * @returns {Object} Watermark configuration {logoSize, marginRight, marginBottom}
 */
export function detectWatermarkConfig(imageWidth, imageHeight, profileId = 'gemini') {
    // 1. Try Catalog-based matching (Highly precise)
    const catalog = getCatalogConfig(imageWidth, imageHeight);
    if (catalog) return catalog;

    // 2. Profile-based Heuristic fallback
    return GEMINI_PROFILE.getHeuristicConfig(imageWidth, imageHeight);
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
