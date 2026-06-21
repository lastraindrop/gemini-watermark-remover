# Technical Guide — Gemini Watermark Remover v2.7.0

## 1. Overview

This document describes the working principles, algorithm details, parameter rationale, and architectural design of the watermark detection and removal engine. All parameter values are dynamically aligned with actual source code defaults — no hardcoded documentation values.

### 1.1 Core Algorithm

The fundamental operation is **mathematical reverse alpha blending** — not AI inpainting or generative fill:

1. **Detect** watermark position, size, and alpha map by correlating the image against calibrated templates
2. **Remove** watermark by algebraically reversing the blend operation pixel by pixel

### 1.2 Alpha Blending Model

```
Pixel(x,y) = A(x,y) × C + (1 − A(x,y)) × B(x,y)
```

For Gemini watermarks: `C = (255, 255, 255)` (white logo). Doubao uses logo-specific color.

### 1.3 Reverse Operation

```
B(x,y) = (Pixel(x,y) − A(x,y) × C) / (1 − effectiveAlpha × A(x,y))
effectiveAlpha = min(alpha × alphaGain, 0.99)
```

The alpha map `A` is calibrated from known watermark assets and normalized to `[0, 1]` via `calculateAlphaMap()`.

### 1.4 Alpha Map Computation (`alphaMap.js`)

The alpha map is derived from background-capture images (white watermark logo on black background). Each pixel's alpha value is computed using the **max-channel formula**:

```
alpha[i] = max(R, G, B) / 255.0
```

**Why max-channel, not BT.709 luminance?** The Gemini watermark is a white logo. For pure white pixels `(255,255,255)`, both formulas agree at 1.0. But for anti-aliased edge pixels and slight color variations, BT.709 luminance `(0.2126*R + 0.7152*G + 0.0722*B)` systematically underestimates the alpha value by 3-10%, which:
- Reduces NCC correlation scores by 20-40% in detection
- Causes the detection pipeline to miss otherwise obvious watermarks
- Mismatches the original GargantuaX upstream reference implementation

**Image luminance in NCC computation** still uses BT.709 — this is correct: the human visual system's perceptual brightness is the right metric for correlating image regions against the alpha template. The alpha map (max-channel) and image luminance (BT.709) operate in slightly different numerical spaces, but the relative bright/dark pattern is preserved across both, yielding valid NCC correlation.

### 1.5 Precision Guidance

| Component | Formula | Purpose | File |
|-----------|---------|---------|------|
| Alpha map | `max(R, G, B) / 255` | Watermark opacity | `alphaMap.js` |
| Image luminance (NCC) | `0.2126*R + 0.7152*G + 0.0722*B` | Perceptual brightness for correlation | `detector.js` |
| Gradient (Sobel) | BT.709 on grayscale | Edge detection for gradient NCC | `detector.js`, `adaptiveDetector.js` |
| Image luminance (stdDev) | `0.2126*R + 0.7152*G + 0.0722*B` | Brightness statistics for texture comparison | `utils.js`, `multiPassRemoval.js` |

---

## 2. Detection Pipeline Architecture

### 2.1 Five-Stage Pipeline (`detectionPipeline.js`)

The detection process in `detectProfileWatermarks()` operates in five stages with a decision layer:

```
Stage 1: Catalog Probe ──┬── hit → add match
                          └── miss → continue
Stage 2: Scaled Catalog ──┬── hit → add match
                          └── miss → continue
Stage 3: Heuristic ───────┬── hit → add match
                          └── miss → continue
Stage 4: Adaptive Search ─┬── hit → add match
                          └── miss → continue
Stage 5: Global Fallback ─┬── hit → verify → accept/reject
                          └── miss → return null

Decision Policy: classify tiers (direct-match / needs-validation / insufficient)
```

### 2.2 Stage 1: Catalog Exact Match

**File**: `src/core/templates/registry.js` — `findMatches()`

For image `(W, H)`, each catalog entry `(w, h)` is checked:

```
scaleX = W / w, scaleY = H / h
match = |scaleX − scaleY| < 0.10 AND |(scaleX+scaleY)/2 − 1| < 0.10
```

