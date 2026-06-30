import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function timeoutForPixels(pixelCount) {
    const script = [
        'from python.remover import GeminiWatermarkRemover',
        `print(GeminiWatermarkRemover.calculate_timeout_seconds_for_pixels(${pixelCount}))`
    ].join('; ');
    const result = spawnSync('python', ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return Number.parseInt(result.stdout.trim(), 10);
}

describe('Python bridge timeout scales with image size (BUG-H8)', () => {
    test('small images keep the 60s floor', () => {
        assert.equal(timeoutForPixels(512 * 512), 60);
        assert.equal(timeoutForPixels(2048 * 2048), 60);
    });

    test('24MP images receive at least 240s timeout', () => {
        assert.ok(timeoutForPixels(6000 * 4000) >= 240);
    });

    test('extreme images are capped to avoid runaway waits', () => {
        assert.equal(timeoutForPixels(100_000_000), 600);
    });
});
