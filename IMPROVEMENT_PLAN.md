# Gemini Watermark Remover — 详细改进实施计划

> 基于 ANALYSIS_AND_PLAN.md 分析报告 | 目标版本: v2.3.0 | 制定日期: 2026-05-16

---

## 总览: Sprint 规划

| Sprint | 周期 | 主题 | 预计工时 | 产出 |
|--------|------|------|---------|------|
| S1 | 第1周 | BUG修复 + 死代码清理 | 8h | 5个BUG修复 + 所有现有测试通过 |
| S2 | 第2周 | 共享工具提取 + 代码去重 | 6h | core/utils.js + 3个文件重构 |
| S3 | 第3周 | 新增P0测试覆盖 | 10h | ~35个新测试用例 |
| S4 | 第4周 | app.js 拆分 + overrides连通 | 6h | 4个新模块 + v2.1功能完整 |
| S5 | 第5周 | CLI多遍次移除 + 测试 | 6h | CLI质量对齐浏览器版 + 测试 |
| S6 | 第6周 | 新增P1/P2测试 + 回归验证 | 10h | ~50个新测试用例 + 全面回归 |
| S7 | 第7-8周 | 功能补全 (userscript增强/SSIM/CHANGELOG) | 14h | v2.3.0 发布 |

---

## Sprint 1: BUG修复 (第1周)

### 任务 1.1: 修复 BUG-2 — alphaCalibration 矩形水印支持

**文件**: `src/core/alphaCalibration.js`

**问题**: 第94行 `const size = position.width;` 假设水印为正方形，第111行、第135行调用 `calculateCorrelation` 时使用 `size, size` 作为宽高。对 doubao (401x173) 等矩形水印，会传入错误的尺寸。

**修复方案**:

```javascript
// 修复前 (第94行):
const size = position.width;

// 修复后:
const sizeW = position.width;
const sizeH = position.height;
```

同时更新第111行和第135行:
```javascript
// 修复前:
const score = Math.abs(calculateCorrelation(candidate, position.x, position.y, size, size, alphaMap, true));

// 修复后:
const score = Math.abs(calculateCorrelation(candidate, position.x, position.y, sizeW, sizeH, alphaMap, true));
```

**验证**: 新增测试用例覆盖矩形水印校准场景 (见 Sprint 3)

---

### 任务 1.2: 修复 BUG-5 — detector.js 缩进不一致

**文件**: `src/core/detector.js`

**问题**: 第471-525行的 gemini 通用分支缩进为8空格，与文件其余部分的4空格不一致 (doubao 分支 if 块结束后缩进未恢复)。

**修复方案**: 将第471-525行整体缩进从8空格改为4空格。

```
行471: let confidence → 4空格缩进
行472-525: 同步调整
```

---

### 任务 1.3: 修复 BUG-6 — 移除 gradientDelta 死代码

**文件**: `src/core/multiPassRemoval.js`

**问题**: 第144行 `const gradientDelta = 0;` 硬编码为0，被写入 passes 数据但从未被消费。

**修复方案**:

```javascript
// 方案A: 完全移除
// 删除第144行的 const gradientDelta = 0;
// 删除第169行的 gradientDelta,

// 方案B: 实现真正的梯度差计算
const beforeGradient = calculateGradientCorrelation(currentImageData, position.x, position.y, position.width, position.height, alphaMap);
const afterGradient = calculateGradientCorrelation(candidate, position.x, position.y, position.width, position.height, alphaMap);
const gradientDelta = afterGradient - beforeGradient;
```

推荐方案B，因为梯度差是有意义的诊断指标。需要从 `detector.js` 导入 `calculateGradientCorrelation`。

**涉及修改**:
- `src/core/multiPassRemoval.js`: 顶部添加 `import { calculateCorrelation, calculateGradientCorrelation } from './detector.js';`

---

### 任务 1.4: 修复 BUG-7 — app.js overrides 传递

**文件**: `src/app.js`

**问题**: `getEngineOptions()` (第572-603行) 收集了 thresholdSlider/penaltySlider 值作为 `probeThreshold` 和 `gradientPenalty`，但未构建 `overrides` 对象传递给引擎。`detectionPipeline.js` 中的 `options.overrides` 会被 `detector.js` 使用来覆盖默认搜索阈值。

**修复方案**:

