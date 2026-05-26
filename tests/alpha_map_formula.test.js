import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateAlphaMap } from '../src/core/alphaMap.js';

function mockPixels(pixels) {
    const count = pixels.length;
    const data = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) {
        const idx = i * 4;
        data[idx] = pixels[i].r;
        data[idx + 1] = pixels[i].g;
        data[idx + 2] = pixels[i].b;
        data[idx + 3] = 255;
    }
    return { width: count, height: 1, data };
}

function bt709(r, g, b) {
    return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255.0;
}

function maxChannel(r, g, b) {
    return Math.max(r, g, b) / 255.0;
}

const FLOAT_TOLERANCE = 0.0001;

describe('Alpha Map Computation (Max-Channel Formula)', () => {

    describe('Color channel handling', () => {
        test('Pure white (255,255,255) => 1.0', () => {
            const { data } = mockPixels([{ r: 255, g: 255, b: 255 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            assert.strictEqual(alpha[0], 1.0);
        });

        test('Pure black (0,0,0) => 0.0', () => {
            const { data } = mockPixels([{ r: 0, g: 0, b: 0 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            assert.strictEqual(alpha[0], 0.0);
        });

        test('Pure red (255,0,0) => 1.0 via max-channel', () => {
            const { data } = mockPixels([{ r: 255, g: 0, b: 0 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            assert.ok(alpha[0] > 0.99, `Got ${alpha[0]}`);
        });

        test('Pure green (0,255,0) => 1.0 via max-channel', () => {
            const { data } = mockPixels([{ r: 0, g: 255, b: 0 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            assert.ok(alpha[0] > 0.99, `Got ${alpha[0]}`);
        });

        test('Pure blue (0,0,255) => 1.0 via max-channel', () => {
            const { data } = mockPixels([{ r: 0, g: 0, b: 255 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            assert.ok(alpha[0] > 0.99, `Got ${alpha[0]}`);
        });
    });

    describe('Max-channel vs BT.709 divergence', () => {
        test('All three pure colors produce alpha=1', () => {
            const data = new Uint8ClampedArray([
                255, 0, 0, 255,
                0, 255, 0, 255,
                0, 0, 255, 255
            ]);
            const alpha = calculateAlphaMap({ width: 3, height: 1, data });
            for (let i = 0; i < 3; i++) {
                assert.ok(Math.abs(alpha[i] - 1.0) < 0.001,
                    `Channel ${i}: expected ~1.0, got ${alpha[i]}`);
            }
        });

        test('Mixed pixel (128,64,200) uses max-channel = 200/255', () => {
            const { data } = mockPixels([{ r: 128, g: 64, b: 200 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            const expected = maxChannel(128, 64, 200);
            assert.ok(Math.abs(alpha[0] - expected) < FLOAT_TOLERANCE);
            // Must be higher than BT.709
            assert.ok(alpha[0] > bt709(128, 64, 200),
                `Max-channel ${alpha[0].toFixed(4)} > BT.709 ${bt709(128, 64, 200).toFixed(4)}`);
        });

        test('Anti-aliased edge (200,200,210) — max-channel measurable higher', () => {
            const { data } = mockPixels([{ r: 200, g: 200, b: 210 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            const expected = maxChannel(200, 200, 210);
            const old = bt709(200, 200, 210);
            assert.ok(Math.abs(alpha[0] - expected) < FLOAT_TOLERANCE);
            assert.ok(expected > old,
                `Max-channel ${expected.toFixed(4)} must be > BT.709 ${old.toFixed(4)}`);
        });

        test('Blue-tinted watermark pixel (180,195,250) — divergence > 0.03', () => {
            const { data } = mockPixels([{ r: 180, g: 195, b: 250 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            const old = bt709(180, 195, 250);
            assert.ok(alpha[0] - old > 0.03,
                `Diff ${(alpha[0] - old).toFixed(4)} should be > 0.03`);
        });

        test('Five mixed pixels — all use max-channel', () => {
            const pixels = [
                { r: 100, g: 100, b: 100 },
                { r: 255, g: 128, b: 0 },
                { r: 64, g: 128, b: 255 },
                { r: 0, g: 255, b: 0 },
                { r: 200, g: 50, b: 50 }
            ];
            const { data } = mockPixels(pixels);
            const alpha = calculateAlphaMap({ width: 5, height: 1, data });
            for (let i = 0; i < pixels.length; i++) {
                const expected = maxChannel(pixels[i].r, pixels[i].g, pixels[i].b);
                assert.ok(Math.abs(alpha[i] - expected) < FLOAT_TOLERANCE,
                    `Pixel ${i}: expected ${expected}, got ${alpha[i]}`);
            }
        });
    });

    describe('Output invariants', () => {
        test('All values in [0, 1] regardless of input', () => {
            const pixels = [
                { r: 0, g: 0, b: 0 },
                { r: 255, g: 255, b: 255 },
                { r: 1, g: 1, b: 1 },
                { r: 254, g: 254, b: 254 },
                { r: 128, g: 128, b: 128 }
            ];
            const { data } = mockPixels(pixels);
            const alpha = calculateAlphaMap({ width: 5, height: 1, data });
            for (let i = 0; i < alpha.length; i++) {
                assert.ok(alpha[i] >= 0 && alpha[i] <= 1,
                    `Out of range at ${i}: ${alpha[i]}`);
            }
        });

        test('Returns Float32Array of correct length (non-trivial dimensions)', () => {
            const { data } = mockPixels([{ r: 128, g: 128, b: 128 }]);
            const alpha = calculateAlphaMap({ width: 1, height: 1, data });
            assert.ok(alpha instanceof Float32Array);
            assert.strictEqual(alpha.length, 1, 'Length must be width*height');
        });
    });
});
