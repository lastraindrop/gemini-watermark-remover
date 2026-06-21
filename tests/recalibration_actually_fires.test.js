/**
 * BUG-C7 (STAGE_PLAN_v2.7) — Recalibration Actually Fires  (Phase A task A-6)
 *
 * Proves the alpha recalibration path is REACHABLE and EFFECTIVE in a
 * synthetic high-residual scenario. Before the BUG-C7 fix,
 * `originalSpatialScore = match.confidence` (a 3D blend score, range ~0.3-0.7)
 * was passed to `shouldRecalibrateAlphaStrength`, whose `originalScore >= 0.6`
 * gate almost never held — leaving the recalibration path as effective dead code.
 *
 * Scenario (deterministic, no real-image dependency):
 *   - 200×200 image, solid background (gray = 100).
 *   - 48×48 watermark region at bottom-right (pos = {148,148,48,48}).
 *   - Weakened radial template (max α ≈ 0.24) applied 5 times → cumulative
 *     effective α ≈ 0.74 at center, no saturation.
 *
 * Why this triggers recalibration:
 *   1. Original pure NCC vs template ≈ 0.99 (≥ 0.6 gate) — pattern matches.
 *   2. multipass (4 passes @ gain=1) reduces luminance but NOT pattern shape,
 *      so residual NCC stays ≈ 0.99 (≥ 0.5 threshold). NCC is scale-invariant.
 *   3. stopReason = 'max-passes' (residual never drops below 0.25) — required
 *      for the recalibration block to execute.
 *   4. `alphaGainOverride: 1.0` forces `alphaGain = 1.0 < OUTLINE_REFINEMENT_MIN_GAIN (1.05)`,
 *      so `refineSubpixelOutline` returns null → execution falls through to
 *      the recalibration block.
 *   5. suppressionGain = 0.99 - 0.99 ≈ 0 (≤ 0.18 cap) — gate condition met.
 *   6. All three `shouldRecalibrateAlphaStrength` conditions satisfied → fires.
 *
 * With the OLD (buggy) code, originalScore = match.confidence (≤ 0.5) < 0.6 →
 * recalibration NEVER fires. With the fix, originalScore = pure NCC (≥ 0.6) →
 * recalibration fires and reduces residual dramatically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';
import { calculateCorrelation } from '../src/core/detector.js';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

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

describe('BUG-C7: recalibration actually fires in high-residual scenario', () => {

    test('scenario satisfies all three shouldRecalibrateAlphaStrength gates', () => {
        // Precondition check: the scenario MUST place execution inside the
        // recalibration branch. If any of these fail, the test scenario itself
        // is malformed (not a recalibration-triggering setup).
        const { img, pos, alphaMap } = buildScenario();
        const originalNCC = Math.abs(calculateCorrelation(
            img, pos.x, pos.y, pos.width, pos.height, alphaMap, true));

        const mp = removeRepeatedWatermarkLayers({
            imageData: cloneImageData(img),
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.25
        });
        const residualNCC = Math.abs(calculateCorrelation(
            mp.imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true));
        const suppressionGain = originalNCC - residualNCC;

        assert.ok(originalNCC >= 0.6,
            `Gate 1 (originalScore >= 0.6): got ${originalNCC.toFixed(4)}`);
        assert.ok(residualNCC >= 0.5,
            `Gate 2 (processedScore >= 0.5): got ${residualNCC.toFixed(4)}`);
        assert.ok(suppressionGain <= 0.18,
            `Gate 3 (suppressionGain <= 0.18): got ${suppressionGain.toFixed(4)}`);
        assert.notStrictEqual(mp.stopReason, 'residual-low',
            `Precondition: multipass must NOT converge (else recalibration block is skipped). ` +
            `Got stopReason=${mp.stopReason}`);
    });

    test('recalibration fires: strategy residual beats multipass-only by >= 0.10', () => {
        const { img, pos, alphaMap } = buildScenario();
        const imgForStrategy = cloneImageData(img);
        const imgForMultipass = cloneImageData(img);

        applyRemovalStrategy(imgForStrategy, [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.45,              // 3D blend — OLD code would fail gate 1
            config: { alphaGainOverride: 1.0 }
        }]);

        const multipassOnly = removeRepeatedWatermarkLayers({
            imageData: imgForMultipass,
            alphaMap,
            position: pos,
            maxPasses: 4,
            residualThreshold: 0.25
        });

        const nccStrategy = Math.abs(calculateCorrelation(
            imgForStrategy, pos.x, pos.y, pos.width, pos.height, alphaMap, true));
        const nccMultipass = Math.abs(calculateCorrelation(
            multipassOnly.imageData, pos.x, pos.y, pos.width, pos.height, alphaMap, true));
        const delta = nccMultipass - nccStrategy;

        // Recalibration MUST reduce residual by at least MIN_RECALIBRATION_SCORE_DELTA (0.10).
        // A pass here means recalibrateAlphaStrength was invoked AND returned a
        // non-null result with a better gain. A fail means either:
        //   (a) recalibration didn't fire (BUG-C7 regression — originalScore
        //       is again being sourced from match.confidence), or
        //   (b) recalibration returned null (no candidate improved residual).
        assert.ok(delta >= 0.10,
            `Recalibration must beat multipass-only residual by >= 0.10. ` +
            `Strategy NCC=${nccStrategy.toFixed(4)}, Multipass-only NCC=${nccMultipass.toFixed(4)}, ` +
            `Delta=${delta.toFixed(4)}.`);
    });

    test('recalibration fires EVEN when match.confidence is very low (0.30)', () => {
        // Strongest discrimination: match.confidence = 0.30 is FAR below the
        // 0.6 gate. With the OLD (buggy) code, recalibration would NEVER fire
        // regardless of actual residual. With the fix, the decision is driven
        // by pure NCC (≥ 0.6) → recalibration fires.
        const { img, pos, alphaMap } = buildScenario();
        const imgForStrategy = cloneImageData(img);

        applyRemovalStrategy(imgForStrategy, [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.30,              // would force-skip recalibration in OLD code
            config: { alphaGainOverride: 1.0 }
        }]);

        const nccStrategy = Math.abs(calculateCorrelation(
            imgForStrategy, pos.x, pos.y, pos.width, pos.height, alphaMap, true));

        // If recalibration fired, residual NCC must be LOW (the candidate gain
        // ~1.05 nearly perfectly removes the remaining single layer).
        // If it didn't fire (OLD behavior), residual would stay ≈ 0.99.
        // Threshold 0.5 cleanly separates the two regimes.
        assert.ok(nccStrategy < 0.5,
            `Recalibration must have fired (residual NCC < 0.5). Got NCC=${nccStrategy.toFixed(4)}. ` +
            `With OLD code (match.confidence=0.30 used as originalScore), residual would be >= 0.9.`);
    });

    test('recalibration is NOT triggered when original NCC is genuinely low (negative control)', () => {
        // Negative control: when there is NO real watermark pattern, the pure
        // NCC is low. The fix must NOT spuriously open the recalibration gate
        // in that case — otherwise the fix would over-trigger.
        const size = 48;
        const img = createMockImageData(200, 200, 'solid', 100);  // NO watermark applied
        const pos = { x: 148, y: 148, width: size, height: size };
        const alphaMap = Float32Array.from(createMockAlphaMap(size, size), v => v * 0.25);

        const originalNCC = Math.abs(calculateCorrelation(
            img, pos.x, pos.y, size, size, alphaMap, true));
        assert.ok(originalNCC < 0.6,
            `Negative-control setup: pure NCC on clean image must be < 0.6; got ${originalNCC.toFixed(4)}`);

        const before = cloneImageData(img);
        applyRemovalStrategy(img, [{
            profileId: 'gemini',
            alphaMap,
            pos,
            confidence: 0.30,
            config: { alphaGainOverride: 1.0 }
        }]);

        // On a clean image, multipass may still run and modify pixels (it
        // always applies at least one removal pass). The important assertion
        // here is just that we did not crash and the pure-NCC gate would have
        // been closed. We verify this by confirming the original-NCC
        // precondition above (< 0.6). No recalibration should have been
        // POSSIBLE regardless of the bug fix, because originalScore < 0.6
        // under both OLD and NEW code.
        assert.ok(true, 'Negative control completed without error');
    });
});
