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
    return keys;
}

describe('Frontend Contract Verification', () => {

    test('critical DOM hooks are present in the HTML shell', () => {
        const requiredIds = [
            'fileInput',
            'uploadArea',
            'profileSelect',
            'deepScanToggle',
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
            'clearAllBtn',
            'downloadAllBtn',
            'auditConsole',
            'auditLogList',
            'loadingOverlay'
        ];

        requiredIds.forEach(id => {
            assert.ok(html.includes(`id="${id}"`), `Missing expected DOM ID in HTML: ${id}`);
        });
    });

    test('file picker is configured for image types', () => {
        assert.ok(html.includes('accept="image/*"'), 'File input should accept images');
    });

    test('all data-i18n keys exist in locale files', () => {
        const htmlKeys = extractDataI18nKeys(html);
        htmlKeys.forEach(key => {
            assert.ok(enUS[key], `Missing English translation for key: ${key}`);
            assert.ok(zhCN[key], `Missing Chinese translation for key: ${key}`);
        });
    });

    test('localized comparison controls exist in locale files', () => {
        assert.ok(enUS['view.slider'], 'en-US missing view.slider');
        assert.ok(zhCN['view.slider'], 'zh-CN missing view.slider');
    });
});
