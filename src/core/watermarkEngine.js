/**
 * Watermark engine main module
 * Coordinate watermark detection, alpha map calculation, and removal operations
 */

import { calculateAlphaMap } from './alphaMap.js';
import { removeWatermark } from './blendModes.js';
import { calculateWatermarkPosition, getAllPotentialConfigs } from './config.js';
import { calculateProbeConfidence, resetDetectorBuffers } from './detector.js';
import { PROFILES } from './profiles.js';

export class WatermarkEngine {
    constructor() {
        this.alphaMaps = {};
        this._worker = null;
        this._workerHandlers = new Map();
        this._nextTaskId = 0;
        this._reusableCanvas = null;
        this._reusableCtx = null;
        this._useWorker = false;
        this._workerFailed = false;
        
        // Cache for loaded images
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
                const workerUrl = new URL('worker.js', import.meta.url);
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
                        } catch (err) {}
                        this._worker = null;
                    }
                };
                this._useWorker = true;
            } catch (err) {
                console.warn('Failed to start worker:', err);
                this._useWorker = false;
                this._workerFailed = true;
                return null;
            }
        }
        return this._worker;
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
            src = `assets/${assetName}.png`;
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
     * Remove watermark from image with multi-probe support
     * @param {HTMLImageElement|HTMLCanvasElement} image - Input image
     * @param {Object} options - { profileId, deepScan, noiseReduction }
     * @returns {Promise<Object>} Detection results
     */
    async removeWatermarkFromImage(image, options = {}) {
        const requestedProfileId = options.profileId || 'gemini';
        let profilesToTry = requestedProfileId === 'auto' ? Object.keys(PROFILES) : [requestedProfileId];
        
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
            const msg = `Security Error: ${e.message}. 
                1. 浏览器检测到该图片来自第三方网站（跨域）。 
                2. 即使开启了 CORS，服务器也可能未正确发送 Header。
                3. 请务必先将图片“另存为”到本地电脑，再拖入本工具处理。`;
            throw new Error(msg);
        }
        
        let removedCount = 0;
        let bestConfidence = 0;
        let lastResult = null;
        const threshold = 0.10;

        // 2. Multi-Probe Detection Loop (Hardened v1.8)
        const detectionOptions = { deepScan: options.deepScan !== false };
        
        const tryProfile = async (id) => {
            const p = PROFILES[id] || PROFILES.gemini;
            const potentialConfigs = getAllPotentialConfigs(canvas.width, canvas.height, id);
            let localRemoved = 0;
            let localBestConf = 0;
            let localBestResult = null;

            for (const config of potentialConfigs) {
                const pos = calculateWatermarkPosition(canvas.width, canvas.height, config);
                const assetKey = (p.assets && p.assets[pos.anchor]) || config.logoSize || '96';
                const alphaMap = await this.getAlphaMap(assetKey, pos.width, pos.height);
                
                const verification = calculateProbeConfidence(imageData, pos, alphaMap.data, id, detectionOptions);
                if (verification.confidence > threshold) {
                    if (verification.confidence > localBestConf) {
                        localBestConf = verification.confidence;
                        localBestResult = { config, pos: { ...pos, x: verification.x, y: verification.y }, alphaMap: alphaMap.data };
                    }
                    localRemoved++;
                }
            }
            return { removed: localRemoved, confidence: localBestConf, result: localBestResult, profileId: id };
        };

        let overallBest = { confidence: 0 };
        if (requestedProfileId === 'auto') {
            for (const pid of profilesToTry) {
                const pRes = await tryProfile(pid);
                if (pRes.confidence > overallBest.confidence) {
                    overallBest = pRes;
                }
            }
        } else {
            overallBest = await tryProfile(requestedProfileId);
        }

        if (overallBest.result) {
            removeWatermark(imageData, overallBest.result.alphaMap, overallBest.result.pos);
            removedCount = 1;
            bestConfidence = overallBest.confidence;
            lastResult = { config: overallBest.result.config, pos: overallBest.result.pos, profileId: overallBest.profileId };
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
            profileId: lastResult ? lastResult.profileId : requestedProfileId
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
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
