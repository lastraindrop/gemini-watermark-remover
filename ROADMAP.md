# Roadmap - Gemini & Doubao Watermark Remover

## Current Status (v2.7.1 closure)

The branch is now aligned around:

- Supported profile selections: Gemini, Doubao, Auto.
- Detection pipeline: catalog, heuristic, adaptive, global fallback, candidate validation, anchor preservation.
- Removal pipeline: shared overlap NMS, multi-pass removal, weak-alpha handling, recalibration gates, and artifact diagnostics.
- Frontend: production profile labels, manual `auto` template mode, mobile-safe layout/toasts, accessible compare buttons.
- Tests: explicit unit/integration/precision/audit/diagnostic/stress grouping with contract checks.
- Documentation: README, user guide, developer guide, technical guide, roadmap, and finalization report aligned.

## Completed in v2.7.1

### Post-closure hardening (2026-07-02)

- Rejected candidates whose trial restoration materially increases template residual, even when detector confidence is high.
- Allowed adaptive/global fallback to compete whenever the best catalog candidate remains weak.
- Made every authoritative multi-pass mutation transactional, including the first pass.
- Calibrated captured Doubao assets with a conservative 3/255 baseline correction validated on four paired fixtures; exact external/synthetic maps remain unbiased.
- Made the public SDK importable in plain Node by placing browser PNG assets behind dynamic imports.
- Added a GitHub Actions standard gate for install, lint, build, `test:all`, and the Python bridge.

### Accuracy and Candidate Selection

- Routed Gemini `96-20260520` alpha variant through `resolveAssetKey()`.
- Fixed Doubao and rectangular manual asset-key behavior.
- Preserved reliable standard-anchor candidates against slightly stronger drifted candidates.
- Added candidate trial-removal validation to reject clipping and non-improving candidates.
- Added free-mode confidence floor to reduce clean-image false positives.
- Relaxed adaptive fallback so weak catalog-backed matches no longer suppress adaptive search.
- Kept overlap NMS spatial rather than using a global confidence floor that could suppress independent Doubao anchors.

### Removal Fidelity

- Reworked standard alpha gain behavior to avoid small systematic bias.
- Added weak-alpha chain tests and behavior for faint large-margin cases.
- Added texture/high-frequency cleanup protection.
- Extended multi-pass strategy across known shape-compatible profiles.
- Hardened worker pool state release and timeout recovery.

### Frontend

- Simplified profile selection to the supported registry.
- Added manual template `auto` option.
- Added Doubao rectangular manual dimensions and asset-key wiring.
- Fixed mobile batch layout and toast wrapping.
- Added accessible compare button attributes.
- Synchronized i18n keys across supported languages.

### Test Architecture

- Added `scripts/test-groups.mjs`.
- Split tests into `unit`, `integration`, `precision`, `audit`, `diagnostic`, `stress`, `legacy`, and `worker`.
- Added `tests/test_groups_contract.test.js`.
- Added `tests/setup_contract.test.js`.
- Centralized mock asset loading and profile-derived mock asset dimensions.
- Made stress tests bounded and environment-configurable.

### Documentation and Cleanup

- Removed unsupported legacy profile design remnants from runtime, UI, types, tests, and active documentation.
- Removed dead gain estimation, unsafe edge cleanup, unreachable halo retry, and their duplicate tests.
- Consolidated candidate geometry/NMS and asset registry behavior.
- Cleaned generated test output and Python caches while retaining executable fixtures.
- Updated package metadata.
- Rewrote user/developer/technical documentation around current behavior.
- Added an executable active-documentation contract.

## Short-Term Plan

1. **Browser E2E coverage**
   - Playwright covers production page load, profile controls, advanced/manual controls, real-image upload/processing, compare toggle, and mobile overflow.
   - Still add drag/drop, manual canvas drawing, and batch ZIP download coverage.
   - Add desktop and mobile viewport snapshots once the remaining interaction lanes are in place.

2. **Real-sample regression pack**
   - Extend the executable hashed manifest in `tests/fixtures/user-feedback/manifest.json`.
   - Curate difficult Gemini offset cases, 20260520 variants, Doubao TL/BR samples, and clean negative images.
   - Track detection position drift, confidence, PSNR/MSE, and artifact flags.

3. **Performance baselines**
   - Record timing for Fast/Balanced/Thorough across 512, 1K, 2K, and 4K inputs.
   - Keep stress defaults bounded but allow large local runs through environment variables.

4. **Frontend queue and output controls**
   - Queue management: per-item retry/cancel/remove.
   - Output format selection (PNG/WebP/JPEG) in Web UI.
   - Custom output naming templates.

5. **Release automation**
   - Run active-documentation, SDK, profile and test-group contracts in CI.
   - Generate a reproducible release verification summary from test-group results.

## Mid-Term Plan

1. **AssetLoader abstraction**
   - Formalize browser/CLI/worker asset loading behind one typed interface.
   - Reduce inline special cases in `watermarkEngine.js`.

2. **Perceptual quality metrics**
   - Add real sliding-window SSIM or a local perceptual score alongside PSNR/MSE.
   - Deprecate the PSNR-derived compatibility `calculateSSIM` alias before v3.
   - Use it in precision/audit layers to catch subtle bias.

3. **Adaptive threshold policy**
   - Use image entropy, background texture, and local contrast to tune thresholds without exposing more UI controls.

4. **WASM acceleration**
   - Evaluate NCC and Sobel kernels for WebAssembly acceleration.
   - Gate behind benchmarks before adoption.

5. **New profile admission contract**
   - Require real assets, catalog coverage, entry-point parity, UI copy, and real-sample regression before registration.

6. **Authoritative artifact rollback**
   - Replace scene-luminance halo diagnostics with before/after reference-delta metrics.
   - Permit automatic rejection or retry only after the metric has deterministic acceptance and rollback tests.

## Long-Term Plan

1. Maintain an explainable mathematical watermark removal benchmark.
2. Expand to a browser extension only after browser E2E and UI stability are mature.
3. Automate catalog discovery for new watermark variants.
4. Build a durable sample and metrics dashboard for recall, precision, artifact risk, and runtime.
5. Keep all supported entry points local-first and consistent: Web, CLI, SDK, Python, and future extension packaging.

## Verification Policy

Standard gate:

```bash
pnpm lint
pnpm build
pnpm test:all
```

Accuracy or stress work also requires:

```bash
pnpm test:diagnostic
pnpm test:stress
```

Full explicit audit:

```bash
pnpm test:exhaustive
```

`test:exhaustive` is intentionally slower than the standard gate because it includes diagnostic and stress suites.