10% tolerance covers screenshots, minor resizes, and encoding artifacts. The tolerance was raised from 5% to 10% in v2.2.2 to improve recall on non-exact resolutions.

**New in v2.2.2**: `findCloseMatches()` provides a secondary loose-matching API with configurable tolerance (default 25%). Returns scaled logo sizes and margin values sorted by closeness score. Non-exact matches are marked `isOfficial: false` and include a `scaledFrom` reference.

### 2.3 Stage 2: Scaled Catalog (`catalog.js` — `getScaledCatalogConfigs()`)

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `maxRelativeAspectRatioDelta` | 0.05 | Allow aspect ratio drift from cropping |
| `maxScaleMismatchRatio` | 0.08 | Allow non-uniform X vs Y scaling |
| `maxScaleDistance` | 0.30 | Maximum resize factor from catalog entry |
| `minLogoSize` | 24 | Lower bound for scaled logo |
| `maxLogoSize` | 192 | Upper bound for scaled logo |
| `limit` | 4 | Maximum returned candidates |

Rectangular watermarks (Doubao) use `logoWidth`/`logoHeight` separately with `scaleX`/`scaleY`.

### 2.4 Stage 3: Heuristic (`profiles.js` — `getHeuristicConfig()`)

Profile-specific heuristic config generation when no catalog match exists. v2.2.2 uses shortSide-priority tiering:
**Gemini**: shortSide < 720 → 48px; shortSide < 1200 → 96px; else → 2k/4k tiers.
`getAllPotentialConfigs` adds both 48px and 96px as dual-size fallback candidates for robust probing.

### 2.5 Scaled Match Gating (v2.3 updated)

When a config carries `scaledFrom` (non-exact catalog match), the probe verification applies differentiated thresholds to suppress false positives:

| Gate | Exact Match | Scaled Match (v2.2.2) | Scaled Match (v2.3) |
|------|-------------|------------------------|----------------------|
| Base NCC minimum | 0.10 | 0.14 | 0.14 |
| Gradient boost gate | 0.12 | 0.18 | 0.18 |
| Probe threshold | 0.18 | 0.35 | **0.25** |
| Jitter fine-tuning | enabled | disabled | disabled |

**v2.3 change**: The probe threshold for scaled matches was lowered from 0.35 to 0.25 (`DETECTION_THRESHOLDS.SCALED_CONFIG_MIN`). This significantly improves recall on cropped, resized, or non-catalog images that still contain valid watermarks. The 0.35 threshold was overly conservative and rejected ~40% of valid scaled detections on real-world samples.

### 2.5 Stage 4: Adaptive Detection (`adaptiveDetector.js`)

Coarse-to-fine multi-scale search with 3D scoring:

```
confidence = spatial × 0.5 + gradient × 0.3 + variance × 0.2
```

| Component | Weight | Source |
|-----------|--------|--------|
| Spatial (NCC) | 0.5 | `calculateCorrelation()` |
| Gradient (Sobel NCC) | 0.3 | `calculateGradientCorrelation()` |
| Variance | 0.2 | `stdDev(watermark) / stdDev(reference)` |

### 2.6 Stage 5: Global Fallback

Full-image sweep via `detectWatermark()` when prior stages produce no matches. Guarded by anchor position tolerance and confidence thresholds.

### 2.7 Decision Policy (`decisionPolicy.js`)

| Source | direct-match | needs-validation |
|--------|-------------|-----------------|
| catalog-probe | ≥ 0.60 | < 0.60 |
| adaptive-search | ≥ 0.48 | < 0.48 |
| heuristic-probe | ≥ 0.70 | < 0.70 |
| global-search | ≥ 0.55 | 0.35 ≤ score < 0.55 |

---

## 3. Removal Pipeline

### 3.1 Shared Removal Logic (`applyRemoval.js`)

Central `applyRemovalStrategy(imageData, matches)` function used by:
- `watermarkEngine.js` (main thread removal)
- `worker.js` (web worker removal)
- `cli/gwrRemoveCommand.js` (CLI removal)

