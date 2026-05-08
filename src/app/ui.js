/**
 * UI Utilities and Components - Ultra Premium Edition
 */

const logHistory = [];

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
    
    const icons = {
        success: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>',
        err: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
        warn: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
        info: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
    };

    toast.innerHTML = `${icons[type] || icons.info} <span>${message}</span>`;
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
