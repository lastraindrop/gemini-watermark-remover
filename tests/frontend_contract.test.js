import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve(process.cwd(), 'public/index.html');
const enPath = resolve(process.cwd(), 'src/i18n/en-US.json');
const zhPath = resolve(process.cwd(), 'src/i18n/zh-CN.json');

const html = readFileSync(htmlPath, 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/app.js'), 'utf8');
const processingSource = readFileSync(resolve(process.cwd(), 'src/app/processing.js'), 'utf8');
const userscriptSource = readFileSync(resolve(process.cwd(), 'src/userscript/index.js'), 'utf8');
const cssSource = readFileSync(resolve(process.cwd(), 'public/index.css'), 'utf8');
const i18nSource = readFileSync(resolve(process.cwd(), 'src/i18n.js'), 'utf8');
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

    test('window-level drag and drop is wired for files and folders', () => {
        assert.ok(appSource.includes("window.addEventListener('drop'"), 'Window drop handler should allow dropping files anywhere');
        assert.ok(appSource.includes('handleDataTransferItems'), 'Directory drag entries should be traversed');
        assert.ok(appSource.includes('readAllEntries'), 'Directory traversal should read all Chrome entry batches');
    });

    test('dragged image files can pass validation even when browser omits MIME type', () => {
        assert.ok(appSource.includes('isSupportedImageFile'), 'File validation should have a shared helper');
        assert.ok(appSource.includes('/\\.(jpe?g|png|webp)$/i'), 'File validation should fall back to image extensions');
    });

    test('batch download uses a ZIP bundle instead of many browser downloads', () => {
        assert.ok(processingSource.includes("import JSZip from 'jszip'"), 'Batch export should use JSZip');
        assert.ok(processingSource.includes('downloadAllAsZip'), 'ZIP batch export function should be present');
        assert.ok(appSource.includes('downloadAllAsZip'), 'Download All button should call ZIP export');
    });

    test('batch queue yields to the browser and avoids fixed four-way main-thread pressure', () => {
        assert.ok(processingSource.includes('yieldToBrowser'), 'Batch queue should yield between CPU-heavy items');
        assert.ok(processingSource.includes('getBatchConcurrency'), 'Batch concurrency should be adaptive');
        assert.ok(!processingSource.includes('const CONCURRENCY = 4'), 'Fixed four-way frontend processing causes UI stalls');
    });

    test('scanner animation only runs while work is active', () => {
        assert.ok(cssSource.includes('.scanner-effect.is-processing::after'), 'Scanner animation should be gated by processing state');
        assert.ok(appSource.includes('is-processing'), 'Batch cards should mark active scanning state');
        assert.ok(appSource.includes("classList.remove('is-processing')"), 'Batch cards should stop scanner animation after processing');
    });

    test('language selector has readable labels and visible option styling', () => {
        ['Chinese', 'English', 'Japanese', 'Russian', 'French', 'Spanish', 'German'].forEach(label => {
            assert.ok(i18nSource.includes(`label: '${label}'`), `Missing readable language label: ${label}`);
        });
        assert.ok(cssSource.includes('#langSelect'), 'Language selector should have explicit styling');
        assert.ok(cssSource.includes('select option'), 'Native select options need explicit foreground/background colors');
    });

    test('image encoding failures are handled explicitly', () => {
        assert.ok(processingSource.includes('Failed to encode processed image as PNG'), 'Frontend should reject null canvas.toBlob results');
        assert.ok(userscriptSource.includes('Failed to encode processed image'), 'Userscript should reject null canvas.toBlob results');
    });

    test('userscript avoids production console.log noise and revokes transient URLs on failure paths', () => {
        assert.ok(!userscriptSource.includes('console.log'), 'Userscript should not emit production console.log noise');
        assert.ok(userscriptSource.includes('finally'), 'Userscript transient object URLs should be revoked from finally blocks');
        assert.ok(userscriptSource.includes('URL.revokeObjectURL(blobUrl)'), 'Fetch interception blob URLs must be revoked');
    });
});
