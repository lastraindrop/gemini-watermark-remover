/**
 * Watermark Template Registry
 * Decouples profile data from core logic, allowing for dynamic template expansion.
 */

export class TemplateRegistry {
    constructor() {
        this.profiles = new Map();
        this.catalogs = new Map();
    }

    /**
     * Register a new watermark profile
     * @param {Object} profile - { id, name, logoValue, anchors, tiers, assets, getHeuristicConfig }
     */
    registerProfile(profile) {
        if (!profile.id) throw new Error('Profile must have an id');
        this.profiles.set(profile.id, profile);
        if (!this.catalogs.has(profile.id)) {
            this.catalogs.set(profile.id, []);
        }
    }

    /**
     * Add resolution entries to a profile's catalog
     * @param {string} profileId 
     * @param {Array<Object>} entries 
     */
    addCatalogEntries(profileId, entries) {
        if (!this.catalogs.has(profileId)) {
            this.catalogs.set(profileId, []);
        }
        const catalog = this.catalogs.get(profileId);
        catalog.push(...entries);
    }

    getProfile(id) {
        return this.profiles.get(id);
    }

    getAllProfiles() {
        return Array.from(this.profiles.values());
    }

    getCatalog(profileId) {
        return this.catalogs.get(profileId) || [];
    }

    /**
     * Find matching catalog entries for a given resolution (strict).
     * Tolerance raised from 0.05 to 0.10 to handle slight rescaling.
     */
    findMatches(profileId, width, height) {
        const catalog = this.getCatalog(profileId);
        const STRICT_MATCH = 0.10;

        return catalog.filter(entry => {
            const scaleX = width / entry.width;
            const scaleY = height / entry.height;
            const scaleDelta = Math.abs(scaleX - scaleY);
            const scaleDeviation = Math.abs((scaleX + scaleY) / 2 - 1);
            return scaleDelta < STRICT_MATCH && scaleDeviation < STRICT_MATCH;
        }).map(entry => ({ ...entry, isOfficial: true }));
    }

    /**
     * Find close catalog matches with relaxed tolerance, sorted by scale similarity.
     * Used as a fallback when strict matches yield nothing.
     * @returns {Array<Object>} Sorted by closeness, with scaled config values
     */
    findCloseMatches(profileId, width, height, maxScaleDeviation = 0.25) {
        const catalog = this.getCatalog(profileId);
        const candidates = [];
        const targetAspectRatio = width / height;

        for (const entry of catalog) {
            const scaleX = width / entry.width;
            const scaleY = height / entry.height;
            const scale = (scaleX + scaleY) / 2;
            const scaleDelta = Math.abs(scaleX - scaleY);
            const scaleDeviation = Math.abs(scale - 1);
            const entryAspectRatio = entry.width / entry.height;
            const aspectDelta = Math.abs(targetAspectRatio - entryAspectRatio) / entryAspectRatio;

            if (scaleDeviation > maxScaleDeviation) continue;

            const logoW = entry.logoWidth || entry.logoSize;
            const logoH = entry.logoHeight || entry.logoSize;
            const scaledW = Math.max(16, Math.round(logoW * scale));
            const scaledH = Math.max(16, Math.round(logoH * scale));

            candidates.push({
                ...entry,
                logoSize: (logoW === logoH) ? scaledW : undefined,
                logoWidth: (entry.logoWidth) ? scaledW : undefined,
                logoHeight: (entry.logoHeight) ? scaledH : undefined,
                marginRight: Math.max(4, Math.round((entry.marginRight || 0) * scale)),
                marginBottom: Math.max(4, Math.round((entry.marginBottom || 0) * scale)),
                marginLeft: entry.marginLeft ? Math.max(4, Math.round(entry.marginLeft * scale)) : undefined,
                marginTop: entry.marginTop ? Math.max(4, Math.round(entry.marginTop * scale)) : undefined,
                isOfficial: false,
                scaledFrom: `${entry.width}x${entry.height}`,
                _score: scaleDelta * 50 + aspectDelta * 30 + scaleDeviation * 20
            });
        }

        const seen = new Set();
        return candidates
            .sort((a, b) => a._score - b._score)
            .map(({ _score, ...rest }) => rest)
            .filter(config => {
                const key = `${config.logoSize || config.logoWidth}x${config.logoSize || config.logoHeight}:${config.marginRight}:${config.marginBottom}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }
}

// Global instance
export const registry = new TemplateRegistry();
