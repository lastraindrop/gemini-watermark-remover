import { calculateWatermarkPosition, getAllPotentialConfigs, DETECTION_THRESHOLDS } from './config.js';
import { calculateProbeConfidence, calculateCorrelation, detectWatermark, DetectorContext } from './detector.js';
import { detectAdaptiveWatermarkRegion } from './adaptiveDetector.js';
import { PROFILES } from './profiles.js';
import { decideDetectionTier } from './decisionPolicy.js';
import { removeWatermark } from './blendModes.js';
import { cloneImageData, calculateNearBlackRatio } from './utils.js';
import { resolveAssetKey } from './assetRegistry.js';
import { compareDetectionCandidates, upsertBestOverlappingCandidate } from './candidateGeometry.js';

export { resolveAssetKey } from './assetRegistry.js';

const DEFAULT_PROBE_THRESHOLD = DETECTION_THRESHOLDS.DEFAULT_PROBE_THRESHOLD;
const DEFAULT_GLOBAL_FALLBACK_THRESHOLD = DETECTION_THRESHOLDS.GLOBAL_FALLBACK_MIN;
const DEFAULT_AUTO_NON_CATALOG_THRESHOLD = DETECTION_THRESHOLDS.AUTO_NON_CATALOG_MIN;

export function getProfilesToTry(requestedProfileId = 'gemini') {
    if (requestedProfileId === 'auto') {
        return Object.values(PROFILES).map(profile => profile.id);
    }
    if (!PROFILES[requestedProfileId]) {
        throw new Error(`Unknown profile: ${requestedProfileId}`);
    }
    return [requestedProfileId];
}

function getProfile(profileId) {
    return PROFILES[profileId];
}

function normalizeAlphaMap(alphaMap, width, height, assetKey) {
    if (!alphaMap) return null;
    if (alphaMap.data) {
        return {
            data: alphaMap.data,
            width: alphaMap.width || width,
            height: alphaMap.height || height,
            assetKey: alphaMap.assetKey || assetKey,
            alphaBias: alphaMap.alphaBias || 0
        };
    }
    return { data: alphaMap, width, height, assetKey, alphaBias: 0 };
}

async function tryGetAlphaMap(getAlphaMap, assetKey, width, height) {
    try {
        return normalizeAlphaMap(await getAlphaMap(assetKey, width, height), width, height, assetKey);
    } catch {
        return null;
    }
}

function addAlphaMap(alphaMaps, alphaMap, metadata) {
    if (!alphaMap?.data) return;
    const { width, height, assetKey } = alphaMap;
    metadata.set(alphaMap.data, { assetKey: assetKey || null, alphaBias: alphaMap.alphaBias || 0 });
    alphaMaps[`${width}x${height}`] = alphaMap.data;
    if (width === height) alphaMaps[String(width)] = alphaMap.data;
    if (assetKey) alphaMaps[String(assetKey)] = alphaMap.data;
}

function upsertMatch(matches, match) {
    upsertBestOverlappingCandidate(matches, match);
}

function isCatalogBacked(match) {
    return match?.config?.isOfficial || match?.config?.scaledFrom || match?.source === 'catalog-probe';
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
        const positionTolerance = Math.max(
            DETECTION_THRESHOLDS.POSITION_TOLERANCE_MIN_PX,
            Math.min(pos.width, pos.height) * (options.positionTolerance ?? DETECTION_THRESHOLDS.POSITION_TOLERANCE_FACTOR)
        );
        const sizeMatches = Math.abs(detection.width - pos.width) <= sizeTolerance &&
            Math.abs(detection.height - pos.height) <= sizeTolerance;
        const positionMatches = Math.abs(detection.x - pos.x) <= positionTolerance &&
            Math.abs(detection.y - pos.y) <= positionTolerance;
        if (sizeMatches && positionMatches) return true;
    }
    return false;
}

