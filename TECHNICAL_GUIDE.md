# Technical Guide - Gemini & Doubao Watermark Remover v2.7.0

This guide describes the current engine principles, processing sequence, parameter ownership, and verification model. It is written as an implementation reference, not as a marketing document.

## 1. Core Principle

The tool performs deterministic watermark detection and reverse alpha blending. It does not perform AI inpainting.

Watermark blending model:

```text
observed = alpha * logoColor + (1 - alpha) * background
```

Reverse operation:

```text
background = (observed - alpha * logoColor) / (1 - effectiveAlpha)
effectiveAlpha = min(alpha * alphaGain, 0.99)
```

The result is only as good as the detected position, alpha map, and gain. Most engineering work in this branch is therefore about position accuracy, candidate validation, and avoiding over-removal.

## 2. Profile Model

Production profiles:

| Profile | Shape | Anchors | Notes |
| --- | --- | --- | --- |
| `gemini` | square | bottom-right | 48/96/36 variants, including `96-20260520` alpha variant |
| `doubao` | rectangular | top-left and bottom-right | Uses profile metadata and catalog dimensions for rectangular assets |
| `auto` | virtual | production profiles only | Tries non-experimental profiles and returns the strongest valid result |

Experimental profile:

| Profile | Status |
| --- | --- |
| `dalle3` | Internal experimental profile. Do not expose as production support without product approval and real asset validation. |

## 3. Detection Pipeline

The main entry point is `detectWatermarks()` / `detectProfileWatermarks()` in `src/core/detectionPipeline.js`.

Sequence:

1. **Manual config**: If `manualConfig` is present, validate bounds and directly verify the chosen region.
2. **Catalog probe**: Try exact official catalog matches from `catalogs.json`.
3. **Template order resolution**: For Gemini, compare 48px and 96px templates and reorder probes before full evaluation.
4. **Supplemented heuristics**: Add standard Gemini margins and both common template sizes.
5. **Adaptive search**: Run coarse-to-fine multi-scale search when catalog confidence is weak.
6. **Global fallback**: Run `detectWatermark()` when no reliable catalog-backed result exists.
7. **Candidate trial validation**: Try quick removal and reject candidates that create clipping or fail to reduce correlation.
8. **Anchor preservation**: Keep a reliable standard-anchor candidate unless a drifted candidate has a clear improvement.
9. **Decision tier**: Classify the result for downstream behavior.

## 4. Asset Key Resolution

`resolveAssetKey(profile, config, pos)` is the single production rule for mapping detection configs to alpha assets.

Important cases:

- Gemini `alphaVariant: '20260520'` resolves to `96-20260520`.
- Doubao and experimental rectangular profiles prefer explicit `widthxheight` keys.
- Profile asset aliases remain supported for fallback loading.
- Square configs resolve to `48` or `96`.

Test asset mocks use `resolveMockAssetDimensions()` in `tests/setup.js`. This derives alias dimensions from `PROFILES`, so tests follow the same architecture instead of copying dimensions into each test.

## 5. Scoring

Primary scoring components:

| Component | Purpose |
| --- | --- |
| Spatial NCC | Brightness correlation between image region and alpha template |
| Local contrast | Helps faint watermark detection on smooth backgrounds |
| Gradient NCC | Compares Sobel edge structure to suppress texture false positives |
| Variance score | Adds texture-aware context |

The weighted score is controlled by:

```js
DETECTION_THRESHOLDS.SPATIAL_WEIGHT
DETECTION_THRESHOLDS.GRADIENT_WEIGHT
DETECTION_THRESHOLDS.VARIANCE_WEIGHT
```

All threshold constants must live in `src/core/config.js`.

## 6. Candidate Safety

The current branch contains multiple guards against wrong-position removals:

- **Free-mode confidence floor** in direct detector ranking.
- **Candidate trial-removal validation** in `detectionPipeline.js`.
- **Standard-anchor preservation** so a slightly higher drifted candidate does not replace a reliable anchor candidate.
- **Overlap NMS** in `applyRemoval.js`, preserving non-overlapping independent anchors such as Doubao top-left plus bottom-right.
- **Halo/artifact checks** during multi-pass removal.

These guards were added because user reports showed two failure modes:

1. Some real watermarks were missed due to weak or shifted signal.
2. Some removals produced tiny bias or artifacts due to wrong/overlapping candidates or excessive gain.

