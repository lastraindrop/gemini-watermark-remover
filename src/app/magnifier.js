export function setupMagnifier(elements) {
    const slider = elements.comparisonSlider;
    const lens = elements.magnifierLens;
    const processedImg = document.getElementById('sliderProcessed');

    if (!slider || !lens) return;

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

        const LENS_SIZE = 150; // 75px offset in each direction, 150px total
        const clampedLeft = Math.max(0, Math.min(rect.width - LENS_SIZE, x - 75));
        const clampedTop = Math.max(0, Math.min(rect.height - LENS_SIZE, y - 75));
        lens.style.left = `${clampedLeft}px`;
        lens.style.top = `${clampedTop}px`;

        const zoom = 3;
        lens.style.backgroundImage = `url(${processedImg?.src || ''})`;
        lens.style.backgroundSize = `${rect.width * zoom}px ${rect.height * zoom}px`;
        lens.style.backgroundPosition = `-${x * zoom - 75}px -${y * zoom - 75}px`;
    };

    slider.addEventListener('mousemove', moveLens);
    slider.addEventListener('mouseenter', () => lens.classList.remove('hidden'));
    slider.addEventListener('mouseleave', () => lens.classList.add('hidden'));
}
