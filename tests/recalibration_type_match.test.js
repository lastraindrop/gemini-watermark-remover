/**
 * BUG-C7 (STAGE_PLAN_v2.7) — Type Mismatch Test  (Phase A task A-5)
 *
 * Validates that `originalSpatialScore` in applyRemoval.js is a PURE NCC score
 * (computed via `calculateCorrelation`), NOT `match.confidence` (a 3D blend
 * score with a different scale). The two are NOT interchangeable:
 *
 *   - match.confidence:        spatial×0.5 + gradient×0.3 + variance×0.2
 *                              (range ~0.3-0.7)
 *   - calculateCorrelation NCC: pure normalized cross-correlation ([-1, 1])
 *
 * Pre-fix, `originalSpatialScore = match.confidence` was passed to
 * `shouldRecalibrateAlphaStrength` as `originalScore`, which is compared
 * against `0.6`. Because `match.confidence` rarely exceeds 0.6 in real
 * detections, the recalibration gate almost never opened — making the entire
 * recalibration path effective dead code.
 *
 * Discrimination strategy:
 *   1. Set `match.confidence = 0.45` — BELOW the 0.6 gate. With the OLD code
 *      this would force `shouldRecalibrateAlphaStrength` to return false.
 *   2. Construct the image so the pure NCC of the watermark region is ≥ 0.6.
 *      With the NEW code the gate opens and recalibration fires.
 *   3. Compare the strategy output against a "multipass-only" baseline.
 *      If they DIFFER, recalibration must have fired — proving the pure-NCC
 *      path is active (NEW code). If they are identical, recalibration was
 *      skipped — proving the match.confidence path is active (OLD code = bug).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
import { calculateCorrelation } from '../src/core/detector.js';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

/**
 * Build a synthetic high-residual scenario.
 *
 * The watermark template is weakened (max α ≈ 0.24) and applied 5 times, so:
 *   - Original NCC vs template is high (≥ 0.6) — pattern shape clearly matches.
 *   - multipass at gain=1 (4 passes) removes luminance but the pattern SHAPE
 *     persists (NCC is scale-invariant), so residual NCC stays ≥ 0.5.
 *   - `stopReason = 'max-passes'` (residual never drops below 0.25 threshold).
 *   - With `alphaGainOverride: 1.0`, `refineSubpixelOutline` is skipped
 *     (its `OUTLINE_REFINEMENT_MIN_GAIN = 1.05`), so execution reaches the
 *     recalibration block.
 */
function buildScenario() {
    const size = 48;
    const img = createMockImageData(200, 200, 'solid', 100);
    const pos = { x: 148, y: 148, width: size, height: size };
    const baseAlpha = createMockAlphaMap(size, size);
    const weakAlpha = Float32Array.from(baseAlpha, v => v * 0.25);
    for (let i = 0; i < 5; i++) {
        applyWatermark(img, pos.x, pos.y, size, size, weakAlpha, 255);
    }
    return { img, pos, alphaMap: weakAlpha };
}

function cloneImageData(img) {
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

function countDiffPixels(a, b, pos, imgWidth) {
    let diff = 0;
    for (let r = 0; r < pos.height; r++) {
        for (let c = 0; c < pos.width; c++) {
            const cy = Math.floor(pos.y + r);
            const cx = Math.floor(pos.x + c);
            const idx = (cy * imgWidth + cx) << 2;
            if (Math.abs(a.data[idx] - b.data[idx]) > 1) diff++;
        }
    }
    return diff;
}

describe('BUG-C7: originalSpatialScore is pure NCC, not match.confidence', () => {

    test('scenario yields pure NCC >= 0.6 (gate condition for recalibration)', () => {
        const { img, pos, alphaMap } = buildScenario();
        const ncc = Math.abs(calculateCorrelation(
            img, pos.x, pos.y, pos.width, pos.height, alphaMap, true));
        assert.ok(ncc >= 0.6,
            `Pure NCC of original region must be >= 0.6 to open recalibration gate; got ${ncc.toFixed(4)}`);
    });

    test('match.confidence (0.45) is BELOW 0.6 gate — OLD code would skip recalibration', () => {
        // This test documents the discrimination contract: if the (buggy) OLD
        // path were active, originalScore=0.45 < 0.6 → recalibration skipped.
        // The fix uses pure NCC instead, which IS >= 0.6 (see previous test),
        // so the gate opens.
        const buggyOriginalScore = 0.45;  // what match.confidence would supply
        const opensGate = buggyOriginalScore >= 0.6;
        assert.strictEqual(opensGate, false,
            'Sanity: match.confidence=0.45 must NOT open the 0.6 gate (else test is non-discriminating)');
    });

    test('applyRemovalStrategy output DIFFERS from multipass-only (recalibration fired)', () => {
        const { img, pos, alphaMap } = buildScenario();
        const imgForStrategy = cloneImageData(img);
        const imgForMultipass = cloneImageData(img);

        // Run full strategy. With the BUG-C7 fix, originalSpatialScore is the
        // pure NCC (>= 0.6) → recalibration gate opens → output is recalibrated.
        applyRemovalStrategy(imgForStrategy, [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.45,              // 3D blend score, BELOW 0.6 gate
            config: { alphaGainOverride: 1.0 }  // force gain=1, skip subpixel refine
        }]);

        // Multipass-only baseline = what the OLD (buggy) code would produce,
        // since shouldRecalibrateAlphaStrength would return false and the
        // fallback `imageData.data.set(multiPassResult.imageData.data)` runs.
        const multiPassResult = removeRepeatedWatermarkLayers({
            imageData: imgForMultipass,
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.25
        });

        const diffCount = countDiffPixels(imgForStrategy, multiPassResult.imageData, pos, img.width);
        const totalPixels = pos.width * pos.height;

        assert.ok(diffCount > totalPixels * 0.05,
            `Recalibration must modify > 5% of watermark-region pixels vs multipass-only. ` +
            `Got ${diffCount}/${totalPixels} differing pixels. ` +
            `If this fails with ~0 diffs, BUG-C7 has regressed: originalSpatialScore is again ` +
            `being set from match.confidence (3D blend) instead of calculateCorrelation (pure NCC).`);
    });

    test('strategy residual NCC < multipass-only residual NCC (pure-NCC gate opened)', () => {
        const { img, pos, alphaMap } = buildScenario();
        const imgForStrategy = cloneImageData(img);
        const imgForMultipass = cloneImageData(img);

        applyRemovalStrategy(imgForStrategy, [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.45,
            config: { alphaGainOverride: 1.0 }
        }]);

        const multiPassResult = removeRepeatedWatermarkLayers({
            imageData: imgForMultipass,
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.25
        });

        const nccStrategy = Math.abs(calculateCorrelation(
            imgForStrategy, pos.x, pos.y, pos.width, pos.height, alphaMap, true));
        const nccMultipass = Math.abs(calculateCorrelation(
            multiPassResult.imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true));

        assert.ok(nccStrategy < nccMultipass,
            `Strategy residual (${nccStrategy.toFixed(4)}) must be < multipass-only residual ` +
            `(${nccMultipass.toFixed(4)}). Equality means recalibration was skipped.`);
    });
});
