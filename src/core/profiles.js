/**
 * Watermark Model Profiles
 * Defines the characteristics and heuristics for different AI models.
 */

export const PROFILES = {
    gemini: {
        id: 'gemini',
        name: 'Google Gemini',
        logoValue: 255.0,
        anchors: ['bottom-right'],
        defaultAsset: '96',
        tiers: {
            '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
            '1k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
            '2k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
            '4k': { logoSize: 96, marginRight: 64, marginBottom: 64 }
        }
    },
    doubao: {
        id: 'doubao',
        name: 'ByteDance Doubao (豆包)',
        logoValue: 255.0, // Precision check: is it 255 or lower? Standard appears to be 255.
        // Support for multiple anchors (Top-Left and Bottom-Right)
        anchors: ['bottom-right', 'top-left'],
        // Maps anchor to its specific asset key
        assets: {
            'bottom-right': 'doubao_br',
            'top-left': 'doubao_tl'
        },
        // Heuristic configurations for standard 2k (2730x1535 sample)
        tiers: {
            '2k_br': { logoWidth: 401, logoHeight: 173, marginRight: 24, marginBottom: 10, anchor: 'bottom-right' },
            '2k_tl': { logoWidth: 307, logoHeight: 167, marginLeft: 38, marginTop: 25, anchor: 'top-left' }
        },
        // Adaptive heuristic: Doubao logos scale roughly with resolution
        getHeuristicConfig: (width, height, anchor = 'bottom-right') => {
            const isTL = anchor === 'top-left';
            // Baseline 2730x1535
            const scale = width / 2730;
            if (isTL) {
                return {
                    logoWidth: Math.round(307 * scale),
                    logoHeight: Math.round(167 * scale),
                    marginLeft: Math.round(38 * scale),
                    marginTop: Math.round(25 * scale),
                    anchor: 'top-left'
                };
            } else {
                return {
                    logoWidth: Math.round(401 * scale),
                    logoHeight: Math.round(173 * scale),
                    marginRight: Math.round(24 * scale),
                    marginBottom: Math.round(10 * scale),
                    anchor: 'bottom-right'
                };
            }
        }
    }
};

export const DEFAULT_PROFILE = PROFILES.gemini;

/** Convenience alias for backward compatibility and test imports */
export const GEMINI_PROFILE = PROFILES.gemini;

/**
 * Get a registered profile by ID, with fallback to Gemini.
 * @param {string} id - Profile ID (e.g. 'gemini', 'doubao')
 * @returns {Object} Profile object
 */
export function getProfile(id) {
    return PROFILES[id] || PROFILES.gemini;
}
