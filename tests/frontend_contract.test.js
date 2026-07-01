import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve(process.cwd(), 'public/index.html');
const enPath = resolve(process.cwd(), 'src/i18n/en-US.json');
const zhPath = resolve(process.cwd(), 'src/i18n/zh-CN.json');

const html = readFileSync(htmlPath, 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/app.js'), 'utf8');
const dragDropSource = readFileSync(resolve(process.cwd(), 'src/app/dragDrop.js'), 'utf8');
const manualSelectionSource = readFileSync(resolve(process.cwd(), 'src/app/manualSelection.js'), 'utf8');
const processingSource = readFileSync(resolve(process.cwd(), 'src/app/processing.js'), 'utf8');
const userscriptSource = readFileSync(resolve(process.cwd(), 'src/userscript/index.js'), 'utf8');
const cssSource = readFileSync(resolve(process.cwd(), 'src/tailwind.css'), 'utf8')
    + readFileSync(resolve(process.cwd(), 'public/index.css'), 'utf8');
const settingsSource = readFileSync(resolve(process.cwd(), 'src/app/settings.js'), 'utf8');
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
            'deepScanBadge',
            'noiseReductionBadge',
            'autoDownloadToggle',
            'manualUseDetectedBtn',
            'manualClearBtn',
            'manualReprocessBtn',
            'manualSelectCanvas',       // v2.6: replaced singlePreview manualSelectionLayer
            'manualSelectBox',          // v2.6: replaced singlePreview manualSelectionBox
            'multiPreview',
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

    test('profile selector lists the supported registry directly', () => {
        assert.ok(appSource.includes('getAllProfiles().forEach'), 'Profile selector should use the supported registry');
    });

    test('localized comparison controls exist in locale files', () => {
        assert.ok(enUS['view.slider'], 'en-US missing view.slider');
        assert.ok(zhCN['view.slider'], 'zh-CN missing view.slider');
    });

    test('window-level drag and drop is wired for files and folders', () => {
        const dropSource = dragDropSource + appSource;
        assert.ok(dropSource.includes("window.addEventListener('drop'"), 'Window drop handler should allow dropping files anywhere');
        assert.ok(dragDropSource.includes('handleDataTransferItems'), 'Directory drag entries should be traversed');
        assert.ok(dragDropSource.includes('readAllEntries'), 'Directory traversal should read all Chrome entry batches');
    });

    test('dragged image files can pass validation even when browser omits MIME type', () => {
        assert.ok(dragDropSource.includes('isSupportedImageFile'), 'File validation should have a shared helper');
        assert.ok(dragDropSource.includes('/\\.(jpe?g|png|webp)$/i'), 'File validation should fall back to image extensions');
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

    test('single-image manual mode can select and reprocess a region', () => {
        assert.ok(appSource.includes('setupManualSelection'), 'App should wire manual region selection');
        assert.ok(appSource.includes('reprocessSingleWithManualArea'), 'App should support single-image manual reprocessing');
        assert.ok(appSource.includes('useDetectedAreaForManualMode'), 'App should seed manual mode from the latest detected region');
        assert.ok(appSource.includes('lastDetectedRegion'), 'Detected regions should be retained for manual follow-up');
        // Coordinate mapping is done inline via getImageMetrics + clamp, not a named clientToImagePoint function
        assert.ok(manualSelectionSource.includes('getImageMetrics'), 'Manual selection should compute image metrics for coordinate mapping');
        assert.ok(manualSelectionSource.includes('writeManualRegion'), 'Manual selection should populate manual coordinate inputs');
        assert.ok(manualSelectionSource.includes('clearManualRegion'), 'Manual selection should support clearing stale coordinates');
        assert.ok(settingsSource.includes('optionalManual'), 'Initial single-image upload should not require a manual area');
        assert.ok(dragDropSource.includes('ignoreManual'), 'Batch processing should not inherit single-image manual regions');
        assert.ok(dragDropSource.includes('setManualSelectionEnabled(elements, false)') || appSource.includes('setManualSelectionEnabled(elements, false)'), 'New uploads should not keep a stale overlay active');
        assert.ok(processingSource.includes('item.originalImg || await loadImage'), 'Manual reprocess should reuse the loaded source image');
        assert.ok(processingSource.includes('objectUrlManager.revoke(item.processedUrl)'), 'Manual reprocess should revoke superseded result URLs');
    });

    test('manual template selector supports auto profile-aware asset resolution', () => {
        assert.ok(html.includes('name="manualTemplateSize" value="auto"'), 'Manual template selector should expose an Auto option');
        assert.ok(html.includes('data-i18n="manual.templateAuto"'), 'Auto template label should be localizable');
        assert.ok(settingsSource.includes('resolveManualAssetKey'), 'Settings layer should resolve manual template asset keys');
        assert.ok(settingsSource.includes('return `${width}x${height}`;'), 'Rectangular profiles should use WxH manual asset keys');
    });

    test('mobile batch layout and toast container avoid narrow viewport overflow', () => {
        const multiPreview = html.match(/<section[^>]+id="multiPreview"[^>]+class="([^"]+)"/)?.[1] || '';
        const toastContainer = html.match(/<div[^>]+id="toastContainer"[^>]+class="([^"]+)"/)?.[1] || '';
        assert.ok(multiPreview.includes('mt-14'), 'Batch preview should reduce excessive mobile top spacing');
        assert.ok(html.includes('flex flex-col sm:flex-row'), 'Batch header should stack on mobile');
        assert.ok(toastContainer.includes('left-4') && toastContainer.includes('right-4'), 'Toasts should be constrained on mobile');
        assert.ok(cssSource.includes('break-words') || readFileSync(resolve(process.cwd(), 'src/app/ui.js'), 'utf8').includes('break-words'), 'Toast text should wrap instead of overflowing');
    });

    test('batch compare toggle exposes accessible pressed state', () => {
        assert.ok(dragDropSource.includes("compareBadge.type = 'button'"), 'Compare toggle should have explicit button type');
        assert.ok(dragDropSource.includes("aria-pressed"), 'Compare toggle should expose pressed state');
        assert.ok(dragDropSource.includes("aria-label"), 'Compare toggle should keep a readable label');
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
        ['中', 'EN', '日', 'RU', 'FR', 'ES', 'DE'].forEach(label => {
            assert.ok(i18nSource.includes(`shortLabel: '${label}'`), `Missing compact language label: ${label}`);
        });
        assert.ok(cssSource.includes('#langSelect'), 'Language selector should have explicit styling');
        assert.ok(cssSource.includes('appearance: none'), 'Language selector should not depend on native browser chrome');
        assert.ok(cssSource.includes('background-color: rgba(15, 23, 42, 0.92)'), 'Language selector needs explicit dark mode contrast');
        assert.ok(cssSource.includes('select option'), 'Native select options need explicit foreground/background colors');
    });

    test('localized hero title does not rely on nested markup that i18n replaces', () => {
        const heroTitle = html.match(/<h2[^>]+data-i18n="main\.title"[^>]*>[\s\S]*?<\/h2>/)?.[0] || '';
        assert.ok(heroTitle, 'Hero title should be present');
        assert.ok(!/<br\b|<span\b/.test(heroTitle), 'Hero title markup is replaced by i18n.textContent');
        assert.ok(heroTitle.includes('break-words'), 'Hero title should avoid mobile overflow');
    });

    test('dark mode background and mobile debug console do not break first screen readability', () => {
        assert.ok(cssSource.includes('background-color: #020617'), 'Dark mode must set a real dark page background');
        const auditConsole = html.match(/<div[^>]+id="auditConsole"[^>]+class="([^"]+)"/)?.[1] || '';
        assert.ok(auditConsole.includes('hidden md:flex'), 'Audit console should not cover mobile upload controls');
    });

    test('decorative mesh blobs are not present to avoid constant animation cost', () => {
        // Mesh blobs were removed entirely — no .mesh-blob rule in CSS, no mesh-blob elements in HTML.
        // This is the correct fix: absence is better than display:none on animated elements.
        assert.ok(!cssSource.includes('.mesh-blob'), 'Mesh blob CSS rule should not be present');
        assert.ok(!html.includes('mesh-blob'), 'Mesh blob HTML elements should not be present');
    });

    test('image encoding failures are handled explicitly', () => {
        // Frontend uses i18n key for the error message, not a hardcoded string
        assert.ok(processingSource.includes('error.encodeFailed'), 'Frontend should throw on null canvas.toBlob results via i18n key');
        assert.ok(userscriptSource.includes('Failed to encode processed image'), 'Userscript should reject null canvas.toBlob results');
    });

    test('userscript avoids production console.log noise and revokes transient URLs on failure paths', () => {
        assert.ok(!userscriptSource.includes('console.log'), 'Userscript should not emit production console.log noise');
        assert.ok(userscriptSource.includes('finally'), 'Userscript transient object URLs should be revoked from finally blocks');
        assert.ok(userscriptSource.includes('URL.revokeObjectURL(blobUrl)'), 'Fetch interception blob URLs must be revoked');
    });
});
