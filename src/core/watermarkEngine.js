/**
 * Watermark engine main module
 * Coordinate watermark detection, alpha map calculation, and removal operations
 */

import { calculateAlphaMap } from './alphaMap.js';
import { removeWatermark } from './blendModes.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from './config.js';
import { getCatalogConfig } from './catalog.js';
import { detectWatermark } from './detector.js';

export class WatermarkEngine {
    constructor(bgCaptures) {
        this.bgCaptures = bgCaptures;
        this.alphaMaps = {};
        this._worker = null;
        this._workerHandlers = new Map();
        this._nextTaskId = 0;
        this._reusableCanvas = null;
        this._reusableCtx = null;
        this._useWorker = false;
    }

    static async create() {
        const loadImg = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => {
                console.error('Failed to load image:', (src && src.substring ? src.substring(0, 50) : src) + '...', e);
                reject(e);
            };
            img.src = src;
        });

        let bg48, bg96;
        try {
            // v1.5.5: Esbuild can parse these literal imports and inline them as DataURLs.
            // Node.js will fail at runtime if it tries to execute this, so we wrap it in a platform check.
            if (typeof window !== 'undefined' && !window.process) {
                const [m48, m96] = await Promise.all([
                    import('../assets/bg_48.png'),
                    import('../assets/bg_96.png')
                ]);
                [bg48, bg96] = await Promise.all([
                    loadImg(m48.default),
                    loadImg(m96.default)
                ]);
            }
        } catch (err) {
            console.error('Failed to initialize WatermarkEngine assets:', err);
            bg48 = bg96 = null;
        }

        return new WatermarkEngine({ bg48, bg96 });
    }

    /**
     * Lazy-initialize or get the persistent worker
     */
    _getWorker() {
        if (!window.Worker || window.GM_info) return null;
        if (!this._worker) {
            try {
                this._worker = new Worker('worker.js');
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
                    // Cancel all pending tasks
                    this._workerHandlers.forEach(h => h.reject(new Error('Worker crashed')));
                    this._workerHandlers.clear();
                    if (this._worker) {
                        this._worker.terminate();
                        this._worker = null;
                    }
                };
                this._useWorker = true;
            } catch (err) {
                console.warn('Failed to start worker (likely file:// protocol):', err);
                this._useWorker = false;
                return null;
            }
        }
        return this._worker;
    }


    /**
     * Get alpha map from background captured image based on watermark size
     * @param {number} size - Watermark size (48 or 96)
     * @returns {Promise<Float32Array>} Alpha map
     */
    async getAlphaMap(size) {
        if (this.alphaMaps[size]) return this.alphaMaps[size];

        const bgImage = size === 48 ? this.bgCaptures.bg48 : this.bgCaptures.bg96;

        // Reuse canvas for alpha map extraction
        if (!this._reusableCanvas) {
            this._reusableCanvas = document.createElement('canvas');
            this._reusableCtx = this._reusableCanvas.getContext('2d', { willReadFrequently: true });
        }
        
        this._reusableCanvas.width = size;
        this._reusableCanvas.height = size;
        this._reusableCtx.drawImage(bgImage, 0, 0);

        const imageData = this._reusableCtx.getImageData(0, 0, size, size);
        const alphaMap = calculateAlphaMap(imageData);
        
        this.alphaMaps[size] = alphaMap;
        return alphaMap;
    }

    /**
     * Remove watermark from image based on watermark size
     * @param {HTMLImageElement|HTMLCanvasElement} image - Input image
     * @param {Object} options - { deepScan: boolean }
     * @returns {Promise<Object>} { canvas, detectionMode, status }
     */
    async removeWatermarkFromImage(image, options = { deepScan: true }) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Try pixel-based detection first
        const alphaMap48 = await this.getAlphaMap(48);
        const alphaMap96 = await this.getAlphaMap(96);
        const pixelDetect = detectWatermark(imageData, { 48: alphaMap48, 96: alphaMap96 }, options);

        let position, alphaMap;
        if (pixelDetect) {
            position = { x: pixelDetect.x, y: pixelDetect.y, width: pixelDetect.size, height: pixelDetect.size };
            alphaMap = pixelDetect.size === 48 ? alphaMap48 : alphaMap96;
        } else {
            // Fallback to dimension-based detection
            const config = detectWatermarkConfig(canvas.width, canvas.height);
            position = calculateWatermarkPosition(canvas.width, canvas.height, config);
            alphaMap = config.logoSize === 48 ? alphaMap48 : alphaMap96;
        }

        const worker = this._getWorker();
        if (worker && this._useWorker) {
            const taskId = this._nextTaskId++;
            // Clone data for fallback in case worker fails (as original buffer will be transferred)
            const fallbackData = new Uint8ClampedArray(imageData.data);
            try {
                const processedImageData = await new Promise((resolve, reject) => {
                    const timeout = (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') ? 500 : 15000;
                    const timeoutId = setTimeout(() => {
                        this._workerHandlers.delete(taskId);
                        reject(new Error(`Worker timeout exceeded (${timeout}ms)`));
                    }, timeout);

                    this._workerHandlers.set(taskId, { 
                        resolve: (data) => { clearTimeout(timeoutId); resolve(data); },
                        reject: (err) => { clearTimeout(timeoutId); reject(err); } 
                    });
                    worker.postMessage({ imageData, alphaMap, position, taskId }, [imageData.data.buffer]);
                });
                ctx.putImageData(processedImageData, 0, 0);
            } catch (err) {
                console.warn('Worker task failed, falling back to main thread:', err);
                const fallbackImageData = new ImageData(fallbackData, canvas.width, canvas.height);
                removeWatermark(fallbackImageData, alphaMap, position);
                ctx.putImageData(fallbackImageData, 0, 0);
            }
        } else {
            removeWatermark(imageData, alphaMap, position);
            ctx.putImageData(imageData, 0, 0);
        }

        const config = pixelDetect ? getCatalogConfig(pixelDetect.size) : detectWatermarkConfig(canvas.width, canvas.height);
        return { 
            canvas, 
            detectionMode: pixelDetect ? pixelDetect.mode : 'heuristic',
            config
        };
    }

    getWatermarkInfo(imageWidth, imageHeight) {
        const config = detectWatermarkConfig(imageWidth, imageHeight);
        const position = calculateWatermarkPosition(imageWidth, imageHeight, config);
        return { size: config.logoSize, position, config };
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
    }
}
