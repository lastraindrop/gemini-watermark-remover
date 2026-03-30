import { test, describe } from 'node:test';
import assert from 'node:assert';
import { GEMINI_SIZE_CATALOG, getCatalogConfig } from '../src/core/catalog.js';
import { detectWatermarkConfig } from '../src/core/config.js';

describe('Parameter Protocol Consistency Tests', () => {

    test('All GEMINI_SIZE_CATALOG entries must produce valid protocol-compliant configs', () => {
        for (const entry of GEMINI_SIZE_CATALOG) {
            const config = getCatalogConfig(entry.width, entry.height);
            
            assert.ok(config, `Missing config for catalog entry: ${entry.width}x${entry.height}`);
            
            // Required properties from Protocol
            assert.strictEqual(typeof config.logoSize, 'number', `Missing logoSize for ${entry.width}x${entry.height}`);
            assert.strictEqual(typeof config.marginRight, 'number', `Missing marginRight for ${entry.width}x${entry.height}`);
            assert.strictEqual(typeof config.marginBottom, 'number', `Missing marginBottom for ${entry.width}x${entry.height}`);
            assert.strictEqual(config.isOfficial, true, `Entry should be marked as official: ${entry.width}x${entry.height}`);
            
            // Value constraints
            assert.ok([48, 96].includes(config.logoSize), `Invalid logoSize: ${config.logoSize}`);
            assert.ok(config.marginRight >= 0, `Negative marginRight: ${config.marginRight}`);
            assert.ok(config.marginBottom >= 0, `Negative marginBottom: ${config.marginBottom}`);
        }
    });

    test('Heuristic fallback must also follow the protocol (logoSize, marginRight, marginBottom)', () => {
        // Non-standard large image
        const largeConfig = detectWatermarkConfig(5000, 5000);
        assert.strictEqual(typeof largeConfig.logoSize, 'number');
        assert.strictEqual(typeof largeConfig.marginRight, 'number');
        assert.strictEqual(typeof largeConfig.marginBottom, 'number');
        assert.strictEqual(largeConfig.logoSize, 96);

        // Non-standard small image
        const smallConfig = detectWatermarkConfig(300, 300);
        assert.strictEqual(typeof smallConfig.logoSize, 'number');
        assert.strictEqual(typeof smallConfig.marginRight, 'number');
        assert.strictEqual(typeof smallConfig.marginBottom, 'number');
        assert.strictEqual(smallConfig.logoSize, 48);
    });

    test('Anti-regression: "margin" property should NOT exist (prefer specific marginRight/Bottom)', () => {
        const config = detectWatermarkConfig(1024, 1024);
        assert.strictEqual(config.margin, undefined, 'Legacy "margin" property detected! Use marginRight/marginBottom instead.');
    });
});
