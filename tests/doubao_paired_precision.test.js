import { describe, test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { getAssetDefinition } from '../src/core/assetRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleDir = path.join(root, 'sample', 'other');

const FIXTURES = [
    {
        watermarked: '6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b.png',
        original: '6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_raw_b.png',
        asset: 'bg_doubao_tl.png',
        pos: { x: 38, y: 25, width: 307, height: 167 }
    },
    {
        watermarked: '6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b-2.png',
        original: '6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_raw_b.png',
        asset: 'bg_doubao_br.png',
        pos: { x: 2305, y: 1352, width: 401, height: 173 }
    },
    {
        watermarked: 'c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_5b.png',
        original: 'c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_raw_b.png',
        asset: 'bg_doubao_tl_tall.png',
        pos: { x: 16, y: 16, width: 221, height: 109 }
    },
    {
        watermarked: 'c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_5b-2.png',
        original: 'c00905e8b7794237be633150c72ce0e4.jpeg~tplv-a9rns2rl98-image_raw_b.png',
        asset: 'bg_doubao_br_tall.png',
        pos: { x: 1250, y: 2600, width: 276, height: 125 }
    }
];

async function readImage(filePath) {
    const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

function regionMae(actual, expected, pos) {
    let error = 0;
    let count = 0;
    for (let y = pos.y; y < pos.y + pos.height; y++) {
        for (let x = pos.x; x < pos.x + pos.width; x++) {
            const index = (y * actual.width + x) << 2;
            for (let channel = 0; channel < 3; channel++) {
                error += Math.abs(actual.data[index + channel] - expected.data[index + channel]);
                count++;
            }
        }
    }
    return error / count;
}

describe('Doubao paired-fixture restoration precision', () => {
    test('profile alpha baseline calibration improves every source/watermarked pair', async () => {
        const { alphaBias } = getAssetDefinition('doubao');
        let baselineTotal = 0;
        let calibratedTotal = 0;

        for (const fixture of FIXTURES) {
            const [watermarked, original, assetImage] = await Promise.all([
                readImage(path.join(sampleDir, fixture.watermarked)),
                readImage(path.join(sampleDir, fixture.original)),
                readImage(path.join(root, 'src', 'assets', fixture.asset))
            ]);
            const alphaMap = calculateAlphaMap(assetImage);
            const baseline = { ...watermarked, data: new Uint8ClampedArray(watermarked.data) };
            const calibrated = { ...watermarked, data: new Uint8ClampedArray(watermarked.data) };

            removeWatermark(baseline, alphaMap, fixture.pos);
            removeWatermark(calibrated, alphaMap, fixture.pos, { alphaBias });

            const baselineMae = regionMae(baseline, original, fixture.pos);
            const calibratedMae = regionMae(calibrated, original, fixture.pos);
            assert.ok(calibratedMae < baselineMae * 0.99,
                `${fixture.asset}: expected calibrated MAE ${calibratedMae} below baseline ${baselineMae}`);
            baselineTotal += baselineMae;
            calibratedTotal += calibratedMae;
        }

        assert.ok(calibratedTotal < baselineTotal * 0.95,
            `expected aggregate MAE improvement >5%, got ${baselineTotal} -> ${calibratedTotal}`);
    });
});
