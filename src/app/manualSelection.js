function getImageMetrics(img) {
    const naturalWidth = img?.naturalWidth || img?.width || 0;
    const naturalHeight = img?.naturalHeight || img?.height || 0;
    const rect = img?.getBoundingClientRect();
    if (!rect || naturalWidth <= 0 || naturalHeight <= 0) return null;
    return {
        naturalWidth,
        naturalHeight,
        scaleX: rect.width / naturalWidth,
        scaleY: rect.height / naturalHeight,
        left: rect.left,
        top: rect.top
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function readManualRegion(elements) {
    const rawValues = [elements.manualX?.value, elements.manualY?.value, elements.manualW?.value, elements.manualH?.value];
    if (rawValues.some(value => value === undefined || value === '')) return null;
    const [x, y, width, height] = rawValues.map(Number);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { x, y, width, height };
}

export function writeManualRegion(elements, region) {
    if (elements.manualX) elements.manualX.value = String(Math.max(0, Math.round(region.x)));
    if (elements.manualY) elements.manualY.value = String(Math.max(0, Math.round(region.y)));
    if (elements.manualW) elements.manualW.value = String(Math.max(1, Math.round(region.width)));
    if (elements.manualH) elements.manualH.value = String(Math.max(1, Math.round(region.height)));
}

export function readManualTemplateSize() {
    const checked = document.querySelector('input[name="manualTemplateSize"]:checked');
    return checked ? Number(checked.value) : 48;
}

export function readManualForceProcess() {
    return document.getElementById('manualForceToggle')?.checked || false;
}

export function clearManualRegion(elements) {
    [elements.manualX, elements.manualY, elements.manualW, elements.manualH].forEach(input => {
        if (input) input.value = '';
    });
}

/**
 * Show the manual selection canvas with the original image loaded.
 * Called when manual mode is toggled on and an image is available.
 */
export function showManualSelectCanvas(elements, originalUrl) {
    const canvas = document.getElementById('manualSelectCanvas');
    const img = document.getElementById('manualSelectImage');
    if (!canvas || !img) return;

    img.src = originalUrl || '';
    canvas.classList.remove('hidden');
    document.getElementById('manualSelectBox')?.classList.add('hidden');
}

/**
 * Hide the manual selection canvas.
 */
export function hideManualSelectCanvas() {
    document.getElementById('manualSelectCanvas')?.classList.add('hidden');
}

export function setManualSelectionEnabled(elements, enabled) {
    elements.manualSelectionLayer?.classList.toggle('hidden', !enabled);
    elements.comparisonSlider?.classList.toggle('manual-select-active', enabled);
}

export function setupManualSelection(elements, callbacks = {}) {
    const canvas = document.getElementById('manualSelectCanvas');
    if (!canvas) return;

    let startPoint = null;

    const img = document.getElementById('manualSelectImage');
    if (!img) return;

    const getMetrics = () => getImageMetrics(img);

    const finishSelection = () => {
        if (!startPoint) return;
        try { canvas.releasePointerCapture?.(startPoint.pointerId); } catch {}
        startPoint = null;
        callbacks.onSelection?.();
    };

    canvas.addEventListener('pointerdown', (event) => {
        if (elements.manualModeToggle && !elements.manualModeToggle.checked) return;
        const metrics = getMetrics();
        if (!metrics) return;
        event.preventDefault();
        canvas.setPointerCapture?.(event.pointerId);
        const px = Math.round((event.clientX - metrics.left) / metrics.scaleX);
        const py = Math.round((event.clientY - metrics.top) / metrics.scaleY);
        startPoint = {
            x: clamp(px, 0, Math.max(0, metrics.naturalWidth - 1)),
            y: clamp(py, 0, Math.max(0, metrics.naturalHeight - 1)),
            pointerId: event.pointerId
        };
        writeManualRegion(elements, { ...startPoint, width: 1, height: 1 });
        updateManualSelectBox(img);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!startPoint) return;
        const metrics = getMetrics();
        if (!metrics) return;
        event.preventDefault();
        const px = Math.round((event.clientX - metrics.left) / metrics.scaleX);
        const py = Math.round((event.clientY - metrics.top) / metrics.scaleY);
        const cx = clamp(px, 0, Math.max(0, metrics.naturalWidth - 1));
        const cy = clamp(py, 0, Math.max(0, metrics.naturalHeight - 1));
        const x = clamp(Math.min(startPoint.x, cx), 0, Math.max(0, metrics.naturalWidth - 1));
        const y = clamp(Math.min(startPoint.y, cy), 0, Math.max(0, metrics.naturalHeight - 1));
        const width = clamp(Math.abs(cx - startPoint.x), 1, metrics.naturalWidth - x);
        const height = clamp(Math.abs(cy - startPoint.y), 1, metrics.naturalHeight - y);
        writeManualRegion(elements, { x, y, width, height });
        updateManualSelectBox(img);
    });

    canvas.addEventListener('pointerup', finishSelection);
    canvas.addEventListener('pointercancel', finishSelection);

    // Update overlay when coordinate inputs change
    [elements.manualX, elements.manualY, elements.manualW, elements.manualH].forEach(input => {
        input?.addEventListener('input', () => updateManualSelectBox(img));
    });

    img.addEventListener('load', () => updateManualSelectBox(img));
    window.addEventListener('resize', () => updateManualSelectBox(img));
}

/**
 * Render the selection box overlay on the manualSelectCanvas based on current
 * coordinate inputs.
 */
function updateManualSelectBox(image) {
    const box = document.getElementById('manualSelectBox');
    if (!box || !image) return;
    const metrics = getImageMetrics(image);
    const elements = {
        manualX: document.getElementById('manualX'),
        manualY: document.getElementById('manualY'),
        manualW: document.getElementById('manualW'),
        manualH: document.getElementById('manualH')
    };
    const region = readManualRegion(elements);
    if (!metrics || !region) {
        box.classList.add('hidden');
        return;
    }

    const rect = image.getBoundingClientRect();
    const x = clamp(region.x, 0, Math.max(0, metrics.naturalWidth - 1));
    const y = clamp(region.y, 0, Math.max(0, metrics.naturalHeight - 1));
    const width = clamp(region.width, 1, Math.max(1, metrics.naturalWidth - x));
    const height = clamp(region.height, 1, Math.max(1, metrics.naturalHeight - y));

    box.style.left = `${(rect.left - metrics.left) + x * metrics.scaleX}px`;
    box.style.top = `${(rect.top - metrics.top) + y * metrics.scaleY}px`;
    box.style.width = `${width * metrics.scaleX}px`;
    box.style.height = `${height * metrics.scaleY}px`;
    box.classList.remove('hidden');
}

// Backward-compat: legacy callers still use updateManualSelectionOverlay
export function updateManualSelectionOverlay(elements) {
    updateManualSelectBox(document.getElementById('manualSelectImage'));
}
