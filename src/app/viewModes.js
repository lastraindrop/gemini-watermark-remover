export function switchViewMode(mode, elements) {
    const btns = [elements.modeSliderBtn, elements.modeSideBtn, elements.modeStatsBtn];
    const views = [elements.comparisonSlider, elements.sideBySideView, elements.statsView];

    btns.forEach(b => b?.classList.remove('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm'));
    views.forEach(v => v?.classList.add('hidden'));

    if (mode === 'slider') {
        elements.modeSliderBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm');
        elements.comparisonSlider?.classList.remove('hidden');
    } else if (mode === 'side') {
        elements.modeSideBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm');
        elements.sideBySideView?.classList.remove('hidden');
    } else {
        elements.modeStatsBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-500', 'shadow-sm');
        elements.statsView?.classList.remove('hidden');
    }
}

export function updateStatsUI(config, pos, confidence, profileId) {
    const statAnchor = document.getElementById('statAnchor');
    const statCoord = document.getElementById('statCoord');
    const statConfidence = document.getElementById('statConfidence');
    const statAlgo = document.getElementById('statAlgo');
    if (statAnchor) statAnchor.textContent = (config.anchor || 'BOTTOM-RIGHT').toUpperCase();
    if (statCoord) statCoord.textContent = pos ? `${Math.round(pos.x)}, ${Math.round(pos.y)}` : 'AUTO';
    if (statConfidence) statConfidence.textContent = `${confidence}%`;
    if (statAlgo) statAlgo.textContent = (profileId || 'AUTO').toUpperCase();
}

export function applyProfileTheme(profile) {
    document.documentElement.style.setProperty('--primary', profile.brandColor);
    document.documentElement.style.setProperty('--primary-glow', `${profile.brandColor}66`);
}

export function setupSlider(elements) {
    const slider = elements.comparisonSlider;
    if (!slider) return;

    const resize = slider.querySelector('.resize');
    const handle = slider.querySelector('.handle');

    const updateSlider = (e) => {
        const rect = slider.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

        if (resize) resize.style.width = `${percent}%`;
        if (handle) handle.style.left = `${percent}%`;
    };

    slider.addEventListener('mousedown', () => {
        const moveHandler = (e) => updateSlider(e);
        const upHandler = () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    });

    slider.addEventListener('touchstart', () => {
        const moveHandler = (e) => updateSlider(e);
        const upHandler = () => {
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', upHandler);
        };
        document.addEventListener('touchmove', moveHandler);
        document.addEventListener('touchend', upHandler);
    }, { passive: true });
}
