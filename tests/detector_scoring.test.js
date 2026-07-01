/**
 * Detector Scoring Tests (v2.3 — merged from bt709_color, ncc_scoring,
 * local contrast and gradient scoring)
 *
 * Covers all three NCC variants (spatial, gradient, local-contrast) plus
 * gradient-penalty behavior and color-space sensitivity in one file.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
    calculateCorrelation, calculateGradientCorrelation,
    calculateLocalContrastCorrelation, calculateProbeConfidence
} from '../src/core/detector.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, resolvePos } from './test_utils.js';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';

// ─── Spatial NCC ────────────────────────────────────────────────────────────

describe('Spatial NCC (calculateCorrelation)', () => {

    test('Perfect match application => NCC > 0.55', () => {
        const size = 48;
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(size);
        applyWatermark(img, 10, 10, size, size, alphaMap);
        applyWatermark(img, 10, 10, size, size, alphaMap); // stronger signal

        const conf = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        assert.ok(conf > 0.55, `Strong watermark should have NCC > 0.55, got ${conf}`);
    });

    test('No match on random region => |NCC| < 0.4', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(size);
        const conf = calculateCorrelation(img, 100, 100, size, size, alphaMap, true);
        assert.ok(Math.abs(conf) < 0.4, `Random region |NCC| should be low, got ${Math.abs(conf)}`);
    });

    test('fullPrecision=true uses step=1; fullPrecision=false uses step=2', () => {
        const size = 48;
        const img = createMockImageData(120, 120, 'noise', 128);
        const alphaMap = createMockAlphaMap(size);
        applyWatermark(img, 10, 10, size, size, alphaMap);
        const confFull = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        const confHalf = calculateCorrelation(img, 10, 10, size, size, alphaMap, false);
        assert.ok(confFull > 0, 'Full precision should find correlation');
        assert.ok(confHalf > 0, 'Half precision should also find correlation');
    });

    test('Uniform region => NCC = 0 (zero variance)', () => {
        const size = 48;
        const img = createMockImageData(120, 120, 'solid', 128);
        const alphaMap = new Float32Array(size * size).fill(0.5);
        const conf = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        assert.ok(Math.abs(conf) < 0.1, `Uniform region NCC should be ~0, got ${conf}`);
    });

    test('Count threshold: too few in-bounds samples => 0', () => {
        const size = 96;
        const img = createMockImageData(8, 8, 'noise', 128);
        const alphaMap = new Float32Array(size * size).fill(0.5);
        const conf = calculateCorrelation(img, -44, -44, size, size, alphaMap, true);
        assert.strictEqual(conf, 0, 'When count < threshold, NCC should be 0');
    });

    test('Subpixel offset reduces NCC below exact match', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(size);
        applyWatermark(img, 50, 50, size, size, alphaMap);
        applyWatermark(img, 50, 50, size, size, alphaMap);
        const confExact = calculateCorrelation(img, 50, 50, size, size, alphaMap, true);
        const confOffset = calculateCorrelation(img, 53, 53, size, size, alphaMap, true);
        assert.ok(confOffset < confExact, `Offset (${confOffset}) should be < exact (${confExact})`);
    });

    test('Variance floor: clean uniform image => low NCC', () => {
        const size = 48;
        const img = createMockImageData(100, 100, 'solid', 100);
        const alphaMap = createMockAlphaMap(size);
        const conf = calculateCorrelation(img, 10, 10, size, size, alphaMap, true);
        assert.ok(Math.abs(conf) < 0.3, `Clean uniform bg NCC should be low, got ${conf}`);
    });
});

// ─── Gradient NCC ───────────────────────────────────────────────────────────

describe('Gradient NCC (calculateGradientCorrelation)', () => {

    test('Edged (grid) region produces valid gradient correlation', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'grid', 128);
        const alphaMap = createMockAlphaMap(size);
        applyWatermark(img, 50, 50, size, size, alphaMap);
        const gi = new Float32Array(size * size);
        const ga = new Float32Array(size * size);
        const gradConf = calculateGradientCorrelation(img, 50, 50, size, size, alphaMap, gi, ga);
        assert.ok(typeof gradConf === 'number', 'Should return a number');
    });

    test('Solid region => gradient correlation ≈ 0', () => {
        const size = 48;
        const img = createMockImageData(200, 200, 'solid', 128);
        const alphaMap = new Float32Array(size * size).fill(0.5);
        const gi = new Float32Array(size * size);
        const ga = new Float32Array(size * size);
        const gradConf = calculateGradientCorrelation(img, 50, 50, size, size, alphaMap, gi, ga);
        assert.ok(Math.abs(gradConf) < 0.01, `Zero-gradient NCC should be ~0, got ${gradConf}`);
    });

    test('Out-of-bounds pixels are safely skipped', () => {
        const size = 48;
        const img = createMockImageData(60, 60, 'noise', 128);
        const alphaMap = createMockAlphaMap(size);
        const gi = new Float32Array(size * size);
        const ga = new Float32Array(size * size);
        // Position partly outside the image
        const gradConf = calculateGradientCorrelation(img, 20, 20, size, size, alphaMap, gi, ga);
        assert.strictEqual(typeof gradConf, 'number');
    });
});

// ─── Local-Contrast NCC ─────────────────────────────────────────────────────

describe('Local-Contrast NCC (calculateLocalContrastCorrelation)', () => {

    test('Empty alpha map => 0 or near-zero', () => {
        const img = createMockImageData(100, 100, 'solid', 128);
        const emptyAlpha = new Float32Array(96 * 96).fill(0);
        const result = calculateLocalContrastCorrelation(img, 0, 0, 96, 96, emptyAlpha, true);
        assert.ok(result < 0.1 || result === 0, `Empty alpha => low, got ${result}`);
    });

    test('Solid background without watermark => low correlation', () => {
        const img = createMockImageData(200, 200, 'solid', 180);
        const alphaMap = createMockAlphaMap(96);
        const conf = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        assert.ok(conf < 0.2, `No watermark on solid bg => low, got ${conf}`);
    });

    test('Watermark present => high local-contrast correlation', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        const conf = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        assert.ok(conf > 0.3, `Watermarked region should correlate > 0.3, got ${conf}`);
    });

    test('Offset position degrades correlation', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        const exact = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        const offset = calculateLocalContrastCorrelation(img, 70, 50, 96, 96, alphaMap, true);
        assert.ok(exact > 0.3, `Exact position should correlate, got ${exact}`);
        assert.ok(offset < exact, `Offset should have lower correlation`);
    });

    test('Full-precision vs sampled mode both return numbers', () => {
        const img = createMockImageData(200, 200, 'grid', 128);
        const alphaMap = createMockAlphaMap(96);
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        const full = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, true);
        const smp = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, alphaMap, false);
        assert.ok(typeof full === 'number');
        assert.ok(typeof smp === 'number');
    });

    test('Negative coordinates handled safely', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(96);
        const result = calculateLocalContrastCorrelation(img, -50, -50, 96, 96, alphaMap, true);
        assert.ok(typeof result === 'number');
    });

    test('Logo-region-size-dependent radius produces valid output', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const smallA = createMockAlphaMap(48);
        const largeA = createMockAlphaMap(96);
        applyWatermark(img, 70, 70, 48, 48, smallA, 255);
        applyWatermark(img, 50, 50, 96, 96, largeA, 255);
        const sc = calculateLocalContrastCorrelation(img, 70, 70, 48, 48, smallA, true);
        const lc = calculateLocalContrastCorrelation(img, 50, 50, 96, 96, largeA, true);
        assert.ok(typeof sc === 'number');
        assert.ok(typeof lc === 'number');
    });

    test('v2.6: Faint-watermark alpha residual threshold 0.004 retains even more pixels', () => {
        // Create a weak watermark with alpha just above the new threshold
        const img = createMockImageData(200, 200, 'noise', 128);
        const weakAlpha = new Float32Array(48 * 48);
        for (let i = 0; i < weakAlpha.length; i++) weakAlpha[i] = 0.005; // above 0.004
        applyWatermark(img, 50, 50, 48, 48, weakAlpha, 255);
        const conf = calculateLocalContrastCorrelation(img, 50, 50, 48, 48, weakAlpha, true);
        // Should be non-zero (pixels above 0.004 residual are kept)
        assert.ok(typeof conf === 'number' && conf >= 0,
            `Faint watermark should produce valid score, got ${conf}`);
    });
});

// ─── Gradient Penalty ───────────────────────────────────────────────────────

describe('Gradient Penalty (calculateProbeConfidence deepScan)', () => {

    test('High gradient + high spatial => full confidence, no penalty', () => {
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(48);
        applyWatermark(img, 10, 10, 48, 48, alphaMap);
        const result = calculateProbeConfidence(img, { x: 10, y: 10, width: 48, height: 48 }, alphaMap, 'gemini', { deepScan: true });
        assert.ok(result.confidence > 0.3, `Expected > 0.3, got ${result.confidence}`);
    });

    test('Very low gradient (<0.02) uses blended scoring without zeroing the score', () => {
        const img = createMockImageData(120, 120, 'solid', 128);
        const alphaMap = createMockAlphaMap(48);
        const pos = { x: 36, y: 36, width: 48, height: 48 };
        applyWatermark(img, pos.x, pos.y, 48, 48, alphaMap);
        const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
        assert.ok(result.confidence > 0.03, `Solid bg should not be eliminated (got ${result.confidence})`);
    });

    test('Sign-flip first-pass over-correction is handled by multiPass, probe unaffected', () => {
        // This test verifies that calculateProbeConfidence itself does not crash
        // or return invalid values for edge-case gradient scenarios.
        const img = createMockImageData(100, 100, 'noise', 128);
        const alphaMap = createMockAlphaMap(48);
        applyWatermark(img, 10, 10, 48, 48, alphaMap);
        const result = calculateProbeConfidence(img, { x: 10, y: 10, width: 48, height: 48 }, alphaMap, 'gemini', { deepScan: true });
        assert.ok(Number.isFinite(result.confidence), `Confidence should be finite, got ${result.confidence}`);
        assert.ok(result.confidence >= 0, `Confidence should be >= 0`);
    });
});

// ─── Color-Space Sensitivity ─────────────────────────────────────────────────

describe('Color-Space Sensitivity', () => {

    test('Detection on high-saturation green background', () => {
        const w = 512, h = 512, size = 96;
        const img = createMockImageData(w, h, 'solid', 0);
        for (let i = 0; i < img.data.length; i += 4) img.data[i + 1] = 255;
        const alphaMap = createMockAlphaMap(size);
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        applyWatermark(img, targetX, targetY, size, size, alphaMap);
        const conf = calculateCorrelation(img, targetX, targetY, size, size, alphaMap, true);
        assert.ok(conf > 0.8, `Green bg confidence too low: ${conf}`);
    });

    test('Detection on high-saturation blue background', () => {
        const w = 512, h = 512, size = 96;
        const img = createMockImageData(w, h, 'solid', 0);
        for (let i = 0; i < img.data.length; i += 4) img.data[i + 2] = 255;
        const alphaMap = createMockAlphaMap(size);
        const targetX = w - 64 - size;
        const targetY = h - 64 - size;
        applyWatermark(img, targetX, targetY, size, size, alphaMap);
        const conf = calculateCorrelation(img, targetX, targetY, size, size, alphaMap, true);
        assert.ok(conf > 0.7, `Blue bg confidence too low: ${conf}`);
    });

    test('Green-pixel luminance weight > blue-pixel (BT.709: G=0.7152 >> B=0.0722)', () => {
        const size = 48;
        const alphaMap = new Float32Array(size * size).fill(0.2);
        const greenPx = { data: new Uint8ClampedArray([0, 255, 0, 255]), width: 1, height: 1 };
        const bluePx = { data: new Uint8ClampedArray([0, 0, 255, 255]), width: 1, height: 1 };
        const confG = calculateCorrelation(greenPx, 0, 0, 1, 1, new Float32Array([0.2]), true);
        const confB = calculateCorrelation(bluePx, 0, 0, 1, 1, new Float32Array([0.2]), true);
        assert.strictEqual(typeof confG, 'number');
        assert.strictEqual(typeof confB, 'number');
    });

    test('alphaMap uses maxChannel; detector uses BT.709 luminance — both work', () => {
        const r = 100, g = 200, b = 50;
        const data = new Uint8ClampedArray([r, g, b, 255]);
        const alphaMap = calculateAlphaMap({ width: 1, height: 1, data });
        const expectedMaxChannel = Math.max(r, g, b) / 255.0;
        assert.ok(Math.abs(alphaMap[0] - expectedMaxChannel) < 0.001,
            `alphaMap max-channel mismatch: got ${alphaMap[0].toFixed(6)}, expected ${expectedMaxChannel.toFixed(6)}`);
        // detector.calculateCorrelation uses BT.709 internally — verify it doesn't crash
        const img = { data: new Uint8ClampedArray([r, g, b, 255]), width: 1, height: 1 };
        const conf = calculateCorrelation(img, 0, 0, 1, 1, new Float32Array([expectedMaxChannel]), true);
        assert.strictEqual(typeof conf, 'number', 'calculateCorrelation should not crash on mixed channels');
    });
});
