import { registry } from './templates/registry.js';
import catalogJSON from './catalogs.json' with { type: 'json' };

let _catalogData = null;
const _loadedProfiles = new Set();

function getCatalogData() {
    if (_catalogData) return _catalogData;

    _catalogData = catalogJSON || { WATERMARK_CONFIGS: {}, CATALOGS: { gemini: [], doubao: [], dalle3: [] } };

    return _catalogData;
}

function ensureProfileLoaded(profileId) {
    if (_loadedProfiles.has(profileId)) return;
    const data = getCatalogData();
    if (data.CATALOGS[profileId] && data.CATALOGS[profileId].length > 0) {
        registry.addCatalogEntries(profileId, data.CATALOGS[profileId]);
        _loadedProfiles.add(profileId);
    }
}

export const WATERMARK_CONFIGS = {
    get '0.5k'() { return getCatalogData().WATERMARK_CONFIGS['0.5k']; },
    get '1k'() { return getCatalogData().WATERMARK_CONFIGS['1k']; },
    get '2k'() { return getCatalogData().WATERMARK_CONFIGS['2k']; },
    get '4k'() { return getCatalogData().WATERMARK_CONFIGS['4k']; },
    // v2.7 BUG-C6: expose new Gemini anchor variants defined in catalogs.json
    get '2k-new-margin'() { return getCatalogData().WATERMARK_CONFIGS['2k-new-margin']; },
    get 'v2-small'() { return getCatalogData().WATERMARK_CONFIGS['v2-small']; },
    get 'large-margin'() { return getCatalogData().WATERMARK_CONFIGS['large-margin']; }
};

function buildCATALOGSProxy() {
    const knownProfiles = ['gemini', 'doubao', 'dalle3'];
    return new Proxy({}, {
        get(_, prop) {
            if (typeof prop === 'string') {
                ensureProfileLoaded(prop);
                return getCatalogData().CATALOGS[prop] || [];
            }
            return undefined;
        },
        ownKeys() { return knownProfiles; },
        has(_, prop) { return knownProfiles.includes(prop); },
        getOwnPropertyDescriptor(_, prop) {
            if (knownProfiles.includes(prop)) {
                return { configurable: true, enumerable: true, value: getCatalogData().CATALOGS[prop] };
            }
            return undefined;
        }
    });
}

export const CATALOGS = buildCATALOGSProxy();

ensureProfileLoaded('gemini');
ensureProfileLoaded('doubao');
ensureProfileLoaded('dalle3');

export { _catalogData as __internalCatalogData };

let _geminiCatalogLazy = null;

function getGeminiCatalog() {
    if (!_geminiCatalogLazy) {
        _geminiCatalogLazy = getCatalogData().CATALOGS.gemini || [];
    }
    return _geminiCatalogLazy;
}

Object.defineProperty(getGeminiCatalog, 'loaded', {
    get() { return _geminiCatalogLazy !== null; }
});

export const GEMINI_SIZE_CATALOG = new Proxy([], {
    get(target, prop) {
        const arr = getGeminiCatalog();
        if (prop === Symbol.iterator) return arr[Symbol.iterator].bind(arr);
        if (prop === 'slice') return arr.slice.bind(arr);
        if (prop === 'map') return arr.map.bind(arr);
        if (prop === 'filter') return arr.filter.bind(arr);
        if (prop === 'forEach') return arr.forEach.bind(arr);
        if (prop === 'find') return arr.find.bind(arr);
        if (prop === 'findIndex') return arr.findIndex.bind(arr);
        if (prop === 'some') return arr.some.bind(arr);
        if (prop === 'every') return arr.every.bind(arr);
        if (prop === 'reduce') return arr.reduce.bind(arr);
        if (prop === 'length') return arr.length;
        if (prop === 'constructor') return Array;
        if (typeof prop === 'string' && /^\d+$/.test(prop)) return arr[parseInt(prop)];
        if (typeof prop === 'symbol') return arr[prop];
        if (typeof arr[prop] === 'function') return arr[prop].bind(arr);
        return arr[prop];
    },
    has(_, prop) { return prop in getGeminiCatalog(); }
});

export function getAllCatalogConfigs(width, height, profileId = 'gemini') {
    ensureProfileLoaded(profileId);
    return registry.findMatches(profileId, width, height);
}

export function getCatalogConfig(width, height, profileId = 'gemini') {
    const matches = getAllCatalogConfigs(width, height, profileId);
    return matches.length > 0 ? matches[0] : null;
}

export function getScaledCatalogConfigs(width, height, profileId = 'gemini', options = {}) {
    const {
        maxRelativeAspectRatioDelta = 0.15,
        maxScaleMismatchRatio = 0.08,
        maxScaleDistance = 0.30,
        minLogoSize = 24,
        maxLogoSize = 192,
        limit = 4
    } = options;

    ensureProfileLoaded(profileId);
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

        const logoW = entry.logoWidth || entry.logoSize;
        const logoH = entry.logoHeight || entry.logoSize;
        const logoSize = Math.max(minLogoSize, Math.min(maxLogoSize, Math.round(((logoW + logoH) / 2) * scale)));
        const config = {
            ...entry,
            logoSize,
            logoWidth: entry.logoWidth ? Math.max(minLogoSize, Math.min(maxLogoSize, Math.round(entry.logoWidth * scaleX))) : undefined,
            logoHeight: entry.logoHeight ? Math.max(minLogoSize, Math.min(maxLogoSize, Math.round(entry.logoHeight * scaleY))) : undefined,
            marginRight: Math.max(4, Math.round(entry.marginRight * scaleX)),
            marginBottom: Math.max(4, Math.round(entry.marginBottom * scaleY)),
            marginLeft: Math.max(4, Math.round((entry.marginLeft || 0) * scaleX)),
            marginTop: Math.max(4, Math.round((entry.marginTop || 0) * scaleY)),
            isOfficial: false,
            scaledFrom: `${entry.width}x${entry.height}`
        };
        if (config.logoWidth) config.logoWidth = Math.max(minLogoSize, config.logoWidth);
        if (config.logoHeight) config.logoHeight = Math.max(minLogoSize, config.logoHeight);
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
        .map(c => c.config)
        .filter(config => {
            const key = `${config.logoSize}:${config.marginRight}:${config.marginBottom}:${config.scaledFrom}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit);
}
