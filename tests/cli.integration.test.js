import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const TMP_DIR = join(process.cwd(), 'tmp_test_cli');

describe('CLI Integration Tests', () => {

    before(async () => {
        if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR);
        // Create a mock Gemini-like image (1024x1024)
        const img = await sharp({
            create: {
                width: 1024,
                height: 1024,
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
        assert.strictEqual(meta.width, 1024);
        assert.strictEqual(meta.format, 'png');
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
        // If deepScan is off and image is solid (no pixel match), it should fallback to config-based
        assert.strictEqual(json.detection, 'config', 'Should fallback to config when deepScan is disabled on mock image');
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
        // Verify 3 output files created with protocol prefix
        for (let i = 1; i <= 3; i++) {
            const expectedName = `unwatermarked_img_${i}.png`;
            assert.ok(existsSync(join(batchOutputDir, expectedName)), `Batch output ${expectedName} missing`);
        }
    });
});

