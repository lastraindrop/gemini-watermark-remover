import i18n, { supportedLanguages } from '../i18n.js';
import { AuditLog } from './ui.js';
import { getAllProfiles } from '../core/profiles.js';
import { applyProfileTheme } from './viewModes.js';

export function saveSettings(elements) {
    const settings = {
        profileId: elements.profileSelect?.value,
        locale: i18n.locale
    };
    localStorage.setItem('gwr_pro_settings', JSON.stringify(settings));
}

export function loadSettings(elements) {
    const saved = localStorage.getItem('gwr_pro_settings');
    if (!saved) return;

    try {
        const settings = JSON.parse(saved);
        if (settings.profileId && elements.profileSelect) {
            const option = [...elements.profileSelect.options].find(opt => opt.value === settings.profileId);
            if (option) {
                elements.profileSelect.value = settings.profileId;
                const profile = getAllProfiles().find(p => p.id === settings.profileId);
                if (profile) applyProfileTheme(profile);
            }
        }
    } catch (error) {
        AuditLog.log(`Settings ignored: ${error.message}`, 'err');
    }
}

export function setupLanguageSelector(elements) {
    setupDarkModeToggle();

    const select = document.getElementById('langSelect');
    if (!select) return;

    select.innerHTML = '';
    supportedLanguages.forEach(lang => {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = lang.shortLabel || lang.label;
        opt.title = lang.label;
        select.appendChild(opt);
    });
    select.value = i18n.locale;
    select.title = supportedLanguages.find(lang => lang.code === select.value)?.label || 'Language';

    select.addEventListener('change', async () => {
        await i18n.switchLocale(select.value);
        const selected = [...select.options].find(opt => opt.value === select.value);
        if (selected?.title) select.title = selected.title;
        saveSettings(elements);
        AuditLog.log(`Language set to ${select.value}`, 'info');
    });
}

export function getEngineOptions(elements, behavior = {}) {
    const thresholdVal = parseFloat(elements.thresholdSlider?.value || '0.18');
    const penaltyVal = parseFloat(elements.penaltySlider?.value || '0.30');
    const opts = {
        profileId: elements.profileSelect?.value || 'gemini',
        deepScan: document.getElementById('deepScanToggle')?.checked ?? true,
        noiseReduction: document.getElementById('noiseReductionToggle')?.checked ?? false,
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false,
        probeThreshold: thresholdVal,
        fallbackThreshold: thresholdVal,
        gradientPenalty: penaltyVal,
        overrides: {
            jitterRange: Math.round(thresholdVal * 30),
            THRESHOLDS: {
                ANCHORED_OFFICIAL: thresholdVal,
                ANCHORED_OTHER: thresholdVal + 0.04,
                COARSE: thresholdVal * 0.55,
                FINAL_ANCHORED: Math.max(0.10, thresholdVal - 0.03),
                FINAL_ALIGNED: thresholdVal,
                FINAL_FREE: thresholdVal + 0.04
            }
        }
    };

    if (!behavior.ignoreManual && elements.manualModeToggle?.checked) {
        const rawManualConfig = {
            x: elements.manualX?.value,
            y: elements.manualY?.value,
            width: elements.manualW?.value,
            height: elements.manualH?.value
        };
        const rawValues = Object.values(rawManualConfig);
        if (behavior.optionalManual && rawValues.every(value => value === undefined || value === '')) {
            return opts;
        }
        for (const [key, value] of Object.entries(rawManualConfig)) {
            if (value === undefined || value === '') throw new Error(`Manual ${key} is required`);
        }
        const manualConfig = {
            x: Number(rawManualConfig.x),
            y: Number(rawManualConfig.y),
            width: Number(rawManualConfig.width),
            height: Number(rawManualConfig.height)
        };
        for (const [key, value] of Object.entries(manualConfig)) {
            if (!Number.isFinite(value)) throw new Error(`Invalid manual ${key}: expected a number`);
        }
        if (manualConfig.x < 0 || manualConfig.y < 0 || manualConfig.width <= 0 || manualConfig.height <= 0) {
            throw new Error(i18n.t('toast.manualAreaRequired'));
        }
        opts.manualConfig = {
            x: Math.trunc(manualConfig.x),
            y: Math.trunc(manualConfig.y),
            width: Math.trunc(manualConfig.width),
            height: Math.trunc(manualConfig.height)
        };
    }

    return opts;
}

function setupDarkModeToggle() {
    const btn = document.getElementById('darkModeToggle');
    if (!btn) return;

    const STORAGE_KEY = 'gwr_dark_mode';
    let mode = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'auto';

    const prefersDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

    const apply = () => {
        const isDark = mode === 'dark' || (mode === 'auto' && prefersDark());
        document.documentElement.classList.toggle('dark', isDark);
    };

    apply();

    btn.addEventListener('click', () => {
        const cycle = { auto: 'dark', dark: 'light', light: 'auto' };
        mode = cycle[mode] || 'auto';
        localStorage.setItem(STORAGE_KEY, mode);
        btn.setAttribute('data-mode', mode);
        apply();
    });

    btn.setAttribute('data-mode', mode);
}
