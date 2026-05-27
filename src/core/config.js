import { getAllCatalogConfigs, getScaledCatalogConfigs } from './catalog.js';
import { getProfile } from './profiles.js';

export const ENGINE_LIMITS = {
    MAX_PIXELS: 8000 * 8000, // 64MP
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    MAX_CONCURRENCY: 4
};

/**
 * Detect watermark configuration (tiers/size) for a given resolution.
 * Prefers Catalog (Precise) -> Profile Heuristics (Approximate).
 */
export function detectWatermarkConfig(imageWidth, imageHeight, profileId = 'gemini') {
    // 1. Try Catalog-based matching (Highly precise)
    // For non-Gemini, there might be multiple (TL, BR). Return the official ones.
    const catalogMatches = getAllCatalogConfigs(imageWidth, imageHeight, profileId);
    if (catalogMatches.length > 0) return { ...catalogMatches[0], isOfficial: true };

    // 2. Profile-based Heuristic fallback
    const profile = getProfile(profileId);
    if (profile.getHeuristicConfig) {
        return profile.getHeuristicConfig(imageWidth, imageHeight);
    }

    // 3. Global Legacy Fallback
    // Aligned with upstream GargantuaX logic: use 96px when both sides > 1024
    const use96 = imageWidth > 1024 && imageHeight > 1024;
    return {
        logoSize: use96 ? 96 : 48,
        marginRight: use96 ? 64 : 32,
        marginBottom: use96 ? 64 : 32,
        isOfficial: false
    };
}

/**
 * Get all potential configs for detailed search
 */
export function getAllPotentialConfigs(imageWidth, imageHeight, profileId = 'gemini') {
    const catalogMatches = getAllCatalogConfigs(imageWidth, imageHeight, profileId);
    if (catalogMatches.length > 0) {
        const exactMatches = catalogMatches.filter(config => config.width === imageWidth && config.height === imageHeight);
        if (exactMatches.length > 0) return exactMatches;
    }

    if (profileId === 'gemini') {
        const scaledMatches = getScaledCatalogConfigs(imageWidth, imageHeight, profileId);
        if (scaledMatches.length > 0) return scaledMatches;
    }

    if (catalogMatches.length > 0) return catalogMatches;

    const profile = getProfile(profileId);
    if (profile.getHeuristicConfig) {
        const anchors = profile.anchors || ['bottom-right'];
        const configs = anchors.map(anchor => profile.getHeuristicConfig(imageWidth, imageHeight, anchor));
        if (profileId === 'gemini') {
            const has48 = configs.some(c => (c.logoSize || c.logoWidth) === 48);
            const has96 = configs.some(c => (c.logoSize || c.logoWidth) === 96);
            if (!has48) configs.push({ logoSize: 48, marginRight: 32, marginBottom: 32, isOfficial: false });
            if (!has96) configs.push({ logoSize: 96, marginRight: 64, marginBottom: 64, isOfficial: false });
        }
        return configs;
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
