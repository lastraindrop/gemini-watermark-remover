import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { loadImage } from '../src/utils.js';
import { objectUrlManager } from '../src/app/state.js';
import { MockImageElement, setupMemoryMocks } from './test_utils.js';

describe('Object URL lifecycle', () => {
    beforeEach(() => {
        global.document = { getElementById: () => null };
        global.Image = MockImageElement;
        setupMemoryMocks();
        objectUrlManager.urls.clear();
    });

    test('loadImage registers blob URLs for workspace cleanup', async () => {
        const img = await loadImage(new Blob(['mock'], { type: 'image/png' }), { objectUrlManager });

        assert.ok(img.src.startsWith('blob:mock-'));
        assert.strictEqual(objectUrlManager.urls.size, 1);
        assert.strictEqual(global.MockMemoryTracker.size, 1);

        objectUrlManager.clear();
        assert.strictEqual(objectUrlManager.urls.size, 0);
        assert.strictEqual(global.MockMemoryTracker.size, 0);
    });
});
