import zhCN from './i18n/zh-CN.json';
import enUS from './i18n/en-US.json';
import ruRU from './i18n/ru-RU.json';
import frFR from './i18n/fr-FR.json';
import jaJP from './i18n/ja-JP.json';

const translations = {
    'zh-CN': zhCN,
    'en-US': enUS,
    'ru-RU': ruRU,
    'fr-FR': frFR,
    'ja-JP': jaJP
};

const i18n = {
  locale: (typeof localStorage !== 'undefined' ? localStorage.getItem('locale') : null) || 
          (typeof navigator !== 'undefined' ? 
            (navigator.language?.startsWith('zh') ? 'zh-CN' : 
             navigator.language?.startsWith('ru') ? 'ru-RU' :
             navigator.language?.startsWith('fr') ? 'fr-FR' :
             navigator.language?.startsWith('ja') ? 'ja-JP' : 'en-US') 
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

  t(key) {
    let text = this.translations[key] || key;
    if (typeof text === 'string') {
      text = text.replace('{{year}}', new Date().getFullYear());
    }
    return text;
  },

  applyTranslations() {
    document.documentElement.lang = this.locale;
    document.title = this.t('title');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
        el.placeholder = this.t(key);
      } else {
        el.textContent = this.t(key);
      }
    });
  },

  async switchLocale(locale) {
    await this.loadTranslations(locale);
    this.applyTranslations();
  }
};

export default i18n;
