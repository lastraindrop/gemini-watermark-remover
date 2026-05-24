import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runRemoveCommand } from '../src/cli/gwrRemoveCommand.js';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';

const TMPDIR = resolve(import.meta.dirname, '../.test-output/cli-edge');
function cleanup() { if (existsSync(TMPDIR)) rmSync(TMPDIR, { recursive: true }); }

describe('CLI Edge Case Tests', () => {
    it('parseArgs handles all flags correctly', () => {
        const args = ['input.png', '--output', 'out.png', '--profile', 'gemini', '--format', 'png', '--overwrite', '--json', '--no-deepScan', '--noiseReduction', '--probeThreshold', '0.2', '--gradientPenalty', '0.5'];
        const opts = parseArgs(args);
        assert.deepEqual(opts._, ['input.png']);
        assert.equal(opts.output, 'out.png');
        assert.equal(opts.profile, 'gemini');
        assert.equal(opts.format, 'png');
        assert.equal(opts.overwrite, true);
        assert.equal(opts.json, true);
        assert.equal(opts.deepScan, false);
        assert.equal(opts.noiseReduction, true);
        assert.equal(opts.probeThreshold, 0.2);
        assert.equal(opts.gradientPenalty, 0.5);
    });

    it('parseArgs defaults are correct', () => {
        const opts = parseArgs(['input.png']);
        assert.equal(opts.profile, 'gemini');
        assert.equal(opts.format, 'png');
        assert.equal(opts.overwrite, false);
        assert.equal(opts.json, false);
        assert.equal(opts.deepScan, true);
        assert.equal(opts.noiseReduction, false);
    });

    it('runRemoveCommand returns error for no input', async () => {
        const errors = [];
        const io = { stdout: { write: () => {} }, stderr: { write: (msg) => errors.push(msg) }, cwd: process.cwd() };
        const code = await runRemoveCommand([], io);
        assert.equal(code, 1, 'Should return error code');
        assert.ok(errors.length > 0, 'Should write error message');
    });

    it('runRemoveCommand returns error for unknown profile', async () => {
        const errors = [];
        const io = { stdout: { write: () => {} }, stderr: { write: (msg) => errors.push(msg) }, cwd: process.cwd() };
        const code = await runRemoveCommand(['input.png', '--profile', 'nonexistent'], io);
        assert.equal(code, 1);
    });

    it('runRemoveCommand returns error for experimental profile', async () => {
        const errors = [];
        const io = { stdout: { write: () => {} }, stderr: { write: (msg) => errors.push(msg) }, cwd: process.cwd() };
        const code = await runRemoveCommand(['input.png', '--profile', 'dalle3'], io);
        assert.equal(code, 1);
    });

    it('runRemoveCommand processes a single PNG file', async () => {
        cleanup();
        mkdirSync(TMPDIR, { recursive: true });
        const samplePath = resolve(import.meta.dirname, '../src/assets/bg_48.png');
        if (!existsSync(samplePath)) { cleanup(); return; }
        const outputPath = join(TMPDIR, 'output.png');
        const stdout = [];
        const io = { stdout: { write: (msg) => stdout.push(msg) }, stderr: { write: (msg) => {} }, cwd: process.cwd() };
        const code = await runRemoveCommand([samplePath, '--output', outputPath], io);
        assert.equal(code, 0, 'Should succeed');
        assert.ok(existsSync(outputPath), 'Output file should exist');
        cleanup();
    });

    it('runRemoveCommand with --json outputs valid JSON', async () => {
        cleanup();
        mkdirSync(TMPDIR, { recursive: true });
        const samplePath = resolve(import.meta.dirname, '../src/assets/bg_48.png');
        if (!existsSync(samplePath)) { cleanup(); return; }
        const outputPath = join(TMPDIR, 'output.json_test.png');
        const stdout = [];
        const io = { stdout: { write: (msg) => stdout.push(msg) }, stderr: { write: (msg) => {} }, cwd: process.cwd() };
        await runRemoveCommand([samplePath, '--output', outputPath, '--json'], io);
        const output = stdout.join('');
        assert.ok(output.includes('"status"'), 'Should contain JSON status');
        assert.doesNotThrow(() => JSON.parse(output), 'Should be valid JSON');
        cleanup();
    });

    it('runRemoveCommand handles directory batch mode', async () => {
        cleanup();
        mkdirSync(TMPDIR, { recursive: true });
        const inputDir = join(TMPDIR, 'input');
        const outputDir = join(TMPDIR, 'output');
        mkdirSync(inputDir, { recursive: true });
        const samplePath = resolve(import.meta.dirname, '../src/assets/bg_48.png');
        if (!existsSync(samplePath)) { cleanup(); return; }
        const testFile = join(inputDir, 'test.png');
        writeFileSync(testFile, readFileSync(samplePath));
        const stdout = [];
        const io = { stdout: { write: (msg) => stdout.push(msg) }, stderr: { write: (msg) => {} }, cwd: process.cwd() };
        const code = await runRemoveCommand([inputDir, '--out-dir', outputDir], io);
        assert.equal(code, 0, 'Batch should succeed');
        cleanup();
    });

    it('parseArgs handles pipe flag', () => {
        const opts = parseArgs(['--pipe']);
        assert.equal(opts.pipe, true);
    });
});
