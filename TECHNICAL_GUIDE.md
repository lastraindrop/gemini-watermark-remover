# Technical Guide — Gemini Watermark Remover v2.0.0

## 1. Overview

This document describes the working principles, algorithm details, parameter rationale, and test strategy of the watermark detection and removal engine. It serves as the definitive reference for understanding how detection decisions are made and how thresholds interact.

### 1.1 Core Algorithm

The fundamental operation is **mathematical reverse alpha blending** — not AI inpainting or generative fill. The engine:

1. **Detects** the watermark position, size, and alpha map by correlating the image against calibrated watermark templates
2. **Removes** the watermark by algebraically reversing the blend operation pixel by pixel

### 1.2 Alpha Blending Model

Given a background image `B` and a watermark with color `C` and alpha map `A`:

```
Pixel(x,y) = A(x,y) × C + (1 − A(x,y)) × B(x,y)
```

For Gemini watermarks: `C = (255, 255, 255)` (white logo).

### 1.3 Reverse Operation

```
B(x,y) = (Pixel(x,y) − A(x,y) × 255) / (1 − A(x,y))
```

The alpha map `A` is calibrated from known watermark assets (`bg_96.png`, `bg_48.png` for Gemini; `bg_doubao_br.png`, `bg_doubao_tl.png` for Doubao). These assets contain the watermark pattern at known opacity, which is normalized to `[0, 1]` via `calculateAlphaMap()`.

---

## 2. Detection Pipeline Architecture

### 2.1 Four-Stage Pipeline

The detection process in `detectProfileWatermarks()` (`detectionPipeline.js`) operates in four ordered stages:

```
Stage 1: Catalog Probe ──┬── hit → add match, skip rest
                          └── miss → continue

Stage 2: Scaled Catalog ──┬── hit → add match, probe
                          └── miss → continue

Stage 3: Heuristic ───────┬── hit → add match, probe
                          └── miss → continue

Stage 4: Global Fallback ──┬── hit → verify anchor → accept/reject
                           └── miss → return null
```

### 2.2 Stage 1: Catalog Exact Match

**File**: `src/core/templates/registry.js` — `findMatches()`

```
MAX_SCALE_MISMATCH = 0.015 (1.5%)
```

For an image of size `(W, H)`, each catalog entry `(w, h)` is checked:

```
scaleX = W / w
scaleY = H / h
match = |scaleX − scaleY| < 0.015  AND  |scaleX − 1| < 0.015
```

If matched, the config is returned with `isOfficial: true`. The probe then uses the exact catalog position.

**Rationale**: 1.5% tolerance (v2.0 tuned) allows for minor encoding artifacts/resampling while maintaining high precision. For example, 1365×768 → 1376×768 (0.8% diff) matches; 1360×768 (1.2% diff) matches; 1350×768 (1.9% diff) does NOT match.

**Test coverage**: `tests/catalog.test.js` (68 subtests covering all official dimensions + tolerance boundary).

### 2.3 Stage 2: Scaled Catalog

**File**: `src/core/catalog.js` — `getScaledCatalogConfigs()`

When the exact catalog match fails, the engine searches for catalog entries whose aspect ratio is similar and that can be scaled to the target size:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `maxRelativeAspectRatioDelta` | 0.05 (5%) | Allow slight aspect ratio drift from cropping |
| `maxScaleMismatchRatio` | 0.08 (8%) | Allow non-uniform scaling (X vs Y scale difference) |
| `maxScaleDistance` | 0.30 (30%) | Maximum resize factor from catalog size |
| `minLogoSize` | 24 px | Lower bound for scaled logo |
| `maxLogoSize` | 192 px | Upper bound for scaled logo |
| `limit` | 4 | Max returned candidates |

**Example**: Image at 1510×660 → catalog entry 1536×672 (scaleX = 0.983, scaleY = 0.982) → scaled logo ≈ 94px, margins ≈ 62px.

**Test coverage**: `tests/gemini_regression.test.js` (test 3: "lightly scaled official Gemini export").

### 2.4 Stage 3: Heuristic

**File**: `src/core/profiles.js` — `getHeuristicConfig()`

For Gemini, the tier is determined by a combined pixel count + short side formula:

| Condition | Tier | Logo Size | Margins |
|-----------|------|-----------|---------|
| `shortSide ≤ 600` OR `(pixels ≤ 820k AND shortSide ≤ 1024)` | 0.5k | 48px | 32px |
| `pixels ≤ 1,100,000` OR `shortSide ≤ 1400` | 1k | 96px | 64px |
| `pixels ≤ 4,200,000` | 2k | 96px | 64px |
| else | 4k | 96px | 64px |

