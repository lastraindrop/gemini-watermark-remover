import { registry } from './templates/registry.js';

/**
 * Multi-Profile Resolution Catalog
 */

export const WATERMARK_CONFIGS = {
    '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
    '1k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '2k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '4k': { logoSize: 96, marginRight: 64, marginBottom: 64 }
};

function createGeminiEntries(modelFamily, tier, rows) {
    const config = WATERMARK_CONFIGS[tier];
    return rows.map(([aspectRatio, width, height]) => ({
        modelFamily,
        aspectRatio,
        width,
        height,
        ...config,
        tier
    }));
}

function dedupeCatalog(entries) {
    const seen = new Set();
    return entries.filter(entry => {
        const key = [
            entry.width,
            entry.height,
            entry.logoSize || entry.logoWidth,
            entry.logoHeight || entry.logoSize,
            entry.marginRight || 0,
            entry.marginBottom || 0,
            entry.marginLeft || 0,
            entry.marginTop || 0,
            entry.anchor || 'bottom-right'
        ].join(':');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

const GEMINI_CATALOG = dedupeCatalog([
    ...createGeminiEntries('gemini-3.x-image', '0.5k', [
        ['1:1', 512, 512],
        ['1:4', 256, 1024],
        ['1:8', 192, 1536],
        ['2:3', 424, 632],
        ['3:2', 632, 424],
        ['3:4', 448, 600],
        ['4:1', 1024, 256],
        ['4:3', 600, 448],
        ['4:5', 464, 576],
        ['5:4', 576, 464],
        ['8:1', 1536, 192],
        ['9:16', 384, 688],
        ['16:9', 688, 384],
        ['21:9', 792, 168]
    ]),
    ...createGeminiEntries('gemini-3.x-image', '1k', [
        ['1:1', 1024, 1024],
        ['1:4', 512, 2064],
        ['1:8', 352, 2928],
        ['2:3', 848, 1264],
        ['3:2', 1264, 848],
        ['3:4', 896, 1200],
        ['4:1', 2064, 512],
        ['4:3', 1200, 896],
        ['4:5', 928, 1152],
        ['5:4', 1152, 928],
        ['8:1', 2928, 352],
        ['9:16', 768, 1376],
        ['16:9', 1376, 768],
        ['16:9', 1408, 768],
        ['21:9', 1584, 672]
    ]),
    ...createGeminiEntries('gemini-3.x-image', '2k', [
        ['1:1', 2048, 2048],
        ['1:4', 512, 2048],
        ['1:8', 384, 3072],
        ['2:3', 1696, 2528],
        ['3:2', 2528, 1696],
        ['3:4', 1792, 2400],
        ['4:1', 2048, 512],
        ['4:3', 2400, 1792],
        ['4:5', 1856, 2304],
        ['5:4', 2304, 1856],
        ['8:1', 3072, 384],
        ['9:16', 1536, 2752],
        ['16:9', 2752, 1536],
        ['21:9', 3168, 1344]
    ]),
    ...createGeminiEntries('gemini-3.x-image', '4k', [
        ['1:1', 4096, 4096],
        ['1:4', 2048, 8192],
        ['1:8', 1536, 12288],
        ['2:3', 3392, 5056],
        ['3:2', 5056, 3392],
        ['3:4', 3584, 4800],
        ['4:1', 8192, 2048],
        ['4:3', 4800, 3584],
        ['4:5', 3712, 4608],
        ['5:4', 4608, 3712],
        ['8:1', 12288, 1536],
        ['9:16', 3072, 5504],
        ['16:9', 5504, 3072],
        ['21:9', 6336, 2688]
    ]),
    ...createGeminiEntries('gemini-2.5-flash-image', '1k', [
        ['1:1', 1024, 1024],
        ['2:3', 832, 1248],
        ['3:2', 1248, 832],
        ['3:4', 864, 1184],
        ['4:3', 1184, 864],
        ['4:5', 896, 1152],
        ['5:4', 1152, 896],
        ['9:16', 768, 1344],
        ['16:9', 1344, 768],
        ['21:9', 1536, 672]
    ])
]);

export const CATALOGS = {
    gemini: GEMINI_CATALOG,
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

// Auto-register built-in catalogs
registry.addCatalogEntries('gemini', CATALOGS.gemini);
registry.addCatalogEntries('doubao', CATALOGS.doubao);
registry.addCatalogEntries('dalle3', CATALOGS.dalle3);

export const GEMINI_SIZE_CATALOG = CATALOGS.gemini;

export function getAllCatalogConfigs(width, height, profileId = 'gemini') {
    return registry.findMatches(profileId, width, height);
}

export function getCatalogConfig(width, height, profileId = 'gemini') {
    const matches = getAllCatalogConfigs(width, height, profileId);
    return matches.length > 0 ? matches[0] : null;
}

export function getScaledCatalogConfigs(width, height, profileId = 'gemini', options = {}) {
    const {
        maxRelativeAspectRatioDelta = 0.05,
        maxScaleMismatchRatio = 0.08,
        maxScaleDistance = 0.30,
        minLogoSize = 24,
        maxLogoSize = 192,
        limit = 4
    } = options;

    const catalog = registry.getCatalog(profileId);
    const targetAspectRatio = width / height;
    const candidates = [];

    for (const entry of catalog) {
        const scaleX = width / entry.width;
        const scaleY = height / entry.height;
        const scale = (scaleX + scaleY) / 2;
        const entryAspectRatio = entry.width / entry.height;
        const relativeAspectRatioDelta = Math.abs(targetAspectRatio - entryAspectRatio) / entryAspectRatio;
        const scaleMismatchRatio = Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY);

        if (relativeAspectRatioDelta > maxRelativeAspectRatioDelta) continue;
        if (scaleMismatchRatio > maxScaleMismatchRatio) continue;
        if (Math.abs(scale - 1) > maxScaleDistance) continue;

        const logoSize = Math.max(minLogoSize, Math.min(maxLogoSize, Math.round(entry.logoSize * scale)));
        const config = {
            ...entry,
            logoSize,
            marginRight: Math.max(4, Math.round(entry.marginRight * scaleX)),
            marginBottom: Math.max(4, Math.round(entry.marginBottom * scaleY)),
            isOfficial: false,
            scaledFrom: `${entry.width}x${entry.height}`
        };
        candidates.push({
            config,
            score:
                relativeAspectRatioDelta * 100 +
                scaleMismatchRatio * 20 +
                Math.abs(Math.log2(Math.max(scale, 1e-6)))
        });
    }

    const seen = new Set();
    return candidates
        .sort((a, b) => a.score - b.score)
        .map(candidate => candidate.config)
        .filter(config => {
            const key = `${config.logoSize}:${config.marginRight}:${config.marginBottom}:${config.scaledFrom}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit);
}
