import { describe, test } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { detectWatermarks } from '../src/core/detectionPipeline.js';
import { detectWatermarkConfig, calculateWatermarkPosition, getAllPotentialConfigs, DETECTION_THRESHOLDS } from '../src/core/config.js';
import { runRemoveCommand } from '../src/cli/gwrRemoveCommand.js';
import { applyWatermark } from './test_utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const outputDir = join(projectRoot, '.test-output', 'gemini-regression');

async function loadAssetAlphaMap(size, targetW = size, targetH = targetW) {
    const path = join(projectRoot, 'src', 'assets', `bg_${size}.png`);
    const { data, info } = await sharp(path)
        .resize(targetW, targetH, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return {
        data: calculateAlphaMap({
            width: info.width,
            height: info.height,
            data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
        }),
        width: info.width,
        height: info.height,
        assetKey: String(size)
    };
}

function createGradientImageData(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) << 2;
            const base = Math.round(64 + (x / width) * 96 + (y / height) * 32);
            data[idx] = base;
            data[idx + 1] = Math.min(255, base + 11);
            data[idx + 2] = Math.min(255, base + 23);
            data[idx + 3] = 255;
        }
    }
    return { width, height, data };
}

function pseudoRandom01(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function createBusyLandscapeImageData(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) << 2;
            const texture = 145 +
                55 * Math.sin(x * 0.035) +
                35 * Math.sin(y * 0.057) +
                28 * Math.sin((x + y) * 0.11) +
                (pseudoRandom01(x * 12.9 + y * 78.2) - 0.5) * 70;
            data[idx] = Math.max(0, Math.min(255, texture + 25 * Math.sin(y * 0.09)));
            data[idx + 1] = Math.max(0, Math.min(255, texture + 45));
            data[idx + 2] = Math.max(0, Math.min(255, texture - 25));
            data[idx + 3] = 255;
        }
    }
    return { width, height, data };
}

async function writeWatermarkedFixture(width, height, outputPath) {
    const alphaMap = await loadAssetAlphaMap(96);
    const imageData = createGradientImageData(width, height);
    const config = detectWatermarkConfig(width, height, 'gemini');
    const pos = calculateWatermarkPosition(width, height, config);

    applyWatermark(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap.data);
    await sharp(imageData.data, {
        raw: { width, height, channels: 4 }
    }).png().toFile(outputPath);

    return { imageData, config, pos };
}

