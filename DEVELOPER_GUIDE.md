# Developer Guide (v2.7.0)

This guide documents the current engineering contract for the fork: architecture, parameter ownership, test layering, documentation rules, and release checks.

## 1. Architecture Contract

### Core ownership

- `src/core/config.js`
  - Owns `DETECTION_THRESHOLDS`, `PERFORMANCE_PRESETS`, and `ENGINE_LIMITS`.
  - New detection constants must be added here first.
- `src/core/profiles.js`
  - Owns profile identity, anchors, tier heuristics, and asset aliases.
  - Supported profiles: `gemini`, `doubao`.
- `src/core/catalog.js` and `src/core/catalogs.json`
  - Own official and scaled catalog matching.
- `src/core/detectionPipeline.js`
  - Coordinates profile selection, manual mode, asset-key resolution, catalog/heuristic/adaptive/global detection, candidate validation, and final ranking.
- `src/core/detector.js`
  - Owns scoring primitives and search implementation.
- `src/core/candidateGeometry.js`
  - Owns candidate overlap geometry and NMS behavior.
- `src/core/applyRemoval.js`
  - Owns the shared removal strategy used by engine/worker/CLI paths.
- `src/core/watermarkEngine.js`, `worker.js`, `workerPool.js`
  - Own runtime execution, asset loading/cache, worker fallback, and queue behavior.

### Application ownership

- `src/app/settings.js` builds engine options from UI state and presets.
- `src/app/manualSelection.js` owns pointer selection and manual dimensions.
- `src/app/dragDrop.js` owns file ingestion, card creation, comparison button state, and upload errors.
- `src/app/ui.js` owns toast/progress/audit UI helpers.
- `public/index.html` is the production shell. Keep production profile labels aligned with `profiles.js`.
- `src/i18n/*.json` must carry identical keys.

## 2. Parameter Alignment Rules

1. Detection thresholds live in `DETECTION_THRESHOLDS`; do not scatter literals in detector or pipeline code.
2. Performance presets live in `PERFORMANCE_PRESETS`; UI sliders may set top-level threshold overrides, but must not mutate preset-owned structural thresholds.
   The Web sensitivity slider intentionally maps one user value to both `probeThreshold` and `fallbackThreshold`; SDK/CLI callers may tune them independently.
3. Profile assets, catalog dimensions, and test mock dimensions must derive from profile/catalog metadata.
4. Manual mode passes structured `manualConfig`:

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

5. Web, CLI, SDK, worker, and Python bridge must call the same core engine path or shared removal strategy. Do not fork detection behavior by entry point.
6. A new profile requires a real alpha asset, catalog coverage, entry-point parity, and real-sample regression tests before registration.

## 3. Detection and Removal Flow

Detection order:

1. Catalog probe.
2. Scaled catalog probe.
3. Profile heuristic probe.
4. Adaptive search when catalog confidence is weak.
5. Global fallback, guarded by confidence and near-anchor checks.
6. Candidate trial-removal validation.
7. Standard-anchor preservation and final ranking.

Removal order:

1. Suppress overlapping candidates with NMS.
2. Run profile-compatible multi-pass removal.
3. Apply weak-alpha chain when needed.
4. Recalibrate alpha gain only when residual gates justify it.
5. Stop on residual convergence, regression, or authoritative near-black/texture safety gates. Halo severity remains diagnostic until it is replaced by a reference-delta metric.

## 4. Adding or Changing a Profile

Required checklist:

1. Update `src/core/profiles.js`.
2. Add or update catalog entries in `src/core/catalogs.json`.
3. Add asset files in `src/assets/` and wire them in `watermarkEngine.js` when bundled inline.
4. Verify `resolveAssetKey()` handles the profile and shape correctly.
5. Add unit tests for catalog/profile metadata.
6. Add integration or precision tests for detection and removal.
7. Update README, user guide, technical guide, and roadmap.

## 5. Test Architecture

`scripts/test-groups.mjs` owns test grouping.

```bash
pnpm test             # unit layer (default fast feedback)
pnpm test:unit        # unit: module contracts, algorithm invariants, heuristic tests
pnpm test:integration # integration: runtime, CLI, worker, pipeline, build
pnpm test:precision   # precision: detection recall, removal quality, parameter matrix, real samples
pnpm test:audit       # audit: product acceptance (smoke), full matrix moved to stress
pnpm test:diagnostic  # diagnostic: slow detection/removal tests + hanging frontend tests
pnpm test:stress      # stress: memory pressure + full catalog×profiles audit matrix
pnpm test:worker      # worker: Web Worker lifecycle and timeout recovery
pnpm test:legacy      # legacy: v1.5 smoke regressions
pnpm test:all         # standard gate: unit + integration + precision + audit + legacy
pnpm test:exhaustive  # every top-level test including diagnostic/stress/legacy
```

Test helpers (in `tests/helpers/`):
- `imageQualityAssertions.js`: MAE, maxDelta, PSNR, residualNcc, haloScore, assertImageClose
- `syntheticWatermarkFactory.js`: deterministic backgrounds, alpha maps, watermark blending, region extraction

User feedback fixtures:

- `tests/fixtures/user-feedback/manifest.json`: executable case inventory, expected positions/assets, and source hashes.
- `tests/fixtures/user-feedback/missed/`: repository-owned real missed-detection fixtures. Add other categories only when an executable test consumes them.

Rules:

- Each top-level `tests/*.test.js` file belongs to exactly one primary group.
- `tests/test_groups_contract.test.js` fails if a new top-level test is unassigned or assigned twice.
- Slow diagnostic and stress tests stay out of default `pnpm test` and `pnpm test:all`.
- Shared DOM and asset mocks live in `tests/setup.js` and `tests/test_utils.js`.
- Do not duplicate `_loadAsset` mock logic; use `installMockAssetLoader()`.
- Do not hardcode rectangular asset sizes in individual tests; use `resolveMockAssetDimensions()`.
- Keep tuning values in `DETECTION_THRESHOLDS`; `tests/threshold_sot_integrity.test.js` enforces the contract.

## 6. Required Verification Before Commit

Minimum for small code changes:

```bash
pnpm lint
pnpm build
pnpm test
```

For changes affecting detection, removal, frontend wiring, or test infrastructure:

```bash
pnpm lint
pnpm build
pnpm test:all
```

For accuracy or memory work, also run the relevant slow layers:

```bash
pnpm test:diagnostic
pnpm test:stress
```

## 7. Documentation Maintenance

Update docs in the same change when any of these move:

- Production profile list.
- CLI or UI parameters.
- Test command semantics.
- Detection thresholds or preset ownership.
- Known limitations.
- Release status or roadmap.

Do not write historical test counts as current facts. Prefer script names and group names unless an exact count was just verified.

## 8. Common Regression Checks

Missed detections:

- Check catalog hit and scaled-catalog hit first.
- Confirm the selected alpha asset key, especially Gemini `96-20260520` and rectangular Doubao keys.
- Inspect whether a candidate was filtered by trial-removal validation or free-mode confidence.
- Try `thorough` and manual `auto` template before lowering thresholds globally.

Post-removal bias or artifacts:

- Check whether multiple overlapping candidates escaped NMS.
- Compare original spatial NCC and residual NCC, not only blended confidence.
- Check alpha gain and weak-alpha path.
- Inspect pass stop reasons and halo diagnostics; do not treat halo severity as an authoritative rejection by itself.

Frontend mismatch:

- Verify production UI profile labels.
- Verify i18n keys across all seven locale files.
- Verify manual template radio defaults to `auto`.
- Verify compare buttons are button elements with `aria-pressed`.
