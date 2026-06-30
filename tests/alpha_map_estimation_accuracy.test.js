/**
 * Micro-deviation precision regression — alpha map estimation accuracy.
 *
 * The removal pipeline estimates alpha in two places:
 *   1. calculateAlphaMap (alphaMap.js) — derives the template alpha from a
 *      captured background using max(R,G,B)/255.
 *   2. estimateAlphaGain (applyRemoval.js) — derives a gain so the template
 *      alpha matches the watermark's *actual* observed strength.
 *
 * Both are inverse problems with ground-truth available on synthetic input.
 * These tests measure estimation error with MAE / exact-formula comparison
 * and pin the gain estimator's recovery behavior. Pure synthetic fixtures
 * only. No production source modified.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { estimateAlphaGain } from '../src/core/applyRemoval.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const Q = 1 / 255; // single-level quantization step

/** Mean absolute error between two float arrays. */
function maeArr(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return a.length ? sum / a.length : 0;
}

/** Build a grayscale ImageData from a per-pixel value function. */
function grayImage(w, h, fn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) << 2;
            const v = Math.max(0, Math.min(255, Math.round(fn(x, y, w, h))));
            data[idx] = data[idx + 1] = data[idx + 2] = v;
            data[idx + 3] = 255;
        }
    }
    return { width: w, height: h, data };
}

/** Build an ImageData from explicit RGB channel functions. */
function rgbImage(w, h, fn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) << 2;
            const [r, g, b] = fn(x, y, w, h);
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
        }
    }
    return { width: w, height: h, data };
}