describe('Gemini detection regressions', () => {
    test('official Gemini 1k aspect ratios resolve to catalog configs', () => {
        const officialOneK = [
            [1536, 672],
            [1584, 672],
            [1344, 768],
            [832, 1248],
            [512, 2064],
            [352, 2928]
        ];

        for (const [width, height] of officialOneK) {
            const config = detectWatermarkConfig(width, height, 'gemini');
            assert.strictEqual(config.isOfficial, true, `${width}x${height} should be catalog-backed`);
            assert.ok(config.logoSize > 0, `${width}x${height} should have valid logoSize`);
            assert.ok(config.marginRight >= 0, `${width}x${height} should have valid marginRight`);
            assert.ok(config.marginBottom >= 0, `${width}x${height} should have valid marginBottom`);
        }
    });

    test('shared detection pipeline catches 1536x672 official 96px watermark', async () => {
        const width = 1536;
        const height = 672;
        const alpha96 = await loadAssetAlphaMap(96);
        const imageData = createGradientImageData(width, height);
        const config = detectWatermarkConfig(width, height, 'gemini');
        const pos = calculateWatermarkPosition(width, height, config);
        applyWatermark(imageData, pos.x, pos.y, pos.width, pos.height, alpha96.data);

        const result = await detectWatermarks({
            imageData,
            profileId: 'gemini',
            getAlphaMap: async (assetKey, targetW, targetH) => {
                const map = await loadAssetAlphaMap(assetKey, targetW, targetH);
                assert.strictEqual(targetW, map.width);
                assert.strictEqual(targetH, map.height);
                return map;
            },
            options: { deepScan: true }
        });

        assert.ok(result.winner, 'Expected detector to find the visible official watermark');
        assert.strictEqual(result.profileId, 'gemini');
        assert.ok(result.confidence > 0.9, `Expected high confidence, got ${result.confidence}`);
        assert.ok(Math.abs(result.winner.pos.x - pos.x) <= 1, `X drift: expected ${pos.x}, got ${result.winner.pos.x}`);
        assert.ok(Math.abs(result.winner.pos.y - pos.y) <= 1, `Y drift: expected ${pos.y}, got ${result.winner.pos.y}`);
    });

    test('shared detection pipeline catches a lightly scaled official Gemini export', async () => {
        const width = 1510;
        const height = 660;
        const configs = getAllPotentialConfigs(width, height, 'gemini');
        const config = configs.find(item => item.scaledFrom === '1536x672');
        assert.ok(config, 'Expected a scaled 1536x672 candidate');
        assert.ok(config.logoSize >= 93 && config.logoSize <= 95, `Unexpected scaled logo size: ${config.logoSize}`);

        const alphaMap = await loadAssetAlphaMap(96, config.logoSize, config.logoSize);
        const imageData = createGradientImageData(width, height);
        const pos = calculateWatermarkPosition(width, height, config);
        applyWatermark(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap.data);

        const result = await detectWatermarks({
            imageData,
            profileId: 'gemini',
            getAlphaMap: async (assetKey, targetW, targetH) => loadAssetAlphaMap(assetKey, targetW, targetH),
            options: { deepScan: true }
        });

        assert.ok(result.winner, 'Expected detector to find the scaled watermark');
        assert.ok(result.confidence > 0.85, `Expected high scaled confidence, got ${result.confidence}`);
        assert.ok(Math.abs(result.winner.pos.x - pos.x) <= 1, `X drift: expected ${pos.x}, got ${result.winner.pos.x}`);
        assert.ok(Math.abs(result.winner.pos.y - pos.y) <= 1, `Y drift: expected ${pos.y}, got ${result.winner.pos.y}`);
    });

    test('shared detection pipeline catches weak Gemini watermark on a busy 1365x768 image', async () => {
        const width = 1365;
        const height = 768;
        const configs = getAllPotentialConfigs(width, height, 'gemini');
        const config = configs.find(item => item.scaledFrom === '1376x768') || configs[0];
        assert.ok(config, 'Expected a near-official 16:9 candidate');

        const imageData = createBusyLandscapeImageData(width, height);
        const pos = calculateWatermarkPosition(width, height, config);
        const alphaMap = await loadAssetAlphaMap(96, pos.width, pos.height);
        applyWatermark(imageData, pos.x, pos.y, pos.width, pos.height, alphaMap.data, 190);

        const result = await detectWatermarks({
            imageData,
            profileId: 'gemini',
            getAlphaMap: async (assetKey, targetW, targetH) => loadAssetAlphaMap(assetKey, targetW, targetH),
            options: { deepScan: true }
        });

        assert.ok(result.winner, 'Expected detector to find the weak watermark on a busy background');
        assert.ok(result.confidence > DETECTION_THRESHOLDS.DEFAULT_PROBE_THRESHOLD, `Expected usable confidence, got ${result.confidence}`);
        // v2.5: Both 48px and 96px templates are now probed for Gemini images.
        // The small template may correlate better with synthetic noise,
        // but the pipeline should still find a valid match.
        assert.ok(result.matches.length >= 1 && result.matches.length <= 2,
            `Expected 1-2 matches, got ${result.matches.length}`);
    });

    test('busy 1365x768 image without watermark should not produce catalog-probe match', async () => {
        const imageData = createBusyLandscapeImageData(1365, 768);

        const result = await detectWatermarks({
            imageData,
            profileId: 'gemini',
            getAlphaMap: async (assetKey, targetW, targetH) => loadAssetAlphaMap(assetKey, targetW, targetH),
            options: { deepScan: true }
        });

        // Relaxed catalog tolerance may match nearby resolutions.
        // Busy textures can coincidentally correlate with watermark templates.
        // Ensure no false catalog-probe match is generated.
        const hasCatalogProbe = result.matches.some(m => m.source === 'catalog-probe');
        assert.strictEqual(hasCatalogProbe, false, 'Should not produce catalog-probe match on non-watermark busy image');
    });

    test('CLI removes 1536x672 official 96px watermark instead of reporting none', async () => {
        rmSync(outputDir, { recursive: true, force: true });
        mkdirSync(outputDir, { recursive: true });

        const inputPath = join(outputDir, 'gemini_1536x672.png');
        const outputPath = join(outputDir, 'gemini_1536x672_removed.png');
        await writeWatermarkedFixture(1536, 672, inputPath);

        let stdout = '';
        let stderr = '';
        const code = await runRemoveCommand([
            inputPath,
            '--output',
            outputPath,
            '--json',
            '--profile',
            'gemini',
            '--overwrite'
        ], {
            stdout: { write: chunk => { stdout += chunk; } },
            stderr: { write: chunk => { stderr += chunk; } },
            cwd: projectRoot
        });

        assert.strictEqual(code, 0, stderr);
        assert.ok(existsSync(outputPath), 'CLI should create an output file');
        const payload = JSON.parse(stdout.trim());
        assert.strictEqual(payload.status, 'success');
        assert.notStrictEqual(payload.detection, 'none', 'CLI must not miss the official 96px watermark');
        assert.strictEqual(payload.profileId, 'gemini');
        assert.ok(payload.confidence > 0.9, `Expected high CLI confidence, got ${payload.confidence}`);
        assert.ok(readFileSync(outputPath).length > 0, 'Output image should not be empty');
    });
});
