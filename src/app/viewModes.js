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
    if (statAnchor) statAnchor.textContent = (pos?.anchor || config?.anchor || 'AUTO').toUpperCase();
    if (statCoord) statCoord.textContent = pos ? `${Math.round(pos.x)}, ${Math.round(pos.y)}` : 'AUTO';
    if (statConfidence) statConfidence.textContent = `${confidence}%`;
    if (statAlgo) statAlgo.textContent = (profileId || 'AUTO').toUpperCase();
}

export function applyProfileTheme(profile) {
    if (!profile?.brandColor) return;
    const headerIcon = document.querySelector('header .bg-emerald-500');
    if (headerIcon) {
        headerIcon.classList.remove('bg-emerald-500', 'shadow-glow-emerald');
        headerIcon.style.backgroundColor = profile.brandColor;
    }
    const tierBadge = document.getElementById('tierBadge');
    if (tierBadge) {
        tierBadge.classList.remove('bg-indigo-500', 'bg-emerald-500', 'shadow-glow-indigo', 'shadow-glow-emerald');
        tierBadge.style.backgroundColor = profile.brandColor;
    }
}

export function setupSlider(elements) {
    const slider = elements.comparisonSlider;
    if (!slider) return;

    const resize = slider.querySelector('.resize');
    const handle = slider.querySelector('.handle');

    let dragging = false;

    const updateSlider = (clientX) => {
        const rect = slider.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        if (resize) resize.style.width = `${percent}%`;
        if (handle) handle.style.left = `${percent}%`;
    };

    const onPointerMove = (e) => {
        if (!dragging) return;
        e.preventDefault();
        updateSlider(e.clientX);
    };

    const onPointerUp = () => {
        dragging = false;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
    };

    slider.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.resize') || e.target.closest('.handle') || e.target === slider) {
            dragging = true;
            e.preventDefault();
            slider.setPointerCapture(e.pointerId);
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        }
    });
}
