import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROFILES } from '../src/core/profiles.js';

const root = process.cwd();
const activeDocs = ['README.md', 'README_zh.md', 'USER_GUIDE.md', 'DEVELOPER_GUIDE.md', 'TECHNICAL_GUIDE.md', 'ROADMAP.md'];
const read = file => readFileSync(resolve(root, file), 'utf8');

describe('active documentation contract', () => {
    test('documents every registered production profile and no removed profile', () => {
        const combined = activeDocs.map(read).join('\n').toLowerCase();
        for (const profileId of Object.keys(PROFILES)) {
            assert.ok(combined.includes(profileId), `active docs must mention registered profile ${profileId}`);
        }
        assert.doesNotMatch(combined, /dall[·-]?e|dalle3/i);
    });

    test('verification commands map to package scripts', () => {
        const pkg = JSON.parse(read('package.json'));
        const combined = activeDocs.map(read).join('\n');
        const documentedScripts = [...combined.matchAll(/pnpm (test(?::[a-z-]+)?|lint|build)\b/g)]
            .map(match => match[1]);

        for (const command of new Set(documentedScripts)) {
            assert.ok(pkg.scripts[command], `documented command pnpm ${command} must exist in package.json`);
        }
    });

    test('removed implementation paths are absent from active docs', () => {
        const combined = activeDocs.map(read).join('\n');
        assert.doesNotMatch(combined, /gradientPenalty|applyEdgeCleanup|getHaloRetryGains|halo_feedback_retry/);
    });
});
