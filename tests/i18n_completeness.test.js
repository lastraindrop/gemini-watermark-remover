import { test, describe } from 'node:test';
import assert from 'node:assert';
import zhCN from '../src/i18n/zh-CN.json' with { type: 'json' };
import enUS from '../src/i18n/en-US.json' with { type: 'json' };
import jaJP from '../src/i18n/ja-JP.json' with { type: 'json' };
import ruRU from '../src/i18n/ru-RU.json' with { type: 'json' };
import frFR from '../src/i18n/fr-FR.json' with { type: 'json' };
import esES from '../src/i18n/es-ES.json' with { type: 'json' };
import deDE from '../src/i18n/de-DE.json' with { type: 'json' };

describe('i18n Completeness Tests', () => {
    const allLocales = {
        'zh-CN': zhCN,
        'en-US': enUS,
        'ja-JP': jaJP,
        'ru-RU': ruRU,
        'fr-FR': frFR,
        'es-ES': esES,
        'de-DE': deDE
    };

    test('All locales should have same keys', () => {
        const keysets = Object.entries(allLocales).map(([name, locale]) => {
            return { name, keys: new Set(Object.keys(locale)) };
        });
        
        const reference = keysets[0];
        
        for (let i = 1; i < keysets.length; i++) {
            const current = keysets[i];
            
            for (const key of reference.keys) {
                assert.ok(current.keys.has(key), 
                    `${current.name} missing key: ${key} (present in ${reference.name})`);
            }
            
            for (const key of current.keys) {
                assert.ok(reference.keys.has(key), 
                    `${current.name} has extra key: ${key} (not in ${reference.name})`);
            }
        }
    });

    test('No locale has empty string values', () => {
        Object.entries(allLocales).forEach(([name, locale]) => {
            Object.entries(locale).forEach(([key, value]) => {
                assert.ok(typeof value === 'string',
                    `${name}.${key} is not a string`);
                assert.ok(value.trim().length > 0,
                    `${name}.${key} is empty or whitespace only`);
            });
        });
    });

    test('Parameterized keys should have matching {{}} placeholders', () => {
        const paramKeys = [
            'toast.downloading',
            'toast.batchComplete',
            'toast.removed',
            'toast.invalidFiles',
            'footer.copyright'
        ];
        
        Object.entries(allLocales).forEach(([name, locale]) => {
            paramKeys.forEach(key => {
                if (locale[key]) {
                    const value = locale[key];
                    const placeholderPattern = /\{\{(\w+)\}\}/g;
                    const matches = [...value.matchAll(placeholderPattern)];
                    
                    assert.ok(matches.length > 0 || 
                        !['toast.downloading', 'toast.batchComplete', 'toast.removed', 'toast.invalidFiles', 'footer.copyright'].includes(key),
                        `${name}.${key} should have placeholders but found none: ${value}`);
                }
            });
        });
    });

    test('supportedLanguages matches available JSON files', async () => {
        import('../src/i18n.js').then(mod => {
            const supported = mod.supportedLanguages;
            
            assert.ok(Array.isArray(supported));
            assert.ok(supported.length >= 7);
            
            supported.forEach(lang => {
                assert.ok(allLocales[lang.code], 
                    `supportedLanguages mentions ${lang.code} but no JSON file found`);
            });
        });
    });

    test('i18n.t should return fallback for missing key', async () => {
        import('../src/i18n.js').then(mod => {
            const i18n = mod.default;
            i18n.locale = 'en-US';
            i18n.translations = enUS;
            
            const result = i18n.t('non.existent.key.that.will.never.exist');
            assert.strictEqual(result, 'non.existent.key.that.will.never.exist');
        });
    });

    test('i18n.t should substitute parameters', async () => {
        import('../src/i18n.js').then(mod => {
            const i18n = mod.default;
            i18n.locale = 'en-US';
            i18n.translations = { test: 'Hello {{name}}, you are {{age}} years old' };
            
            const result = i18n.t('test', { name: 'World', age: 42 });
            assert.strictEqual(result, 'Hello World, you are 42 years old');
        });
    });

    test('i18n.t should return array value as-is', async () => {
        import('../src/i18n.js').then(mod => {
            const i18n = mod.default;
            i18n.locale = 'en-US';
            const arr = ['item1', 'item2'];
            i18n.translations = { test_array: arr };
            
            const result = i18n.t('test_array');
            assert.deepStrictEqual(result, arr);
        });
    });

    test('i18n.t should handle year parameter substitution', async () => {
        import('../src/i18n.js').then(mod => {
            const i18n = mod.default;
            i18n.locale = 'en-US';
            i18n.translations = enUS;
            
            const year = new Date().getFullYear();
            const copyright = i18n.t('footer.copyright');
            
            assert.ok(copyright.includes(String(year)) || copyright.includes('{{year}}'),
                `Copyright should include year or placeholder, got: ${copyright}`);
        });
    });

    test('All locales should have essential UI keys', () => {
        const essentialKeys = [
            'title',
            'brand.name',
            'upload.text',
            'btn.download',
            'settings.deepScan',
            'settings.noiseReduction',
            'view.slider',
            'view.sideBySide',
            'toast.removed',
            'status.processing',
            'status.success',
            'status.failed',
            'detection.official',
            'detection.heuristic'
        ];
        
        Object.entries(allLocales).forEach(([name, locale]) => {
            essentialKeys.forEach(key => {
                assert.ok(Object.keys(locale).includes(key),
                    `${name} missing essential key: ${key}`);
            });
        });
    });
});
