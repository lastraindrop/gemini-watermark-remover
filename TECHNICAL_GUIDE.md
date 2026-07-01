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
| `auto` | virtual | supported profiles | Tries Gemini and Doubao and returns the strongest valid result |

The heuristic new-tier family (`2k-new-margin` for wide dimensions) extends detection coverage for non-standard aspect ratios, giving the pipeline additional margin candidates on wider images.

## 3. Detection Pipeline

The main entry point is `detectWatermarks()` / `detectProfileWatermarks()` in `src/core/detectionPipeline.js`.

Sequence:

1. **Manual config**: If `manualConfig` is present, validate bounds and directly verify the chosen region.
2. **Catalog probe**: Try exact official catalog matches from `catalogs.json`.
3. **Template order resolution**: For Gemini, compare 48px and 96px templates and reorder probes before full evaluation.
4. **Supplemented heuristics**: Add standard Gemini margins and both common template sizes, including the new-tier family for wide dimensions.
5. **Adaptive search**: Run coarse-to-fine multi-scale search when catalog confidence is weak.
6. **Global fallback**: Run `detectWatermark()` when no reliable catalog-backed result exists.
7. **Candidate trial validation**: Try quick removal and reject candidates that create clipping or fail to reduce correlation.
8. **Anchor preservation**: Keep a reliable standard-anchor candidate unless a drifted candidate has a clear improvement.
9. **Decision tier**: Classify the result for downstream behavior.

## 4. Asset Key Resolution

`resolveAssetKey(profile, config, pos)` is the single production rule for mapping detection configs to alpha assets.

Important cases:

- Gemini `alphaVariant: '20260520'` resolves to `96-20260520`.
- Doubao rectangular catalog variants prefer explicit `widthxheight` keys.
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
- **Shared overlap NMS** in `candidateGeometry.js`, preserving non-overlapping independent anchors such as Doubao top-left plus bottom-right.
- **Halo diagnostics** recorded during multi-pass removal without using the current scene-luminance metric as a hard rejection gate.

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
7. Stop when residual is low, a later pass regresses, or an authoritative safety gate triggers.

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

Runtime alignment is directional:

```text
config defaults -> performance preset -> explicit entry-point options -> manualConfig
```

- A preset supplies structural search values (`RANGE_X/Y`, jitter, candidate limits and final thresholds).
- Explicit top-level options such as `probeThreshold` and `fallbackThreshold` override their corresponding defaults, but do not mutate the preset object.
- The Web sensitivity control intentionally sends one value as both thresholds. CLI and SDK consumers can tune them independently.
- `positionTolerance` is a fraction of the smaller template dimension and is clamped by `POSITION_TOLERANCE_MIN_PX`.
- `searchRangeOverride` is converted to manual jitter values; it is not a global search radius.
- Asset width and height come from the resolved asset metadata. The detector only searches dimensions represented by the supplied alpha maps and never scans unrelated registered profiles.

Rules:

1. Do not add detector threshold literals without adding a named config constant.
2. Do not duplicate Doubao dimensions in individual tests.
3. Do not let UI sliders overwrite preset-owned structural thresholds.
4. Do not register a profile before it satisfies the admission contract.
5. When a new profile or asset variant lands, update code, tests, and docs together.
6. Add every stable tuning value to `DETECTION_THRESHOLDS`, including validation and removal gates—not only scoring thresholds.

## 10. Test Architecture

`scripts/test-groups.mjs` defines the test taxonomy:

| Group | Purpose |
| --- | --- |
| `unit` | Fast module-level behavior and contracts |
| `integration` | Runtime, frontend contract, CLI, worker, and pipeline integration |
| `precision` | Detection recall, real samples, and parameter matrix coverage |
| `audit` | Product acceptance audit |
| `diagnostic` | Slow diagnostic baseline for accuracy investigations |
| `stress` | Bounded memory-pressure and extended product audit runs |
| `legacy` | Historical v1.5 smoke regressions |
| `all` | Standard gate: unit + integration + precision + audit + legacy |
| `exhaustive` | All top-level tests including diagnostic and stress |

Validation contracts:

- `tests/test_groups_contract.test.js` ensures every top-level test is assigned exactly once.
- `tests/setup_contract.test.js` ensures shared test asset dimensions follow profile metadata.
- `tests/sdk_api.test.js` ensures package scripts expose the layered verification commands.
- `tests/threshold_sot_integrity.test.js` verifies named threshold ownership.
- `tests/p0_user_feedback_regression.test.js` validates real reported failures and fixture hashes.

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
- New profiles require real alpha assets and real-sample tests before registration.

## 13. Entry-Point Consistency

All interfaces converge on the same core behavior:

- Web and SDK call `WatermarkEngine.removeWatermarkFromImage()`.
- Worker execution uses the same detection pipeline and `applyRemovalStrategy()`; main-thread fallback preserves the same report shape.
- CLI decodes with Sharp, invokes the same engine policy, and serializes detection/removal metadata.
- The Python module is a subprocess bridge to the CLI, not a separate detector. Its timeout scales from input pixel count when dimensions are available.

When adding an option, update the runtime option type, CLI parser/help, Python mapping where appropriate, UI mapping, SDK declaration, and at least one interface contract test. An option that exists only in one entry point is not complete.

## 14. Diagnostics and Result Contracts

Detection can return a trace containing candidate counts, validations, decision tier and winner metadata. Removal returns an explicit report:

- `attemptedCount`: candidates presented to removal.
- `acceptedCount`: candidates retained after geometry/NMS filtering.
- `suppressedCount`: overlaps rejected before pixel mutation.
- `appliedCount`: removals that actually changed pixels.
- `results`: per-candidate applied state, changed-pixel count, maximum channel delta, pass count and stop reason.

This distinction prevents “detected” from being reported as “removed” when validation or safety logic performs no mutation. Consumers should use `detectedCount` for detection and `removedCount`/`removal.appliedCount` for actual application.

## 15. Asset and Fixture Integrity

`assetRegistry.js` validates known assets and dimensions before use. Invalid or mismatched assets fail closed instead of silently falling back to an unrelated template. `resolveAssetKey()` owns variant selection, including Gemini `96-20260520` and Doubao rectangular keys.

Real feedback cases live in `tests/fixtures/user-feedback/manifest.json`. Each executable case records its source path, SHA-256 digest, profile and measurable expectation. Fixtures referenced by that manifest are test inputs and must not be removed as temporary files.

## 16. Current Limits and Planned Engineering

Short term:

- Expand hashed real-sample coverage with shifted Gemini, Doubao TL/BR and clean negatives.
- Add browser E2E coverage and preset runtime baselines.
- Add documentation/profile contract checks to CI.

Mid term:

- Introduce a typed `AssetLoader` shared by browser, CLI and worker boundaries.
- Replace the scene-luminance halo diagnostic with a reference-delta metric that supports acceptance and rollback.
- Add a real sliding-window SSIM or another perceptual metric; the compatibility `calculateSSIM` export is currently only a PSNR-derived estimate.
- Evaluate NCC/Sobel acceleration only behind repeatable benchmarks.

Long term:

- Maintain a versioned recall/precision/artifact/runtime benchmark.
- Automate candidate catalog proposals without automatically registering unknown profiles.
- Package a browser extension only after browser E2E and release automation are stable.

The authoritative schedule is [ROADMAP.md](./ROADMAP.md); historical stage plans are diagnostic archives and must not be used as current implementation contracts.

*Document version: v2.7.0, updated 2026-07-01.*
