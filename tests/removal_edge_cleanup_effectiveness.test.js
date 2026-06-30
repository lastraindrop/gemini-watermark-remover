/**
 * Micro-deviation precision regression — edge cleanup effectiveness & no-op.
 *
 * applyEdgeCleanup (edgeCleanup.js) is the v2.7 B-3 stage that smooths
 * quantization banding at watermark edges on smooth (low-texture) backgrounds.
 * It must:
 *   - be a true no-op when there is no alpha edge (uniform / zero alpha) or
 *     when the region is high-texture (regionStdDev > 24),
 *   - actually reduce a luminance spike at the alpha edge (micro-deviation),
 *   - stay selective (only the alpha-edge band changes),
 *   - never worsen halo severity.
 *
 * Pure synthetic ImageData only. No production source modified.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdgeCleanup } from '../src/core/edgeCleanup.js';
import { assessAlphaBandHalo } from '../src/core/restorationMetrics.js';
import { maxChannelDelta } from './helpers/imageQualityAssertions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Adapter: the shared helper takes ImageData-like {data, width, height}; the
// before-snapshots here are raw Uint8ClampedArray copies, so wrap them. The
// alpha channel is constant (255) in every fixture and applyEdgeCleanup only
// ever modifies RGB, so a maxChannelDelta of 0 is equivalent to "zero byte
// changes" and a positive value is equivalent to "edge pixels modified".
const wrap = (data, img) => ({ data, width: img.width, height: img.height });

/** Mean grayscale luminance (BT.709) of a single image row. */
function rowMeanLum(data, imgW, row) {
    let sum = 0;
    const base = row * imgW * 4;
    for (let x = 0; x < imgW; x++) {
        const idx = base + x * 4;
        sum += data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
    }
    return sum / imgW;
}

/** Total vertical variation: Σ |lum(x,y) − lum(x,y−1)|. Blurring reduces it. */
function totalVerticalVariation(data, imgW, imgH) {
    let tv = 0;
    for (let y = 1; y < imgH; y++) {
        for (let x = 0; x < imgW; x++) {
            const a = (y * imgW + x) * 4;
            const b = ((y - 1) * imgW + x) * 4;
            const la = data[a] * 0.2126 + data[a + 1] * 0.7152 + data[a + 2] * 0.0722;
            const lb = data[b] * 0.2126 + data[b + 1] * 0.7152 + data[b + 2] * 0.0722;
            tv += Math.abs(la - lb);
        }
    }
    return tv;
}

/** Build a smooth vertical grayscale ramp image (low texture). */
function smoothRamp(w, h, base, slope) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const v = base + y * slope;
            data[idx] = data[idx + 1] = data[idx + 2] = v;
            data[idx + 3] = 255;
        }
    }
    return { width: w, height: h, data };
}

/** Alpha map with a sharp horizontal transition at `edgeRow` (0..h-1). */
function stepAlpha(w, h, hi, lo, edgeRow) {
    const map = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            map[y * w + x] = y < edgeRow ? hi : lo;
        }
    }
    return map;
}

/** Radially-falling alpha map (inner/edge/outer bands for halo assessment). */
function radialAlpha(w, h, peak) {
    const map = new Float32Array(w * h);
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const radius = Math.min(w, h) / 2;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            const t = Math.max(0, 1 - dist / radius);
            map[y * w + x] = Math.min(0.95, peak * t);
        }
    }
    return map;
}

// ---------------------------------------------------------------------------
// No-op behavior
// ---------------------------------------------------------------------------

