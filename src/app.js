import { WatermarkEngine } from './core/watermarkEngine.js';
import i18n from './i18n.js';
import { loadImage, checkOriginal, getOriginalStatus, setStatusMessage, showLoading, showLoadingFail, hideLoading } from './utils.js';
import JSZip from 'jszip';
import mediumZoom from 'medium-zoom';

// global state
let engine = null;
let imageQueue = [];
let processedCount = 0;
let zoom = null;
let isProcessing = false;

// dom elements references
const batchProgressBar = document.getElementById('batchProgressBar');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const directoryModeBtn = document.getElementById('directoryModeBtn');
const directoryPanel = document.getElementById('directoryPanel');
const setInputDirBtn = document.getElementById('setInputDirBtn');
const setOutputDirBtn = document.getElementById('setOutputDirBtn');
const startDirProcessBtn = document.getElementById('startDirProcessBtn');
const dirStatus = document.getElementById('dirStatus');
const inputDirPathEl = document.getElementById('inputDirPath');
const outputDirPathEl = document.getElementById('outputDirPath');

let inputDirHandle = null;
let outputDirHandle = null;
const singlePreview = document.getElementById('singlePreview');
const multiPreview = document.getElementById('multiPreview');
const imageList = document.getElementById('imageList');
const progressText = document.getElementById('progressText');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const originalImage = document.getElementById('originalImage');
const processedSection = document.getElementById('processedSection');
const processedInfo = document.getElementById('processedInfo');
const downloadBtn = document.getElementById('downloadBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const resetBtn = document.getElementById('resetBtn');
const processedImage = document.getElementById('processedImage');
const comparisonSlider = document.getElementById('comparisonSlider');
const sliderOriginal = document.getElementById('sliderOriginal');
const sliderProcessed = document.getElementById('sliderProcessed');
const sliderResize = comparisonSlider.querySelector('.resize');
const sliderHandle = comparisonSlider.querySelector('.handle');
const resultContainer = document.getElementById('resultContainer');
const originalInfo = document.getElementById('originalInfo');

// New Diagnostic UI References
const engineStatus = document.getElementById('engineStatus');
const workerStatus = document.getElementById('workerStatus');
const memoryCount = document.getElementById('memoryCount');
const lastLatency = document.getElementById('lastLatency');
const sideBySideView = document.getElementById('sideBySideView');
const sideOriginal = document.getElementById('sideOriginal');
const sideProcessed = document.getElementById('sideProcessed');
const modeSliderBtn = document.getElementById('modeSliderBtn');
const modeSideBtn = document.getElementById('modeSideBtn');
const tierBadge = document.getElementById('tierBadge');

/**
 * AuditLog Utility
 */
const escapeHtml = (str) => str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const AuditLog = {
    log(message, type = 'info') {
        let list = document.getElementById('auditLogList');
        if (!list) {
            return;
        }
        const entry = document.createElement('div');
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        let colorClass = 'text-gray-400';
        if (type === 'success') colorClass = 'text-emerald-400 font-bold';
        if (type === 'warn') colorClass = 'text-warn';
        if (type === 'err') colorClass = 'text-err';
        if (type === 'process') colorClass = 'text-blue-400';

        entry.className = `${colorClass} py-0.5 border-b border-white/5 last:border-0`;
        entry.innerHTML = `<span class="opacity-50">[${timeStr}]</span> [${type.toUpperCase()}] ${escapeHtml(message)}`;
        list.prepend(entry);
    }
};

// object url manager
const objectUrlManager = {
    urls: new Set(),
    create(blob) {
        const url = URL.createObjectURL(blob);
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
        if (memoryCount) memoryCount.textContent = this.urls.size;
    }
};

/**
 * initialize the application
 */
async function init() {
    try {
        AuditLog.log('Application starting...', 'info');
        if (window.location.protocol === 'file:') {
            AuditLog.log('Running via file:// protocol. Some features (Workers, Fetch) might be restricted.', 'warn');
        }

        await i18n.init();
        setupLanguageSelector();
        showLoading(i18n.t('status.loading'));

        AuditLog.log('Initializing WatermarkEngine...', 'process');
        engine = await WatermarkEngine.create();
        
        const hasWorker = engine._getWorker() !== null && engine._useWorker;
        AuditLog.log(`WatermarkEngine ready (Worker: ${hasWorker ? 'ON' : 'OFF'})`, 'success');
        
        engineStatus.textContent = 'READY';
        engineStatus.className = 'text-emerald-400 font-bold';
        
        workerStatus.textContent = hasWorker ? 'ACTIVE' : 'DISABLED';
        workerStatus.className = hasWorker ? 'text-emerald-400' : 'text-gray-500';
        AuditLog.log(`Web Worker status: ${hasWorker ? 'ENABLED' : 'DISABLED (UserScript or Fallback Mode)'}`, hasWorker ? 'success' : 'warn');

        hideLoading();
        setupEventListeners();
        setupDirectoryMode();
        loadSettings();

        zoom = mediumZoom('[data-zoomable]', {
            margin: 24,
            scrollOffset: 0,
            background: 'rgba(255, 255, 255, .6)',
        });
    } catch (error) {
        AuditLog.log(`Fatal Initialization Error: ${error.message}`, 'err');
        showLoadingFail(error.message);
        engineStatus.textContent = 'ERROR';
        engineStatus.className = 'text-err font-bold';
        console.error('initialize error:', error);
    }
}

/**
 * setup language selector (v1.5.5)
 */
function setupLanguageSelector() {
    const select = document.getElementById('langSelect');
    if (!select) return;
    
    select.value = i18n.locale;
    
    select.addEventListener('change', async () => {
        const newLocale = select.value;
        await i18n.switchLocale(newLocale);
        updateDynamicTexts();
        saveSettings();
        AuditLog.log(`Locale changed to: ${newLocale}`, 'info');
    });
}

function setupEventListeners() {
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(Array.from(e.dataTransfer.files));
    });

    downloadAllBtn.addEventListener('click', downloadAll);
    if (clearAllBtn) clearAllBtn.addEventListener('click', reset);
    resetBtn.addEventListener('click', reset);
    
    // Settings change listeners
    document.getElementById('deepScanToggle')?.addEventListener('change', saveSettings);
    document.getElementById('noiseReductionToggle')?.addEventListener('change', saveSettings);
    document.getElementById('autoDownloadToggle')?.addEventListener('change', saveSettings);

    // Updated Mode Toggles
    modeSliderBtn.addEventListener('click', () => switchViewMode('slider'));
    modeSideBtn.addEventListener('click', () => switchViewMode('side'));
    
    document.addEventListener('paste', handlePaste);
    setupSlider();
}

