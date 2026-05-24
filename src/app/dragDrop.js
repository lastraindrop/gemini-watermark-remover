import i18n from '../i18n.js';
import { ENGINE_LIMITS } from '../core/config.js';
import { getEngineOptions } from './settings.js';
import { state } from './state.js';
import { AuditLog, showToast, resetGlobalProgress } from './ui.js';
import { processSingle, processQueue } from './processing.js';
import { clearManualRegion, setManualSelectionEnabled } from './manualSelection.js';
import { resetWorkspace } from '../app.js';

let _dragState = { depth: 0 };

function getDragState() { return _dragState; }

export function isSupportedImageFile(file) {
    const type = (file.type || '').toLowerCase();
    if (/^image\/(jpeg|png|webp)$/.test(type)) return true;
    return /\.(jpe?g|png|webp)$/i.test(file.name || '');
}

function createImageCard(item, elements) {
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

export function handleFiles(files, elements, onSingleSuccess, onBatchItemSuccess, onBatchItemError, onBatchComplete) {
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
        let engineOptions;
        try {
            engineOptions = getEngineOptions(elements, { optionalManual: true });
        } catch (error) {
            showToast(error.message, 'err');
            return;
        }
        elements.singlePreview.style.display = 'block';
        elements.multiPreview.style.display = 'none';
        document.getElementById('resultContainer')?.classList.add('scan-active');
        state.activeSingleItem = state.imageQueue[0];
        state.isProcessing = true;

        processSingle(state.imageQueue[0], engineOptions, {
            onSuccess: ({ item, removedCount, confidence, latency, config, pos, profileId }) => {
                if (onSingleSuccess) onSingleSuccess(item, removedCount, confidence, latency, config, pos, profileId);
                elements.singlePreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
            onError: () => {}
        }).finally(() => {
            document.getElementById('resultContainer')?.classList.remove('scan-active');
            state.isProcessing = false;
        });
    } else {
        state.activeSingleItem = null;
        elements.singlePreview.style.display = 'none';
        elements.multiPreview.style.display = 'block';
        elements.imageList.innerHTML = '';
        state.imageQueue.forEach(item => createImageCard(item, elements));

        processQueue(getEngineOptions(elements, { ignoreManual: true }), {
            onItemSuccess: ({ item, removedCount, confidence, latency }) => {
                if (onBatchItemSuccess) onBatchItemSuccess(item, removedCount, confidence, latency);
            },
            onItemError: ({ item, error }) => {
                if (onBatchItemError) onBatchItemError(item, error);
            },
            onComplete: () => {
                const successCount = state.imageQueue.filter(i => i.status === 'success').length;
                const failedCount = state.imageQueue.filter(i => i.status === 'error').length;
                showToast(i18n.t('toast.batchComplete', { success: successCount, failed: failedCount }), failedCount ? 'info' : 'success');
                elements.downloadAllBtn.style.display = successCount > 0 ? 'block' : 'none';
                if (onBatchComplete) onBatchComplete();
            }
        });
    }
}

export async function handleUrl(uri, elements, handleFilesFn) {
    try {
        AuditLog.log(`Remote asset detected: ${uri.split('/').pop()}`, 'process');
        const response = await fetch(uri);
        if (!response.ok) throw new Error('CORS blocked or server error');
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Not an image');
        const file = new File([blob], uri.split('/').pop() || 'remote_image.png', { type: blob.type });
        handleFilesFn([file]);
    } catch (e) {
        AuditLog.log(`Remote Fetch Failed: ${e.message}`, 'err');
        showToast(i18n.t('error.remoteFetchFailed'), 'err');
    }
}

export async function handleDataTransferItems(items, elements, handleFilesFn) {
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
        handleFilesFn(files);
    }
}

export async function handleDropEvent(event, elements, handleFilesFn) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    const uri = dataTransfer.getData('text/uri-list')
        .split('\n')
        .map(line => line.trim())
        .find(line => line && !line.startsWith('#'));

    if (uri) {
        await handleUrl(uri, elements, handleFilesFn);
        return;
    }

    const items = dataTransfer.items;
    const hasEntries = items && Array.from(items).some(item => typeof item.webkitGetAsEntry === 'function');
    if (hasEntries) {
        await handleDataTransferItems(items, elements, handleFilesFn);
        return;
    }

    handleFilesFn(Array.from(dataTransfer.files || []));
}

function isFileOrUrlDrag(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files') || types.includes('text/uri-list');
}

function setDropzoneActive(active, elements) {
    elements.uploadArea?.classList.toggle('scale-[0.98]', active);
    elements.uploadArea?.classList.toggle('drop-active', active);
    const overlay = document.getElementById('globalDragOverlay');
    if (overlay) {
        overlay.classList.toggle('opacity-100', active);
        overlay.classList.toggle('pointer-events-none', !active);
    }
}

export function setupWindowDragAndDrop(elements, handleFilesFn) {
    window.addEventListener('dragenter', (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        getDragState().depth++;
        setDropzoneActive(true, elements);
    });

    window.addEventListener('dragover', (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropzoneActive(true, elements);
    });

    window.addEventListener('dragleave', (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        getDragState().depth = Math.max(0, getDragState().depth - 1);
        if (getDragState().depth === 0) setDropzoneActive(false, elements);
    });

    window.addEventListener('drop', async (event) => {
        if (!isFileOrUrlDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        getDragState().depth = 0;
        setDropzoneActive(false, elements);
        try {
            await handleDropEvent(event, elements, handleFilesFn);
        } catch (err) {
            AuditLog.log(`Drop handler error: ${err.message}`, 'err');
            showToast(i18n.t('error.dropFailed'), 'err');
        }
    });
}
