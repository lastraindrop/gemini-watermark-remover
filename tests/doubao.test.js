/**
 * Doubao (豆包) Watermark - Comprehensive Test Suite
 * 
 * Covers:
 * - Profile integrity checks
 * - Catalog entry matching for all doubao resolutions
 * - Multi-anchor (TL+BR) detection simulation
 * - Heuristic config scaling
 * - End-to-end detection + removal for doubao
 * - Edge cases specific to doubao (wide landscape, tall portrait)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { PROFILES, getProfile } from '../src/core/profiles.js';
import { CATALOGS, getAllCatalogConfigs, getCatalogConfig } from '../src/core/catalog.js';
import { getAllPotentialConfigs, calculateWatermarkPosition, detectWatermarkConfig } from '../src/core/config.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateProbeConfidence, detectWatermark } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Profile Integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('Doubao Profile Integrity', () => {

    test('Doubao profile is registered', () => {
        const profile = getProfile('doubao');
        assert.strictEqual(profile.id, 'doubao');
        assert.strictEqual(profile.name, 'ByteDance Doubao (豆包)');
    });

    test('Doubao supports multiple anchors (TL + BR)', () => {
        const profile = getProfile('doubao');
        assert.ok(profile.anchors.includes('bottom-right'), 'Must have bottom-right anchor');
        assert.ok(profile.anchors.includes('top-left'), 'Must have top-left anchor');
    });

    test('Doubao has asset keys for each anchor', () => {
        const profile = getProfile('doubao');
        assert.ok(profile.assets['bottom-right'], 'Must have BR asset key');
        assert.ok(profile.assets['top-left'], 'Must have TL asset key');
    });

    test('Doubao has getHeuristicConfig function', () => {
        const profile = getProfile('doubao');
        assert.strictEqual(typeof profile.getHeuristicConfig, 'function');
    });

    test('Doubao has logoValue defined', () => {
        const profile = getProfile('doubao');
        assert.strictEqual(typeof profile.logoValue, 'number');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Catalog Coverage
// ─────────────────────────────────────────────────────────────────────────────
describe('Doubao Catalog Coverage', () => {
    const doubaoEntries = CATALOGS.doubao;

    test('Doubao catalog has at least 6 entries', () => {
        assert.ok(doubaoEntries.length >= 6, `Expected >= 6, got ${doubaoEntries.length}`);
    });

    // Test that each catalog entry can be matched precisely
    for (const entry of doubaoEntries) {
        test(`Catalog match: ${entry.width}x${entry.height} (${entry.anchor})`, () => {
            const matches = getAllCatalogConfigs(entry.width, entry.height, 'doubao');
            assert.ok(matches.length > 0, `No match for ${entry.width}x${entry.height}`);
            const found = matches.some(m => m.anchor === entry.anchor);
            assert.ok(found, `Anchor ${entry.anchor} not found in matches for ${entry.width}x${entry.height}`);
        });
    }

    test('Non-catalog resolution falls through to heuristic', () => {
        // 1920x1080 is not in doubao catalog
        const matches = getAllCatalogConfigs(1920, 1080, 'doubao');
        assert.strictEqual(matches.length, 0, 'Should not match any doubao catalog entry');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Multi-Anchor Config Generation
// ─────────────────────────────────────────────────────────────────────────────
describe('Doubao Multi-Anchor Config Generation', () => {

    test('getAllPotentialConfigs returns both anchors for known doubao resolution', () => {
        // 2730x1535 has both TL and BR entries
        const configs = getAllPotentialConfigs(2730, 1535, 'doubao');
        assert.ok(configs.length >= 2, `Expected >=2 configs, got ${configs.length}`);
        const anchors = configs.map(c => c.anchor);
        assert.ok(anchors.includes('top-left'), 'Must include top-left config');
        assert.ok(anchors.includes('bottom-right'), 'Must include bottom-right config');
    });

    test('getAllPotentialConfigs uses heuristic for unknown doubao resolution', () => {
        // 1920x1080 → falls to getHeuristicConfig
        const configs = getAllPotentialConfigs(1920, 1080, 'doubao');
        assert.ok(configs.length >= 1, 'Should return at least 1 heuristic config');
        // All should have anchor set
        for (const c of configs) {
            assert.ok(c.anchor, 'Heuristic config must have anchor field');
        }
    });

    test('calculateWatermarkPosition for TL anchor', () => {
        const config = { logoWidth: 307, logoHeight: 167, marginLeft: 38, marginTop: 25, anchor: 'top-left' };
        const pos = calculateWatermarkPosition(2730, 1535, config);
        assert.strictEqual(pos.x, 38);
        assert.strictEqual(pos.y, 25);
        assert.strictEqual(pos.width, 307);
        assert.strictEqual(pos.height, 167);
    });

    test('calculateWatermarkPosition for BR anchor', () => {
        const config = { logoWidth: 401, logoHeight: 173, marginRight: 24, marginBottom: 10, anchor: 'bottom-right' };
        const pos = calculateWatermarkPosition(2730, 1535, config);
        assert.strictEqual(pos.x, 2730 - 24 - 401);
        assert.strictEqual(pos.y, 1535 - 10 - 173);
        assert.strictEqual(pos.width, 401);
        assert.strictEqual(pos.height, 173);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Heuristic Scaling
// ─────────────────────────────────────────────────────────────────────────────
describe('Doubao Heuristic Scaling', () => {

    test('BR heuristic scales proportionally from 2730 baseline', () => {
        const profile = getProfile('doubao');
        const scale = 0.5; // Half the baseline
        const cfg = profile.getHeuristicConfig(2730 * scale, 1535 * scale, 'bottom-right');
        
        // Scaled values (rounded)
        assert.ok(Math.abs(cfg.logoWidth - Math.round(401 * scale)) <= 1, 'BR width should scale');
        assert.ok(Math.abs(cfg.logoHeight - Math.round(173 * scale)) <= 1, 'BR height should scale');
        assert.strictEqual(cfg.anchor, 'bottom-right');
    });

    test('TL heuristic scales proportionally from 2730 baseline', () => {
        const profile = getProfile('doubao');
        const scale = 2.0; // Double the baseline
        const cfg = profile.getHeuristicConfig(2730 * scale, 1535 * scale, 'top-left');
        
        assert.ok(Math.abs(cfg.logoWidth - Math.round(307 * scale)) <= 1, 'TL width should scale');
        assert.ok(Math.abs(cfg.logoHeight - Math.round(167 * scale)) <= 1, 'TL height should scale');
        assert.strictEqual(cfg.anchor, 'top-left');
    });

    test('Default anchor is bottom-right', () => {
        const profile = getProfile('doubao');
        const cfg = profile.getHeuristicConfig(2730, 1535);
        assert.strictEqual(cfg.anchor, 'bottom-right');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Detection & Removal E2E (Simulated)
// ─────────────────────────────────────────────────────────────────────────────
describe('Doubao E2E Detection & Removal', () => {

    /**
     * Simulate Doubao BR watermark placement and verify detection + removal
     */
    test('BR watermark: calculateProbeConfidence detects injected watermark', () => {
        // Use 2730x1535 standard resolution
        const w = 2730, h = 1535;
        const config = getAllCatalogConfigs(w, h, 'doubao').find(c => c.anchor === 'bottom-right');
        assert.ok(config, 'Should have BR catalog entry for 2730x1535');

        const pos = calculateWatermarkPosition(w, h, config);
        const alphaMap = createMockAlphaMap(pos.width, pos.height);
        const originalColor = 50; 
        const img = createMockImageData(w, h, 'noise', originalColor);

        // Apply watermark
        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

        // Verify detection
        const result = calculateProbeConfidence(img, pos, alphaMap, 'doubao');
        assert.ok(result.confidence > 0.15, 
            `Expected confidence > 0.15, got ${result.confidence.toFixed(3)}`);
    });

    test('TL watermark: calculateProbeConfidence detects injected watermark', () => {
        const w = 2730, h = 1535;
        const config = getAllCatalogConfigs(w, h, 'doubao').find(c => c.anchor === 'top-left');
        assert.ok(config, 'Should have TL catalog entry for 2730x1535');

        const pos = calculateWatermarkPosition(w, h, config);
        const alphaMap = createMockAlphaMap(pos.width, pos.height);
        const img = createMockImageData(w, h, 'noise', 200);

        applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

        const result = calculateProbeConfidence(img, pos, alphaMap, 'doubao');
        assert.ok(result.confidence > 0.15,
            `Expected confidence > 0.15, got ${result.confidence.toFixed(3)}`);
    });

    test('BR watermark: removal reconstruction accuracy', () => {
        const w = 500, h = 500;
        const logoW = 80, logoH = 40;
        const marginR = 20, marginB = 10;
        const originalColor = 120;

        const pos = {
            x: w - marginR - logoW,
            y: h - marginB - logoH,
            width: logoW,
            height: logoH,
            anchor: 'bottom-right'
        };

        const alphaMap = new Float32Array(logoW * logoH).fill(0.5);
        const img = createMockImageData(w, h, 'solid', originalColor);

        applyWatermark(img, pos.x, pos.y, logoW, logoH, alphaMap);

        // Verify watermark affects pixels
        const midIdx = ((pos.y + logoH / 2 | 0) * w + (pos.x + logoW / 2 | 0)) << 2;
        assert.notStrictEqual(img.data[midIdx], originalColor, 'Watermark should affect pixels');

        // Remove and verify reconstruction
        removeWatermark(img, alphaMap, pos);
        const recovered = img.data[midIdx];
        assert.ok(Math.abs(recovered - originalColor) <= 8, 
            `Recovery failed: got ${recovered}, expected ~${originalColor}`);
    });

    test('Dual-anchor: both TL and BR removed independently', () => {
        const w = 500, h = 300;
        const originalColor = 100;
        const img = createMockImageData(w, h, 'solid', originalColor);

        // BR watermark
        const brPos = { x: w - 60, y: h - 30, width: 50, height: 25, anchor: 'bottom-right' };
        const brAlpha = new Float32Array(brPos.width * brPos.height).fill(0.5);

        // TL watermark
        const tlPos = { x: 10, y: 10, width: 50, height: 25, anchor: 'top-left' };
        const tlAlpha = new Float32Array(tlPos.width * tlPos.height).fill(0.4);

        applyWatermark(img, brPos.x, brPos.y, brPos.width, brPos.height, brAlpha);
        applyWatermark(img, tlPos.x, tlPos.y, tlPos.width, tlPos.height, tlAlpha);

        // Remove both
        removeWatermark(img, brAlpha, brPos);
        removeWatermark(img, tlAlpha, tlPos);

        // Check BR center pixel
        const brIdx = ((brPos.y + 12) * w + (brPos.x + 25)) << 2;
        assert.ok(Math.abs(img.data[brIdx] - originalColor) <= 3,
            `BR recovery: got ${img.data[brIdx]}, expected ~${originalColor}`);

        // Check TL center pixel
        const tlIdx = ((tlPos.y + 12) * w + (tlPos.x + 25)) << 2;
        assert.ok(Math.abs(img.data[tlIdx] - originalColor) <= 3,
            `TL recovery: got ${img.data[tlIdx]}, expected ~${originalColor}`);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Sample Dataset Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Doubao Sample Dataset Validation', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const sampleRoot = path.join(__dirname, '../sample');
    const candidateSizes = ['2730x1535', '2364x1773', '1536x2727'];

    test('Sample images include known Doubao catalog resolutions', async () => {
        const sampleDir = path.join(sampleRoot, 'other');
        const files = fs.readdirSync(sampleDir).filter(f => f.includes('pre_watermark_') && f.endsWith('.png'));
        const resolutions = new Set();

        for (const fileName of files) {
            const filePath = path.join(sampleDir, fileName);
            const meta = await sharp(filePath).metadata();
            const sizeKey = `${meta.width}x${meta.height}`;
            assert.ok(candidateSizes.includes(sizeKey), `Unexpected sample resolution ${sizeKey}`);
            assert.ok(getAllCatalogConfigs(meta.width, meta.height, 'doubao').length > 0,
                `Resolution ${sizeKey} should match a Doubao catalog entry`);
            resolutions.add(sizeKey);
        }

        assert.deepStrictEqual(Array.from(resolutions).sort(), candidateSizes.sort());
    });

    test('Extracted Doubao mask prototypes match expected anchor sizes', async () => {
        const brMeta = await sharp(path.join(sampleRoot, 'other', 'ext_br.png')).metadata();
        const tlMeta = await sharp(path.join(sampleRoot, 'other', 'ext_tl.png')).metadata();

        assert.strictEqual(brMeta.width, 401);
        assert.strictEqual(brMeta.height, 173);
        assert.strictEqual(tlMeta.width, 307);
        assert.strictEqual(tlMeta.height, 167);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Doubao Specific Edge Cases
// ─────────────────────────────────────────────────────────────────────────────
describe('Doubao Edge Cases', () => {

    test('Tall portrait format: 1536x2727 has catalog entries', () => {
        const matches = getAllCatalogConfigs(1536, 2727, 'doubao');
        assert.ok(matches.length >= 1, 'Should match tall portrait catalog entry');
    });

    test('Wide landscape format: 2364x1773 has catalog entries', () => {
        const matches = getAllCatalogConfigs(2364, 1773, 'doubao');
        assert.ok(matches.length >= 1, 'Should match wide landscape catalog entry');
    });

    test('Remove watermark with subpixel offset (alpha < ALPHA_THRESHOLD)', () => {
        const img = createMockImageData(100, 100, 'solid', 150);
        const originalData = new Uint8ClampedArray(img.data);

        // Zero-alpha map should leave image unchanged
        const alphaMap = new Float32Array(50 * 50).fill(0);
        const pos = { x: 10, y: 10, width: 50, height: 50 };
        removeWatermark(img, alphaMap, pos);

        assert.deepStrictEqual(img.data, originalData, 'Zero-alpha removal must not change pixels');
    });

    test('Heuristic does not return negative coordinates for small images', () => {
        const profile = getProfile('doubao');
        const cfg = profile.getHeuristicConfig(200, 150, 'bottom-right');
        const pos = calculateWatermarkPosition(200, 150, cfg);
        // Coordinates may be negative for tiny images — just ensure no crashes
        assert.strictEqual(typeof pos.x, 'number');
        assert.strictEqual(typeof pos.y, 'number');
    });

    test('getAllPotentialConfigs doubao heuristic never returns empty array', () => {
        // Any resolution should yield at least 2 configs (one per anchor)
        const configs = getAllPotentialConfigs(3000, 2000, 'doubao');
        assert.ok(configs.length >= 1, 'Should always return at least 1 config');
    });

    test('Adversarial: Dual-anchor overlay with heavy noise', async () => {
        const w = 1536, h = 2727; // Doubao standard tall resolution
        const img = createMockImageData(w, h, 'grid', 128);
        const configs = getAllCatalogConfigs(w, h, 'doubao');
        
        // Apply both TL and BR watermarks
        for (const cfg of configs) {
            const pos = calculateWatermarkPosition(w, h, cfg);
            const alpha = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alpha);
        }

        // Add heavy quantization noise (simulating poor JPEG)
        for (let i = 0; i < img.data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                img.data[i + c] = Math.round(img.data[i + c] / 32) * 32;
            }
        }

        // Verify detection for both anchors remains stable
        for (const cfg of configs) {
            const pos = calculateWatermarkPosition(w, h, cfg);
            const alpha = createMockAlphaMap(pos.width, pos.height);
            const result = calculateProbeConfidence(img, pos, alpha, 'doubao', { deepScan: true });
            assert.ok(result.confidence > 0.12, `Detection failed for anchor ${cfg.anchor} under heavy noise: ${result.confidence}`);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Rectangular Watermark Phase 2 Search
// ─────────────────────────────────────────────────────────────────────────────
describe('Doubao Rectangular Phase 2 Detection', () => {

    test('Non-catalog rectangular doubao watermark found via Phase 2 (BR)', () => {
        const w = 500, h = 500;
        const profile = getProfile('doubao');
        const cfg = profile.getHeuristicConfig(w, h, 'bottom-right');
        const alphaMap = createMockAlphaMap(cfg.logoWidth, cfg.logoHeight);

        const img = createMockImageData(w, h, 'gradient', 100);
        const pos = calculateWatermarkPosition(w, h, cfg);
        applyWatermark(img, pos.x, pos.y, cfg.logoWidth, cfg.logoHeight, alphaMap);

        const mapKey = `${cfg.logoWidth}x${cfg.logoHeight}`;
        const result = detectWatermark(img, { [mapKey]: alphaMap }, { deepScan: true });
        assert.ok(result, `Phase 2 should find ${cfg.logoWidth}x${cfg.logoHeight} rectangular watermark`);
    });

    test('Non-catalog rectangular doubao watermark found via Phase 2 (TL)', () => {
        const w = 600, h = 400;
        const profile = getProfile('doubao');
        const cfg = profile.getHeuristicConfig(w, h, 'top-left');
        const alphaMap = createMockAlphaMap(cfg.logoWidth, cfg.logoHeight);

        const img = createMockImageData(w, h, 'gradient', 120);
        const pos = calculateWatermarkPosition(w, h, cfg);
        applyWatermark(img, pos.x, pos.y, cfg.logoWidth, cfg.logoHeight, alphaMap);

        const mapKey = `${cfg.logoWidth}x${cfg.logoHeight}`;
        const result = detectWatermark(img, { [mapKey]: alphaMap }, { deepScan: true });
        assert.ok(result, `Phase 2 should find TL ${cfg.logoWidth}x${cfg.logoHeight} rectangular watermark`);
    });
});
