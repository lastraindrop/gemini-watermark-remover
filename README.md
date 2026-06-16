[中文说明](README_zh.md)

# Gemini & Doubao Watermark Remover (v2.6.0)

A production-grade watermark detection and removal tool supporting Gemini, Doubao, and DALL-E 3 AI-generated images. Features a five-phase detection pipeline with 3D scoring, adaptive multi-scale search, multi-pass removal with safety gates, **sub-pixel refinement**, **NMS false-positive suppression**, **halo detection**, **coarse relocation search**, and a decision policy tier system.

## What this release covers (v2.6.0)

### Detection & Removal Quality
- **Non-Maximum Suppression (NMS)**: spatial overlap + confidence-floor filtering eliminates false-positive matches that previously caused triple-removal artifacts
- **Sub-pixel refinement**: `refineSubpixelOutline` (±0.25px shift, ±1% scale, ±0.01 gain) now integrated into the removal pipeline — reduces 1-2px color/position deviation after removal
- **Halo detection**: `assessAlphaBandHalo` safety gate in multi-pass removal detects and prevents dark/bright ring artifacts around watermark edges
- **Coarse relocation search**: ±16px coarse scan (step 4) activates when anchor NCC is low, then fine-jitters around the best coarse position — handles Gemini's 5-20px placement variation
- **Expanded position tolerance**: jitter ranges increased (10/6px balanced), `isNearExpectedAnchor` tolerance raised to 20%, `JITTER_TRIGGER_MIN` gate removed
- **New catalog variants**: 192px margin probing, 2k-new-margin, v2-small (36px), large-margin variants
- **Smooth background detection**: `varI` fallback raised from 0.001→0.10; `LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN` lowered from 0.008→0.004
- **Adaptive trigger relaxed**: weak catalog-backed matches no longer suppress adaptive search
- **Confidence-floor filtering**: matches below 50% of winner confidence are suppressed as false positives

### Frontend
- **Dead code removed**: ~140 lines of unreachable `#singlePreview` HTML/JS (comparison slider, side-by-side, stats, magnifier) deleted
- **Before/after comparison**: click-to-toggle "Compare" badge on each processed card — switches between original and result with smooth fade
- **Advanced manual overrides**: collapsible panel with alpha-gain slider (0.5-3.0) and position search-range slider (0-30px) for difficult cases
- **Keyboard shortcuts repurposed**: 1=toggle settings, 2=cycle presets, 3=toggle manual mode
- **Drag-and-drop fix**: crash from removed `singlePreview` reference resolved
- **i18n & a11y**: all tool button titles now localized; `html lang` synced dynamically; upload area `aria-label` added

## Verification baseline

```bash
pnpm test        # core suite passing (48 files, 480+ tests)
pnpm lint        # clean (0 errors, 0 warnings)
pnpm build       # clean (static Tailwind CSS, no CDN dependency)
```

## Architecture overview

| Layer | Modules | Responsibility |
|-------|---------|---------------|
| Foundation | `blendModes.js`, `alphaMap.js`, `utils.js`, `templates/registry.js`, `restorationMetrics.js` | Reverse alpha blending, alpha map calculation, shared helpers, profile/catalog registry, halo/artifact detection |
| Core | `catalog.js` (+ `catalogs.json`), `config.js`, `detector.js` (+ `DetectorContext`), `detectionPipeline.js`, `adaptiveDetector.js`, `multiPassRemoval.js`, `alphaCalibration.js`, `decisionPolicy.js`, `applyRemoval.js`, `worker.js`, `workerPool.js`, `watermarkEngine.js`, `profiles.js` | Detection, NMS filtering, subpixel refinement, scoring, scaled gating, adaptive search, multi-pass removal with halo safety, alpha calibration, decision tiering, worker pool, pipeline orchestration |
| Application | `app.js` → `app/state.js`, `app/ui.js`, `app/processing.js`, `app/dragDrop.js`, `app/keyboard.js`, `app/settings.js`, `app/viewModes.js`, `app/manualSelection.js` | Frontend state, before/after comparison cards, drag/drop, keyboard shortcuts, settings, view modes, manual selection with advanced overrides, dark mode |
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