/**
 * Handle clipboard paste (v1.6)
 */
function handlePaste(e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    
    const items = Array.from(e.clipboardData.items);
    const files = items
        .filter(item => item.type.indexOf('image') !== -1)
        .map(item => item.getAsFile())
        .filter(f => f !== null);
    
    if (files.length > 0) {
        AuditLog.log(`Captured ${files.length} image(s) from clipboard.`, 'info');
        handleFiles(files);
    }
}

/**
 * Get current engine options from UI
 */
function getEngineOptions() {
    return {
        deepScan: document.getElementById('deepScanToggle')?.checked ?? true,
        noiseReduction: document.getElementById('noiseReductionToggle')?.checked ?? false,
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false
    };
}

function switchViewMode(mode) {
    if (mode === 'slider') {
        comparisonSlider.classList.remove('hidden');
        sideBySideView.classList.add('hidden');
        processedImage.classList.add('hidden');
        
        modeSliderBtn.className = 'px-3 py-1 text-[10px] font-bold rounded-md bg-emerald-500 text-white shadow-sm transition-all';
        modeSideBtn.className = 'px-3 py-1 text-[10px] font-bold rounded-md text-emerald-600 hover:bg-emerald-50 transition-all';
        AuditLog.log('Switched to SLIDER view', 'info');
    } else {
        comparisonSlider.classList.add('hidden');
        sideBySideView.classList.remove('hidden');
        processedImage.classList.add('hidden');
        
        modeSliderBtn.className = 'px-3 py-1 text-[10px] font-bold rounded-md text-emerald-600 hover:bg-emerald-50 transition-all';
        modeSideBtn.className = 'px-3 py-1 text-[10px] font-bold rounded-md bg-emerald-500 text-white shadow-sm transition-all';
        AuditLog.log('Switched to SIDE-BY-SIDE view', 'info');
    }
}