```javascript
function getEngineOptions() {
    const thresholdSliderVal = parseFloat(elements.thresholdSlider?.value || '0.18');
    const penaltySliderVal = parseFloat(elements.penaltySlider?.value || '0.30');
    const opts = {
        profileId: elements.profileSelect?.value || 'gemini',
        deepScan: document.getElementById('deepScanToggle')?.checked ?? true,
        noiseReduction: document.getElementById('noiseReductionToggle')?.checked ?? false,
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? false,
        probeThreshold: thresholdSliderVal,
        fallbackThreshold: thresholdSliderVal,
        gradientPenalty: penaltySliderVal,
        overrides: {
            THRESHOLDS: {
                ANCHORED_OFFICIAL: thresholdSliderVal,
                ANCHORED_OTHER: thresholdSliderVal + 0.04,
                COARSE: thresholdSliderVal * 0.55,
                FINAL_ANCHORED: thresholdSliderVal - 0.03,
                FINAL_ALIGNED: thresholdSliderVal,
                FINAL_FREE: thresholdSliderVal + 0.04
            }
        }
    };

    // ... manualConfig 部分保持不变 ...

    return opts;
}
```

---

### 任务 1.5: 修复 BUG-4 (准备) — CLI Engine 多遍次移除

**文件**: `src/cli/gwrRemoveCommand.js`

**问题**: 第114-116行直接调用 `removeWatermark` 单次移除，缺少浏览器版 `watermarkEngine.js` 中的多遍次移除 (`removeRepeatedWatermarkLayers`) 和 Alpha校准 (`recalibrateAlphaStrength`)。

**修复方案**: (详细实现见 Sprint 5)

```javascript
import { removeRepeatedWatermarkLayers } from '../core/multiPassRemoval.js';
import { shouldRecalibrateAlphaStrength, recalibrateAlphaStrength } from '../core/alphaCalibration.js';

// 在 processBuffer 方法中，替换第114-116行:
for (const match of detection.matches) {
    const useMultiPass = match.profileId === 'gemini';
    if (useMultiPass) {
        const multiPassResult = removeRepeatedWatermarkLayers({
            imageData,
            alphaMap: match.alphaMap,
            position: match.pos,
            maxPasses: 4,
            residualThreshold: 0.25
        });
        const lastPass = multiPassResult.passes.length > 0
            ? multiPassResult.passes[multiPassResult.passes.length - 1]
            : null;
        if (multiPassResult.stopReason !== 'residual-low' && lastPass) {
            const suppressionGain = Math.abs(match.confidence) - Math.abs(lastPass.afterSpatialScore);
            if (shouldRecalibrateAlphaStrength({
                originalScore: Math.abs(match.confidence),
                processedScore: Math.abs(lastPass.afterSpatialScore),
                suppressionGain
            })) {
                const recalibrated = recalibrateAlphaStrength({
                    sourceImageData: multiPassResult.imageData,
                    alphaMap: match.alphaMap,
                    position: match.pos,
                    originalSpatialScore: Math.abs(match.confidence),
                    processedSpatialScore: Math.abs(lastPass.afterSpatialScore)
                });
                if (recalibrated) {
                    imageData.data.set(recalibrated.imageData.data);
                    continue;
                }
            }
        }
        imageData.data.set(multiPassResult.imageData.data);
    } else {
        removeWatermark(imageData, match.alphaMap, match.pos);
    }
}
```

---

## Sprint 2: 共享工具提取 + 代码去重 (第2周)

### 任务 2.1: 创建 core/utils.js

**目标**: 提取重复的工具函数到统一模块。

**重复分布**:

| 函数 | 位置A | 位置B | 位置C |
|------|-------|-------|-------|
| `cloneImageData` | multiPassRemoval.js:23-29 | alphaCalibration.js:25-31 | — |
| `calculateNearBlackRatio` | multiPassRemoval.js:31-51 | alphaCalibration.js:33-53 | — |
| `regionStdDev` | detector.js:533-550 | adaptiveDetector.js:51-68 | — |

**新建文件**: `src/core/utils.js`

