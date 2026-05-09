[中文说明](README_zh.md)

# Gemini & Doubao Lossless Watermark Remover (v1.9.9)

A production-grade, client-side tool for detecting, analyzing, and removing visible AI watermarks from Gemini and Doubao images.

## What this release covers

- Shared detection pipeline for Web, CLI, and Python bridge
- Gemini catalog-first matching with heuristic fallback
- Doubao multi-anchor support
- Frontend drag-and-drop upload
- ZIP batch download
- Localized UI and contract tests
- Reproducible regression coverage for difficult watermark samples

## Key capabilities

- Web app for interactive single-image and batch workflows
- CLI for file, directory, pipe, and JSON output modes
- Python bridge for automation and GUI integration
- Shared profile/config/catalog system for consistent detection
- Batch download packaged as ZIP to avoid browser download loss
- Adaptive detection confidence and anchor validation
- Local-only processing with no server upload

## Architecture overview

- `src/core/catalog.js`: size and anchor catalog
- `src/core/config.js`: profile-driven candidate generation
- `src/core/detector.js`: confidence scoring and local probe logic
- `src/core/detectionPipeline.js`: shared decision policy
- `src/core/watermarkEngine.js`: browser/CLI orchestration
- `src/app.js` and `src/app/processing.js`: frontend state, drag/drop, queueing, and downloads
- `src/cli/gwrRemoveCommand.js`: CLI entry point
- `python/remover.py`: Python bridge

## Verification baseline

Current local verification:

- `npm test` -> 271/271 passing
- `npm run lint` -> clean
- `npm run build` -> clean
- `node --test tests/frontend_contract.test.js`
- `node --test tests/gemini_regression.test.js`
- `python -m unittest tests\\test_bridge_integration.py`

## Usage

### Web

1. Open the local web app.
2. Drag files or directories onto the page, or use the upload controls.
3. Choose `Gemini`, `Doubao`, or `AUTO`.
4. Enable or disable `Deep Scan`, `Noise Reduction`, and `Auto Download`.
5. Process and review the detection result, then download the cleaned output.

### CLI

```bash
node src/cli.js -i ./input -o ./output
node src/cli.js -i ./input.png -o ./output.png --noiseReduction --no-deepScan
node src/cli.js -i ./input.png -o ./output.png --json
```

### Python

```python
from python.remover import GeminiWatermarkRemover

remover = GeminiWatermarkRemover("./")
results = remover.remove_watermark(
    "./input_dir",
    "./output_dir",
    deep_scan=True,
    noise_reduction=False,
)
```

## Notes for contributors

- Keep profile, catalog, asset, and test changes aligned.
- Update both Web and CLI behavior when changing detection policy.
- Prefer regression tests when adjusting thresholds or probe scoring.
- Do not introduce documentation numbers that can drift from the current baseline without noting they are historical.

## License

MIT
