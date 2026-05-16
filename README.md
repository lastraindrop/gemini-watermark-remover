[中文说明](README_zh.md)

# Gemini & Doubao Lossless Watermark Remover (v2.2.0)

A production-grade, independent fork for detecting, analyzing, and removing visible AI watermarks from Gemini and Doubao images. Features six-stage detection pipeline with 3D scoring, adaptive multi-scale search, multi-pass removal with safety gates, alpha gain calibration, and a decision policy tier system.

## What this release covers

- **Six-stage detection pipeline**: Catalog → Scaled → Heuristic → Adaptive → Global → Decision
- **3D multidimensional scoring**: spatial NCC (0.5) + gradient NCC (0.3) + variance (0.2)
- **Adaptive detector**: coarse-to-fine multi-scale search for non-catalog resolutions
- **Multi-pass removal**: iterative removal with near-black safety and texture protection
- **Alpha gain calibration**: automatic search for optimal alpha multiplier (supports rectangular watermarks)
- Subpixel outline refinement after removal
- Template interpolation and warping for size/position adjustment
- Gemini catalog-first matching with heuristic and adaptive fallback
- Doubao multi-anchor (top-left + bottom-right) support with rectangular watermark dimensions
- **Decision policy**: three-tier classification (direct-match / needs-validation / insufficient)
- **Restoration metrics**: MSE, PSNR, and quality estimation
- Frontend drag-and-drop with global overlay feedback
- ZIP batch download
- Localized UI (7 languages) and contract tests
- Independent SDK/API entrypoint under `@lastraindrop/gemini-watermark-remover`

## Verification baseline

```bash
pnpm test        # 452/452 passing
pnpm lint        # clean
pnpm build       # clean (static Tailwind CSS, no CDN dependency)
pnpm test:legacy
node --test tests/gemini_regression.test.js
pnpm test:python
```

## Architecture overview

| Layer | Modules | Responsibility |
|-------|---------|---------------|
| Foundation | `blendModes.js`, `alphaMap.js`, `utils.js`, `templates/registry.js` | Reverse alpha blending, alpha map calculation, shared helpers, profile/catalog registry |
| Core | `catalog.js`, `config.js`, `detector.js`, `detectionPipeline.js`, `adaptiveDetector.js`, `multiPassRemoval.js`, `alphaCalibration.js`, `decisionPolicy.js`, `restorationMetrics.js`, `watermarkEngine.js`, `worker.js`, `profiles.js` | Detection, scoring, adaptive search, multi-pass removal, alpha calibration, decision tiering, quality metrics, pipeline orchestration, web worker |
| Application | `app.js` → `app/state.js`, `app/ui.js`, `app/processing.js`, `app/dragDrop.js`, `app/keyboard.js`, `app/settings.js`, `app/viewModes.js`, `app/magnifier.js` | Frontend state, UI components, drag/drop, keyboard shortcuts, settings, view modes, magnifier |
| Entry | `cli.js` → `cli/gwrCli.js`, `cli/gwrRemoveCommand.js`, `bin/gwr.mjs`, `sdk/index.js`, `userscript/index.js`, `python/remover.py`, `python/gui.py` | CLI, NPM binary, SDK exports, browser userscript, Python bridge, desktop GUI |
| Build | `build.js`, `tailwind.config.js`, `src/tailwind.css` | esbuild bundling, static Tailwind CSS generation |

## Quick start

### Web

```bash
pnpm dev     # development with live reload
pnpm build   # production build (static CSS)
pnpm serve   # serve dist/ locally
```

Open the local web app, drag images or directories, choose profile, process.

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
- **Multi-phase detection**: Catalog→scaled→heuristic→adaptive→global→decision, each phase with appropriate thresholds
- **Profile system**: Pluggable profiles for Gemini and Doubao; DALL-E 3 remains experimental/research-only
- **Catalog-driven sizing**: Standard sizes matched within 5% tolerance; scaled catalog covers cropped/resized exports
- **Memory pooling**: Reusable buffers for gradient and blur operations to reduce GC pressure on large images
- **Client-only**: All processing local, no server upload

## Documentation

- [User Guide](./USER_GUIDE.md) — Usage, parameters, FAQ
- [Developer Guide](./DEVELOPER_GUIDE.md) — Architecture, gradient filtering, testing strategy
- [Technical Guide](./TECHNICAL_GUIDE.md) — Working principles, algorithm details, threshold rationale
- [Roadmap](./ROADMAP.md) — Current and planned work
- [Analysis & Plan](./ANALYSIS_AND_PLAN.md) — Comprehensive audit and delivery status
- [Improvement Plan](./IMPROVEMENT_PLAN.md) — Sprint-based implementation plan
- [Frontend Review](./FRONTEND_REVIEW.md) — UI/UX audit and fixes

## License

MIT
