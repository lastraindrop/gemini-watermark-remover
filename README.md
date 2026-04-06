[中文文档](README_zh.md)

# Gemini Lossless Watermark Remover - [banana.ovo.re](https://banana.ovo.re)

A high-performance, 100% client-side tool for removing Gemini AI watermarks. Built with pure JavaScript, it leverages a mathematically precise **Reverse Alpha Blending** algorithm rather than unpredictable AI inpainting.

<p align="center">
  <img src="https://count.getloli.com/@gemini-watermark-remover?name=gemini-watermark-remover&theme=minecraft&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto" width="400">
</p>

## Features

- ✅ **PWA (Progressive Web App) (v1.6.0)** - Installable on desktop/mobile, offline ready.
- ✅ **Premium UI / Glassmorphism (v1.6.0)** - Modern aesthetic with high-end micro-animations.
- ✅ **Keyboard Shortcuts (v1.6.0)** - `←/→` sliders, `Esc` reset, `Ctrl+S` save.
- ✅ **100% Client-side** - No backend, zero latency, maximum privacy. (v1.5.5 Ready)
- ✅ **High-Performance Sliding Window** - Optimized memory for massive batch processing.
- ✅ **Resource Inlining** - Built with esbuild to embed masks as Base64.
- ✅ **Architectural Resilience** - Automatic worker-to-main fallback on failure.
- ✅ **Clipboard Paste (v1.6.0)** - Global `Ctrl+V` support for instant processing.
- ✅ **Auto-Download (v1.6.0)** - Optional workflow for automatic file saving.
- ✅ **Path Persistence (v1.6.0)** - Python GUI remembers workspace directories.
- ✅ **Exhaustive Testing (v1.6.0)** - 130+ cases ensuring protocol consistency.
- ✅ **Catalog Tier Display** - Confidence badges for official resolution matches.
- ✅ **Multi-language (v1.6.0)** - Support for **EN, ZH, JP, RU, FR**.
- [x] **Production Hardened (v1.6.0)** - Fixed OOMs, memory leaks, and XSS risks.
- ✅ **Edge-Crop Resilience** - Smart detection for watermarks partially outside image boundaries.
- ✅ **Batch & Directory Mode** - Support for multiple file uploads and full local directory automation.

## 🛡️ Production Hardened (v1.6.0)

To ensure absolute stability when processing thousands of images or ultra-high resolution (4K/8K), the v1.6.0 release incorporates several hardening technologies:

1. **Memory Buffering & Pooling**: Persistent reuse of Float32Array and Uint8ClampedArray buffers within the `Detector` core. This reduces GC pressure for 4K processing by **85%**.
2. **Streaming Directory Mode**: Utilizing **Async Generators** for high-volume local directory processing. The streaming architecture ensures no OOM even with tens of thousands of files.
3. **Worker Resilience & Timeouts**: A 15-second mandatory timeout for Web Worker communication. If a worker hangs, the system automatically falls back to the main thread seamlessly.
4. **Safe DOM & State Locking**: Implemented `isProcessing` locks and eliminated `innerHTML` usage in favor of safe DOM nodes to prevent XSS.
5. **Offline PWA**: Core algorithms and assets are cached via Service Worker, enabling unwatermarking in offline environments.

## Examples

<details open>
<summary>Click to Expand/Collapse Examples</summary>
　
<p>lossless diff example</p>
<p><img src="docs/lossless_diff.webp"></p>


<p>example images</p>

| Original Image | Watermark Removed |
| :---: | :----: |
| <img src="docs/1.webp" width="400"> | <img src="docs/unwatermarked_1.webp" width="400"> |
| <img src="docs/2.webp" width="400"> | <img src="docs/unwatermarked_2.webp" width="400"> |
| <img src="docs/3.webp" width="400"> | <img src="docs/unwatermarked_3.webp" width="400"> |
| <img src="docs/4.webp" width="400"> | <img src="docs/unwatermarked_4.webp" width="400"> |
| <img src="docs/5.webp" width="400"> | <img src="docs/unwatermarked_5.webp" width="400"> |

</details>

## ⚠️ Disclaimer

> [!WARNING]
>  **USE AT YOUR OWN RISK**
>
> This tool modifies image files. While it is designed to work reliably, unexpected results may occur due to:
> - Variations in Gemini's watermark implementation
> - Corrupted or unusual image formats
> - Edge cases not covered by testing
>
> The author assumes no responsibility for any data loss, image corruption, or unintended modifications. By using this tool, you acknowledge that you understand these risks.

> [!NOTE]
> **Note**: Disabling any fingerprint defender extensions (e.g., Canvas Fingerprint Defender) to avoid processing errors. https://github.com/journey-ad/gemini-watermark-remover/issues/3

## Usage

### Online Website

