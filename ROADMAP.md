# Gemini Watermark Remover — Roadmap

## Current Status

- **Version**: v2.5.1
- **Verification baseline**: core suite passing (417 tests), 0 lint errors on source, production build clean
- **Architecture**: Five-phase detection pipeline (Catalog → Scaled → Heuristic → Adaptive → Global) + unified DETECTION_THRESHOLDS + performance presets + decision policy + shared removal + worker pool
- **Test suite**: 44 test files, 417 tests, DETECTION_THRESHOLDS de-hardcoded across detector.js
- **Frontend**: Unified card-based layout, enhanced manual mode with canvas drag-to-select + template size selector + force-process, 7 language i18n, dark mode, inline PNG assets (no file:// CORS issues)

## Completed (v2.5.0 — Detection Geometry & Removal Quality)

### Detection Geometry Fixes (3 files)
- **D-1**: `detector.js:549` — Replaced multiplicative gradient penalty (`confidence *= 0.30`, 70% reduction) with weighted multi-dimensional blend (`spatial×0.5 + gradient×0.3 + variance×0.2`), consistent with global search scoring
- **D-2**: `detectionPipeline.js:254-268` — Multi-margin template probing: 48px/96px templates now probed at all standard Gemini margins (32/64/96px), Phase 1.4 auto-selects best size. Fixes false-positive 96px catalog matches that nested a 48px watermark
- **D-3**: `applyRemoval.js` — Weighted `estimateAlphaGain()`: template-alpha-weighted luminance comparison replaces simple averaging, eliminating 2x under-estimation. Pre-scaled alpha maps prevent cumulative multi-pass over-correction

### Browser & UX Fixes (5 files)
- **B-1**: `watermarkEngine.js` — All 10 template PNGs compiled as base64 data URLs (`import {} from '../assets/'`), eliminating CORS/canvas-tainting on `file://` protocol
- **B-2**: `dragDrop.js` — Unified card-based layout: removed legacy single-image comparison-slider path; all images use the same card grid with batch-style processing
- **B-3**: `manualSelection.js` — Dedicated `#manualSelectCanvas` with drag-to-select overlay, 48px/96px template size radio, force-process toggle (bypasses multi-pass safety gates)
- **B-4**: `public/index.html` — 17 buttons with focus-visible ring styles, 4 alt attributes, 6 hardcoded English strings → data-i18n, magnifier z-index fix
- **B-5**: `dragDrop.js` `handleDropEvent` — Fallback to `dataTransfer.files` when `webkitGetAsEntry` returns null; `file://` URI filtering in uri-list check

### Frontend QA (8 files)
- **F-1**: `settings.js` — Save/restore threshold, penalty, darkMode; slider defaults from `DETECTION_THRESHOLDS`; presetHint i18n
- **F-2**: `applyRemoval.js` — `estimateAlphaGain` exported and tested (4 tests: normal, faint, clean, dark bg)
- **F-3**: `detectionPipeline.js` — `validateManualConfig` passes through `forceProcess` flag
- **F-4**: 7 i18n locale files — all synchronized at 136 identical keys
- **F-5**: `detectionPipeline.js` — `forceProcess` sets confidence to 1.0 and labels source as `manual-forced`
- **F-6**: `tailwind.config.js` — `darkMode: 'media'` → `'class'`, CSS media query scoped to `html.dark`
- **F-7**: `utils.js` — Loading overlay scroll lock + hide

### Test Suite Improvements
- **T-1**: 7 test files de-hardcoded with `DETECTION_THRESHOLDS` imports
- **T-2**: 16 new tests: `estimateAlphaGain` (4), `forceProcess` (1), margin probing (1), manual canvas (6), calibration (4)
- **T-3**: `diagnostic_baseline.test.js` — 15 hardcoded threshold references replaced with constants

## Completed (v2.3.0 — Detection Accuracy & Test Suite Overhaul)

### Detection Accuracy Fixes (Phase A)
- **A-1**: `detectionPipeline.js` — Lowered scaled-config threshold 0.35→0.25 to stop rejecting valid scaled detections
- **A-2**: `adaptiveDetector.js` — Fixed square assumption to support rectangular watermarks (Doubao 401×173, DALL-E 120×40)
- **A-3**: `detector.js` — Improved variance score for smooth backgrounds (ratio + absolute-delta dual-mode scoring, replaced fixed 0.5 fallback)
- **A-4**: `detector.js` — Lowered `localContrastCorrelation` alpha residual threshold 0.015→0.008 for faint watermarks
- **A-5**: `detector.js` — Expanded global search range 75%→90% for better coverage of non-standard watermark positions

### Architecture & Configuration (Phase B)
- **B-5**: `config.js` — Created unified `DETECTION_THRESHOLDS` export (single source of truth for all thresholds)
- **B-6**: `detector.js` — Fixed alpha-map lookup logic for non-square watermarks (prevents single-dimension fallback from matching unrelated square templates)
- **B-7**: `detector.js`, `detectionPipeline.js`, `config.js` — Wired all modules to `DETECTION_THRESHOLDS`; eliminated 15+ scattered hardcoded constants

### Performance Presets (v2.3 Feature)
- `config.js` — Added `PERFORMANCE_PRESETS` (fast/balanced/thorough) with granular overrides for search range, jitter, fine-tune, candidate limits, thresholds
- `settings.js` — Added `syncTogglesToPreset()` with dynamic parameter hints; `deepMerge()` for preset+user override layering
- `app.js` — Radio button event listeners with toggle sync; call on init via `loadSettings()`
- `public/index.html` — Three-column radio group UI with icon + label + description per preset
- `i18n` — Added `settings.performancePreset`, `preset.*`, `preset.hint` keys across all 7 languages

### Frontend Fixes
- **B-1**: Toggle switches (deepScan/noiseReduction) now sync to preset value instead of silently overridden
- **B-2**: Preset selection triggers `syncTogglesToPreset()` with visual feedback
- **B-3**: Fixed silent `onError` callback in `dragDrop.js` — now shows toast + AuditLog
- **B-4**: Added single-image "Re-process" button — users can change preset/settings and retry without resetting workspace
- **I-1**: `#presetHint` now dynamically displays preset-controlled parameters (search range, deepScan, jitter, fine-tune, adaptive, candidates)
- **I-4**: Magnifier lens position clamped to slider bounds; null-safe `processedImg?.src`

### Test Suite Overhaul
- **Phase 1 (Bug Fixes)**: Fixed `countChangedPixels` never-incrementing counter; updated `TC` constants to reference `DETECTION_THRESHOLDS`; replaced 16 hardcoded positions with `resolvePos()`
- **Phase 2 (De-duplication)**: Merged `bt709_color+ncc_scoring+local_contrast+gradient_penalty` → `detector_scoring.test.js`; merged `edge_alpha_maps` → `edge_cases.test.js`; 5 files removed, 2 unified files added
- **Phase 3 (v2.3 Coverage)**: 19 new tests — PERFORMANCE_PRESETS structure (6), DETECTION_THRESHOLDS integrity (5), rectangular watermark detection (2), smooth-background variance (2), scaled-config threshold (2), non-square alphaMap guard (2)

## Completed (v2.5.1 — Consistency, Bug Fixes, Test Hardening & Frontend Audit)

### Critical Bug Fixes (5 files)
- **C-1**: `detector.js` — Extracted `blendMultiDimensionalScore()` shared helper; all 3 gradient-filtering sites (Phase 2 fine-tune, main probe, jitter search) now call the same function. Eliminated old `combined * min(gradientPenalty, 0.50)` multiplicative penalty from jitter path.
- **C-2**: `adaptiveDetector.js` — `DEFAULT_THRESHOLD` now references `DETECTION_THRESHOLDS.ADAPTIVE_MIN_CONFIDENCE` instead of hardcoded `0.35`.
- **H-1**: `dragDrop.js` — ObjectURL cleanup order fixed: `innerHTML=''` now runs before `objectUrlManager.clear()` to avoid dangling DOM references.
- **H-2**: `workerPool.js` — Zombie worker recovery: timed-out workers are now `terminate()`d and replaced via `_spawnReplacementWorker()` instead of being marked `_inUse=false` and reused.
- **H-3**: `detector.js` — `calculateProbeConfidence` now pre-allocates gradient buffers once at function scope and reuses them across the deepScan block and jitter loop. Eliminated 338 redundant Float32Array allocations per call.

### Configuration & Consistency (3 files)
- **CF-1**: `config.js` — Added 14 new threshold constants to `DETECTION_THRESHOLDS`: `GRADIENT_IGNORE_GATE`, `GRADIENT_BOOST_GATE_EXACT/SCALED`, `EXACT_NCC_GATE`, `SCALED_NCC_GATE`, `DOUBAO_NCC_GATE`, `JITTER_FINETUNE_TRIGGER`, `JITTER_TRIGGER_MIN/MAX`, `DEEPSCAN_GRADIENT_GATE`, `STANDARD_MARGIN_TOLERANCE`, `CANDIDATE_OVERLAP_DISTANCE`, `MODE_BOOST_ANCHORED/ALIGNED/FACTOR`, `GRADIENT_PENALTY_DEFAULT`.
- **CF-2**: `detector.js` — 10+ hardcoded magic numbers migrated to `DETECTION_THRESHOLDS.*` references.
- **CF-3**: Version sync: `package.json` 2.2.3→2.5.1; 5 phantom `v2.6` comments cleaned; all 7 doc headers aligned.

### Frontend Fixes (9 files)
- **F-1**: `src/i18n/*.json` (5 languages) — Added missing `manual.templateSize`, `manual.forceProcess`, `manual.dragHint` keys. i18n completeness test now 9/9 pass.
- **F-2**: `public/index.html` + `settings.js` — DeepScan/NoiseReduction ghost toggles converted to honest read-only status badges driven by the active preset.
- **F-3**: `settings.js` — `getEngineOptions()` no longer clobbers preset THRESHOLDS via deepMerge. Removed unused `deepMerge()` helper.
- **F-4**: `state.js` + `app.js` — `objectUrlManager` refactored from monkey-patch to observer pattern (`onChange` callback).
- **F-5**: `app.js` — Removed dead `updateSingleUI` writes to hidden `singlePreview` DOM elements. Cleaned up unused `updateStatsUI` import.
- **F-6**: `viewModes.js` — `applyProfileTheme` now properly clears previous brand color before setting new.
- **F-7**: `settings.js` — `autoDownload` toggle now persisted/restored in `saveSettings`/`loadSettings`.
- **F-8**: `magnifier.js` — `LENS_SIZE/2` replaces hardcoded 75; `processedImg` fetched dynamically to avoid null-on-load.
- **F-9**: `settings.js` + `app.js` — Slider defaults now sourced from `DETECTION_THRESHOLDS` instead of hardcoded HTML values.

### Test Suite Expansion (5 new test files, 36 tests)
- **T-1**: `gradient_formula_consistency.test.js` (5 tests) — Verifies all 3 gradient sites call `blendMultiDimensionalScore`, old formula is absent, weights sum to 1.0.
- **T-2**: `threshold_sot_integrity.test.js` (10 tests) — Verifies 26 required keys in `DETECTION_THRESHOLDS`, `LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN` is referenced not hardcoded, no bare literals.
- **T-3**: `worker_timeout_recovery.test.js` (4 tests) — Verifies zombie worker terminate+replace, `_spawnReplacementWorker` success/failure, activeCount tracking.
- **T-4**: `apply_removal_strategy.test.js` (8 tests) — Gemini multi-pass, non-Gemini single-pass, forceProcess bypass, multiple matches, empty matches, `estimateAlphaGain` edge cases.
- **T-5**: `performance_preset_override.test.js` (9 tests) — Preset structure integrity, THRESHOLDS not clobbered, search intensity ordering, value range validation.

### Documentation
- **D-1**: `COMPREHENSIVE_STAGE_PLAN.md` — Full architecture audit, upstream comparison, bug inventory, verification strategy.
- **D-2**: `FRONTEND_DIAGNOSTIC_REPORT.md` — 4-dimension frontend diagnostic (20 bugs identified, 10 fixed).
- **D-3**: All doc files updated: test counts (107+→417), broken links fixed, version headers aligned.

## Short-term Plans (v2.6)

1. **Playwright E2E browser tests**: Browser integration tests for the web UI (upstream had this; fork dropped it).
2. **True SSIM calculation**: Replace PSNR-based quality estimation with proper sliding-window SSIM.
3. **Extend multi-pass removal + alpha calibration** to doubao and other non-gemini profiles.
4. **Performance regression test baseline**: Timing for 512/1K/2K/4K images with all three presets.
5. **Archive legacy test scripts**: Move `tests/scripts/v1.5_*.test.js` to archive or rewrite to modern format.
6. **Large-test timeout fix**: 3 test files (detection_fallback_chain, adaptive_detector, diagnostic_baseline) trigger Phase 2 global NCC scan on >1MP images — add `deepScan: false` or use smaller test images.
7. **Fix 6 remaining pre-existing test failures** in `e2e_integration`, `engine_lifecycle`, `parameter_matrix`, `product_audit`, `sdk_api`, `worker_resilience`.

## Mid-term Plans

1. **Frequency-domain false positive defense**: Spectral analysis for robust non-watermark rejection.
2. **WASM acceleration**: WebAssembly-accelerated NCC and Sobel gradient computation for large images.
3. **Prepare real alphaMap assets** for DALL-E 3 profile.
4. **Unify Web/CLI Engine**: Abstract `AssetLoader` interface for cross-platform asset loading.
5. **Adaptive auto-tuning**: Image entropy-based detection threshold adjustment.
6. **Browser extension**: Chrome extension packaging (upstream had this; fork dropped it).
7. **Real-sample regression suite**: CI pipeline with reference watermarked images to catch detection regressions.

## Long-term Plans

1. Maintain verifiable, explainable, pure-mathematical watermark removal benchmark
2. Productization: Chrome extension, page integration, SDK publishing
3. Continuously expand real sample library targeting complex backgrounds and slightly-scaled exports
4. Multi-platform deployment: Web, CLI, Python, browser extension, Docker
5. Automatic catalog discovery: Scan for unknown watermark patterns on new AI platforms

## Verification Commands

```bash
pnpm lint                  # 0 errors
pnpm test                  # core test suite (417 tests)
pnpm build                 # production build
```
