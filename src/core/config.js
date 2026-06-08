import { getAllCatalogConfigs, getScaledCatalogConfigs } from './catalog.js';
import { getProfile } from './profiles.js';

export const ENGINE_LIMITS = {
    MAX_PIXELS: 8000 * 8000, // 64MP
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    MAX_CONCURRENCY: 4
};

/**
 * v2.3: Unified detection thresholds — single source of truth.
 * Imported by detector.js, detectionPipeline.js, and decisionPolicy.js.
 * Individual modules may apply further adjustments (e.g. mode bonuses).
 */
export const DETECTION_THRESHOLDS = {
    // Phase 1: Catalog & Anchor Probe
    ANCHORED_OFFICIAL: 0.18,   // Official-size catalog match at anchor position
    ANCHORED_OTHER: 0.22,      // Non-official anchored match
    STRICT_EXIT: 0.60,         // Early-exit confidence (rarely triggered; full pipeline preferred)

    // Phase 2: Heuristic Global Search
    COARSE: 0.10,              // Grid-search coarse filter
    STAGE2_NR: 0.10,           // Second-stage threshold with noise reduction
    STAGE2_CLEAN: 0.12,        // Second-stage threshold on clean images

    // Phase 3: Final Ranking
    FINAL_ANCHORED: 0.15,      // Mode: anchored
    FINAL_ALIGNED: 0.18,       // Mode: aligned
    FINAL_FREE: 0.22,          // Mode: free (no anchor/alignment match)

    // Pipeline-level
    DEFAULT_PROBE_THRESHOLD: 0.18,
    SCALED_CONFIG_MIN: 0.25,   // v2.3: lowered from 0.35
    NON_CATALOG_MIN: 0.22,
    GLOBAL_FALLBACK_BELOW: 0.30,
    GLOBAL_FALLBACK_MIN: 0.25,
    GLOBAL_FREE_MIN: 0.35,       // v2.4: lowered from 0.50 — non-anchor positions should not require near-perfect confidence
    AUTO_NON_CATALOG_MIN: 0.28,    // v2.4: lowered from 0.35 — auto mode should not reject faint-but-valid non-catalog detections

    // Adaptive detector
    ADAPTIVE_MIN_CONFIDENCE: 0.22,

    // Search geometry
    SEARCH_RANGE_X: 0.90,      // v2.3: expanded from 0.75
    SEARCH_RANGE_Y: 0.90,      // v2.3: expanded from 0.75
    CANDIDATES_LIMIT_PER_SIZE: 5,
    PROXIMITY_THRESHOLD: 8,
    FINE_TUNE_RANGE: 4,
    JITTER_RANGE: 6,
    JITTER_OFFICIAL: 4,

    // Scoring weights
    SPATIAL_WEIGHT: 0.5,
    GRADIENT_WEIGHT: 0.3,
    VARIANCE_WEIGHT: 0.2,

    // Local contrast
    LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN: 0.008,  // v2.3: lowered from 0.015
    LOCAL_CONTRAST_MIN_COUNT_FACTOR: 20,        // denominator for min count = (w*h) / factor / step^2
};

/**
 * v2.3: Performance presets — trade speed vs. detection coverage.
 *
 * Each preset maps to a concrete set of engine overrides. Users select
 * their preferred balance via the settings panel; the engine applies the
 * corresponding overrides transparently.
 *
 * | Preset   | Search | DeepScan | Jitter | Fine-tune | Adaptive | NoiseRed | Speed   |
 * |----------|--------|----------|--------|-----------|----------|----------|---------|
 * | fast     | 60%    | off      | 2-3 px | 2 px      | off      | off      | ~1×     |
 * | balanced | 75%    | on       | 4-6 px | 4 px      | on       | off      | ~2×     |
 * | thorough | 90%    | on       | 6-8 px | 8 px      | on       | on (auto)| ~4×     |
 */
