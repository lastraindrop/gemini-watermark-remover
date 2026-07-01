/**
 * Missed-Detection Regression: Offset Tolerance
 *
 * Verifies that watermarks shifted from the standard Gemini anchor are
 * still detected by the full pipeline (catalog probe → jitter → coarse
 * relocation → adaptive/global fallback), and that detected coordinates
 * track the true offset while staying inside the image bounds.
 *
 * Guards against regressions in:
 *  - coarse relocation scan (±16px, step 4)
 *  - expanded jitter range (JITTER_RANGE ≥ 10)
 *  - raised isNearExpectedAnchor position tolerance
 *  - sub-pixel parabolic interpolation
 *
 * Uses synthetic ImageData + direct detectProfileWatermarks API.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectProfileWatermarks } from '../src/core/detectionPipeline.js';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';
import {
    createMockImageData,
    createMockAlphaMap,
    applyWatermark,
    resolvePos
} from './test_utils.js';

/**
 * Deterministic alpha-map provider. createMockAlphaMap is seed-free and
 * fully deterministic, so a freshly generated map for size N is identical
 * to the one injected into the image.
 */
function syntheticAlphaProvider() {
    return async (key, w, h) => {
        const sz = parseInt(String(key)) || w || 96;
        const realH = h || sz;
        return {
            data: createMockAlphaMap(sz, realH),
            width: sz,
            height: realH,
            assetKey: String(key)
        };
    };
}

/** Invariant: candidate region lies inside the image (sub-pixel tolerant). */
function assertInBounds(pos, imgW, imgH, label) {
    const x0 = Math.floor(pos.x);
    const y0 = Math.floor(pos.y);
    assert.ok(x0 >= 0, `${label}: floor(x)=${x0} must be >= 0`);
    assert.ok(y0 >= 0, `${label}: floor(y)=${y0} must be >= 0`);
    assert.ok(x0 + pos.width <= imgW, `${label}: floor(x)+width exceeds ${imgW}`);
    assert.ok(y0 + pos.height <= imgH, `${label}: floor(y)+height exceeds ${imgH}`);
}

