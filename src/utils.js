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
        img.onerror = reject;
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

export async function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function setStatusMessage(message, type = 'info') {
    const el = getStatusMessageEl();
    if (!el) return;
    el.textContent = message;
    el.className = `mt-6 text-sm min-h-[1.25rem] ${type === 'err' ? 'text-err font-bold' : (type === 'success' ? 'text-success font-bold' : 'text-gray-500')}`;
}

export function showLoading(text) {
    const el = getLoadingOverlayEl();
    if (!el) return;
    el.classList.remove('hidden');
    if (text) {
        const textEl = el.querySelector('[data-i18n="loading.text"]');
        if (textEl) textEl.textContent = text;
    }
}

export function hideLoading() {
    const el = getLoadingOverlayEl();
    if (!el) return;
    el.classList.add('hidden');
    document.body.classList.remove('loading');
}
