import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { createMockImageData, MockCanvas } from './test_utils.js';

const savedGlobals = {};

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
        const origWorker = global.Worker;
        global.Worker = function() { throw new Error('Worker not available'); };

        const engine = new WatermarkEngine();
        // _getWorker should handle exception gracefully
        const worker = engine._getWorker();
        assert.strictEqual(worker, null, 'Should return null when Worker fails to construct');
        assert.strictEqual(engine._useWorker, false, 'Should disable worker on failure');
        
        engine.destroy();
        global.Worker = origWorker;
    });
});
