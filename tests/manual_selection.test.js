import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    clearManualRegion,
    readManualRegion,
    updateManualSelectionOverlay,
    writeManualRegion,
    showManualSelectCanvas,
    hideManualSelectCanvas,
    readManualTemplateSize,
    readManualForceProcess
} from '../src/app/manualSelection.js';

function createInput(value = '') {
    return { value };
}

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(...tokens) { tokens.forEach(token => values.add(token)); },
        remove(...tokens) { tokens.forEach(token => values.delete(token)); },
        contains(token) { return values.has(token); },
        toggle(token, force) {
            if (force === undefined ? !values.has(token) : force) values.add(token);
            else values.delete(token);
        }
    };
}

describe('Manual selection — v2.6 canvas-based', () => {
    let _storedSelectImage = null;

    function setupDOM() {
        const selectCanvas = { classList: createClassList(['hidden']) };
        const selectImage = { src: '', naturalWidth: 100, naturalHeight: 100, getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) };
        const selectBox = { classList: createClassList(['hidden']), style: {} };
        _storedSelectImage = selectImage;

        globalThis.document = {
            getElementById: id => {
                if (id === 'manualSelectCanvas') return selectCanvas;
                if (id === 'manualSelectImage') return selectImage;
                if (id === 'manualSelectBox') return selectBox;
                if (id === 'manualModeToggle') return { checked: false };
                if (id === 'manualForceToggle') return { checked: false };
                if (id === 'comparisonSlider') return { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) };
                return null;
            },
            querySelector: sel => {
                if (sel === 'input[name="manualTemplateSize"]:checked') return { value: '48' };
                return null;
            }
        };
    }

    function createElements({ x = '', y = '', width = '', height = '' } = {}) {
        return {
            manualX: createInput(x),
            manualY: createInput(y),
            manualW: createInput(width),
            manualH: createInput(height)
        };
    }

    // --- Basic coordinate I/O (unchanged) ---

    test('writes rounded non-negative manual coordinates', () => {
        setupDOM();
        const elements = createElements();
        writeManualRegion(elements, { x: -3.4, y: 8.6, width: 0.2, height: 42.5 });
        assert.deepEqual(readManualRegion(elements), { x: 0, y: 9, width: 1, height: 43 });
    });

    test('clears stale coordinates', () => {
        setupDOM();
        const elements = createElements({ x: '10', y: '10', width: '30', height: '30' });
        clearManualRegion(elements);
        assert.deepEqual(
            [elements.manualX.value, elements.manualY.value, elements.manualW.value, elements.manualH.value],
            ['', '', '', '']
        );
    });

    // --- Canvas show/hide ---

    test('showManualSelectCanvas makes canvas visible and sets image', () => {
        setupDOM();
        const canvas = document.getElementById('manualSelectCanvas');
        const img = document.getElementById('manualSelectImage');
        showManualSelectCanvas(null, 'blob:test');
        assert.equal(canvas.classList.contains('hidden'), false);
        assert.equal(img.src, 'blob:test');
        assert.equal(document.getElementById('manualSelectBox').classList.contains('hidden'), true);
    });

    test('hideManualSelectCanvas hides the canvas', () => {
        setupDOM();
        const canvas = document.getElementById('manualSelectCanvas');
        showManualSelectCanvas(null, 'blob:x');
        hideManualSelectCanvas();
        assert.equal(canvas.classList.contains('hidden'), true);
    });

    // --- Template size & force process ---

    test('readManualTemplateSize returns 48 by default', () => {
        setupDOM();
        assert.strictEqual(readManualTemplateSize(), 48);
    });

    test('readManualForceProcess returns false by default', () => {
        setupDOM();
        assert.strictEqual(readManualForceProcess(), false);
    });
});