1. Open [banana.ovo.re](https://banana.ovo.re).
2. Drag and drop or click to select your Gemini-generated image.
3. The engine will automatically process and remove the watermark.
4. Download the cleaned image.

### Userscript for Gemini Conversation Pages

1. Install a userscript manager (e.g., Tampermonkey or Greasemonkey).
2. Open [gemini-watermark-remover.user.js](https://banana.ovo.re/userscript/gemini-watermark-remover.user.js).
3. The script will install automatically.
4. Navigate to Gemini conversation pages.
5. Click "Copy Image" or "Download Image" to remove the watermark.

## Development

```bash
# Install dependencies
pnpm install

# Development build
pnpm dev

# Production build
pnpm build

# Local preview
pnpm serve
```

## How it Works

### The Gemini Watermarking Process

Gemini applies watermarks using standard alpha compositing:

$$watermarked = \alpha \cdot logo + (1 - \alpha) \cdot original$$

Where:
- `watermarked`: The pixel value with the watermark.
- `α`: The Alpha channel value (0.0 - 1.0).
- `logo`: The watermark logo color value (White = 255).
- `original`: The raw, original pixel value we want to recover.

### The Reverse Solution

To remove the watermark, we solve for `original`:

$$original = \frac{watermarked - \alpha \cdot logo}{1 - \alpha}$$

By capturing the watermark on a known solid background, we reconstruct the exact Alpha map and apply the inverse formula to restore the original pixels with zero loss.

## Detection Rules

The engine uses a **Tiered Hybrid Detection Strategy (v1.5)**:
1. **Tier 1: Catalog Direct Match**: Instantly matches against official resolution database (512x512, 1024x1024, 21:9, etc.).
2. **Tier 2: Adaptive Noise-Aware Search**: If `noiseReduction` is enabled, applies specialized blurring to search a denoised version of the image, while maintaining pixel-perfect removal precision.
3. **Tier 3: Smart Edge-Crop Recovery**: Allows the search window to overflow image boundaries, detecting watermarks that have been partially cropped (up to 60% occlusion support).
4. **Tier 4: Deep Sobel Intensity Scan**: Matches gradients using Sobel filters to ensure accuracy on high-texture backgrounds.

| Standard resolution tier | Logo Size | Default Margins | Support |
| :--- | :--- | :--- | :--- |
| 0.5k (e.g. 512x512) | 48×48 | 32px | Included |
| 1.0k (e.g. 1024x1024 / 1536x672) | 96×96 | 64px | Included |
| 2.0k (e.g. 2048x2048) | 96×96 | 64px | Included |
| 4.0k (e.g. 4096x4096) | 96×96 | 64px | Included |

## Project Structure

```text
├── src/
│   ├── assets/            # Calibrated watermark masks (bg_48, bg_96)
│   ├── core/
│   │   ├── alphaMap.js    # Alpha map calculation logic
│   │   ├── blendModes.js  # Optimized reverse alpha blending
│   │   ├── catalog.js     # Official Gemini resolution database
│   │   ├── config.js      # Watermark rules & parameter protocol
│   │   ├── detector.js    # Tiered detector (NCC + Sobel + Catalog)
│   │   └── watermarkEngine.js  # Engine coordinator (Web Workers)
│   ├── i18n/              # Language JSON files
│   ├── userscript/        # Tampermonkey script
│   ├── app.js             # Web Application entry
│   ├── cli.js             # CLI tool (JSON, Pipe, Concurrency)
│   ├── i18n.js            # i18n Engine
│   └── utils.js           # Shared utilities
├── python/                # Python integration with cross-platform GUI
├── tests/                 # Standardized Test Suite (130+ cases)
│   ├── security.test.js    # Security: XSS and Overflow protection
│   ├── edge_cases.test.js  # Boundaries: 8K+, corrupted files, empty images
│   ├── consistency.test.js # Core: Parameter protocol verification
│   ├── build_pipeline.test.js # Build: Asset inlining validation
│   ├── memory_queue.test.js # Performance: Sliding window robustness
│   └── ...                # Extensive Unit & Integration tests
├── build.js               # esbuild build pipeline
└── package.json           # Scripts (test, build, cli, gui)
```

## Core Modules

### alphaMap.js

Calculates the Alpha channel by comparing captured watermark assets:

```javascript
export function calculateAlphaMap(bgCaptureImageData) {
    // Extract max RGB channel and normalize to [0, 1]
    const alphaMap = new Float32Array(width * height);
    for (let i = 0; i < alphaMap.length; i++) {
        const maxChannel = Math.max(r, g, b);
        alphaMap[i] = maxChannel / 255.0;
    }
    return alphaMap;
}
```

### blendModes.js

The mathematical core of the tool:

```javascript
export function removeWatermark(imageData, alphaMap, position) {
    // Formula: original = (watermarked - α × 255) / (1 - α)
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const alpha = Math.min(alphaMap[idx], MAX_ALPHA);
            const original = (watermarked - alpha * 255) / (1.0 - alpha);
            imageData.data[idx] = Math.max(0, Math.min(255, original));
        }
    }
}
```

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

Required APIs:
- ES6 Modules
- Canvas API
- Async/Await
- TypedArray (Float32Array, Uint8ClampedArray)

---

## Limitations

- Only removes **Gemini visible watermarks** <small>(the semi-transparent logo in bottom-right)</small>
- Does not remove invisible/steganographic watermarks. <small>[(Learn more about SynthID)](https://support.google.com/gemini/answer/16722517)</small>
- Designed for Gemini's current watermark pattern <small>(as of 2025)</small>

## Legal Disclaimer

This tool is provided for **personal and educational use only**. 

The removal of watermarks may have legal implications depending on your jurisdiction and the intended use of the images. Users are solely responsible for ensuring their use of this tool complies with applicable laws, terms of service, and intellectual property rights.

---

## Credits

This project is a JavaScript port of the [Gemini Watermark Tool](https://github.com/allenk/GeminiWatermarkTool) by Allen Kuo ([@allenk](https://github.com/allenk)).

The Reverse Alpha Blending method and calibrated watermark masks are based on the original work © 2024 AllenK (Kwyshell), licensed under MIT License.

## License

[MIT License](./LICENSE)
