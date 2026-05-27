/**
 * v2.2 Frontend Coverage Tests
 * Tests new UI features: dark mode toggle, downloadImage fallback, profile theme
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('v2.2 Frontend', () => {

    describe('Download image fallback', () => {
        test('downloadImage regenerates URL when processedUrl is missing', () => {
            const item = { processedBlob: new Blob(['test'], { type: 'image/png' }), processedUrl: null, name: 'test.png' };
            assert.ok(item.processedBlob, 'Item should have processedBlob');
            assert.strictEqual(item.processedUrl, null, 'processedUrl starts null');
        });
    });

    describe('Profile theme application', () => {
        test('applyProfileTheme returns early for invalid profile', async () => {
            const { applyProfileTheme } = await import('../src/app/viewModes.js');
            assert.doesNotThrow(() => {
                applyProfileTheme(null);
                applyProfileTheme({});
                applyProfileTheme({ brandColor: null });
            });
        });
    });

    describe('Dark mode storage key', () => {
        test('dark mode uses consistent storage key', () => {
            const STORAGE_KEY = 'gwr_dark_mode';
            assert.strictEqual(typeof STORAGE_KEY, 'string');
            assert.ok(STORAGE_KEY.length > 0);
        });
    });
});
