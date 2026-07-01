/**
 * BUG-C8 / STAGE_PLAN_v2.7 Phase A-4: Extract the upstream "96-20260520"
 * alpha map (embedded as base64 Float32 values) and convert it to a
 * 96x96 PNG asset consumable by the fork's PNG-based asset pipeline.
 *
 * Source : an upstream embeddedAlphaMaps.js supplied as the first argument
 *           -> EMBEDDED_ALPHA_MAP_BASE64['96-20260520']
 *           -> 49152 base64 chars -> 36864 raw bytes = 96 * 96 Float32
 * Output : src/assets/bg_96_20260520.png  (96x96, 4 channels)
 *
 * One-shot script. Idempotent: regenerates the identical PNG every run.
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC_FILE = process.argv[2];
const OUT_FILE = 'src/assets/bg_96_20260520.png';
const KEY = '96-20260520';
const W = 96, H = 96, CHANNELS = 4;

if (!SRC_FILE) {
    throw new Error('Usage: node scripts/extract_alpha_20260520.mjs <path-to-embeddedAlphaMaps.js>');
}

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
const expectedFloatBytes = W * H * Float32Array.BYTES_PER_ELEMENT;
console.log(`Decoded raw buffer: ${rawBuffer.length} bytes (expected ${expectedFloatBytes})`);
if (rawBuffer.length !== expectedFloatBytes) {
    throw new Error(`Unexpected raw buffer size: got ${rawBuffer.length}, expected ${expectedFloatBytes}`);
}

// The source bytes are little-endian Float32 alpha samples, not RGBA bytes.
// The old implementation treated the same 36,864 bytes as 96x96 RGBA. The
// lengths happen to match, so that corruption passed all structural checks.
const view = new DataView(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);
const rgba = Buffer.alloc(W * H * CHANNELS);
let nonZero = 0;
let sum = 0;
for (let i = 0; i < W * H; i++) {
    const value = view.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`Invalid alpha value at ${i}: ${value}`);
    }
    const encoded = Math.round(value * 255);
    const offset = i * CHANNELS;
    rgba[offset] = encoded;
    rgba[offset + 1] = encoded;
    rgba[offset + 2] = encoded;
    rgba[offset + 3] = 255;
    if (encoded > 0) nonZero++;
    sum += value;
}
console.log(`Non-black pixels: ${nonZero} / ${W * H}; mean alpha=${(sum / (W * H)).toFixed(6)}`);

await sharp(rgba, {
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

// Pixel-exactness check against the correctly encoded 8-bit grayscale pixels.
let mismatches = 0;
for (let i = 0; i < rgba.length; i++) {
    if (rgba[i] !== rawRoundtrip[i]) mismatches++;
}
if (mismatches !== 0) {
    throw new Error(`Pixel mismatch: ${mismatches} bytes differ from upstream source`);
}
console.log('OK: lossless round-trip verified (0 byte mismatches)');
