import i18n from './i18n.js';
import { WatermarkEngine } from './core/watermarkEngine.js';
import { showLoading, showLoadingFail, hideLoading } from './dom-utils.js';
import { getAllProfiles } from './core/profiles.js';
import { DETECTION_THRESHOLDS } from './core/config.js';

import { state, objectUrlManager } from './app/state.js';
import { AuditLog, showToast, resetGlobalProgress } from './app/ui.js';
import { downloadImage, downloadAllAsZip, processSingle } from './app/processing.js';
import { setupWindowDragAndDrop, handleFiles } from './app/dragDrop.js';
import { setupKeyboardShortcuts } from './app/keyboard.js';
import { setupLanguageSelector, saveSettings, loadSettings, getEngineOptions, syncTogglesToPreset } from './app/settings.js';
import { applyProfileTheme } from './app/viewModes.js';
import { clearManualRegion, setupManualSelection, setManualSelectionEnabled, updateManualSelectionOverlay, writeManualRegion, showManualSelectCanvas, hideManualSelectCanvas } from './app/manualSelection.js';

let _pkgVersion = null;
async function getVersion() {
    if (_pkgVersion) return _pkgVersion;
    try {
        const pkg = await import('../package.json');
        _pkgVersion = pkg.default?.version || pkg.version || 'dev';
    } catch {
        _pkgVersion = 'dev';
    }
    return _pkgVersion;
}

/**
 * FE-BUG-L7: Synchronize HTML slider default values with DETECTION_THRESHOLDS
 * so config changes propagate to the UI without manually editing HTML.
 * Called before loadSettings() so saved user values still take priority.
 */
function syncSliderDefaults() {
    if (elements.thresholdSlider && !elements.thresholdSlider.dataset.userTouched) {
        const defaultThreshold = DETECTION_THRESHOLDS.DEFAULT_PROBE_THRESHOLD;
        if (Number.isFinite(defaultThreshold)) {
            elements.thresholdSlider.value = String(defaultThreshold);
            if (elements.thresholdVal) elements.thresholdVal.textContent = defaultThreshold.toFixed(2);
        }
    }
    if (elements.penaltySlider && !elements.penaltySlider.dataset.userTouched) {
        const defaultPenalty = DETECTION_THRESHOLDS.GRADIENT_PENALTY_DEFAULT;
        if (Number.isFinite(defaultPenalty)) {
            elements.penaltySlider.value = String(defaultPenalty);
            if (elements.penaltyVal) elements.penaltyVal.textContent = defaultPenalty.toFixed(2);
        }
    }
}