/**
 * Persistence Layer v1.5
 */
function saveSettings() {
    const settings = {
        deepScan: document.getElementById('deepScanToggle')?.checked ?? true,
        noiseReduction: document.getElementById('noiseReductionToggle')?.checked ?? false,
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false,
        locale: i18n.locale
    };
    localStorage.setItem('gwr_settings', JSON.stringify(settings));
    AuditLog.log('Settings saved to local storage', 'info');
}

async function loadSettings() {
    try {
        const saved = localStorage.getItem('gwr_settings');
        if (!saved) return;
        const settings = JSON.parse(saved);
        
        if (settings.deepScan !== undefined) {
            const el = document.getElementById('deepScanToggle');
            if (el) el.checked = settings.deepScan;
        }
        if (settings.noiseReduction !== undefined) {
            const el = document.getElementById('noiseReductionToggle');
            if (el) el.checked = settings.noiseReduction;
        }
        if (settings.autoDownload !== undefined) {
            const el = document.getElementById('autoDownloadToggle');
            if (el) el.checked = settings.autoDownload;
        }
        if (settings.locale && settings.locale !== i18n.locale) {
            await i18n.switchLocale(settings.locale);
            const select = document.getElementById('langSelect');
            if (select) select.value = settings.locale;
            updateDynamicTexts();
        }
        AuditLog.log('Settings restored from local storage', 'success');
    } catch (err) {
        console.warn('Failed to load settings:', err);
    }
}

/**
 * Clipboard Utility v1.5
 */
async function copyImageToClipboard(item) {
    if (!item.processedBlob) return;
    try {
        const data = [new ClipboardItem({ 'image/png': item.processedBlob })];
        await navigator.clipboard.write(data);
        AuditLog.log('Image copied to clipboard!', 'success');
        setStatusMessage(i18n.t('status.copied') || 'Copied to clipboard!', 'success');
    } catch (err) {
        AuditLog.log(`Failed to copy: ${err.message}`, 'err');
        // Fallback for browsers that don't support ClipboardItem for PNG
        setStatusMessage('Copy failed. Please right-click and save.', 'err');
    }
}

function setupSlider() {
    const move = (e) => {
        if (comparisonSlider.classList.contains('hidden')) return;
        const rect = comparisonSlider.getBoundingClientRect();
        const x = (e.pageX || e.touches?.[0].pageX) - rect.left - window.scrollX;
        const width = Math.max(0, Math.min(rect.width, x));
        const percent = (width / rect.width) * 100;
        sliderResize.style.width = percent + '%';
        sliderHandle.style.left = percent + '%';
    };

    comparisonSlider.addEventListener('mousemove', move);
    comparisonSlider.addEventListener('touchmove', move);
}

function reset() {
    if (isProcessing) {
        AuditLog.log('Cannot reset while processing. Please wait.', 'warn');
        return;
    }
    singlePreview.style.display = 'none';
    multiPreview.style.display = 'none';
    comparisonSlider.classList.add('hidden');
    processedImage.classList.remove('hidden');
    processedSection.style.display = 'none';
    
    // Comprehensive Cleanup
    objectUrlManager.clear();
    if (zoom) zoom.detach();
    
    imageQueue = [];
    processedCount = 0;
    fileInput.value = '';
    setStatusMessage('');
    if (batchProgressBar) batchProgressBar.style.width = '0%';
    AuditLog.log('Workspace reset. Resources cleared.', 'info');
}

function handleFileSelect(e) {
    handleFiles(Array.from(e.target.files));
}

