import { state } from './state.js';
import { downloadImage } from './processing.js';

export function setupKeyboardShortcuts(elements, resetWorkspace) {
    function handleKeyDown(e) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.key === 'Escape') resetWorkspace();

        // v2.6: Repurposed from dead slider/side/stats view modes.
        // 1: Toggle Advanced Settings panel
        // 2: Cycle through performance presets (fast → balanced → thorough)
        // 3: Toggle Manual Area Selection mode
        if (e.key === '1') {
            elements.toggleAdvancedBtn?.click();
        }
        if (e.key === '2') {
            if (elements.performanceSelect) {
                const presets = ['fast', 'balanced', 'thorough'];
                const current = elements.performanceSelect.value;
                const nextIdx = (presets.indexOf(current) + 1) % presets.length;
                elements.performanceSelect.value = presets[nextIdx];
                elements.performanceSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
            }
        }
        if (e.key === '3') {
            if (elements.manualModeToggle) {
                elements.manualModeToggle.checked = !elements.manualModeToggle.checked;
                elements.manualModeToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const item = state.imageQueue.find(i => i.status === 'success');
            if (item) downloadImage(item);
        }
    }

    document.addEventListener('keydown', handleKeyDown);
}