const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    folderInput: document.getElementById('folderInput'),
    chooseFileBtn: document.getElementById('chooseFileBtn'),
    chooseFolderBtn: document.getElementById('chooseFolderBtn'),
    profileSelect: document.getElementById('profileSelect'),
    multiPreview: document.getElementById('multiPreview'),
    imageList: document.getElementById('imageList'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    resetAreaBtn: document.getElementById('resetAreaBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    auditConsole: document.getElementById('auditConsole'),
    auditConsoleToggle: document.getElementById('auditConsoleToggle'),
    toggleAdvancedBtn: document.getElementById('toggleAdvancedBtn'),
    advancedPanel: document.getElementById('advancedPanel'),
    thresholdSlider: document.getElementById('thresholdSlider'),
    thresholdVal: document.getElementById('thresholdVal'),
    penaltySlider: document.getElementById('penaltySlider'),
    penaltyVal: document.getElementById('penaltyVal'),
    manualModeToggle: document.getElementById('manualModeToggle'),
    manualCoords: document.getElementById('manualCoords'),
    manualX: document.getElementById('manualX'),
    manualY: document.getElementById('manualY'),
    manualW: document.getElementById('manualW'),
    manualH: document.getElementById('manualH'),
    manualUseDetectedBtn: document.getElementById('manualUseDetectedBtn'),
    manualClearBtn: document.getElementById('manualClearBtn'),
    manualReprocessBtn: document.getElementById('manualReprocessBtn')
    // v2.7 FE-BUG-C1/L3: removed reprocessBtn, manualSelectionLayer,
    // manualSelectionBox — these DOM elements were deleted in v2.6 but
    // references lingered as dead code.
};

// v2.3: Performance preset — radiogroup, provide getter/setter to read and restore current value
Object.defineProperty(elements, 'performanceSelect', {
    get() {
        const checked = document.querySelector('input[name="performancePreset"]:checked');
        return checked ? { value: checked.value } : { value: 'balanced' };
    },
    set(val) {
        const radio = document.querySelector(`input[name="performancePreset"][value="${val}"]`)
            || document.querySelector('input[name="performancePreset"][value="balanced"]');
        if (radio) radio.checked = true;
    },
    enumerable: true,
    configurable: true
});

async function init() {
    const loadingTimeout = setTimeout(() => {
        hideLoading();
    }, 8000);

    try {
        // Display version from package.json
        const versionEl = document.getElementById('versionDisplay');
        if (versionEl) {
            getVersion().then(v => { versionEl.textContent = `v${v}`; });
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations()
                .then(registrations => registrations.forEach(registration => registration.unregister()))
                .catch(() => {});
        }

        AuditLog.log('Neural engine initializing...', 'process');

        // Wire retry button for loading failure recovery
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());

        if (elements.profileSelect) {
            getAllProfiles().filter(p => !p.experimental).forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                elements.profileSelect.appendChild(opt);
            });

            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.setAttribute('data-i18n', 'settings.autoDetect');
            autoOpt.textContent = i18n.t('settings.autoDetect');
            elements.profileSelect.appendChild(autoOpt);

            elements.profileSelect.value = 'gemini';
            elements.profileSelect.addEventListener('change', () => {
                saveSettings(elements);
                const p = getAllProfiles().find(x => x.id === elements.profileSelect.value);
                if (p) applyProfileTheme(p);
                AuditLog.log(`Switched to ${elements.profileSelect.value} profile`, 'info');
            });
        }

        await i18n.init();
        setupLanguageSelector(elements);

        // v2.6: Sync HTML lang attribute and tool button titles after i18n load
        document.documentElement.lang = i18n.locale;
        const darkBtn = document.getElementById('darkModeToggle');
        if (darkBtn) { darkBtn.title = i18n.t('btn.darkMode') || 'Toggle dark mode'; darkBtn.setAttribute('aria-label', darkBtn.title); }
        const advBtn = document.getElementById('toggleAdvancedBtn');
        if (advBtn) { advBtn.title = i18n.t('btn.advanced') || 'Advanced Settings'; advBtn.setAttribute('aria-label', advBtn.title); }
        const resetBtn = document.getElementById('resetAreaBtn');
        if (resetBtn) { resetBtn.title = i18n.t('btn.reset') || 'Reset'; resetBtn.setAttribute('aria-label', resetBtn.title); }
        const upload = document.getElementById('uploadArea');
        if (upload) upload.setAttribute('aria-label', i18n.t('upload.text') || 'Upload Area');

        showLoading(i18n.t('status.loading'));

        state.engine = await WatermarkEngine.create();
        AuditLog.log(`Core ready (Execution: ${state.engine.getExecutionMode()})`, 'success');

        hideLoading();
        clearTimeout(loadingTimeout);
        syncSliderDefaults();
        setupEventListeners();
        loadSettings(elements);
        syncTogglesToPreset(elements);
    } catch (error) {
        clearTimeout(loadingTimeout);
        AuditLog.log(`Critical Fault: ${error.message}`, 'err');
        showLoadingFail(error.message);
    }
}