```javascript
export function cloneImageData(imageData) {
    return {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data)
    };
}

export function calculateNearBlackRatio(imageData, position) {
    const { data, width: imgWidth, height: imgHeight } = imageData;
    const { x, y, width: w, height: h } = position;
    let nearBlack = 0;
    let total = 0;
    for (let row = 0; row < h; row++) {
        const cy = Math.floor(y + row);
        if (cy < 0 || cy >= imgHeight) continue;
        for (let col = 0; col < w; col++) {
            const cx = Math.floor(x + col);
            if (cx < 0 || cx >= imgWidth) continue;
            const idx = ((cy * imgWidth) + cx) << 2;
            const lum = data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
            total++;
            if (lum < 15) nearBlack++;
        }
    }
    return total > 0 ? nearBlack / total : 0;
}

export function regionStdDev(data, imgWidth, x, y, size) {
    let sum = 0, sq = 0, n = 0;
    for (let row = 0; row < size; row++) {
        const base = ((y + row) * imgWidth + x) << 2;
        for (let col = 0; col < size; col++) {
            const idx = base + (col << 2);
            if (idx < 0 || idx + 2 >= data.length) continue;
            const lum = data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
            sum += lum;
            sq += lum * lum;
            n++;
        }
    }
    if (n === 0) return 0;
    const mean = sum / n;
    const variance = Math.max(0, sq / n - mean * mean);
    return Math.sqrt(variance);
}
```

**同步修改**:
- `src/core/multiPassRemoval.js`: 删除本地 `cloneImageData`/`calculateNearBlackRatio`，改为 `import { cloneImageData, calculateNearBlackRatio } from './utils.js';`
- `src/core/alphaCalibration.js`: 同上
- `src/core/detector.js`: 删除本地 `regionStdDev`，改为 `import { regionStdDev } from './utils.js';` — 注意 `detector.js` 的 `regionStdDev` 签名是 `(data, imgWidth, x, y, size)` 而不是 `(imageData, x, y, size)`，需要统一
- `src/core/adaptiveDetector.js`: 同上

**风险**: 函数签名需完全对齐。当前 `detector.js` 和 `adaptiveDetector.js` 的 `regionStdDev` 签名一致 `(data, imgWidth, x, y, size)`，可以直接提取。

---

### 任务 2.2: 统一 Alpha Map 返回格式

**问题**: `alphaMap.js` 返回 `Float32Array`，`watermarkEngine.js` 包装为 `{ data, width, height }`，CLI 的 `Engine.getAlphaMap` 返回 `{ data, width, height, assetKey }`。`detectionPipeline.js` 有 `normalizeAlphaMap()` 做转换。

**修复方案**: 保持现有接口不变 (改动面太大不值得)，但在 `normalizeAlphaMap` 中添加类型断言注释和更详细的 JSDoc，使其成为事实上的标准适配层。

**涉及文件**:
- `src/core/detectionPipeline.js:31-42` — 增强 `normalizeAlphaMap` 的文档

---

### 任务 2.3: 阈值文档化

**目标**: 不做集中提取 (风险大)，而是在代码中建立交叉引用注释。

**涉及文件**:
- `src/core/detector.js` `SEARCH_CONFIG.THRESHOLDS` 上方添加注释说明各阈值的含义和调整影响
- `src/core/detectionPipeline.js` 常量上方添加注释
- `src/core/decisionPolicy.js` 常量上方添加注释

---

## Sprint 3: 新增P0测试覆盖 (第3周)

### 任务 3.1: 边界条件与健壮性测试

**新建文件**: `tests/robustness_edge_cases.test.js`

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeWatermark } from '../src/core/blendModes.js';
import { calculateCorrelation, detectWatermark, calculateProbeConfidence } from '../src/core/detector.js';
import { calculateAlphaMap } from '../src/core/alphaMap.js';
import { createMockImageData, createMockAlphaMap } from './test_utils.js';

describe('Robustness: removeWatermark edge cases', () => {
    it('handles position at image origin (0,0)', () => { ... });
    it('handles position exceeding image bounds gracefully', () => { ... });
    it('handles negative x/y coordinates without crash', () => { ... });
    it('handles zero-size watermark (width=0 or height=0)', () => { ... });
    it('handles alphaGain = 0 (no-op)', () => { ... });
    it('handles alphaGain = NaN (falls back to 1)', () => { ... });
    it('handles alphaGain = -1 (falls back to 1)', () => { ... });
    it('handles all-zero alpha map (no-op)', () => { ... });
    it('handles all-max alpha map (0.99) without pixel overflow', () => { ... });
    it('handles floating point position (x=0.5, y=0.3)', () => { ... });
});