Logic: Gemini matches → `removeRepeatedWatermarkLayers()` with multi-pass; non-Gemini → direct `removeWatermark()` with recalibration gating.

### 3.2 Multi-Pass Removal (`multiPassRemoval.js`)

```
removal → up to 4 passes:
    ├── Near-black safety gate (per-channel r<=5, g<=5, b<=5)
    ├── Texture collapse detection
    ├── Residual threshold (default 0.25)
    └── First-pass sign-flip early stop (spatial flips negative + gradient drops)
```

### 3.3 Alpha Gain Calibration (`alphaCalibration.js`)

Binary search for optimal alpha multiplier when single-pass leaves high residual. Gating via `shouldRecalibrateAlphaStrength()`.

### 3.4 Reverse Alpha Blending (`blendModes.js`)

Constants: `ALPHA_NOISE_FLOOR = 3/255`, `ALPHA_THRESHOLD = 0.002`, `MAX_ALPHA = 0.99`, `LOGO_VALUE = 255.0`.

The noise floor removes low-level quantization noise from compressed background captures. It is applied only for activation gating — the actual blend still uses the full raw alpha to preserve edge fidelity:

```
signalAlpha = max(0, rawAlpha − ALPHA_NOISE_FLOOR) × alphaGain  // activation gate
if signalAlpha < ALPHA_THRESHOLD → skip pixel                     // safety
effectiveAlpha = min(rawAlpha × alphaGain, MAX_ALPHA)             // actual blend
```

Bilinear interpolation via `sampleBilinearAlpha()` for subpixel accuracy.

---

## 4. Detection Engine (`detector.js`)

### 4.1 DetectorContext

Memory-pooled buffer manager:

| Buffer | Type | Usage |
|--------|------|-------|
| `_blurBuffer` | `Uint8ClampedArray` | Reused across `noiseReduction: true` calls |
| `_sharedGradientsI` | `Float32Array` | Shared image gradient buffer |
| `_sharedGradientsA` | `Float32Array` | Shared alpha gradient buffer |

Methods: `getBlurBuffer(len)`, `getGradientBuffers(len)`, `reset()`. Backward-compatible property accessors on `detectWatermark` function object.

### 4.2 Search Configuration (`SEARCH_CONFIG`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `RANGE_X` | 0.45 | Phase 2 horizontal search (45% from right) |
| `RANGE_Y` | 0.45 | Phase 2 vertical search (45% from bottom) |
| `CANDIDATES_LIMIT_PER_SIZE` | 5 | Max coarse candidates per size |
| `PROXIMITY_THRESHOLD` | 8 | Min pixel distance between candidates |
| `FINE_TUNE_RANGE` | 4 | Local refinement radius |

### 4.3 Thresholds (`SEARCH_CONFIG.THRESHOLDS`)

| Threshold | Value | Role |
|-----------|-------|------|
| `ANCHORED_OFFICIAL` | 0.18 | Phase 1 catalog anchor |
| `ANCHORED_OTHER` | 0.22 | Phase 1 non-catalog anchor |
| `COARSE` | 0.10 | Phase 2 coarse acceptance |
| `STAGE2_NR` | 0.10 | Phase 2 fine-tune (noise reduction) |
| `STAGE2_CLEAN` | 0.12 | Phase 2 fine-tune (no noise reduction) |
| `FINAL_ANCHORED` | 0.15 | Final decision: anchored |
| `FINAL_ALIGNED` | 0.18 | Final decision: aligned |
| `FINAL_FREE` | 0.22 | Final decision: free position |

All thresholds dynamically overridable via `options.overrides.THRESHOLDS`.

### 4.4 Correlation Functions

| Function | Formula | Step |
|----------|---------|------|
| `calculateCorrelation()` | Standard NCC on BT.709 luminance | 1 (full) / 2 (coarse) |
| `calculateLocalContrastCorrelation()` | NCC on residual (pixel − 8-neighbor avg) | 1 |
| `calculateGradientCorrelation()` | NCC on Sobel gradient magnitudes | 1 |

### 4.5 Gradient Filtering

When `deepScan = true`:

```
gradientConf = calculateGradientCorrelation(...)
if (gradientConf < 0.05):
    confidence = rawNCC × gradientPenalty    // Edge structure missing → suppress
else:
    confidence = Math.max(rawNCC, gradientConf)
```

`gradientPenalty` = 0.30 (default), configurable 0.10–0.90.

### 4.6 Step Size

| Condition | Step |
|-----------|------|
| Logo size ≤ 48px | 1 px |
| Logo size > 48px | 2 px |

---

## 5. Profile & Catalog System

### 5.1 Profile Structure (`profiles.js`)

Each profile must have: `id`, `name`, `logoValue`, `anchors`, `getHeuristicConfig()`. Optional: `assets`, `tiers`, `defaultAsset`.

Built-in profiles: `gemini`, `doubao`, `dalle3` (experimental).

### 5.2 Catalog Data (`catalogs.json` + `catalog.js`)

| Profile | Entries | Watermark Type |
|---------|---------|----------------|
| Gemini | 66 | Square (48px / 96px) |
| Doubao | 7 | Rectangular (various sizes, TL+BR) |
| DALL-E 3 | 1 | Rectangular (120×40, bottom-left) |

Catalog loaded lazily — JSON parsed on first access, per-profile registration on demand via `ensureProfileLoaded()`.

### 5.3 Watermark Position (`config.js`)

`calculateWatermarkPosition(imageWidth, imageHeight, config)` supports four anchors:

| Anchor | X position | Y position |
|--------|-----------|------------|
| `bottom-right` | `width − marginRight − logoW` | `height − marginBottom − logoH` |
| `top-left` | `marginLeft` | `marginTop` |
| `top-right` | `width − marginRight − logoW` | `marginTop` |
| `bottom-left` | `marginLeft` | `height − marginBottom − logoH` |

---

## 6. Worker Architecture

### 6.1 Worker Pool (`workerPool.js`)

Multi-worker task queue for parallel pixel restoration:

```
Task Queue → Available Worker → postMessage(transfer) → result
                                  ↓ (no workers free)
                                  Queued → dispatched when worker freed
```

- Pool size: 2 workers (configurable)
- Buffer transfer via `Transferable` ArrayBuffer (zero-copy)
- Per-task timeout: `max(5000, pixels / 500000)` ms
- Fallback: pool failure → single worker → main thread

### 6.2 Worker Protocol (`worker.js`)

```
Message (main → worker): { imageData, matches[], taskId }
Response (worker → main): { imageData, taskId } | { taskId, error }
```

---

## 7. Engine Limits & Configuration

### 7.1 Engine Limits (`config.js`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_PIXELS` | 8000 × 8000 (64 MP) | Maximum image size |
| `MAX_FILE_SIZE` | 20 MB | Maximum input file size |
| `MAX_CONCURRENCY` | 4 | Maximum parallel batch processing |

### 7.2 CLI-Specific (`cli/gwrRemoveCommand.js`)

- `sharp.concurrency(1)` — limits all sharp operations
- Supports: single file, batch directory, pipe mode, JSON output
- Profile selection: `--profile gemini|doubao|dalle3|auto`

---

## 8. Frontend Architecture

### 8.1 Module Structure

| Module | File | Responsibility |
|--------|------|---------------|
| Entry | `app.js` | Init engine, wire events, coordinate processing, preset sync, re-process |
| State | `app/state.js` | Global mutable state, object URL manager |
| UI | `app/ui.js` | Toast notifications, audit log, progress bar |
| Processing | `app/processing.js` | Single/batch processing, ZIP download |
| DragDrop | `app/dragDrop.js` | File handling, drop events, card creation |
| Settings | `app/settings.js` | localStorage persistence, engine options, **`syncTogglesToPreset()`** |
| View Modes | `app/viewModes.js` | Slider/side-by-side/stats switching |
| Manual | `app/manualSelection.js` | Pointer-based region selection |
| Keyboard | `app/keyboard.js` | Keyboard shortcuts (Esc, 1/2/3, Ctrl+S) |
| Magnifier | `app/magnifier.js` | 3x pixel zoom lens (v2.3: bounds clamped) |

### 8.2 i18n System