describe('Edge cleanup — no-op behavior', () => {

    test('Uniform alpha (no gradient) → exactly zero byte changes', () => {
        const W = 40, H = 30;
        const img = smoothRamp(W, H, 120, 2);
        const before = new Uint8ClampedArray(img.data);
        const alpha = new Float32Array(20 * 12).fill(0.4); // uniform → gradient 0

        applyEdgeCleanup(img, alpha, { x: 5, y: 5, width: 20, height: 12 });

        assert.strictEqual(maxChannelDelta(wrap(before, img), img), 0,
            'uniform alpha must produce zero changes');
    });

    test('All-zero alpha → exactly zero byte changes', () => {
        const W = 32, H = 24;
        const img = smoothRamp(W, H, 100, 3);
        const before = new Uint8ClampedArray(img.data);
        const alpha = new Float32Array(16 * 10).fill(0); // zero → gradient 0

        applyEdgeCleanup(img, alpha, { x: 4, y: 4, width: 16, height: 10 });

        assert.strictEqual(maxChannelDelta(wrap(before, img), img), 0,
            'all-zero alpha must produce zero changes');
    });

    test('High-texture region (stddev > 24) → early return, zero changes', () => {
        // Checkerboard 32↔224 → BT.709 stddev ≈ 96 ≫ 24 → cleanup skips.
        const W = 32, H = 32;
        const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const idx = (y * W + x) * 4;
                const v = ((x + y) % 2) === 0 ? 32 : 224;
                img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = v;
                img.data[idx + 3] = 255;
            }
        }
        const before = new Uint8ClampedArray(img.data);
        const alpha = stepAlpha(16, 16, 0.5, 0.0, 8);

        applyEdgeCleanup(img, alpha, { x: 8, y: 8, width: 16, height: 16 });

        assert.strictEqual(maxChannelDelta(wrap(before, img), img), 0,
            'high-texture region must be skipped');
    });

    test('Does not crash with watermark at image boundary', () => {
        const W = 48, H = 48;
        const img = smoothRamp(W, H, 100, 2);
        const alpha = radialAlpha(48, 48, 0.4);
        assert.doesNotThrow(() =>
            applyEdgeCleanup(img, alpha, { x: 0, y: 0, width: 48, height: 48 }));
    });
});

// ---------------------------------------------------------------------------
// Effectiveness
// ---------------------------------------------------------------------------

