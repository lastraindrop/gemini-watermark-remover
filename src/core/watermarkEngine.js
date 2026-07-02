/**
 * Watermark engine main module
 * Coordinate watermark detection, alpha map calculation, and removal operations
 */

import { calculateAlphaMap } from './alphaMap.js';
import { resetDetectorBuffers } from './detector.js';
import { detectWatermarks } from './detectionPipeline.js';
import { applyRemovalStrategy } from './applyRemoval.js';
import { WorkerPool } from './workerPool.js';
import { getAssetDefinition, getInlineAssetName } from './assetRegistry.js';

// v2.5: Inline all watermark template PNGs as base64 data URLs at build time.
// This avoids CORS issues and canvas tainting when the page is opened via
// file:// protocol, where crossOrigin='anonymous' is blocked and regular
// image loading taints the canvas.
let inlineAssetsPromise = null;

// Keep binary assets behind a dynamic boundary. Browser builds still inline
// them through esbuild's dataurl loader, while importing the public SDK in a
// plain Node process no longer asks Node's ESM loader to parse PNG files.
async function getInlineAssets() {
    if (!inlineAssetsPromise) {
        inlineAssetsPromise = Promise.all([
            import('../assets/bg_48.png'),
            import('../assets/bg_96.png'),
            import('../assets/bg_96_20260520.png'),
            import('../assets/bg_doubao.png'),
            import('../assets/bg_doubao_br.png'),
            import('../assets/bg_doubao_br_tall.png'),
            import('../assets/bg_doubao_tl.png'),
            import('../assets/bg_doubao_tl_tall.png'),
            import('../assets/doubao_br_2k_tpl.png'),
            import('../assets/doubao_tl_2k_tpl.png'),
            import('../assets/doubao_tl_refined_mask.png')
        ]).then(modules => {
            const [bg48, bg96, bg96Variant, doubao, doubaoBr, doubaoBrTall,
                doubaoTl, doubaoTlTall, doubaoBr2k, doubaoTl2k, doubaoTlMask] =
                modules.map(module => module.default);
            return {
                'bg_48': bg48,
                'bg_96': bg96,
                'bg_96_20260520': bg96Variant,
                'bg_doubao': doubao,
                'bg_doubao_br': doubaoBr,
                'bg_doubao_br_tall': doubaoBrTall,
                'bg_doubao_tl': doubaoTl,
                'bg_doubao_tl_tall': doubaoTlTall,
                'bg_373x165': doubao,
                'bg_307x167': doubaoTl,
                'bg_401x173': doubaoBr,
                'bg_248x105': doubaoTlMask,
                'bg_348x151': doubao,
                'bg_221x109': doubaoTlTall,
                'bg_276x125': doubaoBrTall,
                'doubao_br_2k_tpl': doubaoBr2k,
                'doubao_tl_2k_tpl': doubaoTl2k,
                'doubao_tl_refined_mask': doubaoTlMask
            };
        });
    }
    return inlineAssetsPromise;
}

export class WatermarkEngine {
    constructor() {
        this.alphaMaps = {};
        this._workerPool = null;
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
     * Lazy-initialize worker pool (v2.2: single pool instead of pool+single worker)
     */
    _getWorkerPool() {
        if (typeof window === 'undefined' || !window.Worker || window.GM_info || this._workerFailed) return null;
        if (!this._workerPool) {
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
                this._workerPool = new WorkerPool(workerUrl, 2);
                this._useWorker = this._workerPool.isAvailable;
            } catch (err) {
                console.warn('Failed to start worker pool:', err);
                this._useWorker = false;
                this._workerFailed = true;
                return null;
            }
        }
        if (!this._workerPool.isAvailable) {
            this._useWorker = false;
            return null;
        }
        return this._workerPool;
    }

    getExecutionMode() {
        return this._useWorker && this._getWorkerPool() !== null ? 'worker-assisted' : 'main-thread';
    }

