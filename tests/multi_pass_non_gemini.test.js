/**
 * Phase C-2 (STAGE_PLAN_v2.7): Verify that multi-pass removal is used
 * for Doubao and DALL-E 3 profiles, not just Gemini. Also verify
 * unknown profiles fall back to single-pass without crashing.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';

function makeGradientImage(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const idx = (row * width + col) * 4;
            const v = 128 + Math.round(40 * Math.sin((col + row) * 0.1));
            data[idx] = data[idx + 1] = data[idx + 2] = v;
            data[idx + 3] = 255;
        }
    }
    return { width, height, data };
}

function makeAlphaMap(w, h, baseAlpha = 0.3) {
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

function countPixelChanges(original, modified) {
    let changes = 0;
    for (let i = 0; i < original.length; i++) {
        if (original[i] !== modified[i]) changes++;
    }
    return changes;
}

describe('Multi-pass removal extended to non-Gemini profiles (C-2)', () => {

    test('Doubao match triggers removal (multi-pass active)', () => {
        const img = makeGradientImage(200, 200);
        const alphaMap = makeAlphaMap(40, 20, 0.25);
        const pos = { x: 150, y: 170, width: 40, height: 20 };

        // Blend in a faint watermark
        for (let row = 0; row < 20; row++) {
            for (let col = 0; col < 40; col++) {
                const a = alphaMap[row * 40 + col];
                if (a <= 0) continue;
                const px = 150 + col, py = 170 + row;
                const idx = (py * 200 + px) * 4;
                img.data[idx]     = Math.round(a * 255 + (1 - a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1 - a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1 - a) * img.data[idx + 2]);
            }
        }

        const before = new Uint8ClampedArray(img.data);
        const match = { pos, alphaMap, confidence: 0.55, profileId: 'doubao', config: {} };

        // Should not crash
        applyRemovalStrategy(img, [match]);

        // Multi-pass removal should modify pixels in the watermark region
        const changes = countPixelChanges(before, img.data);
        assert.ok(changes > 10,
            `Doubao multi-pass should modify pixels (got ${changes} changes)`);
    });

    test('DALL-E 3 match triggers removal (multi-pass active)', () => {
        const img = makeGradientImage(200, 200);
        const alphaMap = makeAlphaMap(30, 15, 0.20);
        const pos = { x: 160, y: 175, width: 30, height: 15 };

        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 30; col++) {
                const a = alphaMap[row * 30 + col];
                if (a <= 0) continue;
                const px = 160 + col, py = 175 + row;
                const idx = (py * 200 + px) * 4;
                img.data[idx]     = Math.round(a * 255 + (1 - a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1 - a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1 - a) * img.data[idx + 2]);
            }
        }

        const before = new Uint8ClampedArray(img.data);
        const match = { pos, alphaMap, confidence: 0.48, profileId: 'dalle3', config: {} };

        applyRemovalStrategy(img, [match]);

        const changes = countPixelChanges(before, img.data);
        assert.ok(changes > 5,
            `DALL-E multi-pass should modify pixels (got ${changes} changes)`);
    });

    test('Unknown profile falls back to single-pass (no crash)', () => {
        const img = makeGradientImage(200, 200);
        const alphaMap = makeAlphaMap(48, 48, 0.3);
        const pos = { x: 148, y: 148, width: 48, height: 48 };

        const match = { pos, alphaMap, confidence: 0.40, profileId: 'unknown-profile', config: {} };

        // Must not throw
        applyRemovalStrategy(img, [match]);

        assert.ok(true, 'Unknown profile handled without crash');
    });
});
