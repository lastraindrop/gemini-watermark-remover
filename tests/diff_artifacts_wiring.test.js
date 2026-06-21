/**
 * P5 (v2.7): assessRemovalDiffArtifacts wiring.
 *
 * Verifies that applyRemovalStrategy attaches diffArtifacts to matches
 * after removal, providing post-removal quality metrics.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';

function makeGradientImage(w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            const idx = (r * w + c) * 4;
            const v = 128 + Math.round(30 * Math.sin((c + r) * 0.08));
            data[idx] = data[idx+1] = data[idx+2] = v;
            data[idx+3] = 255;
        }
    }
    return { width: w, height: h, data };
}

function makeAlphaMap(w, h, baseAlpha = 0.3) {
    const map = new Float32Array(w * h);
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            const dx = (c - w/2) / (w/2);
            const dy = (r - h/2) / (h/2);
            map[r * w + c] = baseAlpha * Math.max(0, 1 - Math.sqrt(dx*dx + dy*dy));
        }
    }
    return map;
}

describe('assessRemovalDiffArtifacts wiring (P5)', () => {

    test('match object gets diffArtifacts attached after removal', () => {
        const img = makeGradientImage(200, 200);
        const alphaMap = makeAlphaMap(48, 48, 0.3);
        const pos = { x: 148, y: 148, width: 48, height: 48 };

        // Blend watermark
        for (let r = 0; r < 48; r++) {
            for (let c = 0; c < 48; c++) {
                const a = alphaMap[r * 48 + c];
                if (a <= 0.001) continue;
                const idx = ((148 + r) * 200 + (148 + c)) * 4;
                img.data[idx]     = Math.round(a * 255 + (1-a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1-a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1-a) * img.data[idx + 2]);
            }
        }

        const match = {
            pos, alphaMap, confidence: 0.55,
            profileId: 'gemini',
            config: { logoSize: 96, marginRight: 64, marginBottom: 64 }
        };

        applyRemovalStrategy(img, [match]);

        // diffArtifacts should be attached to the match object
        assert.ok(match.diffArtifacts, 'diffArtifacts should be attached to match');
        assert.ok(typeof match.diffArtifacts.score === 'number',
            'diffArtifacts.score should be a number');
        assert.ok(typeof match.diffArtifacts.streakCount === 'number',
            'diffArtifacts.streakCount should be a number');
        assert.ok(typeof match.diffArtifacts.hasBanding === 'boolean',
            'diffArtifacts.hasBanding should be a boolean');
    });

    test('diffArtifacts score is in valid range [0, 1]', () => {
        const img = makeGradientImage(200, 200);
        const alphaMap = makeAlphaMap(48, 48, 0.25);
        const pos = { x: 148, y: 148, width: 48, height: 48 };

        for (let r = 0; r < 48; r++) {
            for (let c = 0; c < 48; c++) {
                const a = alphaMap[r * 48 + c];
                if (a <= 0.001) continue;
                const idx = ((148 + r) * 200 + (148 + c)) * 4;
                img.data[idx]     = Math.round(a * 255 + (1-a) * img.data[idx]);
                img.data[idx + 1] = Math.round(a * 255 + (1-a) * img.data[idx + 1]);
                img.data[idx + 2] = Math.round(a * 255 + (1-a) * img.data[idx + 2]);
            }
        }

        const match = {
            pos, alphaMap, confidence: 0.50,
            profileId: 'gemini',
            config: { logoSize: 96, marginRight: 64, marginBottom: 64 }
        };

        applyRemovalStrategy(img, [match]);

        assert.ok(match.diffArtifacts.score >= 0 && match.diffArtifacts.score <= 1,
            `score should be in [0,1] (got ${match.diffArtifacts.score})`);
    });
});