describe('Robustness: detectWatermark edge cases', () => {
    it('returns null for 1x1 image', () => { ... });
    it('returns null for 2x2 image', () => { ... });
    it('returns null for pure black image', () => { ... });
    it('returns null for pure white image', () => { ... });
    it('handles empty alphaMaps object', () => { ... });
    it('handles NaN in alpha map data without crash', () => { ... });
});

describe('Robustness: calculateCorrelation edge cases', () => {
    it('returns 0 for identical constant regions', () => { ... });
    it('returns positive for perfect positive correlation', () => { ... });
    it('handles out-of-bounds coordinates gracefully', () => { ... });
    it('returns 0 for insufficient pixel count', () => { ... });
});

describe('Robustness: calculateAlphaMap edge cases', () => {
    it('handles pure black image (all zeros)', () => { ... });
    it('handles pure white image (all 255)', () => { ... });
    it('produces values in [0, 1] range', () => { ... });
    it('correctly applies BT.709 weights', () => { ... });
});
```

**预计用例**: ~20个

---

### 任务 3.2: 多遍次移除回归测试

**新建文件**: `tests/multipass_regression.test.js`

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeRepeatedWatermarkLayers } from '../src/core/multiPassRemoval.js';
import { removeWatermark } from '../src/core/blendModes.js';
import { createMockImageData, createMockAlphaMap, applyWatermark } from './test_utils.js';

describe('Multi-Pass Regression: safety gates', () => {
    it('stops at residual-low for normal watermark', () => {
        // 注入标准水印, 多遍次后应在 residual-low 停止
    });

    it('stops at safety-near-black for high-alpha watermark on dark background', () => {
        // 暗色背景 + 高alpha水印, 应触发近黑保护
    });

    it('stops at safety-texture-collapse for extreme alpha', () => {
        // 极端alpha导致纹理崩溃
    });

    it('stops at max-passes when residual persists', () => {
        // 设置极低 residualThreshold 使其始终达不到
    });

    it('correctly records pass metadata', () => {
        // 验证 passes 数组结构完整
    });

    it('handles object-style call signature', () => {
        // 验证 { imageData, alphaMap, position } 调用方式
    });

    it('respects startingPassIndex', () => {
        // 验证 startingPassIndex > 0 的场景
    });

    it('gradientDelta is computed (not hardcoded 0) after BUG-6 fix', () => {
        // 验证 gradientDelta 有实际值
    });
});
```

**预计用例**: ~8个

---

### 任务 3.3: CLI参数解析与集成测试补充

**修改文件**: `tests/cli.integration.test.js` (已存在, 需确认覆盖度)

**补充测试用例**:

```javascript
describe('CLI: parseArgs edge cases', () => {
    it('defaults profile to gemini', () => { ... });
    it('defaults format to png', () => { ... });
    it('parses --profile doubao', () => { ... });
    it('parses --format webp', () => { ... });
    it('parses --no-deepScan', () => { ... });
    it('parses --noiseReduction', () => { ... });
    it('parses --overwrite', () => { ... });
    it('parses --pipe', () => { ... });
    it('parses --probeThreshold 0.25', () => { ... });
    it('parses --fallbackThreshold 0.30', () => { ... });
    it('parses --gradientPenalty 0.50', () => { ... });
    it('handles unknown flags gracefully', () => { ... });
});
```

**预计用例**: ~12个

---

## Sprint 4: app.js 拆分 + overrides连通 (第4周)

### 任务 4.1: 拆分 app.js 为模块

**当前状态**: `src/app.js` 730行，包含初始化、事件绑定、拖拽处理、文件处理、UI更新、视图切换、放大镜、滑块、快捷键、设置、剪贴板。

**拆分方案**:

```
src/app/
├── state.js        (已有, 保持不变)
├── ui.js           (已有, 保持不变)
├── processing.js   (已有, 保持不变)
├── dragDrop.js     (新建, 从app.js提取)
├── keyboard.js     (新建, 从app.js提取)
├── settings.js     (新建, 从app.js提取)
├── viewModes.js    (新建, 从app.js提取)
└── magnifier.js    (新建, 从app.js提取)
```

**各模块职责**:

| 模块 | 导出 | 来源行号 |
|------|------|---------|
| `dragDrop.js` | `setupWindowDragAndDrop`, `handleDropEvent`, `handleFiles`, `handleUrl`, `handleDataTransferItems`, `isSupportedImageFile` | 187-377 |
| `keyboard.js` | `setupKeyboardShortcuts`, `handleKeyDown` | 693-711 |
| `settings.js` | `saveSettings`, `loadSettings`, `setupLanguageSelector`, `getEngineOptions` | 572-664 |
| `viewModes.js` | `switchViewMode`, `setupSlider`, `updateStatsUI`, `applyProfileTheme` | 492-521, 605-641 |
| `magnifier.js` | `setupMagnifier` | 523-558 |

