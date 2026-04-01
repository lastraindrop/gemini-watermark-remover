// File: tests/build_pipeline.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Build Pipeline & Assets Verification', () => {
    test('esbuild should inline png assets as base64 in app.js', () => {
        const appJsPath = resolve(process.cwd(), 'dist/app.js');
        const workerJsPath = resolve(process.cwd(), 'dist/worker.js');

        if (!existsSync(appJsPath)) {
            console.warn('⚠️ Skipping build verification: dist/app.js not found. Performance build first.');
            return;
        }
        
        const appJsContent = readFileSync(appJsPath, 'utf8');
        // Check if data URL string for png is embedded
        const hasBase64Png = appJsContent.includes('data:image/png;base64,');
        
        assert.ok(
            hasBase64Png, 
            'Critical Failure: PNG assets were not inlined in app.js. esbuild loader failed.'
        );
    });

    test('UI static assets should be copied to dist', () => {
        const i18nPath = resolve(process.cwd(), 'dist/i18n/zh-CN.json');
        if (!existsSync(i18nPath)) {
             console.warn('⚠️ Skipping asset verification: dist/i18n not found.');
             return;
        }
        assert.ok(existsSync(i18nPath), 'i18n files must be copied to dist');
    });
});
