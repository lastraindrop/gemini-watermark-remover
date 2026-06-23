# Developer Guide (v2.7.0)

This guide documents the current engineering contract for the fork: architecture, parameter ownership, test layering, documentation rules, and release checks.

## 1. Architecture Contract

### Core ownership

- `src/core/config.js`
  - Owns `DETECTION_THRESHOLDS`, `PERFORMANCE_PRESETS`, and `ENGINE_LIMITS`.
  - New detection constants must be added here first.
- `src/core/profiles.js`
  - Owns profile identity, anchors, tier heuristics, and asset aliases.
  - Production profiles: `gemini`, `doubao`.
  - `dalle3` is experimental and must not be exposed as production support without a product decision.
- `src/core/catalog.js` and `src/core/catalogs.json`
  - Own official and scaled catalog matching.
- `src/core/detectionPipeline.js`
  - Coordinates profile selection, manual mode, asset-key resolution, catalog/heuristic/adaptive/global detection, candidate validation, and final ranking.
- `src/core/detector.js`
  - Owns scoring primitives and search implementation.
- `src/core/applyRemoval.js`
  - Owns overlap suppression and the shared removal strategy used by engine/worker/CLI paths.
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
6. Experimental profiles must be explicitly marked in code and docs.

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
5. Use halo/artifact checks to stop unsafe passes.

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
pnpm test             # unit layer, default fast feedback
pnpm test:integration # runtime/frontend/CLI/worker/pipeline
pnpm test:precision   # recall, real samples, parameter matrix
pnpm test:audit       # product acceptance audit
pnpm test:diagnostic  # slow diagnostic baseline
pnpm test:stress      # bounded memory pressure
pnpm test:legacy      # legacy v1.5 smoke regressions
pnpm test:all         # standard gate: unit + integration + precision + audit + legacy
pnpm test:exhaustive  # every top-level test plus diagnostic/stress/legacy
```

Rules:

- Each top-level `tests/*.test.js` file belongs to exactly one primary group.
- `tests/test_groups_contract.test.js` fails if a new top-level test is unassigned or assigned twice.
- Slow diagnostic and stress tests stay out of default `pnpm test` and `pnpm test:all`.
- Shared DOM and asset mocks live in `tests/setup.js` and `tests/test_utils.js`.
- Do not duplicate `_loadAsset` mock logic; use `installMockAssetLoader()`.
- Do not hardcode rectangular asset sizes in individual tests; use `resolveMockAssetDimensions()`.

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
- Inspect halo/artifact stop reasons.

Frontend mismatch:

- Verify production UI profile labels.
- Verify i18n keys across all seven locale files.
- Verify manual template radio defaults to `auto`.
- Verify compare buttons are button elements with `aria-pressed`.