## 7. Removal Pipeline

`applyRemovalStrategy(imageData, matches)` is shared by engine, worker, and CLI paths.

Process:

1. Sort and suppress overlapping candidates.
2. Use multi-pass removal for known profiles.
3. Compute original spatial NCC separately from blended confidence.
4. Try weak-alpha chain for faint large-margin cases.
5. Use standard calibrated gain first.
6. Recalibrate alpha only when residual gates require it.
7. Stop when residual is low, halo/artifact risk is high, or safety gates trigger.

The important distinction is that detection confidence and spatial NCC are not interchangeable. Recalibration decisions use spatial residual measurements.

## 8. Manual Mode

Manual mode does not bypass validation completely unless `forceProcess` is set.

Supported fields:

```js
{
  x,
  y,
  width,
  height,
  assetKey,
  forceProcess,
  alphaGainOverride,
  searchRangeOverride
}
```

Frontend manual template behavior:

- Default is `auto`.
- Gemini explicit choices can use `48` or `96`.
- Rectangular Doubao manual areas use `widthxheight`.
- `searchRangeOverride` maps to detector jitter settings.

## 9. Parameter Ownership

Single sources of truth:

| Area | Owner |
| --- | --- |
| Detection thresholds | `DETECTION_THRESHOLDS` |
| Performance presets | `PERFORMANCE_PRESETS` |
| Engine limits | `ENGINE_LIMITS` |
| Profile asset aliases | `PROFILES.*.assets` |
| Catalog dimensions | `catalogs.json` |
| Test mock dimensions | `resolveMockAssetDimensions()` |

Rules:

1. Do not add detector threshold literals without adding a named config constant.
2. Do not duplicate Doubao dimensions in individual tests.
3. Do not let UI sliders overwrite preset-owned structural thresholds.
4. Do not expose experimental profiles in production docs or UI.
5. When a new profile or asset variant lands, update code, tests, and docs together.

## 10. Test Architecture

`scripts/test-groups.mjs` defines the test taxonomy:

| Group | Purpose |
| --- | --- |
| `unit` | Fast module-level behavior and contracts |
| `integration` | Runtime, frontend, CLI, worker, and pipeline integration |
| `precision` | Detection recall, real samples, and parameter matrix coverage |
| `audit` | Product acceptance audit |
| `diagnostic` | Slow diagnostic baseline for accuracy investigations |
| `stress` | Bounded memory-pressure run |
| `legacy` | Historical v1.5 smoke regressions |
| `all` | Standard gate: unit + integration + precision + audit + legacy |
| `exhaustive` | All top-level tests including diagnostic and stress |

Validation contracts:

- `tests/test_groups_contract.test.js` ensures every top-level test is assigned exactly once.
- `tests/setup_contract.test.js` ensures shared test asset dimensions follow profile metadata.
- `tests/sdk_api.test.js` ensures package scripts expose the layered verification commands.

## 11. Verification Baseline

The following layers were verified during the v2.7 closure:

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:integration
pnpm test:precision
pnpm test:audit
pnpm test:diagnostic
pnpm test:stress
pnpm test:all
```

`test:diagnostic` and `test:stress` are intentionally slow and remain outside the standard `test:all` gate. `test:exhaustive` exists for explicit full audits.

## 12. Known Technical Limits

- A white watermark on a fully white background can be mathematically invisible.
- Very heavy compression can distort alpha edges enough that manual mode is required.
- Strong background texture can still produce plausible local correlations, so candidate validation and anchor preservation must remain active.
- Experimental profiles require real alpha assets and real-sample tests before being promoted.

## 13. Future Technical Work

Short term:

- Add browser-level Playwright coverage for upload, manual selection, compare toggle, and batch ZIP.
- Expand real-sample fixtures for difficult Gemini offsets and Doubao variants.
- Add timing baselines per preset.

Mid term:

- Introduce a typed `AssetLoader` abstraction for browser/CLI/worker parity.
- Add SSIM or perceptual metrics beyond PSNR/MSE.
- Consider WASM acceleration for NCC and Sobel search.

Long term:

- Automate unknown watermark discovery and catalog proposal.
- Package a browser extension after UI E2E coverage is stable.

*Document version: v2.7.0, updated 2026-06-24.*
