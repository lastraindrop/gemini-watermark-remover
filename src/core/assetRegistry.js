/**
 * Single source of truth for built-in alpha assets.
 *
 * Logical keys are stable pipeline-facing identifiers. Aliases allow catalog
 * dimensions to select a calibrated source asset while providers remain free
 * to resize it to the requested output dimensions.
 */
const ASSET_DEFINITIONS = Object.freeze({
    '48': { fileName: 'bg_48.png', inlineName: 'bg_48', width: 48, height: 48, profileId: 'gemini' },
    '96': { fileName: 'bg_96.png', inlineName: 'bg_96', width: 96, height: 96, profileId: 'gemini' },
    '96-20260520': {
        fileName: 'bg_96_20260520.png',
        inlineName: 'bg_96_20260520',
        width: 96,
        height: 96,
        profileId: 'gemini',
        variant: '20260520',
        sha256: 'B1FF0AE3DF78FF9DA540851E8728C10E5C35BDFE25AAD821C786C5491717B511'
    },
    // Paired source/watermarked fixtures show a ~3/255 RGB baseline in the
    // captured Doubao assets. Calibration belongs to these assets, not to the
    // profile, because callers may supply an exact synthetic alpha map.
    doubao: { fileName: 'bg_doubao.png', inlineName: 'bg_doubao', profileId: 'doubao', alphaBias: 3 / 255 },
    doubao_br: { fileName: 'bg_doubao_br.png', inlineName: 'bg_doubao_br', profileId: 'doubao', alphaBias: 3 / 255 },
    doubao_br_tall: { fileName: 'bg_doubao_br_tall.png', inlineName: 'bg_doubao_br_tall', profileId: 'doubao', alphaBias: 3 / 255 },
    doubao_tl: { fileName: 'bg_doubao_tl.png', inlineName: 'bg_doubao_tl', profileId: 'doubao', alphaBias: 3 / 255 },
    doubao_tl_tall: { fileName: 'bg_doubao_tl_tall.png', inlineName: 'bg_doubao_tl_tall', profileId: 'doubao', alphaBias: 3 / 255 },
    doubao_br_2k_tpl: { fileName: 'doubao_br_2k_tpl.png', inlineName: 'doubao_br_2k_tpl', profileId: 'doubao', alphaBias: 3 / 255 },
    doubao_tl_2k_tpl: { fileName: 'doubao_tl_2k_tpl.png', inlineName: 'doubao_tl_2k_tpl', profileId: 'doubao', alphaBias: 3 / 255 },
    doubao_tl_refined_mask: {
        fileName: 'doubao_tl_refined_mask.png',
        inlineName: 'doubao_tl_refined_mask',
        profileId: 'doubao',
        alphaBias: 3 / 255
    },
    '373x165': { aliasFor: 'doubao' },
    '307x167': { aliasFor: 'doubao_tl' },
    '401x173': { aliasFor: 'doubao_br' },
    '248x105': { aliasFor: 'doubao_tl_refined_mask' },
    '348x151': { aliasFor: 'doubao' },
    '221x109': { aliasFor: 'doubao_tl_tall' },
    '276x125': { aliasFor: 'doubao_br_tall' }
});

export function normalizeAssetKey(assetKey) {
    const rawKey = String(assetKey);
    if (ASSET_DEFINITIONS[rawKey]) return rawKey;
    const withoutPrefix = rawKey.replace(/^bg_/, '');
    if (ASSET_DEFINITIONS[withoutPrefix]) return withoutPrefix;
    const inlineEntry = Object.entries(ASSET_DEFINITIONS)
        .find(([, definition]) => definition.inlineName === rawKey);
    return inlineEntry?.[0] || withoutPrefix;
}

export function getAssetDefinition(assetKey) {
    const requestedKey = normalizeAssetKey(assetKey);
    const requested = ASSET_DEFINITIONS[requestedKey];
    if (!requested) return null;
    if (!requested.aliasFor) return { key: requestedKey, requestedKey, ...requested };
    const canonical = ASSET_DEFINITIONS[requested.aliasFor];
    if (!canonical || canonical.aliasFor) {
        throw new Error(`Invalid asset alias: ${requestedKey}`);
    }
    return {
        key: requested.aliasFor,
        requestedKey,
        ...canonical
    };
}

export function getAssetFileName(assetKey) {
    return getAssetDefinition(assetKey)?.fileName || null;
}

export function getInlineAssetName(assetKey) {
    return getAssetDefinition(assetKey)?.inlineName || null;
}

export function listAssetKeys() {
    return Object.keys(ASSET_DEFINITIONS);
}

export function hasAsset(assetKey) {
    return getAssetDefinition(assetKey) !== null;
}

export function resolveAssetKey(profile, config, position) {
    if (config.alphaVariant === '20260520') return '96-20260520';
    if (config.assetKey) return config.assetKey;

    if (profile.id === 'doubao') {
        const width = config.logoWidth || config.logoSize || position.width;
        const height = config.logoHeight || config.logoSize || position.height;
        const dimensionKey = `${width}x${height}`;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && hasAsset(dimensionKey)) {
            return dimensionKey;
        }
    }

    const profileAsset = profile.assets?.[position.anchor] || profile.assets?.[config.anchor];
    if (profileAsset) return profileAsset;

    const squareSize = Number.isFinite(config.logoSize)
        ? config.logoSize
        : (config.logoWidth === config.logoHeight ? config.logoWidth : null);
    if (Number.isFinite(squareSize) && squareSize > 0) return squareSize <= 48 ? '48' : '96';
    return profile.defaultAsset || '96';
}
