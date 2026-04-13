import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve(process.cwd(), 'public/index.html');
const enPath = resolve(process.cwd(), 'src/i18n/en-US.json');
const zhPath = resolve(process.cwd(), 'src/i18n/zh-CN.json');

const html = readFileSync(htmlPath, 'utf8');
const enUS = JSON.parse(readFileSync(enPath, 'utf8'));
const zhCN = JSON.parse(readFileSync(zhPath, 'utf8'));

function extractDataI18nKeys(sourceHtml) {
    const keys = new Set();
    const pattern = /data-i18n="([^"]+)"/g;
    let match;
    while ((match = pattern.exec(sourceHtml)) !== null) {
        keys.add(match[1]);
    }
    return [...keys].sort();
}

describe('Frontend Contract', () => {
    test('critical DOM hooks are present in the HTML shell', () => {
        const requiredIds = [
            'fileInput',
            'uploadArea',
            'profileSelect',
            'deepScanToggle',
            'noiseReductionToggle',
            'autoDownloadToggle',
            'singlePreview',
            'multiPreview',
            'comparisonSlider',
            'sideBySideView',
            'sideOriginal',
            'sideProcessed',
            'modeSliderBtn',
            'modeSideBtn',
            'downloadBtn',
            'copyBtn',
            'resetBtn',
            'clearAllBtn',
            'downloadAllBtn',
            'auditConsole',
            'auditLogList',
            'loadingOverlay'
        ];

        for (const id of requiredIds) {
            assert.ok(html.includes(`id="${id}"`), `Missing #${id} in public/index.html`);
        }
    });

    test('file picker is configured for the supported image types', () => {
        assert.match(
            html,
            /<input[^>]+id="fileInput"[^>]+type="file"[^>]+accept="image\/jpeg,image\/png,image\/webp"[^>]+multiple[^>]*>/,
            'fileInput should accept jpeg/png/webp and support multi-select'
        );
    });

    test('global error banner is guarded against missing body', () => {
        assert.ok(
            html.includes('document.body || document.documentElement'),
            'Global error boundary should fall back to documentElement when body is unavailable'
        );
    });

    test('all data-i18n keys in the shell exist in both base locales', () => {
        const keys = extractDataI18nKeys(html);
        for (const key of keys) {
            assert.ok(Object.prototype.hasOwnProperty.call(enUS, key), `Missing ${key} in en-US`);
            assert.ok(Object.prototype.hasOwnProperty.call(zhCN, key), `Missing ${key} in zh-CN`);
        }
    });

    test('localized comparison controls are part of the shell contract', () => {
        assert.ok(html.includes('data-i18n="view.slider"'), 'Slider comparison label should be localized');
        assert.ok(html.includes('data-i18n="view.sideBySide"'), 'Side-by-side comparison label should be localized');
        assert.strictEqual(enUS['view.slider'], 'Slider');
        assert.strictEqual(enUS['view.sideBySide'], 'Side-by-Side');
        assert.strictEqual(zhCN['view.slider'], '滑动对比');
        assert.strictEqual(zhCN['view.sideBySide'], '左右对比');
    });
});
