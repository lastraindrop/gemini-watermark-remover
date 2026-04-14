import { registry } from './templates/registry.js';

/**
 * Multi-Profile Resolution Catalog
 */

export const CATALOGS = {
    gemini: [
        { width: 512, height: 512, logoSize: 48, marginRight: 32, marginBottom: 32, tier: '0.5k' },
        { width: 1024, height: 1024, logoSize: 96, marginRight: 64, marginBottom: 64, tier: '1k' },
        { width: 2048, height: 2048, logoSize: 96, marginRight: 64, marginBottom: 64, tier: '2k' },
        { width: 4096, height: 4096, logoSize: 96, marginRight: 64, marginBottom: 64, tier: '4k' }
    ],
    doubao: [
        { width: 2048, height: 2048, logoWidth: 373, logoHeight: 165, marginRight: 11, marginBottom: 4, anchor: 'bottom-right' },
        { width: 2730, height: 1535, logoWidth: 307, logoHeight: 167, marginLeft: 38, marginTop: 25, anchor: 'top-left' },
        { width: 2730, height: 1535, logoWidth: 401, logoHeight: 173, marginRight: 24, marginBottom: 10, anchor: 'bottom-right' },
        { width: 2364, height: 1773, logoWidth: 248, logoHeight: 105, marginLeft: 39, marginTop: 39, anchor: 'top-left' },
        { width: 2364, height: 1773, logoWidth: 348, logoHeight: 151, marginRight: 10, marginBottom: 4, anchor: 'bottom-right' },
        { width: 1536, height: 2727, logoWidth: 221, logoHeight: 109, marginLeft: 16, marginTop: 16, anchor: 'top-left' },
        { width: 1536, height: 2727, logoWidth: 276, logoHeight: 125, marginRight: 10, marginBottom: 2, anchor: 'bottom-right' }
    ],
    dalle3: [
        { width: 1024, height: 1024, logoWidth: 120, logoHeight: 40, marginLeft: 20, marginBottom: 20, anchor: 'bottom-left' }
    ]
};

const GEMINI_ADDITIONAL = [
    { width: 384, height: 688, logoSize: 48, marginRight: 32, marginBottom: 32, tier: '0.5k' },
    { width: 688, height: 384, logoSize: 48, marginRight: 32, marginBottom: 32, tier: '0.5k' },
    { width: 768, height: 1376, logoSize: 96, marginRight: 64, marginBottom: 64, tier: '1k' },
    { width: 1376, height: 768, logoSize: 96, marginRight: 64, marginBottom: 64, tier: '1k' }
];
CATALOGS.gemini.push(...GEMINI_ADDITIONAL);

// Auto-register built-in catalogs
registry.addCatalogEntries('gemini', CATALOGS.gemini);
registry.addCatalogEntries('doubao', CATALOGS.doubao);
registry.addCatalogEntries('dalle3', CATALOGS.dalle3);

export const GEMINI_SIZE_CATALOG = CATALOGS.gemini;

export const WATERMARK_CONFIGS = {
    '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
    '1k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '2k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '4k': { logoSize: 96, marginRight: 64, marginBottom: 64 }
};

export function getAllCatalogConfigs(width, height, profileId = 'gemini') {
    return registry.findMatches(profileId, width, height);
}

export function getCatalogConfig(width, height, profileId = 'gemini') {
    const matches = getAllCatalogConfigs(width, height, profileId);
    return matches.length > 0 ? matches[0] : null;
}
