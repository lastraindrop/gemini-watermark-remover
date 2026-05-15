# Technical Guide — Gemini Watermark Remover v2.2.0

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

### 2.1 Six-Stage Pipeline

The detection process in `detectProfileWatermarks()` (`detectionPipeline.js`) operates in six ordered stages:

```
Stage 1: Catalog Probe ──┬── hit → add match, probe
                          └── miss → continue

Stage 2: Scaled Catalog ──┬── hit → add match, probe
                          └── miss → continue

Stage 3: Heuristic ───────┬── hit → add match, probe
                          └── miss → continue

Stage 4: Adaptive Search ─┬── hit → add match, probe
                          └── miss → continue

Stage 5: Global Fallback ─┬── hit → verify anchor → accept/reject
                          └── miss → return null

Stage 6: Decision Policy ─── classify tiers (direct-match / needs-validation / insufficient)
```

### 2.2 Stage 1: Catalog Exact Match

**File**: `src/core/templates/registry.js` — `findMatches()`

```
MAX_SCALE_MISMATCH = 0.05 (5%)
```

For an image of size `(W, H)`, each catalog entry `(w, h)` is checked:

```
scaleX = W / w
scaleY = H / h
match = |scaleX − scaleY| < 0.05  AND  |scaleX − 1| < 0.05
```

If matched, the config is returned with `isOfficial: true`. The probe then uses the exact catalog position.

**Rationale**: 5% tolerance (v2.2 widened from 1.5% in v2.0) covers common user scenarios: screenshots, minor resizes, and encoding artifacts. For example, 1365×768 → 1376×768 (0.8% diff) matches; 1080×1080 → 1024×1024 (5.5% diff) does NOT match. The adaptive detector (Stage 4) provides a separate path for non-catalog resolutions.

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

### 2.6 Stage 5: Adaptive Detection (v2.2 new)

**File**: `src/core/adaptiveDetector.js` — `detectAdaptiveWatermarkRegion()`

When catalog probes fail, the adaptive detector performs a coarse-to-fine multi-scale search:

1. **Seed check**: Test the default catalog anchor position
2. **Coarse search**: Iterate over size × margin grid (8px step)
3. **Top-K collection**: Keep the 5 best coarse candidates
4. **Fine search**: Refine each top-K with 2px step over ±8px × ±10px size range

**3D Scoring Formula**:

```
confidence = spatial × 0.5 + gradient × 0.3 + variance × 0.2
```

| Component | Weight | Source |
|-----------|--------|--------|
| Spatial (NCC) | 0.5 | `calculateCorrelation()` |
| Gradient (Sobel NCC) | 0.3 | `calculateGradientCorrelation()` |
| Variance | 0.2 | `stdDev(watermark) / stdDev(reference)` |

**Variance score**: compares luminance std dev of the candidate watermark region against a reference region above it. Real watermarks typically reduce local variance (semi-transparent overlay smooths details), producing lower watermark std dev relative to the background.

**Parameters**:
| Parameter | Value | Purpose |
|-----------|-------|---------|
| `threshold` | 0.35 | Minimum confidence to accept |
| `minSize` | 24 | Lower bound for watermark size |
| `maxSize` | 192 | Upper bound for watermark size |
| `minMarginRight/Bottom` | config ± 75% | Search range for position |

### 2.7 Stage 6: Decision Policy (v2.2 new)

**File**: `src/core/decisionPolicy.js`

Each detection result is classified into one of three tiers:

| Tier | Meaning | Action |
|------|---------|--------|
| `direct-match` | Strong evidence, confident removal | Apply full removal pipeline |
| `needs-validation` | Some evidence, moderate confidence | Apply with caution |
| `insufficient` | No reliable evidence | Skip removal |

**Classification rules**:

