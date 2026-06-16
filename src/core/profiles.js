import { registry } from './templates/registry.js';

export const PROFILES = {
    gemini: {
        id: 'gemini',
        name: 'Google Gemini',
        brandColor: '#10b981', // Emerald
        icon: 'gemini-spark',
        logoValue: 255.0,
        anchors: ['bottom-right'],
        defaultAsset: '96',
        tiers: {
            '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
            '1k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
            '2k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
            '2k-new': { logoSize: 96, marginRight: 192, marginBottom: 192 },
            '4k': { logoSize: 96, marginRight: 64, marginBottom: 64 }
        },
        getHeuristicConfig: (w, h) => {
            const pixels = w * h;
            const shortSide = Math.min(w, h);
            let tier;
            // v2.2: Short-side priority for size selection
            if (shortSide < 720) tier = '0.5k';
            else if (shortSide < 1200) tier = '1k';
            else if (pixels <= 4500000) tier = '2k';
            else tier = '4k';
            return { ...PROFILES.gemini.tiers[tier], isOfficial: false };
        }
    },
    doubao: {
        id: 'doubao',
        name: 'ByteDance Doubao (豆包)',
        brandColor: '#4f46e5', // Indigo
        icon: 'doubao-cube',
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
                    anchor: 'top-left',
                    isOfficial: false
                };
            } else {
                return {
                    logoWidth: Math.round(401 * scale),
                    logoHeight: Math.round(173 * scale),
                    marginRight: Math.round(24 * scale),
                    marginBottom: Math.round(10 * scale),
                    anchor: 'bottom-right',
                    isOfficial: false
                };
            }
        }
    },
    dalle3: {
        id: 'dalle3',
        name: 'OpenAI DALL-E 3 (Experimental)',
        brandColor: '#10a37f',
        icon: 'dalle-brush',
        logoValue: 255.0,
        experimental: true,
        anchors: ['bottom-left'],
        assets: {
            'bottom-left': 'dalle3_bl'
        },
        tiers: {
            '1k_bl': { logoWidth: 120, logoHeight: 40, marginLeft: 20, marginBottom: 20, anchor: 'bottom-left' }
        },
        getHeuristicConfig: (width, _height) => {
            const scale = width / 1024;
            return {
                logoWidth: Math.round(120 * scale),
                logoHeight: Math.round(40 * scale),
                marginLeft: Math.round(20 * scale),
                marginBottom: Math.round(20 * scale),
                anchor: 'bottom-left',
                isOfficial: false
            };
        }
    }
};

// Auto-register built-in profiles
registry.registerProfile(PROFILES.gemini);
registry.registerProfile(PROFILES.doubao);
registry.registerProfile(PROFILES.dalle3);

export const DEFAULT_PROFILE = PROFILES.gemini;
export const GEMINI_PROFILE = PROFILES.gemini;

export function getProfile(id) {
    const profile = registry.getProfile(id);
    if (!profile) {
        console.warn(`Unknown profile "${id}", falling back to gemini`);
        return PROFILES.gemini;
    }
    return profile;
}

export function getAllProfiles() {
    return registry.getAllProfiles();
}