function handleFiles(files) {
    if (isProcessing) {
        AuditLog.log('Processing already in progress...', 'warn');
        return;
    }
    const validFiles = files.filter(file => {
        if (!file.type.match('image/(jpeg|png|webp)')) return false;
        if (file.size > 20 * 1024 * 1024) return false;
        return true;
    });

    if (validFiles.length === 0) {
        AuditLog.log('No valid images selected (supports JPG, PNG, WebP up to 20MB)', 'warn');
        return;
    }

    AuditLog.log(`Selected ${validFiles.length} files. Starting processing flow...`, 'info');

    objectUrlManager.clear();
    imageQueue = validFiles.map((file, index) => ({
        id: Date.now() + index,
        file,
        name: file.name,
        status: 'pending',
        originalImg: null,
        processedBlob: null,
        originalUrl: null,
        processedUrl: null
    }));

    processedCount = 0;

    if (validFiles.length === 1) {
        singlePreview.style.display = 'block';
        multiPreview.style.display = 'none';
        isProcessing = true;
        processSingle(imageQueue[0]);
    } else {
        singlePreview.style.display = 'none';
        multiPreview.style.display = 'block';
        imageList.innerHTML = '';
        updateProgress();
        AuditLog.log(`Batch mode activated: ${imageQueue.length} images queued`, 'info');
        setStatusMessage(i18n.t('status.processing'), 'process');
        multiPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
        imageQueue.forEach(item => createImageCard(item));
        isProcessing = true;
        processQueue();
    }
}

async function processSingle(item) {
    try {
        const img = await loadImage(item.file);
        item.originalImg = img;
        item.originalUrl = img.src;

        const { is_google, is_original } = await checkOriginal(item.file);
        const status = getOriginalStatus({ is_google, is_original });
        setStatusMessage(status, is_google && is_original ? 'success' : 'warn');

        originalImage.src = item.originalUrl;

        const watermarkInfo = engine.getWatermarkInfo(img.width, img.height);
        originalInfo.innerHTML = `
            <p>${i18n.t('info.size')}: ${img.width}×${img.height}</p>
            <p>${i18n.t('info.watermark')}: ${watermarkInfo.size}×${watermarkInfo.size}</p>
            <p>${i18n.t('info.position')}: (${watermarkInfo.position.x},${watermarkInfo.position.y})</p>
        `;

        const startTime = performance.now();
        const options = getEngineOptions();
        AuditLog.log(`Processing image: ${item.name} (${img.width}x${img.height}) [NR: ${options.noiseReduction}]`, 'process');
        
        resultContainer.classList.add('scan-active');
        const { canvas, detectionMode, config } = await engine.removeWatermarkFromImage(img, options);
        resultContainer.classList.remove('scan-active');

        // Update Tier Badge
        if (config && config.isOfficial) {
            tierBadge.textContent = `${config.logoSize}px ${config.name || 'Official'} Tier`;
            tierBadge.classList.remove('hidden');
        } else {
            tierBadge.classList.add('hidden');
        }
        
        const endTime = performance.now();
        const latency = (endTime - startTime).toFixed(0);
        lastLatency.textContent = `Latency: ${latency}ms`;
        AuditLog.log(`Processing complete [Mode: ${detectionMode.toUpperCase()}] for ${item.name} in ${latency}ms`, 'success');

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        item.processedBlob = blob;

        item.processedUrl = objectUrlManager.create(blob);
        processedImage.src = item.processedUrl;
        
        // Update comparison views
        sliderOriginal.src = item.originalUrl;
        sliderProcessed.src = item.processedUrl;
        sideOriginal.src = item.originalUrl;
        sideProcessed.src = item.processedUrl;
        
        sliderResize.style.width = '50%';
        sliderHandle.style.left = '50%';

        processedSection.style.display = 'block';
        downloadBtn.style.display = 'flex';
        downloadBtn.onclick = () => downloadImage(item);

        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            copyBtn.style.display = 'flex';
            copyBtn.onclick = () => copyImageToClipboard(item);
        }

        processedInfo.innerHTML = `
            <span>${img.width}×${img.height}</span>
            <span class="px-2 opacity-50">|</span>
            <span class="text-emerald-500 underline decoration-2 underline-offset-4">${i18n.t('info.removed')}</span>
        `;

        zoom.detach();
        zoom.attach('[data-zoomable]');

        processedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (getEngineOptions().autoDownload) {
            AuditLog.log('Auto-download triggered.', 'info');
            downloadImage(item);
        }
    } catch (error) {
        AuditLog.log(`Process Error: ${error.message}`, 'err');
        console.error(error);
    } finally {
        isProcessing = false;
        hideLoading();
    }
}

