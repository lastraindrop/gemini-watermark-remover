import i18n, { supportedLanguages } from '../i18n.js';
import { AuditLog } from './ui.js';
import { getAllProfiles, DEFAULT_PROFILE } from '../core/profiles.js';
import { applyProfileTheme } from './viewModes.js';
import { PERFORMANCE_PRESETS, DEFAULT_PERFORMANCE_PRESET, DETECTION_THRESHOLDS } from '../core/config.js';
import { readManualTemplateSize, readManualForceProcess } from './manualSelection.js';

function resolveManualAssetKey(profileId, manualConfig) {
    const selected = readManualTemplateSize();
    if (selected !== 'auto') return String(selected);

    const width = Math.trunc(manualConfig.width);
    const height = Math.trunc(manualConfig.height);
    if ((profileId === 'doubao' || profileId === 'dalle3') && Number.isFinite(width) && Number.isFinite(height)) {
        return `${width}x${height}`;
    }

    const largestSide = Math.max(width, height);
    return largestSide <= 48 ? '48' : '96';
}

export function saveSettings(elements) {
    const settings = {
        profileId: elements.profileSelect?.value,
        locale: i18n.locale,
        performancePreset: elements.performanceSelect?.value || DEFAULT_PERFORMANCE_PRESET,
        threshold: elements.thresholdSlider?.value,
        penalty: elements.penaltySlider?.value,
        // FE-BUG-M1: persist autoDownload so user choice survives reloads
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false,
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
        // FE-BUG-M1: restore autoDownload toggle
        if (settings.autoDownload != null) {
            const toggle = document.getElementById('autoDownloadToggle');
            if (toggle) toggle.checked = !!settings.autoDownload;
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
    const penaltyVal = parseFloat(elements.penaltySlider?.value ?? String(DETECTION_THRESHOLDS.GRADIENT_PENALTY_DEFAULT));
    const presetKey = elements.performanceSelect?.value || DEFAULT_PERFORMANCE_PRESET;
    const preset = PERFORMANCE_PRESETS[presetKey] || PERFORMANCE_PRESETS[DEFAULT_PERFORMANCE_PRESET];

    // FE-BUG-H1 fix: The preset's THRESHOLDS are carefully tuned per-mode and
    // must NOT be overwritten by the user's threshold slider. Previously,
    // baseOverrides supplied derived THRESHOLDS (thresholdVal+0.04, *0.55, etc.)
    // which deepMerge would spread ON TOP of the preset, clobbering the preset's
    // values. Now the preset is the base; the user slider only controls the
    // top-level probeThreshold/fallbackThreshold passed via opts (not THRESHOLDS).
    // The preset's structural overrides (RANGE_X, JITTER, CANDIDATES, etc.) are
    // preserved exactly as designed.
    const mergedOverrides = { ...preset.overrides };

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
        // FE-BUG-H4 fix: validate upper bounds too, not just lower bounds.
        // The engine's validateManualConfig will reject out-of-bounds regions,
        // but surfacing the error here gives a clearer message to the user.
        if (manualConfig.x < 0 || manualConfig.y < 0 || manualConfig.width <= 0 || manualConfig.height <= 0) {
            throw new Error(i18n.t('toast.manualAreaRequired'));
        }
        opts.manualConfig = {
            x: Math.trunc(manualConfig.x),
            y: Math.trunc(manualConfig.y),
            width: Math.trunc(manualConfig.width),
            height: Math.trunc(manualConfig.height),
            // Auto resolves rectangular profile selections to WxH alpha keys.
            assetKey: resolveManualAssetKey(opts.profileId, manualConfig),
            forceProcess: readManualForceProcess(),
            // v2.6: Advanced overrides for difficult cases
            alphaGainOverride: parseFloat(document.getElementById('manualAlphaGain')?.value || '1.0') || 1.0,
            searchRangeOverride: parseInt(document.getElementById('manualSearchRange')?.value || '10', 10) || 10
        };
    }

    return opts;
}

/**
 * v2.3: Synchronize the Deep Scan and Noise Reduction display badges
 * to reflect the current performance preset. Also updates the preset
 * info hint to show which parameters are affected.
 *
 * FE-BUG-C2: These were previously interactive checkboxes that had no
 * effect (getEngineOptions ignores them, reading only preset values).
 * Now they are honest read-only status indicators — visually showing
 * the user what the preset controls, without pretending to be toggles.
 */
export function syncTogglesToPreset(elements) {
    const presetKey = elements?.performanceSelect?.value || DEFAULT_PERFORMANCE_PRESET;
    const preset = PERFORMANCE_PRESETS[presetKey] || PERFORMANCE_PRESETS[DEFAULT_PERFORMANCE_PRESET];

    const badges = [
        { id: 'deepScanBadge', active: preset.deepScan },
        { id: 'noiseReductionBadge', active: preset.noiseReduction }
    ];

    for (const { id, active } of badges) {
        const badge = document.getElementById(id);
        if (!badge) continue;
        const dot = badge.querySelector('span:first-child');
        if (active) {
            badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 transition-colors';
            if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
        } else {
            badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-400 transition-colors';
            if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-slate-400';
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
