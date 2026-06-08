import i18n, { supportedLanguages } from '../i18n.js';
import { AuditLog } from './ui.js';
import { getAllProfiles, DEFAULT_PROFILE } from '../core/profiles.js';
import { applyProfileTheme } from './viewModes.js';
import { PERFORMANCE_PRESETS, DEFAULT_PERFORMANCE_PRESET, DETECTION_THRESHOLDS } from '../core/config.js';
import { readManualTemplateSize, readManualForceProcess } from './manualSelection.js';

/**
 * Merge two objects deeply — used to layer preset overrides on top of user
 * threshold/penalty settings without losing either.
 */
function deepMerge(base, overrides) {
    const result = { ...base };
    for (const [key, val] of Object.entries(overrides || {})) {
        if (val && typeof val === 'object' && !Array.isArray(val) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            result[key] = deepMerge(base[key], val);
        } else {
            result[key] = val;
        }
    }
    return result;
}

export function saveSettings(elements) {
    const settings = {
        profileId: elements.profileSelect?.value,
        locale: i18n.locale,
        performancePreset: elements.performanceSelect?.value || DEFAULT_PERFORMANCE_PRESET,
        threshold: elements.thresholdSlider?.value,
        penalty: elements.penaltySlider?.value,
        darkMode: typeof localStorage !== 'undefined' ? localStorage.getItem('gwr_dark_mode') : null
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
        // v2.3: Restore performance preset
        if (settings.performancePreset && elements.performanceSelect) {
            const preset = PERFORMANCE_PRESETS[settings.performancePreset];
            if (preset) {
                elements.performanceSelect.value = settings.performancePreset;
            }
        }
        // v2.4: Restore threshold and penalty slider values
        if (settings.threshold != null && elements.thresholdSlider) {
            const val = parseFloat(settings.threshold);
            if (Number.isFinite(val) && val >= parseFloat(elements.thresholdSlider.min) && val <= parseFloat(elements.thresholdSlider.max)) {
                elements.thresholdSlider.value = val;
                if (elements.thresholdVal) elements.thresholdVal.textContent = val.toFixed(2);
            }
        }
        if (settings.penalty != null && elements.penaltySlider) {
            const val = parseFloat(settings.penalty);
            if (Number.isFinite(val) && val >= parseFloat(elements.penaltySlider.min) && val <= parseFloat(elements.penaltySlider.max)) {
                elements.penaltySlider.value = val;
                if (elements.penaltyVal) elements.penaltyVal.textContent = val.toFixed(2);
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
    const thresholdVal = parseFloat(elements.thresholdSlider?.value ?? String(DETECTION_THRESHOLDS.DEFAULT_PROBE_THRESHOLD));
    const penaltyVal = parseFloat(elements.penaltySlider?.value ?? '0.30');
    const presetKey = elements.performanceSelect?.value || DEFAULT_PERFORMANCE_PRESET;
    const preset = PERFORMANCE_PRESETS[presetKey] || PERFORMANCE_PRESETS[DEFAULT_PERFORMANCE_PRESET];

    // Start with default overrides (user threshold/penalty sliders)
    const baseOverrides = {
        jitterRange: Math.round(thresholdVal * 30),
        THRESHOLDS: {
            ANCHORED_OFFICIAL: thresholdVal,
            ANCHORED_OTHER: thresholdVal + 0.04,
            COARSE: thresholdVal * 0.55,
            FINAL_ANCHORED: Math.max(0.10, thresholdVal - 0.03),
            FINAL_ALIGNED: thresholdVal,
            FINAL_FREE: thresholdVal + 0.04
        }
    };

    // Layer the performance preset on top (preset wins on structural keys like
    // RANGE_X, CANDIDATES_LIMIT, etc.; user threshold slider still controls
    // confidence thresholds via THRESHOLDS merge).
    const mergedOverrides = deepMerge(baseOverrides, preset.overrides);

    const opts = {
        profileId: elements.profileSelect?.value || DEFAULT_PROFILE.id,
        deepScan: preset.deepScan,
        noiseReduction: preset.noiseReduction,
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false,
        probeThreshold: thresholdVal,
        fallbackThreshold: thresholdVal,
        gradientPenalty: penaltyVal,
        adaptiveMode: preset.adaptiveMode,
        overrides: mergedOverrides
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
            height: Math.trunc(manualConfig.height),
            // v2.6: Template size for alpha map selection & force flag
            assetKey: String(readManualTemplateSize()),
            forceProcess: readManualForceProcess()
        };
    }

    return opts;
}

/**
 * v2.3: Synchronize the Deep Scan and Noise Reduction toggle switches
 * to reflect the current performance preset. Also updates the preset
 * info hint to show which parameters are affected.
 */
export function syncTogglesToPreset(elements) {
    const presetKey = elements?.performanceSelect?.value || DEFAULT_PERFORMANCE_PRESET;
    const preset = PERFORMANCE_PRESETS[presetKey] || PERFORMANCE_PRESETS[DEFAULT_PERFORMANCE_PRESET];

    const toggleIds = [
        { id: 'deepScanToggle', value: preset.deepScan, label: 'deepScanLabel' },
        { id: 'noiseReductionToggle', value: preset.noiseReduction, label: 'noiseReductionLabel' }
    ];

    for (const { id, value } of toggleIds) {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.checked = value;
            toggle.classList.toggle('preset-controlled', true);
        }
    }

    // v2.4: Update hint text using i18n for localization
    const hint = document.getElementById('presetHint');
    if (hint) {
        const searchPct = Math.round(preset.overrides.RANGE_X * 100);
        const jitter = preset.overrides.JITTER_RANGE;
        const fineTune = preset.overrides.FINE_TUNE_RANGE;
        const candidates = preset.overrides.CANDIDATES_LIMIT_PER_SIZE;
        hint.textContent = i18n.t('preset.hintDetail', {
            search: searchPct,
            deepScan: preset.deepScan ? i18n.t('preset.on') : i18n.t('preset.off'),
            jitter,
            fineTune,
            adaptive: preset.adaptiveMode === 'off' ? i18n.t('preset.off') : i18n.t('preset.on'),
            candidates
        });
    }
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
