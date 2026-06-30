/**
 * Missed-Detection Regression: Sub-pixel Position Behavior
 *
 * Verifies calculateProbeConfidence sub-pixel parabolic refinement
 * (v2.7 Fix-1) preserves coordinate invariants:
 *  - returned x/y are finite numbers
 *  - refined region [floor(x), floor(x)+width] stays inside the image
 *  - jitter + sub-pixel tracks a small integer offset toward the truth
 *  - boundary probes (corner-anchored watermarks) do not crash
 *  - uniform (no-watermark) image does not inflate a spurious sub-pixel peak
 *
 * Uses synthetic ImageData + direct calculateProbeConfidence API on small
 * (300×300) images to keep the unit group fast.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateProbeConfidence } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Missed-Detection Regression: Sub-pixel Position', () => {
    const W = 300, H = 300;
    const SIZE = 48;

    describe('refined position invariants', () => {
        test('returned position is finite and region stays in-bounds', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(SIZE, SIZE);
            applyWatermark(img, 200, 200, SIZE, SIZE, alphaMap);

            const pos = { x: 200, y: 200, width: SIZE, height: SIZE };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

            assert.ok(Number.isFinite(result.x), 'x must be finite');
            assert.ok(Number.isFinite(result.y), 'y must be finite');
            assert.ok(Number.isFinite(result.confidence), 'confidence must be finite');

            const x0 = Math.floor(result.x);
            const y0 = Math.floor(result.y);
            assert.ok(x0 >= 0, `floor(x)=${x0} must be >= 0`);
            assert.ok(y0 >= 0, `floor(y)=${y0} must be >= 0`);
            assert.ok(x0 + SIZE <= W, `floor(x)+size=${x0 + SIZE} must be <= ${W}`);
            assert.ok(y0 + SIZE <= H, `floor(y)+size=${y0 + SIZE} must be <= ${H}`);
        });

        test('small integer offset shifts detected position toward truth', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(SIZE, SIZE);
            // Place watermark +2px; probe at nominal — jitter+subpixel should follow.
            applyWatermark(img, 202, 202, SIZE, SIZE, alphaMap);

            const pos = { x: 200, y: 200, width: SIZE, height: SIZE };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

            assert.ok(
                result.confidence > 0,
                `confidence should be positive (got ${result.confidence.toFixed(3)})`
            );
            // Detected position should move toward the +2px truth, not away.
            assert.ok(result.x >= 200, `x (${result.x}) should shift toward 202`);
            assert.ok(result.y >= 200, `y (${result.y}) should shift toward 202`);
            // And remain within a few px of the true center.
            assert.ok(Math.abs(result.x - 202) <= 4, `x drift ${result.x - 202} too large`);
            assert.ok(Math.abs(result.y - 202) <= 4, `y drift ${result.y - 202} too large`);

            // In-bounds invariant still holds after refinement.
            const x0 = Math.floor(result.x);
            const y0 = Math.floor(result.y);
            assert.ok(x0 + SIZE <= W && y0 + SIZE <= H, 'refined region exceeds bounds');
        });

        test('sub-pixel offset is clamped (does not drift beyond ±0.5px of peak)', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(SIZE, SIZE);
            applyWatermark(img, 200, 200, SIZE, SIZE, alphaMap);

            const pos = { x: 200, y: 200, width: SIZE, height: SIZE };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

            // The fractional refinement is clamped to ±0.5 around the integer
            // peak found by jitter. Therefore result.{x,y} must lie within
            // [probeBase - jitter - 0.5, probeBase + jitter + 0.5].
            const lower = 200 - 6 - 0.5;
            const upper = 200 + 6 + 0.5;
            assert.ok(result.x >= lower && result.x <= upper, `x=${result.x} outside clamp band`);
            assert.ok(result.y >= lower && result.y <= upper, `y=${result.y} outside clamp band`);
        });
    });

    describe('boundary robustness', () => {
        test('probe at top-left corner does not crash', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(SIZE, SIZE);
            applyWatermark(img, 0, 0, SIZE, SIZE, alphaMap);

            const pos = { x: 0, y: 0, width: SIZE, height: SIZE };
            // ±1px neighbor sampling at the corner is OOB-safe (skipped),
            // so the call must complete and return finite values.
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(Number.isFinite(result.x), 'corner x must be finite');
            assert.ok(Number.isFinite(result.y), 'corner y must be finite');
        });

        test('probe at bottom-right corner does not crash and stays in-bounds', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(SIZE, SIZE);
            const bx = W - SIZE, by = H - SIZE;
            applyWatermark(img, bx, by, SIZE, SIZE, alphaMap);

            const pos = { x: bx, y: by, width: SIZE, height: SIZE };
            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });
            assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
            // Refinement is clamped to ±0.5 around the jitter peak. The true
            // watermark sits exactly at the corner, so the peak is at (bx,by)
            // and the refined region cannot exceed bounds.
            const x0 = Math.floor(result.x);
            const y0 = Math.floor(result.y);
            assert.ok(x0 + SIZE <= W, `corner probe x+size=${x0 + SIZE} > ${W}`);
            assert.ok(y0 + SIZE <= H, `corner probe y+size=${y0 + SIZE} > ${H}`);
        });
    });

    describe('low-confidence gating skips refinement gracefully', () => {
        test('uniform image yields low confidence without spurious peak', () => {
            const img = createMockImageData(W, H, 'solid', 128);
            const alphaMap = createMockAlphaMap(SIZE, SIZE);
            const pos = { x: 200, y: 200, width: SIZE, height: SIZE };

            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

            // Solid background: varI ≈ 0 → NCC fallback (~0.10). Interpolation
            // gate (conf > 0.10) is borderline, but result must not be a
            // high-confidence false positive.
            assert.ok(
                result.confidence <= 0.30,
                `uniform image confidence ${result.confidence.toFixed(3)} unexpectedly high`
            );
            assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
        });

        test('non-watermark noise image does not inflate confidence', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const alphaMap = createMockAlphaMap(SIZE, SIZE);
            const pos = { x: 200, y: 200, width: SIZE, height: SIZE };
            // NO watermark applied — should not correlate strongly.

            const result = calculateProbeConfidence(img, pos, alphaMap, 'gemini', { deepScan: true });

            assert.ok(
                result.confidence < 0.25,
                `clean noise produced confidence ${result.confidence.toFixed(3)} (false positive)`
            );
        });
    });
});
