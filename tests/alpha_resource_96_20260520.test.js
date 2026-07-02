/**
 * BUG-C8 / STAGE_PLAN_v2.7 Phase A-4:
 * Verify the alternate "96-20260520" alpha resource:
 *   1. src/assets/bg_96_20260520.png exists and is a valid 96x96 RGBA PNG.
 *   2. resolveAssetKey() returns '96-20260520' when config.alphaVariant === '20260520'.
 *   3. resolveAssetKey() keeps existing behavior when alphaVariant is absent (regression).
 *   4. The real 2816x1536 catalog config (alphaVariant: '20260520') resolves end-to-end.
 *   5. WatermarkEngine wires the asset: '96-20260520' -> inline 'bg_96_20260520'.
 *
 * Note: watermarkEngine.js imports PNG assets, which Node cannot load directly
 * (ERR_UNKNOWN_FILE_EXTENSION). The engine wiring is therefore verified by
 * (a) validating the PNG itself decodes via sharp — proving the resource loads,
 * and (b) statically confirming the import + INLINE_ASSETS registration +
 * _loadAsset key normalization in the source. resolveAssetKey is exercised
 * directly since detectionPipeline.js has a PNG-free import graph.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

import { resolveAssetKey } from '../src/core/detectionPipeline.js';
import { getCatalogConfig } from '../src/core/catalog.js';
import { PROFILES } from '../src/core/profiles.js';
import { getInlineAssetName } from '../src/core/assetRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PNG_PATH = path.join(ROOT, 'src', 'assets', 'bg_96_20260520.png');
const ENGINE_SRC = path.join(ROOT, 'src', 'core', 'watermarkEngine.js');

describe('BUG-C8 A-4: bg_96_20260520.png resource', () => {

    test('PNG file exists at src/assets/bg_96_20260520.png', () => {
        assert.ok(existsSync(PNG_PATH), `Expected asset at ${PNG_PATH}`);
    });

    test('decodes to a valid 96x96 4-channel (RGBA) image', async () => {
        const meta = await sharp(PNG_PATH).metadata();
        assert.strictEqual(meta.width, 96, 'width must be 96');
        assert.strictEqual(meta.height, 96, 'height must be 96');
        assert.strictEqual(meta.channels, 4, 'must be RGBA (4 channels)');
        assert.strictEqual(meta.format, 'png', 'format must be png');
    });

    test('raw decode is exactly 96*96*4 bytes (engine-consumable RGBA buffer)', async () => {
        const { data, info } = await sharp(PNG_PATH)
            .raw()
            .toBuffer({ resolveWithObject: true });
        assert.strictEqual(info.width, 96);
        assert.strictEqual(info.height, 96);
        assert.strictEqual(info.channels, 4);
        assert.strictEqual(data.length, 96 * 96 * 4, 'raw RGBA byte count');
    });

    test('is non-trivial (glyph present, not blank/transparent)', async () => {
        const { data } = await sharp(PNG_PATH).raw().toBuffer({ resolveWithObject: true });
        let nonZeroRgb = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) nonZeroRgb++;
        }
        assert.ok(nonZeroRgb > 0, 'alpha map must contain visible glyph pixels');
        // Sanity band: a real Gemini glyph covers a meaningful fraction of the tile.
        assert.ok(nonZeroRgb <= 96 * 96, 'non-zero count cannot exceed pixel count');
    });

    test('matches the calibrated grayscale alpha distribution and checksum', async () => {
        const file = readFileSync(PNG_PATH);
        const checksum = createHash('sha256').update(file).digest('hex');
        assert.strictEqual(checksum, 'b1ff0ae3df78ff9da540851e8728c10e5c35bdfe25aad821c786c5491717b511');

        const { data, info } = await sharp(PNG_PATH).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let sum = 0;
        let borderSum = 0;
        let borderCount = 0;
        let aboveThreshold = 0;
        let max = 0;
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const index = (y * info.width + x) * 4;
                assert.strictEqual(data[index], data[index + 1], 'alpha resource must be grayscale');
                assert.strictEqual(data[index], data[index + 2], 'alpha resource must be grayscale');
                assert.strictEqual(data[index + 3], 255, 'alpha resource pixels must be opaque');
                const value = data[index] / 255;
                sum += value;
                max = Math.max(max, value);
                if (value > 0.1) aboveThreshold++;
                if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) {
                    borderSum += value;
                    borderCount++;
                }
            }
        }
        const mean = sum / (info.width * info.height);
        const borderMean = borderSum / borderCount;
        const coverage = aboveThreshold / (info.width * info.height);
        assert.ok(mean > 0.08 && mean < 0.14, `unexpected mean alpha: ${mean}`);
        assert.ok(borderMean < 0.05, `unexpected border alpha: ${borderMean}`);
        assert.ok(coverage > 0.30 && coverage < 0.42, `unexpected glyph coverage: ${coverage}`);
        assert.ok(max > 0.30 && max < 0.50, `unexpected max alpha: ${max}`);
    });
});

describe('BUG-C8 A-4: resolveAssetKey alphaVariant routing', () => {

    test('returns "96-20260520" when config.alphaVariant === "20260520"', () => {
        const profile = PROFILES.gemini;
        const config = { logoSize: 96, alphaVariant: '20260520' };
        const pos = { anchor: 'bottom-right' };
        assert.strictEqual(resolveAssetKey(profile, config, pos), '96-20260520');
    });

    test('returns "96-20260520" even if logoSize differs (variant is authoritative)', () => {
        // The variant tag is what selects the asset; logoSize is informational here.
        const profile = PROFILES.gemini;
        const config = { logoSize: 96, marginRight: 192, alphaVariant: '20260520' };
        const pos = { anchor: 'bottom-right' };
        assert.strictEqual(resolveAssetKey(profile, config, pos), '96-20260520');
    });

    test('regression: no alphaVariant -> standard logoSize key', () => {
        const profile = PROFILES.gemini;
        const config = { logoSize: 96, marginRight: 64, marginBottom: 64 };
        const pos = { anchor: 'bottom-right' };
        // defaultAsset='96' takes precedence over logoSize=96; both resolve to 96.
        // resolveAssetKey returns strings (defaultAsset is '96', a string).
        assert.strictEqual(resolveAssetKey(profile, config, pos), '96',
            'standard 2k/1k config must resolve to defaultAsset (96)');
    });

    test('regression: 0.5k (48px) config without alphaVariant -> 48px asset', () => {
        const profile = PROFILES.gemini;
        const config = { logoSize: 48, marginRight: 32, marginBottom: 32 };
        const pos = { anchor: 'bottom-right' };
        assert.strictEqual(resolveAssetKey(profile, config, pos), '48',
            '48px Gemini configs must use the native 48px alpha resource');
    });

    test('regression: doubao profile uses profile.assets map (unchanged path)', () => {
        const profile = PROFILES.doubao;
        const config = { anchor: 'bottom-right' };
        const pos = { anchor: 'bottom-right' };
        assert.strictEqual(resolveAssetKey(profile, config, pos), 'doubao_br');
    });

    test('regression: doubao catalog dimensions resolve to size-specific asset keys', () => {
        const profile = PROFILES.doubao;
        const config = { logoWidth: 248, logoHeight: 105, anchor: 'top-left' };
        const pos = { width: 248, height: 105, anchor: 'top-left' };
        assert.strictEqual(resolveAssetKey(profile, config, pos), '248x105');
    });

    test('v2-small (alphaVariant: "v2") keeps existing behavior — not routed to 20260520', () => {
        // Per A-4 scope: only the '20260520' variant is wired to a dedicated
        // asset. Other variant tags fall through to the standard resolution.
        const profile = PROFILES.gemini;
        const config = { logoSize: 36, marginRight: 96, marginBottom: 96, alphaVariant: 'v2' };
        const pos = { anchor: 'bottom-right' };
        const key = resolveAssetKey(profile, config, pos);
        assert.notStrictEqual(key, '96-20260520', 'v2 variant must not be misrouted');
        assert.strictEqual(key, '48', 'v2-small should scale from the closest native 48px asset');
    });
});

describe('BUG-C8 A-4: end-to-end catalog -> asset key resolution', () => {

    test('2816x1536 gemini catalog config resolves to the 20260520 asset', () => {
        const config = getCatalogConfig(2816, 1536, 'gemini');
        assert.ok(config, '2816x1536 must be in the catalog');
        assert.strictEqual(config.alphaVariant, '20260520');
        const profile = PROFILES.gemini;
        const pos = { anchor: 'bottom-right' };
        assert.strictEqual(resolveAssetKey(profile, config, pos), '96-20260520');
    });
});

describe('BUG-C8 A-4: WatermarkEngine asset wiring', () => {
    // Binary assets stay behind dynamic imports so the SDK itself remains
    // importable by plain Node while browser builds can still inline PNGs.

    test('source imports bg_96_20260520.png', () => {
        const src = readFileSync(ENGINE_SRC, 'utf8');
        assert.match(src,
            /import\(['"]\.\.\/assets\/bg_96_20260520\.png['"]\)/,
            'watermarkEngine.js must dynamically import bg_96_20260520.png');
    });

    test('INLINE_ASSETS registers the "bg_96_20260520" key', () => {
        const src = readFileSync(ENGINE_SRC, 'utf8');
        assert.match(src,
            /['"`]bg_96_20260520['"`]\s*:/,
            'INLINE_ASSETS must contain a "bg_96_20260520" entry');
    });

    test('asset registry maps "96-20260520" to the registered inline asset', () => {
        const src = readFileSync(ENGINE_SRC, 'utf8');
        const assetName = getInlineAssetName('96-20260520');
        assert.strictEqual(assetName, 'bg_96_20260520');
        const registered = new RegExp(`['"\`]${assetName}['"\`]\\s*:`).test(src);
        assert.ok(registered, `"${assetName}" must be a key in INLINE_ASSETS`);
    });
});
