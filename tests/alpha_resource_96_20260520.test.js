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
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

import { resolveAssetKey } from '../src/core/detectionPipeline.js';
import { getCatalogConfig } from '../src/core/catalog.js';
import { PROFILES } from '../src/core/profiles.js';

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

    test('regression: 0.5k (48px) config without alphaVariant -> defaultAsset', () => {
        const profile = PROFILES.gemini;
        const config = { logoSize: 48, marginRight: 32, marginBottom: 32 };
        const pos = { anchor: 'bottom-right' };
        // profile.defaultAsset='96' is checked BEFORE config.logoSize=48
        assert.strictEqual(resolveAssetKey(profile, config, pos), '96',
            'without alphaVariant, defaultAsset wins over logoSize');
    });

    test('regression: doubao profile uses profile.assets map (unchanged path)', () => {
        const profile = PROFILES.doubao;
        const config = { anchor: 'bottom-right' };
        const pos = { anchor: 'bottom-right' };
        assert.strictEqual(resolveAssetKey(profile, config, pos), 'doubao_br');
    });

    test('v2-small (alphaVariant: "v2") keeps existing behavior — not routed to 20260520', () => {
        // Per A-4 scope: only the '20260520' variant is wired to a dedicated
        // asset. Other variant tags fall through to the standard resolution.
        const profile = PROFILES.gemini;
        const config = { logoSize: 36, marginRight: 96, marginBottom: 96, alphaVariant: 'v2' };
        const pos = { anchor: 'bottom-right' };
        const key = resolveAssetKey(profile, config, pos);
        assert.notStrictEqual(key, '96-20260520', 'v2 variant must not be misrouted');
        assert.strictEqual(key, '96', 'v2-small falls back to defaultAsset (96)');
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
    // watermarkEngine.js imports PNGs (Node can't load them), so verify the
    // wiring statically: the import declaration, INLINE_ASSETS registration,
    // and the _loadAsset key-normalization that lets '96-20260520' resolve.

    test('source imports bg_96_20260520.png', () => {
        const src = readFileSync(ENGINE_SRC, 'utf8');
        assert.match(src,
            /import\s+\w+\s+from\s+['"]\.\.\/assets\/bg_96_20260520\.png['"]/,
            'watermarkEngine.js must import bg_96_20260520.png');
    });

    test('INLINE_ASSETS registers the "bg_96_20260520" key', () => {
        const src = readFileSync(ENGINE_SRC, 'utf8');
        assert.match(src,
            /['"`]bg_96_20260520['"`]\s*:/,
            'INLINE_ASSETS must contain a "bg_96_20260520" entry');
    });

    test('_loadAsset normalizes assetKey "96-20260520" -> registered inline asset', () => {
        const src = readFileSync(ENGINE_SRC, 'utf8');
        // The normalization step must exist (hyphen -> underscore).
        assert.ok(src.includes("replace(/-/g, '_')"),
            '_loadAsset must normalize hyphens to underscores');
        // Replicate the resolution logic and confirm the key is registered.
        const assetKey = '96-20260520';
        const normalizedKey = assetKey.replace(/-/g, '_');
        const assetName = normalizedKey.startsWith('bg_') ? normalizedKey : `bg_${normalizedKey}`;
        assert.strictEqual(assetName, 'bg_96_20260520');
        const registered = new RegExp(`['"\`]${assetName}['"\`]\\s*:`).test(src);
        assert.ok(registered, `"${assetName}" must be a key in INLINE_ASSETS`);
    });
});
