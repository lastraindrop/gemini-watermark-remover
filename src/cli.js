#!/usr/bin/env node

/**
 * Gemini Watermark Remover - CLI Tool
 * High-performance automated service for local image processing
 */

import { resolve, join, basename, extname } from 'node:path';
import { readdirSync, statSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
// Limit sharp internal concurrency to prevent resource contention with our JS pool
sharp.concurrency(1);

import { calculateAlphaMap } from './core/alphaMap.js';
import { removeWatermark } from './core/blendModes.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from './core/config.js';
import { detectWatermark } from './core/detector.js';

// Load embedded assets (we need to read them from the filesystem in Node)
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BG_48_PATH = resolve(__dirname, 'assets/bg_48.png');
const BG_96_PATH = resolve(__dirname, 'assets/bg_96.png');

class CLIEngine {
    constructor() {
        this.alphaMaps = {};
        this._checkAssets();
    }

    _checkAssets() {
        [BG_48_PATH, BG_96_PATH].forEach(path => {
            if (!existsSync(path)) {
                console.error(`❌ Critical Error: Asset not found at ${path}`);
                console.error('   Please ensure you have built the project or are running from the correct directory.');
                process.exit(1);
            }
        });
    }

    async getAlphaMap(size) {
        if (this.alphaMaps[size]) return this.alphaMaps[size];

        const path = size === 48 ? BG_48_PATH : BG_96_PATH;
        const { data, info } = await sharp(path)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const alphaMap = calculateAlphaMap({
            width: info.width,
            height: info.height,
            data: new Uint8ClampedArray(data)
        });

        this.alphaMaps[size] = alphaMap;
        return alphaMap;
    }

    async _processBuffer(buffer, options = { deepScan: true, noiseReduction: false }) {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const imageData = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer) };
        
        const alphaMap48 = await this.getAlphaMap(48);
        const alphaMap96 = await this.getAlphaMap(96);
        const pixelDetect = detectWatermark(imageData, { 48: alphaMap48, 96: alphaMap96 }, options);

        let position, alphaMap;
        if (pixelDetect) {
            position = { x: pixelDetect.x, y: pixelDetect.y, width: pixelDetect.size, height: pixelDetect.size };
            alphaMap = pixelDetect.size === 48 ? alphaMap48 : alphaMap96;
        } else {
            const config = detectWatermarkConfig(metadata.width, metadata.height);
            position = calculateWatermarkPosition(metadata.width, metadata.height, config);
            alphaMap = config.logoSize === 48 ? alphaMap48 : alphaMap96;
        }
        
        removeWatermark(imageData, alphaMap, position);

        const processedBuffer = await sharp(Buffer.from(imageData.data.buffer), {
            raw: { width: info.width, height: info.height, channels: 4 }
        }).png().toBuffer();

        return { 
            buffer: processedBuffer, 
            metadata: { 
                detection: pixelDetect ? 'pixel' : 'config',
                width: metadata.width,
                height: metadata.height
            } 
        };
    }

    async processImage(inputPath, outputPath, options = { deepScan: true, noiseReduction: false }) {
        const inputBuffer = readFileSync(inputPath);
        const { buffer, metadata } = await this._processBuffer(inputBuffer, options);
        
        await sharp(buffer)
            .toFormat(extname(outputPath).slice(1) || 'png')
            .toFile(outputPath);

        return metadata;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const params = { 
        json: args.includes('--json'), 
        pipe: args.includes('--pipe'),
        deepScan: !args.includes('--no-deepScan'), // default true
        noiseReduction: args.includes('--noiseReduction') // default false
    };
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-i' || args[i] === '--input') params.input = args[++i];
        if (args[i] === '-o' || args[i] === '--output') params.output = args[++i];
    }

    if (args.includes('--version') || args.includes('-v')) {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
        console.log(`Gemini Watermark Remover CLI v${pkg.version}`);
        process.exit(0);
    }

    const engine = new CLIEngine();

    if (params.pipe) {
        // High-speed pipe mode: stdin -> process -> stdout
        try {
            const inputBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                process.stdin.on('data', chunk => chunks.push(chunk));
                process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
                process.stdin.on('error', reject);
            });

            if (inputBuffer.length === 0) throw new Error('Empty stdin buffer');

            const { buffer } = await engine._processBuffer(inputBuffer, { 
                deepScan: params.deepScan, 
                noiseReduction: params.noiseReduction 
            });
            process.stdout.write(buffer);
            process.exit(0);
        } catch (err) {
            const msg = err.message || 'Unknown error';
            if (params.json) {
                console.log(JSON.stringify({ status: 'error', message: msg }));
            } else {
                console.error(`❌ Pipe Error: ${msg}`);
            }
            process.exit(1);
        }
        return;
    }

    if (!params.input || !params.output) {
        if (params.json) {
            console.log(JSON.stringify({ status: 'error', message: 'Missing input/output' }));
        } else {
            console.log('Usage: node src/cli.js -i <input> -o <output> [--json] [--pipe] [--noiseReduction] [--no-deepScan] [-v|--version]');
        }
        process.exit(1);
    }

    const inputPath = resolve(params.input);
    const outputPath = resolve(params.output);

    if (!existsSync(inputPath)) {
        const msg = `Input path does not exist: ${params.input}`;
        if (params.json) {
            console.log(JSON.stringify({ status: 'error', message: msg }));
        } else {
            console.error(`❌ Error: ${msg}`);
        }
        process.exit(1);
    }

    const isInputDir = statSync(inputPath).isDirectory();
    if (isInputDir && !existsSync(outputPath)) {
        mkdirSync(outputPath, { recursive: true });
    }

    const processFile = async (file) => {
        if (!file.match(/\.(jpg|jpeg|png|webp)$/i)) return;
        
        let out;
        const outExists = existsSync(outputPath);
        if (outExists && statSync(outputPath).isDirectory()) {
            out = join(outputPath, `unwatermarked_${basename(file, extname(file))}.png`);
        } else if (!outExists && (outputPath.endsWith('/') || outputPath.endsWith('\\'))) {
            // Treat as directory if it ends with a slash
            mkdirSync(outputPath, { recursive: true });
            out = join(outputPath, `unwatermarked_${basename(file, extname(file))}.png`);
        } else {
            // Treat as file
            out = outputPath;
        }
            
        const start = performance.now();
        try {
            const meta = await engine.processImage(file, out, { 
                deepScan: params.deepScan, 
                noiseReduction: params.noiseReduction 
            });
            const duration = (performance.now() - start).toFixed(0);
            if (params.json) {
                console.log(JSON.stringify({ 
                    status: 'success', 
                    file: basename(file), 
                    output: out, 
                    duration_ms: duration,
                    detection: meta.detection
                }));
            } else {
                console.log(`✅ Saved: ${basename(out)} (${duration}ms, detection: ${meta.detection})`);
            }
        } catch (err) {
            if (params.json) {
                console.log(JSON.stringify({ status: 'error', file: basename(file), message: err.message }));
            } else {
                console.error(`❌ Failed: ${basename(file)} - ${err.message}`);
            }
        }
    };

    if (statSync(inputPath).isDirectory()) {
        const files = readdirSync(inputPath)
            .map(f => join(inputPath, f))
            .filter(f => statSync(f).isFile() && f.match(/\.(jpg|jpeg|png|webp)$/i));
        
        const os = await import('node:os');
        const concurrency = Math.max(1, os.cpus().length - 1);
        if (!params.json) console.log(`🚀 Processing ${files.length} files (concurrency: ${concurrency})\n`);

        const pool = new Set();
        for (const file of files) {
            const p = processFile(file).then(() => {
                pool.delete(p);
            });
            pool.add(p);
            if (pool.size >= concurrency) await Promise.race(pool);
        }
        await Promise.all(pool);
    } else {
        await processFile(inputPath);
    }

    if (!params.json) console.log('\n✨ All tasks completed!');
}


main().catch(console.error);
