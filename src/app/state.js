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

export const objectUrlManager = {
    urls: new Set(),
    create(blob) {
        const url = URL.createObjectURL(blob);
        return this.register(url);
    },
    register(url) {
        if (!url) return url;
        this.urls.add(url);
        return url;
    },
    revoke(url) {
        if (this.urls.has(url)) {
            URL.revokeObjectURL(url);
            this.urls.delete(url);
        }
    },
    clear() {
        this.urls.forEach(url => URL.revokeObjectURL(url));
        this.urls.clear();
    }
};