function createImageCard(item) {
    const card = document.createElement('div');
    card.id = `card-${item.id}`;
    card.className = 'gwr-image-card bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group hover:shadow-premium transition-all duration-300';
    card.innerHTML = `
        <div class="flex flex-col md:flex-row h-full">
            <div class="relative w-full md:w-48 h-32 md:h-36 bg-gray-50 flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-gray-50">
                <div class="scan-line"></div>
                <img id="result-${item.id}" class="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105" data-zoomable />
                <div id="loader-${item.id}" class="absolute inset-0 flex items-center justify-center bg-gray-50/80">
                    <div class="animate-pulse flex space-x-2">
                        <div class="h-2 w-2 bg-emerald-400 rounded-full"></div>
                        <div class="h-2 w-2 bg-emerald-400 rounded-full"></div>
                        <div class="h-2 w-2 bg-emerald-400 rounded-full"></div>
                    </div>
                </div>
            </div>
            <div class="flex-1 p-4 flex flex-col justify-between min-w-0">
                <div>
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-gray-900 truncate pr-4 text-sm">${escapeHtml(item.name)}</h4>
                        <span id="tier-${item.id}" class="hidden flex-shrink-0 px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded font-black tracking-widest uppercase">OFFICIAL</span>
                    </div>
                    <div class="text-[11px] text-gray-400 font-medium space-y-0.5" id="status-${item.id}">${i18n.t('status.pending')}</div>
                </div>
                <div class="flex items-center justify-between mt-3">
                    <div id="meta-${item.id}" class="text-[10px] text-emerald-600 font-mono font-bold"></div>
                    <button id="download-${item.id}" class="px-4 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 hidden">
                        ${i18n.t('btn.download')}
                    </button>
                </div>
            </div>
        </div>
    `;
    imageList.appendChild(card);
}

