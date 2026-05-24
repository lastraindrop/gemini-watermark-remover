# Gemini Watermark Remover — Roadmap

## Current Status

- **Version**: v2.2.1
- **Verification baseline**: 523/523 tests passing, 0 eslint errors, clean build (static Tailwind CSS, zero CDN)
- **Architecture**: Five-phase detection pipeline (Catalog → Scaled → Heuristic → Adaptive → Global) + decision policy + shared removal + worker pool
- **Test suite**: 61 test files, 100 suites, optimized for coverage and maintainability

## Completed (v2.2.1)

### Architecture & Code Quality
- **Phase A**: Fixed hardcoded Chinese error message, extracted shared removal logic (`applyRemoval.js`), fixed `getScaledCatalogConfigs` for rectangular watermarks
- **Phase B**: 58 new tests across 8 test suites (rectangular, worker protocol, security, cross-module, numerical precision, profile system, CLI, concurrency)
- **Phase C**:
  - `DetectorContext` class encapsulating memory-pooled buffers (`_blurBuffer`, `_sharedGradientsI/A`)
  - Catalog data externalized to `catalogs.json` (10.7KB)
  - Complete TypeScript definitions (`sdk/index.d.ts`) covering all 36+ exports
- **Phase D**:
  - Worker pool (`workerPool.js`) enabling parallel pixel restoration across workers
  - Lazy catalog loading — per-profile on-demand catalog data loading
- **Test suite optimization**: Merged 3 duplicated files, eliminated hardcoded catalog values, added gap coverage
- **Frontend fixes**: Hardcoded English strings → i18n, `resetWorkspace` consolidation, `objectUrlManager` DOM decoupling, keyboard shortcuts visual indicator

### Detection & Removal Engine
- Five-phase pipeline with 3D scoring
- Adaptive coarse-to-fine multi-scale search
- Multi-pass removal with near-black/texture safety gates
- Alpha gain calibration (14 coarse + fine tuning) for rectangular watermarks
- Subpixel refinement (27 combination search)
- Decision policy: three-tier classification (direct-match / needs-validation / insufficient)
- Dynamic config overrides (threshold sliders, penalty, jitter range)

### Code Quality & Architecture (Sprint 1-4)
- Extracted shared utilities to `core/utils.js`
- Split `app.js` (730 lines → entry point + 9 sub-modules)
- CLI Engine: multi-pass removal + alpha calibration path
- Frontend: static Tailwind CSS build (zero CDN), system font stack
- Frontend: global drag overlay, error handling, loading overlay safety
- All threshold values unified to configurable defaults

### Test System
- 523 total tests across 100 suites (expanded from 475)
- Full architecture coverage: core algorithms, pipeline, engine, CLI, SDK, integration, UI
- Security/adversarial input validation
- DetectorContext isolation, lazy catalog loading verification

### Bug Fixes Summary (v2.1–v2.2.1)
| ID | Description | Status |
|----|-------------|--------|
| #2 | Worker/main-thread removal logic duplication | Fixed — `applyRemoval.js` |
| #3 | `getScaledCatalogConfigs` square-only | Fixed — rectangular support |
| #5 | Hardcoded Chinese error message | Fixed — i18n integration |
| BUG-1 | `removeWatermark()` missing alphaGain | Fixed |
| BUG-2 | alphaCalibration square-only | Fixed |
| BUG-4 | CLI Engine missing multi-pass removal | Fixed |
| BUG-6 | gradientDelta hardcoded to 0 | Fixed |
| BUG-7 | app.js overrides not passed | Fixed |
| Frontend #1 | 3 hardcoded English strings | Fixed — i18n keys |
| Frontend #2 | `resetWorkspace` duplication | Consolidated |
| Frontend #3 | `objectUrlManager` DOM coupling | Decoupled |
| Frontend #4 | Missing keyboard shortcut hints | Added to UI |

## Short-term Plans (v2.3)

1. Extend multi-pass removal + alpha calibration to doubao and other non-gemini profiles
2. Implement edge residual cleanup (blend-based, anchor-preview specific)
3. WASM acceleration for NCC and Sobel gradient computation
4. Complete CLI pipe mode end-to-end integration tests
5. Implement true SSIM calculation replacing PSNR estimation
6. Enhance userscript (preview replacement, copy/download interception)

## Mid-term Plans

1. Frequency-domain false positive defense (spectral analysis)
2. Prepare real alphaMap assets for DALL-E 3 profile
3. Unify Web/CLI Engine: abstract `AssetLoader` interface
4. Adaptive auto-tuning: image entropy-based detection threshold adjustment
5. Chrome extension implementation

## Long-term Plans

1. Maintain verifiable, explainable, pure-mathematical watermark removal benchmark
2. Productization: Chrome extension, page integration, SDK publishing
3. Continuously expand real sample library targeting complex backgrounds and slightly-scaled exports

## Verification Commands

```bash
pnpm lint                  # 0 errors, 0 warnings
pnpm test                  # 523/523 passing
pnpm build                 # clean (static Tailwind CSS)
pnpm test:python           # Python bridge
```
