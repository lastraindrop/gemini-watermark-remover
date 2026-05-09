import { calculateWatermarkPosition, getAllPotentialConfigs } from './config.js';
import { calculateProbeConfidence, detectWatermark } from './detector.js';
import { PROFILES } from './profiles.js';

const DEFAULT_PROBE_THRESHOLD = 0.10;
const DEFAULT_GLOBAL_FALLBACK_THRESHOLD = 0.40;
const DEFAULT_AUTO_NON_CATALOG_THRESHOLD = 0.40;

export function getProfilesToTry(requestedProfileId = 'gemini') {
    if (requestedProfileId === 'auto') {
        return Object.values(PROFILES)
            .filter(profile => !profile.experimental)
            .map(profile => profile.id);
    }
    return [requestedProfileId];
}

function getProfile(profileId) {
    return PROFILES[profileId] || PROFILES.gemini;
}

function resolveAssetKey(profile, config, pos) {
    if (profile.assets) {
        return profile.assets[pos.anchor] || profile.assets[config.anchor];
    }
    return config.assetKey || profile.defaultAsset || config.logoSize || '96';
}

function normalizeAlphaMap(alphaMap, width, height, assetKey) {
    if (!alphaMap) return null;
    if (alphaMap.data) {
        return {
            data: alphaMap.data,
            width: alphaMap.width || width,
            height: alphaMap.height || height,
            assetKey: alphaMap.assetKey || assetKey
        };
    }
    return { data: alphaMap, width, height, assetKey };
}

async function tryGetAlphaMap(getAlphaMap, assetKey, width, height) {
    try {
        return normalizeAlphaMap(await getAlphaMap(assetKey, width, height), width, height, assetKey);
    } catch {
        return null;
    }
}

function addAlphaMap(alphaMaps, alphaMap) {
    if (!alphaMap?.data) return;
    const { width, height, assetKey } = alphaMap;
    alphaMaps[`${width}x${height}`] = alphaMap.data;
    if (width === height) alphaMaps[String(width)] = alphaMap.data;
    if (assetKey) alphaMaps[String(assetKey)] = alphaMap.data;
}

function isOverlapping(a, b) {
    const ax = a.pos.x + a.pos.width / 2;
    const ay = a.pos.y + a.pos.height / 2;
    const bx = b.pos.x + b.pos.width / 2;
    const by = b.pos.y + b.pos.height / 2;
    const limitX = Math.max(8, Math.min(a.pos.width, b.pos.width) / 2);
    const limitY = Math.max(8, Math.min(a.pos.height, b.pos.height) / 2);
    return Math.abs(ax - bx) < limitX && Math.abs(ay - by) < limitY;
}

function upsertMatch(matches, match) {
    const existingIndex = matches.findIndex(existing => isOverlapping(existing, match));
    if (existingIndex === -1) {
        matches.push(match);
        return;
    }
    if (match.confidence > matches[existingIndex].confidence) {
        matches[existingIndex] = match;
    }
}

function createConfigFromDetection(imageData, detection) {
    const marginRight = Math.max(0, Math.round(imageData.width - detection.x - detection.width));
    const marginBottom = Math.max(0, Math.round(imageData.height - detection.y - detection.height));
    const config = {
        marginRight,
        marginBottom,
        anchor: 'bottom-right',
        isOfficial: false,
        detectionMode: detection.mode
    };
    if (detection.width === detection.height) {
        config.logoSize = detection.width;
    } else {
        config.logoWidth = detection.width;
        config.logoHeight = detection.height;
    }
    return config;
}

function isCatalogBacked(match) {
    return match?.config?.isOfficial || match?.config?.scaledFrom || match?.source === 'catalog-probe';
}

function isNearExpectedAnchor(imageData, detection, profileId) {
    if (profileId !== 'gemini') return true;

    const potentialConfigs = [
        ...getAllPotentialConfigs(imageData.width, imageData.height, profileId),
        { logoSize: 96, marginRight: 64, marginBottom: 64 },
        { logoSize: 48, marginRight: 32, marginBottom: 32 }
    ];
    for (const config of potentialConfigs) {
        const pos = calculateWatermarkPosition(imageData.width, imageData.height, config);
        const sizeTolerance = Math.max(4, Math.min(pos.width, pos.height) * 0.15);
        const positionTolerance = Math.max(10, Math.min(pos.width, pos.height) * 0.20);
        const sizeMatches = Math.abs(detection.width - pos.width) <= sizeTolerance &&
            Math.abs(detection.height - pos.height) <= sizeTolerance;
        const positionMatches = Math.abs(detection.x - pos.x) <= positionTolerance &&
            Math.abs(detection.y - pos.y) <= positionTolerance;
        if (sizeMatches && positionMatches) return true;
    }
    return false;
}

