import i18n from '../i18n.js';
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
    const select = document.getElementById('langSelect');
    if (!select) return;

    import('../i18n.js').then(mod => {
        select.innerHTML = '';
        mod.supportedLanguages.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = lang.label;
            select.appendChild(opt);
        });
        select.value = i18n.locale;
    });

    select.addEventListener('change', async () => {
        await i18n.switchLocale(select.value);
        saveSettings(elements);
        AuditLog.log(`Language set to ${select.value}`, 'info');
    });
}

export function getEngineOptions(elements) {
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

    if (elements.manualModeToggle?.checked) {
        const manualConfig = {
            x: Number(elements.manualX?.value),
            y: Number(elements.manualY?.value),
            width: Number(elements.manualW?.value || '96'),
            height: Number(elements.manualH?.value || '96')
        };
        for (const [key, value] of Object.entries(manualConfig)) {
            if (!Number.isFinite(value)) throw new Error(`Invalid manual ${key}: expected a number`);
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
