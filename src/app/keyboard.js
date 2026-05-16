import { state } from './state.js';
import { downloadImage } from './processing.js';
import { switchViewMode } from './viewModes.js';

export function setupKeyboardShortcuts(elements, resetWorkspace) {
    function handleKeyDown(e) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.key === 'Escape') resetWorkspace();
        if (e.key === '1') switchViewMode('slider', elements);
        if (e.key === '2') switchViewMode('side', elements);
        if (e.key === '3') switchViewMode('stats', elements);

        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            switchViewMode(e.key === 'ArrowRight' ? 'side' : 'slider', elements);
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const item = state.imageQueue.find(i => i.status === 'success');
            if (item) downloadImage(item);
        }
    }

    document.addEventListener('keydown', handleKeyDown);
}
