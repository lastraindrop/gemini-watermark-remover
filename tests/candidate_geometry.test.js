import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
    calculateOverlapRatio,
    candidatesOverlap,
    suppressOverlappingCandidates,
    upsertBestOverlappingCandidate
} from '../src/core/candidateGeometry.js';

describe('candidate geometry', () => {
    test('supports direct and match.pos rectangles consistently', () => {
        const direct = { x: 0, y: 0, width: 100, height: 100 };
        const match = { pos: { x: 50, y: 0, width: 100, height: 100 } };
        assert.strictEqual(calculateOverlapRatio(direct, match), 0.5);
        assert.strictEqual(candidatesOverlap(direct, match), true);
    });

    test('suppression keeps independent candidates and the strongest overlap', () => {
        const candidates = [
            { confidence: 0.5, x: 0, y: 0, width: 48, height: 48 },
            { confidence: 0.8, x: 4, y: 4, width: 48, height: 48 },
            { confidence: 0.2, x: 100, y: 100, width: 48, height: 48 }
        ];
        const result = suppressOverlappingCandidates(candidates);
        assert.deepStrictEqual(result.map(entry => entry.confidence), [0.8, 0.2]);
    });

    test('preserveOrder allows pipeline anchor ranking to remain authoritative', () => {
        const anchor = { source: 'catalog-probe', confidence: 0.7, pos: { x: 0, y: 0, width: 48, height: 48 } };
        const drifted = { source: 'global-search', confidence: 0.75, pos: { x: 2, y: 2, width: 48, height: 48 } };
        assert.deepStrictEqual(
            suppressOverlappingCandidates([anchor, drifted], { preserveOrder: true }),
            [anchor]
        );
    });

    test('upsert replaces only an overlapping weaker candidate', () => {
        const candidates = [{ confidence: 0.3, pos: { x: 0, y: 0, width: 48, height: 48 } }];
        upsertBestOverlappingCandidate(candidates,
            { confidence: 0.6, pos: { x: 2, y: 2, width: 48, height: 48 } });
        assert.strictEqual(candidates.length, 1);
        assert.strictEqual(candidates[0].confidence, 0.6);
    });
});