**Examples**:
- 800×800 (640k px, shortSide=800): pixels ≤ 820k AND shortSide ≤ 1024 → 0.5k ✓
- 1536×672 (1.03M px, shortSide=672): pixels ≤ 1.1M → 1k ✓
- 1500×500 (750k px, shortSide=500): shortSide ≤ 600 → 0.5k ✓
- 3000×3000 (9M px): → 4k ✓

**Important**: The combined formula prevents panoramic images (e.g., 1500×500) from being misclassified as 1k (which would use a 96px template instead of the correct 48px).

**Test coverage**: `tests/watermark_config.test.js` (boundary conditions: 1500×500, 1024×500).

### 2.5 Stage 4: Global Fallback

**File**: `src/core/detectionPipeline.js` — `detectProfileWatermarks()`

If stages 1-3 produce no matches (or only non-catalog matches below `fallbackBelow = 0.30`), a full-image sweep via `detectWatermark()` (`detector.js`) is performed.

Acceptance criteria:

```
acceptsGlobalDetection = detection.confidence ≥ minGlobalConfidence
    AND (isNearExpectedAnchor(...) OR detection.confidence ≥ minFreeGlobalConfidence)
```

| Parameter | Value | Role |
|-----------|-------|------|
| `minGlobalConfidence` | 0.25 | Minimum confidence to accept any global detection |
| `minFreeGlobalConfidence` | 0.50 | If detection is NOT near expected anchor, needs higher confidence |
| `isNearExpectedAnchor` tolerance | 5% position | Checks if detection is close to a known anchor position |

**Anchor position tolerance**: `max(4, min(logoWidth, logoHeight) × 0.05)`. For a 96px watermark: max(4, 4.8) = 5px. This prevents spurious detections that happen to land near corners from being accepted.

---

## 3. Probe Confidence Scoring

### 3.1 Normalized Cross-Correlation (NCC)

**File**: `src/core/detector.js` — `calculateCorrelation()`

```
NCC = (n × Σ(I·A) − ΣI × ΣA) / √((n × ΣI² − (ΣI)²) × (n × ΣA² − (ΣA)²))
```

Where:
- `I`: Image luminance (BT.709: 0.2126R + 0.7152G + 0.0722B)
- `A`: Alpha map value
- `n`: Pixel count

Two modes:
- `fullPrecision = true`: step = 1 (every pixel) — used for final scoring
- `fullPrecision = false`: step = 2 (every other pixel) — used for coarse search

### 3.2 Local Contrast Correlation

**File**: `src/core/detector.js` — `calculateLocalContrastCorrelation()`

Computes residual correlation by subtracting each pixel's 8-neighbor average before correlating. This reduces the influence of broad background texture:

```
imageResidual = I(x,y) − avgNeighbor(I)
alphaResidual = A(x,y) − avgNeighbor(A)
```

Neighborhood radius: `max(4, round(min(logoW, logoH) × 0.06))`.

### 3.3 Sobel Gradient Correlation

**File**: `src/core/detector.js` — `calculateGradientCorrelation()`

Computes NCC between Sobel gradient magnitudes of the image and the alpha map:

```
gx = (row−1,col+1) + 2×(row,col+1) + (row+1,col+1) − (row−1,col−1) − 2×(row,col−1) − (row+1,col−1)
gy = (row+1,col−1) + 2×(row+1,col) + (row+1,col+1) − (row−1,col−1) − 2×(row−1,col) − (row−1,col+1)
gradient = √(gx² + gy²)
```

Gradients for RGB channels are luminance-weighted.

### 3.4 Gradient Filtering (DeepScan)

When `deepScan = true`, the three scoring methods are combined via gradient filtering:

**Phase 1 (catalog probes)** — `calculateProbeConfidence()`:

```
combinedBase = Math.max(NCC, localContrastConf)
if (gradientConf < 0.05):
    confidence = combinedBase × 0.25    // No edge structure match → heavy penalty
else:
    confidence = Math.max(combinedBase, gradientConf)  // Edge match → take best
```

**Phase 2 (global search fine-tuning)** — `detectWatermark()`:

```
rawNCC = NCC(fullPrecision)
if (deepScan AND rawNCC > 0.04):
    compute gradientConf
    if (gradientConf < 0.05):
        rawNCC = rawNCC × 0.25
    else:
        rawNCC = Math.max(rawNCC, gradientConf)
```

**Jitter branch** — `calculateProbeConfidence()`:

```
combined = Math.max(NCC, localContrastConf)
if (gradientConf < 0.05):
    conf = combined × 0.25
else:
    conf = Math.max(combined, gradientConf)
```

#### Why Gradient Filtering?

| Scenario | NCC | Gradient | Combined (old) | Combined (new) |
|----------|-----|----------|----------------|----------------|
| Real watermark, smooth bg | 0.85 | 0.70 | 0.85 ✓ | 0.85 ✓ |
| Real watermark, textured bg | 0.50 | 0.20 | 0.50 ✓ | 0.50 ✓ |
| No watermark, sinusoidal texture | 0.94 | 0.03 | 0.94 ✗ FP | 0.28 ✓ (below threshold) |
| No watermark, random noise | 0.45 | 0.02 | 0.45 ✗ FP | 0.13 ✓ (below threshold) |

The old `Math.max(confidence, gradientConf)` approach had no defense against false positives where NCC was high but gradient correlation was near-zero. The gradient filter adds this defense by detecting when there's no edge structure match — a reliable indicator of noise-driven false positives.

#### Threshold Rationale

- **gradientConf < 0.05**: This threshold is set very low (near-zero correlation). Any gradientConf ≥ 0.05 indicates that at least some edge structure in the image aligns with the watermark template edges. This is extremely difficult for pure noise to achieve.
- **Multiplier 0.30**: (v2.0 Updated) This ensures that even a strong NCC of 0.94 is suppressed to 0.28, below the 0.35 fallback threshold. It strikes a better balance for low-contrast but obvious watermarks.
- **Why not geometric mean**: The geometric mean (`Math.sqrt(NCC × gradientConf)`) penalizes real watermarks on high-frequency backgrounds (e.g., grid patterns) where gradient correlation is inherently low due to background edges dominating. The filter approach only penalizes when gradient-conf is near-zero, preserving Math.max behavior for all other cases.

---

## 4. Detector Configuration Constants

### 4.1 Search Configuration (`SEARCH_CONFIG`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `RANGE_X` | 0.45 | Phase 2 horizontal search range (45% of image width from right edge) |
| `RANGE_Y` | 0.45 | Phase 2 vertical search range (45% of image height from bottom edge) |
| `CANDIDATES_LIMIT_PER_SIZE` | 5 | Max coarse candidates per watermark size |
| `PROXIMITY_THRESHOLD` | 8 px | Minimum distance between distinct candidates |
| `FINE_TUNE_RANGE` | 4 px | Local refinement search radius |

### 4.2 Phase 2 Coarse Search Thresholds

| Threshold | Value | Role |
|-----------|-------|------|
| `ANCHORED_OFFICIAL` | 0.18 | Phase 1 catalog anchor acceptance |
| `ANCHORED_OTHER` | 0.22 | Phase 1 non-catalog anchor acceptance |
| `STRICT_EXIT` | 0.60 | Previously used for early exit (disabled in v1.9.1) |
| `COARSE` | 0.10 | Phase 2 coarse grid acceptance |
| `STAGE2_NR` | 0.10 | Phase 2 fine-tune acceptance (with noise reduction) |
| `STAGE2_CLEAN` | 0.12 | Phase 2 fine-tune acceptance (without noise reduction) |

### 4.3 Final Decision Thresholds

| Threshold | Value | Role |
|-----------|-------|------|
| `FINAL_ANCHORED` | 0.15 | Anchored position (catalog match) |
| `FINAL_ALIGNED` | 0.18 | Aligned to standard margin |
| `FINAL_FREE` | 0.22 | Free (non-aligned) position |

### 4.4 Pipeline Thresholds

| Constant | Value | Location |
|----------|-------|----------|
| `DEFAULT_PROBE_THRESHOLD` | 0.18 | `detectionPipeline.js` |
| `DEFAULT_GLOBAL_FALLBACK_THRESHOLD` | 0.25 | `detectionPipeline.js` |
| `minFreeGlobalConfidence` | 0.50 | `detectionPipeline.js` |
| `fallbackBelow` | 0.30 | `detectionPipeline.js` (opts) |
| `DEFAULT_AUTO_NON_CATALOG_THRESHOLD` | 0.35 | `detectionPipeline.js` |

