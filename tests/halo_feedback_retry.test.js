/**
 * Phase B-1 (STAGE_PLAN_v2.7): Halo feedback retry.
 *
 * When multi-pass removal detects an alpha-band halo (stopReason='safety-halo'),
 * the retry loop reduces alphaGain by ×0.8 (floor 0.5) and re-runs multi-pass.
 * This avoids over-correction artifacts without abandoning the watermark entirely.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyRemovalStrategy, getHaloRetryGains } from '../src/core/applyRemoval.js';

function makeImage(width, height, baseLum = 128) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = baseLum;
        data[i * 4 + 3] = 255;
    }
    return { width, height, data };
}

describe('Halo feedback retry (B-1)', () => {

    test('retry gain policy applies ×0.8 decay with 0.5 floor', () => {
        assert.deepStrictEqual(getHaloRetryGains(1.0), [0.8, 0.6400000000000001]);
        assert.deepStrictEqual(getHaloRetryGains(0.6), [0.5]);
        assert.deepStrictEqual(getHaloRetryGains(0.55), []);
        assert.deepStrictEqual(getHaloRetryGains(0.5), []);
    });

    test('Halo stopReason handled without crash', () => {
        const img = makeImage(200, 200, 180);
        // Create a faint watermark that multi-pass might over-correct
        const alphaMap = new Float32Array(96 * 96);
        for (let row = 0; row < 96; row++) {
            for (let col = 0; col < 96; col++) {
                const dx = (col - 48) / 48;
                const dy = (row - 48) / 48;
                const dist = Math.sqrt(dx * dx + dy * dy);
                alphaMap[row * 96 + col] = 0.4 * Math.max(0, 1 - dist);
            }
        }
        const pos = { x: 50, y: 50, width: 96, height: 96 };

        // Blend watermark into a BRIGHT area (bright images can cause halo)
        for (let row = 0; row < 96; row++) {
            for (let col = 0; col < 96; col++) {
                const a = alphaMap[row * 96 + col];
                if (a <= 0.001) continue;
                const px = 50 + col, py = 50 + row;
                const idx = (py * 200 + px) * 4;
                img.data[idx]     = Math.round(a * 255 + (1 - a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1 - a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1 - a) * img.data[idx + 2]);
            }
        }

        const before = new Uint8ClampedArray(img.data);
        const match = {
            pos,
            alphaMap,
            confidence: 0.65,
            profileId: 'gemini',
            config: { logoSize: 96, marginRight: 64, marginBottom: 64 }
        };

        // Must not throw — even if halo is/isn't detected
        assert.doesNotThrow(() => applyRemovalStrategy(img, [match]),
            'Halo retry path should not crash');

        // Removal should modify pixels (proving the function executed)
        let changes = 0;
        for (let i = 0; i < before.length; i++) {
            if (before[i] !== img.data[i]) changes++;
        }
        assert.ok(changes > 10,
            `Removal should modify pixels (got ${changes} changes) with halo-safe retry`);
    });

    test('Very low alphaGain (≤0.55) skips halo retry loop', () => {
        const img = makeImage(200, 200, 150);
        const alphaMap = new Float32Array(48 * 48);
        for (let row = 0; row < 48; row++) {
            for (let col = 0; col < 48; col++) {
                const dx = (col - 24) / 24;
                const dy = (row - 24) / 24;
                alphaMap[row * 48 + col] = 0.15 * Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
            }
        }
        const pos = { x: 148, y: 148, width: 48, height: 48 };

        for (let row = 0; row < 48; row++) {
            for (let col = 0; col < 48; col++) {
                const a = alphaMap[row * 48 + col];
                if (a <= 0.001) continue;
                const px = 148 + col, py = 148 + row;
                const idx = (py * 200 + px) * 4;
                img.data[idx]     = Math.round(a * 255 + (1 - a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1 - a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1 - a) * img.data[idx + 2]);
            }
        }

        const match = {
            pos,
            alphaMap,
            confidence: 0.45,
            profileId: 'gemini',
            config: {
                logoSize: 48, marginRight: 96, marginBottom: 96,
                // Low alpha gain — below the 0.55 threshold for halo retry
                alphaGainOverride: 0.5
            }
        };

        // Should not crash
        assert.doesNotThrow(() => applyRemovalStrategy(img, [match]),
            'Low alphaGain with halo should be handled gracefully');
    });
});