const bt709 = (r, g, b) => (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
const maxChannel = (r, g, b) => Math.max(r, g, b) / 255;

// ---------------------------------------------------------------------------
// calculateAlphaMap accuracy
// ---------------------------------------------------------------------------

describe('Alpha map estimation accuracy — calculateAlphaMap', () => {

    describe('Ground-truth recovery (grayscale capture)', () => {
        test('Uniform alpha field recovered within 1 quantization step', () => {
            const truth = 0.5;
            const img = grayImage(16, 8, () => truth * 255);
            const est = calculateAlphaMap(img);
            assert.ok(maeArr(est, new Float32Array(16 * 8).fill(truth)) <= Q,
                `MAE > 1/255: ${maeArr(est, new Float32Array(16 * 8).fill(truth))}`);
        });

        test('Linear alpha ramp recovered within ~1 step (MAE)', () => {
            const W = 40, H = 8;
            const img = grayImage(W, H, (x, y, Wd) => (x / (Wd - 1)) * 255);
            const est = calculateAlphaMap(img);
            const truth = new Float32Array(W * H);
            for (let i = 0; i < W * H; i++) truth[i] = (i % W) / (W - 1);
            assert.ok(maeArr(est, truth) <= Q, `ramp MAE: ${maeArr(est, truth)}`);
        });

        test('Random alpha field recovered within 1 step (max error)', () => {
            // Deterministic pseudo-random ground truth.
            const W = 24, H = 12;
            const truth = new Float32Array(W * H);
            const img = grayImage(W, H, (x, y) => {
                const t = ((x * 12.9898 + y * 78.233) % 1 + 1) % 1; // [0,1)
                truth[y * W + x] = t;
                return t * 255;
            });
            const est = calculateAlphaMap(img);
            let maxErr = 0;
            for (let i = 0; i < est.length; i++) {
                const d = Math.abs(est[i] - truth[i]);
                if (d > maxErr) maxErr = d;
            }
            assert.ok(maxErr <= Q, `max error > 1/255: ${maxErr}`);
        });
    });

    describe('Max-channel formula exactness', () => {
        test('Mixed-color pixel matches max(R,G,B)/255 exactly', () => {
            const pixels = [
                { r: 128, g: 64, b: 200 },
                { r: 255, g: 128, b: 0 },
                { r: 64, g: 128, b: 255 },
                { r: 10, g: 250, b: 30 }
            ];
            const data = new Uint8ClampedArray(pixels.length * 4);
            pixels.forEach((p, i) => {
                data[i * 4] = p.r; data[i * 4 + 1] = p.g; data[i * 4 + 2] = p.b; data[i * 4 + 3] = 255;
            });
            const est = calculateAlphaMap({ width: pixels.length, height: 1, data });
            for (let i = 0; i < pixels.length; i++) {
                const expected = maxChannel(pixels[i].r, pixels[i].g, pixels[i].b);
                assert.ok(Math.abs(est[i] - expected) < 1e-6,
                    `pixel ${i}: expected ${expected}, got ${est[i]}`);
            }
        });
    });

    describe('Max-channel vs BT.709 luminance estimator comparison', () => {
        test('Max-channel is always >= BT.709 (never underestimates alpha)', () => {
            // The whole point of max-channel: anti-aliased/colored watermark
            // pixels must not be underestimated. Verify the invariant holds.
            const samples = [
                [200, 200, 210], [180, 195, 250], [255, 128, 0],
                [64, 128, 255], [128, 64, 200], [100, 200, 100]
            ];
            for (const [r, g, b] of samples) {
                assert.ok(maxChannel(r, g, b) >= bt709(r, g, b) - 1e-9,
                    `max < bt709 for (${r},${g},${b})`);
            }
        });

        test('Divergence quantified on blue-tinted watermark pixel', () => {
            // (180,195,250): max-channel vs BT.709 differ by > 0.03 — this is
            // the documented reason max-channel is used (BT.709 would
            // systematically under-read alpha on tinted edges).
            const r = 180, g = 195, b = 250;
            const diff = maxChannel(r, g, b) - bt709(r, g, b);
            assert.ok(diff > 0.03, `divergence ${diff.toFixed(4)} should exceed 0.03`);
        });

        test('On pure-gray pixels both estimators agree exactly', () => {
            // Where the watermark is gray (R=G=B), max == luminance, so the
            // choice of estimator is moot — no divergence.
            for (const v of [0, 64, 128, 200, 255]) {
                assert.ok(Math.abs(maxChannel(v, v, v) - bt709(v, v, v)) < 1e-9,
                    `gray ${v}: estimators disagree`);
            }
        });
    });

    describe('Output invariants', () => {
        test('Length matches width*height', () => {
            const img = grayImage(7, 5, () => 128);
            const est = calculateAlphaMap(img);
            assert.ok(est instanceof Float32Array);
            assert.strictEqual(est.length, 7 * 5);
        });

        test('All values in [0,1]', () => {
            const img = rgbImage(6, 4, (x, y) => [
                (x * 43) % 256, (y * 71) % 256, ((x + y) * 29) % 256
            ]);
            const est = calculateAlphaMap(img);
            for (let i = 0; i < est.length; i++) {
                assert.ok(est[i] >= 0 && est[i] <= 1, `out of range at ${i}: ${est[i]}`);
            }
        });
    });
});

// ---------------------------------------------------------------------------
// estimateAlphaGain accuracy
// ---------------------------------------------------------------------------

describe('Alpha map estimation accuracy — estimateAlphaGain recovery', () => {

    /**
     * Build a probe image + template alpha map for a known true watermark gain.
     * Inner disk pixels carry the watermark at actualAlpha = template*trueGain;
     * the outer ring stays at the pure background level so the estimator has
     * background samples to compare against.
     */
    function buildGainProbe({ w, h, template, trueGain, bg }) {
        const alphaMap = new Float32Array(w * h);
        const data = new Uint8ClampedArray(w * h * 4);
        const cx = (w - 1) / 2;
        const cy = (h - 1) / 2;
        const innerR = Math.min(w, h) / 2.5;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                const isInner = dist < innerR;
                alphaMap[i] = isInner ? template : 0;
                const actualA = (isInner ? template : 0) * trueGain;
                const v = Math.round(actualA * 255 + (1 - actualA) * bg);
                data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
                data[i * 4 + 3] = 255;
            }
        }
        return { alphaMap, imageData: { width: w, height: h, data } };
    }

    test('trueGain=1.0 (correct strength) → estimated gain ≈ 1.0', () => {
        const { alphaMap, imageData } = buildGainProbe({
            w: 32, h: 24, template: 0.5, trueGain: 1.0, bg: 128
        });
        const g = estimateAlphaGain(imageData, alphaMap, { x: 0, y: 0, width: 32, height: 24 });
        assert.ok(g >= 0.85 && g <= 1.15, `trueGain=1.0 estimated ${g.toFixed(3)}`);
    });

    test('trueGain=0.5 (faint watermark) → estimated gain ≈ 0.5', () => {
        const { alphaMap, imageData } = buildGainProbe({
            w: 32, h: 24, template: 0.5, trueGain: 0.5, bg: 128
        });
        const g = estimateAlphaGain(imageData, alphaMap, { x: 0, y: 0, width: 32, height: 24 });
        assert.ok(g >= 0.4 && g <= 0.65, `trueGain=0.5 estimated ${g.toFixed(3)}`);
    });

    test('trueGain=0.3 (very faint) → estimated gain ≈ 0.3', () => {
        const { alphaMap, imageData } = buildGainProbe({
            w: 32, h: 24, template: 0.5, trueGain: 0.3, bg: 128
        });
        const g = estimateAlphaGain(imageData, alphaMap, { x: 0, y: 0, width: 32, height: 24 });
        assert.ok(g >= 0.22 && g <= 0.4, `trueGain=0.3 estimated ${g.toFixed(3)}`);
    });

    test('trueGain=2.0 (stronger than template) → estimated gain capped at 2.0', () => {
        const { alphaMap, imageData } = buildGainProbe({
            w: 32, h: 24, template: 0.5, trueGain: 2.0, bg: 128
        });
        const g = estimateAlphaGain(imageData, alphaMap, { x: 0, y: 0, width: 32, height: 24 });
        assert.ok(g >= 1.8, `trueGain=2.0 estimated ${g.toFixed(3)} (expected near/== cap 2.0)`);
        assert.ok(g <= 2.0 + 1e-9, 'gain must respect the 2.0 upper cap');
    });

    test('Monotonicity: estimated gain rises with true watermark strength', () => {
        const means = [];
        for (const tg of [0.3, 0.5, 0.75, 1.0, 1.4]) {
            const { alphaMap, imageData } = buildGainProbe({
                w: 32, h: 24, template: 0.5, trueGain: tg, bg: 128
            });
            means.push(estimateAlphaGain(imageData, alphaMap, { x: 0, y: 0, width: 32, height: 24 }));
        }
        for (let i = 1; i < means.length; i++) {
            assert.ok(means[i] >= means[i - 1] - 1e-6,
                `non-monotonic at index ${i}: ${means[i].toFixed(3)} < ${means[i - 1].toFixed(3)}`);
        }
    });

    test('Fallback: insufficient background samples → returns 1.0', () => {
        // Every pixel has template alpha > 0.15 → no background samples →
        // bgCount < 10 → estimator must fall back to 1.0.
        const w = 20, h = 12;
        const alphaMap = new Float32Array(w * h).fill(0.5);
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 200; // bright watermark
            data[i * 4 + 3] = 255;
        }
        const g = estimateAlphaGain(
            { width: w, height: h, data }, alphaMap, { x: 0, y: 0, width: w, height: h });
        assert.strictEqual(g, 1);
    });

    test('Fallback: all alpha negligible → returns 1.0', () => {
        const w = 16, h = 8;
        const alphaMap = new Float32Array(w * h).fill(0.001); // totalWeight < 0.01
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 128;
            data[i * 4 + 3] = 255;
        }
        const g = estimateAlphaGain(
            { width: w, height: h, data }, alphaMap, { x: 0, y: 0, width: w, height: h });
        assert.strictEqual(g, 1);
    });

    test('Robust across different background levels', () => {
        // The estimator normalizes by (1 − bgMean), so it should recover the
        // same trueGain regardless of the absolute background brightness.
        for (const bg of [40, 128, 220]) {
            const { alphaMap, imageData } = buildGainProbe({
                w: 32, h: 24, template: 0.5, trueGain: 1.0, bg
            });
            const g = estimateAlphaGain(imageData, alphaMap, { x: 0, y: 0, width: 32, height: 24 });
            assert.ok(g >= 0.8 && g <= 1.2,
                `bg=${bg}: estimated ${g.toFixed(3)} drifted from 1.0`);
        }
    });
});
