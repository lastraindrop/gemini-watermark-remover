[中文说明](README_zh.md)

# Gemini & Doubao Watermark Remover (v2.2.2)

A production-grade watermark detection and removal tool supporting Gemini, Doubao, and DALL-E 3 AI-generated images. Features a five-phase detection pipeline with 3D scoring, adaptive multi-scale search, multi-pass removal with safety gates, alpha gain calibration, and a decision policy tier system.

## What this release covers

- **Five-phase detection pipeline**: Catalog → Scaled → Heuristic → Adaptive → Global
- **3D multidimensional scoring**: `max(spatialNCC, weighted)` strategy prevents NCC dilution by downstream scores
- **Scaled match gating**: differentiated base-NCC and gradient thresholds for scaled catalog matches, suppressing false positives
- **Catalog tolerance**: 10% strict matching + 25% loose matching (`findCloseMatches`), significantly improving recall on non-exact resolutions
- **Adaptive detector**: coarse-to-fine multi-scale search (threshold 0.22)
- **Multi-pass removal**: iterative removal with near-black safety and texture protection
- **Alpha gain calibration**: automatic search for optimal alpha multiplier (supports rectangular watermarks)
- **Subpixel outline refinement**: 27-position shift×scale×gain search after removal
- **Template interpolation and warping**: for size/position adjustment (rectangular dimensions supported)
- **Decision policy**: three-tier classification (direct-match / needs-validation / insufficient)
- **Multi-profile**: Gemini catalog-first matching, Doubao multi-anchor (TL+BR) with rectangular dimensions, DALL-E 3 experimental
- **Worker pool**: multi-worker task queue for parallel pixel restoration in browser
- **Dark mode toggle**: manual auto/dark/light selection
- **DetectorContext**: encapsulated memory-pooled buffer management
- **Lazy catalog loading**: static JSON import for browser compatibility
- **Restoration metrics**: MSE, PSNR, and quality estimation
- **applyRemovalStrategy**: shared removal logic used by engine, worker, and CLI
- Frontend drag-and-drop, ZIP batch download, keyboard shortcuts
- Localized UI (7 languages), optimized test suite (49 files, ~390 tests)
- SDK/API entrypoint under `@lastraindrop/gemini-watermark-remover`

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
- [Comprehensive Diagnostic & Fix Plan](./DIAGNOSTIC_PLAN.md) — Full architecture audit, bug inventory, test suite optimization, frontend analysis
- [Archived Reports](./reports/) — Historical analysis and improvement plans

## License

MIT
