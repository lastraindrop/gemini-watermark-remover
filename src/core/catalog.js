 /**
 * Official Gemini resolution catalog and their watermark configurations.
 * Based on GargantuaX/gemini-watermark-remover data.
 *
 * [IMPORTANT] SINGLE SOURCE OF TRUTH:
 * All core offsets (logoSize, marginRight, marginBottom) MUST be maintained here.
 * Any modification to these constants will trigger a cascade effect across
 * tests, CLI, and UI. Run `npm test` after any changes to ensure consistency.
 */

export const WATERMARK_CONFIGS = {
    '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
    '1k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '2k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '4k': { logoSize: 96, marginRight: 64, marginBottom: 64 }
};

// Common Gemini resolutions and their tiers
export const GEMINI_SIZE_CATALOG = [
    // 0.5k Tier (logo: 48, margin: 32)
    { width: 512, height: 512, tier: '0.5k' },   // 1:1
    { width: 384, height: 688, tier: '0.5k' },   // 9:16
    { width: 688, height: 384, tier: '0.5k' },   // 16:9
    { width: 424, height: 632, tier: '0.5k' },   // 2:3
    { width: 632, height: 424, tier: '0.5k' },   // 3:2
    { width: 792, height: 168, tier: '0.5k' },   // 21:9

    // 1k Tier (logo: 96, margin: 64)
    { width: 1024, height: 1024, tier: '1k' },   // 1:1
    { width: 768, height: 1376, tier: '1k' },    // 9:16
    { width: 1376, height: 768, tier: '1k' },     // 16:9
    { width: 848, height: 1264, tier: '1k' },    // 2:3
    { width: 1264, height: 848, tier: '1k' },    // 3:2
    { width: 1584, height: 672, tier: '1k' },    // 21:9
    { width: 1536, height: 672, tier: '1k' },    // Gemini 1.5 Flash 21:9

    // 2k Tier (logo: 96, margin: 64)
    { width: 2048, height: 2048, tier: '2k' },
    { width: 1536, height: 2752, tier: '2k' },
    { width: 2752, height: 1536, tier: '2k' },
    { width: 1696, height: 2528, tier: '2k' },
    { width: 2528, height: 1696, tier: '2k' },
    { width: 3168, height: 1344, tier: '2k' },

    // 4k Tier (logo: 96, margin: 64)
    { width: 4096, height: 4096, tier: '4k' },   // 1:1
    { width: 3072, height: 5504, tier: '4k' },   // 9:16
    { width: 5504, height: 3072, tier: '4k' },   // 16:9
    { width: 3392, height: 5056, tier: '4k' },   // 2:3
    { width: 5056, height: 3392, tier: '4k' },   // 3:2
    { width: 6336, height: 2688, tier: '4k' }    // 21:9
];

/**
 * Find the best matching config for a given resolution
 */
export function getCatalogConfig(width, height) {
    const MAX_SCALE_MISMATCH = 0.02; // 2% tolerance

    for (const entry of GEMINI_SIZE_CATALOG) {
        const scaleX = width / entry.width;
        const scaleY = height / entry.height;
        
        // Exact match or very close uniform scale
        if (Math.abs(scaleX - scaleY) < MAX_SCALE_MISMATCH && Math.abs(scaleX - 1) < MAX_SCALE_MISMATCH) {
            return { ...WATERMARK_CONFIGS[entry.tier], isOfficial: true };
        }
    }
    return null;
}
