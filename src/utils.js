import exifr from 'exifr';
import i18n from './i18n.js';

export function loadImage(input) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve(img);
            // Revoke after decode: the img element retains the decoded bitmap
            if (input instanceof File || input instanceof Blob) {
                URL.revokeObjectURL(img.src);
            }
        };
        img.onerror = (e) => reject(new Error('Failed to load image'));
        if (input instanceof File || input instanceof Blob) {
            img.src = URL.createObjectURL(input);
        } else {
            img.src = input;
        }
    });
}

export async function checkOriginal(file) {
    try {
        const exif = await exifr.parse(file, { xmp: true });
        return {
            is_google: exif?.Credit === 'Made with Google AI',
            is_original: ['ImageWidth', 'ImageHeight'].every(key => exif?.[key])
        }
    } catch {
        return { is_google: false, is_original: false };
    }
}

export function getOriginalStatus({ is_google, is_original }) {
    if (!is_google) return i18n.t('original.not_gemini');
    if (!is_original) return i18n.t('original.not_original');
    return '';
}

function getStatusMessageEl() { return typeof document !== 'undefined' ? document.getElementById('statusMessage') : null; }
function getLoadingOverlayEl() { return typeof document !== 'undefined' ? document.getElementById('loadingOverlay') : null; }

export function setStatusMessage(message, type = 'info') {
    const el = getStatusMessageEl();
    if (!el) return;
    el.textContent = message;
    el.className = `mt-6 text-sm min-h-[1.25rem] ${type === 'err' ? 'text-err font-bold' : (type === 'success' ? 'text-success font-bold' : 'text-gray-500')}`;
}

export function showLoading(text, subText = '') {
    const el = getLoadingOverlayEl();
    if (!el) return;
    
    el.classList.remove('hidden');
    const mainTextEl = el.querySelector('#loadingMainText');
    const subTextEl = el.querySelector('#loadingSubText');
    const retryBtn = el.querySelector('#retryBtn');
    const spinner = el.querySelector('.animate-spin');

    if (mainTextEl) mainTextEl.textContent = text || i18n.t('loading.text');
    if (subTextEl) subTextEl.textContent = subText || 'AI 正在精准切除水印边缘...';
    if (retryBtn) retryBtn.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');
}

export function showLoadingFail(text) {
    const el = getLoadingOverlayEl();
    if (!el) return;
    
    el.classList.remove('hidden');
    const mainTextEl = el.querySelector('#loadingMainText');
    const subTextEl = el.querySelector('#loadingSubText');
    const retryBtn = el.querySelector('#retryBtn');
    const spinner = el.querySelector('.animate-spin');

    if (mainTextEl) mainTextEl.textContent = 'Critical Error';
    if (subTextEl) {
        subTextEl.textContent = text;
        subTextEl.classList.replace('text-gray-400', 'text-red-500');
    }
    if (retryBtn) retryBtn.classList.remove('hidden');
    if (spinner) spinner.classList.add('hidden');
}

export function hideLoading() {
    const el = getLoadingOverlayEl();
    if (!el) return;
    el.classList.add('hidden');
    document.body.classList.remove('loading');
}