**重构后的 `src/app.js`** (~120行):

```javascript
import i18n from './i18n.js';
import { WatermarkEngine } from './core/watermarkEngine.js';
import { showLoading, showLoadingFail, hideLoading } from './utils.js';
import { getAllProfiles } from './core/profiles.js';
import { state, objectUrlManager } from './app/state.js';
import { AuditLog, showToast, resetGlobalProgress } from './app/ui.js';
import { processSingle, processQueue } from './app/processing.js';
import { setupWindowDragAndDrop, handleDropEvent, handleFiles } from './app/dragDrop.js';
import { setupKeyboardShortcuts } from './app/keyboard.js';
import { setupLanguageSelector, saveSettings, loadSettings, getEngineOptions } from './app/settings.js';
import { switchViewMode, setupSlider, applyProfileTheme } from './app/viewModes.js';
import { setupMagnifier } from './app/magnifier.js';

const elements = { /* ... 保持不变 ... */ };

async function init() { /* ... 保持不变 ... */ }
function setupEventListeners() { /* ... 简化, 调用子模块 ... */ }
function updateSingleUI() { /* ... 保持不变 ... */ }
function createImageCard() { /* ... 保持不变 ... */ }
function updateCardUI() { /* ... 保持不变 ... */ }
function updateCardErrorUI() { /* ... 保持不变 ... */ }
function resetWorkspace() { /* ... 保持不变 ... */ }

init();
```

**实施步骤**:
1. 创建 `dragDrop.js`，提取并测试
2. 创建 `keyboard.js`，提取并测试
3. 创建 `settings.js`，提取并测试 — 同时修复 BUG-7 (overrides)
4. 创建 `viewModes.js`，提取并测试
5. 创建 `magnifier.js`，提取并测试
6. 重写 `app.js` 为薄入口
7. 运行 `pnpm dev` 浏览器测试
8. 运行 `pnpm build` 确认构建正常

---

### 任务 4.2: 连通 overrides (BUG-7 完整修复)

在 `settings.js` 的 `getEngineOptions()` 中加入 `overrides` 对象 (具体方案见任务 1.4)。

**额外需要**: 在 `public/index.html` 中确认 advanced panel 的 slider 元素 ID 与代码引用一致。

---

## Sprint 5: CLI多遍次移除 (第5周)

### 任务 5.1: CLI Engine 加入多遍次移除

**详细实现**: 见任务 1.5

**步骤**:
1. 在 `gwrRemoveCommand.js` 顶部添加 import
2. 替换 `processBuffer` 方法中第114-116行的简单循环
3. 确保 gemini profile 使用多遍次 + 校准，其他 profile 使用单次移除
4. 处理 `imageData.data` 的正确赋值 (避免引用丢失)

### 任务 5.2: CLI Engine processBuffer 添加 JSON 输出增强

```javascript
// 在返回结果中增加多遍次信息
return {
    buffer: outputBuffer,
    detection: winner.config.isOfficial ? 'catalog' : 'heuristic',
    confidence: winner.confidence,
    config: winner.config,
    removedCount: removedCounter,
    profileId: detection.profileId,
    source: winner.source,
    multiPassUsed: detection.matches.some(m => m.profileId === 'gemini'),
    decisionTier: detection.decisionTier
};
```

### 任务 5.3: CLI集成测试更新

更新 `tests/cli.integration.test.js` 确保多遍次路径被覆盖。

---

## Sprint 6: 新增P1/P2测试 + 回归验证 (第6周)

### 任务 6.1: Alpha校准精度测试

**新建文件**: `tests/alpha_calibration_rect.test.js`

```javascript
describe('Alpha Calibration: rectangular watermark support', () => {
    it('calibrates square watermark (96x96) correctly', () => { ... });
    it('calibrates rectangular watermark (401x173) correctly', () => {
        // 覆盖 BUG-2 修复
    });
    it('returns null when shouldRecalibrateAlphaStrength is false', () => { ... });
    it('rejects gain that increases near-black ratio', () => { ... });
    it('respects MIN_RECALIBRATION_SCORE_DELTA', () => { ... });
    it('handles edge case: position at image boundary', () => { ... });
});
```

