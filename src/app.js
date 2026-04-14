import i18n from './i18n.js';
import { WatermarkEngine } from './core/watermarkEngine.js';
import { showLoading, showLoadingFail, hideLoading } from './utils.js';
import { getAllProfiles } from './core/profiles.js';
import { ENGINE_LIMITS } from './core/config.js';

import { state, objectUrlManager } from './app/state.js';
import { AuditLog, showToast, updateProgress, resetGlobalProgress } from './app/ui.js';
import { processSingle, processQueue, downloadImage } from './app/processing.js';

// DOM Elements
const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
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
    lastLatency: document.getElementById('lastLatency')
};

async function init() {
    try {
        AuditLog.log('Neural engine initializing...', 'process');
        
        // Populate Profiles (Fix code-review issue: letting users choose)
        if (elements.profileSelect) {
            getAllProfiles().forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                elements.profileSelect.appendChild(opt);
            });

            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = 'AUTO DETECT (Slow)';
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
        
        // v1.9.8: Dynamic UI initialization
        const yearEl = document.querySelector('[data-i18n="footer.copyright"]');
        if (yearEl) yearEl.innerHTML = yearEl.innerHTML.replace('{{year}}', new Date().getFullYear());
    } catch (error) {
        AuditLog.log(`Critical Fault: ${error.message}`, 'err');
        showLoadingFail(error.message);
    }
}

function setupEventListeners() {
    elements.fileInput.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));

    ['dragover', 'dragleave', 'drop'].forEach(evt => {
        elements.uploadArea.addEventListener(evt, (e) => {
            e.preventDefault();
            if (evt === 'dragover') elements.uploadArea.classList.add('scale-[0.98]');
            else elements.uploadArea.classList.remove('scale-[0.98]');
            
            if (evt === 'drop') {
                const items = e.dataTransfer.items;
                const uri = e.dataTransfer.getData('text/uri-list');
                
                if (uri) {
                    AuditLog.log(`Remote asset detected: ${uri.split('/').pop()}`, 'process');
                    handleUrl(uri);
                } else if (items && items.length > 0 && items[0].webkitGetAsEntry) {
                    handleDataTransferItems(items);
                } else {
                    handleFiles(Array.from(e.dataTransfer.files));
                }
            }
        });
    });

    elements.downloadAllBtn?.addEventListener('click', () => {
        state.imageQueue.forEach(downloadImage);
        showToast(`Downloading ${state.imageQueue.length} images`, 'info');
    });

    elements.resetAreaBtn?.addEventListener('click', resetWorkspace);
    elements.clearAllBtn?.addEventListener('click', resetWorkspace);
    document.getElementById('exportLogBtn')?.addEventListener('click', () => AuditLog.exportCSV());

    elements.modeSliderBtn?.addEventListener('click', () => switchViewMode('slider'));
    elements.modeSideBtn?.addEventListener('click', () => switchViewMode('side'));
    elements.modeStatsBtn?.addEventListener('click', () => switchViewMode('stats'));

    document.addEventListener('keydown', handleKeyDown);
    setupSlider();
    setupMagnifier();
}

