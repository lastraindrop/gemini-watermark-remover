import exifr from 'exifr';
import i18n from './i18n.js';

export function loadImage(input) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            if (input instanceof File || input instanceof Blob) {
                // We don't revoke here because the caller might need the image to remain valid
                // However, in a real app, you'd want a strategy for this.
            }
            resolve(img);
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

const statusMessage = document.getElementById('statusMessage');
export function setStatusMessage(message = '', type = '') {
    statusMessage.textContent = message;
    statusMessage.style.display = message ? 'block' : 'none';
    const colorMap = { warn: 'text-warn', success: 'text-success' };
    statusMessage.classList.remove(...Object.values(colorMap));
    if (colorMap[type]) statusMessage.classList.add(colorMap[type]);
}

const loadingOverlay = document.getElementById('loadingOverlay');
export function showLoading(text = null) {
    loadingOverlay.style.display = 'flex';
    const textEl = loadingOverlay.querySelector('p');
    if (textEl && text) textEl.textContent = text;
}

export function hideLoading() {
    loadingOverlay.style.display = 'none';
}
