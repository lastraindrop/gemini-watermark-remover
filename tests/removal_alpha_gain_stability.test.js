/**
 * Micro-deviation precision regression — alphaGain stability.
 *
 * removeWatermark() accepts an `alphaGain` option that scales the effective
 * alpha used in the reverse-blend. gain=1 must reconstruct the original;
 * gain<1 must under-correct (leave the white watermark partially visible →
 * brighter); gain>1 must over-correct (remove too much → darker). This file
 * pins those monotonicity / determinism / bound invariants so regressions in
 * the gain path are caught as micro-deviations.
 *
 * Pure synthetic ImageData only. No production source modified.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { removeWatermark } from '../src/core/blendModes.js';
import { maxChannelDelta } from './helpers/imageQualityAssertions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function solidImage(w, h, value) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const idx = i << 2;
        data[idx] = data[idx + 1] = data[idx + 2] = value;
        data[idx + 3] = 255;
    }
    return { width: w, height: h, data };
}

/** Forward-blend a white watermark in-place. */
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

/** Mean grayscale luminance of an RGBA buffer (BT.709). */
function meanLum(data) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
        sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        n++;
    }
    return n ? sum / n : 0;
}

const uniformAlpha = (w, h, a) => new Float32Array(w * h).fill(a);

/** Deep-copy of an image-like object. */
function clone(img) {
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** True if every RGB byte is within [0,255] and finite (no NaN). */
function allBytesValid(data) {
    for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const v = data[i + c];
            if (!Number.isFinite(v) || v < 0 || v > 255) return false;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Removal precision — alphaGain stability', () => {

    // Shared fixture: mid-gray original (100) + α=0.5 watermark.
    // Forward watermarked value = round(0.5·255 + 0.5·100) = round(177.5) = 178.
    const W = 32, H = 16;
    const ORIGINAL_VALUE = 100;
    const ALPHA = 0.5;

    /** Fresh watermarked image (original already forward-blended). */
    function freshWatermarked() {
        const img = solidImage(W, H, ORIGINAL_VALUE);
        forwardBlend(img, uniformAlpha(W, H, ALPHA));
        return img;
    }

    test('gain=1.0 reconstructs the original (baseline)', () => {
        const img = freshWatermarked();
        removeWatermark(img, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: 1 });

        const original = solidImage(W, H, ORIGINAL_VALUE);
        const maxErr = maxChannelDelta(img, original);
        assert.ok(maxErr <= 2, `gain=1 max reconstruction error: ${maxErr}`);
    });

    test('gain=0.5 under-corrects → brighter than original (residue)', () => {
        // effectiveAlpha = 0.25; reverse moves toward white → result > original.
        const img = freshWatermarked();
        removeWatermark(img, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: 0.5 });

        const mean = meanLum(img.data);
        // expected ≈ 152 (analysis); definitely brighter than original 100.
        assert.ok(mean > ORIGINAL_VALUE + 20,
            `gain=0.5 mean ${mean.toFixed(1)} should be clearly brighter than ${ORIGINAL_VALUE}`);
        assert.ok(allBytesValid(img.data), 'all bytes must remain valid');
    });

    test('gain=2.0 over-corrects → darker than original', () => {
        // effectiveAlpha = min(1.0, 0.99) = 0.99; reverse clamps toward 0.
        const img = freshWatermarked();
        removeWatermark(img, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: 2 });

        const mean = meanLum(img.data);
        assert.ok(mean < ORIGINAL_VALUE,
            `gain=2.0 mean ${mean.toFixed(1)} should be darker than ${ORIGINAL_VALUE}`);
        assert.ok(allBytesValid(img.data), 'all bytes must remain valid');
    });

    test('monotonicity: mean luminance is non-increasing as gain rises', () => {
        const gains = [0.4, 0.6, 0.85, 1.0, 1.15, 1.3, 1.6, 2.0];
        const means = gains.map(g => {
            const img = freshWatermarked();
            removeWatermark(img, uniformAlpha(W, H, ALPHA),
                { x: 0, y: 0, width: W, height: H }, { alphaGain: g });
            return meanLum(img.data);
        });

        for (let i = 1; i < means.length; i++) {
            assert.ok(means[i] <= means[i - 1] + 1e-6,
                `mean not non-increasing at gain ${gains[i]}: ${means[i].toFixed(2)} > ${means[i - 1].toFixed(2)}`);
        }
        // And the endpoints must be clearly ordered (not just flat).
        assert.ok(means[0] > means[means.length - 1],
            'lowest gain must be brighter than highest gain');
    });

    test('determinism: identical input+gain → byte-identical output', () => {
        const gain = 0.75;
        const a = freshWatermarked();
        const b = freshWatermarked();
        removeWatermark(a, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: gain });
        removeWatermark(b, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: gain });
        assert.deepStrictEqual(a.data, b.data, 'same input+gain must produce identical bytes');
    });

    test('gain continuity: small gain change → small output change (no jumps)', () => {
        // Two nearby gains should not produce wildly different images.
        const g1 = 0.9, g2 = 0.91;
        const a = freshWatermarked();
        const b = freshWatermarked();
        removeWatermark(a, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: g1 });
        removeWatermark(b, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: g2 });

        const maxDelta = maxChannelDelta(a, b);
        // A 0.01 gain shift must not jump by more than a couple of levels.
        assert.ok(maxDelta <= 3, `0.01 gain step caused max delta ${maxDelta}`);
    });

    test('output bounds: all RGB bytes stay in [0,255] across extreme gains', () => {
        for (const g of [0.01, 0.1, 0.5, 1.0, 1.5, 2.0, 5.0]) {
            const img = freshWatermarked();
            removeWatermark(img, uniformAlpha(W, H, ALPHA),
                { x: 0, y: 0, width: W, height: H }, { alphaGain: g });
            assert.ok(allBytesValid(img.data), `invalid bytes at gain=${g}`);
        }
    });

    test('invalid/negative gain falls back to default (gain=1) deterministically', () => {
        // Per blendModes.js: non-finite or <=0 gain → defaults to 1.
        const ref = freshWatermarked();
        removeWatermark(ref, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H });

        for (const bad of [NaN, -1, 0, Infinity, undefined]) {
            const img = freshWatermarked();
            removeWatermark(img, uniformAlpha(W, H, ALPHA),
                { x: 0, y: 0, width: W, height: H }, { alphaGain: bad });
            assert.deepStrictEqual(img.data, ref.data,
                `gain=${bad} should fall back to default gain=1 behavior`);
        }
    });

    test('gain scales the actual blend, not only the gating path', () => {
        // gain=0.5 vs gain=1.0 must yield visibly different reconstructions,
        // proving the gain multiplies the effective alpha in the blend itself.
        const lo = clone(freshWatermarked());
        const hi = clone(freshWatermarked());
        removeWatermark(lo, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: 0.5 });
        removeWatermark(hi, uniformAlpha(W, H, ALPHA), { x: 0, y: 0, width: W, height: H }, { alphaGain: 1.0 });

        let differing = 0;
        for (let i = 0; i < lo.data.length; i += 4) {
            if (Math.abs(lo.data[i] - hi.data[i]) > 2) differing++;
        }
        assert.ok(differing > 0, 'gain=0.5 vs gain=1.0 must produce measurably different output');
    });
});
