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
     * Find matching catalog entries for a given resolution
     */
    findMatches(profileId, width, height) {
        const catalog = this.getCatalog(profileId);
        const MAX_SCALE_MISMATCH = 0.05;
        
        return catalog.filter(entry => {
            const scaleX = width / entry.width;
            const scaleY = height / entry.height;
            const match = Math.abs(scaleX - scaleY) < MAX_SCALE_MISMATCH && Math.abs(scaleX - 1) < MAX_SCALE_MISMATCH;
            return match;
        }).map(entry => ({ ...entry, isOfficial: true }));
    }
}

// Global instance
export const registry = new TemplateRegistry();