function handleFiles(files) {
    if (!state.engine || state.isProcessing) return;

    const validFiles = files.filter(file => {
        if (!file.type.match('image/(jpeg|png|webp)')) return false;
        if (file.size > ENGINE_LIMITS.MAX_FILE_SIZE) {
            showToast(`${file.name} exceeds max size`, 'err');
            return false;
        }
        return true;
    });

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
        
        // Visual cue: start processing
        document.getElementById('resultContainer')?.classList.add('scan-active');
        
        processSingle(state.imageQueue[0], getEngineOptions(), {
            onSuccess: ({ item, removedCount, confidence, latency, config, profileId }) => {
                updateSingleUI(item, removedCount, confidence, latency, config, profileId);
                document.getElementById('resultContainer')?.classList.remove('scan-active');
            },
            onError: () => document.getElementById('resultContainer')?.classList.remove('scan-active')
        });
    } else {
        elements.singlePreview.style.display = 'none';
        elements.multiPreview.style.display = 'block';
        elements.imageList.innerHTML = '';
        state.imageQueue.forEach(createImageCard);
        
        processQueue(getEngineOptions(), {
            onItemSuccess: ({ item, removedCount, confidence, latency, config, profileId }) => {
                updateCardUI(item, removedCount, confidence, latency, config, profileId);
            },
            onComplete: () => {
                showToast(`Batch completed: ${state.imageQueue.length} processed`, 'success');
                elements.downloadAllBtn.style.display = 'block';
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
    const traverseEntry = async (entry) => {
        if (entry.isFile) {
            const file = await new Promise(resolve => entry.file(resolve));
            files.push(file);
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise(resolve => reader.readEntries(resolve));
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

function updateSingleUI(item, removedCount, confidence, latency, config) {
    document.getElementById('sliderOriginal').src = item.originalUrl;
    document.getElementById('sliderProcessed').src = item.processedUrl;
    document.getElementById('sideOriginal').src = item.originalUrl;
    document.getElementById('sideProcessed').src = item.processedUrl;

    if (config && elements.tierBadge) {
        const profileName = profileId ? (getAllProfiles().find(p=>p.id===profileId)?.id.toUpperCase() || 'AUTO') : 'AUTO';
        elements.tierBadge.textContent = `${profileName} • ${config.tier || 'MOCK'} • ${config.anchor || 'BR'}`;
        elements.tierBadge.classList.remove('hidden');
        updateStatsUI(config, latency, confidence, profileId);
    }

    if (elements.lastLatency) elements.lastLatency.textContent = `Latency: ${latency}ms`;
    
    elements.downloadBtn.onclick = () => downloadImage(item);
    
    AuditLog.log(`[PASS] ${item.name} | Profile: ${profileId} | Conf: ${confidence}% | ${latency}ms`, 'success');
    showToast(`Removed ${removedCount} watermarks`, 'success');
}

function createImageCard(item) {
    const card = document.createElement('div');
    card.id = `card-${item.id}`;
    card.className = 'gwr-image-card glass-premium rounded-3xl p-4 group overflow-hidden animate-fade-up';
    
    card.innerHTML = `
        <div class="relative aspect-square rounded-2xl bg-slate-900/5 dark:bg-slate-900/50 flex items-center justify-center overflow-hidden mb-4 scanner-effect">
            <img id="result-${item.id}" class="max-w-full max-h-full object-contain transition-opacity duration-500 opacity-0" src="">
            <div id="loader-${item.id}" class="absolute inset-0 flex items-center justify-center">
                <div class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        </div>
        <div class="space-y-1 px-1">
            <h4 class="font-black text-slate-900 dark:text-white truncate text-xs">${item.name}</h4>
            <div class="flex items-center justify-between">
                <span id="status-${item.id}" class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Processing</span>
                <span id="meta-${item.id}" class="text-[9px] font-black text-emerald-500 font-mono"></span>
            </div>
        </div>
        <button id="download-${item.id}" class="mt-4 w-full py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-[10px] hidden group-hover:block transition-all transform hover:scale-[1.02]">DOWNLOAD</button>
    `;
    elements.imageList.appendChild(card);
}

function updateCardUI(item, removedCount, confidence, latency, config) {
    const loader = document.getElementById(`loader-${item.id}`);
    const img = document.getElementById(`result-${item.id}`);
    const status = document.getElementById(`status-${item.id}`);
    const meta = document.getElementById(`meta-${item.id}`);
    const dlBtn = document.getElementById(`download-${item.id}`);

    if (loader) loader.style.display = 'none';
    if (img) {
        img.src = item.processedUrl;
        img.classList.remove('opacity-0');
    }
    if (status) status.textContent = confidence > 0 ? 'DE-WATERMARKED' : 'CLEAN';
    if (meta) meta.textContent = `${latency}ms`;
    if (dlBtn) {
        dlBtn.classList.remove('hidden');
        dlBtn.onclick = () => downloadImage(item);
    }
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

function updateStatsUI(config, latency, confidence, profileId) {
    document.getElementById('statAnchor').textContent = (config.anchor || 'BOTTOM-RIGHT').toUpperCase();
    document.getElementById('statCoord').textContent = config.x !== undefined ? `${config.x}, ${config.y}` : 'AUTO';
    document.getElementById('statScale').textContent = config.scale !== undefined ? `${config.scale.toFixed(3)}x` : '1.000x';
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
    return {
        profileId: elements.profileSelect?.value || 'gemini',
        deepScan: document.getElementById('deepScanToggle')?.checked ?? true,
        noiseReduction: false, // Hidden but available in core
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false
    };
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

    slider.addEventListener('touchstart', (e) => {
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
    if (saved) {
        const settings = JSON.parse(saved);
        if (settings.profileId && elements.profileSelect) elements.profileSelect.value = settings.profileId;
    }
}

function handleKeyDown(e) {
    if (e.key === 'Escape') resetWorkspace();
    // Comparison shortcut
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        switchViewMode(e.key === 'ArrowRight' ? 'side' : 'slider');
    }
}

// Global hook for clipboard
document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
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
