import assert from 'node:assert/strict';

const CHANNELS = 3;

function isTypedArrayView(value) {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function isFiniteInteger(value) {
    return Number.isInteger(value) && Number.isFinite(value);
}

function luminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function validateImageLike(image, label) {
    assert.ok(image && typeof image === 'object', `${label} must be an object with {data, width, height}`);

    const { data, width, height } = image;
    assert.ok(isFiniteInteger(width) && width > 0, `${label}.width must be a positive integer`);
    assert.ok(isFiniteInteger(height) && height > 0, `${label}.height must be a positive integer`);
    assert.ok(isTypedArrayView(data), `${label}.data must be a typed array such as Uint8ClampedArray`);

    const expectedLength = width * height * 4;
    assert.strictEqual(
        data.length,
        expectedLength,
        `${label}.data length must equal width * height * 4 (${expectedLength}), got ${data.length}`
    );

    return { data, width, height };
}

function normalizeRegion(region, width, height) {
    if (region == null) {
        return { x: 0, y: 0, width, height };
    }

    const { x = 0, y = 0, width: regionWidth = width, height: regionHeight = height } = region;
    assert.ok(isFiniteInteger(x) && x >= 0, 'region.x must be a non-negative integer');
    assert.ok(isFiniteInteger(y) && y >= 0, 'region.y must be a non-negative integer');
    assert.ok(isFiniteInteger(regionWidth) && regionWidth > 0, 'region.width must be a positive integer');
    assert.ok(isFiniteInteger(regionHeight) && regionHeight > 0, 'region.height must be a positive integer');
    assert.ok(x + regionWidth <= width, 'region must fit inside the image width');
    assert.ok(y + regionHeight <= height, 'region must fit inside the image height');

    return { x, y, width: regionWidth, height: regionHeight };
}

function maskFromImageLike(mask, width, height) {
    const { data, width: maskWidth, height: maskHeight } = validateImageLike(mask, 'mask');
    assert.strictEqual(maskWidth, width, 'mask width must match the image width');
    assert.strictEqual(maskHeight, height, 'mask height must match the image height');

    return (pixelIndex) => {
        const offset = pixelIndex << 2;
        return data[offset + 3] !== 0 || data[offset] !== 0 || data[offset + 1] !== 0 || data[offset + 2] !== 0;
    };
}

function maskFromFlatData(data, width, height) {
    assert.ok(Array.isArray(data) || isTypedArrayView(data), 'mask data must be an array or typed array');

    if (data.length === width * height) {
        return (pixelIndex) => Boolean(data[pixelIndex]);
    }

    if (data.length === width * height * 4) {
        return (pixelIndex) => {
            const offset = pixelIndex << 2;
            return data[offset + 3] !== 0 || data[offset] !== 0 || data[offset + 1] !== 0 || data[offset + 2] !== 0;
        };
    }

    throw new Error(`mask.data length must be width * height (${width * height}) or width * height * 4 (${width * height * 4})`);
}

function normalizeMask(mask, width, height) {
    if (mask == null) return null;

    if (typeof mask === 'function') {
        return mask;
    }

    if (Array.isArray(mask) || isTypedArrayView(mask)) {
        return maskFromFlatData(mask, width, height);
    }

    if (mask && typeof mask === 'object' && 'data' in mask && 'width' in mask && 'height' in mask) {
        assert.strictEqual(mask.width, width, 'mask width must match the image width');
        assert.strictEqual(mask.height, height, 'mask height must match the image height');

        if (mask.data) {
            if (mask.data.length === width * height || mask.data.length === width * height * 4) {
                return maskFromFlatData(mask.data, width, height);
            }
        }

        return maskFromImageLike(mask, width, height);
    }

    throw new TypeError('mask must be a function, array/typed array, or ImageData-like object');
}

function forEachSelectedPixel(actual, expected, options, visitor) {
    const a = validateImageLike(actual, 'actual');
    const e = validateImageLike(expected, 'expected');

    assert.strictEqual(a.width, e.width, 'Image widths must match');
    assert.strictEqual(a.height, e.height, 'Image heights must match');

    const region = normalizeRegion(options.region, a.width, a.height);
    const mask = normalizeMask(options.mask, a.width, a.height);

    let count = 0;
    for (let y = region.y; y < region.y + region.height; y += 1) {
        for (let x = region.x; x < region.x + region.width; x += 1) {
            const pixelIndex = y * a.width + x;
            if (mask && !mask(pixelIndex, x, y)) continue;
            const offset = pixelIndex << 2;
            visitor({
                x,
                y,
                pixelIndex,
                offset,
                actual: a.data,
                expected: e.data,
                width: a.width,
                height: a.height,
                region,
            });
            count += 1;
        }
    }

    assert.ok(count > 0, 'Comparison region/mask selected no pixels');
    return count;
}

/**
 * Compute the mean absolute error across RGB channels for the selected pixels.
 *
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} actual
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} expected
 * @param {{region?: {x:number,y:number,width:number,height:number}, mask?: Function|Array|TypedArray|object}} [options]
 * @returns {number}
 */
export function meanAbsoluteError(actual, expected, options = {}) {
    let sum = 0;

    const count = forEachSelectedPixel(actual, expected, options, ({ offset, actual: a, expected: e }) => {
        sum += Math.abs(a[offset] - e[offset]);
        sum += Math.abs(a[offset + 1] - e[offset + 1]);
        sum += Math.abs(a[offset + 2] - e[offset + 2]);
    });

    return sum / (count * CHANNELS);
}

/**
 * Compute the maximum absolute per-channel delta across the selected pixels.
 *
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} actual
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} expected
 * @param {{region?: {x:number,y:number,width:number,height:number}, mask?: Function|Array|TypedArray|object}} [options]
 * @returns {number}
 */
export function maxChannelDelta(actual, expected, options = {}) {
    let maxDelta = 0;

    forEachSelectedPixel(actual, expected, options, ({ offset, actual: a, expected: e }) => {
        const dr = Math.abs(a[offset] - e[offset]);
        const dg = Math.abs(a[offset + 1] - e[offset + 1]);
        const db = Math.abs(a[offset + 2] - e[offset + 2]);
        if (dr > maxDelta) maxDelta = dr;
        if (dg > maxDelta) maxDelta = dg;
        if (db > maxDelta) maxDelta = db;
    });

    return maxDelta;
}

/**
 * Compute PSNR in dB over the selected RGB channels.
 * Returns Infinity for identical images (zero MSE).
 *
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} actual
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} expected
 * @param {{region?: {x:number,y:number,width:number,height:number}, mask?: Function|Array|TypedArray|object}} [options]
 * @returns {number}
 */
export function psnr(actual, expected, options = {}) {
    let sumSq = 0;

    const count = forEachSelectedPixel(actual, expected, options, ({ offset, actual: a, expected: e }) => {
        const dr = a[offset] - e[offset];
        const dg = a[offset + 1] - e[offset + 1];
        const db = a[offset + 2] - e[offset + 2];
        sumSq += dr * dr + dg * dg + db * db;
    });

    const mse = sumSq / (count * CHANNELS);
    if (mse === 0) return Infinity;
    return 10 * Math.log10((255 * 255) / mse);
}

/**
 * Compute a deterministic normalized cross-correlation of luminance residuals.
 * The residual is the luminance with its selected-region mean removed.
 *
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} actual
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} expected
 * @param {{region?: {x:number,y:number,width:number,height:number}, mask?: Function|Array|TypedArray|object}} [options]
 * @returns {number}
 */
export function residualNcc(actual, expected, options = {}) {
    let sumActual = 0;
    let sumExpected = 0;

    const count = forEachSelectedPixel(actual, expected, options, ({ offset, actual: a, expected: e }) => {
        sumActual += luminance(a[offset], a[offset + 1], a[offset + 2]);
        sumExpected += luminance(e[offset], e[offset + 1], e[offset + 2]);
    });

    const meanActual = sumActual / count;
    const meanExpected = sumExpected / count;

    let numerator = 0;
    let denomActual = 0;
    let denomExpected = 0;

    forEachSelectedPixel(actual, expected, options, ({ offset, actual: a, expected: e }) => {
        const ra = luminance(a[offset], a[offset + 1], a[offset + 2]) - meanActual;
        const rb = luminance(e[offset], e[offset + 1], e[offset + 2]) - meanExpected;
        numerator += ra * rb;
        denomActual += ra * ra;
        denomExpected += rb * rb;
    });

    const denom = Math.sqrt(denomActual * denomExpected);
    if (denom === 0) {
        return meanActual === meanExpected ? 1 : 0;
    }

    return numerator / denom;
}

/**
 * Estimate edge-halo strength by comparing the mean absolute difference on the
 * selected region's border band against the interior.
 * Lower values are better; identical images return 0.
 *
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} actual
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} expected
 * @param {{region?: {x:number,y:number,width:number,height:number}, mask?: Function|Array|TypedArray|object, band?: number}} [options]
 * @returns {number}
 */
export function haloScore(actual, expected, options = {}) {
    const band = options.band == null ? 2 : options.band;
    assert.ok(isFiniteInteger(band) && band >= 0, 'options.band must be a non-negative integer');

    let edgeSum = 0;
    let edgeCount = 0;
    let interiorSum = 0;
    let interiorCount = 0;

    forEachSelectedPixel(actual, expected, options, ({ x, y, actual: a, expected: e, region, offset }) => {
        const diff = Math.abs(luminance(a[offset], a[offset + 1], a[offset + 2]) - luminance(e[offset], e[offset + 1], e[offset + 2]));
        const onEdge =
            (x - region.x) < band ||
            (y - region.y) < band ||
            (region.x + region.width - 1 - x) < band ||
            (region.y + region.height - 1 - y) < band;

        if (onEdge) {
            edgeSum += diff;
            edgeCount += 1;
        } else {
            interiorSum += diff;
            interiorCount += 1;
        }
    });

    const edgeMean = edgeCount > 0 ? edgeSum / edgeCount : 0;
    const interiorMean = interiorCount > 0 ? interiorSum / interiorCount : 0;

    if (interiorCount === 0) {
        return edgeMean / 255;
    }

    return Math.max(0, edgeMean - interiorMean) / 255;
}

/**
 * Assert that a numeric value is within a symmetric tolerance of an expected value.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerance
 * @param {string} [message]
 */
export function assertWithin(actual, expected, tolerance, message) {
    assert.ok(Number.isFinite(actual), 'actual must be a finite number');
    assert.ok(Number.isFinite(expected), 'expected must be a finite number');
    assert.ok(Number.isFinite(tolerance) && tolerance >= 0, 'tolerance must be a non-negative finite number');

    const delta = Math.abs(actual - expected);
    assert.ok(delta <= tolerance, message || `Expected ${actual} to be within ${tolerance} of ${expected} (delta ${delta})`);
}

/**
 * Assert that two ImageData-like objects are close according to deterministic metrics.
 * Defaults are exact-match strictness unless thresholds are loosened via options.
 *
 * Supported options:
 * - region, mask
 * - maxMeanAbsoluteError
 * - maxChannelDelta
 * - minPsnr
 * - minResidualNcc
 * - maxHaloScore
 * - band (for haloScore)
 * - message
 *
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} actual
 * @param {{data: Uint8ClampedArray|ArrayBufferView, width: number, height: number}} expected
 * @param {{
 *   region?: {x:number,y:number,width:number,height:number},
 *   mask?: Function|Array|TypedArray|object,
 *   maxMeanAbsoluteError?: number,
 *   maxChannelDelta?: number,
 *   minPsnr?: number,
 *   minResidualNcc?: number,
 *   maxHaloScore?: number,
 *   band?: number,
 *   message?: string,
 * }} [options]
 */
export function assertImageClose(actual, expected, options = {}) {
    const metricsOptions = { region: options.region, mask: options.mask };
    const mae = meanAbsoluteError(actual, expected, metricsOptions);
    const delta = maxChannelDelta(actual, expected, metricsOptions);
    const valuePsnr = psnr(actual, expected, metricsOptions);
    const ncc = residualNcc(actual, expected, metricsOptions);
    const halo = haloScore(actual, expected, { region: options.region, mask: options.mask, band: options.band });

    const checks = [];
    if (options.maxMeanAbsoluteError != null) {
        checks.push({ ok: mae <= options.maxMeanAbsoluteError, label: `meanAbsoluteError ${mae} <= ${options.maxMeanAbsoluteError}` });
    } else {
        checks.push({ ok: mae === 0, label: `meanAbsoluteError ${mae} === 0` });
    }

    if (options.maxChannelDelta != null) {
        checks.push({ ok: delta <= options.maxChannelDelta, label: `maxChannelDelta ${delta} <= ${options.maxChannelDelta}` });
    } else {
        checks.push({ ok: delta === 0, label: `maxChannelDelta ${delta} === 0` });
    }

    if (options.minPsnr != null) {
        checks.push({ ok: valuePsnr >= options.minPsnr, label: `psnr ${valuePsnr} >= ${options.minPsnr}` });
    }

    if (options.minResidualNcc != null) {
        checks.push({ ok: ncc >= options.minResidualNcc, label: `residualNcc ${ncc} >= ${options.minResidualNcc}` });
    }

    if (options.maxHaloScore != null) {
        checks.push({ ok: halo <= options.maxHaloScore, label: `haloScore ${halo} <= ${options.maxHaloScore}` });
    }

    const failed = checks.filter(check => !check.ok);
    assert.ok(
        failed.length === 0,
        options.message || `Image comparison failed: ${failed.map(check => check.label).join('; ')}; metrics={mae:${mae}, maxDelta:${delta}, psnr:${valuePsnr}, residualNcc:${ncc}, haloScore:${halo}}`
    );
}
