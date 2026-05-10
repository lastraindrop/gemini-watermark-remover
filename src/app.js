import i18n from './i18n.js';
import { WatermarkEngine } from './core/watermarkEngine.js';
import { showLoading, showLoadingFail, hideLoading } from './utils.js';
import { getAllProfiles } from './core/profiles.js';
import { ENGINE_LIMITS } from './core/config.js';

import { state, objectUrlManager } from './app/state.js';
import { AuditLog, showToast, resetGlobalProgress } from './app/ui.js';
import { processSingle, processQueue, downloadImage, downloadAllAsZip } from './app/processing.js';

// DOM Elements
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
    // v2.1 Advanced Elements
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

const dragState = {
    depth: 0
};

async function init() {
    try {
        AuditLog.log('Neural engine initializing...', 'process');
        
        // Populate Profiles (Fix code-review issue: letting users choose)
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
                saveSettings();
                const p = getAllProfiles().find(x => x.id === elements.profileSelect.value);
                if (p) applyProfileTheme(p);
                AuditLog.log(`Switched to ${elements.profileSelect.value} profile`, 'info');
            });
        }

        await i18n.init();
        setupLanguageSelector();
        showLoading(i18n.t('status.loading'));

        state.engine = await WatermarkEngine.create();
        
        const hasWorker = state.engine._getWorker() !== null;
        AuditLog.log(`Core optimized (Threads: ${hasWorker ? 'Multi' : 'Single'})`, 'success');

        hideLoading();
        setupEventListeners();
        loadSettings();
        
    } catch (error) {
        AuditLog.log(`Critical Fault: ${error.message}`, 'err');
        showLoadingFail(error.message);
    }
}

function setupEventListeners() {
    elements.fileInput?.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
    elements.folderInput?.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
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

    setupWindowDragAndDrop();

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

    elements.resetAreaBtn?.addEventListener('click', resetWorkspace);
    elements.clearAllBtn?.addEventListener('click', resetWorkspace);
    document.getElementById('exportLogBtn')?.addEventListener('click', () => AuditLog.exportCSV());
    elements.auditConsoleToggle?.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.closest('#exportLogBtn')) return;
        elements.auditConsole?.classList.toggle('translate-y-0');
        elements.auditConsole?.classList.toggle('translate-y-[calc(100%-48px)]');
    });

    // v2.1 Advanced Listeners
    elements.toggleAdvancedBtn?.addEventListener('click', () => {
        elements.advancedPanel?.classList.toggle('hidden');
    });

    elements.thresholdSlider?.addEventListener('input', (e) => {
        elements.thresholdVal.textContent = e.target.value;
    });

    elements.penaltySlider?.addEventListener('input', (e) => {
        elements.penaltyVal.textContent = e.target.value;
    });

    elements.manualModeToggle?.addEventListener('change', (e) => {
        const active = e.target.checked;
        elements.manualCoords?.classList.toggle('opacity-40', !active);
        elements.manualCoords?.classList.toggle('pointer-events-none', !active);
        if (active) AuditLog.log('Manual Mode enabled: define area in Advanced Panel', 'warn');
    });

    elements.modeSliderBtn?.addEventListener('click', () => switchViewMode('slider'));
    elements.modeSideBtn?.addEventListener('click', () => switchViewMode('side'));
    elements.modeStatsBtn?.addEventListener('click', () => switchViewMode('stats'));

    document.addEventListener('keydown', handleKeyDown);
    setupSlider();
    setupMagnifier();
}

function isFileOrUrlDrag(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files') || types.includes('text/uri-list');
}

function setDropzoneActive(active) {
    elements.uploadArea?.classList.toggle('scale-[0.98]', active);
    elements.uploadArea?.classList.toggle('drop-active', active);
}

function setupWindowDragAndDrop() {
    window.addEventListener('dragenter', (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        dragState.depth++;
        setDropzoneActive(true);
    });

    window.addEventListener('dragover', (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropzoneActive(true);
    });

    window.addEventListener('dragleave', (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        dragState.depth = Math.max(0, dragState.depth - 1);
        if (dragState.depth === 0) setDropzoneActive(false);
    });

    window.addEventListener('drop', async (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        dragState.depth = 0;
        setDropzoneActive(false);
        await handleDropEvent(event);
    });
}