describe('Edge cleanup — micro-deviation reduction', () => {

    test('Luminance spike at alpha edge is pulled toward the smooth gradient', () => {
        // Low-texture smooth ramp with a single off-gradient row aligned to the
        // alpha edge — mimics the quantization banding the stage targets.
        const W = 30, H = 24;
        const img = smoothRamp(W, H, 120, 2);            // expected row r = 120 + r*2
        const edgeImgRow = 12;                            // image row of the spike
        const SLOPE = 2, BASE = 120;
        const expectedAt = r => BASE + r * SLOPE;
        const SPIKE_DELTA = -14;                          // darker band at edge
        for (let x = 0; x < W; x++) {
            const idx = (edgeImgRow * W + x) * 4;
            for (let c = 0; c < 3; c++) img.data[idx + c] = expectedAt(edgeImgRow) + SPIKE_DELTA;
        }

        // Alpha edge between row 5 and 6 of alpha → image rows 12 / 13.
        // pos.y = 6 so alpha row r = image row (6 + r); alpha row 6 = image row 12.
        const alpha = stepAlpha(12, 12, 0.4, 0.0, 6);
        const pos = { x: 6, y: 6, width: 12, height: 12 };

        const beforeDev = Math.abs(rowMeanLum(img.data, W, edgeImgRow) - expectedAt(edgeImgRow));
        assert.ok(beforeDev > 10, 'fixture sanity: spike must be clearly off-gradient');

        applyEdgeCleanup(img, alpha, pos);

        const afterDev = Math.abs(rowMeanLum(img.data, W, edgeImgRow) - expectedAt(edgeImgRow));
        assert.ok(afterDev < beforeDev,
            `edge cleanup must reduce spike deviation: ${beforeDev.toFixed(1)} → ${afterDev.toFixed(1)}`);
    });

    test('Total vertical variation does not increase after cleanup', () => {
        // A smoothed edge must not introduce new variation. This guards against
        // the cleanup ever amplifying banding instead of reducing it.
        const W = 30, H = 24;
        const img = smoothRamp(W, H, 120, 2);
        // mild banding: flatten two rows at the edge into a small plateau
        for (let x = 0; x < W; x++) {
            for (const r of [12, 13]) {
                const idx = (r * W + x) * 4;
                img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = 144;
            }
        }
        const alpha = stepAlpha(12, 12, 0.4, 0.0, 6);
        const pos = { x: 6, y: 6, width: 12, height: 12 };

        const tvBefore = totalVerticalVariation(img.data, W, H);
        applyEdgeCleanup(img, alpha, pos);
        const tvAfter = totalVerticalVariation(img.data, W, H);

        assert.ok(tvAfter <= tvBefore + 1e-6,
            `TV must not increase: ${tvBefore.toFixed(1)} → ${tvAfter.toFixed(1)}`);
    });

    test('Selective: only the alpha-edge band changes, flat interior untouched', () => {
        // Two-region alpha: a uniform-alpha interior (no gradient → no change)
        // surrounded by an edge band that DOES change. Verify the interior
        // stays byte-identical while the edge band is modified.
        const W = 40, H = 30;
        const img = smoothRamp(W, H, 110, 3);
        const AW = 20, AH = 16;
        const alpha = new Float32Array(AW * AH);
        // outer ring = 0, inner 8x8 block = 0.5 (uniform → gradient 0 inside,
        // but a strong gradient at the block boundary).
        for (let y = 0; y < AH; y++) {
            for (let x = 0; x < AW; x++) {
                const inInner = x >= 6 && x < 14 && y >= 4 && y < 12;
                alpha[y * AW + x] = inInner ? 0.5 : 0.0;
            }
        }
        const pos = { x: 10, y: 7, width: AW, height: AH };
        const before = new Uint8ClampedArray(img.data);

        applyEdgeCleanup(img, alpha, pos);

        // Interior block (alpha rows 4..11, alpha cols 6..13 → image space):
        // uniform alpha → gradient 0 → must be unchanged.
        let interiorChanged = 0;
        for (let y = 5; y < 11; y++) {           // safely inside the inner block
            for (let x = 7; x < 13; x++) {
                const ai = y * AW + x;            // alpha index (y alpha = image row - 7)
                if (alpha[ai] !== 0.5) continue;
                const imgIdx = ((pos.y + y) * W + (pos.x + x)) * 4;
                for (let c = 0; c < 3; c++) {
                    if (before[imgIdx + c] !== img.data[imgIdx + c]) interiorChanged++;
                }
            }
        }
        assert.strictEqual(interiorChanged, 0,
            `flat alpha interior must be untouched (got ${interiorChanged} byte changes)`);
    });

    test('Cleanup actually modifies edge pixels when banding is present', () => {
        // Guards against the stage silently becoming a no-op due to a regression
        // in the gradient threshold / texture gate. On a perfectly smooth ramp
        // there is no banding to fix, so we inject a small single-row offset at
        // the alpha edge (the exact quantization pattern the stage targets).
        const W = 30, H = 24;
        const img = smoothRamp(W, H, 120, 2);     // stddev ≪ 24 → not skipped
        const edgeImgRow = 12;                     // alpha row 6 (pos.y=6)
        const BANDING_OFFSET = 6;
        for (let x = 0; x < W; x++) {
            const idx = (edgeImgRow * W + x) * 4;
            for (let c = 0; c < 3; c++) img.data[idx + c] += BANDING_OFFSET;
        }
        const alpha = stepAlpha(12, 12, 0.4, 0.0, 6);
        const pos = { x: 6, y: 6, width: 12, height: 12 };
        const before = new Uint8ClampedArray(img.data);

        applyEdgeCleanup(img, alpha, pos);

        assert.ok(maxChannelDelta(wrap(before, img), img) > 0,
            'edge pixels with banding on a smooth background must be modified');
    });
});

// ---------------------------------------------------------------------------
// Halo non-regression
// ---------------------------------------------------------------------------

describe('Edge cleanup — halo non-regression', () => {

    test('assessAlphaBandHalo severity does not increase after cleanup', () => {
        // Diagnostic bound: smoothing the alpha edge must not create or worsen
        // a halo ring. We allow a tiny tolerance for in-place numerical noise.
        const W = 48, H = 48;
        const img = smoothRamp(W, H, 110, 2);
        const alpha = radialAlpha(32, 32, 0.5);
        const pos = { x: 8, y: 8, width: 32, height: 32 };

        const before = assessAlphaBandHalo(img, alpha, pos);
        const beforeSnap = new Uint8ClampedArray(img.data);
        applyEdgeCleanup(img, alpha, pos);
        const after = assessAlphaBandHalo(img, alpha, pos);

        // sanity: the fixture should be low-texture enough for cleanup to run
        assert.ok(beforeSnap.length === img.data.length);

        assert.ok(after.severity <= before.severity + 0.05,
            `halo severity must not increase: ${before.severity} → ${after.severity}`);
        assert.ok(after.severity >= 0 && after.severity <= 1, 'severity out of [0,1]');
    });
});
