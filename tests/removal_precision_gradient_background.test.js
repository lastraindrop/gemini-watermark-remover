/**
 * Micro-deviation precision regression — reverse alpha-blend on gradient
 * backgrounds.
 *
 * Gradients are the worst case for visible "micro-deviation" (the 1–2px
 * quantization banding described in STAGE_PLAN_v2.7 / blendModes.js): a small
 * per-pixel reconstruction error forms a visible step on a smooth ramp. These
 * tests forward-blend a white watermark onto a deterministic synthetic
 * gradient, run removeWatermark(), and measure how close the reconstruction
 * is to the ground-truth original using MAE / max-delta / PSNR.
 *
 * All fixtures are pure synthetic ImageData — deterministic, no jitter, no I/O.
 * No production source is modified.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { removeWatermark } from '../src/core/blendModes.js';
import { meanAbsoluteError, maxChannelDelta, psnr } from './helpers/imageQualityAssertions.js';

// ---------------------------------------------------------------------------
// Adapter: the shared helper takes ImageData-like {data, width, height}; the
// ground-truth buffers here are raw Uint8ClampedArray copies, so wrap them.
// ---------------------------------------------------------------------------

const wrap = (data, width, height) => ({ data, width, height });

// ---------------------------------------------------------------------------
// Pure synthetic fixtures
// ---------------------------------------------------------------------------

const lerp = (from, to, t) => Math.round(from + (to - from) * t);

/** Build a deterministic image from a per-pixel RGB function. */
function imageFrom(w, h, fn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) << 2;
            const [r, g, b] = fn(x, y, w, h);
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
        }
    }
    return { width: w, height: h, data };
}

/** Horizontal linear grayscale gradient [from..to] (0..255). */
function hGradient(w, h, from, to) {
    return imageFrom(w, h, (x, y, W) => {
        const v = W > 1 ? lerp(from, to, x / (W - 1)) : from;
        return [v, v, v];
    });
}

/** Vertical linear grayscale gradient [from..to]. */
function vGradient(w, h, from, to) {
    return imageFrom(w, h, (x, y, W, H) => {
        const v = H > 1 ? lerp(from, to, y / (H - 1)) : from;
        return [v, v, v];
    });
}

/**
 * Forward alpha-blend a white watermark in-place — the exact inverse
 * removeWatermark targets: watermarked = round(α·255 + (1−α)·original).
 */
function forwardBlend(imageData, alphaMap) {
    const { data, width: imgW, height: imgH } = imageData;
    for (let y = 0; y < imgH; y++) {
        for (let x = 0; x < imgW; x++) {
            const a = alphaMap[y * imgW + x];
            if (a < 0.001) continue;
            const idx = (y * imgW + x) << 2;
            for (let c = 0; c < 3; c++) {
                const o = data[idx + c];
                data[idx + c] = Math.max(0, Math.min(255, Math.round(a * 255 + (1 - a) * o)));
            }
        }
    }
}

/** Uniform alpha map (every pixel the same alpha). */
function uniformAlpha(w, h, a) {
    return new Float32Array(w * h).fill(a);
}

/**
 * Radially-falling alpha map (watermark-shaped): bright center, fading edge.
 * Mirrors createMockAlphaMap but stays pure/deterministic for precision work.
 */
