# Gemini Watermark Remover — Roadmap

## Current Status

- **Version**: v2.2.2
- **Verification baseline**: core suite passing, 0 lint errors
- **Architecture**: Five-phase detection pipeline (Catalog → Scaled → Heuristic → Adaptive → Global) + scaled match gating + decision policy + shared removal + worker pool
- **Test suite**: 49 test files (optimized, 8 empty stubs removed, 6 groups merged, 5 new coverage files added)

## Completed (v2.2.2 — Watermark Detection Recall & Frontend Fix)

### Backend: Detection Miss Root Cause Fix
- **BUG-1** [CRITICAL]: Relaxed `registry.findMatches()` tolerance from 0.05 → 0.10; added `findCloseMatches()` with 0.25 tolerance for cropped/resized images
- **BUG-2** [HIGH]: Changed multi-dimensional scoring from `spatial*0.5+gradient*0.3+variance*0.2` to `max(spatial, weighted)` to prevent NCC dilution
- **BUG-3** [MEDIUM]: Fixed `calculateVarianceScore` — uniform backgrounds return neutral 0.5 instead of 0
- **BUG-4** [MEDIUM]: Lowered adaptive detection threshold from 0.35 → 0.22
- **BUG-5** [HIGH]: Fixed heuristic tier classification — shortSide priority prevents panorama misclassification; added 48px+96px dual-size fallback in `getAllPotentialConfigs`
- **BUG-6** [MEDIUM]: Replaced `fs.readFileSync` with static JSON import for universal browser/Node catalog loading
- **BUG-7** [MEDIUM]: Expanded global search range from 55% → 75%
- **BUG-8** [MEDIUM]: Made `interpolateAlphaMap`/`warpAlphaMap` support rectangular (non-square) dimensions
- **BUG-9** [LOW]: Removed redundant single Worker in `watermarkEngine.js` — unified to WorkerPool only
- **Scaled match gating** [NEW]: `calculateProbeConfidence` differentiates scaled vs exact catalog matches with higher base-NCC (0.14 vs 0.10), gradient (0.18 vs 0.12), and probe (0.35 vs 0.18) thresholds; jitter disabled for scaled

### Frontend: UI Bug Fixes & UX Enhancements
- **BUG-UI-1** [HIGH]: Fixed `showLoadingFail` classList mismatch + i18n-ized hardcoded text
- **BUG-UI-3** [HIGH]: Fixed Stats View displaying hardcoded values instead of actual anchor/algorithm
- **BUG-UI-5** [MEDIUM]: `downloadImage` regenerates URL from blob when processedUrl is missing
- **BUG-UI-6** [HIGH]: Replaced mouse events with pointer-events + `setPointerCapture` to prevent drag leaks
- **BUG-UI-7** [LOW]: `applyProfileTheme` now applies DOM styles instead of unused CSS variables
- **Added**: Dark mode manual toggle (auto/dark/light three-state cycle, stored in localStorage)
- **Added**: Detection phase indicator in tier badge (catalog-probe / adaptive-search / global-free)
- **Removed**: mesh-blob dead code (~40 lines CSS + HTML elements)

### Test Suite Optimization
- Deleted 8 empty test stubs (zero test() calls)
- Merged 6 redundant test groups into parent files (catalog 4→1, registry 2→1, detector 3→1, parameters 2→1)
- Added 5 new coverage files: `v2_2_probe_gating.test.js`, `v2_2_frontend.test.js`, `v2_2_adaptive_rect.test.js`, `e2e_integration.test.js`, `parameter_overrides.test.js`
- Extracted shared `TC` constants to `test_utils.js` (resolutions, thresholds, profiles, image types)
- **Total: 49 test files, ~390 tests**

### Documentation
- Created `DIAGNOSTIC_PLAN.md` — comprehensive backend diagnosis, frontend analysis, test audit (3 chapters)
- Updated all README files with v2.2.2 changes

## Short-term Plans (v2.3)

1. **Enhanced watermark variant support**: Add newer Gemini template variants for updated watermark margins
2. **Real sample integration tests**: Use docs/ sample images as regression fixtures in CI
3. **True SSIM calculation**: Replace PSNR-based quality estimation with proper sliding-window SSIM
4. **WASM acceleration**: WebAssembly-accelerated NCC and Sobel gradient computation
5. **Extend multi-pass removal + alpha calibration** to doubao and other non-gemini profiles
6. **Complete CLI pipe mode** end-to-end integration tests

## Mid-term Plans

1. **Frequency-domain false positive defense**: Spectral analysis for robust non-watermark rejection
2. **Prepare real alphaMap assets** for DALL-E 3 profile
3. **Unify Web/CLI Engine**: Abstract `AssetLoader` interface for cross-platform asset loading
4. **Adaptive auto-tuning**: Image entropy-based detection threshold adjustment
5. **Browser extension**: Chrome extension packaging
6. **Embedded alpha maps**: Replace PNG file loading with base64-embedded maps for zero I/O overhead

## Long-term Plans

1. Maintain verifiable, explainable, pure-mathematical watermark removal benchmark
2. Productization: Chrome extension, page integration, SDK publishing
3. Continuously expand real sample library targeting complex backgrounds and slightly-scaled exports
4. Multi-platform deployment: Web, CLI, Python, browser extension, Docker

## Verification Commands

```bash
pnpm lint                  # 0 errors
pnpm test                  # core test suite
pnpm build                 # static Tailwind CSS build
```
