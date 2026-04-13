import { registry } from './templates/registry.js';

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
        logoValue: 255.0,
        anchors: ['bottom-right', 'top-left'],
        assets: {
            'bottom-right': 'doubao_br',
            'top-left': 'doubao_tl'
        },
        tiers: {
            '2k_br': { logoWidth: 401, logoHeight: 173, marginRight: 24, marginBottom: 10, anchor: 'bottom-right' },
            '2k_tl': { logoWidth: 307, logoHeight: 167, marginLeft: 38, marginTop: 25, anchor: 'top-left' }
        },
        getHeuristicConfig: (width, height, anchor = 'bottom-right') => {
            const isTL = anchor === 'top-left';
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

// Auto-register built-in profiles
registry.registerProfile(PROFILES.gemini);
registry.registerProfile(PROFILES.doubao);

export const DEFAULT_PROFILE = PROFILES.gemini;
export const GEMINI_PROFILE = PROFILES.gemini;

export function getProfile(id) {
    return registry.getProfile(id) || PROFILES.gemini;
}

export function getAllProfiles() {
    return registry.getAllProfiles();
}
