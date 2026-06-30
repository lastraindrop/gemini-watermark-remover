/**
 * Missed-Detection Regression: Gemini Standard Positions
 *
 * Guards against regressions where a watermark placed at a standard
 * catalog anchor position would be missed by the full detection pipeline.
 *
 * Focuses on candidate coordinate / alpha-map invariants:
 *  - winner is non-null (no missed detection)
 *  - confidence clears FINAL_ANCHORED for catalog-backed matches
 *  - winner dimensions match the expected logo size
 *  - alphaMap length === width * height
 *  - every match region lies inside the image bounds
 *
 * Uses synthetic ImageData + direct core APIs (detectProfileWatermarks).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectProfileWatermarks } from '../src/core/detectionPipeline.js';
import { DETECTION_THRESHOLDS } from '../src/core/config.js';
import {
    createMockImageData,
    createMockAlphaMap,
    applyWatermark,
    resolvePos,
    resolveLogoSize,
    createWatermarkedImage
} from './test_utils.js';

/**
 * Build a getAlphaMap fn that returns a deterministic synthetic alpha map
 * for any requested size key. createMockAlphaMap is fully deterministic
 * (no Math.random), so a fresh map for size N is byte-identical to the one
 * injected into the image — keeping NCC high without sharing references.
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

/** Invariant: the candidate region lies entirely inside the image. */
function assertCandidateInBounds(pos, imgW, imgH, label = 'candidate') {
    const x0 = Math.floor(pos.x);
    const y0 = Math.floor(pos.y);
    assert.ok(x0 >= 0, `${label}: floor(x)=${x0} must be >= 0`);
    assert.ok(y0 >= 0, `${label}: floor(y)=${y0} must be >= 0`);
    assert.ok(
        x0 + pos.width <= imgW,
        `${label}: floor(x)+width=${x0 + pos.width} must be <= ${imgW}`
    );
    assert.ok(
        y0 + pos.height <= imgH,
        `${label}: floor(y)+height=${y0 + pos.height} must be <= ${imgH}`
    );
}

describe('Missed-Detection Regression: Gemini Standard Positions', () => {
    const cases = [
        { w: 1024, h: 1024, label: '1:1 1024²' },
        { w: 512, h: 512, label: '0.5k 512²' },
        { w: 848, h: 1264, label: '2:3 848×1264' },
        { w: 1264, h: 848, label: '3:2 1264×848' }
    ];

    describe('catalog-backed standard position is always detected', () => {
        for (const { w, h, label } of cases) {
            test(`detects watermark at standard position (${label})`, async () => {
                const img = createMockImageData(w, h, 'noise', 128);
                const pos = resolvePos(w, h, 'gemini');
                const alphaMap = createMockAlphaMap(pos.width, pos.height);
                applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

                const result = await detectProfileWatermarks({
                    imageData: img,
                    profileId: 'gemini',
                    getAlphaMap: syntheticAlphaProvider(),
                    options: { deepScan: true }
                });

                assert.ok(result.winner, `${label}: winner is null (missed detection)`);
                assert.ok(
                    result.confidence >= DETECTION_THRESHOLDS.FINAL_ANCHORED,
                    `${label}: confidence ${result.confidence.toFixed(3)} < FINAL_ANCHORED ${DETECTION_THRESHOLDS.FINAL_ANCHORED}`
                );
                assertCandidateInBounds(result.winner.pos, w, h, label);
            });
        }
    });

    describe('candidate coordinate + alpha-map invariants', () => {
        test('winner dimensions match expected logo size and alphaMap length', async () => {
            const w = 1024, h = 1024;
            const img = createMockImageData(w, h, 'noise', 128);
            const pos = resolvePos(w, h, 'gemini');
            const expectedSize = resolveLogoSize(w, h, 'gemini');
            const alphaMap = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

            const result = await detectProfileWatermarks({
                imageData: img,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.winner, 'winner missing');
            assert.equal(result.winner.pos.width, expectedSize, 'width must match logo size');
            assert.equal(result.winner.pos.height, expectedSize, 'height must match logo size');
            assert.equal(
                result.winner.alphaMap.length,
                expectedSize * expectedSize,
                'alphaMap length must equal width*height'
            );
        });

        test('winner anchor is bottom-right for Gemini', async () => {
            const w = 1024, h = 1024;
            const img = createMockImageData(w, h, 'noise', 128);
            const pos = resolvePos(w, h, 'gemini');
            const alphaMap = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

            const result = await detectProfileWatermarks({
                imageData: img,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.winner);
            assert.equal(result.winner.pos.anchor, 'bottom-right');
        });

        test('winner position stays within jitter tolerance of standard anchor', async () => {
            const w = 1024, h = 1024;
            const img = createMockImageData(w, h, 'noise', 128);
            const pos = resolvePos(w, h, 'gemini');
            const alphaMap = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

            const result = await detectProfileWatermarks({
                imageData: img,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.winner);
            // Jitter + sub-pixel can shift a few px; allow JITTER_RANGE + 1px slack.
            const tol = DETECTION_THRESHOLDS.JITTER_RANGE + 1;
            assert.ok(
                Math.abs(result.winner.pos.x - pos.x) <= tol,
                `x drift ${result.winner.pos.x - pos.x} exceeds ${tol}`
            );
            assert.ok(
                Math.abs(result.winner.pos.y - pos.y) <= tol,
                `y drift ${result.winner.pos.y - pos.y} exceeds ${tol}`
            );
        });

        test('createWatermarkedImage synthetic helper yields a detectable watermark', async () => {
            const { imageData, pos } = createWatermarkedImage({
                width: 1024,
                height: 1024,
                profileId: 'gemini'
            });

            const result = await detectProfileWatermarks({
                imageData,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.winner, 'helper-produced image should be detected');
            assert.ok(
                result.confidence >= DETECTION_THRESHOLDS.FINAL_ANCHORED,
                `confidence ${result.confidence.toFixed(3)} too low`
            );
            assertCandidateInBounds(result.winner.pos, 1024, 1024, 'helper');
        });
    });

    describe('all reported matches satisfy coordinate invariants', () => {
        test('every match region is in-bounds with positive dimensions', async () => {
            const w = 1024, h = 1024;
            const img = createMockImageData(w, h, 'noise', 128);
            const pos = resolvePos(w, h, 'gemini');
            const alphaMap = createMockAlphaMap(pos.width, pos.height);
            applyWatermark(img, pos.x, pos.y, pos.width, pos.height, alphaMap);

            const result = await detectProfileWatermarks({
                imageData: img,
                profileId: 'gemini',
                getAlphaMap: syntheticAlphaProvider(),
                options: { deepScan: true }
            });

            assert.ok(result.matches.length > 0, 'should report at least one match');
            for (const m of result.matches) {
                assert.ok(m.pos.width > 0, `match(src=${m.source}): width must be positive`);
                assert.ok(m.pos.height > 0, `match(src=${m.source}): height must be positive`);
                assertCandidateInBounds(m.pos, w, h, `match(src=${m.source})`);
                assert.ok(
                    m.alphaMap.length === m.pos.width * m.pos.height,
                    `match(src=${m.source}): alphaMap length must equal width*height`
                );
            }
        });
    });
});