### 4.5 Jitter Range

| Context | Range | Rationale |
|---------|-------|-----------|
| Catalog anchor (isOfficial=true) | ±4 px | Small offset for exact catalog positions |
| Non-catalog / scaled anchor | ±6 px | Larger offset for heuristic/estimated positions |
| `calculateProbeConfidence` jitter | ±6 px | Uniform search radius for probe refinement |

### 4.6 Step Size

| Condition | Step |
|-----------|------|
| Logo size ≤ 48px | 1 px |
| Logo size > 48px | 2 px |

---

## 5. Detection Flow (Complete Trace)

For a 1365×768 image with a weak Gemini watermark (alpha=190):

### Step 1: getAllPotentialConfigs

```js
// 1365/1376 = 0.992, 768/768 = 1.0
// |0.992 − 1.0| = 0.008 < 0.02 ✓  AND  |0.992 − 1| = 0.008 < 0.02 ✓
// → catalog match: logoSize=96, marginRight=64, marginBottom=64, isOfficial=true
```

Wait — 1365×768 matches the 1376×768 catalog entry within 2%? Yes:
```
1365/1376 = 0.9920 → scale mismatch = |0.9920 − 1.0| = 0.0080 < 0.02 → MATCH
```

This means 1365×768 is treated as an OFFICIAL catalog match, giving a 96px corner watermark. This is correct behavior — the 0.8% difference is within expected encoding variation.

### Step 2: calculateProbeConfidence

```
Position: x = 1365 − 96 − 64 = 1205, y = 768 − 96 − 64 = 608
NCC: 0.45 (weak watermark on busy background)
localContrastConf: 0.35
confidence = Math.max(0.45, 0.35) = 0.45

deepScan = true:
gradientConf = 0.22 (watermark creates detectable edges despite busy bg)
gradientConf (0.22) ≥ 0.05 → confidence = Math.max(0.45, 0.22) = 0.45

confidence (0.45) > DEFAULT_PROBE_THRESHOLD (0.18) → match added
```

### Step 3: Pipeline decision

```
hasCatalogBackedMatch → true (isOfficial=true)
→ global fallback skipped
→ winner = catalog probe match at confidence 0.45
```

### False positive case (no watermark, same image):

```
NCC: 0.94 (sinusoidal texture correlates spuriously with alpha map)
localContrastConf: 0.30
confidence = Math.max(0.94, 0.30) = 0.94

deepScan = true:
gradientConf = 0.03 (sine wave gradients mostly uncorrelated with circular alpha gradient)
gradientConf (0.03) < 0.05 → confidence = 0.94 × 0.25 = 0.24

Global fallback acceptance:
detection.confidence (0.24) ≥ minGlobalConfidence (0.25)? → NO → REJECTED
```

The gradient filter drops the false positive from 0.94 to 0.24, below the 0.25 acceptance threshold. The tight position tolerance (5%) provides additional defense.

---

## 6. Test Strategy

### 6.1 Test Categories

| Category | File | Coverage |
|----------|------|----------|
| Catalog matching | `catalog.test.js` | All 68 official catalog entries + tolerance boundaries |
| Gemini regression | `gemini_regression.test.js` | Official catalog detection, scaled detection, weak watermark, false negative/positive |
| Product audit | `product_audit.test.js` | 31 subtests across all profiles: detection, fidelity PSNR, auto-detect, Doubao multi-anchor |
| CLI integration | (in test suite) | File/dir/pipe/JSON processing for all profiles |
| Frontend contract | `frontend_contract.test.js` | DOM hooks, drag-drop, i18n, ZIP download, queue management |
| Watermark config | `watermark_config.test.js` | Catalog priority, heuristic fallback, boundary conditions |
| Doubao-specific | 6 test files | Profile integrity, catalog coverage, multi-anchor, E2E, edge cases |

### 6.2 Verification Commands

```bash
npm run lint          # ESLint
npm test              # Full 271-test suite
npm run build         # Production build
node --test tests/gemini_regression.test.js   # Targeted regression
node --test tests/product_audit.test.js        # Full product audit
python -m unittest tests\test_bridge_integration.py  # Python bridge
```

### 6.3 Regression Test Design (gemini_regression.test.js)