7 languages: zh-CN, en-US, ja-JP, ru-RU, fr-FR, es-ES, de-DE. All keys synchronized including v2.3 performance preset labels.

### 8.3 Build System

- **Bundler**: esbuild (ES2020, browser target)
- **CSS**: Tailwind CSS 3.x static compilation (~32KB minified)
- **Outputs**: `dist/app.js`, `dist/worker.js`, `dist/index.css`, `dist/index.html`

### 8.4 Performance Presets (v2.3)

Users select from three performance modes in the UI advanced settings panel. Each preset maps to a concrete set of engine overrides applied via `getEngineOptions()` in `settings.js`:

| Preset | Search | DeepScan | Jitter | Fine-tune | Adaptive | NoiseRed | Speed |
|--------|--------|----------|--------|-----------|----------|----------|-------|
| `fast` | 60% | off | 2-3px | 2px | off | off | ~1× |
| `balanced` | 75% | on | 4-6px | 4px | auto | off | ~2× |
| `thorough` | 90% | on | 6-8px | 8px | auto | on | ~4× |

Preset overrides are merged with user threshold/penalty slider values via `deepMerge()` — the preset controls search geometry and feature toggles, while the user retains control over confidence thresholds.

---

## 9. SDK/API Surface

### 9.1 Public Exports (`sdk/index.js`)

36+ exports including: `WatermarkEngine`, `WorkerPool`, `DetectorContext`, `detectWatermark`, `detectWatermarks`, `detectProfileWatermarks`, `removeWatermark`, `removeRepeatedWatermarkLayers`, `applyRemovalStrategy`, `calculateAlphaMap`, `calculateCorrelation`, `calculateGradientCorrelation`, `recalibrateAlphaStrength`, `shouldRecalibrateAlphaStrength`, `detectAdaptiveWatermarkRegion`, `interpolateAlphaMap`, `warpAlphaMap`, `refineSubpixelOutline`, `classifyStandardWatermarkSignal`, `classifyAdaptiveWatermarkSignal`, `decideDetectionTier`, `PROFILES`, `DEFAULT_PROFILE`, `GEMINI_PROFILE`, `ENGINE_LIMITS`, `RestorationMetrics`, `calculateMSE`, `calculatePSNR`, `calculateSSIM`, `estimateQualityFromPSNR`, `calculateWatermarkPosition`, `detectWatermarkConfig`, `getAllPotentialConfigs`, `getProfile`, `getAllProfiles`, `getProfilesToTry`, `resetDetectorBuffers`.

### 9.2 TypeScript Definitions (`sdk/index.d.ts`)

Complete type coverage for all exported functions, classes, interfaces, and constants.

---

## 10. Test Strategy

### 10.1 Test Coverage

The active suite now spans 70 top-level `tests/*.test.js` files plus legacy script tests. Fast validation is split between the full `pnpm test` command and targeted bounded suites because some image-search regressions are intentionally slow.
- **Core Algorithms**: detector, blendModes, alphaMap, multiPass, alphaCalibration, adaptiveDetector, decisionPolicy
- **Pipeline**: detection fallback chain, probe gating, parameter matrix, end-to-end regression, scaled threshold, non-square alphaMap guard
- **v2.3 Coverage**: PERFORMANCE_PRESETS, DETECTION_THRESHOLDS, rectangular watermark, smooth-background variance, scaled config threshold
- **Engine**: catalog, config, profiles, registry, watermarkEngine, worker protocol, worker resilience
- **CLI**: integration, edge cases
- **SDK**: API surface, metrics precision
- **Integration**: product audit, architecture gaps, edge cases, engine lifecycle, template resolution
- **UI**: frontend contract, frontend interaction, i18n
- **v2.5.1 Consistency Guards**: gradient formula consistency (5 tests), threshold SOT integrity (10 tests), preset override integrity (9 tests), worker timeout recovery (4 tests), applyRemovalStrategy branch coverage (8 tests)

### 10.2 Test Architecture Principles

