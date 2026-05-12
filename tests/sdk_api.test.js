import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

        for (const scriptName of ['test:unit', 'test:legacy', 'test:all', 'test:python', 'test:stress']) {
            assert.ok(pkg.scripts[scriptName], `Missing package script: ${scriptName}`);
        }
    });

    test('SDK exports supported core APIs', () => {
        for (const key of [
            'WatermarkEngine',
            'detectWatermarks',
            'detectProfileWatermarks',
            'calculateAlphaMap',
            'removeWatermark',
            'PROFILES',
            'calculateWatermarkPosition'
        ]) {
            assert.ok(key in sdk, `Missing SDK export: ${key}`);
        }
    });
});
