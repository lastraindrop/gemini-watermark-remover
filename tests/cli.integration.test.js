import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const TMP_DIR = join(process.cwd(), 'tmp_test_cli');
const PACKAGE_VERSION = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version;

describe('CLI Integration Tests', () => {

    before(async () => {
        if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR);
        // Create a mock Gemini-like image (256x256)
        const img = await sharp({
            create: {
                width: 256,
                height: 256,
                channels: 4,
                background: { r: 128, g: 128, b: 128, alpha: 1 }
            }
        }).png().toBuffer();
        writeFileSync(join(TMP_DIR, 'input.png'), img);
    });

    after(() => {
        if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    });

    test('Single file processing (-i, -o)', () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'output.png');
        
        const result = spawnSync('node', ['src/cli.js', '-i', input, '-o', output]);
        
        assert.strictEqual(result.status, 0, `CLI failed: ${result.stderr.toString()}`);
        assert.ok(existsSync(output), 'Output file should be created');
    });

    test('JSON mode output', () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'output_json.png');
        
        const result = spawnSync('node', ['src/cli.js', '-i', input, '-o', output, '--json']);
        
        assert.strictEqual(result.status, 0);
        const outputStr = result.stdout.toString();
        const json = JSON.parse(outputStr.split('\n').filter(l => l.trim()).pop());
        
        assert.strictEqual(json.status, 'success');
        assert.ok(json.duration_ms);
        assert.ok(json.detection);
    });

    test('Pipe mode (stdin/stdout)', async () => {
        const inputBuffer = readFileSync(join(TMP_DIR, 'input.png'));
        
        const result = spawnSync('node', ['src/cli.js', '--pipe'], {
            input: inputBuffer,
            encoding: 'buffer'
        });
        
        assert.strictEqual(result.status, 0);
        assert.ok(result.stdout.length > 0, 'Stdout should contain image data');
        
        // Verify it's a valid image
        const meta = await sharp(result.stdout).metadata();
        assert.strictEqual(meta.width, 256);
        assert.strictEqual(meta.format, 'png');
    });

    test('Output path without extension should default to PNG', () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'output_no_ext');
        
        const result = spawnSync('node', ['src/cli.js', '-i', input, '-o', output]);
        
        assert.strictEqual(result.status, 0);
        assert.ok(existsSync(output), 'Output file should be created');
        
        // Verify it is a valid PNG
        const resultBuffer = readFileSync(output);
        // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
        assert.strictEqual(resultBuffer[0], 0x89);
        assert.strictEqual(resultBuffer[1], 0x50);
    });

    test('Legacy -i adapter without -o uses the default output filename', () => {
        const cliPath = join(process.cwd(), 'src/cli.js');
        const result = spawnSync('node', [cliPath, '-i', 'input.png'], { cwd: TMP_DIR });

        assert.strictEqual(result.status, 0, `CLI failed: ${result.stderr.toString()}`);
        assert.ok(existsSync(join(TMP_DIR, 'input_removed.png')), 'Default output file should be created');
        assert.ok(!existsSync(join(TMP_DIR, '-i')), 'Missing -o must not be treated as an output path');
    });

    test('Flag Verification: --no-deepScan and --noiseReduction', () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'output_flags.png');
        
        // Test with flags enabled/disabled
        const result = spawnSync('node', [
            'src/cli.js', 
            '-i', input, 
            '-o', output, 
            '--json', 
            '--noiseReduction', 
            '--no-deepScan'
        ]);
        
        assert.strictEqual(result.status, 0);
        const json = JSON.parse(result.stdout.toString().split('\n').filter(l => l.trim()).pop());
        assert.strictEqual(json.status, 'success');
        // A plain solid-color image has no watermark; detection should be 'none'
        assert.ok(['none', 'catalog', 'heuristic'].includes(json.detection), 
            `Unexpected detection value: ${json.detection}`);
    });

    test('Legacy -i/-o adapter preserves format and overwrite flags', async () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'legacy_format.webp');

        const first = spawnSync('node', ['src/cli.js', '-i', input, '-o', output, '--format', 'webp']);
        const second = spawnSync('node', ['src/cli.js', '-i', input, '-o', output, '--format', 'webp', '--overwrite']);

        assert.strictEqual(first.status, 0, `Initial CLI run failed: ${first.stderr.toString()}`);
        assert.strictEqual(second.status, 0, `Overwrite CLI run failed: ${second.stderr.toString()}`);

        const meta = await sharp(readFileSync(output)).metadata();
        assert.strictEqual(meta.format, 'webp');
    });

    test('Unknown profiles fail explicitly in CLI', () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'output_unknown.png');

        const result = spawnSync('node', ['src/cli.js', '-i', input, '-o', output, '--profile', 'legacy-model']);

        assert.strictEqual(result.status, 1);
        assert.match(result.stderr.toString(), /Unknown profile/);
    });

    test('Auto profile reaches the shared detection pipeline', () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'output_auto.png');

        const result = spawnSync('node', ['src/cli.js', '-i', input, '-o', output, '--profile', 'auto', '--json']);

        assert.strictEqual(result.status, 0, `Auto profile CLI failed: ${result.stderr.toString()}`);
        assert.ok(existsSync(output), 'Auto profile output should be created');
    });

    test('Error handling: Missing arguments', () => {
        const result = spawnSync('node', ['src/cli.js', '-i', 'missing.png']);
        assert.strictEqual(result.status, 1);
    });

    test('Directory batch processing', () => {
        const batchInputDir = join(TMP_DIR, 'batch_input');
        const batchOutputDir = join(TMP_DIR, 'batch_output');
        if (!existsSync(batchInputDir)) mkdirSync(batchInputDir);
        if (!existsSync(batchOutputDir)) mkdirSync(batchOutputDir);
        
        // Create 3 mock images
        for (let i = 1; i <= 3; i++) {
            const buffer = readFileSync(join(TMP_DIR, 'input.png'));
            writeFileSync(join(batchInputDir, `img_${i}.png`), buffer);
        }
        
        const result = spawnSync('node', ['src/cli.js', '-i', batchInputDir, '-o', batchOutputDir]);
        
        assert.strictEqual(result.status, 0);
        for (let i = 1; i <= 3; i++) {
            const expectedName = `img_${i}.png`;
            assert.ok(existsSync(join(batchOutputDir, expectedName)), `Batch output ${expectedName} missing`);
        }
    });

    test('Doubao profile processing via CLI', () => {
        const input = join(TMP_DIR, 'input.png');
        const output = join(TMP_DIR, 'output_doubao.png');
        
        const result = spawnSync('node', ['src/cli.js', '-i', input, '-o', output, '--profile', 'doubao', '--json']);
        
        assert.strictEqual(result.status, 0, `Doubao profile CLI failed: ${result.stderr.toString()}`);
        assert.ok(existsSync(output), 'Doubao output should be created');
    });

    test('Version flag outputs correct version', () => {
        const result = spawnSync('node', ['src/cli.js', '--version']);
        
        assert.strictEqual(result.status, 0);
        const output = result.stdout.toString().trim();
        assert.ok(output.includes(PACKAGE_VERSION), `Version should contain ${PACKAGE_VERSION}, got: ${output}`);
    });
});
