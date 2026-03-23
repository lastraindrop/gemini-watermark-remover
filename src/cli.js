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

// Load embedded assets (we need to read them from the filesystem in Node)
const __dirname = new URL('.', import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, '$1:');
const BG_48_PATH = resolve(__dirname, 'assets/bg_48.png');
const BG_96_PATH = resolve(__dirname, 'assets/bg_96.png');

class CLIEngine {
    constructor() {
        this.alphaMaps = {};
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

        const config = detectWatermarkConfig(width, height);
        const position = calculateWatermarkPosition(width, height, config);
        const alphaMap = await this.getAlphaMap(config.logoSize);

        const { data, info } = await image
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const imageData = {
            width: info.width,
            height: info.height,
            data: new Uint8ClampedArray(data.buffer) // Use the buffer directly
        };

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
    const params = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-i' || args[i] === '--input') params.input = args[++i];
        if (args[i] === '-o' || args[i] === '--output') params.output = args[++i];
    }

    if (!params.input || !params.output) {
        console.log('Usage: node src/cli.js -i <input_file_or_dir> -o <output_dir>');
        process.exit(1);
    }

    const engine = new CLIEngine();
    const inputPath = resolve(params.input);
    const outputPath = resolve(params.output);

    if (!existsSync(outputPath)) {
        mkdirSync(outputPath, { recursive: true });
    }

    const processFile = async (file) => {
        if (!file.match(/\.(jpg|jpeg|png|webp)$/i)) return;
        const out = join(outputPath, `unwatermarked_${basename(file, extname(file))}.png`);
        console.log(`Processing: ${basename(file)}...`);
        try {
            await engine.processImage(file, out);
            console.log(`✅ Saved: ${basename(out)}`);
        } catch (err) {
            console.error(`❌ Failed: ${basename(file)} - ${err.message}`);
        }
    };

    if (statSync(inputPath).isDirectory()) {
        const files = readdirSync(inputPath).map(f => join(inputPath, f));
        for (const file of files) {
            if (statSync(file).isFile()) await processFile(file);
        }
    } else {
        await processFile(inputPath);
    }

    console.log('\n✨ All tasks completed!');
}

main().catch(console.error);
