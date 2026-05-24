function getImageMetrics(slider, image) {
    const naturalWidth = image?.naturalWidth || image?.width || 0;
    const naturalHeight = image?.naturalHeight || image?.height || 0;
    const rect = slider?.getBoundingClientRect();
    if (!rect || naturalWidth <= 0 || naturalHeight <= 0 || rect.width <= 0 || rect.height <= 0) return null;

    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return {
        naturalWidth,
        naturalHeight,
        scale,
        left: (rect.width - width) / 2,
        top: (rect.height - height) / 2,
        width,
        height,
        sliderRect: rect
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function clientToImagePoint(event, metrics) {
    const x = event.clientX - metrics.sliderRect.left - metrics.left;
    const y = event.clientY - metrics.sliderRect.top - metrics.top;
    return {
        x: Math.round(clamp(x, 0, metrics.width) / metrics.scale),
        y: Math.round(clamp(y, 0, metrics.height) / metrics.scale)
    };
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

export function clearManualRegion(elements) {
    [elements.manualX, elements.manualY, elements.manualW, elements.manualH].forEach(input => {
        if (input) input.value = '';
    });
    updateManualSelectionOverlay(elements);
}

function releasePointer(layer, pointerId) {
    try {
        layer.releasePointerCapture?.(pointerId);
    } catch {
        // Pointer capture may already be gone after a cancellation.
    }
}

export function updateManualSelectionOverlay(elements) {
    const layer = elements.manualSelectionLayer;
    const box = elements.manualSelectionBox;
    const slider = elements.comparisonSlider;
    const image = document.getElementById('sliderOriginal');
    if (!layer || !box || !slider || !image) return;

    const metrics = getImageMetrics(slider, image);
    const region = readManualRegion(elements);
    if (!metrics || !region) {
        box.classList.add('hidden');
        return;
    }

    const x = clamp(region.x, 0, Math.max(0, metrics.naturalWidth - 1));
    const y = clamp(region.y, 0, Math.max(0, metrics.naturalHeight - 1));
    const width = clamp(region.width, 1, Math.max(1, metrics.naturalWidth - x));
    const height = clamp(region.height, 1, Math.max(1, metrics.naturalHeight - y));

    box.style.left = `${metrics.left + x * metrics.scale}px`;
    box.style.top = `${metrics.top + y * metrics.scale}px`;
    box.style.width = `${width * metrics.scale}px`;
    box.style.height = `${height * metrics.scale}px`;
    box.classList.remove('hidden');
}

export function setManualSelectionEnabled(elements, enabled) {
    elements.manualSelectionLayer?.classList.toggle('hidden', !enabled);
    elements.comparisonSlider?.classList.toggle('manual-select-active', enabled);
    if (enabled) updateManualSelectionOverlay(elements);
}

export function setupManualSelection(elements, callbacks = {}) {
    const layer = elements.manualSelectionLayer;
    const slider = elements.comparisonSlider;
    const image = document.getElementById('sliderOriginal');
    if (!layer || !slider || !image) return;

    let startPoint = null;

    const finishSelection = (event) => {
        if (!startPoint) return;
        releasePointer(layer, event.pointerId);
        startPoint = null;
        updateManualSelectionOverlay(elements);
        callbacks.onSelection?.();
    };

    layer.addEventListener('pointerdown', (event) => {
        if (elements.manualModeToggle && !elements.manualModeToggle.checked) return;
        const metrics = getImageMetrics(slider, image);
        if (!metrics) return;
        event.preventDefault();
        layer.setPointerCapture?.(event.pointerId);
        const point = clientToImagePoint(event, metrics);
        startPoint = {
            x: clamp(point.x, 0, Math.max(0, metrics.naturalWidth - 1)),
            y: clamp(point.y, 0, Math.max(0, metrics.naturalHeight - 1))
        };
        writeManualRegion(elements, { ...startPoint, width: 1, height: 1 });
        updateManualSelectionOverlay(elements);
    });

    layer.addEventListener('pointermove', (event) => {
        if (!startPoint) return;
        const metrics = getImageMetrics(slider, image);
        if (!metrics) return;
        event.preventDefault();
        const point = clientToImagePoint(event, metrics);
        const x = clamp(Math.min(startPoint.x, point.x), 0, Math.max(0, metrics.naturalWidth - 1));
        const y = clamp(Math.min(startPoint.y, point.y), 0, Math.max(0, metrics.naturalHeight - 1));
        const width = clamp(Math.abs(point.x - startPoint.x), 1, metrics.naturalWidth - x);
        const height = clamp(Math.abs(point.y - startPoint.y), 1, metrics.naturalHeight - y);
        writeManualRegion(elements, { x, y, width, height });
        updateManualSelectionOverlay(elements);
    });

    layer.addEventListener('pointerup', finishSelection);
    layer.addEventListener('pointercancel', finishSelection);

    [elements.manualX, elements.manualY, elements.manualW, elements.manualH].forEach(input => {
        input?.addEventListener('input', () => updateManualSelectionOverlay(elements));
    });

    image.addEventListener('load', () => updateManualSelectionOverlay(elements));
    window.addEventListener('resize', () => updateManualSelectionOverlay(elements));
}
