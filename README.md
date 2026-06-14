[中文说明](README_zh.md)

# Gemini & Doubao Watermark Remover (v2.5.1)

A production-grade watermark detection and removal tool supporting Gemini, Doubao, and DALL-E 3 AI-generated images. Features a five-phase detection pipeline with 3D scoring, adaptive multi-scale search, multi-pass removal with safety gates, weighted alpha gain estimation, **multi-margin template probing**, **inline asset embedding**, and a decision policy tier system.

## What this release covers

- **Multi-margin template probing**: 48px/96px templates probed at all standard Gemini margins (32/64/96px) to prevent false-positive catalog matches from nested watermark geometries
- **Weighted alpha gain estimation**: template-alpha-weighted luminance comparison eliminates 2x under-estimation on small watermarks, with pre-scaled alpha maps avoiding cumulative multi-pass over-correction
- **Inline asset embedding**: all 10 watermark template PNGs compiled as base64 data URLs into the bundle — eliminates CORS/canvas-tainting issues when opened via `file://` protocol
- **Unified card-based layout**: single-image and batch processing now share the same card grid UI, removing the legacy comparison-slider single-preview path
- **Enhanced manual mode**: dedicated selection canvas with drag-to-select, 48px/96px template size selector, and force-process toggle for difficult images
- **Performance presets**: fast/balanced/thorough modes with granular overrides for search range, jitter, fine-tune, and thresholds
- **Gradient penalty → weighted blend**: replaced aggressive multiplicative penalty (70% reduction) with consistent spatial×0.5+gradient×0.3+variance×0.2 weighted scoring
- **Unified detection thresholds**: single-source-of-truth `DETECTION_THRESHOLDS` in `config.js`
- **Five-phase detection pipeline**: Catalog → Scaled → Heuristic → Adaptive → Global
- **3D multidimensional scoring**: `max(spatialNCC, weighted)` strategy prevents NCC dilution
- **Adaptive detector**: coarse-to-fine multi-scale search with rectangular dimension support (Doubao 401×173, DALL-E 120×40)
- **Multi-pass removal**: iterative removal with near-black safety and texture protection
- **Alpha gain calibration**: automatic search for optimal alpha multiplier
- **Decision policy**: three-tier classification (direct-match / needs-validation / insufficient)
- **Multi-profile**: Gemini catalog-first matching, Doubao multi-anchor (TL+BR), DALL-E 3 experimental
- **Worker pool**: multi-worker task queue for parallel pixel restoration in browser
- **Dark mode + UI enhancements**: re-process button (no workspace reset needed), dynamic preset parameter hints, magnifier bounds clamping
- **Localized UI**: 7 languages, comprehensive test suite (44 files, 417 tests)
- **SDK/API entrypoint** under `@lastraindrop/gemini-watermark-remover`

## Verification baseline

```bash
pnpm test        # core suite passing
pnpm lint        # clean
pnpm build       # clean (static Tailwind CSS, no CDN dependency)
```

## Architecture overview

| Layer | Modules | Responsibility |
|-------|---------|---------------|
| Foundation | `blendModes.js`, `alphaMap.js`, `utils.js`, `templates/registry.js` | Reverse alpha blending, alpha map calculation, shared helpers, profile/catalog registry |
| Core | `catalog.js` (+ `catalogs.json`), `config.js`, `detector.js` (+ `DetectorContext`), `detectionPipeline.js`, `adaptiveDetector.js`, `multiPassRemoval.js`, `alphaCalibration.js`, `decisionPolicy.js`, `restorationMetrics.js`, `applyRemoval.js`, `worker.js`, `workerPool.js`, `watermarkEngine.js`, `profiles.js` | Detection, scoring, scaled gating, adaptive search, multi-pass removal, alpha calibration, decision tiering, shared removal logic, worker pool, pipeline orchestration |
| Application | `app.js` → `app/state.js`, `app/ui.js`, `app/processing.js`, `app/dragDrop.js`, `app/keyboard.js`, `app/settings.js`, `app/viewModes.js`, `app/magnifier.js`, `app/manualSelection.js` | Frontend state, UI components, drag/drop, keyboard shortcuts, settings, view modes, magnifier, manual selection, dark mode |
| Entry | `cli.js` → `cli/gwrCli.js`, `cli/gwrRemoveCommand.js`, `bin/gwr.mjs`, `sdk/index.js` (+ `index.d.ts`), `userscript/index.js`, `python/remover.py`, `python/gui.py` | CLI, NPM binary, SDK exports + TypeScript definitions, browser userscript, Python bridge |

## Quick start

### Web

```bash
pnpm dev     # development with live reload
pnpm build   # production build (static CSS)
pnpm serve   # serve dist/ locally
```

### CLI

```bash
node src/cli.js -i ./input -o ./output
node src/cli.js -i input.png -o output.png --noiseReduction --no-deepScan
node src/cli.js -i input.png -o output.png --json
node src/cli.js -i input.png -o output.png --profile doubao
```

### Python

```python
from python.remover import GeminiWatermarkRemover
remover = GeminiWatermarkRemover("./")
results = remover.remove_watermark("./input_dir", "./output_dir", deep_scan=True)
```

## Key technical features

- **Gradient filtering**: Sobel edge correlation suppresses luminance-only false positives with dynamic `gradientPenalty` (default 0.30)
- **Profile system**: Pluggable profiles for Gemini, Doubao; DALL-E 3 experimental
- **Catalog-driven sizing**: Standard sizes matched within 10% tolerance; scaled catalog + findCloseMatches for cropped/resized exports
- **Memory pooling**: `DetectorContext` class encapsulates reusable buffers for gradient and blur operations
- **Client-only**: All processing local, no server upload
- **TypeScript definitions**: Full `.d.ts` coverage of all SDK exports

## Documentation

- [User Guide](./USER_GUIDE.md) — Usage, parameters, FAQ
- [Developer Guide](./DEVELOPER_GUIDE.md) — Architecture, testing strategy, contribution
- [Technical Guide](./TECHNICAL_GUIDE.md) — Working principles, algorithm details, threshold rationale
- [Roadmap](./ROADMAP.md) — Current and planned work
- [Archived Reports](./reports/) — Historical analysis and improvement plans

## License

MIT