async function ensureFallbackAlphaMaps(profileId, getAlphaMap, alphaMaps, metadata) {
    const profile = getProfile(profileId);
    if (profile.assets) {
        for (const assetKey of Object.values(profile.assets)) {
            const existingKey = Object.keys(alphaMaps).find(k => k === assetKey);
            if (!existingKey) {
                const map = await tryGetAlphaMap(getAlphaMap, assetKey, undefined, undefined);
                if (map) addAlphaMap(alphaMaps, map, metadata);
            }
        }
    }
    if (profile.defaultAsset) {
        const map = await tryGetAlphaMap(getAlphaMap, String(profile.defaultAsset), undefined, undefined);
        addAlphaMap(alphaMaps, map, metadata);
    }
    if (profileId === 'gemini') {
        for (const size of [48, 96]) {
            const map = await tryGetAlphaMap(getAlphaMap, String(size), size, size);
            addAlphaMap(alphaMaps, map, metadata);
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
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    const sharedContext = new DetectorContext();
    const detectionOptions = {
        deepScan: options.deepScan !== false,
        noiseReduction: options.noiseReduction === true,
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
                    alphaBias: alphaMap.alphaBias,
                    assetKey: alphaMap.assetKey,
                    confidence,
                    profileId: profile.id,
                    source: forceProcess ? 'manual-forced' : 'manual-input'
                }],
                winner: {
                    config: matchConfig,
                    pos: { x: verification.x, y: verification.y, width, height, anchor: 'manual' },
                    alphaMap: alphaMap.data,
                    alphaBias: alphaMap.alphaBias,
                    assetKey: alphaMap.assetKey,
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
    const alphaMapMetadata = new WeakMap();

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
        addAlphaMap(alphaMaps, alphaMap, alphaMapMetadata);

        const verification = calculateProbeConfidence(
            imageData,
            pos,
            alphaMap.data,
            profile.id,
            { ...detectionOptions, isScaledMatch: !!config.scaledFrom, isOfficial: !!config.isOfficial },
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
                alphaBias: alphaMap.alphaBias,
                assetKey: alphaMap.assetKey,
                confidence: verification.confidence,
                profileId: profile.id,
                source: config.isOfficial ? 'catalog-probe' : 'heuristic-probe'
            });
        }
    }

    matches.sort((a, b) => b.confidence - a.confidence);

    const fallbackBelow = options.globalFallbackBelow ?? DETECTION_THRESHOLDS.GLOBAL_FALLBACK_BELOW;
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
        await ensureFallbackAlphaMaps(profile.id, getAlphaMap, alphaMaps, alphaMapMetadata);
        const defaultConfig = profile.getHeuristicConfig
            ? profile.getHeuristicConfig(imageData.width, imageData.height)
            : { logoSize: 96, marginRight: 64, marginBottom: 64 };
        const adaptiveResult = detectAdaptiveWatermarkRegion({
            imageData,
            alphaMaps,
            defaultConfig,
            threshold: options.adaptiveMinConfidence ?? DETECTION_THRESHOLDS.ADAPTIVE_MIN_CONFIDENCE
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
                    alphaBias: alphaMapMetadata.get(alphaMap)?.alphaBias || 0,
                    assetKey: alphaMapMetadata.get(alphaMap)?.assetKey || null,
                    confidence: adaptiveResult.confidence,
                    profileId: profile.id,
                    source: 'adaptive-search'
                });
            }
        }
    }

    // Adaptive insertion may change the best candidate. Re-rank before deciding
    // whether the bounded/global fallback is still required.
    matches.sort((a, b) => b.confidence - a.confidence);

    const shouldRunGlobalFallback = options.globalFallback !== false &&
        (matches.length === 0 || matches[0].confidence < fallbackBelow);

    if (shouldRunGlobalFallback) {
        await ensureFallbackAlphaMaps(profile.id, getAlphaMap, alphaMaps, alphaMapMetadata);
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
                    alphaBias: alphaMapMetadata.get(alphaMap)?.alphaBias || 0,
                    assetKey: alphaMapMetadata.get(alphaMap)?.assetKey || null,
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
    const candidateTrace = matches.map(match => ({
        profileId: match.profileId,
        source: match.source,
        confidence: match.confidence,
        assetKey: resolveAssetKey(profile, match.config, match.pos),
        pos: { ...match.pos },
        config: { ...match.config }
    }));
    const validationTrace = [];
    const MAX_NEAR_BLACK_INCREASE = DETECTION_THRESHOLDS.CANDIDATE_MAX_NEAR_BLACK_INCREASE;
    const MIN_IMPROVEMENT = DETECTION_THRESHOLDS.CANDIDATE_MIN_RESTORATION_IMPROVEMENT;
    const MAX_REGRESSION = DETECTION_THRESHOLDS.CANDIDATE_MAX_RESTORATION_REGRESSION;
    const STRONG_SIGNAL_MIN_CONFIDENCE = DETECTION_THRESHOLDS.CANDIDATE_STRONG_SIGNAL_MIN_CONFIDENCE;

    if (matches.length > 0 && options.candidateValidation !== false) {
        const validatedMatches = [];
        for (const match of matches) {
            // Skip validation for manual/forced matches
            if (match.source === 'manual-forced' || match.source === 'manual-input') {
                validatedMatches.push(match);
                validationTrace.push({ source: match.source, pos: { ...match.pos }, accepted: true, reason: 'manual' });
                continue;
            }

            // Trial removal: clone image, remove watermark, measure residual
            const trialImage = cloneImageData(imageData);
            const baselineNearBlack = calculateNearBlackRatio(trialImage, match.pos);
            const baselineNCC = Math.abs(calculateCorrelation(
                imageData, match.pos.x, match.pos.y,
                match.pos.width, match.pos.height, match.alphaMap, true
            ));

            // Use the match's alphaMap (already loaded)
            try {
                removeWatermark(trialImage, match.alphaMap, match.pos, { alphaBias: match.alphaBias || 0 });
            } catch {
                // If removal crashes, the candidate is definitely bad
                validationTrace.push({ source: match.source, pos: { ...match.pos }, accepted: false, reason: 'trial-error' });
                continue;
            }

            const postNearBlack = calculateNearBlackRatio(trialImage, match.pos);
            const nearBlackIncrease = postNearBlack - baselineNearBlack;

            // Check: did removal create clipping artifacts?
            if (nearBlackIncrease > MAX_NEAR_BLACK_INCREASE) {
                validationTrace.push({
                    source: match.source,
                    pos: { ...match.pos },
                    accepted: false,
                    reason: 'near-black',
                    baselineNCC,
                    nearBlackIncrease
                });
                // Too many new black pixels → false positive at wrong position
                continue;
            }

            // Check: did removal actually reduce watermark correlation?
            const postNCC = Math.abs(calculateCorrelation(
                trialImage, match.pos.x, match.pos.y,
                match.pos.width, match.pos.height, match.alphaMap, true
            ));
            const improvement = baselineNCC - postNCC;

            // Confidence describes watermark-like input evidence; it cannot
            // authorize a restoration that measurably makes the template
            // residual worse. This gate is unconditional and fail-closed.
            if (improvement < -MAX_REGRESSION) {
                validationTrace.push({
                    source: match.source,
                    pos: { ...match.pos },
                    accepted: false,
                    reason: 'restoration-regression',
                    baselineNCC,
                    postNCC,
                    improvement,
                    nearBlackIncrease
                });
                continue;
            }

            // If removal didn't reduce NCC, the candidate position is likely wrong
            // (the "watermark signal" was a background texture coincidence)
            if (improvement < MIN_IMPROVEMENT && match.confidence < STRONG_SIGNAL_MIN_CONFIDENCE) {
                validationTrace.push({
                    source: match.source,
                    pos: { ...match.pos },
                    accepted: false,
                    reason: 'insufficient-restoration-improvement',
                    baselineNCC,
                    postNCC,
                    improvement,
                    nearBlackIncrease
                });
                continue;
            }

            // Candidate passed validation — keep it
            validatedMatches.push(match);
            validationTrace.push({
                source: match.source,
                pos: { ...match.pos },
                accepted: true,
                reason: 'validated',
                baselineNCC,
                postNCC,
                improvement,
                nearBlackIncrease
            });
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
    matches.sort(compareDetectionCandidates);
    const result = {
        profileId: profile.id,
        matches,
        winner: matches[0] || null,
        confidence: matches[0]?.confidence || 0
    };
    result.decisionTier = decideDetectionTier(result).tier;
    result.trace = {
        profileId: profile.id,
        candidateCount: candidateTrace.length,
        acceptedCount: matches.length,
        candidates: candidateTrace,
        validations: validationTrace,
        decisionTier: result.decisionTier,
        winner: matches[0]
            ? { source: matches[0].source, confidence: matches[0].confidence, pos: { ...matches[0].pos } }
            : null
    };
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
