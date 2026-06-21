/**
 * Node.js Custom Loader for PNG assets in test environment.
 *
 * Problem: watermarkEngine.js imports PNG assets (bg_48.png, bg_96.png, etc.)
 * at module level. In the browser/build environment, esbuild bundles these
 * as base64 data URLs. But Node.js native test runner has no PNG loader,
 * causing ERR_UNKNOWN_FILE_EXTENSION for any test that imports
 * watermarkEngine.js (directly or transitively).
 *
 * This loader intercepts .png imports and returns a base64 data URL string,
 * matching what esbuild produces in the production build. The actual pixel
 * data is not needed for most tests — they just need the import to not crash.
 *
 * Usage in package.json:
 *   "test": "node --loader ./tests/fixtures/png-loader.mjs --test ..."
 *
 * Note: --loader is deprecated in newer Node in favor of --import with
 * register(). But --loader works on Node 18-22 which is the target range.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function load(url, context, defaultLoad) {
    if (url.endsWith('.png')) {
        const filePath = fileURLToPath(url);
        const buffer = readFileSync(filePath);
        const base64 = buffer.toString('base64');
        // Return as a data URL — same format esbuild uses for inlined assets.
        // watermarkEngine.js stores these in INLINE_ASSETS and passes them
        // to _loadAsset which expects a URL string (data: or blob:).
        const dataUrl = `data:image/png;base64,${base64}`;
        return {
            format: 'module',
            source: `export default ${JSON.stringify(dataUrl)};`,
            shortCircuit: true
        };
    }
    return defaultLoad(url, context);
}

export async function resolve(specifier, context, defaultResolve) {
    return defaultResolve(specifier, context);
}

export async function getGlobalPreloadCode() {
    return '';
}
