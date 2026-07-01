export class WorkerPool {
    constructor(workerUrl, poolSize = 2) {
        this._workerUrl = workerUrl;
        this._poolSize = Math.max(1, Math.min(poolSize, 4));
        this._workers = [];
        this._taskQueue = [];
        this._activeTasks = new Map();
        this._nextTaskId = 0;
        this._initialized = false;
        this._failed = false;
        this._terminated = false;
    }

    _ensureWorkers() {
        if (this._initialized || this._failed || this._terminated) return;
        this._initialized = true;

        if (typeof window === 'undefined' || !window.Worker || window.GM_info) {
            this._failed = true;
            return;
        }

        for (let i = 0; i < this._poolSize; i++) {
            if (!this._spawnReplacementWorker()) break;
        }
    }

    /**
     * Create and register a single new worker with the standard message/error
     * handlers. Returns true on success, false on failure (sets _failed).
     * Used both for initial pool creation and for replacing timed-out workers.
     */
    _spawnReplacementWorker() {
        if (this._failed || this._terminated) return false;
        if (typeof window === 'undefined' || !window.Worker || window.GM_info) {
            this._failed = true;
            return false;
        }
        try {
            const worker = new Worker(this._workerUrl);
            worker.onmessage = (e) => {
                const { taskId, imageData, removalReport, error } = e.data;
                const task = this._activeTasks.get(taskId);
                if (task) {
                    this._activeTasks.delete(taskId);
                    clearTimeout(task.timer);
                    if (task.workerInUse) task.workerInUse._inUse = false;
                    task.workerInUse = null;
                    if (error) {
                        task.reject(new Error(error));
                    } else {
                        task.resolve({ imageData, removalReport });
                    }
                }
                this._processQueue();
            };
            worker.onerror = (e) => {
                console.warn('Worker pool error:', e);
                this._failAll();
            };
            worker._inUse = false;
            this._workers.push(worker);
            return true;
        } catch {
            this._failed = true;
            return false;
        }
    }

    _getAvailableWorker() {
        this._ensureWorkers();
        return this._workers.find(w => !w._inUse) || null;
    }

    _processQueue() {
        while (this._taskQueue.length > 0) {
            const worker = this._getAvailableWorker();
            if (!worker) break;
            const task = this._taskQueue.shift();
            this._dispatchToWorker(worker, task);
        }
    }

    _dispatchToWorker(worker, task) {
        worker._inUse = true;
        task.workerInUse = worker;

        const taskId = this._nextTaskId++;
        task.taskId = taskId;

        const timeout = Math.max(5000, (task.imageData.width * task.imageData.height) / 500000);
        const timer = setTimeout(() => {
            // BUG-H2 fix: terminate the zombie worker instead of just marking it
            // free. A timed-out worker may still be running heavy computation in
            // the background, and reusing it risks delivering stale results from
            // the previous task to a new caller. Replace it with a fresh worker.
            this._activeTasks.delete(taskId);
            const workerIndex = this._workers.indexOf(worker);
            try { worker.terminate(); } catch {}
            if (workerIndex !== -1) {
                this._workers.splice(workerIndex, 1);
                this._spawnReplacementWorker();
            }
            task.reject(new Error('Worker removal timed out'));
            this._processQueue();
        }, timeout);
        task.timer = timer;

        this._activeTasks.set(taskId, task);

        try {
            const copy = new Uint8ClampedArray(task.imageData.data);
            worker.postMessage(
                {
                    imageData: { width: task.imageData.width, height: task.imageData.height, data: copy },
                    matches: task.matches,
                    taskId
                },
                [copy.buffer]
            );
        } catch (err) {
            clearTimeout(timer);
            this._activeTasks.delete(taskId);
            worker._inUse = false;
            task.reject(err);
            this._processQueue();
        }
    }

    postTask(imageData, matches) {
        return new Promise((resolve, reject) => {
            const task = { imageData, matches, resolve, reject, timer: null, workerInUse: null, taskId: -1 };

            const worker = this._getAvailableWorker();
            if (worker) {
                this._dispatchToWorker(worker, task);
            } else {
                this._taskQueue.push(task);
            }
        }).then(({ imageData: resultImageData, removalReport }) => {
            const data = resultImageData.data;
            data.removalReport = removalReport;
            return data;
        });
    }

    get isAvailable() {
        if (this._terminated) return false;
        this._ensureWorkers();
        return !this._failed && this._workers.length > 0;
    }

    get activeCount() {
        return this._activeTasks.size;
    }

    get pendingCount() {
        return this._taskQueue.length;
    }

    _failAll() {
        this._failed = true;
        for (const [, task] of this._activeTasks) {
            clearTimeout(task.timer);
            if (task.workerInUse) task.workerInUse._inUse = false;
            task.reject(new Error('Worker pool failed'));
        }
        this._activeTasks.clear();
        for (const task of this._taskQueue) {
            task.reject(new Error('Worker pool failed'));
        }
        this._taskQueue = [];
    }

    terminate() {
        this._terminated = true;
        this._failAll();
        for (const worker of this._workers) {
            try { worker.terminate(); } catch {}
        }
        this._workers = [];
    }
}
