import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { createMockImageData, MockCanvas } from './test_utils.js';

const savedGlobals = {};

function installWorkerMock(WorkerClass) {
    const originalWorker = global.Worker;
    const originalWindow = global.window;
    global.Worker = WorkerClass;
    global.window = { ...(originalWindow || {}), Worker: WorkerClass, GM_info: null };
    return () => {
        global.Worker = originalWorker;
        global.window = originalWindow;
    };
}

before(() => {
    // Mock DOM environment for Node.js testing
    if (typeof global.document === 'undefined') {
        savedGlobals.window = global.window;
        savedGlobals.Worker = global.Worker;
        savedGlobals.ImageData = global.ImageData;
        savedGlobals.Image = global.Image;
        savedGlobals.document = global.document;

        global.window = {
            Worker: class {
                constructor() {
                    this.onmessage = null;
                    this.onerror = null;
                }
                postMessage(msg) {
                    // Hang: Do not reply
                }
                terminate() { }
            }
        };
        global.Worker = global.window.Worker;
        global.ImageData = class {
            constructor(data, width, height) {
                this.data = data;
                this.width = width;
                this.height = height;
            }
        };
        // Mock HTMLImageElement for _loadAsset
        global.Image = class {
            constructor() { this.width = 1; this.height = 1; }
            set src(_) { Promise.resolve().then(() => { if (this.onload) this.onload(); }); }
        };
        global.document = {
            createElement: (tag) => {
                if (tag === 'canvas') {
                    return new MockCanvas(100, 100);
                }
                return {};
            }
        };
    }
});

after(() => {
    if (savedGlobals.window) global.window = savedGlobals.window;
    if (savedGlobals.Worker) global.Worker = savedGlobals.Worker;
    if (savedGlobals.ImageData) global.ImageData = savedGlobals.ImageData;
    if (savedGlobals.Image !== undefined) global.Image = savedGlobals.Image;
    if (savedGlobals.document) global.document = savedGlobals.document;
});

describe('Worker Resilience (Timeout Fallback)', () => {
    test('Engine should process via main thread (removeWatermark is always synchronous)', async () => {
        const engine = new WatermarkEngine();

        // Mock image with valid dimensions
        const img = { width: 100, height: 100 };
        
        const origWarn = console.warn;
        console.warn = () => {};

        // removeWatermarkFromImage always uses main thread for pixel ops (worker is for future use)
        const result = await engine.removeWatermarkFromImage(img);

        console.warn = origWarn;

        assert.ok(result.canvas, 'Should return a canvas result');
        assert.ok(['multi-probe', 'none'].includes(result.detectionMode), 
            `detectionMode should be multi-probe or none, got: ${result.detectionMode}`);
        engine.destroy();
    });

    test('Engine can be created without failing even when Worker constructor throws', async () => {
        const restoreWorker = installWorkerMock(function() { throw new Error('Worker not available'); });
        try {
            const engine = new WatermarkEngine();
            const pool = engine._getWorkerPool();
            assert.strictEqual(pool, null, 'Should return null when Worker fails to construct');
            assert.strictEqual(engine._useWorker, false, 'Should disable worker on failure');
            engine.destroy();
        } finally {
            restoreWorker();
        }
    });

    test('_performWorkerRemoval sends matches to worker and receives modified pixels', async () => {
        let postedData = null;

        const restoreWorker = installWorkerMock(class {
            constructor() {
                this._inUse = false;
                this.onmessage = null;
                this.onerror = null;
            }
            postMessage(msg, transfer) {
                postedData = msg;
                const { imageData, matches, taskId } = msg;
                for (let i = 0; i < imageData.data.length; i++) {
                    imageData.data[i] = (imageData.data[i] + 1) & 0xFF;
                }
                setTimeout(() => {
                    if (this.onmessage) {
                        this.onmessage({ data: { imageData, taskId } });
                    }
                }, 10);
            }
            terminate() {}
        });

        try {
            const engine = new WatermarkEngine();
            engine._getWorkerPool();
            const imgData = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(100) };
            const originalPixel = imgData.data[0];

            const modifiedData = await engine._performWorkerRemoval(imgData, [
                { alphaMap: new Float32Array(100).fill(0.5), pos: { x: 0, y: 0, width: 10, height: 10 } }
            ]);

            assert.ok(postedData, 'Worker postMessage should have been called');
            assert.strictEqual(postedData.matches.length, 1, 'Worker should receive the matches array');
            assert.strictEqual(modifiedData[0], (originalPixel + 1) & 0xFF, 'Worker should have modified the pixel data');
            assert.strictEqual(engine.getExecutionMode(), 'worker-assisted', 'Should report worker-assisted');

            engine.destroy();
        } finally {
            restoreWorker();
        }
    });

    test('_performWorkerRemoval falls back correctly when worker times out', async () => {
        const restoreWorker = installWorkerMock(class {
            constructor() {
                this._inUse = false;
                this.onmessage = null;
                this.onerror = null;
            }
            postMessage(msg, transfer) {
                // Worker never replies
            }
            terminate() {}
        });

        try {
            const engine = new WatermarkEngine();
            engine._getWorkerPool();
            const imgData = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(100) };

            await assert.rejects(
                () => engine._performWorkerRemoval(imgData, [
                    { alphaMap: new Float32Array(16).fill(0.5), pos: { x: 0, y: 0, width: 4, height: 4 } }
                ]),
                /Worker pool failed|timed out/,
                'Worker timeout should reject with informative message'
            );

            engine.destroy();
        } finally {
            restoreWorker();
        }
    });
});
