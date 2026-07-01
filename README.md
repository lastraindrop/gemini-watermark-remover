[中文说明](README_zh.md)

# Gemini & Doubao Watermark Remover (v2.7.0)

Local-first browser, CLI, SDK, and Python tooling for detecting, analyzing, and removing visible AI watermarks from Gemini and Doubao images. Supported profile selections are `gemini`, `doubao`, and `auto`.

The engine uses deterministic image analysis and reverse alpha blending. It does not upload images and does not use generative inpainting.

## Current Release Focus

- **Recall fixes for missed watermarks**: catalog variants, 48/96 template ordering, relaxed adaptive fallback, 25% near-anchor tolerance, and 20260520 Gemini alpha variant routing.
- **False-positive defense**: candidate trial-removal validation, standard-anchor preservation, global free-mode confidence floor, and overlap-based NMS before removal.
- **Removal fidelity**: calibrated alpha maps, weak-alpha handling, multi-pass removal for square and rectangular profiles, artifact diagnostics, and sub-pixel refinement.
- **Frontend consistency**: Gemini/Doubao production UI, manual template `auto` mode, rectangular manual asset keys, mobile-safe layout/toasts, accessible compare buttons.
- **Test architecture**: shared test asset loader, contract tests, and explicit `unit` / `integration` / `precision` / `audit` / `diagnostic` / `stress` layers.

## Architecture Overview

| Layer | Main files | Responsibility |
| --- | --- | --- |
| Profiles and catalog | `src/core/profiles.js`, `src/core/catalog.js`, `src/core/catalogs.json`, `src/core/templates/registry.js` | Production profile metadata, official sizes, anchors, asset keys, and catalog matching |
| Detection | `src/core/detectionPipeline.js`, `src/core/detector.js`, `src/core/adaptiveDetector.js`, `src/core/decisionPolicy.js` | Catalog/heuristic/adaptive/global detection, candidate validation, ranking, and profile auto-detection |
| Candidates | `src/core/candidateGeometry.js` | Overlap geometry, upsert, NMS, and anchor-aware ranking |
| Removal | `src/core/applyRemoval.js`, `src/core/blendModes.js`, `src/core/multiPassRemoval.js`, `src/core/alphaCalibration.js`, `src/core/restorationMetrics.js` | Reverse alpha blending, multi-pass cleanup, gain calibration, and artifact diagnostics |
| Runtime | `src/core/watermarkEngine.js`, `src/core/worker.js`, `src/core/workerPool.js` | Image loading, asset cache, worker-assisted processing, and main-thread fallback |
| App | `src/app/*.js`, `public/index.html`, `src/i18n/*.json` | Web UI, drag/drop, manual selection, settings, i18n, batch processing, and result comparison |
| Interfaces | `src/cli.js`, `src/cli/*.js`, `src/sdk/index.js`, `src/sdk/index.d.ts`, `python/remover.py` | CLI, package SDK, TypeScript definitions, and Python bridge |

## Quick Start

```bash
pnpm install
pnpm build
pnpm serve
```

For local development:

```bash
pnpm dev
```

CLI examples:

```bash
node src/cli.js -i input.png -o output.png --profile gemini
node src/cli.js -i ./input-dir -o ./output-dir --profile doubao --json
node src/cli.js --pipe < input.png > output.png
```

SDK example:

```js
import { WatermarkEngine } from '@lastraindrop/gemini-watermark-remover';

const engine = await WatermarkEngine.create();
const result = await engine.removeWatermarkFromImage(imageElement, {
  profileId: 'auto',
  deepScan: true,
  adaptiveMode: 'auto'
});
```

Python bridge:

```python
from python.remover import GeminiWatermarkRemover

remover = GeminiWatermarkRemover("./")
results = remover.remove_watermark("./input", "./output", deep_scan=True)
```

## Verification Commands

```bash
pnpm lint             # ESLint over src/
pnpm build            # production bundle
pnpm test             # fast unit layer
pnpm test:unit        # same as pnpm test
pnpm test:integration # runtime, frontend, CLI, worker, pipeline integration
pnpm test:precision   # recall and real/large synthetic coverage
pnpm test:audit       # product acceptance audit
pnpm test:diagnostic  # slow diagnostic baseline
pnpm test:stress      # bounded memory-pressure run
pnpm test:all         # standard full gate: unit + integration + precision + audit + legacy
pnpm test:exhaustive  # all top-level tests, including diagnostic and stress
```

`scripts/test-groups.mjs` owns the test taxonomy. New top-level `tests/*.test.js` files must be assigned to exactly one primary group; `tests/test_groups_contract.test.js` enforces that.

## Parameter Alignment Rules

- Detection thresholds live in `DETECTION_THRESHOLDS` in `src/core/config.js`.
- Performance presets live in `PERFORMANCE_PRESETS` and are merged into engine options without being overwritten by UI sliders.
- Profile assets and mock test assets derive dimensions from profile/catalog metadata, not scattered literals.
- Manual mode uses explicit `manualConfig` and can request `assetKey`, `alphaGainOverride`, `searchRangeOverride`, and `forceProcess`.
- UI and user docs expose the same supported selections: Gemini, Doubao, and Auto.

## Documentation

- [User Guide](./USER_GUIDE.md)
- [Developer Guide](./DEVELOPER_GUIDE.md)
- [Technical Guide](./TECHNICAL_GUIDE.md)
- [Roadmap](./ROADMAP.md)
- [Finalization Report](./reports/v2.7-finalization-report.md)

## License

MIT