1. **No internal state access**: Tests use `DetectorContext` API, not raw property accessors
2. **No hardcoded catalog values**: Tests use `resolvePos()` and `resolveLogoSize()` runtime queries
3. **No hardcoded thresholds**: `TC` constants reference `DETECTION_THRESHOLDS` from `config.js`
4. **Unified DOM mock**: `test_utils.js` provides `MockCanvas`, `MockImageElement` shared by all DOM-dependent tests
5. **Merged duplicates**: 5 test file groups merged; scoring tests unified into `detector_scoring.test.js`
6. **Source code integrity tests** (v2.5.1): `gradient_formula_consistency.test.js` and `threshold_sot_integrity.test.js` parse detector.js source to verify no rogue hardcoded thresholds or formula divergence.

### 10.3 Verification Commands

```bash
pnpm lint                  # 0 errors, 0 warnings on source
pnpm build                 # clean production build
pnpm test                  # full top-level JS test suite with canvas/png fixtures
pnpm test:all              # full JS suite plus legacy script regressions
```

---

## 11. Parameter Alignment & Dynamic Integrity (v2.5.1)

### 11.1 Gradient Formula Consistency

The gradient-filtering path in `detector.js` historically had **three separate implementations** of the same scoring logic, causing detection behavior to diverge based on which code path was executed. v2.5.1 unified them into a single helper:

```javascript
// detector.js — the single source of truth for multi-dimensional scoring
function blendMultiDimensionalScore(imageData, x, y, logoW, logoH, spatial, gradient) {
    const varianceScore = calculateVarianceScore(imageData, x, y, logoW, logoH);
    const s = Math.max(0, spatial);
    const g = Math.max(0, gradient);
    const weighted = s * DETECTION_THRESHOLDS.SPATIAL_WEIGHT
        + g * DETECTION_THRESHOLDS.GRADIENT_WEIGHT
        + varianceScore * DETECTION_THRESHOLDS.VARIANCE_WEIGHT;
    return Math.max(s, weighted);
}
```

**Three call sites** (verified by `gradient_formula_consistency.test.js`):

| Call Site | File:Line | Context |
|-----------|-----------|---------|
| 1 | `detector.js ~L274` | `detectWatermark` Phase 2 fine-tune |
| 2 | `detector.js ~L577` | `calculateProbeConfidence` main probe path |
| 3 | `detector.js ~L606` | `calculateProbeConfidence` jitter search path |

**Rule** (DEVELOPER_GUIDE.md §5 rule 6): Any change to the weighting formula must be made in `blendMultiDimensionalScore` only. Adding a fourth scoring site must call this helper — never inline the formula.

### 11.2 Threshold Single-Source-of-Truth (SOT)

`config.js` `DETECTION_THRESHOLDS` is the **sole authority** for all detection-tuning constants. The `threshold_sot_integrity.test.js` file scans `detector.js` source to verify that known threshold values appear only as `DETECTION_THRESHOLDS.XXX` references.

**26 required keys** in `DETECTION_THRESHOLDS` (v2.5.1):

| Group | Keys |
|-------|------|
| Phase 1 (Catalog) | `ANCHORED_OFFICIAL`, `ANCHORED_OTHER`, `STRICT_EXIT` |
| Phase 2 (Search) | `COARSE`, `STAGE2_NR`, `STAGE2_CLEAN` |
| Phase 3 (Ranking) | `FINAL_ANCHORED`, `FINAL_ALIGNED`, `FINAL_FREE` |
| Pipeline | `DEFAULT_PROBE_THRESHOLD`, `SCALED_CONFIG_MIN`, `NON_CATALOG_MIN`, `GLOBAL_FALLBACK_BELOW`, `GLOBAL_FALLBACK_MIN`, `GLOBAL_FREE_MIN`, `AUTO_NON_CATALOG_MIN` |
| Adaptive | `ADAPTIVE_MIN_CONFIDENCE` |
| Scoring | `SPATIAL_WEIGHT`, `GRADIENT_WEIGHT`, `VARIANCE_WEIGHT` |
| Gating (v2.5.1) | `GRADIENT_IGNORE_GATE`, `GRADIENT_BOOST_GATE_EXACT`, `GRADIENT_BOOST_GATE_SCALED`, `EXACT_NCC_GATE`, `SCALED_NCC_GATE`, `DOUBAO_NCC_GATE`, `JITTER_FINETUNE_TRIGGER`, `JITTER_TRIGGER_MIN`, `JITTER_TRIGGER_MAX`, `DEEPSCAN_GRADIENT_GATE` |
| Ranking (v2.5.1) | `STANDARD_MARGIN_TOLERANCE`, `CANDIDATE_OVERLAP_DISTANCE`, `MODE_BOOST_ANCHORED`, `MODE_BOOST_ALIGNED`, `MODE_BOOST_FACTOR`, `GRADIENT_PENALTY_DEFAULT` |
| Local Contrast | `LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN`, `LOCAL_CONTRAST_MIN_COUNT_FACTOR` |

