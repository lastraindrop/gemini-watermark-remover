import { calculateWatermarkPosition, getAllPotentialConfigs, DETECTION_THRESHOLDS } from './config.js';
import { calculateProbeConfidence, calculateCorrelation, detectWatermark, DetectorContext } from './detector.js';
import { detectAdaptiveWatermarkRegion } from './adaptiveDetector.js';
import { PROFILES } from './profiles.js';
import { decideDetectionTier } from './decisionPolicy.js';
import { removeWatermark } from './blendModes.js';
import { cloneImageData, calculateNearBlackRatio } from './utils.js';

const DEFAULT_PROBE_THRESHOLD = DETECTION_THRESHOLDS.DEFAULT_PROBE_THRESHOLD;
const DEFAULT_GLOBAL_FALLBACK_THRESHOLD = DETECTION_THRESHOLDS.GLOBAL_FALLBACK_MIN;
const DEFAULT_AUTO_NON_CATALOG_THRESHOLD = DETECTION_THRESHOLDS.AUTO_NON_CATALOG_MIN;

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

export function resolveAssetKey(profile, config, pos) {
    // BUG-C8 (STAGE_PLAN_v2.7 Phase A-4): alternate alpha variant. When a
    // matched config declares the 20260520 alpha variant (96px Gemini glyph
    // revised 2026-05-20), resolve to the dedicated alpha resource
    // ('96-20260520' -> src/assets/bg_96_20260520.png) instead of the
    // standard bg_96.png. Other configs keep the existing resolution path.
    if (config.alphaVariant === '20260520') {
        return '96-20260520';
    }
    if (profile.id === 'doubao' || profile.id === 'dalle3') {
        const width = config.logoWidth || config.logoSize || pos.width;
        const height = config.logoHeight || config.logoSize || pos.height;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return `${width}x${height}`;
        }
    }
    if (profile.assets) {
        return profile.assets[pos.anchor] || profile.assets[config.anchor];
    }
    if (config.assetKey) {
        return config.assetKey;
    }

    const squareSize = Number.isFinite(config.logoSize)
        ? config.logoSize
        : (config.logoWidth === config.logoHeight ? config.logoWidth : null);
    if (Number.isFinite(squareSize) && squareSize > 0) {
        return squareSize <= 48 ? '48' : '96';
    }

    return profile.defaultAsset || '96';
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

function validateManualConfig(imageData, manualConfig) {
    const { x, y, width, height, assetKey, forceProcess } = manualConfig || {};
    const values = { x, y, width, height };
    for (const [key, value] of Object.entries(values)) {
        if (!Number.isFinite(value)) {
            throw new RangeError(`Invalid manualConfig.${key}: expected a finite number`);
        }
    }
    if (width <= 0 || height <= 0) {
        throw new RangeError('Invalid manualConfig: width and height must be greater than 0');
    }
    if (x < 0 || y < 0 || x + width > imageData.width || y + height > imageData.height) {
        throw new RangeError('Invalid manualConfig: region must be inside the image bounds');
    }
    return { x, y, width, height, assetKey, forceProcess };
}

function isNearExpectedAnchor(imageData, detection, profileId, options = {}) {
    if (profileId !== 'gemini') return true;

    const potentialConfigs = [
        ...getAllPotentialConfigs(imageData.width, imageData.height, profileId),
        { logoSize: 96, marginRight: 64, marginBottom: 64 },
        { logoSize: 48, marginRight: 32, marginBottom: 32 }
    ];
    for (const config of potentialConfigs) {
        const pos = calculateWatermarkPosition(imageData.width, imageData.height, config);
        const sizeTolerance = Math.max(4, Math.min(pos.width, pos.height) * 0.15);
        // v2.6: Raised position tolerance from 10% to 20% — Gemini sometimes
        // offsets the watermark 5-15px from the standard anchor. At 10%, an
        // 11px offset on a 96px watermark (11.5%) would fail this check and
        // be classified as 'free' mode, requiring much higher confidence
        // (GLOBAL_FREE_MIN=0.35 vs FINAL_ANCHORED=0.15) and causing misses.
        // v2.7 Fix-8: Raised to 25% — observed 20-25px offsets in the wild
        // were still being classified as 'free' at 20%, causing near-misses
        // to jump from 0.15 threshold to 0.35 (2.3x harder to detect).
        const positionTolerance = Math.max(4, Math.min(pos.width, pos.height) * (options.positionTolerance ?? 0.25));
        const sizeMatches = Math.abs(detection.width - pos.width) <= sizeTolerance &&
            Math.abs(detection.height - pos.height) <= sizeTolerance;
        const positionMatches = Math.abs(detection.x - pos.x) <= positionTolerance &&
            Math.abs(detection.y - pos.y) <= positionTolerance;
        if (sizeMatches && positionMatches) return true;
    }
    return false;
}

