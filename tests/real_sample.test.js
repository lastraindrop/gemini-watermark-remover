import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { PROFILES, getProfile } from '../src/core/profiles.js';
import { CATALOGS, getAllCatalogConfigs } from '../src/core/catalog.js';
import { calculateWatermarkPosition } from '../src/core/config.js';
import { calculateProbeConfidence, detectWatermark } from '../src/core/detector.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { createMockAlphaMap, applyWatermark } from './test_utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleRoot = path.join(__dirname, '../sample');

describe('Real Sample Regression Tests', () => {

    test('Doubao sample images match known catalog resolutions', async () => {
        const sampleDir = path.join(sampleRoot, 'other');
        if (!fs.existsSync(sampleDir)) {
            console.warn('Skipping: sample/other directory not found');
            return;
        }

        const files = fs.readdirSync(sampleDir).filter(f => f.includes('pre_watermark_') && f.endsWith('.png'));
        for (const fileName of files) {
            const filePath = path.join(sampleDir, fileName);
            const meta = await sharp(filePath).metadata();
            const matches = getAllCatalogConfigs(meta.width, meta.height, 'doubao');
            assert.ok(matches.length > 0,
                `Sample ${fileName} (${meta.width}x${meta.height}) should match doubao catalog`);
        }
    });

    test('Doubao BR mask prototype produces valid alphaMap', async () => {
        const maskPath = path.join(sampleRoot, 'other', 'ext_br.png');
        if (!fs.existsSync(maskPath)) {
            console.warn('Skipping: ext_br.png not found');
            return;
        }

        const { data, info } = await sharp(maskPath)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const imageData = {
            width: info.width,
            height: info.height,
            data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
        };
        const alphaMap = calculateAlphaMap(imageData);

        assert.strictEqual(alphaMap.length, info.width * info.height);
        assert.ok(alphaMap.some(v => v > 0.01), 'Alpha map should have non-zero values');

        const maxAlpha = Math.max(...alphaMap);
        assert.ok(maxAlpha > 0.5, `Max alpha ${maxAlpha} should be > 0.5 for visible watermark`);
    });

    test('Synthetic doubao watermark round-trip (inject→detect→remove→verify)', () => {
        const w = 2730, h = 1535;
        const configs = getAllCatalogConfigs(w, h, 'doubao');
        const brConfig = configs.find(c => c.anchor === 'bottom-right');
        assert.ok(brConfig, 'Should have BR config for 2730x1535');

        const pos = calculateWatermarkPosition(w, h, brConfig);
        const alphaMap = createMockAlphaMap(pos.width, pos.height);
        const originalColor = 80;
        const img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };

        for (let i = 0; i < img.data.length; i += 4) {
            img.data[i] = img.data[i + 1] = img.data[i + 2] = originalColor;
            img.data[i + 3] = 255;
        }

        const midX = pos.x + Math.floor(pos.width / 2);
        const midY = pos.y + Math.floor(pos.height / 2);
        const midIdx = (midY * w + midX) << 2;

        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);
        assert.notStrictEqual(img.data[midIdx], originalColor, 'Watermark should change pixels');

        removeWatermark(img, alphaMap, pos);
        const recovered = img.data[midIdx];
        assert.ok(Math.abs(recovered - originalColor) <= 5,
            `Round-trip failed: got ${recovered}, expected ~${originalColor}`);
    });
});
