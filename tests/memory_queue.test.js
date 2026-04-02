// File: tests/memory_queue.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Concurrency Queue Logic (Sliding Window)', () => {
    test('Queue should process at max concurrency without blocking', async () => {
        const tasks = Array.from({ length: 15 }, (_, i) => i);
        let activeCount = 0;
        let maxActive = 0;
        const concurrency = 4;
        const completed = [];

        // Mock sliding window processQueue logic
        await new Promise((resolve) => {
            let index = 0;
            const next = async () => {
                if (index >= tasks.length && activeCount === 0) {
                    return resolve();
                }

                while (activeCount < concurrency && index < tasks.length) {
                    const taskId = tasks[index++];
                    activeCount++;
                    maxActive = Math.max(maxActive, activeCount);

                    // Skip processing - just wait a tiny bit
                    (async () => {
                       await new Promise(res => setTimeout(res, Math.random() * 20));
                       completed.push(taskId);
                       activeCount--;
                       next();
                    })();
                }
            };
            next();
        });
        assert.strictEqual(completed.length, 15, 'All tasks should be processed');
        assert.ok(maxActive <= concurrency, `Max active (${maxActive}) should not exceed concurrency limit (${concurrency})`);
    });

    test('Queue should continue processing even if some tasks fail', async () => {
        const tasks = Array.from({ length: 10 }, (_, i) => i);
        let activeCount = 0;
        const concurrency = 3;
        const results = { success: [], fail: [] };

        await new Promise((resolve) => {
            let index = 0;
            const next = async () => {
                if (index >= tasks.length && activeCount === 0) return resolve();

                while (activeCount < concurrency && index < tasks.length) {
                    const taskId = tasks[index++];
                    activeCount++;

                    (async () => {
                        try {
                            await new Promise(res => setTimeout(res, 10));
                            if (taskId % 3 === 0) throw new Error('Simulated Task Failure');
                            results.success.push(taskId);
                        } catch (e) {
                            results.fail.push(taskId);
                        } finally {
                            activeCount--;
                            next();
                        }
                    })();
                }
            };
            next();
        });

        assert.strictEqual(results.success.length + results.fail.length, 10, 'All tasks (success or fail) should be accounted for');
        assert.ok(results.fail.length > 0, 'Should have recorded failures');
    });

    test('Streaming Discovery should respect concurrency', async () => {
        let discovered = 0;
        let processed = 0;
        let activeCount = 0;
        let maxActive = 0;
        const total = 10;
        const concurrency = 2;

        async function* discover() {
            for (let i = 0; i < total; i++) {
                discovered++;
                yield i;
            }
        }

        const iterator = discover();
        let isDone = false;

        await new Promise((resolve) => {
            const next = async () => {
                while (activeCount < concurrency && !isDone) {
                    const { done } = await iterator.next();
                    if (done) {
                        isDone = true;
                        if (activeCount === 0) resolve();
                        return;
                    }
                    activeCount++;
                    maxActive = Math.max(maxActive, activeCount);
                    (async () => {
                        await new Promise(res => setTimeout(res, 20));
                        processed++;
                        activeCount--;
                        next();
                    })();
                }
                if (isDone && activeCount === 0) resolve();
            };
            next();
        });

        assert.strictEqual(processed, total, 'All found files should be processed');
        assert.ok(maxActive <= concurrency, 'Should respect concurrency');
    });
});