async function processQueue() {
    const concurrency = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
    const options = getEngineOptions();
    AuditLog.log(`Batch started with sliding window concurrency: ${concurrency} [NR: ${options.noiseReduction}]`, 'info');

    let activeCount = 0;
    let index = 0;

    return new Promise((resolve) => {
        const next = async () => {
            if (index >= imageQueue.length && activeCount === 0) {
                isProcessing = false;
                if (processedCount > 0) {
                    downloadAllBtn.style.display = 'flex';
                    setStatusMessage(i18n.t('status.success'), 'success');
                    AuditLog.log('All batch tasks completed', 'success');
                    if (getEngineOptions().autoDownload) {
                        AuditLog.log('Auto-download triggered.', 'info');
                        downloadAll();
                    }
                }
                resolve();
                return;
            }

            while (activeCount < concurrency && index < imageQueue.length) {
                const item = imageQueue[index++];
                if (item.status !== 'pending') continue;

                activeCount++;
                item.status = 'processing';
                updateStatus(item.id, i18n.t('status.processing'));

                (async () => {
                    try {
                        const startTime = performance.now();
                        const img = await loadImage(item.file);
                        
                        const container = document.querySelector(`#card-${item.id} .relative`);
                        if (container) container.classList.add('scan-active');
                        
                        const { canvas, detectionMode, config } = await engine.removeWatermarkFromImage(img, options);
                        if (container) container.classList.remove('scan-active');
                        
                        const loader = document.getElementById(`loader-${item.id}`);
                        if (loader) loader.classList.add('hidden');

                        const endTime = performance.now();
                        const latency = (endTime - startTime).toFixed(0);
                        
                        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                        item.processedBlob = blob;

                        item.processedUrl = objectUrlManager.create(blob);
                        AuditLog.log(`Batch: ${item.name} done [${detectionMode}] in ${latency}ms`, 'success');
                        
                        if (config && config.isOfficial) {
                            const tier = document.getElementById(`tier-${item.id}`);
                            if (tier) tier.classList.remove('hidden');
                        }
                        const resultImg = document.getElementById(`result-${item.id}`);
                        if (resultImg) {
                            resultImg.src = item.processedUrl;
                            zoom.attach(`#result-${item.id}`);
                        }

                        item.status = 'completed';
                        const watermarkInfo = engine.getWatermarkInfo(img.width, img.height);

                        updateStatus(item.id, `<p>${i18n.t('info.size')}: ${img.width}×${img.height}</p>
                            <p>${i18n.t('info.watermark')}: ${watermarkInfo.size}×${watermarkInfo.size}</p>
                            <p>${i18n.t('info.position')}: (${watermarkInfo.position.x},${watermarkInfo.position.y})</p>`, true);

                        const downloadBtn = document.getElementById(`download-${item.id}`);
                        if (downloadBtn) {
                            downloadBtn.classList.remove('hidden');
                            downloadBtn.onclick = () => downloadImage(item);
                        }

                        processedCount++;
                        updateProgress();

                        checkOriginal(item.file).then(({ is_google, is_original }) => {
                            if (!is_google || !is_original) {
                                const status = getOriginalStatus({ is_google, is_original });
                                const statusEl = document.getElementById(`status-${item.id}`);
                                if (statusEl) statusEl.innerHTML += `<p class="inline-block mt-1 text-xs md:text-sm text-warn">${status}</p>`;
                            }
                        }).catch(() => {});
                    } catch (error) {
                        item.status = 'error';
                        updateStatus(item.id, i18n.t('status.failed'));
                        console.error(error);
                    } finally {
                        activeCount--;
                        next(); // Recursive-like call to pick up next task
                    }
                })();
            }
        };
        next();
    });
}

function updateStatus(id, text, isHtml = false) {
    const el = document.getElementById(`status-${id}`);
    if (el) {
        if (isHtml) {
            el.innerHTML = text;
        } else {
            el.textContent = text;
        }
    }
}

function updateProgress() {
    const total = imageQueue.length;
    progressText.textContent = `${i18n.t('progress.text')}: ${processedCount}/${total}`;
    if (batchProgressBar && total > 0) {
        const percentage = (processedCount / total) * 100;
        batchProgressBar.style.width = `${percentage}%`;
        if (percentage >= 100) {
            batchProgressBar.classList.replace('bg-blue-600', 'bg-emerald-500');
        } else {
            batchProgressBar.classList.replace('bg-emerald-500', 'bg-blue-600');
        }
    }
}

function updateDynamicTexts() {
    if (progressText.textContent) {
        updateProgress();
    }
}

function downloadImage(item) {
    const a = document.createElement('a');
    a.href = item.processedUrl;
    a.download = `unwatermarked_${item.name.replace(/\.[^.]+$/, '')}.png`;
    a.click();
}