describe('Missed-Detection Regression: Offset Tolerance', () => {
    const W = 1024, H = 1024;

    describe('watermark offset from standard anchor is still detected', () => {
        const offsets = [
            { dx: 0, dy: 0, label: 'baseline (no offset)' },
            { dx: 3, dy: 0, label: '+3px x' },
            { dx: 0, dy: 3, label: '+3px y' },
            { dx: -3, dy: 0, label: '-3px x' },
            { dx: 0, dy: -3, label: '-3px y' },
            { dx: 5, dy: 5, label: '+5px diagonal' },
            { dx: 8, dy: 3, label: '+8x +3y' },
            { dx: 12, dy: 0, label: '+12px x (coarse relocation)' },
            { dx: 0, dy: 12, label: '+12px y (coarse relocation)' },
            { dx: -10, dy: -10, label: '-10px diagonal' }
        ];

        for (const { dx, dy, label } of offsets) {
            test(`offset (${label}) detected with in-bounds coordinates`, async () => {
                const img = createMockImageData(W, H, 'noise', 128);
                const basePos = resolvePos(W, H, 'gemini');
                const alphaMap = createMockAlphaMap(basePos.width, basePos.height);
                applyWatermark(
                    img,
                    basePos.x + dx,
                    basePos.y + dy,
                    basePos.width,
                    basePos.height,
                    alphaMap
                );

                const result = await detectProfileWatermarks({
                    imageData: img,
                    profileId: 'gemini',
                    getAlphaMap: syntheticAlphaProvider(),
                    options: { deepScan: true }
                });

                assert.ok(result.winner, `${label}: winner is null (missed detection): ${JSON.stringify(result.trace)}`);
                assert.ok(
                    result.confidence >= DETECTION_THRESHOLDS.FINAL_ANCHORED,
                    `${label}: confidence ${result.confidence.toFixed(3)} < FINAL_ANCHORED ${DETECTION_THRESHOLDS.FINAL_ANCHORED}`
                );
                assertInBounds(result.winner.pos, W, H, label);
            });
        }
    });

    describe('detected position tracks true offset within jitter tolerance', () => {
        // Tracking is verified for positive offsets where the injected-size
        // template reliably wins the probe. Negative offsets can trigger
        // multi-template size ambiguity (a smaller nested template scores
        // higher), which is valid detection behavior covered by the
        // "is detected" group above — position tracking is only meaningful
        // when the winner uses the same template size as the injected mark.
        for (const { dx, dy, label } of [
            { dx: 5, dy: 5, label: '+5px diagonal' },
            { dx: 10, dy: 0, label: '+10px x' },
            { dx: 7, dy: 7, label: '+7px diagonal' }
        ]) {
            test(`position tracks offset (${label}) when same-size template wins`, async () => {
                const img = createMockImageData(W, H, 'noise', 128);
                const basePos = resolvePos(W, H, 'gemini');
                const alphaMap = createMockAlphaMap(basePos.width, basePos.height);
                applyWatermark(
                    img,
                    basePos.x + dx,
                    basePos.y + dy,
                    basePos.width,
                    basePos.height,
                    alphaMap
                );

                const result = await detectProfileWatermarks({
                    imageData: img,
                    profileId: 'gemini',
                    getAlphaMap: syntheticAlphaProvider(),
                    options: { deepScan: true }
                });

                assert.ok(result.winner, `${label}: missed detection: ${JSON.stringify(result.trace)}`);
                // When the winner matches the injected template size, the
                // detected position must track the true offset.
                if (result.winner.pos.width === basePos.width) {
                    const detectedDx = result.winner.pos.x - basePos.x;
                    const detectedDy = result.winner.pos.y - basePos.y;
                    const tol = DETECTION_THRESHOLDS.JITTER_RANGE + 2;
                    assert.ok(
                        Math.abs(detectedDx - dx) <= tol,
                        `${label}: x error ${(detectedDx - dx).toFixed(2)} > ${tol}`
                    );
                    assert.ok(
                        Math.abs(detectedDy - dy) <= tol,
                        `${label}: y error ${(detectedDy - dy).toFixed(2)} > ${tol}`
                    );
                } else {
                    // Different template size won — verify the detected region
                    // still overlaps the true watermark footprint (no miss).
                    const wp = result.winner.pos;
                    const overlapX = Math.max(0, Math.min(wp.x + wp.width, basePos.x + dx + basePos.width) - Math.max(wp.x, basePos.x + dx));
                    const overlapY = Math.max(0, Math.min(wp.y + wp.height, basePos.y + dy + basePos.height) - Math.max(wp.y, basePos.y + dy));
                    assert.ok(
                        overlapX > 0 && overlapY > 0,
                        `${label}: winner region does not overlap true watermark footprint`
                    );
                }
            });
        }
    });

    describe('offset toward image edge stays in-bounds and detectable', () => {
        test('watermark shifted toward bottom-right edge', async () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const basePos = resolvePos(W, H, 'gemini');
            const alphaMap = createMockAlphaMap(basePos.width, basePos.height);
            // +15px toward the edge (reduces the margin but stays in-bounds).
            applyWatermark(img, basePos.x + 15, basePos.y + 15, basePos.width, basePos.height, alphaMap);

            const result = await detectProfileWatermarks({
                imageData: img,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.winner, 'edge-shifted watermark should be detected');
            assertInBounds(result.winner.pos, W, H, 'edge-shift');
        });

        test('watermark shifted toward top-left (negative margin direction)', async () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const basePos = resolvePos(W, H, 'gemini');
            const alphaMap = createMockAlphaMap(basePos.width, basePos.height);
            // -15px away from the edge (deeper into the image).
            applyWatermark(img, basePos.x - 15, basePos.y - 15, basePos.width, basePos.height, alphaMap);

            const result = await detectProfileWatermarks({
                imageData: img,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.winner, 'inward-shifted watermark should be detected');
            assertInBounds(result.winner.pos, W, H, 'inward-shift');
        });
    });

    describe('offset does not produce spurious out-of-bounds matches', () => {
        test('every match for an offset watermark satisfies coordinate invariants', async () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const basePos = resolvePos(W, H, 'gemini');
            const alphaMap = createMockAlphaMap(basePos.width, basePos.height);
            applyWatermark(img, basePos.x + 9, basePos.y + 6, basePos.width, basePos.height, alphaMap);

            const result = await detectProfileWatermarks({
                imageData: img,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.matches.length > 0);
            for (const m of result.matches) {
                assert.ok(m.pos.width > 0 && m.pos.height > 0, 'dimensions must be positive');
                assertInBounds(m.pos, W, H, `match(src=${m.source})`);
            }
        });
    });
});