export const PERFORMANCE_PRESETS = {
    fast: {
        label: 'Fast',
        description: 'Quick scan, suitable for known-size images',
        deepScan: false,
        noiseReduction: false,
        adaptiveMode: 'off',
        overrides: {
            RANGE_X: 0.60,
            RANGE_Y: 0.60,
            CANDIDATES_LIMIT_PER_SIZE: 3,
            PROXIMITY_THRESHOLD: 12,
            FINE_TUNE_RANGE: 2,
            JITTER_RANGE: 3,
            JITTER_OFFICIAL: 2,
            THRESHOLDS: {
                COARSE: 0.12,
                FINAL_ANCHORED: 0.18,
                FINAL_ALIGNED: 0.20,
                FINAL_FREE: 0.25
            }
        }
    },
    balanced: {
        label: 'Balanced',
        description: 'Good accuracy with moderate speed (default)',
        deepScan: true,
        noiseReduction: false,
        adaptiveMode: 'auto',
        overrides: {
            RANGE_X: 0.75,
            RANGE_Y: 0.75,
            CANDIDATES_LIMIT_PER_SIZE: 5,
            PROXIMITY_THRESHOLD: 8,
            FINE_TUNE_RANGE: 4,
            JITTER_RANGE: 6,
            JITTER_OFFICIAL: 4,
            THRESHOLDS: {
                COARSE: 0.10,
                FINAL_ANCHORED: 0.15,
                FINAL_ALIGNED: 0.18,
                FINAL_FREE: 0.22
            }
        }
    },
    thorough: {
        label: 'Thorough',
        description: 'Maximum detection coverage, slower',
        deepScan: true,
        noiseReduction: true,
        adaptiveMode: 'auto',
        overrides: {
            RANGE_X: 0.90,
            RANGE_Y: 0.90,
            CANDIDATES_LIMIT_PER_SIZE: 8,
            PROXIMITY_THRESHOLD: 6,
            FINE_TUNE_RANGE: 8,
            JITTER_RANGE: 8,
            JITTER_OFFICIAL: 6,
            THRESHOLDS: {
                COARSE: 0.08,
                FINAL_ANCHORED: 0.12,
                FINAL_ALIGNED: 0.15,
                FINAL_FREE: 0.18
            }
        }
    }
};

/** @type {keyof typeof PERFORMANCE_PRESETS} */
export const DEFAULT_PERFORMANCE_PRESET = 'balanced';

/**
 * Detect watermark configuration (tiers/size) for a given resolution.
 * Prefers Catalog (Precise) -> Profile Heuristics (Approximate).
 */
export function detectWatermarkConfig(imageWidth, imageHeight, profileId = 'gemini') {
    // 1. Try Catalog-based matching (Highly precise)
    // For non-Gemini, there might be multiple (TL, BR). Return the official ones.
    const catalogMatches = getAllCatalogConfigs(imageWidth, imageHeight, profileId);
    if (catalogMatches.length > 0) return { ...catalogMatches[0], isOfficial: true };

    // 2. Profile-based Heuristic fallback
    const profile = getProfile(profileId);
    if (profile.getHeuristicConfig) {
        return profile.getHeuristicConfig(imageWidth, imageHeight);
    }

    // 3. Global Legacy Fallback
    // Aligned with upstream GargantuaX logic: use 96px when both sides > 1024
    const use96 = imageWidth > 1024 && imageHeight > 1024;
    return {
        logoSize: use96 ? 96 : 48,
        marginRight: use96 ? 64 : 32,
        marginBottom: use96 ? 64 : 32,
        isOfficial: false
    };
}

/**
 * Get all potential configs for detailed search
 */
export function getAllPotentialConfigs(imageWidth, imageHeight, profileId = 'gemini') {
    const catalogMatches = getAllCatalogConfigs(imageWidth, imageHeight, profileId);
    if (catalogMatches.length > 0) {
        const exactMatches = catalogMatches.filter(config => config.width === imageWidth && config.height === imageHeight);
        if (exactMatches.length > 0) return exactMatches;
    }

    if (profileId === 'gemini') {
        const scaledMatches = getScaledCatalogConfigs(imageWidth, imageHeight, profileId);
        if (scaledMatches.length > 0) return scaledMatches;
    }

    if (catalogMatches.length > 0) return catalogMatches;

    const profile = getProfile(profileId);
    if (profile.getHeuristicConfig) {
        const anchors = profile.anchors || ['bottom-right'];
        const configs = anchors.map(anchor => profile.getHeuristicConfig(imageWidth, imageHeight, anchor));
        if (profileId === 'gemini') {
            const has48 = configs.some(c => (c.logoSize || c.logoWidth) === 48);
            const has96 = configs.some(c => (c.logoSize || c.logoWidth) === 96);
            if (!has48) configs.push({ logoSize: 48, marginRight: 32, marginBottom: 32, isOfficial: false });
            if (!has96) configs.push({ logoSize: 96, marginRight: 64, marginBottom: 64, isOfficial: false });
        }
        return configs;
    }
    
    return [detectWatermarkConfig(imageWidth, imageHeight, profileId)];
}

/**
 * Calculate actual pixel coordinates from config
 */
export function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { 
        logoSize, logoWidth, logoHeight, 
        marginRight, marginBottom, 
        marginLeft, marginTop,
        anchor = 'bottom-right' 
    } = config;

    const w = logoWidth || logoSize;
    const h = logoHeight || logoSize;

    let x, y;

    switch (anchor) {
        case 'top-left':
            x = marginLeft || 0;
            y = marginTop || 0;
            break;
        case 'top-right':
            x = imageWidth - (marginRight || 0) - w;
            y = marginTop || 0;
            break;
        case 'bottom-left':
            x = marginLeft || 0;
            y = imageHeight - (marginBottom || 0) - h;
            break;
        case 'bottom-right':
        default:
            x = imageWidth - (marginRight || 0) - w;
            y = imageHeight - (marginBottom || 0) - h;
            break;
    }

    return { x, y, width: w, height: h, anchor };
}