async function downloadAll() {
    const completed = imageQueue.filter(item => item.status === 'completed');
    if (completed.length === 0) return;

    const zip = new JSZip();
    completed.forEach(item => {
        const filename = `unwatermarked_${item.name.replace(/\.[^.]+$/, '')}.png`;
        zip.file(filename, item.processedBlob);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    const zipUrl = objectUrlManager.create(blob);
    a.href = zipUrl;
    a.download = `unwatermarked_${Date.now()}.zip`;
    a.click();
    // Revoke after download trigger
    setTimeout(() => objectUrlManager.revoke(zipUrl), 3000);
}

/**
 * Directory Mode Logic
 */
function setupDirectoryMode() {
    if (!window.showDirectoryPicker) {
        AuditLog.log('Native File System API not supported in this browser.', 'warn');
        return;
    }
    
    if (directoryModeBtn) {
        directoryModeBtn.classList.remove('hidden');
        directoryModeBtn.addEventListener('click', () => {
            const isHidden = directoryPanel.classList.toggle('hidden');
            uploadArea.parentElement.classList.toggle('hidden', !isHidden);
            AuditLog.log(`Directory Mode ${isHidden ? 'deactivated' : 'activated'}`, 'info');
        });
    }

    if (setInputDirBtn) setInputDirBtn.addEventListener('click', () => selectDirectory('input'));
    if (setOutputDirBtn) setOutputDirBtn.addEventListener('click', () => selectDirectory('output'));
    if (startDirProcessBtn) startDirProcessBtn.addEventListener('click', processDirectory);
}

async function selectDirectory(type) {
    try {
        const handle = await window.showDirectoryPicker();
        if (type === 'input') inputDirHandle = handle;
        else outputDirHandle = handle;

        dirStatus.classList.remove('hidden');
        const pathEl = type === 'input' ? inputDirPathEl : outputDirPathEl;
        pathEl.textContent = handle.name;
        
        startDirProcessBtn.disabled = !(inputDirHandle && outputDirHandle);
        AuditLog.log(`${type.toUpperCase()} directory set: ${handle.name}`, 'success');
    } catch (err) {
        AuditLog.log(`Directory selection cancelled: ${err.message}`, 'warn');
    }
}

async function processDirectory() {
    if (!inputDirHandle || !outputDirHandle || isProcessing) return;
    
    isProcessing = true;
    startDirProcessBtn.disabled = true;
    startDirProcessBtn.textContent = i18n.t('status.processing');
    AuditLog.log('Starting automated directory processing...', 'process');
    
    async function* getFileGenerator(dirHandle) {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && /\.(jpe?g|png|webp)$/i.test(entry.name)) {
                yield await entry.getFile();
            }
        }
    }

    const fileIterator = getFileGenerator(inputDirHandle);
    
    singlePreview.style.display = 'none';
    multiPreview.style.display = 'block';
    imageList.innerHTML = '';
    objectUrlManager.clear();
    imageQueue = [];
    processedCount = 0;
    updateProgress();

    const concurrency = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
    const options = getEngineOptions();
    AuditLog.log(`Streaming directory processing started (Window: ${concurrency}, NR: ${options.noiseReduction})`, 'process');
    
    let activeCount = 0;
    let isDone = false;

    await new Promise((resolve) => {
        const next = async () => {
            if (isDone && activeCount === 0) {
                resolve();
                return;
            }

            while (activeCount < concurrency && !isDone) {
                const { value: file, done } = await fileIterator.next();
                if (done) {
                    isDone = true;
                    if (activeCount === 0) resolve();
                    return;
                }

                activeCount++;
                const item = {
                    id: Date.now() + Math.random(),
                    file,
                    name: file.name,
                    status: 'processing'
                };
                imageQueue.push(item);
                createImageCard(item);
                updateStatus(item.id, i18n.t('status.processing'));
                updateProgress();

                (async () => {
                    try {
                        const img = await loadImage(item.file);
                        const { canvas, detectionMode } = await engine.removeWatermarkFromImage(img, options);
                        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                        
                        const filename = `unwatermarked_${item.name.replace(/\.[^.]+$/, '')}.png`;
                        const fileHandle = await outputDirHandle.getFileHandle(filename, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();

                        item.status = 'completed';
                        item.processedBlob = blob;
                        updateStatus(item.id, `✅ Saved [${detectionMode.toUpperCase()}]`, true);
                        processedCount++;
                        updateProgress();
                    } catch (err) {
                        item.status = 'error';
                        updateStatus(item.id, `❌ Error: ${err.message}`);
                        AuditLog.log(`Error processing ${item.name}: ${err.message}`, 'err');
                    } finally {
                        activeCount--;
                        next();
                    }
                })();
            }
        };
        next();
    });

    AuditLog.log(`Directory processing complete. ${processedCount} images saved.`, 'success');
    if (processedCount > 0) downloadAllBtn.style.display = 'flex';
    isProcessing = false;
    startDirProcessBtn.disabled = false;
    startDirProcessBtn.textContent = i18n.t('status.success');
    setStatusMessage(i18n.t('status.success'), 'success');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
