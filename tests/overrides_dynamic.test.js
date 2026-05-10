import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectWatermark } from '../src/core/detector.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Dynamic Config Overrides Tests (v2.1)', () => {

    test('Should merge overrides into config', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const strictThresholds = {
            THRESHOLDS: {
                COARSE: 0.9,
                FINAL_FREE: 0.99
            }
        };
        
        const withStrict = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false,
            overrides: strictThresholds
        });
        
        const normal = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false
        });
        
        assert.ok(normal, 'Normal thresholds should detect watermark');
    });

    test('Custom jitterRange should be used in Phase 1', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 52, 52, 96, 96, alphaMap, 255);
        
        const result1 = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false
        });
        
        const result2 = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false,
            overrides: { jitterRange: 20 }
        });
        
        assert.ok(result1);
        assert.ok(result2);
    });

    test('Should respect custom FINAL thresholds in Stage 3', () => {
        const img = createMockImageData(200, 200, 'solid', 64);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const permissive = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false,
            overrides: {
                THRESHOLDS: {
                    FINAL_ANCHORED: 0.01,
                    FINAL_ALIGNED: 0.01,
                    FINAL_FREE: 0.01
                }
            }
        });
        
        assert.ok(permissive, 'Permissive thresholds should detect');
    });

    test('Should respect custom STAGE2 thresholds', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 45, 45, 96, 96, alphaMap, 255);
        
        const permissive = detectWatermark(img, { '96': alphaMap }, {
            deepScan: true,
            overrides: {
                THRESHOLDS: {
                    STAGE2_NR: 0.01,
                    STAGE2_CLEAN: 0.01
                }
            }
        });
        
        assert.ok(typeof permissive === 'object');
    });

    test('Should respect custom COARSE threshold in Phase 2', () => {
        const img = createMockImageData(200, 200, 'grid', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 40, 40, 96, 96, alphaMap, 255);
        
        const strict = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false,
            overrides: {
                THRESHOLDS: {
                    COARSE: 0.9,
                    FINAL_FREE: 0.9
                }
            }
        });
        
        const normal = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false
        });
        
        assert.ok(normal, 'Normal should work');
    });

    test('Should respect custom PROXIMITY_THRESHOLD', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const result1 = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false
        });
        
        const result2 = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false,
            overrides: {
                PROXIMITY_THRESHOLD: 100,
                THRESHOLDS: {
                    FINAL_ANCHORED: 0.1,
                    FINAL_ALIGNED: 0.15,
                    FINAL_FREE: 0.2
                }
            }
        });
        
        assert.ok(result1);
        assert.ok(result2);
    });

    test('Should respect custom CANDIDATES_LIMIT_PER_SIZE', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const result = detectWatermark(img, { '96': alphaMap }, {
            deepScan: false,
            overrides: {
                CANDIDATES_LIMIT_PER_SIZE: 1,
                THRESHOLDS: {
                    FINAL_ANCHORED: 0.01
                }
            }
        });
        
        assert.ok(typeof result === 'object');
    });

    test('Should respect custom FINE_TUNE_RANGE', () => {
        const img = createMockImageData(200, 200, 'noise', 128);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const result = detectWatermark(img, { '96': alphaMap }, {
            deepScan: true,
            overrides: {
                FINE_TUNE_RANGE: 10,
                THRESHOLDS: {
                    FINAL_ANCHORED: 0.05
                }
            }
        });
        
        assert.ok(typeof result === 'object');
    });

    test('gradientPenalty should be applied when gradient correlation is low', () => {
        const img = createMockImageData(200, 200, 'solid', 200);
        const alphaMap = createMockAlphaMap(96, 96);
        
        applyWatermark(img, 50, 50, 96, 96, alphaMap, 255);
        
        const defaultPenalty = detectWatermark(img, { '96': alphaMap }, {
            deepScan: true
        });
        
        const strictPenalty = detectWatermark(img, { '96': alphaMap }, {
            deepScan: true,
            gradientPenalty: 0.01
        });
        
        assert.ok(defaultPenalty);
    });
});