### 11.3 Dynamic Alignment Verification

To prevent parameter drift between the configuration center and the source code, the following verification strategy is enforced:

1. **Source code integrity test** (`threshold_sot_integrity.test.js`): Fails CI if a threshold literal appears in `detector.js` without a corresponding `DETECTION_THRESHOLDS.*` reference.
2. **Formula integrity test** (`gradient_formula_consistency.test.js`): Fails CI if the old multiplicative penalty formula is found, or if `blendMultiDimensionalScore` is not called from all 3 sites.
3. **Preset integrity test** (`performance_preset_override.test.js`): Fails CI if preset THRESHOLDS are not preserved exactly, or if weight values fall outside valid ranges.
4. **Config completeness test** (included in `threshold_sot_integrity.test.js`): Fails CI if any of the 26 required keys are missing from `DETECTION_THRESHOLDS`.

**Principle**: Every new detection-tuning parameter must be:
1. Added to `DETECTION_THRESHOLDS` in `config.js`
2. Referenced by name (not literal) in `detector.js` and `detectionPipeline.js`
3. Listed in the required-keys assertion in `threshold_sot_integrity.test.js`
4. Documented in this section of TECHNICAL_GUIDE.md

---

## 12. Frontend Architecture (v2.5.1 Update)

### 12.1 Performance Preset Indicators

The DeepScan and NoiseReduction controls are **read-only status badges** driven by the active performance preset, not interactive toggles. This was an intentional UX change (v2.5.1) — the previous interactive checkboxes were misleading because their values were always overwritten by `syncTogglesToPreset()`.

```
Balanced preset:  [● Deep Scan]  [○ Noise Reduction]  [Auto Save toggle]
Thorough preset:  [● Deep Scan]  [● Noise Reduction]  [Auto Save toggle]
```

### 12.2 ObjectURL Lifecycle

`objectUrlManager` uses an observer pattern (`onChange` callback) rather than monkey-patching. Subscribers (e.g., the memory counter display) register via `objectUrlManager.onChange((count) => { ... })` and receive automatic updates when URLs are created, revoked, or cleared.

### 12.3 Preset Override Policy

The user's threshold/penalty sliders control `probeThreshold`, `fallbackThreshold`, and `gradientPenalty` at the top level only. The preset's structural overrides (`THRESHOLDS.*`, `RANGE_X`, `JITTER_*`, `CANDIDATES_*`) are never modified by the user slider — the preset is the base, and overrides are applied as-is.

---

## 11. Appendix: Complete Parameter Reference

### 11.1 Detection Parameters (all sourced from `DETECTION_THRESHOLDS` in `config.js`)