async function ensureFallbackAlphaMaps(profileId, getAlphaMap, alphaMaps) {
    const profile = getProfile(profileId);
    if (profile.assets) {
        for (const assetKey of Object.values(profile.assets)) {
            const existingKey = Object.keys(alphaMaps).find(k => k === assetKey);
            if (!existingKey) {
                const map = await tryGetAlphaMap(getAlphaMap, assetKey, undefined, undefined);
                if (map) addAlphaMap(alphaMaps, map);
            }
        }
    }
    if (profile.defaultAsset) {
        const map = await tryGetAlphaMap(getAlphaMap, String(profile.defaultAsset), undefined, undefined);
        addAlphaMap(alphaMaps, map);
    }
    if (profileId === 'gemini') {
        for (const size of [48, 96]) {
            const map = await tryGetAlphaMap(getAlphaMap, String(size), size, size);
            addAlphaMap(alphaMaps, map);
        }
    }
}

/**
 * Phase 1.4: Compare 48px vs 96px template NCC at their respective anchor
 * positions. If one size scores significantly better, reorder configs to
 * favor the better-scoring template. This prevents using 96px when the
 * actual watermark is 48px (e.g. cropped/zoomed images).
 */
async function resolveBestTemplateOrder(imageData, configs, getAlphaMap) {
    const MIN_SWITCH_SCORE = 0.25;
    const MIN_SCORE_DELTA = 0.10;
    const positions = [];
    for (const config of configs) {
        const sz = config.logoSize || config.logoWidth || 96;
        if (sz !== 48 && sz !== 96) continue;
        const pos = calculateWatermarkPosition(imageData.width, imageData.height, config);
        const alphaMap = await tryGetAlphaMap(getAlphaMap, String(sz), pos.width, pos.height);
        if (!alphaMap) continue;
        const ncc = calculateCorrelation(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap.data, true);
        positions.push({ config, sz, pos, ncc });
    }

    if (positions.length < 2) return configs;

    positions.sort((a, b) => b.ncc - a.ncc);
    const best = positions[0];
    const second = positions[1];

    if (best.ncc >= MIN_SWITCH_SCORE && best.ncc > second.ncc + MIN_SCORE_DELTA && best.sz !== second.sz) {
        const reordered = [best.config, ...configs.filter(c => c !== best.config && c !== second.config)];
        if (second.ncc > 0.10) reordered.push(second.config);
        for (const c of configs) {
            if (!reordered.includes(c)) reordered.push(c);
        }
        return reordered;
    }

    return configs;
}