async function ensureFallbackAlphaMaps(profileId, getAlphaMap, alphaMaps) {
    if (profileId !== 'gemini') return;
    for (const size of [48, 96]) {
        const map = await tryGetAlphaMap(getAlphaMap, String(size), size, size);
        addAlphaMap(alphaMaps, map);
    }
}

export async function detectProfileWatermarks({
    imageData,
    profileId,
    getAlphaMap,
    options = {}
}) {
    const profile = getProfile(profileId);
    const detectionOptions = {
        deepScan: options.deepScan !== false,
        noiseReduction: options.noiseReduction === true
    };
    const threshold = options.threshold ?? DEFAULT_PROBE_THRESHOLD;
    const matches = [];
    const alphaMaps = {};

    const potentialConfigs = getAllPotentialConfigs(imageData.width, imageData.height, profile.id);
    for (const config of potentialConfigs) {
        const pos = calculateWatermarkPosition(imageData.width, imageData.height, config);
        if (pos.width <= 0 || pos.height <= 0) continue;

        const assetKey = resolveAssetKey(profile, config, pos);
        const alphaMap = await tryGetAlphaMap(getAlphaMap, assetKey, pos.width, pos.height);
        if (!alphaMap) continue;
        addAlphaMap(alphaMaps, alphaMap);

        const verification = calculateProbeConfidence(
            imageData,
            pos,
            alphaMap.data,
            profile.id,
            detectionOptions
        );
        if (verification.confidence > threshold) {
            upsertMatch(matches, {
                config,
                pos: { ...pos, x: verification.x, y: verification.y },
                alphaMap: alphaMap.data,
                confidence: verification.confidence,
                profileId: profile.id,
                source: config.isOfficial ? 'catalog-probe' : 'heuristic-probe'
            });
        }
    }

    matches.sort((a, b) => b.confidence - a.confidence);

    const fallbackBelow = options.globalFallbackBelow ?? 0.30;
    const hasCatalogBackedMatch = matches.some(match => isCatalogBacked(match));
    const shouldRunGlobalFallback = options.globalFallback !== false &&
        (matches.length === 0 || (!hasCatalogBackedMatch && matches[0].confidence < fallbackBelow));

    if (shouldRunGlobalFallback) {
        await ensureFallbackAlphaMaps(profile.id, getAlphaMap, alphaMaps);
    }
    if (shouldRunGlobalFallback && Object.keys(alphaMaps).length > 0) {
        const detection = detectWatermark(imageData, alphaMaps, detectionOptions);
        const minGlobalConfidence = options.globalFallbackMinConfidence ?? DEFAULT_GLOBAL_FALLBACK_THRESHOLD;
        const minFreeGlobalConfidence = options.globalFreeMinConfidence ?? 0.78;
        const acceptsGlobalDetection = detection &&
            detection.confidence >= minGlobalConfidence &&
            (isNearExpectedAnchor(imageData, detection, profile.id) || detection.confidence >= minFreeGlobalConfidence);
        if (acceptsGlobalDetection) {
            const alphaMap = alphaMaps[`${detection.width}x${detection.height}`] ||
                alphaMaps[String(detection.width)] ||
                alphaMaps[String(detection.height)];
            if (alphaMap) {
                const config = createConfigFromDetection(imageData, detection);
                upsertMatch(matches, {
                    config,
                    pos: {
                        x: detection.x,
                        y: detection.y,
                        width: detection.width,
                        height: detection.height,
                        anchor: config.anchor
                    },
                    alphaMap,
                    confidence: detection.confidence,
                    profileId: profile.id,
                    source: `global-${detection.mode || 'search'}`
                });
            }
        }
    }

    matches.sort((a, b) => b.confidence - a.confidence);
    return {
        profileId: profile.id,
        matches,
        winner: matches[0] || null,
        confidence: matches[0]?.confidence || 0
    };
}

export async function detectWatermarks({
    imageData,
    profileId = 'gemini',
    getAlphaMap,
    options = {}
}) {
    let overallBest = null;
    for (const id of getProfilesToTry(profileId)) {
        const result = await detectProfileWatermarks({
            imageData,
            profileId: id,
            getAlphaMap,
            options
        });
        if (!overallBest || result.confidence > overallBest.confidence) {
            overallBest = result;
        }
    }
    const minAutoConfidence = options.autoNonCatalogMinConfidence ?? DEFAULT_AUTO_NON_CATALOG_THRESHOLD;
    if (
        profileId === 'auto' &&
        overallBest?.winner &&
        !isCatalogBacked(overallBest.winner) &&
        overallBest.confidence < minAutoConfidence
    ) {
        return {
            profileId,
            matches: [],
            winner: null,
            confidence: 0
        };
    }
    return overallBest || {
        profileId,
        matches: [],
        winner: null,
        confidence: 0
    };
}
