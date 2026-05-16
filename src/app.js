import i18n from './i18n.js';
import { WatermarkEngine } from './core/watermarkEngine.js';
import { showLoading, showLoadingFail, hideLoading } from './utils.js';
import { getAllProfiles } from './core/profiles.js';
import { ENGINE_LIMITS } from './core/config.js';

import { state, objectUrlManager, resetWorkspaceGlobal } from './app/state.js';
import { AuditLog, showToast, resetGlobalProgress } from './app/ui.js';
import { processSingle, processQueue, downloadImage, downloadAllAsZip } from './app/processing.js';
import { setupWindowDragAndDrop, handleFiles } from './app/dragDrop.js';
import { setupKeyboardShortcuts } from './app/keyboard.js';
import { setupLanguageSelector, saveSettings, loadSettings, getEngineOptions } from './app/settings.js';
import { switchViewMode, setupSlider, updateStatsUI, applyProfileTheme } from './app/viewModes.js';
import { setupMagnifier } from './app/magnifier.js';

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
    manualH: document.getElementById('manualH')
};

async function init() {
    try {
        AuditLog.log('Neural engine initializing...', 'process');

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
        setupEventListeners();
        loadSettings(elements);
    } catch (error) {
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
        elements.auditConsole?.classList.toggle('translate-y-0');
        elements.auditConsole?.classList.toggle('translate-y-[calc(100%-48px)]');
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
        elements.manualCoords?.classList.toggle('opacity-40', !active);
        elements.manualCoords?.classList.toggle('pointer-events-none', !active);
        if (active) AuditLog.log('Manual Mode enabled', 'warn');
    });

    elements.modeSliderBtn?.addEventListener('click', () => switchViewMode('slider', elements));
    elements.modeSideBtn?.addEventListener('click', () => switchViewMode('side', elements));
    elements.modeStatsBtn?.addEventListener('click', () => switchViewMode('stats', elements));

    setupSlider(elements);
    setupMagnifier(elements);
}

function updateSingleUI(item, removedCount, confidence, latency, config, pos, profileId) {
    document.getElementById('sliderOriginal').src = item.originalUrl;
    document.getElementById('sliderProcessed').src = item.processedUrl;
    document.getElementById('sideOriginal').src = item.originalUrl;
    document.getElementById('sideProcessed').src = item.processedUrl;

    if (config && elements.tierBadge) {
        const profile = getAllProfiles().find(p => p.id === profileId) || { id: 'AUTO' };
        const detectionType = config.isOfficial ? i18n.t('detection.official') : i18n.t('detection.heuristic');
        elements.tierBadge.textContent = `${profile.id.toUpperCase()} - ${config.tier || detectionType} - ${config.anchor || 'BR'}`;
        elements.tierBadge.classList.remove('hidden');
        if (profile.brandColor) applyProfileTheme(profile);
        updateStatsUI(config, pos, confidence, profileId);
    }

    if (elements.lastLatency) elements.lastLatency.textContent = `${i18n.t('info.latency')}: ${latency}ms`;

    elements.downloadBtn.onclick = () => downloadImage(item);

    AuditLog.log(`[PASS] ${item.name} | Profile: ${profileId} | Conf: ${confidence}% | ${latency}ms`, 'success');
    showToast(i18n.t('toast.removed', { count: removedCount }), 'success');
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
    if (clearQueue) {
        state.imageQueue = [];
        state.processedCount = 0;
        AuditLog.log('Workspace cleared', 'info');
    }
    resetGlobalProgress();
}

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
