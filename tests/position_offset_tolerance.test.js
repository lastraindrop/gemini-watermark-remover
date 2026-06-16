import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { calculateProbeConfidence } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark, resolvePos } from './test_utils.js';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';

/**
 * v2.6 Position Offset Tolerance Tests
 *
 * Gemini sometimes offsets the watermark by a few pixels from the standard
 * anchor position. These tests verify that the detection system can still
 * find watermarks at various offsets, thanks to:
 *   - Coarse relocation scan (±16px, step 4)
 *   - Expanded jitter range (10px for balanced preset)
 *   - Removed JITTER_TRIGGER_MIN gate
 *   - Raised isNearExpectedAnchor tolerance (20%)
 */
describe('Position Offset Tolerance (v2.6)', () => {

    const W = 1024, H = 1024;

    describe('calculateProbeConfidence with offset watermarks', () => {
        // calculateProbeConfidence uses jitter fine-tuning around the probed
        // position. It handles small offsets (≤3px) well. For larger offsets,
        // the full detectWatermark pipeline (with coarse relocation) takes over.
        const offsets = [
            { dx: 0, dy: 0, label: 'no offset (baseline)', maxError: 0 },
            { dx: 3, dy: 0, label: '3px right', maxError: 4 },
            { dx: 0, dy: 3, label: '3px down', maxError: 4 },
            { dx: -3, dy: 0, label: '3px left', maxError: 4 },
            { dx: 0, dy: -3, label: '3px up', maxError: 4 },
            { dx: 5, dy: 5, label: '5px diagonal (confidence check only)', maxError: null },
            { dx: 8, dy: 3, label: '8px right, 3px down (confidence check only)', maxError: null },
            { dx: -5, dy: -5, label: '-5px diagonal (confidence check only)', maxError: null },
        ];

        for (const { dx, dy, label, maxError } of offsets) {
            test(`probe confidence finds watermark at offset (${label})`, () => {
                const img = createMockImageData(W, H, 'noise', 128);
                const basePos = resolvePos(W, H);
                const alphaMap = createMockAlphaMap(basePos.width, basePos.height);

                // Apply watermark at OFFSET position
                const offsetX = basePos.x + dx;
                const offsetY = basePos.y + dy;
                applyWatermark(img, offsetX, offsetY, basePos.width, basePos.height, alphaMap);

                // Probe at the STANDARD position (not the offset position).
                // The jitter search should find the offset.
                const result = calculateProbeConfidence(
                    img,
                    basePos,  // standard position, NOT offset
                    alphaMap,
                    'gemini',
                    { deepScan: true }
                );

                // Should detect with reasonable confidence despite offset
                assert.ok(result.confidence > 0,
                    `${label}: confidence should be > 0, got ${result.confidence.toFixed(3)}`);

                // For small offsets, verify position correction accuracy
                if (maxError !== null) {
                    const detectedOffsetX = result.x - basePos.x;
                    const detectedOffsetY = result.y - basePos.y;
                    const detectionError = Math.abs(detectedOffsetX - dx) + Math.abs(detectedOffsetY - dy);
                    assert.ok(detectionError <= maxError,
                        `${label}: detection error ${detectionError}px > ${maxError}px tolerance`);
                }
            });
        }
    });

    describe('Coarse relocation for large offsets', () => {
        /**
         * These offsets exceed the old jitter range (6px) and would have
         * caused complete misses before the coarse relocation scan was added.
         */
        const largeOffsets = [
            { dx: 10, dy: 0, label: '10px right' },
            { dx: 0, dy: 10, label: '10px down' },
            { dx: -10, dy: 0, label: '10px left' },
            { dx: 12, dy: 8, label: '12px right, 8px down' },
        ];

        for (const { dx, dy, label } of largeOffsets) {
            test(`coarse relocation finds watermark at ${label}`, () => {
                const img = createMockImageData(W, H, 'noise', 128);
                const basePos = resolvePos(W, H);
                const alphaMap = createMockAlphaMap(basePos.width, basePos.height);

                const offsetPos = { x: basePos.x + dx, y: basePos.y + dy, width: basePos.width, height: basePos.height };
                applyWatermark(img, offsetPos.x, offsetPos.y, basePos.width, basePos.height, alphaMap);

                // Build alphaMaps dict for detectWatermark
                const alphaMaps = {};
                alphaMaps[basePos.width] = alphaMap;
                alphaMaps[`${basePos.width}x${basePos.height}`] = alphaMap;

                // detectWatermark runs the full Phase 1 pipeline including
                // coarse relocation and jitter.
                const result = detectWatermark(img, alphaMaps, { deepScan: true });

                assert.ok(result !== null,
                    `${label}: detectWatermark should find the watermark`);

                if (result) {
                    const detectionOffsetX = result.x - basePos.x;
                    const detectionOffsetY = result.y - basePos.y;
                    const error = Math.abs(detectionOffsetX - dx) + Math.abs(detectionOffsetY - dy);
                    // Allow up to 6px error (jitter step granularity)
                    assert.ok(error <= 6,
                        `${label}: detection error ${error}px (expected ~${dx},${dy}, got ${detectionOffsetX},${detectionOffsetY})`);
                }
            });
        }
    });

    describe('Jitter configuration sanity', () => {
        test('JITTER_RANGE is >= 10 (v2.6 expansion)', () => {
            assert.ok(DETECTION_THRESHOLDS.JITTER_RANGE >= 10,
                `JITTER_RANGE should be >= 10 for offset tolerance, got ${DETECTION_THRESHOLDS.JITTER_RANGE}`);
        });

        test('JITTER_OFFICIAL is >= 6 (v2.6 expansion)', () => {
            assert.ok(DETECTION_THRESHOLDS.JITTER_OFFICIAL >= 6,
                `JITTER_OFFICIAL should be >= 6, got ${DETECTION_THRESHOLDS.JITTER_OFFICIAL}`);
        });
    });

    describe('False positive resistance with expanded jitter', () => {
        test('clean image (no watermark) does not produce false positive', () => {
            const img = createMockImageData(W, H, 'noise', 128);
            const basePos = resolvePos(W, H);
            const alphaMap = createMockAlphaMap(basePos.width, basePos.height);

            // NO watermark applied
            const alphaMaps = {};
            alphaMaps[basePos.width] = alphaMap;
            alphaMaps[`${basePos.width}x${basePos.height}`] = alphaMap;

            const result = detectWatermark(img, alphaMaps, { deepScan: true });

            // Should NOT find a watermark (or find one with very low confidence)
            if (result) {
                assert.ok(result.confidence < DETECTION_THRESHOLDS.FINAL_ANCHORED,
                    `False positive: clean image detected with confidence ${result.confidence.toFixed(3)}`);
            }
        });
    });
});
