import i18n from '../i18n.js';
import { state, objectUrlManager } from './state.js';
import { AuditLog, updateProgress } from './ui.js';
import { loadImage, checkOriginal } from '../dom-utils.js';
import { ENGINE_LIMITS } from '../core/config.js';
import JSZip from 'jszip';

/**
 * Image processing utilities
 */

export async function processSingle(item, options, callbacks = {}) {
    try {
        const img = item.originalImg || await loadImage(item.file, { objectUrlManager });
        
        if (img.width * img.height > ENGINE_LIMITS.MAX_PIXELS) {
            throw new Error(i18n.t('error.imageTooLarge', { width: img.width, height: img.height, limit: ENGINE_LIMITS.MAX_PIXELS / 1000000 }));
        }

        item.originalImg = img;
        item.originalUrl = img.src;

        const { is_google, is_original } = await checkOriginal(item.file);
        if (callbacks.onOriginalStatus) {
            callbacks.onOriginalStatus({ is_google, is_original });
        }

        const startTime = performance.now();
        const result = await state.engine.removeWatermarkFromImage(img, options);
        const endTime = performance.now();
        const { canvas, confidence, config, pos, removedCount, profileId } = result;
        if (result._detectionSource) item._detectionSource = result._detectionSource;
        
        const latency = (endTime - startTime).toFixed(0);
        const confPercent = (confidence * 100).toFixed(0);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error(i18n.t('error.encodeFailed'));
        if (item.processedUrl) objectUrlManager.revoke(item.processedUrl);
        item.processedBlob = blob;
        item.processedUrl = objectUrlManager.create(blob);
        item.status = 'success';

        if (callbacks.onSuccess) {
            callbacks.onSuccess({ item, removedCount, confidence: confPercent, latency, config, pos, profileId });
        }

        if (options.autoDownload) {
            downloadImage(item);
        }
    } catch (error) {
        item.status = 'error';
        AuditLog.log(`Process Error [${item.name}]: ${error.message}`, 'err');
        if (callbacks.onError) callbacks.onError(error);
    }
}

function yieldToBrowser() {
    if (typeof window === 'undefined') {
        return new Promise(resolve => setTimeout(resolve, 0));
    }
    if ('requestIdleCallback' in window) {
        return new Promise(resolve => window.requestIdleCallback(resolve, { timeout: 80 }));
    }
    return new Promise(resolve => window.requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function getBatchConcurrency(options = {}, queue = state.imageQueue) {
    const requested = Number(options.batchConcurrency);
    if (Number.isInteger(requested) && requested > 0) return Math.min(requested, 4);
    if (options.profileId === 'auto' || options.deepScan !== false || options.noiseReduction === true) return 2;
    return queue.length > 8 ? 1 : 2;
}

export async function processQueue(options, callbacks = {}) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    
    const queue = [...state.imageQueue];
    const total = queue.length;
    const concurrency = getBatchConcurrency(options, queue);

    const next = async () => {
        if (queue.length === 0) return;
        
        const item = queue.shift();
        let accounted = false;
        
        try {
            await yieldToBrowser();
            await processSingle(item, options, {
                ...callbacks,
                onSuccess: (data) => {
                    accounted = true;
                    state.processedCount++;
                    updateProgress(state.processedCount, total);
                    if (callbacks.onItemSuccess) callbacks.onItemSuccess(data);
                },
                onError: (error) => {
                    accounted = true;
                    state.processedCount++;
                    updateProgress(state.processedCount, total);
                    if (callbacks.onItemError) callbacks.onItemError({ item, error });
                    if (callbacks.onError) callbacks.onError(error);
                }
            });
        } finally {
            await yieldToBrowser();
            if (!accounted && item.status !== 'pending') {
                state.processedCount++;
                updateProgress(state.processedCount, total);
            }
            if (queue.length > 0) {
                await next();
            }
        }
    };

    try {
        const workers = Array(Math.min(concurrency, queue.length)).fill(0).map(() => next());
        await Promise.all(workers);
    } finally {
        state.isProcessing = false;
        if (callbacks.onComplete) callbacks.onComplete();
    }
}

function downloadNameForItem(item) {
    const sourceName = item.name || item.file?.name || 'image';
    const stem = sourceName.replace(/\.[^.\\/]+$/, '');
    return `unwatermarked_${stem}.png`;
}

function uniqueZipName(name, usedNames) {
    if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot === -1 ? name : name.slice(0, dot);
    const ext = dot === -1 ? '' : name.slice(dot);
    let index = 2;
    let candidate = `${stem}_${index}${ext}`;
    while (usedNames.has(candidate)) {
        index++;
        candidate = `${stem}_${index}${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
}

export function downloadImage(item) {
    if (!item.processedBlob) return;
    let url = item.processedUrl;
    if (!url) {
        url = URL.createObjectURL(item.processedBlob);
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadNameForItem(item);
    document.body?.appendChild(a);
    a.click();
    a.remove();
    if (!item.processedUrl) {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
}

export async function downloadAllAsZip(items, options = {}) {
    const completedItems = items.filter(item => item.status === 'success' && item.processedBlob);
    if (completedItems.length === 0) return 0;

    const zip = new JSZip();
    const usedNames = new Set();
    completedItems.forEach(item => {
        zip.file(uniqueZipName(downloadNameForItem(item), usedNames), item.processedBlob);
    });

    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    }, metadata => {
        if (options.onProgress) options.onProgress(metadata.percent);
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = options.filename || `gwr_batch_${Date.now()}.zip`;
    document.body?.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    AuditLog.log(`ZIP bundle exported: ${completedItems.length} files`, 'success');
    return completedItems.length;
}
