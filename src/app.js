import i18n from './i18n.js';
import { WatermarkEngine } from './core/watermarkEngine.js';
import { showLoading, showLoadingFail, hideLoading } from './utils.js';
import { getAllProfiles } from './core/profiles.js';

import { state, objectUrlManager } from './app/state.js';
import { AuditLog, showToast, resetGlobalProgress } from './app/ui.js';
import { downloadImage, downloadAllAsZip, processSingle } from './app/processing.js';
import { setupWindowDragAndDrop, handleFiles } from './app/dragDrop.js';
import { setupKeyboardShortcuts } from './app/keyboard.js';
import { setupLanguageSelector, saveSettings, loadSettings, getEngineOptions } from './app/settings.js';
import { switchViewMode, setupSlider, updateStatsUI, applyProfileTheme } from './app/viewModes.js';
import { setupMagnifier } from './app/magnifier.js';
import { clearManualRegion, setupManualSelection, setManualSelectionEnabled, updateManualSelectionOverlay, writeManualRegion } from './app/manualSelection.js';

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

const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    folderInput: document.getElementById('folderInput'),
    chooseFileBtn: document.getElementById('chooseFileBtn'),
    chooseFolderBtn: document.getElementById('chooseFolderBtn'),
    profileSelect: document.getElementById('profileSelect'),
    singlePreview: document.getElementById('singlePreview'),
    multiPreview: document.getElementById('multiPreview'),
    imageList: document.getElementById('imageList'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    modeSliderBtn: document.getElementById('modeSliderBtn'),
    modeSideBtn: document.getElementById('modeSideBtn'),
    modeStatsBtn: document.getElementById('modeStatsBtn'),
    comparisonSlider: document.getElementById('comparisonSlider'),
    sideBySideView: document.getElementById('sideBySideView'),
    statsView: document.getElementById('statsView'),
    magnifierLens: document.getElementById('magnifierLens'),
    tierBadge: document.getElementById('tierBadge'),
    lastLatency: document.getElementById('lastLatency'),
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
    manualReprocessBtn: document.getElementById('manualReprocessBtn'),
    manualSelectionLayer: document.getElementById('manualSelectionLayer'),
    manualSelectionBox: document.getElementById('manualSelectionBox')
};

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
        showLoading(i18n.t('status.loading'));

        state.engine = await WatermarkEngine.create();
        AuditLog.log(`Core ready (Execution: ${state.engine.getExecutionMode()})`, 'success');

        hideLoading();
        clearTimeout(loadingTimeout);
        setupEventListeners();
        loadSettings(elements);
    } catch (error) {
        clearTimeout(loadingTimeout);
        AuditLog.log(`Critical Fault: ${error.message}`, 'err');
        showLoadingFail(error.message);
    }
}

