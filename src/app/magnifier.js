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
        lens.style.left = `${x - 75}px`;
        lens.style.top = `${y - 75}px`;

        const zoom = 3;
        lens.style.backgroundImage = `url(${processedImg.src})`;
        lens.style.backgroundSize = `${rect.width * zoom}px ${rect.height * zoom}px`;
        lens.style.backgroundPosition = `-${x * zoom - 75}px -${y * zoom - 75}px`;
    };

    slider.addEventListener('mousemove', moveLens);
    slider.addEventListener('mouseenter', () => lens.classList.remove('hidden'));
    slider.addEventListener('mouseleave', () => lens.classList.add('hidden'));
}
