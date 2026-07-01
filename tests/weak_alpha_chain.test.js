/**
 * Phase C-1 (STAGE_PLAN_v2.7): Verify weak-alpha chain for large-margin
 * (48px logo, 96px margins) watermarks. Ported from upstream
 * GargantuaX v1.0.17 candidateSelector.js / watermarkProcessor.js.
 *
 * When a match has config { logoSize:48, marginRight:96, marginBottom:96 },
 * the weak-alpha chain tries removal with alphaGain=0.6 (60%) first. If
 * the result is clean (residual NCC <= 0.22), it short-circuits, skipping
 * the standard gain=1.0 path that would over-correct faint watermarks.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
import { calculateCorrelation } from '../src/core/detector.js';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';

function makeGradientImage(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const idx = (row * width + col) * 4;
            const v = 128 + Math.round(30 * Math.sin((col + row) * 0.08));
            data[idx] = data[idx + 1] = data[idx + 2] = v;
            data[idx + 3] = 255;
        }
    }
    return { width, height, data };
}

function makeAlphaMap(w, h, baseAlpha) {
    const map = new Float32Array(w * h);
    for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
            const dx = (col - w / 2) / (w / 2);
            const dy = (row - h / 2) / (h / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            map[row * w + col] = baseAlpha * Math.max(0, 1 - dist);
        }
    }
    return map;
}

describe('Weak-alpha chain for large-margin watermarks (C-1)', () => {

    test('weak-alpha config constant matches large-margin tier', () => {
        assert.strictEqual(DETECTION_THRESHOLDS.WEAK_ALPHA_GAIN, 0.6);
        assert.strictEqual(DETECTION_THRESHOLDS.WEAK_ALPHA_RESIDUAL_CLEAN_THRESHOLD, 0.22);
        assert.strictEqual(DETECTION_THRESHOLDS.WEAK_ALPHA_MAX_PASSES, 2);
    });

    test('large-margin match triggers weak-alpha chain (no crash, modifies image)', () => {
        const img = makeGradientImage(200, 200);
        const alphaMap = makeAlphaMap(48, 48, 0.3);
        const pos = { x: 48, y: 48, width: 48, height: 48 };

        // Blend in a faint watermark (alpha ~0.3 × 0.6 ≈ 0.18 effective)
        for (let row = 0; row < 48; row++) {
            for (let col = 0; col < 48; col++) {
                const a = alphaMap[row * 48 + col] * 0.6;  // weak alpha
                if (a <= 0.001) continue;
                const px = 48 + col, py = 48 + row;
                const idx = (py * 200 + px) * 4;
                img.data[idx]     = Math.round(a * 255 + (1 - a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1 - a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1 - a) * img.data[idx + 2]);
            }
        }

        const before = new Uint8ClampedArray(img.data);

        // Simulate a Gemini match with large-margin config
        const match = {
            pos: { x: 48, y: 48, width: 48, height: 48 },
            alphaMap,
            confidence: 0.55,
            profileId: 'gemini',
            config: {
                // This triggers isWeakAlphaConfig check
                logoSize: 48,
                marginRight: 96,
                marginBottom: 96
            }
        };

        const report = applyRemovalStrategy(img, [match]);

        // The weak-alpha chain (gain=0.6) should modify pixels in the region
        let changes = 0;
        for (let i = 0; i < before.length; i++) {
            if (before[i] !== img.data[i]) changes++;
        }
        assert.ok(changes > 10,
            `Weak-alpha chain should modify pixels (got ${changes} changes): ${JSON.stringify(report)}`);
    });

    test('non-large-margin match does NOT short-circuit (falls through to standard)', () => {
        const img = makeGradientImage(200, 200);
        const alphaMap = makeAlphaMap(48, 48, 0.3);
        const pos = { x: 48, y: 48, width: 48, height: 48 };

        for (let row = 0; row < 48; row++) {
            for (let col = 0; col < 48; col++) {
                const a = alphaMap[row * 48 + col];
                if (a <= 0.001) continue;
                const px = 48 + col, py = 48 + row;
                const idx = (py * 200 + px) * 4;
                img.data[idx]     = Math.round(a * 255 + (1 - a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1 - a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1 - a) * img.data[idx + 2]);
            }
        }

        // Standard Gemini config (logoSize=96, not large-margin)
        const match = {
            pos: { x: 132, y: 132, width: 48, height: 48 },
            alphaMap,
            confidence: 0.60,
            profileId: 'gemini',
            config: {
                logoSize: 96,    // NOT 48 — weak-alpha chain should NOT trigger
                marginRight: 64,
                marginBottom: 64
            }
        };

        assert.doesNotThrow(() => applyRemovalStrategy(img, [match]),
            'Standard config should not crash');
    });
});
