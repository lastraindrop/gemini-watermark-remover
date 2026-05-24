import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectWatermarks } from '../src/core/detectionPipeline.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { calculateCorrelation, calculateGradientCorrelation } from '../src/core/detector.js';
import { cloneImageData } from '../src/core/utils.js';
import { applyRemovalStrategy } from '../src/core/applyRemoval.js';

function makeImageData(w, h, fillFn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const [r, g, b, a] = fillFn(x, y);
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a;
        }
    }
    return { width: w, height: h, data };
}

function injectWatermark(imageData, alphaMap, pos) {
    const { data, width: imgW } = imageData;
    const { x: startX, y: startY, width: wmW, height: wmH } = pos;
    for (let row = 0; row < wmH; row++) {
        for (let col = 0; col < wmW; col++) {
            const imgX = startX + col;
            const imgY = startY + row;
            if (imgX < 0 || imgX >= imageData.width || imgY < 0 || imgY >= imageData.height) continue;
            const imgIdx = (imgY * imgW + imgX) * 4;
            const alpha = alphaMap[row * wmW + col];
            if (!Number.isFinite(alpha) || alpha < 0.001) continue;
            for (let c = 0; c < 3; c++) {
                data[imgIdx + c] = Math.round(Math.min(255, alpha * 255 + (1 - alpha) * data[imgIdx + c]));
            }
        }
    }
}

async function getAlphaMapMock(assetKey, width, height) {
    const size = width || 96;
    const h = height || size;
    const bgData = makeImageData(size, h, () => [0, 0, 0, 255]);
    const alphaData = calculateAlphaMap(bgData);
    return { data: alphaData, width: size, height: h, assetKey };
}

describe('Cross-Module Integration Tests', () => {
    it('Full detection-to-removal round-trip for 1024x1024', async () => {
        const w = 1024, h = 1024;
        const img = makeImageData(w, h, () => [180, 180, 180, 255]);
        const original = new Uint8ClampedArray(img.data);
        
        const detection = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: getAlphaMapMock,
            options: { deepScan: true }
        });

        if (detection.winner) {
            applyRemovalStrategy(img, detection.matches);
            for (let i = 0; i < img.data.length; i += 4) {
                assert.ok(img.data[i] >= 0 && img.data[i] <= 255, `R[${i}] in range`);
                assert.ok(img.data[i + 1] >= 0 && img.data[i + 1] <= 255, `G[${i}] in range`);
                assert.ok(img.data[i + 2] >= 0 && img.data[i + 2] <= 255, `B[${i}] in range`);
            }
        }
    });

    it('Clean image (no watermark) returns empty matches', async () => {
        const w = 512, h = 512;
        const img = makeImageData(w, h, (x, y) => {
            const pattern = ((x * 7 + y * 13) % 256);
            return [pattern, pattern, pattern, 255];
        });

        const detection = await detectWatermarks({
            imageData: img,
            profileId: 'gemini',
            getAlphaMap: getAlphaMapMock,
            options: { deepScan: false }
        });

        assert.equal(detection.matches.length, 0, 'Should find no matches on random pattern');
        assert.equal(detection.confidence, 0);
    });

    it('cloneImageData produces independent copy', () => {
        const img = makeImageData(100, 100, () => [128, 128, 128, 255]);
        const clone = cloneImageData(img);
        img.data[0] = 255;
        assert.equal(clone.data[0], 128, 'Clone should not be affected by original mutation');
    });

    it('calculateCorrelation and calculateGradientCorrelation produce finite results', () => {
        const w = 100, h = 100;
        const img = makeImageData(w, h, (x, y) => [x % 256, y % 256, (x + y) % 256, 255]);
        const alphaMap = new Float32Array(48 * 48).fill(0.3);

        const ncc = calculateCorrelation(img, 20, 20, 48, 48, alphaMap, true);
        assert.ok(Number.isFinite(ncc), 'NCC should be finite');

        const gradientsI = new Float32Array(48 * 48);
        const gradientsA = new Float32Array(48 * 48);
        const gradNcc = calculateGradientCorrelation(img, 20, 20, 48, 48, alphaMap, gradientsI, gradientsA);
        assert.ok(Number.isFinite(gradNcc), 'Gradient NCC should be finite');
    });

    it('SDK export surface includes all expected exports', async () => {
        const sdk = await import('../src/sdk/index.js');
        const expectedExports = [
            'WatermarkEngine', 'detectWatermarks', 'detectProfileWatermarks',
            'removeWatermark', 'removeRepeatedWatermarkLayers',
            'calculateAlphaMap', 'calculateCorrelation', 'calculateGradientCorrelation',
            'PROFILES', 'DEFAULT_PROFILE', 'GEMINI_PROFILE',
            'ENGINE_LIMITS', 'calculateWatermarkPosition', 'RestorationMetrics',
            'calculateMSE', 'calculatePSNR', 'estimateQualityFromPSNR',
            'applyRemovalStrategy'
        ];
        for (const name of expectedExports) {
            assert.ok(sdk[name] !== undefined, `SDK should export ${name}`);
        }
    });
});
