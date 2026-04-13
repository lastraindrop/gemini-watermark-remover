import { getCatalogConfig, getAllCatalogConfigs } from './catalog.js';
import { PROFILES } from './profiles.js';

/**
 * Detect watermark configuration (tiers/size) for a given resolution.
 * Prefers Catalog (Precise) -> Profile Heuristics (Approximate).
 */
export function detectWatermarkConfig(imageWidth, imageHeight, profileId = 'gemini') {
    // 1. Try Catalog-based matching (Highly precise)
    // For non-Gemini, there might be multiple (TL, BR). Return the official ones.
    const catalogMatches = getAllCatalogConfigs(imageWidth, imageHeight, profileId);
    if (catalogMatches.length > 0) return catalogMatches[0]; // Default to first

    // 2. Profile-based Heuristic fallback
    const profile = PROFILES[profileId] || PROFILES.gemini;
    if (profile.getHeuristicConfig) {
        return profile.getHeuristicConfig(imageWidth, imageHeight);
    }

    // 3. Global Legacy Fallback
    const maxSide = Math.max(imageWidth, imageHeight);
    return {
        logoSize: maxSide > 1500 ? 96 : 48,
        marginRight: maxSide > 1500 ? 64 : 32,
        marginBottom: maxSide > 1500 ? 64 : 32,
        isOfficial: false
    };
}

/**
 * Get all potential configs for detailed search
 */
export function getAllPotentialConfigs(imageWidth, imageHeight, profileId = 'gemini') {
    const catalogMatches = getAllCatalogConfigs(imageWidth, imageHeight, profileId);
    if (catalogMatches.length > 0) return catalogMatches;

    const profile = PROFILES[profileId] || PROFILES.gemini;
    // For heuristic, check all possible anchors
    if (profile.getHeuristicConfig) {
        return profile.anchors.map(anchor => profile.getHeuristicConfig(imageWidth, imageHeight, anchor));
    }
    
    return [detectWatermarkConfig(imageWidth, imageHeight, profileId)];
}

/**
 * Calculate actual pixel coordinates from config
 */
export function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { 
        logoSize, logoWidth, logoHeight, 
        marginRight, marginBottom, 
        marginLeft, marginTop,
        anchor = 'bottom-right' 
    } = config;

    const w = logoWidth || logoSize;
    const h = logoHeight || logoSize;

    let x, y;

    switch (anchor) {
        case 'top-left':
            x = marginLeft || 0;
            y = marginTop || 0;
            break;
        case 'top-right':
            x = imageWidth - (marginRight || 0) - w;
            y = marginTop || 0;
            break;
        case 'bottom-left':
            x = marginLeft || 0;
            y = imageHeight - (marginBottom || 0) - h;
            break;
        case 'bottom-right':
        default:
            x = imageWidth - (marginRight || 0) - w;
            y = imageHeight - (marginBottom || 0) - h;
            break;
    }

    return { x, y, width: w, height: h, anchor };
}
