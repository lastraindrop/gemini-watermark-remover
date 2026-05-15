import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyStandardWatermarkSignal,
    classifyAdaptiveWatermarkSignal,
    decideDetectionTier,
    classifyRemovalAttribution
} from '../src/core/decisionPolicy.js';

describe('Decision Policy', () => {

    describe('Standard Signal Classification', () => {
        test('Strong signals → direct-match', () => {
            assert.strictEqual(
                classifyStandardWatermarkSignal({ spatialScore: 0.35, gradientScore: 0.15 }).tier,
                'direct-match'
            );
        });

        test('Strong gradient with moderate spatial → direct-match', () => {
            assert.strictEqual(
                classifyStandardWatermarkSignal({ spatialScore: 0.29, gradientScore: 0.50 }).tier,
                'direct-match'
            );
        });

        test('Weak signals → needs-validation', () => {
            assert.strictEqual(
                classifyStandardWatermarkSignal({ spatialScore: 0.20, gradientScore: 0.05 }).tier,
                'needs-validation'
            );
        });

        test('Non-finite inputs → insufficient', () => {
            assert.strictEqual(
                classifyStandardWatermarkSignal({ spatialScore: null, gradientScore: null }).tier,
                'insufficient'
            );
        });

        test('Zero signals → insufficient', () => {
            assert.strictEqual(
                classifyStandardWatermarkSignal({ spatialScore: 0, gradientScore: 0 }).tier,
                'insufficient'
            );
        });
    });

    describe('Adaptive Signal Classification', () => {
        test('High confidence adaptive → direct-match', () => {
            const result = {
                found: true,
                confidence: 0.52,
                spatialScore: 0.45,
                gradientScore: 0.15,
                region: { width: 80 }
            };
            assert.strictEqual(
                classifyAdaptiveWatermarkSignal(result).tier,
                'direct-match'
            );
        });

        test('Moderate confidence → needs-validation', () => {
            const result = {
                found: true,
                confidence: 0.40,
                spatialScore: 0.35,
                gradientScore: 0.12,
                region: { width: 60 }
            };
            assert.strictEqual(
                classifyAdaptiveWatermarkSignal(result).tier,
                'needs-validation'
            );
        });

        test('Not found → insufficient', () => {
            assert.strictEqual(
                classifyAdaptiveWatermarkSignal({ found: false }).tier,
                'insufficient'
            );
        });

        test('Null → insufficient', () => {
            assert.strictEqual(
                classifyAdaptiveWatermarkSignal(null).tier,
                'insufficient'
            );
        });
    });

    describe('Detection Tier Decision', () => {
        test('catalog-probe high confidence → direct-match', () => {
            assert.strictEqual(
                decideDetectionTier({
                    winner: {
                        source: 'catalog-probe',
                        confidence: 0.65
                    }
                }).tier,
                'direct-match'
            );
        });

        test('catalog-probe moderate → needs-validation', () => {
            assert.strictEqual(
                decideDetectionTier({
                    winner: {
                        source: 'catalog-probe',
                        confidence: 0.35
                    }
                }).tier,
                'needs-validation'
            );
        });

        test('adaptive-search high → direct-match', () => {
            assert.strictEqual(
                decideDetectionTier({
                    winner: {
                        source: 'adaptive-search',
                        confidence: 0.52
                    }
                }).tier,
                'direct-match'
            );
        });

        test('global low → insufficient', () => {
            assert.strictEqual(
                decideDetectionTier({
                    winner: {
                        source: 'global-search',
                        confidence: 0.25
                    }
                }).tier,
                'insufficient'
            );
        });

        test('no winner → insufficient', () => {
            assert.strictEqual(
                decideDetectionTier({
                    winner: null
                }).tier,
                'insufficient'
            );
        });
    });

    describe('Removal Attribution', () => {
        test('safe-removal for good suppression', () => {
            assert.strictEqual(
                classifyRemovalAttribution({
                    size: 96,
                    position: { x: 1, y: 1, width: 96, height: 96 },
                    detection: {
                        originalSpatialScore: 0.35,
                        processedSpatialScore: 0.10,
                        suppressionGain: 0.30
                    }
                }).tier,
                'safe-removal'
            );
        });

        test('insufficient for weak suppression', () => {
            assert.strictEqual(
                classifyRemovalAttribution({
                    size: 96,
                    position: { x: 1, y: 1, width: 96, height: 96 },
                    detection: {
                        originalSpatialScore: 0.35,
                        processedSpatialScore: 0.30,
                        suppressionGain: 0.05
                    }
                }).tier,
                'insufficient'
            );
        });
    });
});