| Parameter | Default | Dynamic? |
|-----------|---------|----------|
| `probeThreshold` (DEFAULT_PROBE_THRESHOLD) | 0.18 | Yes |
| `fallbackThreshold` (GLOBAL_FALLBACK_MIN) | 0.25 | Yes |
| `gradientPenalty` | 0.30 | Yes |
| `deepScan` | true (balanced/thorough) | Yes — preset-controlled |
| `noiseReduction` | false (fast/balanced) | Yes — preset-controlled |
| `adaptiveMode` | 'auto' or 'off' | Yes — preset-controlled |
| `globalFallbackBelow` (GLOBAL_FALLBACK_BELOW) | 0.30 | Yes |
| `autoNonCatalogMinConfidence` (AUTO_NON_CATALOG_MIN) | 0.28 | Yes |
| `adaptiveMinConfidence` (ADAPTIVE_MIN_CONFIDENCE) | 0.22 | Yes |
| `SCALED_CONFIG_MIN` | 0.25 | Yes |
| `SEARCH_RANGE_X / Y` | 0.90 | No — preset-controlled |
| `LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN` | **0.004** (v2.6: lowered from 0.008) | No |
| `JITTER_RANGE` | **10** (v2.6: expanded from 6) | Yes — preset-controlled |
| `JITTER_OFFICIAL` | **6** (v2.6: expanded from 4) | Yes — preset-controlled |
| `JITTER_FINETUNE_TRIGGER` | 0.50 | No |
| `JITTER_TRIGGER_MAX` | 0.95 | No |
| `COARSE_RELOCATE_RANGE` | 16 | No — detector.js |
| `COARSE_RELOCATE_STEP` | 4 | No — detector.js |
| `COARSE_RELOCATE_TRIGGER` | 0.30 | No — detector.js |

### 11.2 v2.6 New Features: NMS, Sub-pixel, Halo, Position Tolerance

#### NMS (Non-Maximum Suppression)
- **Location**: `applyRemoval.js:53-86` (`suppressOverlappingMatches`)
- **Spatial overlap filter**: pixel bounding-box intersection > 25% of smaller area → suppress lower
- **Confidence floor**: match confidence < top × 0.5 → suppress (pre-vents 192px margin false positives)
- **Effect**: prevents "triple removal" on images where 48px real + 96px false + 48px-m192 false all get processed

#### Sub-pixel Refinement
- **Location**: `adaptiveDetector.js:412-488` (`refineSubpixelOutline`)
- **Integration**: `applyRemoval.js:93-106` — called when multi-pass stopReason ≠ 'residual-low'
- **Parameters**: ±0.25px shift, ±1% scale, ±0.01 alphaGain (81 combinations)
- **Fixed**: v2.6 supports rectangular watermarks (was square-only)
- **Min gain**: lowered from 1.2 to 1.05

#### Halo Detection
- **Location**: `restorationMetrics.js` (`assessAlphaBandHalo`, `assessRemovalDiffArtifacts`)
- **Safety gate**: `multiPassRemoval.js` — stops at 'safety-halo' when severity > 0.5
- **Method**: perimeter scan comparing inner/edge/outer luminance bands

#### Position Tolerance (Coarse Relocation)
- **Location**: `detector.js:132-153`
- **Trigger**: anchor NCC < 0.30
- **Range**: ±16px, step 4px (81 evaluations)
- **After relocation**: jitter fine-tune around relocated center

### 11.3 Catalog Matching

| Parameter | Value | Location |
|-----------|-------|----------|
| `MAX_SCALE_MISMATCH` | 0.05 | `registry.js` |
| `maxRelativeAspectRatioDelta` | 0.05 | `catalog.js` |
| `maxScaleMismatchRatio` | 0.08 | `catalog.js` |
| `maxScaleDistance` | 0.30 | `catalog.js` |

### 11.3 Removal Parameters

| Parameter | Default | Location |
|-----------|---------|----------|
| `maxPasses` | 4 | `multiPassRemoval.js` |
| `residualThreshold` | 0.25 | `multiPassRemoval.js` |
| `alphaGain` | 1.0 | `blendModes.js` |
| `MIN_GAIN` | 1.05 | `alphaCalibration.js` |
| `MAX_GAIN` | 2.6 | `alphaCalibration.js` |

### 11.4 Engine Limits

| Constant | Value | Location |
|----------|-------|----------|
| `MAX_PIXELS` | 64,000,000 (8000×8000) | `config.js` |
| `MAX_FILE_SIZE` | 20,971,520 (20 MB) | `config.js` |
| `MAX_CONCURRENCY` | 4 | `config.js` |

---

*Document version: 2.7.0 — 2026-06-22*
*Corresponds to: v2.7.0, 48 test files, 480+ tests, 0 eslint errors, build clean*
