import { state, objectUrlManager } from './state.js';
import { AuditLog, updateProgress } from './ui.js';
import { loadImage, checkOriginal } from '../utils.js';
import { ENGINE_LIMITS } from '../core/config.js';

/**
 * Image processing utilities
 */

export async function processSingle(item, options, callbacks = {}) {
    try {
        const img = await loadImage(item.file);
        
        if (img.width * img.height > ENGINE_LIMITS.MAX_PIXELS) {
            throw new Error(`Image too large: ${img.width}x${img.height} exceeds ${ENGINE_LIMITS.MAX_PIXELS / 1000000}MP limit.`);
        }

        item.originalImg = img;
        item.originalUrl = img.src;

        const { is_google, is_original } = await checkOriginal(item.file);
        if (callbacks.onOriginalStatus) {
            callbacks.onOriginalStatus({ is_google, is_original });
        }

        const startTime = performance.now();
        const { canvas, confidence, config, pos, removedCount, profileId } = await state.engine.removeWatermarkFromImage(img, options);
        const endTime = performance.now();
        
        const latency = (endTime - startTime).toFixed(0);
        const confPercent = (confidence * 100).toFixed(0);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
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

export async function processQueue(options, callbacks = {}) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    
    // Concurrency control: 4 workers
    const CONCURRENCY = 4;
    const queue = [...state.imageQueue];
    const total = queue.length;

    const next = async () => {
        if (queue.length === 0) return;
        
        const item = queue.shift();
        let accounted = false;
        
        try {
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
        const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(0).map(() => next());
        await Promise.all(workers);
    } finally {
        state.isProcessing = false;
        if (callbacks.onComplete) callbacks.onComplete();
    }
}

export function downloadImage(item) {
    if (!item.processedBlob) return;
    const a = document.createElement('a');
    a.href = item.processedUrl;
    a.download = `unwatermarked_${item.name}`;
    a.click();
}
