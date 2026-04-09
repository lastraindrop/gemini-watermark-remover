/**
 * Watermark Profiles Registry
 * 
 * This module allows the engine to support multiple AI watermark models
 * by defining their signatures, catalogs, and detection heuristics.
 */

export const GEMINI_PROFILE = {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'White semi-transparent logo at the bottom right corner.',
    
    // Core characteristics
    logoColor: { r: 255, g: 255, b: 255 },
    anchors: ['bottom-right'],
    
    // Standard sizes and tiers
    tiers: {
        '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
        '1k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
        '2k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
        '4k': { logoSize: 96, marginRight: 64, marginBottom: 64 }
    },

    // Heuristic detection logic for non-catalog sizes
    getHeuristicConfig: (width, height) => {
        const maxSide = Math.max(width, height);
        const minSide = Math.min(width, height);
        if (maxSide >= 1500 || (maxSide > 1024 && minSide >= 900)) {
            return { logoSize: 96, marginRight: 64, marginBottom: 64, isOfficial: false };
        } else {
            return { logoSize: 48, marginRight: 32, marginBottom: 32, isOfficial: false };
        }
    }
};

export const PROFILES = [GEMINI_PROFILE];

export function getProfile(id) {
    return PROFILES.find(p => p.id === id) || GEMINI_PROFILE;
}
