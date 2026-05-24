import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeWatermark } from '../src/core/blendModes.js';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { getAllPotentialConfigs, calculateWatermarkPosition } from '../src/core/config.js';
import { getAllCatalogConfigs, getScaledCatalogConfigs } from '../src/core/catalog.js';
import { PROFILES } from '../src/core/profiles.js';

function makeImageData(w, h, fillFn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const [r, g, b, a] = fillFn(x, y);
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a;
        }
    }
    return { width: w, height: h, data };
}

function makeRectAlphaMap(w, h, pattern) {
    const data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            data[y * w + x] = pattern(x, y);
        }
    }
    return data;
}

describe('Rectangular Watermark Tests', () => {
    it('removeWatermark handles non-square alphaMap correctly', () => {
        const w = 200, h = 150;
        const wmW = 80, wmH = 30;
        const img = makeImageData(w, h, () => [200, 200, 200, 255]);
        const alphaMap = makeRectAlphaMap(wmW, wmH, (x, y) => 0.3);
        const pos = { x: 100, y: 100, width: wmW, height: wmH };

        removeWatermark(img, alphaMap, pos);

        const idx = (100 * w + 110) * 4;
        assert.ok(img.data[idx] < 200, 'Pixel should be modified by removal');
        assert.ok(img.data[idx] > 0, 'Pixel should not underflow');
    });

    it('removeWatermark with rectangular region at image corner', () => {
        const w = 100, h = 80;
        const wmW = 60, wmH = 20;
        const img = makeImageData(w, h, () => [180, 180, 180, 255]);
        const alphaMap = makeRectAlphaMap(wmW, wmH, () => 0.5);
        const pos = { x: w - wmW, y: h - wmH, width: wmW, height: wmH };

        removeWatermark(img, alphaMap, pos);

        const idx = ((h - 1) * w + (w - 1)) * 4;
        assert.ok(img.data[idx] < 180, 'Corner pixel should be modified');
    });

    it('multiPassRemoval handles non-square watermark regions', () => {
        const w = 200, h = 150;
        const wmW = 60, wmH = 25;
        const img = makeImageData(w, h, () => [200, 200, 200, 255]);
        const alphaMap = makeRectAlphaMap(wmW, wmH, () => 0.4);
        const pos = { x: 120, y: 100, width: wmW, height: wmH };

        const result = removeRepeatedWatermarkLayers({
            imageData: img,
            alphaMap,
            position: pos,
            maxPasses: 3,
            residualThreshold: 0.25
        });

        assert.ok(result.passCount >= 1, 'Should complete at least one pass');
        assert.ok(result.passes.length >= 1, 'Should record pass metadata');
        assert.equal(result.passes[0].beforeSpatialScore !== undefined, true);
    });

    it('getAllPotentialConfigs returns rectangular configs for doubao', () => {
        const configs = getAllPotentialConfigs(2048, 2048, 'doubao');
        assert.ok(configs.length > 0, 'Should return configs for 2048x2048 doubao');
        const brConfig = configs.find(c => c.anchor === 'bottom-right');
        assert.ok(brConfig, 'Should have bottom-right config');
        assert.ok(brConfig.logoWidth, 'BR config should have logoWidth');
        assert.ok(brConfig.logoHeight, 'BR config should have logoHeight');
        assert.ok(brConfig.logoWidth !== brConfig.logoHeight, 'BR logo should be rectangular');
    });

    it('calculateWatermarkPosition for TL anchor with rectangular logo', () => {
        const config = { logoWidth: 307, logoHeight: 167, marginLeft: 38, marginTop: 25, anchor: 'top-left' };
        const pos = calculateWatermarkPosition(2730, 1535, config);
        assert.equal(pos.x, 38, 'TL x should equal marginLeft');
        assert.equal(pos.y, 25, 'TL y should equal marginTop');
        assert.equal(pos.width, 307, 'Width should be logoWidth');
        assert.equal(pos.height, 167, 'Height should be logoHeight');
        assert.equal(pos.anchor, 'top-left');
    });

    it('calculateWatermarkPosition for BR anchor with rectangular logo', () => {
        const config = { logoWidth: 401, logoHeight: 173, marginRight: 24, marginBottom: 10, anchor: 'bottom-right' };
        const pos = calculateWatermarkPosition(2730, 1535, config);
        assert.equal(pos.x, 2730 - 24 - 401, 'BR x should be width - marginRight - logoWidth');
        assert.equal(pos.y, 1535 - 10 - 173, 'BR y should be height - marginBottom - logoHeight');
        assert.equal(pos.width, 401);
        assert.equal(pos.height, 173);
    });

    it('Catalog rectangular entries have correct logoWidth/logoHeight', () => {
        const entries = getAllCatalogConfigs(2048, 2048, 'doubao');
        assert.ok(entries.length > 0, 'Should have catalog entries for 2048x2048');
        for (const entry of entries) {
            if (entry.logoWidth && entry.logoHeight) {
                assert.ok(entry.logoWidth > 0, 'logoWidth should be positive');
                assert.ok(entry.logoHeight > 0, 'logoHeight should be positive');
                assert.ok(entry.anchor, 'Rectangular entry should have anchor');
            }
        }
    });
});
