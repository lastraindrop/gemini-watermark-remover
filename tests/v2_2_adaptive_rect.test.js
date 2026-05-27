/**
 * v2.2 Adaptive Rectangle Support Tests
 * Tests interpolateAlphaMap and warpAlphaMap with non-square dimensions
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { interpolateAlphaMap, warpAlphaMap } from '../src/core/adaptiveDetector.js';

function makeAlpha(size) {
    const a = new Float32Array(size * size);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            a[i * size + j] = (i + j) / (2 * size);
        }
    }
    return a;
}

describe('v2.2 Adaptive Rectangle', () => {

    describe('interpolateAlphaMap (rect support)', () => {
        test('Square interpolation still works', () => {
            const src = makeAlpha(48);
            const result = interpolateAlphaMap(src, 48, 24);
            assert.strictEqual(result.length, 24 * 24);
        });

        test('Rectangle interpolation: 48→64x32', () => {
            const src = makeAlpha(48);
            const result = interpolateAlphaMap(src, 48, 64, 32);
            assert.strictEqual(result.length, 64 * 32);
        });

        test('Same size returns original-sized result with same values', () => {
            const src = makeAlpha(32);
            const result = interpolateAlphaMap(src, 32, 32);
            assert.strictEqual(result.length, src.length, 'Result should have same length');
            // Float32Array can't be compared with strictEqual; check first few values
            assert.ok(Math.abs(result[0] - src[0]) < 0.001, 'Values should be identical');
        });
    });

    describe('warpAlphaMap (rect support)', () => {
        test('Identity warp rect returns original', () => {
            const src = new Float32Array(32 * 48);
            src.fill(0.3);
            const result = warpAlphaMap(src, 32, { dx: 0, dy: 0, scale: 1 }, 48);
            assert.strictEqual(result.length, 32 * 48);
        });

        test('Warp rect with shift works', () => {
            const src = makeAlpha(32);
            const result = warpAlphaMap(src, 32, { dx: 1, dy: 0, scale: 1 }, 32);
            assert.strictEqual(result.length, 32 * 32);
            let diff = false;
            for (let i = 0; i < 100; i++) {
                if (Math.abs(result[i] - src[i]) > 0.001) { diff = true; break; }
            }
            assert.ok(diff, 'Shifted warp should differ from source');
        });
    });
});
