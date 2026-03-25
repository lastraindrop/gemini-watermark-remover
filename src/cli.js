#!/usr/bin/env node

/**
 * Gemini Watermark Remover - CLI Tool
 * High-performance automated service for local image processing
 */

import { resolve, join, basename, extname } from 'node:path';
import { readdirSync, statSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { calculateAlphaMap } from './core/alphaMap.js';
import { removeWatermark } from './core/blendModes.js';
import { detectWatermarkConfig, calculateWatermarkPosition } from './core/config.js';
import { detectWatermark } from './core/detector.js';

// Load embedded assets (we need to read them from the filesystem in Node)
const __dirname = new URL('.', import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, '$1:');
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

    async processImage(inputPath, outputPath) {
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        const { width, height } = metadata;

        const alphaMap48 = await this.getAlphaMap(48);
        const alphaMap96 = await this.getAlphaMap(96);

        const { data, info } = await image
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const imageData = {
            width: info.width,
            height: info.height,
            data: new Uint8ClampedArray(data.buffer)
        };

        const pixelDetect = detectWatermark(imageData, { 48: alphaMap48, 96: alphaMap96 });

        let position, alphaMap;
        if (pixelDetect) {
            position = { x: pixelDetect.x, y: pixelDetect.y, width: pixelDetect.size, height: pixelDetect.size };
            alphaMap = pixelDetect.size === 48 ? alphaMap48 : alphaMap96;
        } else {
            const config = detectWatermarkConfig(width, height);
            position = calculateWatermarkPosition(width, height, config);
            alphaMap = config.logoSize === 48 ? alphaMap48 : alphaMap96;
        }

        removeWatermark(imageData, alphaMap, position);

        await sharp(Buffer.from(imageData.data.buffer), {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4
            }
        })
        .toFormat(extname(outputPath).slice(1) || 'png')
        .toFile(outputPath);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const params = { json: args.includes('--json'), pipe: args.includes('--pipe') };
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-i' || args[i] === '--input') params.input = args[++i];
        if (args[i] === '-o' || args[i] === '--output') params.output = args[++i];
    }

    if (params.pipe) {
        // High-speed pipe mode: stdin -> process -> stdout
        try {
            const engine = new CLIEngine();
            const inputBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                process.stdin.on('data', chunk => chunks.push(chunk));
                process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
                process.stdin.on('error', reject);
            });

            const image = sharp(inputBuffer);
            const metadata = await image.metadata();
            const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const imageData = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer) };
            
            const alphaMap48 = await engine.getAlphaMap(48);
            const alphaMap96 = await engine.getAlphaMap(96);
            const pixelDetect = detectWatermark(imageData, { 48: alphaMap48, 96: alphaMap96 });

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

            const outBuffer = await sharp(Buffer.from(imageData.data.buffer), {
                raw: { width: info.width, height: info.height, channels: 4 }
            }).png().toBuffer();

            process.stdout.write(outBuffer);
            process.exit(0);
        } catch (err) {
            if (!params.json) console.error(err);
            else console.log(JSON.stringify({ status: 'error', message: err.message }));
            process.exit(1);
        }
        return;
    }

    if (!params.input || !params.output) {
        if (params.json) {
            console.log(JSON.stringify({ status: 'error', message: 'Missing input/output' }));
        } else {
            console.log('Usage: node src/cli.js -i <input> -o <output> [--json] [--pipe]');
        }
        process.exit(1);
    }

    const engine = new CLIEngine();
    const inputPath = resolve(params.input);
    const outputPath = resolve(params.output);

    if (!existsSync(outputPath) && !params.input.match(/\.(jpg|jpeg|png|webp)$/i)) {
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
            await engine.processImage(file, out);
            const duration = (performance.now() - start).toFixed(0);
            if (params.json) {
                console.log(JSON.stringify({ 
                    status: 'success', 
                    file: basename(file), 
                    output: out, 
                    duration_ms: duration,
                    detection: pixelDetect ? 'pixel' : 'config'
                }));
            } else {
                console.log(`✅ Saved: ${basename(out)} (${duration}ms)`);
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

        const pool = [];
        for (const file of files) {
            const p = processFile(file).then(() => {
                pool.splice(pool.indexOf(p), 1);
            });
            pool.push(p);
            if (pool.length >= concurrency) await Promise.race(pool);
        }
        await Promise.all(pool);
    } else {
        await processFile(inputPath);
    }

    if (!params.json) console.log('\n✨ All tasks completed!');
}


main().catch(console.error);
