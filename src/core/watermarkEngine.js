/**
 * Watermark engine main module
 * Coordinate watermark detection, alpha map calculation, and removal operations
 */

import { calculateAlphaMap } from './alphaMap.js';
import { removeWatermark } from './blendModes.js';
import { resetDetectorBuffers } from './detector.js';
import { detectWatermarks } from './detectionPipeline.js';
import { removeRepeatedWatermarkLayers } from './multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from './alphaCalibration.js';
import { applyRemovalStrategy } from './applyRemoval.js';
import { WorkerPool } from './workerPool.js';

export class WatermarkEngine {
    constructor() {
        this.alphaMaps = {};
        this._worker = null;
        this._workerPool = null;
        this._workerHandlers = new Map();
        this._nextTaskId = 0;
        this._reusableCanvas = null;
        this._reusableCtx = null;
        this._useWorker = false;
        this._workerFailed = false;
        
        this._assetCache = {};
    }

    static async create() {
        const engine = new WatermarkEngine();
        // Note: Actual assets are loaded lazily in browser environment to save memory
        return engine;
    }

    /**
     * Lazy-initialize or get the persistent worker
     */
    _getWorker() {
        if (typeof window === 'undefined' || !window.Worker || window.GM_info || this._workerFailed) return null;
        if (!this._worker) {
            try {
                let workerUrl;
                try {
                    workerUrl = new URL('worker.js', import.meta.url);
                } catch {
                    const scripts = document.getElementsByTagName('script');
                    const appScript = scripts.length > 0 ? scripts[scripts.length - 1].src : '';
                    const base = appScript || (typeof window !== 'undefined' ? window.location.href : '');
                    workerUrl = new URL('worker.js', base);
                }
                this._worker = new Worker(workerUrl);
                this._worker.onmessage = (e) => {
                    const { taskId, imageData, error } = e.data;
                    const handler = this._workerHandlers.get(taskId);
                    if (handler) {
                        this._workerHandlers.delete(taskId);
                        if (error) {
                            handler.reject(new Error(error));
                        } else {
                            handler.resolve(imageData);
                        }
                    }
                };
                this._worker.onerror = (e) => {
                    console.warn('Worker error, switching to main thread:', e);
                    this._useWorker = false;
                    this._workerFailed = true;
                    this._workerHandlers.forEach(h => h.reject(new Error('Worker crashed')));
                    this._workerHandlers.clear();
                    if (this._worker) {
                        try {
                            this._worker.terminate();
                        } catch {}
                        this._worker = null;
                    }
                };
                this._useWorker = true;

                this._workerPool = new WorkerPool(workerUrl, 2);
            } catch (err) {
                console.warn('Failed to start worker:', err);
                this._useWorker = false;
                this._workerFailed = true;
                return null;
            }
        }
        return this._worker;
    }

    getExecutionMode() {
        return this._useWorker && this._getWorker() !== null ? 'worker-assisted' : 'main-thread';
    }

