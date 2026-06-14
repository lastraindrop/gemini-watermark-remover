export function setupMagnifier(elements) {
    const slider = elements.comparisonSlider;
    const lens = elements.magnifierLens;

    if (!slider || !lens) return;

    const LENS_SIZE = 150;        // total lens dimension in px
    const LENS_OFFSET = LENS_SIZE / 2;  // FE-BUG-L3: derive instead of hardcoding 75
    const ZOOM = 3;

    const moveLens = (e) => {
        if (elements.comparisonSlider.classList.contains('hidden')) return;

        const rect = slider.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
            lens.classList.add('hidden');
            return;
        }

        lens.classList.remove('hidden');

        const clampedLeft = Math.max(0, Math.min(rect.width - LENS_SIZE, x - LENS_OFFSET));
        const clampedTop = Math.max(0, Math.min(rect.height - LENS_SIZE, y - LENS_OFFSET));
        lens.style.left = `${clampedLeft}px`;
        lens.style.top = `${clampedTop}px`;

        // FE-BUG-H3: fetch processedImg dynamically inside moveLens instead of
        // capturing once at module load (which could be null if DOM not ready).
        const processedImg = document.getElementById('sliderProcessed');
        lens.style.backgroundImage = `url(${processedImg?.src || ''})`;
        lens.style.backgroundSize = `${rect.width * ZOOM}px ${rect.height * ZOOM}px`;
        lens.style.backgroundPosition = `-${x * ZOOM - LENS_OFFSET}px -${y * ZOOM - LENS_OFFSET}px`;
    };

    slider.addEventListener('mousemove', moveLens);
    slider.addEventListener('mouseenter', () => lens.classList.remove('hidden'));
    slider.addEventListener('mouseleave', () => lens.classList.add('hidden'));
}
