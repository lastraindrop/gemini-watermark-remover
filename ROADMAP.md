# Gemini Watermark Remover — Roadmap

## Current Status

- **Version**: v2.2.3
- **Verification baseline**: core suite passing, 0 lint errors on source
- **Architecture**: Five-phase detection pipeline (Catalog → Scaled → Heuristic → Adaptive → Global) + scaled match gating + decision policy + shared removal + worker pool
- **Test suite**: 48 test files (optimized: 4 files merged, 3 v2_2_* consolidated, 3 new coverage files, shared DOM mock via setup.js)
- **Frontend**: Multi-profile UI (Gemini/Doubao/DALL-E 3), dark mode, version display, retry button, statsView dark-mode aware, i18n 7 languages synchronized

## Completed (v2.2.3 — Architecture Audit & Comprehensive Fix)

### Critical Bug Fixes (Backend)
- **BUG-01**: doubao detection path — shared DetectorContext buffer reuse (was allocating 2× Float32Array per call)
- **BUG-02**: CLI `parseArgs` — missing argument value validation (now throws clear errors)
- **BUG-03**: `adaptiveDetector.scoreCandidate` — separate width/height for rectangular watermark safety
- **BUG-05**: `WatermarkEngine.destroy()` — removed dead single-worker code path
- **BUG-08**: Python `remover.py` pipe method — added missing `--profile` parameter

### Medium Bug Fixes (Backend)
- **BUG-04**: `cli.js` — removed unreachable version check code
- **BUG-06**: `WorkerPool.terminate()` — added `_terminated` flag preventing reuse after destruction
- **BUG-09**: `alphaCalibration.js` — fine search now allows gain ≤ 1.0 (previously filtered out)
- **BUG-11**: `profiles.getProfile()` — now warns on unknown profile ID instead of silently falling back
- **A3**: `detector.js` function property anti-pattern — added `@deprecated` JSDoc
- **A4**: `sdk/index.js` `calculateSSIM` — marked as deprecated PSNR-based estimate

### Frontend Bug Fixes
- **BUG-FE-01**: `processing.js` — removed duplicate `_detectionSource` assignment line
- **BUG-FE-02**: `resetWorkspace()` — now clears stale `downloadBtn.onclick` preventing revoked URL downloads
- **BUG-FE-03**: `dragDrop.js ↔ app.js` — eliminated circular import by inlining cleanup logic
- **BUG-FE-04**: `settings.js` — replaced double i18n dynamic import with static `supportedLanguages` import
- **BUG-FE-05**: `viewModes.applyProfileTheme()` — replaced hardcoded CSS class selector with `data-profile-icon` attribute
- **BUG-FE-06**: `showLoadingFail` — added retry button to loading overlay (was referencing nonexistent element)
- **BUG-FE-07**: `statsView` — added `dark:` variant for light-mode compatibility
- **BUG-FE-08**: `auditConsole` toggle — replaced implicit double-toggle with explicit state check

### Architecture & Frontend Alignment
- **FE1**: Page title, hero text, and meta description now reflect Gemini + Doubao + DALL·E 3
- **UX1**: Loading screen "INITING" typo fixed to "INITIALIZING"
- **UX6**: Hero title `break-all` → `break-words` to prevent mid-word breaks
- **FE2**: Version number displayed in footer (from package.json)
- **UX8**: Loading text simplified; "Warping neural boundaries..." → "Preparing engine..."

### i18n
- 7 language files: added `status.initializing` + `btn.retry` keys
- `ja-JP.json`: fully rewritten to fix pre-existing UTF-8 encoding corruption
- `en-US.json` title/branding updated to multi-platform

### Test Suite Optimization
- **Merged** consistency.test.js → config.test.js (+3 protocol compliance tests)
- **Merged** v2_2_adaptive_rect.test.js → adaptive_detector.test.js (+5 rect interpolation tests)
- **Merged** v2_2_frontend.test.js → frontend_interaction.test.js (+3 download/theme tests)
- **Merged** v2_2_probe_gating.test.js → detection_fallback_chain.test.js (+6 probe gating tests)
- **Created** `tests/setup.js` — unified DOM mock (eliminated ~180 lines of duplication across 4 files)
- **Created** `tests/edge_alpha_maps.test.js` — empty/white/NaN/single-pixel alpha map boundary tests (6 tests)
- **Created** `tests/engine_lifecycle.test.js` — destroy→reuse, concurrent instances, getExecutionMode (6 tests)
- **Created** `tests/template_resolution.test.js` — getProfilesToTry, getAllPotentialConfigs, profile validation (10 tests)
- **Extended** `tests/test_utils.js` — added `createWatermarkedImage()`, `getExpectedLogoSize()`, `extractRegion()`
- **Total: 48 test files (reduced from 49, net -1)**

## Short-term Plans (v2.3)

1. **True SSIM calculation**: Replace PSNR-based quality estimation with proper sliding-window SSIM
2. **WASM acceleration**: WebAssembly-accelerated NCC and Sobel gradient computation for large images
3. **Extend multi-pass removal + alpha calibration** to doubao and other non-gemini profiles
4. **Complete CLI pipe mode** end-to-end integration tests
5. **Browser E2E tests**: Playwright/Puppeteer browser integration tests for the web UI
6. **Performance regression tests**: Baseline timing for 512/1K/2K/4K images

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