export async function detectProfileWatermarks({
    imageData,
    profileId,
    getAlphaMap,
    options = {}
}) {
    const profile = getProfile(profileId);
    const sharedContext = new DetectorContext();
    const detectionOptions = {
        deepScan: options.deepScan !== false,
        noiseReduction: options.noiseReduction === true,
        gradientPenalty: options.gradientPenalty,
        overrides: options.overrides
    };

    // v2.1: Manual Override Mode
    if (options.manualConfig) {
        const { x, y, width, height, assetKey, forceProcess } = validateManualConfig(imageData, options.manualConfig);
        // v2.6: Advanced overrides for difficult cases
        const alphaGainOverride = options.manualConfig.alphaGainOverride;
        const searchRangeOverride = options.manualConfig.searchRangeOverride;
        // Apply search range override to jitter if specified
        if (Number.isFinite(searchRangeOverride) && searchRangeOverride > 0) {
            detectionOptions.overrides = {
                ...detectionOptions.overrides,
                JITTER_RANGE: searchRangeOverride,
                JITTER_OFFICIAL: Math.max(2, Math.round(searchRangeOverride * 0.6))
            };
        }
        const alphaMap = await tryGetAlphaMap(getAlphaMap, assetKey || profile.defaultAsset || '96', width, height);
        if (alphaMap) {
            const verification = calculateProbeConfidence(imageData, { x, y, width, height }, alphaMap.data, profile.id, detectionOptions, sharedContext);
            // v2.5: forceProcess bypasses confidence gating for difficult images
            const confidence = forceProcess ? Math.max(verification.confidence, 1.0) : verification.confidence;
            // v2.6: Pass overrides through match.config for applyRemovalStrategy
            const matchConfig = { isOfficial: false, manual: true, logoWidth: width, logoHeight: height, forceProcess: !!forceProcess };
            if (Number.isFinite(alphaGainOverride) && alphaGainOverride > 0) {
                matchConfig.alphaGainOverride = alphaGainOverride;
            }
            return {
                profileId: profile.id,
                matches: [{
                    config: matchConfig,
                    pos: { x: verification.x, y: verification.y, width, height, anchor: 'manual' },
                    alphaMap: alphaMap.data,
                    confidence,
                    profileId: profile.id,
                    source: forceProcess ? 'manual-forced' : 'manual-input'
                }],
                winner: {
                    config: matchConfig,
                    pos: { x: verification.x, y: verification.y, width, height, anchor: 'manual' },
                    alphaMap: alphaMap.data,
                    confidence,
                    profileId: profile.id,
                    source: forceProcess ? 'manual-forced' : 'manual-input'
                },
                confidence
            };
        }
    }

    const probeThreshold = options.probeThreshold ?? DEFAULT_PROBE_THRESHOLD;
    
    const matches = [];
    const alphaMaps = {};

    // Phase 1.4: Resolve initial template config - compare 48px vs 96px NCC
    // to dynamically select the best template size before full probe
    let potentialConfigsRaw = getAllPotentialConfigs(imageData.width, imageData.height, profile.id);
    let potentialConfigs = potentialConfigsRaw;
    // v2.5: Gemini images can have either 48px or 96px watermarks regardless
    // of resolution, placed at various standard margin boundaries (32, 64, 96).
    // Always supplement the probe pool with both 48px and 96px templates at
    // all standard margins, so Phase 1.4 can compare and select the true geometric
    // winner. This prevents a larger template (e.g. 96px) from producing a moderate
    // false-positive correlation by partially overlapping/enclosing a smaller 
    // nested watermark (e.g. 48px).
    if (profileId === 'gemini') {
        const supplemented = [...potentialConfigsRaw];
        for (const size of [48, 96]) {
            for (const margin of [32, 64, 96, 192]) {
                const alreadyHas = supplemented.some(c => 
                    (c.logoSize === size || c.logoWidth === size) && 
                    c.marginRight === margin && 
                    c.marginBottom === margin
                );
                if (!alreadyHas) {
                    supplemented.push({ logoSize: size, marginRight: margin, marginBottom: margin, isOfficial: false });
                }
            }
        }
        potentialConfigs = await resolveBestTemplateOrder(imageData, supplemented, getAlphaMap);
    } else if (potentialConfigsRaw.length >= 2) {
        potentialConfigs = await resolveBestTemplateOrder(imageData, potentialConfigsRaw, getAlphaMap);
    }
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
            { ...detectionOptions, isScaledMatch: !!config.scaledFrom },
            sharedContext
        );
        // v2.3: Lowered scaled-from threshold from 0.35→0.25 to reduce missed
        // detections on cropped/resized images that still contain valid watermarks.
        const effectiveThreshold = config.scaledFrom
            ? Math.max(probeThreshold, 0.25)
            : (config.isOfficial ? probeThreshold : Math.max(probeThreshold, 0.22));
        if (verification.confidence > effectiveThreshold) {
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

    const fallbackBelow = options.globalFallbackBelow ?? DETECTION_THRESHOLDS.GLOBAL_FALLBACK_BELOW;
    const hasCatalogBackedMatch = matches.some(match => isCatalogBacked(match));

    // Phase 2.3: Adaptive multi-scale detection when catalog probes are weak.
    // v2.6: Removed the hasCatalogBackedMatch exclusion. Previously, a weak
    // catalog-backed match (confidence < fallbackBelow) would suppress adaptive
    // search entirely, causing misses on images where the catalog anchor is
    // correct but correlation is low (e.g. smooth/bright backgrounds, compression
    // artifacts). Now adaptive always runs when the best match is below threshold.
    const shouldRunAdaptive = options.adaptiveMode !== false && options.adaptiveMode !== 'off' &&
        (profileId === 'gemini' || profileId === 'doubao') &&
        (matches.length === 0 || matches[0].confidence < fallbackBelow);
    if (shouldRunAdaptive) {
        await ensureFallbackAlphaMaps(profile.id, getAlphaMap, alphaMaps);
        const defaultConfig = profile.getHeuristicConfig
            ? profile.getHeuristicConfig(imageData.width, imageData.height)
            : { logoSize: 96, marginRight: 64, marginBottom: 64 };
        const adaptiveResult = detectAdaptiveWatermarkRegion({
            imageData,
            alphaMaps,
            defaultConfig,
            threshold: options.adaptiveMinConfidence ?? 0.22
        });
        if (adaptiveResult) {
            const regionW = adaptiveResult.region.width;
            const regionH = adaptiveResult.region.height;
            const alphaMap = alphaMaps[`${regionW}x${regionH}`] || alphaMaps[String(regionW)] || alphaMaps[`${regionW}x${regionW}`];
            if (alphaMap) {
                const config = createConfigFromDetection(imageData, {
                    x: adaptiveResult.region.x,
                    y: adaptiveResult.region.y,
                    width: adaptiveResult.region.width,
                    height: adaptiveResult.region.height,
                    mode: 'adaptive'
                });
                upsertMatch(matches, {
                    config,
                    pos: {
                        x: adaptiveResult.region.x,
                        y: adaptiveResult.region.y,
                        width: adaptiveResult.region.width,
                        height: adaptiveResult.region.height,
                        anchor: config.anchor
                    },
                    alphaMap,
                    confidence: adaptiveResult.confidence,
                    profileId: profile.id,
                    source: 'adaptive-search'
                });
            }
        }
    }

    const shouldRunGlobalFallback = options.globalFallback !== false &&
        (matches.length === 0 || (!hasCatalogBackedMatch && matches[0].confidence < fallbackBelow));

    if (shouldRunGlobalFallback) {
        await ensureFallbackAlphaMaps(profile.id, getAlphaMap, alphaMaps);
    }
    if (shouldRunGlobalFallback && Object.keys(alphaMaps).length > 0) {
        const detection = detectWatermark(imageData, alphaMaps, detectionOptions);
        const minGlobalConfidence = options.fallbackThreshold ?? DEFAULT_GLOBAL_FALLBACK_THRESHOLD;
        const minFreeGlobalConfidence = options.globalFreeMinConfidence ?? DETECTION_THRESHOLDS.GLOBAL_FREE_MIN;
        const acceptsGlobalDetection = detection &&
            detection.confidence >= minGlobalConfidence &&
            (isNearExpectedAnchor(imageData, detection, profile.id, options) || detection.confidence >= minFreeGlobalConfidence);
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

    // v2.7 P0: Candidate validation via trial-removal. Ported from upstream
    // candidateSelector.js evaluateRestorationCandidate concept. For each
    // candidate match, do a quick trial removal and check:
    //   1. Does removal create excessive near-black pixels? (clipping artifact)
    //   2. Does removal actually reduce NCC? (if not, candidate is wrong position)
    // Candidates that fail validation are filtered out before final ranking.
    // This prevents false positives at wrong positions from winning.
    const MAX_NEAR_BLACK_INCREASE = 0.05;  // 5% new black pixels = likely false positive
    const MIN_IMPROVEMENT = 0.02;  // removal must reduce NCC by at least this

    if (matches.length > 0) {
        const validatedMatches = [];
        for (const match of matches) {
            // Skip validation for manual/forced matches
            if (match.source === 'manual-forced' || match.source === 'manual-input') {
                validatedMatches.push(match);
                continue;
            }

            // Trial removal: clone image, remove watermark, measure residual
            const trialImage = cloneImageData(imageData);
            const baselineNearBlack = calculateNearBlackRatio(trialImage, match.pos);

            // Use the match's alphaMap (already loaded)
            try {
                removeWatermark(trialImage, match.alphaMap, match.pos);
            } catch {
                // If removal crashes, the candidate is definitely bad
                continue;
            }

            const postNearBlack = calculateNearBlackRatio(trialImage, match.pos);
            const nearBlackIncrease = postNearBlack - baselineNearBlack;

            // Check: did removal create clipping artifacts?
            if (nearBlackIncrease > MAX_NEAR_BLACK_INCREASE) {
                // Too many new black pixels → false positive at wrong position
                continue;
            }

            // Check: did removal actually reduce watermark correlation?
            const postNCC = Math.abs(calculateCorrelation(
                trialImage, match.pos.x, match.pos.y,
                match.pos.width, match.pos.height, match.alphaMap, true
            ));
            const improvement = match.confidence - postNCC;

            // If removal didn't reduce NCC, the candidate position is likely wrong
            // (the "watermark signal" was a background texture coincidence)
            if (improvement < MIN_IMPROVEMENT && match.confidence < 0.40) {
                continue;
            }

            // Candidate passed validation — keep it
            validatedMatches.push(match);
        }

        // If all candidates were filtered, keep the top 1 as fallback
        // (better to attempt removal than return nothing)
        if (validatedMatches.length === 0 && matches.length > 0) {
            validatedMatches.push(matches[0]);
        }

        matches.length = 0;
        matches.push(...validatedMatches);
    }

    // v2.7 P1: shouldPreserveStrongStandardAnchor guard. Ported from upstream
    // candidateSelector.js pickBetterCandidate concept. When sorting matches,
    // a candidate at the canonical anchor position (catalog-probe or
    // heuristic-probe source) should NOT be replaced by a drifted candidate
    // (global-search or adaptive-search source) unless the drifted one offers
    // a clear confidence improvement. This prevents position errors where a
    // slightly-higher-NCC false positive at a wrong position wins over the
    // correct anchor match.
    matches.sort((a, b) => {
        const aIsAnchor = a.source === 'catalog-probe' || a.source === 'heuristic-probe';
        const bIsAnchor = b.source === 'catalog-probe' || b.source === 'heuristic-probe';
        const aIsDrifted = a.source === 'global-search' || a.source === 'global-free' ||
                           a.source === 'global-aligned' || a.source === 'adaptive-search';
        const bIsDrifted = b.source === 'global-search' || b.source === 'global-free' ||
                           b.source === 'global-aligned' || b.source === 'adaptive-search';

        // If both are same type (both anchor or both drifted), sort by confidence
        if (aIsAnchor === bIsAnchor) {
            return b.confidence - a.confidence;
        }

        // Anchor candidate vs drifted candidate:
        // Preserve anchor if it has reliable signal (confidence >= 0.20)
        // and the drifted candidate doesn't offer a clear improvement (> 0.08)
        if (aIsAnchor && bIsDrifted) {
            if (a.confidence >= 0.20 && (b.confidence - a.confidence) < 0.08) {
                return -1;  // keep anchor first
            }
            return b.confidence - a.confidence;
        }
        if (bIsAnchor && aIsDrifted) {
            if (b.confidence >= 0.20 && (a.confidence - b.confidence) < 0.08) {
                return 1;  // keep anchor first
            }
            return b.confidence - a.confidence;
        }

        return b.confidence - a.confidence;
    });
    const result = {
        profileId: profile.id,
        matches,
        winner: matches[0] || null,
        confidence: matches[0]?.confidence || 0
    };
    result.decisionTier = decideDetectionTier(result).tier;
    return result;
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