| Source | direct-match | needs-validation |
|--------|-------------|-----------------|
| catalog-probe | confidence ≥ 0.60 | confidence < 0.60 |
| adaptive-search | confidence ≥ 0.48 | confidence < 0.48 |
| heuristic-probe | confidence ≥ 0.70 | confidence < 0.70 |
| global-search | confidence ≥ 0.55 | 0.35 ≤ confidence < 0.55 |

### 2.8 Removal Pipeline (v2.2 new)

**Files**: `multiPassRemoval.js`, `alphaCalibration.js`, `blendModes.js`

For Gemini profile, the removal pipeline runs after successful detection:

```
removal → multiPassRemoval (up to 4 passes)
    ├── Near-black safety gate (stops if region becomes too dark)
    ├── Texture collapse detection (stops if structure is destroyed)
    └── Residual threshold (stops when NCC < 0.25)
    
if residual remains high:
    alphaCalibration (14 coarse + fine tuning)
    → Search for optimal alphaGain [1.05, 2.6]
    → Minimize post-removal spatial correlation
```

**alphaGain parameter**: Multiplies the alpha value before the reverse blend:
```
effectiveAlpha = min(alpha × alphaGain, 0.99)
original = (watermarked - effectiveAlpha × 255) / (1 - effectiveAlpha)
```

Higher alphaGain helps when the calibrated alpha map under-estimates the actual watermark opacity (e.g., due to rescaling artifacts).

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
npm run test:all      # Full 369-test suite (includes legacy smoke + Python bridge)
npm run build         # Production build
npm run test:legacy   # Maintained legacy regression (edge crop, noise reduction)
npm run test:python   # Python bridge
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

## 10. v2.1 维护版本更新

### 10.1 测试覆盖扩展 (369/369 测试通过)

v2.1 维护版本完成了测试覆盖缺口的补充，从 277 测试增加至 369 测试：

| 新增测试文件 | 覆盖范围 | 测试点 |
|-------------|---------|--------|
| `registry.test.js` | `templates/registry.js` | 单例验证、注册/查询、目录添加、容差边界 |
| `scaled_catalog.test.js` | `catalog.js getScaledCatalogConfigs` | 宽高比容差、缩放比容差、min/maxLogoSize、limit 参数 |
| `local_contrast.test.js` | `detector.js calculateLocalContrastCorrelation` | 噪声背景相关性、注入水印后相关性、边界安全处理 |
| `box_blur.test.js` | `detector.js fastBoxBlur` | 均匀图像 blur 后不变、边缘像素保留、中心像素均值计算 |
| `overrides_dynamic.test.js` | `detector.js` v2.1 overrides | jitterRange 覆盖、FINAL/STAGE2/COARSE 阈值覆盖、gradientPenalty 覆盖 |
| `metrics_precision.test.js` | `restorationMetrics.js` | MSE 计算、PSNR 计算、estimateQualityFromPSNR 0-1 映射 |
| `detection_fallback_chain.test.js` | `detectionPipeline.js` | catalog-probe → heuristic-probe → global-search 回退链、autoNonCatalogMinConfidence 阈值 |
| `i18n_completeness.test.js` | `src/i18n/*.json` | 7 语言 key 一致性、无空值、参数化 key 占位符匹配 |
| `sdk_api.test.js` | `src/sdk`, `package.json` | 独立 fork SDK/API 导出与 package metadata |
| `object_url_lifecycle.test.js` | `utils.js`, `state.js` | 本地上传 object URL 生命周期与 workspace 清理 |

### 10.2 动态参数覆盖机制 (v2.1)

**参数透传路径**: Web UI → `app.js getEngineOptions()` → `watermarkEngine.js` → `detector.js` → `detectionPipeline.js`

**已验证生效的参数**:

