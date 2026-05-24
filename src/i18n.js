import zhCN from './i18n/zh-CN.json' with { type: 'json' };
import enUS from './i18n/en-US.json' with { type: 'json' };
import ruRU from './i18n/ru-RU.json' with { type: 'json' };
import frFR from './i18n/fr-FR.json' with { type: 'json' };
import jaJP from './i18n/ja-JP.json' with { type: 'json' };
import esES from './i18n/es-ES.json' with { type: 'json' };
import deDE from './i18n/de-DE.json' with { type: 'json' };

const translations = {
    'zh-CN': zhCN,
    'en-US': enUS,
    'ru-RU': ruRU,
    'fr-FR': frFR,
    'ja-JP': jaJP,
    'es-ES': esES,
    'de-DE': deDE
};

export const supportedLanguages = [
    { code: 'zh-CN', label: 'Chinese', shortLabel: '中' },
    { code: 'en-US', label: 'English', shortLabel: 'EN' },
    { code: 'ja-JP', label: 'Japanese', shortLabel: '日' },
    { code: 'ru-RU', label: 'Russian', shortLabel: 'RU' },
    { code: 'fr-FR', label: 'French', shortLabel: 'FR' },
    { code: 'es-ES', label: 'Spanish', shortLabel: 'ES' },
    { code: 'de-DE', label: 'German', shortLabel: 'DE' }
];

const i18n = {
  locale: (typeof localStorage !== 'undefined' ? localStorage.getItem('locale') : null) ||
          (typeof navigator !== 'undefined' ?
            (navigator.language?.startsWith('zh') ? 'zh-CN' :
             navigator.language?.startsWith('ru') ? 'ru-RU' :
             navigator.language?.startsWith('fr') ? 'fr-FR' :
             navigator.language?.startsWith('ja') ? 'ja-JP' :
             navigator.language?.startsWith('es') ? 'es-ES' :
             navigator.language?.startsWith('de') ? 'de-DE' : 'en-US')
          : 'en-US'),
  translations: {},

  async init() {
    await this.loadTranslations(this.locale);
    this.applyTranslations();
  },

  async loadTranslations(locale) {
    this.translations = translations[locale] || translations['en-US'];
    this.locale = locale;
    localStorage.setItem('locale', locale);
  },

  t(key, params = {}) {
    let text = this.translations[key] || translations['en-US'][key] || key;
    if (typeof text === 'string') {
      const replacements = { year: new Date().getFullYear(), ...params };
      Object.entries(replacements).forEach(([name, value]) => {
        text = text.replaceAll(`{{${name}}}`, value);
      });
    }
    return text;
  },

  applyTranslations() {
    document.documentElement.lang = this.locale;
    document.title = this.t('title');

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = this.t(key);
      if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
        el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = this.t('main.subtitle');
  },

  async switchLocale(locale) {
    await this.loadTranslations(locale);
    this.applyTranslations();
  }
};

export default i18n;
