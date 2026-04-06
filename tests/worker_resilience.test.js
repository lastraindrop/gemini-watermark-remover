import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WatermarkEngine } from '../src/core/watermarkEngine.js';
import { createMockImageData } from './test_utils.js';

const savedGlobals = {};

before(() => {
    // Mock DOM environment for Node.js testing
    if (typeof global.document === 'undefined') {
        savedGlobals.window = global.window;
        savedGlobals.Worker = global.Worker;
        savedGlobals.ImageData = global.ImageData;
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
        global.document = {
            createElement: (tag) => {
                if (tag === 'canvas') {
                    return {
                        width: 0,
                        height: 0,
                        getContext: () => ({
                            drawImage: () => {},
                            getImageData: (x, y, w, h) => createMockImageData(w, h),
                            putImageData: () => {}
                        }),
                        toBlob: (cb) => cb(new Blob())
                    };
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
    if (savedGlobals.document) global.document = savedGlobals.document;
});

describe('Worker Resilience (Timeout Fallback)', () => {
    test('Engine should fallback to main thread when worker times out', async () => {
        const mockBg = {
            bg48: { width: 48, height: 48 },
            bg96: { width: 96, height: 96 }
        };
        const engine = new WatermarkEngine(mockBg);
        engine._useWorker = true; // Force worker mode

        const img = { width: 100, height: 100 };
        
        // Silence expected warn logging
        const origWarn = console.warn;
        console.warn = () => {};

        // This should timeout (500ms in test environment) and then use fallback
        const start = Date.now();
        const result = await engine.removeWatermarkFromImage(img);
        const duration = Date.now() - start;

        // Restore warn
        console.warn = origWarn;

        assert.ok(duration >= 500, `Should have waited for timeout (duration: ${duration}ms)`);
        assert.ok(result.canvas, 'Should return result via fallback');
        assert.strictEqual(result.detectionMode, 'heuristic', 'Fallback should work');
        engine.destroy();
    });
});