    async _performWorkerRemoval(imageData, matches) {
        if (this._workerPool && this._workerPool.isAvailable) {
            try {
                return await this._workerPool.postTask(imageData, matches);
            } catch {
                this._useWorker = false;
                throw new Error('Worker pool failed');
            }
        }

        const worker = this._getWorker();
        if (!worker || !this._useWorker) {
            throw new Error('Worker not available');
        }

        const copy = new Uint8ClampedArray(imageData.data);
        const taskId = this._nextTaskId++;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._workerHandlers.delete(taskId);
                reject(new Error('Worker removal timed out'));
            }, Math.max(5000, (imageData.width * imageData.height) / 500000));

            this._workerHandlers.set(taskId, {
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                }
            });

            try {
                worker.postMessage(
                    {
                        imageData: { width: imageData.width, height: imageData.height, data: copy },
                        matches,
                        taskId
                    },
                    [copy.buffer]
                );
            } catch (err) {
                clearTimeout(timer);
                this._workerHandlers.delete(taskId);
                reject(err);
            }
        }).then(resultImageData => resultImageData.data);
    }

    /**
     * Load asset image (browser/bundler compatible)
     */
    async _loadAsset(assetKey) {
        // Normalize numeric keys (e.g. 48, 96) to strings
        assetKey = String(assetKey);
        if (this._assetCache[assetKey]) return this._assetCache[assetKey];

        // Determine path based on asset name (v1.8 naming convention)
        const assetName = assetKey.startsWith('bg_') ? assetKey : `bg_${assetKey}`;
        
        // v1.9.8 Inlining Optimization: Check for pre-loaded assets
        let src;
        if (typeof window !== 'undefined' && window.GWR_INLINED_ASSETS && window.GWR_INLINED_ASSETS[assetName]) {
            src = window.GWR_INLINED_ASSETS[assetName];
        } else {
            const assetBase = typeof window !== 'undefined' && window.GWR_ASSET_BASE ? window.GWR_ASSET_BASE : './';
            src = `${assetBase}assets/${assetName}.png`;
        }

        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error(`Failed to load asset: ${src}`));
            i.src = src;
        });

        this._assetCache[assetKey] = img;
        return img;
    }

    /**
     * Get alpha map for a specific asset with optional resizing
     */
    async getAlphaMap(assetKey, targetW, targetH) {
        assetKey = String(assetKey);
        const cacheKey = targetW ? `${assetKey}_${targetW}x${targetH}` : assetKey;
        if (this.alphaMaps[cacheKey]) return this.alphaMaps[cacheKey];

        const img = await this._loadAsset(assetKey);
        
        if (!this._reusableCanvas) {
            this._reusableCanvas = document.createElement('canvas');
            this._reusableCtx = this._reusableCanvas.getContext('2d', { willReadFrequently: true });
        }
        
        const finalW = targetW || img.width;
        const finalH = targetH || img.height;
        
        this._reusableCanvas.width = finalW;
        this._reusableCanvas.height = finalH;
        this._reusableCtx.clearRect(0, 0, finalW, finalH);
        this._reusableCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, finalW, finalH);

        const imageData = this._reusableCtx.getImageData(0, 0, finalW, finalH);
        const alphaMap = calculateAlphaMap(imageData);
        
        this.alphaMaps[cacheKey] = { data: alphaMap, width: finalW, height: finalH };
        return this.alphaMaps[cacheKey];
    }

    /**
     * Remove watermark from image with multi-probe support.
     * Detection runs on the main thread; pixel restoration is delegated to the
     * worker when available, with transparent fallback to the main thread.
     * @param {HTMLImageElement|HTMLCanvasElement} image - Input image
     * @param {Object} options - { profileId, deepScan, noiseReduction }
     * @returns {Promise<Object>} Detection results
     */
    async removeWatermarkFromImage(image, options = {}) {
        const requestedProfileId = options.profileId || 'gemini';
        
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        let imageData;
        try {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error('Core Engine - Pixel Access Violation:', e);
            let msg;
            try {
                const { default: i18n } = await import('../i18n.js');
                msg = i18n.t('error.cors.detail', { message: e.message });
            } catch {
                msg = `Security Error: ${e.message}. 1. The image is from a third-party website (cross-origin). 2. Even with CORS enabled, the server may not send the correct headers. 3. Please save the image to your local device first, then drag it into this tool.`;
            }
            throw new Error(msg);
        }
        
        let removedCount = 0;
        let bestConfidence = 0;
        let lastResult = null;

        const overallBest = await detectWatermarks({
            imageData,
            profileId: requestedProfileId,
            getAlphaMap: (assetKey, width, height) => this.getAlphaMap(assetKey, width, height),
            options: {
                deepScan: options.deepScan !== false,
                noiseReduction: options.noiseReduction === true,
                ...options // Pass through v2.1 custom parameters (thresholds, penalty, overrides, manualConfig)
            }
        });

        if (overallBest.matches.length > 0) {
            let workerUsed = false;
            const worker = this._getWorker();

            if (worker && this._useWorker) {
                try {
                    const modifiedData = await this._performWorkerRemoval(imageData, overallBest.matches);
                    imageData.data.set(modifiedData);
                    workerUsed = true;
                } catch (err) {
                    console.warn('Worker removal failed, falling back to main thread:', err.message || err);
                }
            }

            if (!workerUsed) {
                applyRemovalStrategy(imageData, overallBest.matches);
            }

            removedCount = overallBest.matches.length;
            bestConfidence = overallBest.confidence;
            lastResult = {
                config: overallBest.winner.config,
                pos: overallBest.winner.pos,
                profileId: overallBest.profileId
            };
        }

        if (removedCount > 0) {
            ctx.putImageData(imageData, 0, 0);
        }

        return { 
            canvas, 
            detectionMode: removedCount > 0 ? 'multi-probe' : 'none',
            confidence: bestConfidence,
            removedCount,
            config: lastResult ? lastResult.config : null,
            pos: lastResult ? lastResult.pos : null,
            profileId: lastResult ? lastResult.profileId : requestedProfileId
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this._workerPool) {
            this._workerPool.terminate();
            this._workerPool = null;
        }
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        this._reusableCanvas = null;
        this._reusableCtx = null;
        this.alphaMaps = {};
        this._assetCache = {};
        resetDetectorBuffers();
    }
}
