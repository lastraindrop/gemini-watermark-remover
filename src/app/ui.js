/**
 * UI Utilities and Components - Ultra Premium Edition
 */

const logHistory = [];

const icons = {
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    process: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
};

const MAX_AUDIT_ENTRIES = 100;

export const AuditLog = {
    log(message, type = 'info') {
        const list = document.getElementById('auditLogList');
        if (!list) return;
        
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        logHistory.push({ time: timeStr, type, message });
        
        const entry = document.createElement('div');
        const colors = {
            info: 'text-slate-500',
            success: 'text-emerald-500 font-black',
            warn: 'text-amber-500 font-bold',
            err: 'text-red-500 font-bold',
            process: 'text-indigo-500'
        };

        entry.className = `${colors[type] || colors.info} py-0.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors`;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'opacity-30 mr-2';
        timeSpan.textContent = timeStr;
        entry.appendChild(timeSpan);
        entry.appendChild(document.createTextNode(message));
        list.prepend(entry);

        // Cap audit log entries to prevent unbounded growth
        while (list.children.length > MAX_AUDIT_ENTRIES) {
            list.removeChild(list.lastChild);
        }
    },
    exportCSV() {
        if (logHistory.length === 0) return;
        const csvContent = 'data:text/csv;charset=utf-8,'
            + 'Time,Type,Message\n'
            + logHistory.map(e => `${e.time},${e.type},"${e.message.replace(/"/g, '""')}"`).join('\n');
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `gwr_audit_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-emerald-500 shadow-glow-emerald',
        err: 'bg-red-500 shadow-xl shadow-red-500/20',
        warn: 'bg-amber-500 shadow-xl shadow-amber-500/20',
        info: 'bg-indigo-600 shadow-glow-indigo'
    };

    toast.className = `flex items-center gap-4 px-8 py-4 rounded-[20px] text-white text-sm font-black shadow-2xl transition-all duration-700 translate-x-24 opacity-0 pointer-events-auto border border-white/20 backdrop-blur-md ${colors[type] || colors.info}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'w-6 h-6 flex-shrink-0';
    iconSpan.innerHTML = icons[type] || icons.info;
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    container.appendChild(toast);

    window.requestAnimationFrame(() => {
        toast.classList.remove('translate-x-24', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    });

    setTimeout(() => {
        toast.classList.add('translate-x-24', 'opacity-0');
        setTimeout(() => toast.remove(), 700);
    }, duration);
}

export function updateProgress(current, total) {
    const batchProgressBar = document.getElementById('batchProgressBar');
    const loadingLine = document.getElementById('loadingLine');
    const progressText = document.getElementById('progressText');
    
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    
    if (batchProgressBar) batchProgressBar.style.width = `${percent}%`;
    if (loadingLine) loadingLine.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${current} / ${total}`;
}

export function resetGlobalProgress() {
    const loadingLine = document.getElementById('loadingLine');
    if (loadingLine) {
        loadingLine.style.transition = 'none';
        loadingLine.style.width = '0%';
        setTimeout(() => loadingLine.style.transition = '', 50);
    }
}