**预计用例**: 6个

---

### 任务 6.2: Profile与Catalog集成测试

**新建文件**: `tests/profile_catalog_consistency.test.js`

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, getProfile, getAllProfiles } from '../src/core/profiles.js';
import { getAllCatalogConfigs, getCatalogConfig } from '../src/core/catalog.js';
import { registry } from '../src/core/templates/registry.js';

describe('Profile-Catalog Consistency', () => {
    it('every profile has required fields', () => {
        for (const profile of getAllProfiles()) {
            assert.ok(profile.id);
            assert.ok(profile.name);
            assert.ok(typeof profile.logoValue === 'number');
            assert.ok(Array.isArray(profile.anchors));
        }
    });

    it('doubao has both top-left and bottom-right anchors', () => { ... });
    it('doubao catalog entries have correct anchor assignment', () => { ... });
    it('dalle3 catalog entry has bottom-left anchor', () => { ... });
    it('getHeuristicConfig returns finite numbers for standard resolutions', () => { ... });
    it('getHeuristicConfig returns finite numbers for extreme resolutions (1x1, 8192x8192)', () => { ... });
    it('every catalog entry has valid dimensions', () => {
        for (const profile of getAllProfiles()) {
            const catalog = registry.getCatalog(profile.id);
            for (const entry of catalog) {
                assert.ok(entry.width > 0, `width > 0 for ${profile.id}`);
                assert.ok(entry.height > 0, `height > 0 for ${profile.id}`);
            }
        }
    });
    it('gemini catalog covers all documented aspect ratios', () => { ... });
    it('scaled catalog configs produce valid logo sizes', () => { ... });
});
```

**预计用例**: ~10个

---

### 任务 6.3: 并发与内存安全测试

**新建文件**: `tests/concurrent_safety.test.js`

```javascript
describe('Concurrent Safety', () => {
    it('detectWatermark does not share mutable state across calls', async () => {
        // 并发调用 detectWatermark 两次, 结果应独立
    });

    it('registry remains consistent after duplicate registration', () => {
        // 重复注册同一 profile 不应产生重复条目
    });

    it('resetDetectorBuffers clears all pooled memory', () => { ... });

    it('objectUrlManager tracks and releases all URLs', () => {
        // 创建 100 个 URL, 然后 clear, 验证集合为空
    });
});
```

**预计用例**: ~6个

---

### 任务 6.4: SDK类型一致性测试

**新建文件**: `tests/sdk_contract.test.js`

```javascript
import * as sdk from '../src/sdk/index.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('SDK Contract: exports exist and are callable', () => {
    const expectedFunctions = [
        'detectWatermarks', 'detectProfileWatermarks', 'getProfilesToTry',
        'detectWatermark', 'calculateProbeConfidence', 'calculateCorrelation',
        'calculateGradientCorrelation', 'resetDetectorBuffers',
        'detectAdaptiveWatermarkRegion', 'interpolateAlphaMap', 'warpAlphaMap',
        'refineSubpixelOutline', 'classifyStandardWatermarkSignal',
        'classifyAdaptiveWatermarkSignal', 'decideDetectionTier',
        'removeRepeatedWatermarkLayers', 'recalibrateAlphaStrength',
        'shouldRecalibrateAlphaStrength', 'calculateAlphaMap',
        'removeWatermark', 'calculateWatermarkPosition', 'detectWatermarkConfig',
        'getAllPotentialConfigs', 'getProfile', 'getAllProfiles',
        'calculateMSE', 'calculatePSNR', 'calculateSSIM', 'estimateQualityFromPSNR'
    ];

    for (const name of expectedFunctions) {
        it(`exports ${name} as a function`, () => {
            assert.ok(typeof sdk[name] === 'function', `${name} is not a function`);
        });
    }

    it('exports PROFILES as an object', () => { ... });
    it('exports DEFAULT_PROFILE with id', () => { ... });
    it('exports GEMINI_PROFILE with id gemini', () => { ... });
    it('exports ENGINE_LIMITS with MAX_PIXELS', () => { ... });
    it('exports RestorationMetrics with calculateMSE', () => { ... });
    it('WatermarkEngine has static create method', () => { ... });
    it('WatermarkEngine instance has destroy method', () => { ... });
});
```

**预计用例**: ~35个

---

### 任务 6.5: 图像质量回归测试

**新建文件**: `tests/image_quality_regression.test.js`

```javascript
describe('Image Quality Regression', () => {
    it('standard watermark removal: PSNR > 35dB', () => {
        // 注入水印 → 移除 → 与原始对比 PSNR
    });

    it('no false positive on clean image', () => {
        // 无水印图像应返回 detection='none'
    });

    it('cropped image still detects and removes watermark', () => { ... });
    it('non-standard aspect ratio (21:9) processes correctly', () => { ... });
    it('processing same image twice produces stable result', () => {
        // 第一次移除后, 第二次应检测不到水印
    });
    it('doubao watermark detection and removal', () => { ... });
});
```

**预计用例**: ~8个

---

### 任务 6.6: 回归验证

运行完整测试套件:
```bash
pnpm test:all
```

确认:
1. 原有 421 个测试全部通过
2. 新增 ~73 个测试全部通过
3. 总测试数 ≥ 494

---

## Sprint 7: 功能补全 (第7-8周)

### 任务 7.1: 真正的 SSIM 实现

**文件**: `src/core/restorationMetrics.js`

替换假的 `calculateSSIM`，实现基于滑动窗口的 SSIM:

```javascript
calculateSSIM(buffer1, buffer2, windowSize = 8) {
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    // 标准滑动窗口 SSIM 实现
    // 返回 [0, 1] 范围的质量分数
}
```

**注意**: 需要接收 width/height 参数来构建2D结构，当前接口只接受 buffer。需要扩展接口为 `(buffer1, buffer2, width, height)`。

---

### 任务 7.2: CHANGELOG 建立

**新建文件**: `CHANGELOG.md`

```markdown
# Changelog

