#!/usr/bin/env node

/**
 * Gemini Watermark Remover - Legacy CLI Entry
 * This file is now a wrapper around the modular CLI system.
 * Please use 'gwr' or 'bin/gwr.mjs' for the new interface.
 */

import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { main } from './cli/gwrCli.js';

const require = createRequire(import.meta.url);
const pkg = require('./../package.json');

// Adapt old format (-i/-o) to new format (remove <input> --output <output>)
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
    console.log(`Gemini Watermark Remover v${pkg.version}`);
    process.exit(0);
}

if (args.length > 0 && args[0] !== 'remove' && !args[0].startsWith('-')) {
    // This is probably an old-style direct input path or version check
    if (args.includes('--version') || args.includes('-v')) {
        console.log(`Gemini Watermark Remover v${pkg.version} (Legacy Entry)`);
        process.exit(0);
    }
}

// Convert -i/<input> -o/<output> to the new command format if needed
let adaptedArgs = [...args];
if (args.includes('-i') || args.includes('--input')) {
    const inputIdx = args.findIndex(a => a === '-i' || a === '--input');
    const input = args[inputIdx + 1];
    const outputIdx = args.findIndex(a => a === '-o' || a === '--output');
    const output = args[outputIdx + 1];
    
    if (input && output) {
        const isDir = existsSync(input) && statSync(input).isDirectory();
        adaptedArgs = ['remove', input, isDir ? '--out-dir' : '--output', output];
        ['--json', '--noiseReduction', '--no-deepScan', '--overwrite', '--pipe'].forEach(flag => {
            if (args.includes(flag)) adaptedArgs.push(flag);
        });
        [
            ['--profile', '-p'],
            ['--format', '-f'],
            ['--probeThreshold'],
            ['--fallbackThreshold'],
            ['--gradientPenalty']
        ].forEach(([longFlag, shortFlag]) => {
            const idx = args.findIndex(a => a === longFlag || (shortFlag && a === shortFlag));
            if (idx !== -1 && args[idx + 1]) adaptedArgs.push(longFlag, args[idx + 1]);
        });
        
        console.warn('⚠️  Warning: Legacy CLI format detected. Please use "gwr remove <input> --output <output>" instead.');
    }
} else if (adaptedArgs[0] !== 'remove') {
    adaptedArgs = ['remove', ...adaptedArgs];
}

main(adaptedArgs, {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd()
}).then(code => {
    if (typeof code === 'number' && code !== 0) {
        process.exit(code);
    }
});
