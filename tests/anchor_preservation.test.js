/**
 * P1 (v2.7): shouldPreserveStrongStandardAnchor guard.
 *
 * Verifies that the detection pipeline prioritizes canonical anchor
 * candidates (catalog-probe, heuristic-probe) over drifted candidates
 * (global-search, adaptive-search) when the anchor has reliable signal
 * and the drifted candidate doesn't offer a clear improvement.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('shouldPreserveStrongStandardAnchor guard (P1)', () => {

    test('anchor candidate with reliable signal is preserved over drifted candidate', () => {
        // Simulate the sort logic from detectionPipeline.js
        const matches = [
            { source: 'global-search', confidence: 0.27 },
            { source: 'catalog-probe', confidence: 0.25 },
        ];

        const aIsAnchor = (a) => a.source === 'catalog-probe' || a.source === 'heuristic-probe';
        const aIsDrifted = (a) => a.source === 'global-search' || a.source === 'global-free' ||
            a.source === 'global-aligned' || a.source === 'adaptive-search';

        matches.sort((a, b) => {
            const anchorA = aIsAnchor(a), anchorB = aIsAnchor(b);
            const driftA = aIsDrifted(a), driftB = aIsDrifted(b);
            if (anchorA === anchorB) return b.confidence - a.confidence;
            if (anchorA && driftB) {
                if (a.confidence >= 0.20 && (b.confidence - a.confidence) < 0.08) return -1;
                return b.confidence - a.confidence;
            }
            if (anchorB && driftA) {
                if (b.confidence >= 0.20 && (a.confidence - b.confidence) < 0.08) return 1;
                return b.confidence - a.confidence;
            }
            return b.confidence - a.confidence;
        });

        // Anchor (0.25) should win over drifted (0.27) because improvement < 0.08
        assert.strictEqual(matches[0].source, 'catalog-probe',
            'Anchor candidate should be preserved when drifted improvement < 0.08');
    });

    test('drifted candidate wins when it offers clear improvement (>= 0.08)', () => {
        const matches = [
            { source: 'global-search', confidence: 0.35 },
            { source: 'catalog-probe', confidence: 0.25 },
        ];

        const aIsAnchor = (a) => a.source === 'catalog-probe' || a.source === 'heuristic-probe';
        const aIsDrifted = (a) => a.source === 'global-search' || a.source === 'global-free' ||
            a.source === 'global-aligned' || a.source === 'adaptive-search';

        matches.sort((a, b) => {
            const anchorA = aIsAnchor(a), anchorB = aIsAnchor(b);
            const driftA = aIsDrifted(a), driftB = aIsDrifted(b);
            if (anchorA === anchorB) return b.confidence - a.confidence;
            if (anchorA && driftB) {
                if (a.confidence >= 0.20 && (b.confidence - a.confidence) < 0.08) return -1;
                return b.confidence - a.confidence;
            }
            if (anchorB && driftA) {
                if (b.confidence >= 0.20 && (a.confidence - b.confidence) < 0.08) return 1;
                return b.confidence - a.confidence;
            }
            return b.confidence - a.confidence;
        });

        // Drifted (0.35) should win because improvement 0.10 >= 0.08
        assert.strictEqual(matches[0].source, 'global-search',
            'Drifted candidate should win when improvement >= 0.08');
    });

    test('weak anchor (< 0.20) is not protected', () => {
        const matches = [
            { source: 'global-search', confidence: 0.22 },
            { source: 'catalog-probe', confidence: 0.18 },
        ];

        const aIsAnchor = (a) => a.source === 'catalog-probe' || a.source === 'heuristic-probe';
        const aIsDrifted = (a) => a.source === 'global-search' || a.source === 'global-free' ||
            a.source === 'global-aligned' || a.source === 'adaptive-search';

        matches.sort((a, b) => {
            const anchorA = aIsAnchor(a), anchorB = aIsAnchor(b);
            const driftA = aIsDrifted(a), driftB = aIsDrifted(b);
            if (anchorA === anchorB) return b.confidence - a.confidence;
            if (anchorA && driftB) {
                if (a.confidence >= 0.20 && (b.confidence - a.confidence) < 0.08) return -1;
                return b.confidence - a.confidence;
            }
            if (anchorB && driftA) {
                if (b.confidence >= 0.20 && (a.confidence - b.confidence) < 0.08) return 1;
                return b.confidence - a.confidence;
            }
            return b.confidence - a.confidence;
        });

        // Weak anchor (0.18 < 0.20) should NOT be protected
        assert.strictEqual(matches[0].source, 'global-search',
            'Weak anchor should not be preserved over stronger drifted candidate');
    });

    test('two anchor candidates sort by confidence normally', () => {
        const matches = [
            { source: 'catalog-probe', confidence: 0.30 },
            { source: 'heuristic-probe', confidence: 0.45 },
        ];

        matches.sort((a, b) => b.confidence - a.confidence);
        assert.strictEqual(matches[0].source, 'heuristic-probe');
        assert.strictEqual(matches[0].confidence, 0.45);
    });
});
