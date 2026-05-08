import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve(process.cwd(), 'public/index.html');
const enPath = resolve(process.cwd(), 'src/i18n/en-US.json');
const zhPath = resolve(process.cwd(), 'src/i18n/zh-CN.json');

const html = readFileSync(htmlPath, 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/app.js'), 'utf8');
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
            'folderInput',
            'chooseFileBtn',
            'chooseFolderBtn',
            'uploadArea',
            'profileSelect',
            'deepScanToggle',
            'noiseReductionToggle',
            'autoDownloadToggle',
            'singlePreview',
            'multiPreview',
            'statConfidence',
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
            'auditConsoleToggle',
            'auditLogList',
            'loadingOverlay'
        ];

        requiredIds.forEach(id => {
            assert.ok(html.includes(`id="${id}"`), `Missing expected DOM ID in HTML: ${id}`);
        });
    });

    test('file and folder pickers are separated', () => {
        const fileInput = html.match(/<input[^>]+id="fileInput"[^>]+>/)?.[0] || '';
        const folderInput = html.match(/<input[^>]+id="folderInput"[^>]+>/)?.[0] || '';

        assert.ok(fileInput.includes('accept="image/jpeg,image/png,image/webp"'), 'File input should accept supported image MIME types');
        assert.ok(!fileInput.includes('webkitdirectory'), 'File input should not open the folder picker');
        assert.ok(folderInput.includes('webkitdirectory'), 'Folder input should support directory selection');
    });

    test('HTML shell does not rely on inline click handlers', () => {
        assert.ok(!html.includes('onclick='), 'Inline click handlers bypass the app event wiring');
    });

    test('batch card rendering does not interpolate filenames into HTML', () => {
        assert.ok(!/innerHTML\s*=\s*`[\s\S]*\$\{item\.name\}/.test(appSource), 'Filenames should be rendered with textContent');
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