## [2.3.0] - TBD
### Fixed
- alphaCalibration now correctly handles rectangular watermarks (doubao/dalle3)
- CLI Engine now uses multi-pass removal matching browser quality
- Advanced panel overrides are now properly passed to detection pipeline
- Removed dead code (gradientDelta) in multiPassRemoval
- Fixed indentation inconsistency in detector.js calculateProbeConfidence

### Changed
- Extracted shared utility functions (cloneImageData, calculateNearBlackRatio, regionStdDev) to core/utils.js
- Split app.js (730 lines) into 5 focused modules

### Added
- gradientDelta now computed in multiPassRemoval passes
- ~70 new test cases covering edge cases, regression, and integration

## [2.2.0] - 2026-05-XX
...
```

---

### 任务 7.3: 油猴脚本增强 (可选)

基于原分支 `src/page/` + `src/shared/` 的实现，增强 userscript:

1. **预览替换**: 在 Gemini 页面中检测到图像后，用处理过的图像替换缩略图
2. **处理中叠加层**: 显示 "Processing..." 覆盖在原始图像上
3. **Fetch拦截**: 拦截 Gemini 的 fetch 请求，替换下载/复制操作返回的图像
4. **popup UI**: 简单的状态面板显示已处理图像数量

**预计工时**: 8h

---

## 验证检查清单

### 每个 Sprint 结束时必须通过:

```bash
# 1. 所有测试通过
pnpm test:all

# 2. Lint通过
pnpm lint

# 3. 构建成功
pnpm build

# 4. CLI基本功能验证
node bin/gwr.mjs --version
node bin/gwr.mjs remove --help

# 5. 浏览器功能验证 (手动)
pnpm dev
# → 在浏览器中打开, 拖入测试图片, 验证移除功能正常
```

### v2.3.0 发布前必须通过:

```bash
# 完整测试套件
pnpm test:all && python -m unittest tests/test_bridge_integration.py

# 预期结果: 总测试数 ≥ 490, 0 失败

# 跨环境验证
node bin/gwr.mjs remove sample/test_image.png --output /tmp/test_output.png --json
# → 验证 JSON 输出格式和 multiPassUsed 字段
```

---

## 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| app.js 拆分引入DOM绑定回归 | 中 | 高 | 每个模块拆分后立即浏览器测试 |
| 多遍次移除在CLI中性能下降 | 低 | 中 | 设置合理的默认maxPasses=4 |
| 共享工具提取引入细微行为差异 | 低 | 高 | 严格对比提取前后的测试结果 |
| 原分支合并冲突 | 中 | 低 | 基于v2.2.0独立开发，不合并原分支 |

---

> 本计划预计总工时: ~60h | 目标: v2.3.0 稳定发布
