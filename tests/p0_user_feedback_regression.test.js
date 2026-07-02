import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { calculateCorrelation } from '../src/core/detector.js';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
import { getAssetDefinition, getAssetFileName } from '../src/core/assetRegistry.js';
import { detectWatermarks } from '../src/core/detectionPipeline.js';
import { Engine as CliEngine } from '../src/cli/gwrRemoveCommand.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/user-feedback/manifest.json'), 'utf8'));

async function loadImageData(filePath) {
    const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
    };
}

function makeAssetProvider() {
    const cache = new Map();
    return async (assetKey, width, height) => {
        const cacheKey = `${assetKey}:${width || 'native'}x${height || 'native'}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        const fileName = getAssetFileName(assetKey);
        if (!fileName) throw new Error(`Unknown test asset: ${assetKey}`);
        let pipeline = sharp(path.join(ROOT, 'src/assets', fileName));
        if (width && height) pipeline = pipeline.resize(width, height, { fit: 'fill' });
        const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const alphaMap = calculateAlphaMap({
            width: info.width,
            height: info.height,
            data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
        });
        const result = { data: alphaMap, width: info.width, height: info.height, assetKey: String(assetKey) };
        cache.set(cacheKey, result);
        return result;
    };
}

describe('P0 user-feedback regressions', () => {
    test('manifest fixtures are present and checksum-pinned', () => {
        assert.strictEqual(manifest.schemaVersion, 1);
        assert.ok(manifest.cases.length > 0);
        for (const fixture of manifest.cases) {
            const inputPath = path.join(ROOT, fixture.input);
            assert.ok(existsSync(inputPath), `missing fixture: ${fixture.input}`);
            const checksum = createHash('sha256').update(readFileSync(inputPath)).digest('hex');
            assert.strictEqual(checksum, fixture.sha256, `fixture changed: ${fixture.id}`);
        }
    });

    test('known halo false-positive fixture now applies an improving removal', async () => {
        const fixture = manifest.cases.find(entry => entry.id === 'halo-false-positive-001');
        const imageData = await loadImageData(path.join(ROOT, fixture.input));
        const alphaImage = await loadImageData(path.join(ROOT, 'src/assets/bg_48.png'));
        const alphaMap = calculateAlphaMap(alphaImage);
        const pos = fixture.expected.position;
        const beforeNCC = Math.abs(calculateCorrelation(
            imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true
        ));

        const report = applyRemovalStrategy(imageData, [{
            profileId: fixture.profileId,
            alphaMap,
            pos,
            confidence: 0.976,
            source: 'catalog-probe',
            config: { logoSize: 48, marginRight: 32, marginBottom: 32, isOfficial: true }
        }]);
        const afterNCC = Math.abs(calculateCorrelation(
            imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true
        ));

        assert.ok(report.appliedCount >= fixture.expected.minimumAppliedCount, JSON.stringify(report));
        assert.ok(report.results[0].changedPixels > 0);
        assert.strictEqual(report.results[0].stopReason, 'safety-near-black');
        assert.strictEqual(report.results[0].passCount, 2, 'regressing third pass must be rolled back');
        assert.ok(afterNCC < beforeNCC, `residual did not improve: ${beforeNCC} -> ${afterNCC}`);
    });

    test('known halo fixture rejects the worsening 96px candidate end to end', async () => {
        const fixture = manifest.cases.find(entry => entry.id === 'halo-false-positive-001');
        const imageData = await loadImageData(path.join(ROOT, fixture.input));
        const original = new Uint8ClampedArray(imageData.data);
        const detection = await detectWatermarks({
            imageData,
            profileId: fixture.profileId,
            getAlphaMap: makeAssetProvider(),
            options: { deepScan: true }
        });

        assert.ok(detection.winner, JSON.stringify(detection.trace));
        assert.deepStrictEqual(
            {
                x: detection.winner.pos.x,
                y: detection.winner.pos.y,
                width: detection.winner.pos.width,
                height: detection.winner.pos.height
            },
            fixture.expected.position
        );
        assert.strictEqual(detection.matches.length, 1, JSON.stringify(detection.trace));
        assert.ok(
            detection.trace.validations.some(validation =>
                validation.pos.width === 96 &&
                validation.accepted === false &&
                validation.reason === 'restoration-regression'
            ),
            JSON.stringify(detection.trace)
        );

        const report = applyRemovalStrategy(imageData, detection.matches);
        assert.strictEqual(report.acceptedCount, 1);
        assert.strictEqual(report.appliedCount, 1);

        const pos = fixture.expected.position;
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const inside = x >= pos.x && x < pos.x + pos.width && y >= pos.y && y < pos.y + pos.height;
                if (inside) continue;
                const index = (y * imageData.width + x) << 2;
                for (let channel = 0; channel < 4; channel++) {
                    assert.strictEqual(
                        imageData.data[index + channel],
                        original[index + channel],
                        `pixel outside accepted region changed at (${x}, ${y}) channel ${channel}`
                    );
                }
            }
        }
    });

    test('20260520 missed fixture resolves the alternate asset at the catalog anchor', async () => {
        const fixture = manifest.cases.find(entry => entry.id === 'gemini-20260520-missed-001');
        const imageData = await loadImageData(path.join(ROOT, fixture.input));
        const result = await detectWatermarks({
            imageData,
            profileId: fixture.profileId,
            getAlphaMap: makeAssetProvider(),
            options: { deepScan: true }
        });

        assert.ok(result.winner, JSON.stringify(result.trace));
        assert.ok(result.confidence >= fixture.expected.minimumConfidence, `confidence=${result.confidence}`);
        assert.strictEqual(result.winner.source, 'catalog-probe');
        assert.deepStrictEqual(
            {
                x: result.winner.pos.x,
                y: result.winner.pos.y,
                width: result.winner.pos.width,
                height: result.winner.pos.height
            },
            fixture.expected.position
        );
        assert.ok(result.trace.candidates.some(candidate => candidate.assetKey === fixture.expected.assetKey));
    });

    test('zero-alpha removal is reported as detected but not applied', () => {
        const imageData = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(127) };
        const report = applyRemovalStrategy(imageData, [{
            profileId: 'gemini',
            alphaMap: new Float32Array(16),
            pos: { x: 2, y: 2, width: 4, height: 4 },
            confidence: 0.9,
            config: { logoSize: 4 }
        }]);
        assert.strictEqual(report.acceptedCount, 1);
        assert.strictEqual(report.appliedCount, 0);
        assert.strictEqual(report.results[0].applied, false);
        assert.strictEqual(report.results[0].changedPixels, 0);
    });
});

describe('Asset registry parity', () => {
    test('variant and catalog aliases resolve to explicit files', () => {
        assert.strictEqual(getAssetFileName('96-20260520'), 'bg_96_20260520.png');
        assert.strictEqual(getAssetFileName('401x173'), 'bg_doubao_br.png');
        assert.strictEqual(getAssetFileName('307x167'), 'bg_doubao_tl.png');
        assert.strictEqual(getAssetDefinition('401x173').key, 'doubao_br');
        assert.strictEqual(getAssetDefinition('bg_96_20260520').key, '96-20260520');
        assert.strictEqual(getAssetDefinition('does-not-exist'), null);
    });

    test('CLI provider loads variant and Doubao aliases and rejects unknown keys', async () => {
        const engine = new CliEngine();
        const variant = await engine.getAlphaMap('96-20260520', 96, 96);
        const doubao = await engine.getAlphaMap('401x173', 401, 173);
        assert.strictEqual(variant.data.length, 96 * 96);
        assert.strictEqual(variant.assetKey, '96-20260520');
        assert.strictEqual(doubao.data.length, 401 * 173);
        assert.strictEqual(doubao.assetKey, '401x173');
        await assert.rejects(
            () => engine.getAlphaMap('does-not-exist', 96, 96),
            /Unknown or missing alpha asset/
        );
    });
});
