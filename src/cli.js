#!/usr/bin/env node

/**
 * Gemini Watermark Remover - Legacy CLI Entry
 * This file is now a wrapper around the modular CLI system.
 * Please use 'gwr' or 'bin/gwr.mjs' for the new interface.
 */

import { existsSync, statSync } from 'node:fs';
import { main } from './cli/gwrCli.js';

// Adapt old format (-i/-o) to new format (remove <input> --output <output>)
const args = process.argv.slice(2);

// If user is just calling it without 'remove' sub-command, we adapt it
if (args.length > 0 && args[0] !== 'remove' && !args[0].startsWith('-')) {
    // This is probably an old-style direct input path or version check
    // We'll try to handle version check or just tell them to use the new CLI
    if (args.includes('--version') || args.includes('-v')) {
        console.log('Gemini Watermark Remover v1.8.0-rc.1 (Legacy Entry)');
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
        // Add other flags
        if (args.includes('--json')) adaptedArgs.push('--json');
        if (args.includes('--noiseReduction')) adaptedArgs.push('--noiseReduction');
        if (args.includes('--no-deepScan')) adaptedArgs.push('--no-deepScan');
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
