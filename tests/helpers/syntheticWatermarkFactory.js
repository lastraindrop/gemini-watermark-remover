const DEFAULT_SEED = 1337;

function assertPositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive integer`);
    }
}

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function seededNoise01(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
}

function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;

    if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    const m = l - c / 2;
    return [clampByte((r + m) * 255), clampByte((g + m) * 255), clampByte((b + m) * 255)];
}

function normalizePosition(position, width, height, watermarkWidth, watermarkHeight) {
    const fallbackX = width - watermarkWidth - 64;
    const fallbackY = height - watermarkHeight - 64;
    return {
        x: Number.isFinite(position?.x) ? position.x : Math.max(0, fallbackX),
        y: Number.isFinite(position?.y) ? position.y : Math.max(0, fallbackY),
        width: watermarkWidth,
        height: watermarkHeight,
        anchor: position?.anchor || 'bottom-right'
    };
}

function sampleAlphaNearest(alphaMap, alphaWidth, alphaHeight, relX, relY) {
    const x = Math.floor(relX);
    const y = Math.floor(relY);
    if (x < 0 || y < 0 || x >= alphaWidth || y >= alphaHeight) return 0;
    return alphaMap[y * alphaWidth + x] || 0;
}

/**
 * Clone an ImageData-like object without depending on browser globals.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function cloneImageData(imageData) {
    assertPositiveInteger(imageData.width, 'imageData.width');
    assertPositiveInteger(imageData.height, 'imageData.height');
    return {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data)
    };
}

/**
 * Create deterministic synthetic backgrounds for precision and detection tests.
 * Supported backgroundType values: solid, gradient, hsl-gradient, noise, grid.
 */
export function createBackgroundImageData({
    width,
    height,
    backgroundType = 'gradient',
    baseColor = 128,
    seed = DEFAULT_SEED
} = {}) {
    assertPositiveInteger(width, 'width');
    assertPositiveInteger(height, 'height');

    const data = new Uint8ClampedArray(width * height * 4);
    const denomX = Math.max(1, width - 1);
    const denomY = Math.max(1, height - 1);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const idx = (y * width + x) << 2;
            let r = baseColor;
            let g = baseColor;
            let b = baseColor;

            if (backgroundType === 'gradient') {
                const value = clampByte((x / denomX) * 170 + (y / denomY) * 70 + 20);
                r = value;
                g = clampByte(value * 0.92 + 10);
                b = clampByte(value * 0.78 + 24);
            } else if (backgroundType === 'hsl-gradient') {
                [r, g, b] = hslToRgb((x / denomX) * 240, 0.45, 0.35 + (y / denomY) * 0.3);
            } else if (backgroundType === 'noise') {
                const noise = seededNoise01(seed + x * 17 + y * 131);
                const value = clampByte(baseColor + (noise - 0.5) * 96);
                r = value;
                g = clampByte(value + (seededNoise01(seed + x * 23 + y * 73) - 0.5) * 18);
                b = clampByte(value + (seededNoise01(seed + x * 29 + y * 47) - 0.5) * 18);
            } else if (backgroundType === 'grid') {
                const value = ((x >> 4) + (y >> 4)) % 2 === 0 ? 204 : 52;
                r = g = b = value;
            } else if (backgroundType !== 'solid') {
                throw new Error(`Unsupported backgroundType: ${backgroundType}`);
            }

            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
        }
    }

    return { width, height, data };
}

/**
 * Create a deterministic watermark alpha map. The default shape is a smooth
 * radial mask with faint non-zero fringe, similar to existing test utilities.
 */
export function createAlphaMap(width, height = width, { shape = 'radial', maxAlpha = 0.72, minAlpha = 0.01 } = {}) {
    assertPositiveInteger(width, 'alpha width');
    assertPositiveInteger(height, 'alpha height');

    const alphaMap = new Float32Array(width * height);
    const centerX = (width - 1) / 2;
    const centerY = (height - 1) / 2;
    const radius = Math.max(1, Math.min(width, height) / 2.35);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const idx = y * width + x;
            if (shape === 'uniform') {
                alphaMap[idx] = maxAlpha;
                continue;
            }
            if (shape === 'rect') {
                const insetX = Math.max(1, Math.floor(width * 0.12));
                const insetY = Math.max(1, Math.floor(height * 0.12));
                alphaMap[idx] = x >= insetX && x < width - insetX && y >= insetY && y < height - insetY ? maxAlpha : minAlpha;
                continue;
            }
            if (shape !== 'radial') {
                throw new Error(`Unsupported alpha shape: ${shape}`);
            }

            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const ratio = Math.max(0, 1 - distance / radius);
            alphaMap[idx] = ratio > 0 ? Math.min(maxAlpha, Math.pow(ratio, 0.45) * maxAlpha) : minAlpha;
        }
    }

    return alphaMap;
}

/**
 * Forward-blend a white watermark into an ImageData-like object. The operation
 * mutates and returns imageData. Fractional position metadata is preserved by
 * sampling alpha at ix - x / iy - y; this mirrors production removal inputs.
 */
export function blendWatermarkIntoImageData(imageData, alphaMap, position, options = {}) {
    const logoValue = options.logoValue ?? 255;
    const alphaGain = options.alphaGain ?? 1;
    const alphaWidth = position.width;
    const alphaHeight = position.height;
    const startX = Math.floor(position.x);
    const startY = Math.floor(position.y);
    const endX = Math.ceil(position.x + position.width);
    const endY = Math.ceil(position.y + position.height);

    for (let y = startY; y < endY; y += 1) {
        if (y < 0 || y >= imageData.height) continue;
        for (let x = startX; x < endX; x += 1) {
            if (x < 0 || x >= imageData.width) continue;
            const alpha = Math.min(0.99, sampleAlphaNearest(alphaMap, alphaWidth, alphaHeight, x - position.x, y - position.y) * alphaGain);
            if (alpha <= 0.0001) continue;
            const idx = (y * imageData.width + x) << 2;
            for (let channel = 0; channel < 3; channel += 1) {
                const original = imageData.data[idx + channel];
                imageData.data[idx + channel] = clampByte(alpha * logoValue + (1 - alpha) * original);
            }
        }
    }

    return imageData;
}

/**
 * Extract an ImageData-like region. Out-of-bounds regions throw to keep tests
 * explicit and deterministic.
 */
export function extractRegion(imageData, region) {
    const { x, y, width, height } = region;
    assertPositiveInteger(width, 'region.width');
    assertPositiveInteger(height, 'region.height');
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + width > imageData.width || y + height > imageData.height) {
        throw new RangeError('region must be integer-bounded and inside imageData');
    }

    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row += 1) {
        const srcStart = ((y + row) * imageData.width + x) << 2;
        const srcEnd = srcStart + width * 4;
        data.set(imageData.data.slice(srcStart, srcEnd), row * width * 4);
    }
    return { width, height, data };
}

/**
 * Create a complete deterministic synthetic watermark test case.
 */
export function createSyntheticCase({
    width = 512,
    height = 512,
    watermarkWidth = 96,
    watermarkHeight = watermarkWidth,
    position = null,
    profile = 'gemini',
    backgroundType = 'gradient',
    baseColor = 128,
    seed = DEFAULT_SEED,
    alphaGain = 1,
    alphaShape = 'radial',
    maxAlpha = 0.72,
    minAlpha = 0.01,
    logoValue = 255,
    metadata = {}
} = {}) {
    const cleanImageData = createBackgroundImageData({ width, height, backgroundType, baseColor, seed });
    const watermarkedImageData = cloneImageData(cleanImageData);
    const alphaMap = createAlphaMap(watermarkWidth, watermarkHeight, { shape: alphaShape, maxAlpha, minAlpha });
    const normalizedPosition = normalizePosition(position, width, height, watermarkWidth, watermarkHeight);

    blendWatermarkIntoImageData(watermarkedImageData, alphaMap, normalizedPosition, { alphaGain, logoValue });

    return {
        cleanImageData,
        watermarkedImageData,
        alphaMap,
        position: normalizedPosition,
        profile,
        metadata: {
            width,
            height,
            watermarkWidth,
            watermarkHeight,
            backgroundType,
            seed,
            alphaGain,
            alphaShape,
            logoValue,
            ...metadata
        }
    };
}
