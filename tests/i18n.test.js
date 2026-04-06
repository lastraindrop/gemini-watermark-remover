import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const i18nDir = resolve(__dirname, '../src/i18n');

describe('i18n Completeness & Consistency', () => {
    const files = readdirSync(i18nDir).filter(f => f.endsWith('.json'));
    const locales = {};
    
    files.forEach(f => {
        const content = JSON.parse(readFileSync(resolve(i18nDir, f), 'utf-8'));
        locales[f.replace('.json', '')] = content;
    });

    const enUS = locales['en-US'];
    assert.ok(enUS, 'en-US base locale should exist');
    const enKeys = Object.keys(enUS);

    for (const [locale, translations] of Object.entries(locales)) {
        if (locale === 'en-US') continue;

        test(`${locale}: All English keys should be present`, () => {
            for (const key of enKeys) {
                assert.ok(translations[key], `Missing key "${key}" in ${locale}`);
            }
        });

        test(`${locale}: Should not have extra keys not in English`, () => {
            const localeKeys = Object.keys(translations);
            for (const key of localeKeys) {
                assert.ok(enUS[key], `Extra key "${key}" in ${locale} not present in English`);
            }
        });
    }
});
