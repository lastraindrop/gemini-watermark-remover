import { resolve, join, basename, extname } from 'node:path';
import { readdirSync, statSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Limit sharp internal concurrency
sharp.concurrency(1);

import { calculateAlphaMap } from '../core/alphaMap.js';
import { detectWatermarks } from '../core/detectionPipeline.js';
import { PROFILES } from '../core/profiles.js';
import { applyRemovalStrategy } from '../core/applyRemoval.js';
import { getAssetDefinition, getAssetFileName, listAssetKeys } from '../core/assetRegistry.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function buildAssetMap() {
    const assetsDir = resolve(__dirname, '../assets');
    const map = {};
    for (const key of listAssetKeys()) {
        const fileName = getAssetFileName(key);
        if (!fileName) continue;
        const candidate = resolve(assetsDir, fileName);
        if (existsSync(candidate)) map[key] = candidate;
    }
    return map;
}

const ASSETS = buildAssetMap();

export class Engine {
    constructor() {
        this.cache = {};
    }

    async getAlphaMap(assetKey, width, height) {
        const cacheKey = `${assetKey}_${width}x${height}`;
        if (this.cache[cacheKey]) return this.cache[cacheKey];

        const path = ASSETS[assetKey];
        if (!path || !existsSync(path)) {
            throw new Error(`Unknown or missing alpha asset: ${assetKey}`);
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

        const result = {
            data: alphaMapData,
            width: info.width,
            height: info.height,
            assetKey,
            alphaBias: getAssetDefinition(assetKey)?.alphaBias || 0
        };
        this.cache[cacheKey] = result;
        return result;
    }

    async processBuffer(buffer, options) {
        const image = sharp(buffer);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const imageData = { 
            width: info.width, 
            height: info.height, 
            data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) 
        };
        
        const detection = await detectWatermarks({
            imageData,
            profileId: options.profile || 'gemini',
            getAlphaMap: (assetKey, width, height) => this.getAlphaMap(assetKey, width, height),
            options: {
                deepScan: options.deepScan !== false,
                noiseReduction: options.noiseReduction === true,
                ...options // v2.1 Custom overrides
            }
        });

        const winner = detection.winner;
        if (!winner) {
            // No watermark detected with high enough confidence
            const format = options.format || 'png';
            const outputBuffer = await sharp(buffer)[format]().toBuffer();
            return {
                buffer: outputBuffer,
                detection: 'none',
                confidence: 0.0,
                removedCount: 0,
                trace: detection.trace || null
            };
        }

        const removal = applyRemovalStrategy(imageData, detection.matches);

        const format = options.format || 'png';
        const outImg = sharp(imageData.data, {
            raw: { width: imageData.width, height: imageData.height, channels: 4 }
        });
        
        const outputBuffer = await outImg[format]().toBuffer();

        return {
            buffer: outputBuffer,
            detection: winner.config.isOfficial ? 'catalog' : 'heuristic',
            confidence: winner.confidence, // Return raw float for better JSON consumers
            config: winner.config,
            removedCount: removal.appliedCount,
            removal,
            profileId: detection.profileId,
            source: winner.source,
            trace: detection.trace || null
        };
    }
}

/**
 * Basic Arg Parser (Zero Dependency Replacement for Yargs)
 */
function getArgValue(args, i, flagName) {
    const val = args[i + 1];
    if (val === undefined || val.startsWith('-')) {
        throw new Error(`Missing value for ${flagName}`);
    }
    return val;
}

export function parseArgs(args) {
    const opts = {
        _: [],
        profile: 'gemini',
        format: 'png',
        overwrite: false,
        json: false,
        pipe: false,
        deepScan: true,
        noiseReduction: false
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--output' || arg === '-o') { opts.output = getArgValue(args, i++, arg); }
        else if (arg === '--out-dir' || arg === '-d') { opts.outDir = getArgValue(args, i++, arg); }
        else if (arg === '--profile' || arg === '-p') { opts.profile = getArgValue(args, i++, arg); }
        else if (arg === '--format' || arg === '-f') { opts.format = getArgValue(args, i++, arg); }
        else if (arg === '--overwrite') opts.overwrite = true;
        else if (arg === '--json') opts.json = true;
        else if (arg === '--pipe') opts.pipe = true;
        else if (arg === '--no-deepScan') opts.deepScan = false;
        else if (arg === '--noiseReduction') opts.noiseReduction = true;
        // v2.1 Advanced CLI Flags
        else if (arg === '--probeThreshold') { opts.probeThreshold = parseFloat(getArgValue(args, i++, arg)); }
        else if (arg === '--fallbackThreshold') { opts.fallbackThreshold = parseFloat(getArgValue(args, i++, arg)); }
        else if (!arg.startsWith('-')) opts._.push(arg);
    }
    return opts;
}

export async function runRemoveCommand(args, io) {
    const opts = parseArgs(args);
    const engine = new Engine();
    const startTime = performance.now();

    const isSupportedProfile = opts.profile === 'auto' || Boolean(PROFILES[opts.profile]);
    if (!isSupportedProfile) {
        io.stderr.write(`Error: Unknown profile: ${opts.profile}\n`);
        return 1;
    }
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
            // v1.9.6: fallback to opts.output if opts.outDir is not provided (for GUI compatibility)
            const outDir = opts.outDir || opts.output || join(input, 'output');
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
            let outputPath = opts.output || `${basename(input, extname(input))}_removed.${opts.format}`;
            
            // v1.9.6: If output is a directory, append the original filename
            if (existsSync(outputPath) && statSync(outputPath).isDirectory()) {
                outputPath = join(outputPath, `${basename(input, extname(input))}_removed.${opts.format}`);
            }

            const buffer = readFileSync(input);
            const result = await engine.processBuffer(buffer, opts);
            writeFileSync(outputPath, result.buffer);

            if (opts.json) {
                const logInfo = { ...result };
                delete logInfo.buffer;
                io.stdout.write(JSON.stringify({
                    status: 'success',
                    output: resolve(outputPath),
                    duration_ms: (performance.now() - startTime).toFixed(0),
                    ...logInfo
                }) + '\n');
            } else if (result.removedCount === 0) {
                const confPercent = (result.confidence * 100).toFixed(0) + '%';
                io.stdout.write(`No watermark change applied: ${outputPath} (${result.detection}, ${confPercent})\n`);
            } else {
                const confPercent = (result.confidence * 100).toFixed(0) + '%';
                io.stdout.write(`✅ Watermark removed (${result.removedCount} markers): ${outputPath} (${result.detection}, ${confPercent})\n`);
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