function setupEventListeners() {
    const handleFilesWrapper = (files) => handleFiles(files, elements,
        updateSingleUI,
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

    elements.manualModeToggle?.addEventListener('change', (e) => {
        const active = e.target.checked;
        setManualControlsActive(active);
        if (active) {
            switchViewMode('slider', elements);
            AuditLog.log('Manual Mode enabled', 'warn');
        }
    });

    elements.manualUseDetectedBtn?.addEventListener('click', () => useDetectedAreaForManualMode());
    elements.manualClearBtn?.addEventListener('click', () => {
        clearManualRegion(elements);
        AuditLog.log('Manual region cleared', 'info');
    });
    elements.manualReprocessBtn?.addEventListener('click', () => reprocessSingleWithManualArea());

    elements.modeSliderBtn?.addEventListener('click', () => switchViewMode('slider', elements));
    elements.modeSideBtn?.addEventListener('click', () => switchViewMode('side', elements));
    elements.modeStatsBtn?.addEventListener('click', () => switchViewMode('stats', elements));

    setupSlider(elements);
    setupMagnifier(elements);
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
    setManualSelectionEnabled(elements, active && elements.singlePreview?.style.display !== 'none');
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
    switchViewMode('slider', elements);
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
    document.getElementById('resultContainer')?.classList.add('scan-active');

    try {
        await processSingle(item, options, {
            onSuccess: ({ item: processedItem, removedCount, confidence, latency, config, pos, profileId }) => {
                updateSingleUI(processedItem, removedCount, confidence, latency, config, pos, profileId);
                updateManualSelectionOverlay(elements);
                AuditLog.log(`Manual region processed (${options.manualConfig.x}, ${options.manualConfig.y}, ${options.manualConfig.width}x${options.manualConfig.height})`, 'success');
            },
            onError: (error) => {
                showToast(error?.message || i18n.t('status.error'), 'err');
            }
        });
    } finally {
        document.getElementById('resultContainer')?.classList.remove('scan-active');
        elements.manualReprocessBtn?.removeAttribute('disabled');
        elements.manualReprocessBtn?.classList.remove('opacity-60', 'cursor-wait');
        state.isProcessing = false;
    }
}

function updateSingleUI(item, removedCount, confidence, latency, config, pos, profileId) {
    state.activeSingleItem = item;
    item.lastDetectedRegion = getRegionFromDetection(pos, config);
    document.getElementById('sliderOriginal').src = item.originalUrl;
    document.getElementById('sliderProcessed').src = item.processedUrl;
    document.getElementById('sideOriginal').src = item.originalUrl;
    document.getElementById('sideProcessed').src = item.processedUrl;

    if (elements.tierBadge) {
        const profile = getAllProfiles().find(p => p.id === profileId) || { id: profileId || 'AUTO' };
        const sourceLabel = item._detectionSource || '';
        const tierLabel = config?.tier || '';
        const parts = [profile.id.toUpperCase(), sourceLabel, tierLabel, config?.anchor].filter(Boolean);
        elements.tierBadge.textContent = parts.join(' — ');
        elements.tierBadge.classList.remove('hidden');
        if (profile.brandColor) applyProfileTheme(profile);
        updateStatsUI(config, pos, confidence, profile.id);
    }

    if (elements.lastLatency) elements.lastLatency.textContent = `${i18n.t('info.latency')}: ${latency}ms`;

    elements.downloadBtn.onclick = () => downloadImage(item);
    elements.downloadBtn.classList.remove('hidden');

    AuditLog.log(`[PASS] ${item.name} | Profile: ${profileId} | Conf: ${confidence}% | ${latency}ms`, 'success');
    showToast(i18n.t('toast.removed', { count: removedCount }), 'success');
    setManualSelectionEnabled(elements, elements.manualModeToggle?.checked === true);
}

function updateCardUI(item, removedCount, confidence, latency) {
    const loader = document.getElementById(`loader-${item.id}`);
    const img = document.getElementById(`result-${item.id}`);
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
    elements.singlePreview.style.display = 'none';
    elements.multiPreview.style.display = 'none';
    clearManualRegion(elements);
    setManualSelectionEnabled(elements, false);
    // Clear stale download button handler to prevent downloading revoked URLs
    if (elements.downloadBtn) {
        elements.downloadBtn.onclick = null;
        elements.downloadBtn.classList.add('hidden');
    }
    if (clearQueue) {
        state.imageQueue = [];
        state.processedCount = 0;
        state.activeSingleItem = null;
        AuditLog.log('Workspace cleared', 'info');
    }
    resetGlobalProgress();
    updateMemoryCounter();
}

export { resetWorkspace };

const memoryEl = document.getElementById('memoryCount');

function updateMemoryCounter() {
    if (!memoryEl) return;
    const count = objectUrlManager.urls.size;
    memoryEl.textContent = `OBJ:${count}`;
    memoryEl.classList.toggle('hidden', count === 0);
}

const _originalRegister = objectUrlManager.register.bind(objectUrlManager);
const _originalRevoke = objectUrlManager.revoke.bind(objectUrlManager);
const _originalClear = objectUrlManager.clear.bind(objectUrlManager);

objectUrlManager.register = function(url) {
    const result = _originalRegister(url);
    updateMemoryCounter();
    return result;
};

objectUrlManager.revoke = function(url) {
    _originalRevoke(url);
    updateMemoryCounter();
};

objectUrlManager.clear = function() {
    _originalClear();
    updateMemoryCounter();
};

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
        handleFiles(files, elements, updateSingleUI, updateCardUI, updateCardErrorUI, onBatchComplete);
    }
});

init();
