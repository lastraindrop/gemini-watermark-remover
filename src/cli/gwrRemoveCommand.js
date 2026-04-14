import { resolve, join, basename, extname, dirname } from 'node:path';
import { readdirSync, statSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import sharp from 'sharp';

// Limit sharp internal concurrency
sharp.concurrency(1);

import { calculateAlphaMap } from '../core/alphaMap.js';
import { removeWatermark } from '../core/blendModes.js';
import { detectWatermarkConfig, calculateWatermarkPosition, getAllPotentialConfigs } from '../core/config.js';
import { detectWatermark, calculateProbeConfidence } from '../core/detector.js';
import { PROFILES } from '../core/profiles.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const ASSETS = {
    '48': resolve(__dirname, '../assets/bg_48.png'),
    '96': resolve(__dirname, '../assets/bg_96.png'),
    'doubao_br': resolve(__dirname, '../assets/bg_doubao_br.png'),
    'doubao_tl': resolve(__dirname, '../assets/bg_doubao_tl.png')
};

class Engine {
    constructor() {
        this.cache = {};
    }

    async getAlphaMap(assetKey, width, height) {
        const cacheKey = `${assetKey}_${width}x${height}`;
        if (this.cache[cacheKey]) return this.cache[cacheKey];

        const path = ASSETS[assetKey];
        if (!path || !existsSync(path)) {
            const legacyPath = ASSETS['96']; 
            if (legacyPath) return this.getAlphaMap('96', width, height);
            throw new Error(`Asset not found: ${assetKey}`);
        }

        const { data, info } = await sharp(path)
            .resize(width, height, { fit: 'fill' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const alphaMapData = calculateAlphaMap({
            width: info.width,
            height: info.height,
            data: new Uint8ClampedArray(data)
        });

        const result = { data: alphaMapData, width: info.width, height: info.height, assetKey };
        this.cache[cacheKey] = result;
        return result;
    }

    async processBuffer(buffer, options) {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const imageData = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer) };
        
        const profileId = options.profile || 'gemini';
        const profile = PROFILES[profileId] || PROFILES.gemini;

        const potentialConfigs = getAllPotentialConfigs(info.width, info.height, profileId);
        const probes = [];

        for (const config of potentialConfigs) {
            const assetKey = profile.assets ? profile.assets[config.anchor] : (profile.defaultAsset || '96');
            const w = config.logoWidth || config.logoSize;
            const h = config.logoHeight || config.logoSize;
            
            const alphaMap = await this.getAlphaMap(assetKey, w, h);
            const pos = calculateWatermarkPosition(info.width, info.height, config);
            
            probes.push({ config, pos, alphaMap });
        }

        let winner = null;
        let removedCounter = 0;
        const THRESHOLD = 0.25;

        for (const probe of probes) {
            const probeResult = calculateProbeConfidence(imageData, probe.pos, probe.alphaMap.data, options.profile || 'gemini');
            const confidence = probeResult.confidence;
            
            if (confidence > THRESHOLD) {
                const finalPos = { ...probe.pos, x: probeResult.x, y: probeResult.y };
                removeWatermark(imageData, probe.alphaMap.data, finalPos);
                removedCounter++;
                if (!winner || confidence > winner.confidence) {
                    winner = { ...probe, pos: finalPos, confidence };
                }
            }
        }

        if (!winner) {
            // No watermark detected with high enough confidence
            return {
                buffer: buffer, // Return original buffer
                detection: 'none',
                confidence: '0%',
                removedCount: 0
            };
        }

        const format = options.format || 'png';
        const outImg = sharp(imageData.data, {
            raw: { width: imageData.width, height: imageData.height, channels: 4 }
        });
        
        const outputBuffer = await outImg[format]().toBuffer();

        return {
            buffer: outputBuffer,
            detection: winner.config.isOfficial ? 'catalog' : 'heuristic',
            confidence: (winner.confidence * 100).toFixed(0) + '%',
            config: winner.config,
            removedCount: removedCounter
        };
    }
}

/**
 * Basic Arg Parser (Zero Dependency Replacement for Yargs)
 */
function parseArgs(args) {
    const opts = { _: [], profile: 'gemini', format: 'png', overwrite: false, json: false, pipe: false };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--output' || arg === '-o') opts.output = args[++i];
        else if (arg === '--out-dir' || arg === '-d') opts.outDir = args[++i];
        else if (arg === '--profile' || arg === '-p') opts.profile = args[++i];
        else if (arg === '--format' || arg === '-f') opts.format = args[++i];
        else if (arg === '--overwrite') opts.overwrite = true;
        else if (arg === '--json') opts.json = true;
        else if (arg === '--pipe') opts.pipe = true;
        else if (!arg.startsWith('-')) opts._.push(arg);
    }
    return opts;
}

export async function runRemoveCommand(args, io) {
    const opts = parseArgs(args);
    const engine = new Engine();
    const startTime = performance.now();

    // --- Pipe mode: read from stdin, write to stdout ---
    if (opts.pipe) {
        const chunks = [];
        for await (const chunk of io.stdin || process.stdin) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        try {
            const result = await engine.processBuffer(buffer, opts);
            if (io.stdout.write) {
                io.stdout.write(result.buffer);
            }
        } catch (err) {
            io.stderr.write(`❌ Pipe error: ${err.message}\n`);
            return 1;
        }
        return 0;
    }

    const input = opts._[0];
    if (!input) {
        io.stderr.write('Error: No input specified.\n');
        return 1;
    }

    try {
        const stats = statSync(input);
        if (stats.isDirectory()) {
            const files = readdirSync(input).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
            const outDir = opts.outDir || join(input, 'output');
            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

            if (!opts.json) io.stdout.write(`🚀 Batch processing ${files.length} images (Profile: ${opts.profile})...\n`);
            let count = 0;
            for (const file of files) {
                const inputPath = join(input, file);
                const outputPath = join(outDir, `${basename(file, extname(file))}.${opts.format}`);
                if (existsSync(outputPath) && !opts.overwrite) continue;

                const buffer = readFileSync(inputPath);
                const result = await engine.processBuffer(buffer, opts);
                writeFileSync(outputPath, result.buffer);
                count++;
                if (!opts.json) io.stdout.write('.');
            }
            if (!opts.json) io.stdout.write(`\n✅ Done! Processed ${count} images in ${((performance.now() - startTime)/1000).toFixed(2)}s\n`);
        } else {
            const outputPath = opts.output || `${basename(input, extname(input))}_removed.${opts.format}`;
            const buffer = readFileSync(input);
            const result = await engine.processBuffer(buffer, opts);
            writeFileSync(outputPath, result.buffer);

            if (opts.json) {
                const { buffer: _, ...logInfo } = result;
                io.stdout.write(JSON.stringify({
                    status: 'success',
                    output: resolve(outputPath),
                    duration_ms: (performance.now() - startTime).toFixed(0),
                    ...logInfo
                }) + '\n');
            } else {
                io.stdout.write(`✅ Watermark removed (${result.removedCount} markers): ${outputPath} (${result.detection}, ${result.confidence})\n`);
            }
        }
        return 0;
    } catch (err) {
        if (opts.json) {
            io.stderr.write(JSON.stringify({ status: 'error', message: err.message }) + '\n');
        } else {
            io.stderr.write(`❌ Error: ${err.message}\n`);
        }
        return 1;
    }
}
