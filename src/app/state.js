/**
 * Global application state
 */

export const state = {
    engine: null,
    imageQueue: [],
    processedCount: 0,
    zoom: null,
    isProcessing: false,
    totalRemovedCount: 0,
    batchSuccessCount: 0,
    inputDirHandle: null,
    outputDirHandle: null
};

export function resetWorkspaceGlobal(clearQueue = true, elements) {
    objectUrlManager.clear();
    if (elements) {
        elements.singlePreview.style.display = 'none';
        elements.multiPreview.style.display = 'none';
    }
    if (clearQueue) {
        state.imageQueue = [];
        state.processedCount = 0;
    }
}

export const objectUrlManager = {
    urls: new Set(),
    create(blob) {
        const url = URL.createObjectURL(blob);
        return this.register(url);
    },
    register(url) {
        if (!url) return url;
        this.urls.add(url);
        this.updateUI();
        return url;
    },
    revoke(url) {
        if (this.urls.has(url)) {
            URL.revokeObjectURL(url);
            this.urls.delete(url);
            this.updateUI();
        }
    },
    clear() {
        this.urls.forEach(url => URL.revokeObjectURL(url));
        this.urls.clear();
        this.updateUI();
    },
    updateUI() {
        const memoryCount = document.getElementById('memoryCount');
        if (memoryCount) {
            memoryCount.textContent = `OBJ:${this.urls.size}`;
            if (memoryCount.classList) {
                memoryCount.classList.toggle('hidden', this.urls.size === 0);
            }
        }
    }
};