```javascript
// 入口层 (Web UI / CLI / Python)
{
    probeThreshold: 0.18,           // 覆盖 detectionPipeline.js DEFAULT_PROBE_THRESHOLD
    fallbackThreshold: 0.25,        // 覆盖 detectionPipeline.js DEFAULT_GLOBAL_FALLBACK_THRESHOLD
    gradientPenalty: 0.30,          // 覆盖 detector.js 梯度滤波惩罚系数
    manualConfig: { x, y, width, height },  // 绕过搜索管线
    overrides: {                     // 深度覆盖 detector.js SEARCH_CONFIG
        THRESHOLDS: {
            ANCHORED_OFFICIAL: 0.18,
            COARSE: 0.10,
            STAGE2_CLEAN: 0.12,
            STAGE2_FALLBACK: 0.18,
            FINAL_FREE: 0.22,
            FINAL_ANCHORED: 0.25
        },
        jitterRange: 4,             // Phase 1 抖动搜索范围
        FINE_TUNE_RANGE: 6,         // Phase 3 微调范围
        PROXIMITY_THRESHOLD: 8,     // 候选去重阈值
        CANDIDATES_LIMIT_PER_SIZE: 3
    }
}
```

### 10.3 已修复的一致性问题

| 问题 | 位置 | 修复前 | 修复后 |
|------|------|--------|--------|
| 版本号不一致 | `gui.py:14`, `README_zh.md:3` | v1.9.9 | v2.1.0 |
| 测试数量不一致 | 多处文档 | 271 / 277 / 356 | 369 |
| slider 比例问题 | `app.js:573-583` | 共用同一 slider | 固定 0.25/0.18 比例 |
| 多文件检测逻辑 | `gui.py:263` | 字符串比较 | 数字比较 |
| CLI 路径判断 | `remover.py:100` | 仅检查 `.js` 文件 | 支持全局安装 |

### 10.4 Worker Execution Architecture (v2.1)

**Module**: `src/core/worker.js`, `src/core/watermarkEngine.js`

The pixel restoration step (`removeWatermark`) is now delegated to a Web Worker when the browser environment supports it:

```
Main Thread                           Worker Thread
───────────                           ─────────────
detectWatermarks()  ──┐
                       ├── detection result (matches[])
                       │
clone buffer          │
                      │
worker.postMessage()  ├── { imageData, matches[] } ──→  for each match:
  (transfer buffer)   │                                  removeWatermark()
                      │                              ←── { imageData, taskId }
onmessage handler    │
  ↓                   │
imageData.data.set()  │
  ↓                   │
ctx.putImageData()    │
```

**Key design decisions**:

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Detection location | Main thread | Detection requires profile catalog, alpha maps, and stateful configuration. Moving it to a worker would require duplicating the entire engine context. |
| Restoration location | Worker (primary), main thread (fallback) | Restoration is pure pixel math — stateless and ideal for off-main-thread work. |
| Buffer transfer | Transfer ownership via `postMessage(data, [buffer])` | Avoids copying large (60MB+) 4K image buffers. The main thread clones once, then transfers ownership to the worker. |
| Timeout | 5000 ms | If the worker fails to respond within 5 seconds (crashed, hung, or terminated), the promise rejects and the main thread performs restoration inline. |
| Fallback path | Transparent | `removeWatermarkFromImage()` catches worker failures and silently falls back to main-thread `removeWatermark()`. The user never sees a difference in output quality. |

**Execution mode reporting**:

`WatermarkEngine.getExecutionMode()` returns:
- `'worker-assisted'` — Worker is successfully created and will be used for restoration
- `'main-thread'` — Worker unavailable (Node.js, Tampermonkey userscript, or disabled due to prior failure)

The Web UI's initialization log uses this to report the actual execution mode.

**Test coverage**: `tests/worker_resilience.test.js`:
- Worker path: verification that `postMessage` is called and pixels are modified correctly
- Timeout path: hanging worker triggers 5-second timeout → rejection → main thread fallback
- Constructor failure: `Worker()` throw → `_useWorker = false` → `_getWorker()` returns `null`

---

*Document version: 2.1.3 — 2026-05-12*
*Corresponds to: v2.1.0, 369/369 tests, lint/build/Python bridge clean*