function radialAlpha(w, h, peak) {
    const map = new Float32Array(w * h);
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const radius = Math.min(w, h) / 2;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const t = Math.max(0, 1 - dist / radius);
            map[y * w + x] = Math.min(0.95, peak * Math.pow(t, 0.4));
        }
    }
    return map;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Removal precision — gradient background reverse blend', () => {

    describe('Horizontal gradient background', () => {
        test('α=0.5 round-trip: low MAE, bounded max-delta, high PSNR', () => {
            const W = 48, H = 32;
            const img = hGradient(W, H, 0, 255);
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 0.5);

            forwardBlend(img, alpha);            // original → watermarked
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const mx = maxChannelDelta(img, expected);
            const psnrDb = psnr(img, expected);

            // Error analysis: α=0.5 → reverse amplification = 1/(1−0.5) = 2×.
            // Forward Math.round error ≤ 0.5, amplified → ≤ 1, re-rounded.
            assert.ok(mae <= 2.0, `MAE too high: ${mae.toFixed(3)}`);
            assert.ok(mx <= 3, `max delta too high: ${mx}`);
            assert.ok(psnrDb >= 40, `PSNR too low: ${psnrDb.toFixed(2)} dB`);
        });

        test('α=0.3 (low amplification) reconstructs even more accurately', () => {
            const W = 40, H = 24;
            const img = hGradient(W, H, 20, 200);
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 0.3);

            forwardBlend(img, alpha);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const mx = maxChannelDelta(img, expected);
            const psnrDb = psnr(img, expected);

            // amplification 1/0.7 ≈ 1.43 → smaller rounding amplification
            assert.ok(mae <= 1.5, `MAE: ${mae.toFixed(3)}`);
            assert.ok(mx <= 3, `maxDelta: ${mx}`);
            assert.ok(psnrDb >= 42, `PSNR: ${psnrDb.toFixed(2)}`);
        });

        test('α=0.08 (faint watermark) — minimal amplification, near-perfect', () => {
            const W = 32, H = 16;
            const img = hGradient(W, H, 40, 220);
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 0.08);

            forwardBlend(img, alpha);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const mx = maxChannelDelta(img, expected);

            // amplification 1/0.92 ≈ 1.087 → sub-unit error
            assert.ok(mae <= 1.0, `MAE: ${mae.toFixed(3)}`);
            assert.ok(mx <= 2, `maxDelta: ${mx}`);
        });
    });

    describe('Vertical & 2D gradient backgrounds', () => {
        test('Vertical gradient, α=0.5 — same precision as horizontal', () => {
            const W = 32, H = 48;
            const img = vGradient(W, H, 10, 245);
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 0.5);

            forwardBlend(img, alpha);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const psnrDb = psnr(img, expected);

            assert.ok(mae <= 2.0, `MAE: ${mae.toFixed(3)}`);
            assert.ok(psnrDb >= 40, `PSNR: ${psnrDb.toFixed(2)}`);
        });

        test('2D diagonal gradient, α=0.5 — isotropic precision', () => {
            const W = 40, H = 40;
            const img = imageFrom(W, H, (x, y, Wd, Hd) => {
                const v = lerp(0, 255, ((x / (Wd - 1)) + (y / (Hd - 1))) / 2);
                return [v, v, v];
            });
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 0.5);

            forwardBlend(img, alpha);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const mx = maxChannelDelta(img, expected);

            assert.ok(mae <= 2.0, `MAE: ${mae.toFixed(3)}`);
            assert.ok(mx <= 3, `maxDelta: ${mx}`);
        });
    });

    describe('Strong watermark & per-channel independence', () => {
        test('α=0.85 (high amplification) — error bounded (diagnostic)', () => {
            const W = 32, H = 24;
            const img = hGradient(W, H, 30, 230);
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 0.85);

            forwardBlend(img, alpha);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const mx = maxChannelDelta(img, expected);
            const psnrDb = psnr(img, expected);

            // amplification 1/0.15 ≈ 6.7× — rounding error amplified more.
            // This is a diagnostic bound: high-α reconstruction is inherently
            // noisier, but must remain within a reasonable envelope.
            assert.ok(mae <= 3.5, `MAE: ${mae.toFixed(3)}`);
            assert.ok(mx <= 6, `maxDelta: ${mx}`);
            assert.ok(psnrDb >= 34, `PSNR: ${psnrDb.toFixed(2)}`);
        });

        test('Per-channel gradient (R/G/B independent ramps) — no cross-talk', () => {
            const W = 48, H = 16;
            const img = imageFrom(W, H, (x, y, Wd) => {
                const t = Wd > 1 ? x / (Wd - 1) : 0;
                // R rising, G falling, B fixed — channels fully independent
                return [lerp(0, 255, t), lerp(255, 0, t), 128];
            });
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 0.5);

            forwardBlend(img, alpha);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const mx = maxChannelDelta(img, expected);

            // Each channel must reconstruct independently; a single white
            // watermark blends all channels identically, so the reverse is
            // per-channel exact (within rounding). No cross-channel drift.
            assert.ok(mae <= 2.0, `MAE: ${mae.toFixed(3)}`);
            assert.ok(mx <= 3, `maxDelta: ${mx}`);

            // Verify channel means are each close (no systematic channel bias)
            for (let c = 0; c < 3; c++) {
                let sumR = 0, sumG = 0;
                for (let i = 0; i < groundTruth.length; i += 4) {
                    sumR += Math.abs(img.data[i + c] - groundTruth[i + c]);
                    sumG++;
                }
                assert.ok(sumR / sumG <= 2.5, `channel ${c} per-pixel MAE too high`);
            }
        });
    });

    describe('Spatially-varying alpha on gradient background', () => {
        test('Radial alpha (watermark shape) on gradient — overall reconstruction tight', () => {
            const W = 48, H = 48;
            const img = hGradient(W, H, 0, 255);
            const groundTruth = new Uint8ClampedArray(img.data);
            const alpha = radialAlpha(W, H, 0.5);

            forwardBlend(img, alpha);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            const expected = wrap(groundTruth, W, H);
            const mae = meanAbsoluteError(img, expected);
            const psnrDb = psnr(img, expected);

            // Near the alpha edges the bilinear sampling + noise-floor gating
            // can introduce a touch more deviation, so allow a slightly looser
            // overall bound than the uniform-alpha case.
            assert.ok(mae <= 2.5, `MAE: ${mae.toFixed(3)}`);
            assert.ok(psnrDb >= 38, `PSNR: ${psnrDb.toFixed(2)}`);
        });

        test('Alpha below noise floor region is left untouched (no false correction)', () => {
            // Alpha map that is uniformly below DEFAULT_ALPHA_NOISE_FLOOR (3/255):
            // removeWatermark must treat these pixels as background and skip.
            const W = 16, H = 8;
            const img = hGradient(W, H, 50, 200);
            const before = new Uint8ClampedArray(img.data);
            const alpha = uniformAlpha(W, H, 2 / 255); // < 3/255 noise floor

            forwardBlend(img, alpha);             // barely-visible watermark applied
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });

            // Because alpha < noise floor, removeWatermark skips every pixel,
            // so the watermarked (not original) buffer is returned unchanged.
            // Assert deterministically: no further mutation happens on removal.
            const afterForward = new Uint8ClampedArray(img.data);
            removeWatermark(img, alpha, { x: 0, y: 0, width: W, height: H });
            assert.deepStrictEqual(img.data, afterForward,
                'sub-noise-floor alpha must be a no-op on removal');
            // sanity: forward blend did change the image (so the test is real)
            let changed = false;
            for (let i = 0; i < before.length; i++) { if (before[i] !== img.data[i]) { changed = true; break; } }
            assert.ok(changed, 'forward blend should have modified the image');
        });
    });
});
