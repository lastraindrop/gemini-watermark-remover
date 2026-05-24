import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    clearManualRegion,
    readManualRegion,
    updateManualSelectionOverlay,
    writeManualRegion
} from '../src/app/manualSelection.js';

function createInput(value = '') {
    return { value };
}

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(...tokens) {
            tokens.forEach(token => values.add(token));
        },
        remove(...tokens) {
            tokens.forEach(token => values.delete(token));
        },
        contains(token) {
            return values.has(token);
        },
        toggle(token, force) {
            if (force === undefined ? !values.has(token) : force) {
                values.add(token);
            } else {
                values.delete(token);
            }
        }
    };
}

function createElements({ x = '', y = '', width = '', height = '' } = {}) {
    const image = { naturalWidth: 100, naturalHeight: 100 };
    const elements = {
        manualX: createInput(x),
        manualY: createInput(y),
        manualW: createInput(width),
        manualH: createInput(height),
        comparisonSlider: {
            getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 })
        },
        manualSelectionLayer: {
            classList: createClassList()
        },
        manualSelectionBox: {
            classList: createClassList(['hidden']),
            style: {}
        }
    };

    globalThis.document = {
        getElementById: id => (id === 'sliderOriginal' ? image : null)
    };
    return elements;
}

describe('Manual selection UI helpers', () => {
    test('writes rounded non-negative manual coordinates', () => {
        const elements = createElements();
        writeManualRegion(elements, { x: -3.4, y: 8.6, width: 0.2, height: 42.5 });

        assert.deepEqual(readManualRegion(elements), {
            x: 0,
            y: 9,
            width: 1,
            height: 43
        });
    });

    test('clears stale coordinates and hides the selection box', () => {
        const elements = createElements({ x: '10', y: '10', width: '30', height: '30' });
        updateManualSelectionOverlay(elements);
        assert.equal(elements.manualSelectionBox.classList.contains('hidden'), false);

        clearManualRegion(elements);

        assert.deepEqual(
            [elements.manualX.value, elements.manualY.value, elements.manualW.value, elements.manualH.value],
            ['', '', '', '']
        );
        assert.equal(elements.manualSelectionBox.classList.contains('hidden'), true);
    });

    test('renders selection overlay within the displayed object-contain image rect', () => {
        const elements = createElements({ x: '90', y: '90', width: '30', height: '20' });
        updateManualSelectionOverlay(elements);

        assert.equal(elements.manualSelectionBox.style.left, '140px');
        assert.equal(elements.manualSelectionBox.style.top, '90px');
        assert.equal(elements.manualSelectionBox.style.width, '10px');
        assert.equal(elements.manualSelectionBox.style.height, '10px');
        assert.equal(elements.manualSelectionBox.classList.contains('hidden'), false);
    });
});
