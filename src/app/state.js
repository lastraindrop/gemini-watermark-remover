/**
 * Global application state
 */

export const state = {
    engine: null,
    imageQueue: [],
    processedCount: 0,
    zoom: null,
    isProcessing: false,
    activeSingleItem: null,
    totalRemovedCount: 0,
    batchSuccessCount: 0,
    inputDirHandle: null,
    outputDirHandle: null
};

/**
 * ObjectURL lifecycle manager with observer support.
 *
 * FE-BUG-H2: Previously app.js monkey-patched register/revoke/clear at
 * module load time to update a memory counter. That broke encapsulation
 * (permanently mutating an exported object) and made the counter logic
 * impossible to test in isolation. Now the manager exposes an onChange
 * callback that subscribers can register for — clean observer pattern.
 */
export const objectUrlManager = {
    urls: new Set(),
    _listeners: [],

    create(blob) {
        const url = URL.createObjectURL(blob);
        return this.register(url);
    },
    register(url) {
        if (!url) return url;
        this.urls.add(url);
        this._notify();
        return url;
    },
    revoke(url) {
        if (this.urls.has(url)) {
            URL.revokeObjectURL(url);
            this.urls.delete(url);
            this._notify();
        }
    },
    clear() {
        this.urls.forEach(url => URL.revokeObjectURL(url));
        this.urls.clear();
        this._notify();
    },
    /** Subscribe to URL count changes. Returns an unsubscribe function. */
    onChange(callback) {
        this._listeners.push(callback);
        return () => {
            const idx = this._listeners.indexOf(callback);
            if (idx !== -1) this._listeners.splice(idx, 1);
        };
    },
    _notify() {
        for (const cb of this._listeners) {
            try { cb(this.urls.size); } catch {}
        }
    }
};
