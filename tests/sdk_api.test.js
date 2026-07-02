import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as sdk from '../src/sdk/index.js';

describe('Public SDK API', () => {
    test('package exposes the independent fork SDK entrypoint', () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

        assert.strictEqual(pkg.name, '@lastraindrop/gemini-watermark-remover');
        assert.strictEqual(pkg.types, './src/sdk/index.d.ts');
        assert.strictEqual(pkg.exports['.'].import, './src/sdk/index.js');
        assert.strictEqual(pkg.repository.url, 'https://github.com/lastraindrop/gemini-watermark-remover.git');
    });

    test('package declares layered verification scripts', () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

        for (const scriptName of [
            'test:unit',
            'test:integration',
            'test:precision',
            'test:audit',
            'test:diagnostic',
            'test:legacy',
            'test:all',
            'test:exhaustive',
            'test:python',
            'test:stress'
        ]) {
            assert.ok(pkg.scripts[scriptName], `Missing package script: ${scriptName}`);
        }
        for (const scriptName of ['test', 'test:unit', 'test:integration', 'test:precision', 'test:audit', 'test:diagnostic', 'test:all', 'test:exhaustive']) {
            assert.ok(
                pkg.scripts[scriptName].includes('scripts/test-groups.mjs'),
                `${scriptName} should use the shared test group runner`
            );
        }
    });

    test('SDK exports supported core APIs', () => {
        for (const key of [
            'WatermarkEngine',
            'detectWatermarks',
            'detectProfileWatermarks',
            'calculateAlphaMap',
            'removeWatermark',
            'WorkerPool',
            'PROFILES',
            'calculateWatermarkPosition'
        ]) {
            assert.ok(key in sdk, `Missing SDK export: ${key}`);
        }
    });

    test('SDK imports in plain Node without a custom PNG loader', () => {
        const result = spawnSync(process.execPath, [
            '--input-type=module',
            '--eval',
            "import('./src/sdk/index.js').then(m => console.log(typeof m.WatermarkEngine))"
        ], { cwd: process.cwd(), encoding: 'utf8' });

        assert.strictEqual(result.status, 0, result.stderr);
        assert.match(result.stdout, /function/);
    });

    test('SDK quality compatibility aliases match their documented behavior', () => {
        const a = new Uint8Array([0, 64, 128, 255]);
        const b = new Uint8Array([1, 63, 130, 250]);
        assert.strictEqual(sdk.calculateSSIM(a, b), sdk.estimateQualityFromPSNR(a, b));
    });
});
