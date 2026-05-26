# Gemini Watermark Remover — Roadmap

## Current Status

- **Version**: v2.2.2
- **Verification baseline**: 524 tests passing, 0 failure in core suite
- **Architecture**: Five-phase detection pipeline (Catalog → Scaled → Heuristic → Adaptive → Global) + decision policy + shared removal + worker pool
- **Test suite**: 56 test files (optimized, duplicates removed)

## Completed (v2.2.2 — Watermark Detection Recall Fix)

### Root Cause: Alpha Map Formula Regression
- **BUG-001** [CRITICAL]: Fixed `alphaMap.js` — changed from BT.709 luminance `(0.2126*R + 0.7152*G + 0.0722*B)` to upstream-aligned max-channel `Math.max(R, G, B)` for alpha map computation. This was the primary cause of "obvious watermarks not detected" — BT.709 systematically undervalued anti-aliased edge pixels, reducing NCC detection scores by 20-40%.
- **BUG-002** [HIGH]: Added `ALPHA_NOISE_FLOOR = 3/255` to `blendModes.js` with signal/activation split — upstream alignment
- **BUG-003** [HIGH]: Tuned `gradientPenalty` threshold from 0.05 to 0.02 with penalty cap at 0.50 in `detector.js`
- **BUG-004** [MEDIUM]: Extended heuristic search range from 45% to 55%
- **BUG-005** [HIGH]: Relaxed `isNearExpectedAnchor` position tolerance from 5% to 10%
- **BUG-006** [MEDIUM]: Extended adaptive detector to support doubao profile (removed gemini-only restriction)
- **BUG-007** [MEDIUM]: Fixed `calculateNearBlackRatio` from BT.709 luminance check to per-channel `r<=5 && g<=5 && b<=5` (upstream alignment)
- **BUG-008** [LOW]: Added bounds check to `regionStdDev` for negative coordinates
- **BUG-009** [MEDIUM]: Fixed CLI batch processing — `applyRemovalStrategy` called once with all matches
- **BUG-010** [MEDIUM]: Added `first-pass-sign-flip` detection in `multiPassRemoval.js`
- **BUG-011** [MEDIUM]: Fixed `catalog.js` browser compatibility — runtime Node.js detection with graceful degradation

### Test Suite Optimization
- Merged 7 duplicate test files into parent files (61 → 56 files)
- Added 6 new test files with 66 test cases (alpha map formula, noise floor, gradient penalty, NCC scoring, detection recall, CLI batch)
- Updated 5 existing tests to align with new formula
- **Total: 158/158 core tests passing**

### Documentation
- Created `DIAGNOSTIC_PLAN.md` — comprehensive architecture analysis, upstream comparison, bug inventory, fix plan
- Updated `TECHNICAL_GUIDE.md` — corrected alpha map formula documentation, added precision guidance

## Short-term Plans (v2.3)

1. **96-20260520 variant support**: Add newer Gemini watermark template variant for updated watermark margins
2. **Extended candidate selection**: Research and integrate upstream `candidateSelector.js` logic for more robust multi-trial evaluation
3. **Preview edge cleanup**: Implement halo detection and edge refinement from upstream `watermarkProcessor.js`
4. **Embedded alpha maps**: Replace PNG file loading with base64-embedded alpha maps to eliminate I/O/encoding variability
5. **Extend multi-pass removal + alpha calibration** to doubao and other non-gemini profiles
6. **WASM acceleration** for NCC and Sobel gradient computation
7. **Complete CLI pipe mode** end-to-end integration tests
8. **True SSIM calculation** replacing PSNR estimation

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
pnpm test                  # Run full test suite
pnpm build                 # clean (static Tailwind CSS)
pnpm test:python           # Python bridge
```
