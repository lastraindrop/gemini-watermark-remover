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
        const imageData = { 
            width: info.width, 
            height: info.height, 
            data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) 
        };
        
        const requestedProfileId = options.profile || 'gemini';
        const profilesToTry = requestedProfileId === 'auto' ? Object.keys(PROFILES) : [requestedProfileId];

        const THRESHOLD = 0.25;
        let winner = null;
        let removedCounter = 0;

        const tryProfile = async (id) => {
            const p = PROFILES[id] || PROFILES.gemini;
            const potentialConfigs = getAllPotentialConfigs(info.width, info.height, id);
            let localWinner = null;
            let localRemoved = 0;

            for (const config of potentialConfigs) {
                const assetKey = p.assets ? p.assets[config.anchor] : (p.defaultAsset || '96');
                const w = config.logoWidth || config.logoSize;
                const h = config.logoHeight || config.logoSize;
                
                const alphaMap = await this.getAlphaMap(assetKey, w, h);
                const pos = calculateWatermarkPosition(info.width, info.height, config);
                
                const probeResult = calculateProbeConfidence(imageData, pos, alphaMap.data, id);
                const confidence = probeResult.confidence;
                
                if (confidence > THRESHOLD) {
                    localRemoved++;
                    if (!localWinner || confidence > localWinner.confidence) {
                        localWinner = { config, pos: { ...pos, x: probeResult.x, y: probeResult.y }, alphaMap: alphaMap.data, confidence, profileId: id };
                    }
                }
            }
            return { winner: localWinner, removed: localRemoved };
        };

        let overallWinner = null;
        let totalRemoved = 0;

        for (const pid of profilesToTry) {
            const { winner: pWinner, removed: pRemoved } = await tryProfile(pid);
            totalRemoved += pRemoved;
            if (pWinner && (!overallWinner || pWinner.confidence > overallWinner.confidence)) {
                overallWinner = pWinner;
            }
        }

        winner = overallWinner;
        removedCounter = totalRemoved;

        if (!winner) {
            // No watermark detected with high enough confidence
            return {
                buffer: buffer, // Return original buffer
                detection: 'none',
                confidence: 0.0,
                removedCount: 0
            };
        }

        // v1.9.5: Apply the removal! (Fixing the 'disaster' where it detected but didn't remove)
        removeWatermark(imageData, winner.alphaMap, winner.pos);

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
            removedCount: removedCounter,
            profileId: winner.profileId
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
                const { buffer: _, ...logInfo } = result;
                io.stdout.write(JSON.stringify({
                    status: 'success',
                    output: resolve(outputPath),
                    duration_ms: (performance.now() - startTime).toFixed(0),
                    ...logInfo
                }) + '\n');
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
