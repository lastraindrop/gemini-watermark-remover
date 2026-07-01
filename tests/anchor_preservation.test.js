import { test, describe } from 'node:test';
import assert from 'node:assert';
import { compareDetectionCandidates } from '../src/core/candidateGeometry.js';

describe('canonical anchor ranking', () => {
    test('reliable anchor is preserved over a marginally stronger drifted candidate', () => {
        const matches = [
            { source: 'global-search', confidence: 0.27 },
            { source: 'catalog-probe', confidence: 0.25 }
        ].sort(compareDetectionCandidates);
        assert.strictEqual(matches[0].source, 'catalog-probe');
    });

    test('drifted candidate wins when improvement is clear', () => {
        const matches = [
            { source: 'global-search', confidence: 0.35 },
            { source: 'catalog-probe', confidence: 0.25 }
        ].sort(compareDetectionCandidates);
        assert.strictEqual(matches[0].source, 'global-search');
    });

    test('weak anchor is not protected', () => {
        const matches = [
            { source: 'global-search', confidence: 0.22 },
            { source: 'catalog-probe', confidence: 0.18 }
        ].sort(compareDetectionCandidates);
        assert.strictEqual(matches[0].source, 'global-search');
    });

    test('same-source class sorts by confidence', () => {
        const matches = [
            { source: 'catalog-probe', confidence: 0.30 },
            { source: 'heuristic-probe', confidence: 0.45 }
        ].sort(compareDetectionCandidates);
        assert.strictEqual(matches[0].confidence, 0.45);
    });
});
