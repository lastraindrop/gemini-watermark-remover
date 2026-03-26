import zhCN from './i18n/zh-CN.json';
import enUS from './i18n/en-US.json';

const translations = {
    'zh-CN': zhCN,
    'en-US': enUS
};

const i18n = {
  locale: localStorage.getItem('locale') || (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'),
  translations: {},

  async init() {
    await this.loadTranslations(this.locale);
    this.applyTranslations();
    document.body.classList.remove('loading');
  },

  async loadTranslations(locale) {
    this.translations = translations[locale] || translations['zh-CN'];
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