async function handleDropEvent(event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    const uri = dataTransfer.getData('text/uri-list')
        .split('\n')
        .map(line => line.trim())
        .find(line => line && !line.startsWith('#'));

    if (uri) {
        AuditLog.log(`Remote asset detected: ${uri.split('/').pop()}`, 'process');
        await handleUrl(uri);
        return;
    }

    const items = dataTransfer.items;
    const hasEntries = items && Array.from(items).some(item => typeof item.webkitGetAsEntry === 'function');
    if (hasEntries) {
        await handleDataTransferItems(items);
        return;
    }

    handleFiles(Array.from(dataTransfer.files || []));
}

function isSupportedImageFile(file) {
    const type = (file.type || '').toLowerCase();
    if (/^image\/(jpeg|png|webp)$/.test(type)) return true;
    return /\.(jpe?g|png|webp)$/i.test(file.name || '');
}

function handleFiles(files) {
    if (!state.engine) return;
    if (state.isProcessing) {
        showToast(i18n.t('toast.processingBusy'), 'info');
        return;
    }

    const validFiles = files.filter(file => {
        if (!isSupportedImageFile(file)) return false;
        if (file.size > ENGINE_LIMITS.MAX_FILE_SIZE) {
            showToast(`${file.name} exceeds max size`, 'err');
            return false;
        }
        return true;
    });

    const skipped = files.length - validFiles.length;
    if (skipped > 0) showToast(i18n.t('toast.invalidFiles', { count: skipped }), 'info');
    if (validFiles.length === 0) return;

    resetWorkspace(false);
    state.imageQueue = validFiles.map((file, index) => ({
        id: Date.now() + index,
        file,
        name: file.name,
        status: 'pending'
    }));

    state.processedCount = 0;
    resetGlobalProgress();

    if (validFiles.length === 1) {
        elements.singlePreview.style.display = 'block';
        elements.multiPreview.style.display = 'none';
        
        document.getElementById('resultContainer')?.classList.add('scan-active');
        
        processSingle(state.imageQueue[0], getEngineOptions(), {
            onSuccess: ({ item, removedCount, confidence, latency, config, pos, profileId }) => {
                updateSingleUI(item, removedCount, confidence, latency, config, pos, profileId);
                document.getElementById('resultContainer')?.classList.remove('scan-active');
                elements.singlePreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
            onError: () => document.getElementById('resultContainer')?.classList.remove('scan-active')
        });
    } else {
        elements.singlePreview.style.display = 'none';
        elements.multiPreview.style.display = 'block';
        elements.imageList.innerHTML = '';
        state.imageQueue.forEach(createImageCard);
        
        processQueue(getEngineOptions(), {
            onItemSuccess: ({ item, removedCount, confidence, latency }) => {
                updateCardUI(item, removedCount, confidence, latency);
            },
            onItemError: ({ item, error }) => {
                updateCardErrorUI(item, error);
            },
            onComplete: () => {
                const successCount = state.imageQueue.filter(item => item.status === 'success').length;
                const failedCount = state.imageQueue.filter(item => item.status === 'error').length;
                showToast(i18n.t('toast.batchComplete', { success: successCount, failed: failedCount }), failedCount ? 'info' : 'success');
                elements.downloadAllBtn.style.display = successCount > 0 ? 'block' : 'none';
            }
        });
    }
}

async function handleUrl(uri) {
    try {
        showLoading('Fetching remote asset...', uri);
        const response = await fetch(uri);
        if (!response.ok) throw new Error('CORS blocked or server error');
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Not an image');
        
        const file = new File([blob], uri.split('/').pop() || 'remote_image.png', { type: blob.type });
        handleFiles([file]);
    } catch (e) {
        AuditLog.log(`Remote Fetch Failed: ${e.message}. Please save and upload manually.`, 'err');
        showToast('Remote fetch failed (CORS)', 'err');
    } finally {
        hideLoading();
    }
}

async function handleDataTransferItems(items) {
    const files = [];
    const readAllEntries = async (reader) => {
        const entries = [];
        while (true) {
            const batch = await new Promise(resolve => reader.readEntries(resolve));
            if (!batch || batch.length === 0) break;
            entries.push(...batch);
        }
        return entries;
    };

    const traverseEntry = async (entry) => {
        if (entry.isFile) {
            const file = await new Promise(resolve => entry.file(resolve));
            files.push(file);
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await readAllEntries(reader);
            for (const e of entries) await traverseEntry(e);
        }
    };

    for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (entry) await traverseEntry(entry);
    }
    
    if (files.length > 0) {
        AuditLog.log(`Deep-scanned ${files.length} items from drag-source`, 'info');
        handleFiles(files);
    }
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
        
        // v1.9.8: Auto-sync theme with detected profile
        if (profile.brandColor) applyProfileTheme(profile);
        updateStatsUI(config, pos, confidence, profileId);
    }

    if (elements.lastLatency) elements.lastLatency.textContent = `${i18n.t('info.latency')}: ${latency}ms`;
    
    elements.downloadBtn.onclick = () => downloadImage(item);
    
    AuditLog.log(`[PASS] ${item.name} | Profile: ${profileId} | Conf: ${confidence}% | ${latency}ms`, 'success');
    showToast(i18n.t('toast.removed', { count: removedCount }), 'success');
}

