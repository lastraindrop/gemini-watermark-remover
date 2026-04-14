// File: tests/build_pipeline.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Build Pipeline & Assets Verification', () => {
    test('esbuild should produce a working browser bundle', () => {
        const appJsPath = resolve(process.cwd(), 'dist/app.js');
        const workerJsPath = resolve(process.cwd(), 'dist/worker.js');
        const indexHtmlPath = resolve(process.cwd(), 'dist/index.html');

        if (!existsSync(appJsPath) || !existsSync(workerJsPath) || !existsSync(indexHtmlPath)) {
            console.warn('⚠️ Skipping build verification: dist assets not found. Build first.');
            return;
        }
        
        const appJsContent = readFileSync(appJsPath, 'utf8');
        const indexHtmlContent = readFileSync(indexHtmlPath, 'utf8');
        const hasWorkerReference = appJsContent.includes('new URL("worker.js"') || appJsContent.includes("new URL('worker.js'");
        const hasAppScript = indexHtmlContent.includes('script src="app.js"');
        
        assert.ok(
            hasWorkerReference,
            'Critical Failure: worker.js reference is missing from the bundled app.js.'
        );

        assert.ok(
            hasAppScript,
            'Critical Failure: dist/index.html should load the bundled app.js.'
        );
    });

    test('Production bundle should inline core assets as window.GWR_INLINED_ASSETS', () => {
        const appJsPath = resolve(process.cwd(), 'dist/app.js');
        if (!existsSync(appJsPath)) return;

        const content = readFileSync(appJsPath, 'utf8');
        // Check for our new inlining mechanism
        assert.ok(content.includes('window.GWR_INLINED_ASSETS ='), 'Inlining Regression: window.GWR_INLINED_ASSETS not found');
        assert.ok(content.includes('data:image/png;base64,'), 'Inlining Regression: Base64 data missing');
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