| Test # | Scenario | What it verifies |
|--------|----------|------------------|
| 1 | All 1k aspect ratios | Catalog resolution matching returns correct config |
| 2 | 1536×672 official watermark | Full pipeline finds exact-position watermark at >0.9 confidence |
| 3 | 1510×660 scaled watermark | Scaled catalog produces correct logo size (93-95px) |
| 4 | 1365×768 weak watermark on busy bg | Weak watermark (alpha=190) is found with >0.24 confidence, NOT via global fallback |
| 5 | 1365×768 NO watermark | False positive is rejected (gradient filter + anchor tolerance) |
| 6 | CLI 1536×672 | CLI correctly detects and removes watermark |

---

## 7. Known Limitations and Future Work

### 7.1 Current Limitations

1. **Sinusoidal/repetitive textures**: Can still produce gradientConf ≈ 0.03-0.04, which is below the filter threshold but close. A stronger or additional filter (e.g., spectral analysis) would add safety margin.
2. **High-frequency backgrounds**: Grid patterns and fine textures reduce gradient correlation even for real watermarks, making the filter less discriminative.
3. **DALL-E 3**: Experimental profile only, missing asset `bg_dalle3_bl.png`. Detection limited to catalog 1024×1024.
4. **Non-rectangular watermarks**: The Sobel gradient approach is designed for roughly rectangular watermark regions. Watermarks with very irregular shapes may produce unreliable gradient correlation.

### 7.2 Recommended Future Enhancements

1. **Augmented sample library**: Add more real Gemini export images at scaled/cropped sizes to catalog.
2. **Negative sample expansion**: Build a library of high-frequency texture images without watermarks for regression testing.
3. **Adaptive gradient threshold**: Consider making the gradientConf threshold (0.05) adaptive based on image entropy — low-entropy images could use a stricter threshold.
4. **DALL-E 3 asset**: Complete the `bg_dalle3_bl.png` asset for full DALL-E 3 support.
5. **WebAssembly acceleration**: Move NCC and gradient computation to WASM for 4K image performance.

---

## 8. Appendix: Key Parameters Reference

### 8.1 Catalog Matching (`registry.js`)

```
MAX_SCALE_MISMATCH = 0.02   // 2% exact catalog tolerance
```

### 8.2 Scaled Catalog (`catalog.js`)

```
maxRelativeAspectRatioDelta = 0.05   // 5% aspect ratio drift
maxScaleMismatchRatio = 0.08         // 8% non-uniform scaling
maxScaleDistance = 0.30              // 30% max resize factor
```

### 8.3 Gradient Filter (`detector.js`)

```
gradientFilterThreshold = 0.05       // Below this → no edge match
gradientFilterPenalty = 0.25         // Confidence multiplier when filtered
```

### 8.4 Pipeline (`detectionPipeline.js`)

```
DEFAULT_PROBE_THRESHOLD = 0.18
DEFAULT_GLOBAL_FALLBACK_THRESHOLD = 0.25
minFreeGlobalConfidence = 0.50
anchorPositionTolerance = 0.05       // 5% of logo dimension
anchorSizeTolerance = 0.15           // 15% of logo dimension
```

### 8.5 Search (`detector.js` SEARCH_CONFIG)

```
ANCHORED_OFFICIAL = 0.18
COARSE = 0.10
STAGE2_CLEAN = 0.12
FINAL_FREE = 0.22
```

---

## 9. Custom Configuration & Manual Overrides (v2.1)

### 9.1 Dynamic Parameter Injection

Starting from v2.1.0, the engine supports runtime parameter injection. This allows bypassing hardcoded constants without redeploying the core logic.

- **Threshold Overrides**: `probeThreshold` and `fallbackThreshold` are checked first in `detectionPipeline.js`.
- **Mathematical Penalty Adjustment**: The `gradientFilterPenalty` (0.30) can be adjusted to `0.10` (strict) or `0.90` (permissive).

### 9.2 Manual Mode Pipeline Bypass

When `manualConfig` is provided, the engine skips the standard detection stages:

1. **Coordinates**: Directly uses `(x, y, w, h)` as the target.
2. **Verification**: Runs `calculateProbeConfidence` only for the specified area to report confidence to the UI.
3. **Execution**: Immediately invokes `removeWatermark()` using the best available AlphaMap for the given dimensions.

This mode ensures that even watermarks that are mathematically impossible to distinguish from noise via auto-detection can still be removed if the user points the engine to the correct location.

---

*Document version: 2.1 — 2026-05-10*
*Corresponds to: v2.1.0, 277/277 tests, lint/build clean*
v1.9.9, 271/271 tests, lint/build clean*
