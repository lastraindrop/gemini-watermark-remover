/**
 * BUG-C8 / STAGE_PLAN_v2.7 Phase A-4: Extract the upstream "96-20260520"
 * alpha map (embedded as base64 raw RGBA pixel data) and convert it to a
 * 96x96 PNG asset consumable by the fork's PNG-based asset pipeline.
 *
 * Source : alpha_maps_downloaded.js (librarian-fetched upstream artifact)
 *           -> EMBEDDED_ALPHA_MAP_BASE64['96-20260520']
 *           -> 49152 base64 chars -> 36864 raw bytes = 96 * 96 * 4 (RGBA)
 * Output : src/assets/bg_96_20260520.png  (96x96, 4 channels)
 *
 * One-shot script. Idempotent: regenerates the identical PNG every run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC_FILE = 'alpha_maps_downloaded.js';
const OUT_FILE = 'src/assets/bg_96_20260520.png';
const KEY = '96-20260520';
const W = 96, H = 96, CHANNELS = 4;

/** Extract the base64 value for `key` from the EMBEDDED_ALPHA_MAP_BASE64 object. */
function readBase64For(filePath, key) {
    const content = readFileSync(filePath, 'utf8');
    // Locate the key declaration: `'96-20260520': '....'` (quote style agnostic)
    const keyPattern = new RegExp(`['"]${key}['"]\\s*:\\s*(['"])`);
    const m = keyPattern.exec(content);
    if (!m) throw new Error(`Key '${key}' not found in ${filePath}`);
    const quote = m[1];
    const start = m.index + m[0].length;
    const end = content.indexOf(quote, start);
    if (end < 0) throw new Error(`Unterminated string for '${key}' in ${filePath}`);
    return content.slice(start, end);
}

const base64 = readBase64For(SRC_FILE, KEY);
console.log(`Base64 length for '${KEY}': ${base64.length}`);

const rawBuffer = Buffer.from(base64, 'base64');
console.log(`Decoded raw buffer: ${rawBuffer.length} bytes (expected ${W * H * CHANNELS})`);
if (rawBuffer.length !== W * H * CHANNELS) {
    throw new Error(`Unexpected raw buffer size: got ${rawBuffer.length}, expected ${W * H * CHANNELS}`);
}

// Sanity: report a quick stat so we can confirm the data is non-trivial
let nonZero = 0;
for (let i = 0; i < rawBuffer.length; i += CHANNELS) {
    if (rawBuffer[i] !== 0 || rawBuffer[i + 1] !== 0 || rawBuffer[i + 2] !== 0) nonZero++;
}
console.log(`Non-black pixels (RGB != 0): ${nonZero} / ${W * H}`);

await sharp(rawBuffer, {
    raw: { width: W, height: H, channels: CHANNELS }
})
    .png()
    .toFile(OUT_FILE);

// Re-read the generated PNG to verify it round-trips to the expected shape
const meta = await sharp(OUT_FILE).metadata();
const rawRoundtrip = await sharp(OUT_FILE).raw().toBuffer();
console.log(`Wrote ${OUT_FILE}`);
console.log(`PNG metadata: ${meta.width}x${meta.height}, channels=${meta.channels}, format=${meta.format}`);
console.log(`Raw roundtrip size: ${rawRoundtrip.length} (expected ${W * H * CHANNELS})`);

if (meta.width !== W || meta.height !== H || meta.channels !== CHANNELS) {
    throw new Error(`PNG verification failed: expected ${W}x${H}/${CHANNELS}ch`);
}
if (rawRoundtrip.length !== W * H * CHANNELS) {
    throw new Error('Raw roundtrip size mismatch');
}

// Pixel-exactness check: the PNG must decode back to the exact upstream bytes
let mismatches = 0;
for (let i = 0; i < rawBuffer.length; i++) {
    if (rawBuffer[i] !== rawRoundtrip[i]) mismatches++;
}
if (mismatches !== 0) {
    throw new Error(`Pixel mismatch: ${mismatches} bytes differ from upstream source`);
}
console.log('OK: lossless round-trip verified (0 byte mismatches)');
