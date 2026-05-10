[中文说明](README_zh.md)

# Gemini & Doubao Lossless Watermark Remover (v2.1.0)

A production-grade, client-side tool for detecting, analyzing, and removing visible AI watermarks from Gemini, Doubao, and DALL-E 3 (experimental) images.

## What this release covers

- Shared detection pipeline for Web, CLI, and Python bridge
- Gemini catalog-first matching with heuristic fallback and scaled catalog
- Doubao multi-anchor (top-left + bottom-right) support
- **Deep Scan gradient filtering** for false positive defense
- Frontend drag-and-drop upload
- ZIP batch download
- Localized UI and contract tests
- Reproducible regression coverage for difficult watermark samples (356 tests)

## Verification baseline

```bash
npm test          # 356/356 passing
npm run lint      # clean
npm run build     # clean
node --test tests/gemini_regression.test.js
python -m unittest tests\\test_bridge_integration.py
```

## Architecture overview

| Layer | Files | Responsibility |
|-------|-------|---------------|
| Foundation | `blendModes.js`, `alphaMap.js`, `templates/registry.js` | Reverse alpha blending, alpha map calculation, profile/catalog registry |
| Core | `catalog.js`, `config.js`, `detector.js`, `detectionPipeline.js`, `watermarkEngine.js`, `profiles.js` | Detection, scoring, pipeline orchestration |
| Application | `app.js`, `processing.js`, `ui.js` | Frontend state, drag/drop, queueing, downloads |
| Entry | `cli.js`, `gwrRemoveCommand.js`, `remover.py`, `gui.py`, `userscript/` | CLI, Python bridge, browser userscript |

## Quick start

### Web

Open the local web app, drag images or directories, choose profile, process.

### CLI

```bash
node src/cli.js -i ./input -o ./output
node src/cli.js -i input.png -o output.png --noiseReduction --no-deepScan
node src/cli.js -i input.png -o output.png --json
```

### Python

```python
from python.remover import GeminiWatermarkRemover
remover = GeminiWatermarkRemover("./")
results = remover.remove_watermark("./input_dir", "./output_dir", deep_scan=True)
```

## Key technical features

- **Gradient filtering**: Sobel edge correlation suppresses luminance-only false positives (sinusoidal textures, noise) while preserving real watermarks
- **Multi-phase detection**: Catalog→scaled→heuristic→global fallback, each phase with appropriate thresholds
- **Profile system**: Pluggable profiles for Gemini, Doubao, and DALL-E 3 (experimental)
- **Catalog-driven sizing**: Standard sizes matched within 2% tolerance; scaled catalog covers cropped/resized exports
- **Client-only**: All processing local, no server upload

## Documentation

- [User Guide](./USER_GUIDE.md) — Usage, parameters, FAQ
- [Developer Guide](./DEVELOPER_GUIDE.md) — Architecture, gradient filtering, testing strategy
- [Technical Guide](./TECHNICAL_GUIDE.md) — Working principles, algorithm details, threshold rationale
- [Roadmap](./ROADMAP.md) — Current and planned work
- [Comprehensive Plan](./COMPREHENSIVE_PLAN.md) — Audit and delivery status

## License

MIT