    async _performWorkerRemoval(imageData, matches) {
        if (!this._workerPool || !this._workerPool.isAvailable) {
            throw new Error('Worker pool not available');
        }
        try {
            return await this._workerPool.postTask(imageData, matches);
        } catch {
            this._useWorker = false;
            throw new Error('Worker pool failed');
        }
    }

    /**
     * Load asset image (browser/bundler compatible)
     */
    async _loadAsset(assetKey) {
        // Normalize numeric keys (e.g. 48, 96) to strings
        assetKey = String(assetKey);
        if (this._assetCache[assetKey]) return this._assetCache[assetKey];

        // v2.5: Use build-time inlined base64 data URLs. This completely avoids
        // CORS issues and canvas tainting that occur when loading external PNG
        // files via file:// protocol (where crossOrigin='anonymous' is blocked).
        // Resolve logical and catalog-alias keys through the shared registry.
        const assetName = getInlineAssetName(assetKey);
        if (!assetName) {
            throw new Error(`Unknown alpha asset: ${assetKey}`);
        }
        const inlineSrc = (await getInlineAssets())[assetName];
        
        let src;
        if (inlineSrc) {
            src = inlineSrc;
        } else {
            // Fallback: load from external URL (e.g. assets added at runtime)
            const assetBase = typeof window !== 'undefined' && window.GWR_ASSET_BASE ? window.GWR_ASSET_BASE : './';
            src = `${assetBase}assets/${assetName}.png`;
        }

        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error(`Failed to load asset: ${assetName}`));
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
        
        const finalW = targetW || img.width;
        const finalH = targetH || img.height;
        
        // Always create a fresh canvas to avoid cross-origin tainting from
        // any previous drawImage calls on the reusable canvas.
        const canvas = document.createElement('canvas');
        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, finalW, finalH);

        const imageData = ctx.getImageData(0, 0, finalW, finalH);
        const alphaMap = calculateAlphaMap(imageData);
        
        const definition = getAssetDefinition(assetKey);
        this.alphaMaps[cacheKey] = {
            data: alphaMap,
            width: finalW,
            height: finalH,
            assetKey: String(assetKey),
            alphaBias: Number.isFinite(img.__gwrAlphaBias)
                ? img.__gwrAlphaBias
                : (definition?.alphaBias || 0)
        };
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
        let removalReport = null;

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
            const pool = this._getWorkerPool();

            if (pool && this._useWorker) {
                try {
                    const modifiedData = await this._performWorkerRemoval(imageData, overallBest.matches);
                    imageData.data.set(modifiedData);
                    removalReport = modifiedData.removalReport;
                    workerUsed = true;
                } catch (err) {
                    console.warn('Worker removal failed, falling back to main thread:', err.message || err);
                }
            }

            if (!workerUsed) {
                removalReport = applyRemovalStrategy(imageData, overallBest.matches);
            }

            removedCount = removalReport?.appliedCount || 0;
            bestConfidence = overallBest.confidence;
            lastResult = {
                config: overallBest.winner.config,
                pos: overallBest.winner.pos,
                profileId: overallBest.profileId,
                source: overallBest.winner.source
            };
        }

        if (removedCount > 0) {
            ctx.putImageData(imageData, 0, 0);
        }

        return { 
            canvas, 
            detectionMode: removedCount > 0
                ? 'multi-probe'
                : (overallBest.matches.length > 0 ? 'detected-not-applied' : 'none'),
            confidence: bestConfidence,
            removedCount,
            detectedCount: overallBest.matches.length,
            removal: removalReport,
            trace: overallBest.trace || null,
            config: lastResult ? lastResult.config : null,
            pos: lastResult ? lastResult.pos : null,
            profileId: lastResult ? lastResult.profileId : requestedProfileId,
            _detectionSource: lastResult?.source || null
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
        this._reusableCanvas = null;
        this._reusableCtx = null;
        this.alphaMaps = {};
        this._assetCache = {};
        resetDetectorBuffers();
    }
}