function createImageCard(item) {
    const card = document.createElement('div');
    card.id = `card-${item.id}`;
    card.className = 'gwr-image-card glass-premium rounded-3xl p-4 group overflow-hidden animate-fade-up';

    const preview = document.createElement('div');
    preview.className = 'relative aspect-square rounded-2xl bg-slate-900/5 dark:bg-slate-900/50 flex items-center justify-center overflow-hidden mb-4 scanner-effect is-processing';

    const img = document.createElement('img');
    img.id = `result-${item.id}`;
    img.className = 'max-w-full max-h-full object-contain transition-opacity duration-500 opacity-0';
    img.alt = item.name;

    const loader = document.createElement('div');
    loader.id = `loader-${item.id}`;
    loader.className = 'absolute inset-0 flex items-center justify-center';
    const spinner = document.createElement('div');
    spinner.className = 'w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin';
    loader.appendChild(spinner);
    preview.append(img, loader);

    const content = document.createElement('div');
    content.className = 'space-y-1 px-1';
    const title = document.createElement('h4');
    title.className = 'font-black text-slate-900 dark:text-white truncate text-xs';
    title.textContent = item.name;

    const metaRow = document.createElement('div');
    metaRow.className = 'flex items-center justify-between';
    const status = document.createElement('span');
    status.id = `status-${item.id}`;
    status.className = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';
    status.textContent = i18n.t('status.processing');
    const meta = document.createElement('span');
    meta.id = `meta-${item.id}`;
    meta.className = 'text-[9px] font-black text-emerald-500 font-mono';
    metaRow.append(status, meta);
    content.append(title, metaRow);

    const downloadButton = document.createElement('button');
    downloadButton.id = `download-${item.id}`;
    downloadButton.className = 'mt-4 w-full py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-[10px] hidden group-hover:block transition-all transform hover:scale-[1.02]';
    downloadButton.textContent = i18n.t('btn.download');

    card.append(preview, content, downloadButton);
    elements.imageList.appendChild(card);
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

function switchViewMode(mode) {
    const btns = [elements.modeSliderBtn, elements.modeSideBtn, elements.modeStatsBtn];
    const views = [elements.comparisonSlider, elements.sideBySideView, elements.statsView];
    
    btns.forEach(b => b?.classList.remove('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm'));
    views.forEach(v => v?.classList.add('hidden'));

    if (mode === 'slider') {
        elements.modeSliderBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm');
        elements.comparisonSlider?.classList.remove('hidden');
    } else if (mode === 'side') {
        elements.modeSideBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm');
        elements.sideBySideView?.classList.remove('hidden');
    } else {
        elements.modeStatsBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm');
        elements.statsView?.classList.remove('hidden');
    }
}

function updateStatsUI(config, pos, confidence, profileId) {
    document.getElementById('statAnchor').textContent = (config.anchor || 'BOTTOM-RIGHT').toUpperCase();
    document.getElementById('statCoord').textContent = pos ? `${Math.round(pos.x)}, ${Math.round(pos.y)}` : 'AUTO';
    document.getElementById('statConfidence').textContent = `${confidence}%`;
    document.getElementById('statAlgo').textContent = (profileId || 'AUTO').toUpperCase();
}

function applyProfileTheme(profile) {
    document.documentElement.style.setProperty('--primary', profile.brandColor);
    document.documentElement.style.setProperty('--primary-glow', `${profile.brandColor}66`);
}

function setupMagnifier() {
    const slider = elements.comparisonSlider;
    const lens = elements.magnifierLens;
    const processedImg = document.getElementById('sliderProcessed');
    
    if (!slider || !lens) return;

    const moveLens = (e) => {
        if (elements.comparisonSlider.classList.contains('hidden')) return;
        
        const rect = slider.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
            lens.classList.add('hidden');
            return;
        }

        lens.classList.remove('hidden');
        lens.style.left = `${x - 75}px`;
        lens.style.top = `${y - 75}px`;
        
        const zoom = 3;
        lens.style.backgroundImage = `url(${processedImg.src})`;
        lens.style.backgroundSize = `${rect.width * zoom}px ${rect.height * zoom}px`;
        lens.style.backgroundPosition = `-${x * zoom - 75}px -${y * zoom - 75}px`;
    };

    slider.addEventListener('mousemove', moveLens);
    slider.addEventListener('mouseenter', () => lens.classList.remove('hidden'));
    slider.addEventListener('mouseleave', () => lens.classList.add('hidden'));
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

function getEngineOptions() {
    const thresholdSliderVal = parseFloat(elements.thresholdSlider?.value || '0.25');
    const fallbackToProbeRatio = 0.25 / 0.18;
    const opts = {
        profileId: elements.profileSelect?.value || 'gemini',
        deepScan: document.getElementById('deepScanToggle')?.checked ?? true,
        noiseReduction: document.getElementById('noiseReductionToggle')?.checked ?? false,
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false,
        // v2.1 Advanced Parameters - probe/fallback maintain proportional relationship
        probeThreshold: thresholdSliderVal / fallbackToProbeRatio,
        fallbackThreshold: thresholdSliderVal,
        gradientPenalty: parseFloat(elements.penaltySlider?.value || '0.30')
    };

    if (elements.manualModeToggle?.checked) {
        opts.manualConfig = {
            x: parseInt(elements.manualX?.value || '0'),
            y: parseInt(elements.manualY?.value || '0'),
            width: parseInt(elements.manualW?.value || '96'),
            height: parseInt(elements.manualH?.value || '96')
        };
    }

    return opts;
}

function setupSlider() {
    const slider = elements.comparisonSlider;
    if (!slider) return;

    const resize = slider.querySelector('.resize');
    const handle = slider.querySelector('.handle');

    const updateSlider = (e) => {
        const rect = slider.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        
        if (resize) resize.style.width = `${percent}%`;
        if (handle) handle.style.left = `${percent}%`;
    };

    slider.addEventListener('mousedown', () => {
        const moveHandler = (e) => updateSlider(e);
        const upHandler = () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    });

    slider.addEventListener('touchstart', () => {
        const moveHandler = (e) => updateSlider(e);
        const upHandler = () => {
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', upHandler);
        };
        document.addEventListener('touchmove', moveHandler);
        document.addEventListener('touchend', upHandler);
    }, { passive: true });
}

function setupLanguageSelector() {
    const select = document.getElementById('langSelect');
    if (!select) return;
    
    // List supported languages from i18n
    import('./i18n.js').then(mod => {
        select.innerHTML = '';
        mod.supportedLanguages.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = lang.label;
            select.appendChild(opt);
        });
        select.value = i18n.locale;
    });

    select.addEventListener('change', async () => {
        await i18n.switchLocale(select.value);
        saveSettings();
        AuditLog.log(`Language set to ${select.value}`, 'info');
    });
}

function saveSettings() {
    const settings = {
        profileId: elements.profileSelect?.value,
        locale: i18n.locale
    };
    localStorage.setItem('gwr_pro_settings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('gwr_pro_settings');
    if (!saved) return;

    try {
        const settings = JSON.parse(saved);
        if (settings.profileId && elements.profileSelect) {
            const option = [...elements.profileSelect.options].find(opt => opt.value === settings.profileId);
            if (option) {
                elements.profileSelect.value = settings.profileId;
                const profile = getAllProfiles().find(p => p.id === settings.profileId);
                if (profile) applyProfileTheme(profile);
            }
        }
    } catch (error) {
        AuditLog.log(`Settings ignored: ${error.message}`, 'err');
    }
}

function handleKeyDown(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Escape') resetWorkspace();
    if (e.key === '1') switchViewMode('slider');
    if (e.key === '2') switchViewMode('side');
    if (e.key === '3') switchViewMode('stats');
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        switchViewMode(e.key === 'ArrowRight' ? 'side' : 'slider');
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const item = state.imageQueue.find(i => i.status === 'success');
        if (item) downloadImage(item);
    }
}

// Global hook for clipboard
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
        handleFiles(files);
    }
});

// Boot
init();