function setupEventListeners() {
    const handleFilesWrapper = (files) => handleFiles(files, elements,
        updateCardUI,
        updateCardErrorUI,
        onBatchComplete
    );

    elements.fileInput?.addEventListener('change', (e) => handleFilesWrapper(Array.from(e.target.files)));
    elements.folderInput?.addEventListener('change', (e) => handleFilesWrapper(Array.from(e.target.files)));
    elements.chooseFileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.fileInput?.click();
    });
    elements.chooseFolderBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.folderInput?.click();
    });

    elements.uploadArea?.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.closest('button')) return;
        elements.fileInput?.click();
    });

    elements.uploadArea?.addEventListener('keydown', (e) => {
        if (e.target instanceof Element && e.target.closest('button')) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        elements.fileInput?.click();
    });

    setupWindowDragAndDrop(elements, handleFilesWrapper);
    setupKeyboardShortcuts(elements, resetWorkspace);

    elements.downloadAllBtn?.addEventListener('click', async () => {
        const completedItems = state.imageQueue.filter(item => item.status === 'success');
        if (completedItems.length === 0 || elements.downloadAllBtn.disabled) return;

        elements.downloadAllBtn.disabled = true;
        elements.downloadAllBtn.classList.add('opacity-60', 'cursor-wait');
        try {
            AuditLog.log(`Preparing ZIP bundle for ${completedItems.length} files`, 'process');
            const count = await downloadAllAsZip(completedItems, {
                filename: `gwr_batch_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
            });
            showToast(i18n.t('toast.downloading', { count }), 'info');
        } catch (error) {
            AuditLog.log(`ZIP export failed: ${error.message}`, 'err');
            showToast(error.message, 'err');
        } finally {
            elements.downloadAllBtn.disabled = false;
            elements.downloadAllBtn.classList.remove('opacity-60', 'cursor-wait');
        }
    });

    elements.resetAreaBtn?.addEventListener('click', () => resetWorkspace());
    elements.clearAllBtn?.addEventListener('click', () => resetWorkspace());
    document.getElementById('exportLogBtn')?.addEventListener('click', () => AuditLog.exportCSV());
    elements.auditConsoleToggle?.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.closest('#exportLogBtn')) return;
        const panel = elements.auditConsole;
        if (!panel) return;
        const isOpen = panel.classList.contains('translate-y-0');
        if (isOpen) {
            panel.classList.remove('translate-y-0');
            panel.classList.add('translate-y-[calc(100%-48px)]');
        } else {
            panel.classList.add('translate-y-0');
            panel.classList.remove('translate-y-[calc(100%-48px)]');
        }
    });

    elements.toggleAdvancedBtn?.addEventListener('click', () => {
        elements.advancedPanel?.classList.toggle('hidden');
    });

    elements.thresholdSlider?.addEventListener('input', (e) => {
        if (elements.thresholdVal) elements.thresholdVal.textContent = e.target.value;
    });

    elements.penaltySlider?.addEventListener('input', (e) => {
        if (elements.penaltyVal) elements.penaltyVal.textContent = e.target.value;
    });

    // v2.6: Manual override sliders
    const agSlider = document.getElementById('manualAlphaGain');
    const agVal = document.getElementById('manualAlphaGainVal');
    agSlider?.addEventListener('input', (e) => { if (agVal) agVal.textContent = parseFloat(e.target.value).toFixed(2); });
    const srSlider = document.getElementById('manualSearchRange');
    const srVal = document.getElementById('manualSearchRangeVal');
    srSlider?.addEventListener('input', (e) => { if (srVal) srVal.textContent = e.target.value; });

    // v2.3: Performance preset radio buttons — persist choice + sync toggles
    document.querySelectorAll('input[name="performancePreset"]').forEach(radio => {
        radio.addEventListener('change', () => {
            syncTogglesToPreset(elements);
            saveSettings(elements);
            AuditLog.log(`Performance preset: ${radio.value}`, 'info');
        });
    });

    elements.manualModeToggle?.addEventListener('change', (e) => {
        const active = e.target.checked;
        setManualControlsActive(active);
        if (active) {
            // v2.5: Show manual selection canvas with original image
            const item = getActiveSingleItem();
            if (item?.originalUrl) {
                showManualSelectCanvas(elements, item.originalUrl);
            }
            AuditLog.log('Manual Mode enabled', 'warn');
        } else {
            hideManualSelectCanvas();
        }
    });

    elements.manualUseDetectedBtn?.addEventListener('click', () => useDetectedAreaForManualMode());
    elements.manualClearBtn?.addEventListener('click', () => {
        clearManualRegion(elements);
        AuditLog.log('Manual region cleared', 'info');
    });
    elements.manualReprocessBtn?.addEventListener('click', () => reprocessSingleWithManualArea());

    // v2.7 FE-BUG-C1/C2: Removed the reprocessBtn click handler (lines 300-334).
    // #reprocessBtn and #resultContainer DOM elements were deleted in v2.6
    // when #singlePreview was removed. This handler was dead code — it could
    // never fire because the button didn't exist, and line 312 would have
    // thrown TypeError (elements.reprocessBtn.setAttribute on null without
    // optional chaining). The manualReprocessBtn above serves the same
    // "re-process with current settings" purpose for manual mode.

    setupManualSelection(elements, {
        onSelection: () => {
            if (elements.manualModeToggle) elements.manualModeToggle.checked = true;
            elements.manualCoords?.classList.remove('opacity-40', 'pointer-events-none');
        }
    });
}

function setManualControlsActive(active) {
    elements.manualCoords?.classList.toggle('opacity-40', !active);
    elements.manualCoords?.classList.toggle('pointer-events-none', !active);
    const canvas = document.getElementById('manualSelectCanvas');
    if (canvas) canvas.classList.toggle('hidden', !active);
    setManualSelectionEnabled(elements, active);
}

function getActiveSingleItem() {
    return state.activeSingleItem || (state.imageQueue.length === 1 ? state.imageQueue[0] : null);
}

function getRegionFromDetection(pos, config) {
    const x = Number(pos?.x);
    const y = Number(pos?.y);
    const width = Number(pos?.width ?? config?.logoWidth ?? config?.logoSize);
    const height = Number(pos?.height ?? config?.logoHeight ?? config?.logoSize);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { x, y, width, height };
}

function useDetectedAreaForManualMode() {
    const item = getActiveSingleItem();
    const region = item?.lastDetectedRegion;
    if (!region) {
        showToast(i18n.t('toast.detectedAreaMissing'), 'info');
        return;
    }

    if (elements.manualModeToggle) elements.manualModeToggle.checked = true;
    setManualControlsActive(true);
    writeManualRegion(elements, region);
    updateManualSelectionOverlay(elements);
    AuditLog.log(`Manual region seeded from detection (${region.x}, ${region.y}, ${region.width}x${region.height})`, 'info');
}

async function reprocessSingleWithManualArea() {
    if (state.isProcessing) {
        showToast(i18n.t('toast.processingBusy'), 'info');
        return;
    }
    const item = getActiveSingleItem();
    if (!item) {
        showToast(i18n.t('toast.manualSingleOnly'), 'info');
        return;
    }

    if (elements.manualModeToggle) elements.manualModeToggle.checked = true;
    setManualControlsActive(true);

    let options;
    try {
        options = getEngineOptions(elements);
    } catch (error) {
        showToast(error.message || i18n.t('toast.manualAreaRequired'), 'err');
        return;
    }

    if (!options.manualConfig) {
        showToast(i18n.t('toast.manualAreaRequired'), 'info');
        return;
    }

    state.isProcessing = true;
    elements.manualReprocessBtn?.setAttribute('disabled', 'true');
    elements.manualReprocessBtn?.classList.add('opacity-60', 'cursor-wait');
    // v2.7 FE-BUG-C2: resultContainer DOM element was deleted in v2.6.
    // The scan-active class is now applied to the image card instead.
    const activeCard = document.getElementById(`card-${item.id}`);
    activeCard?.querySelector('.scanner-effect')?.classList.add('scan-active');

    try {
        await processSingle(item, options, {
            onSuccess: ({ item: processedItem, config, pos }) => {
                setActiveItem(processedItem, config, pos);
                updateManualSelectionOverlay(elements);
                AuditLog.log(`Manual region processed (${options.manualConfig.x}, ${options.manualConfig.y}, ${options.manualConfig.width}x${options.manualConfig.height})`, 'success');
            },
            onError: (error) => {
                showToast(error?.message || i18n.t('status.error'), 'err');
            }
        });
    } finally {
        activeCard?.querySelector('.scanner-effect')?.classList.remove('scan-active');
        elements.manualReprocessBtn?.removeAttribute('disabled');
        elements.manualReprocessBtn?.classList.remove('opacity-60', 'cursor-wait');
        state.isProcessing = false;
    }
}

/**
 * v2.6: Minimal active-item tracker. Replaces updateSingleUI which wrote to
 * the now-removed #singlePreview section (sliderOriginal, sideOriginal,
 * comparisonSlider, statsView, tierBadge, magnifier, downloadBtn). Only
 * activeSingleItem and lastDetectedRegion are needed by reprocess/manual mode.
 */
function setActiveItem(item, config, pos) {
    state.activeSingleItem = item;
    item.lastDetectedRegion = getRegionFromDetection(pos, config);
    AuditLog.log(`[PASS] ${item.name}`, 'success');
    setManualSelectionEnabled(elements, elements.manualModeToggle?.checked === true);
}

function updateCardUI(item, removedCount, confidence, latency) {
    const loader = document.getElementById(`loader-${item.id}`);
    const img = document.getElementById(`result-${item.id}`);
    const originalImg = document.getElementById(`original-${item.id}`);
    const compareBadge = document.getElementById(`compare-${item.id}`);
    const preview = img?.closest('.scanner-effect');
    const status = document.getElementById(`status-${item.id}`);
    const meta = document.getElementById(`meta-${item.id}`);
    const dlBtn = document.getElementById(`download-${item.id}`);

    if (loader) loader.style.display = 'none';
    preview?.classList.remove('is-processing');
    if (img) {
        img.src = item.processedUrl;
        img.classList.remove('opacity-0');
    }
    // v2.6: Populate original image for before/after comparison
    if (originalImg && item.originalUrl) {
        originalImg.src = item.originalUrl;
        originalImg.style.display = '';
    }
    // Show the compare toggle badge
    if (compareBadge) {
        compareBadge.style.opacity = '1';
    }
    if (status) status.textContent = confidence > 0 ? i18n.t('status.dewatermarked') : i18n.t('status.noWatermark');
    if (meta) meta.textContent = `${removedCount} / ${latency}ms`;
    if (dlBtn) {
        dlBtn.classList.remove('hidden');
        dlBtn.onclick = () => downloadImage(item);
    }
}

function updateCardErrorUI(item, error) {
    const loader = document.getElementById(`loader-${item.id}`);
    const status = document.getElementById(`status-${item.id}`);
    const meta = document.getElementById(`meta-${item.id}`);
    const card = document.getElementById(`card-${item.id}`);
    const preview = card?.querySelector('.scanner-effect');

    if (loader) loader.style.display = 'none';
    preview?.classList.remove('is-processing');
    if (status) {
        status.textContent = i18n.t('status.failed');
        status.classList.remove('text-slate-400');
        status.classList.add('text-red-500');
    }
    if (meta) meta.textContent = error?.message || i18n.t('status.error');
    if (card) card.classList.add('border', 'border-red-500/30');
}

function onBatchComplete() {
    const successCount = state.imageQueue.filter(i => i.status === 'success').length;
    const failedCount = state.imageQueue.filter(i => i.status === 'error').length;
    showToast(i18n.t('toast.batchComplete', { success: successCount, failed: failedCount }), failedCount ? 'info' : 'success');
    elements.downloadAllBtn.style.display = successCount > 0 ? 'block' : 'none';
}

function resetWorkspace(clearQueue = true) {
    objectUrlManager.clear();
    elements.multiPreview.style.display = 'none';
    clearManualRegion(elements);
    setManualSelectionEnabled(elements, false);
    if (clearQueue) {
        state.imageQueue = [];
        state.processedCount = 0;
        state.activeSingleItem = null;
        AuditLog.log('Workspace cleared', 'info');
    }
    resetGlobalProgress();
    // Note: objectUrlManager.clear() above already triggers the onChange
    // observer which calls updateMemoryCounter — no need to call it again.
}

export { resetWorkspace };

const memoryEl = document.getElementById('memoryCount');

function updateMemoryCounter(count) {
    if (!memoryEl) return;
    const n = typeof count === 'number' ? count : objectUrlManager.urls.size;
    memoryEl.textContent = `OBJ:${n}`;
    memoryEl.classList.toggle('hidden', n === 0);
}

// FE-BUG-H2: Subscribe to objectUrlManager changes via the observer API
// instead of monkey-patching its methods. Clean separation of concerns.
objectUrlManager.onChange((count) => updateMemoryCounter(count));

document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            files.push(item.getAsFile());
        }
    }
    if (files.length > 0) {
        AuditLog.log(`Pasted ${files.length} images from clipboard`, 'info');
        handleFiles(files, elements, updateCardUI, updateCardErrorUI, onBatchComplete);
    }
});

init();
