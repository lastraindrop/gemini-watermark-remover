import exifr from 'exifr';
import i18n from './i18n.js';

export async function loadImage(input, options = {}) {
    if (input instanceof File || input instanceof Blob) {
        return _createImageFromBlob(input, options.objectUrlManager);
    }
    
    if (typeof input === 'string') {
        // Try fetch approach first (Bypasses some CORS Tainting issues if server allows fetch)
        try {
            const response = await fetch(input, { mode: 'cors' });
            if (response.ok) {
                const blob = await response.blob();
                return _createImageFromBlob(blob, options.objectUrlManager);
            }
        } catch {
            // Fallback to traditional <img> loading
        }
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Image Load Failed: CORS or network error. Please download and upload locally.'));
            img.src = input;
        });
    }
    throw new Error('Invalid image input type');
}

function _createImageFromBlob(blob, objectUrlManager) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const rawUrl = URL.createObjectURL(blob);
        const url = objectUrlManager?.register ? objectUrlManager.register(rawUrl) : rawUrl;
        img.onload = () => {
             // Keep the object URL alive until the workspace reset clears managed URLs.
             resolve(img);
        };
        img.onerror = () => {
            if (objectUrlManager?.revoke) objectUrlManager.revoke(url);
            else URL.revokeObjectURL(url);
            reject(new Error('Failed to decode local image blob'));
        };
        img.src = url;
    });
}

export async function checkOriginal(file) {
    try {
        const exif = await exifr.parse(file, { xmp: true });
        return {
            is_google: exif?.Credit === 'Made with Google AI',
            is_original: ['ImageWidth', 'ImageHeight'].every(key => exif?.[key])
        };
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
    document.body.style.overflow = 'hidden';
    const mainTextEl = el.querySelector('#loadingMainText');
    const subTextEl = el.querySelector('#loadingSubText');
    const retryBtn = el.querySelector('#retryBtn');
    const spinner = el.querySelector('.animate-spin');

    if (mainTextEl) mainTextEl.textContent = text || i18n.t('status.initializing') || 'INITIALIZING';
    if (subTextEl) subTextEl.textContent = subText || i18n.t('loading.subtext');
    if (retryBtn) retryBtn.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');
}

export function showLoadingFail(text) {
    const el = getLoadingOverlayEl();
    if (!el) return;
    
    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const mainTextEl = el.querySelector('#loadingMainText');
    const subTextEl = el.querySelector('#loadingSubText');
    const retryBtn = el.querySelector('#retryBtn');
    const spinner = el.querySelector('.animate-spin');

    if (mainTextEl) mainTextEl.textContent = i18n.t('status.error') || 'Critical Error';
    if (subTextEl) {
        subTextEl.textContent = text;
        subTextEl.classList.add('text-red-500');
    }
    if (retryBtn) retryBtn.classList.remove('hidden');
    if (spinner) spinner.classList.add('hidden');
}

export function hideLoading() {
    const el = getLoadingOverlayEl();
    if (!el) return;
    el.classList.add('hidden');
    document.body.style.overflow = '';
    document.body.classList.remove('loading');
}
