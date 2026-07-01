# 综合阶段计划 v2.6 — 现阶段诊断、根因与修复蓝图

> ⚠️ **历史归档（2026-07-01）**：本文基于 v2.5.1/v2.6 前期代码，仅保留用于追溯。不要据此实现或判断当前行为；现行合同参见 [ROADMAP.md](./ROADMAP.md) 与 [TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md)。

> **文档版本**: 2026-06-16 完整诊断（基于 2026-06-14 v2.5.1 基线的增量更新）  
> **分析对象**: `@lastraindrop/gemini-watermark-remover` package.json v2.5.1  
> **上游对比**: `@pilio/gemini-watermark-remover` v1.0.23 (GargantuaX/gemini-watermark-remover, HEAD `0cc5554`)  
> **前序文档**: `COMPREHENSIVE_STAGE_PLAN.md` (2026-06-14 基线)、`FRONTEND_DIAGNOSTIC_REPORT.md`  
> **诊断动机**: 用户反馈两类问题 —— ①部分图像未命中；②去除水印后出现微小偏差  
> **执行纪律**: 本文档为**计划文档**，需用户确认后方可执行任何代码修改

---

## 目录

0. [执行摘要（TL;DR）](#0-执行摘要)
1. [总体架构工程与设计审计](#1-总体架构工程与设计审计)
2. [与原分支 GargantuaX 对比分析](#2-与原分支-gargantuax-对比分析)
3. [完整 Code Review 与 BUG 清单](#3-完整-code-review-与-bug-清单)
4. [用户痛点根因分析（未命中 + 微小偏差）](#4-用户痛点根因分析)
5. [现阶段工作总结与健康度评分](#5-现阶段工作总结与健康度评分)
6. [单元测试与验证体系设计](#6-单元测试与验证体系设计)
7. [修复计划（分阶段、具体到行号）](#7-修复计划分阶段具体到行号)
8. [执行检查清单（Definition of Done）](#8-执行检查清单)
9. [附录：诊断证据索引](#9-附录诊断证据索引)

---

## 0. 执行摘要

### 0.1 当前代码库真实状态

`COMPREHENSIVE_STAGE_PLAN.md`（2026-06-14）列出的 5 个 Critical/High BUG 中，**4 个已在 v2.5.1 修复**（C1 梯度公式一致、C2 adaptive 阈值统一、H1 ObjectURL 顺序、H2 Worker 僵尸回收、H3 探针内存池）。代码库健康度比 2 天前显著提升。

但本次诊断发现 **新的、更深层的问题**，且**直接对应用户反馈的两个痛点**：

### 0.2 两大核心结论

#### 结论 ①：微小偏差的"冒烟枪"——亚像素精修是死代码

- `adaptiveDetector.js:412-488` 定义了完整的 `refineSubpixelOutline()`（亚像素位移+缩放精修）
- `src/sdk/index.js:4` 导出它
- `tests/adaptive_detector.test.js:91-97` 测试它
- **但 `applyRemoval.js` / `multiPassRemoval.js` / `watermarkEngine.js` 从未调用它**
- 同时上游 `restorationMetrics.js` 的 `assessAlphaBandHalo()` / `assessRemovalDiffArtifacts()` 在本分支完全缺失
- 上游 `watermarkProcessor.js`（~1300 行）有"模板变形 / 暗目录微调 / 弱残差微调 / 边缘清理"等 8 个精修阶段，本分支只有"多遍移除 + 增益校准"2 个

**用户看到的"微小偏差"= 没有精修闭环 + `Math.round` 量化 + Alpha 噪声底残留 + 双线性采样边缘衰减** 的叠加效应。

#### 结论 ②：未命中=已知弱区 + 落后上游 3 个关键 commit

- `tests/detection_recall.test.js` 自证：纯色背景阈值 0.08（标准 0.15）、亮背景阈值 0.05 —— 开发者**已知**这些是检测弱区
- 上游 `geminiSizeCatalog.js` 支持 `2k-new-margin`(96/192px)、`v2-small`(36px)、`large-margin`，本分支 `catalogs.json` 不支持
- 上游 3 个直接相关 commit 本分支未拉取：
  - `7f9e450` (2026-06-14) "fix: handle new Gemini watermark anchors"
  - `f9f6ae9` "fix: handle Gemini weak-alpha watermark variant"
  - `07a1c2d` "Improve Gemini watermark candidate detection"

### 0.3 修复路径预览

| 阶段 | 目标 | 关键动作 |
|------|------|---------|
| Phase A | 死代码激活 | 将 `refineSubpixelOutline` 接入 `applyRemovalStrategy` 移除路径 |
| Phase B | 精度闭环 | 移植 `assessAlphaBandHalo` + 差分伪影检测 + 暗目录微调 |
| Phase C | 召回率提升 | 拉取上游新 catalog 变体 + 平滑/亮背景专项优化 |
| Phase D | 一致性收尾 | 硬编码迁移、文档对齐、版本号统一 |
| Phase E | 测试网 | 25+ 个针对性单元测试 + 真实样本回归集 |

---

## 1. 总体架构工程与设计审计

### 1.1 分层架构（v2.5.1 现状）

```
┌──────────────────────────────────────────────────────────────┐
│ 入口层  Web(app.js+app/*) │ CLI(cli.js+cli/*) │ Python │ 油猴 │
├──────────────────────────────────────────────────────────────┤
│ SDK 层  src/sdk/index.js + index.d.ts                        │
├──────────────────────────────────────────────────────────────┤
│ 核心层 src/core/ (19 模块)                                    │
│  ┌─ 配置中心  config.js (DETECTION_THRESHOLDS, PRESETS)      │
│  ├─ 检测管线  detectionPipeline.js (5 阶段编排)              │
│  │   ├ Phase 1   Catalog Probe                               │
│  │   ├ Phase 1.4 resolveBestTemplateOrder (48/96 选择)       │
│  │   ├ Phase 2   Scaled Catalog                              │
│  │   ├ Phase 3   Heuristic Probe                             │
│  │   ├ Phase 4   Adaptive (adaptiveDetector.js)             │
│  │   └ Phase 5   Global Fallback (detector.js)              │
│  ├─ 检测核心  detector.js (NCC + Sobel 梯度 + 方差 三维评分) │
│  ├─ 决策层    decisionPolicy.js (三级分类)                   │
│  ├─ 移除管线  applyRemoval.js (统一入口)                     │
│  │   ├ blendModes.js       (反向 Alpha 混合 + 双线性采样)    │
│  │   ├ multiPassRemoval.js (4 遍迭代 + 4 个安全门)           │
│  │   └ alphaCalibration.js (增益校准，只向上搜索)            │
│  ├─ ⚠️ 死代码 adaptiveDetector.refineSubpixelOutline         │
│  ├─ 引擎编排  watermarkEngine.js                             │
│  ├─ 并行      worker.js + workerPool.js (v2.5.1 已修僵尸)    │
│  └─ 工具      utils.js, alphaMap.js, restorationMetrics.js   │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 架构优点（继承自 v2.5）

| 维度 | 评价 | 证据 |
|------|------|------|
| 统一检测管线 | ✅ 优秀 | 三入口共享同一 `detectWatermarks → applyRemovalStrategy` |
| 配置中心化 | ✅ 良好 | `DETECTION_THRESHOLDS` 26 常量 + `PERFORMANCE_PRESETS` 三档 |
| 内存池化 | ✅ 已修 | BUG-H3 已修，`calculateProbeConfidence` 现复用缓冲区 |
| Worker 降级 | ✅ 已修 | BUG-H2 已修，超时 worker 现终止并替换 |
| 决策可解释 | ✅ 良好 | `decisionPolicy.js` 三级分类 + source/confidence |
| 多 Profile | ✅ 良好 | Gemini + Doubao + DALL-E 3 |

### 1.3 架构问题（v2.5.1 仍存在 + 新发现）

#### 问题 A：**移除管线缺失"精修闭环"——本分支相对上游的最大架构缺陷**

**严重度**: Critical（直接对应用户反馈"微小偏差"）

上游 `watermarkProcessor.js`（~1300 行）的完整处理管道有 **8 个阶段**：
1. 初始候选选择
2. **模板变形（subpixel outline refinement）** ← 本分支死代码
3. Alpha 增益校准（recalibration, over-subtraction） ← 本分支有简化版
4. **暗目录微调（dark catalog fine-tune）** ← 本分支无
5. **弱正残差微调（weak positive residual fine-tune）** ← 本分支无
6. **背景清理（preview background cleanup）** ← 本分支无
7. **边缘清理（known-48 edge, v2-small edge）** ← 本分支无
8. **小锚点重定位** ← 本分支无

本分支 `applyRemovalStrategy()`（applyRemoval.js:52-113）只有：
- `estimateAlphaGain` → 预缩放 alpha → `removeRepeatedWatermarkLayers`（4 遍）→ 可选 `recalibrateAlphaStrength`

**缺失的 6 个精修阶段就是"微小偏差"的直接来源**。其中第 2 阶段（模板变形）的算法在本分支已实现（`refineSubpixelOutline`）却未接入。

#### 问题 B：`detector.js` 仍为巨型模块（821 行）

**严重度**: Medium（未恶化，但未改善）

5 个职责仍混在一起：内存池 / 全局搜索 / NCC 计算 / 局部对比度 / 探针置信度 / 梯度 NCC / 方差评分 / 降噪。上游将同类功能拆分为 `watermarkScoring.js` + `candidateSelector.js` + `watermarkPresence.js`。

#### 问题 C：模块级单例 `_defaultContext`（detector.js:46）

**严重度**: Medium（未变）

`detectWatermark()` 默认参数使用模块级单例，主线程 + Worker 间逻辑隔离下安全，但 `detectionPipeline.js:210` 已显式 `new DetectorContext()` 规避，说明设计本身有风险。

#### 问题 D：`regionStdDev`（utils.js:58）缺少 y 方向越界检查

**严重度**: Low（实际由 `maxY` 兜底，但不一致）

```javascript
// utils.js:61
if (x < 0 || y < 0 || x + rw > imgWidth || rw <= 0 || rh <= 0) return 0;
// ❌ 缺少 y + rh > imgHeight 检查；仅靠 maxY = min(y+rh, ...) 兜底
```

且 `variance = max(0, sq/n - mean*mean)` 在 mean 较大时存在灾难性消去（数值精度问题，贡献到"微小偏差"）。

#### 问题 E：`estimateAlphaGain`（applyRemoval.js:47）的中心像素假设

**严重度**: Medium

```javascript
const templateAlpha = alphaMap[Math.floor(height / 2) * width + Math.floor(width / 2)];
```

假设水印"星形"中心位于 alpha 图正中。对 Gemini 标准 watermark 成立，但：
- Doubao 矩形水印中心可能不在视觉中心
- 48px/96px 模板的"星"几何中心可能偏移
- 若 `templateAlpha ≤ 0.01`（applyRemoval.js:48），直接返回 gain=1，跳过校准 → 残留

#### 问题 F：`recalibrateAlphaStrength` 增益候选只向上（alphaCalibration.js:15）

**严重度**: Low（设计意图，但限制场景）

```javascript
const ALPHA_GAIN_CANDIDATES = [1.05, 1.12, 1.2, 1.28, ..., 2.6];  // 全部 ≥ 1.05
```

仅当多遍后残差仍高（欠校正）才触发。若 `estimateAlphaGain` 高估（过校正），无机制向下修正。当前依赖"first-pass-sign-flip"安全门（multiPassRemoval.js:153）兜底，但兜底即停止 = 残留偏差。

---

## 2. 与原分支 GargantuaX 对比分析

### 2.1 战略方向分叉（更新版）

| 维度 | 上游 `@pilio` v1.0.23 | 本分支 `@lastraindrop` v2.5.1 |
|------|----------------------|-------------------------------|
| 产品定位 | Gemini 页面集成 + Chrome 扩展 + 油猴 + 视频去水印 | 独立多平台批量处理工具 |
| **移除管线深度** | ✅ 8 阶段（含水印变形/边缘清理/暗目录微调） | ❌ **2 阶段（多遍+校准）** |
| **质量评估** | ✅ Halo/伪影/残差可见性三维评估 | ❌ **仅 PSNR，无 Halo 检测** |
| 视频水印 | ✅ 完整（含 AI 降噪 FDnCNN） | ❌ 无 |
| AI 降噪 | ✅ ONNX/FDnCNN | ❌ 无 |
| 新 Catalog 变体 | ✅ 2k-new-margin, v2-small(36px), large-margin | ❌ **不支持** |
| 多 Profile | ❌ 仅 Gemini | ✅ Gemini + Doubao + DALL-E 3 |
| 五层检测管线 | ❌ 单层 | ✅ Catalog→Scaled→Heuristic→Adaptive→Global |
| 三维评分 | ❌ 纯 NCC | ✅ spatial×0.5+gradient×0.3+variance×0.2 |
| 性能预设 | ❌ 无 | ✅ fast/balanced/thorough |
| 决策分层 | ❌ 无 | ✅ 三级 |
| Python 桥 | ❌ 无 | ✅ 有 |
| 多语言 | ❌ 中英 | ✅ 7 语言 |
| E2E 测试 | ✅ Playwright | ❌ 无 |

### 2.2 上游已修复、本分支未拉取的关键 commit（按相关性排序）

| Commit | 日期 | 标题 | 对用户痛点的影响 |
|--------|------|------|------------------|
| `7f9e450` | 2026-06-14 | fix: handle new Gemini watermark anchors | **🔴 直接修复未命中** |
| `f9f6ae9` | 2026-06-07 | fix: handle Gemini weak-alpha watermark variant | **🔴 直接修复未命中** |
| `07a1c2d` | 2026-06-08 | Improve Gemini watermark candidate detection | **🟡 提升召回率** |
| `634c1e4` | 2026-06-12 | Make located watermark removal aggressive | 🟡 移除强度 |
| `c09c6d9` | 2026-06-12 | feat: add strong located review sheet and scripts | 🟢 调试工具 |
| `ce92d12` | 2026-06-12 | Add WebGPU asyncify runtime assets and tests | 🟢 视频相关 |

**建议**: 建立上游同步机制。不一定要 cherry-pick 全部（视频/AI 降噪与本分支定位不符），但 `7f9e450`、`f9f6ae9`、`07a1c2d` 三个的算法逻辑需要移植。

### 2.3 关键模块对比（精确到文件）

```
上游 src/core/ (含 watermarkProcessor 1300行 + 8阶段精修) 
   vs
本分支 src/core/ (仅 applyRemoval.js 114行 + 2阶段)
```

| 上游能力 | 本分支状态 | 缺口位置 |
|---------|-----------|---------|
| `watermarkProcessor.js` 模板变形 | ⚠️ 算法已移植（adaptiveDetector.refineSubpixelOutline）但**未接入** | `applyRemoval.js` 应在多遍后调用 |
| `restorationMetrics.assessAlphaBandHalo` | ❌ 完全缺失 | 需新增到 `restorationMetrics.js` |
| `restorationMetrics.assessRemovalDiffArtifacts` | ❌ 完全缺失 | 需新增 |
| `watermarkScoring.scoreOriginalEvidence/Residual/Damage` | ❌ 简化为 `decisionPolicy` | 可扩展 |
| `geminiSizeCatalog.js` 新变体 | ❌ catalogs.json 未含 | 需补充条目 |
| `embeddedAlphaMaps['96-20260520']` | ❌ 缺失 | 需提取并嵌入 |

### 2.4 版本号一致性（v2.5.1 已大幅改善）

ROADMAP 声称 v2.5.1 已"Version sync: package.json 2.2.3→2.5.1; 5 phantom v2.6 comments cleaned"。本次抽查：
- `package.json:4` = `2.5.1` ✅
- README/ROADMAP 标题 = v2.5.1 ✅
- 仍需抽查代码注释中是否还有 `v2.6` 残留

---

## 3. 完整 Code Review 与 BUG 清单

> **优先级标记**: 🔴 Critical（阻塞用户）/ 🟠 High / 🟡 Medium / ⚪ Low  
> **新增标记**: [NEW] 本诊断新发现；[FIXED] v2.5.1 已修；[PENDING] 来自 2026-06-14 仍未处理

### 3.1 Critical 级

#### BUG-C3 [NEW] 🔴 亚像素精修死代码 —— 微小偏差首要根因

**文件**: `src/core/applyRemoval.js:52-113`（缺失调用）+ `src/core/adaptiveDetector.js:412-488`（被定义）  
**证据**: grep `refineSubpixelOutline` 全仓库，仅出现在定义、SDK 导出、SDK 类型声明、3 个测试断言中。**实际移除路径无任何调用**。

**影响**: `applyRemovalStrategy` 走完"多遍移除 + 可选校准"后即结束，没有对最终结果的"亚像素位移 + 缩放"精修。用户看到的 1-2 像素级色偏/位置偏移即来源于此。

**修复位置**: `src/core/applyRemoval.js:108` 附近，在 `imageData.data.set(multiPassResult.imageData.data)` 之前插入 `refineSubpixelOutline` 调用。

#### BUG-C4 [NEW] 🔴 缺失 Halo / 差分伪影检测 —— 微小偏差次要根因

**文件**: `src/core/restorationMetrics.js`（缺失方法）  
**证据**: 当前 `restorationMetrics.js` 仅有 PSNR/MSE/SSIM。上游有 `assessAlphaBandHalo()`（Alpha 边带光晕）、`assessRemovalDiffArtifacts()`（差分伪影）、`assessWatermarkResidualVisibility()`（残差可见性）。

**影响**: 没有"伪影检测"就没有"伪影反馈"，多遍移除的安全门只看 NCC 残差，看不到光晕/色带/边缘泄漏。

**修复位置**: 新增方法到 `src/core/restorationMetrics.js`，并在 `applyRemoval.js` 或 `multiPassRemoval.js` 接入。

#### BUG-C5 [NEW] 🔴 上游新 Gemini 水印锚点未支持 —— 未命中首要根因

**文件**: `src/core/catalogs.json` + `src/core/profiles.js`  
**证据**: 上游 commit `7f9e450` (2026-06-14) "fix: handle new Gemini watermark anchors" 表示有新的锚点配置。本分支 `catalogs.json` 和 `profiles.js:12-17` 的 tier 定义停留在 48/96px + 32/64 边距。

**影响**: 新版 Gemini 输出图（2026 年 5 月后）的水印位置/尺寸超出本分支 catalog，Phase 1 catalog 探针失败，依赖后续 Phase 2-5 兜底，但兜底阈值更高，未命中概率显著上升。

**修复位置**: 解析上游 `geminiSizeCatalog.js` 的 `2k-new-margin`、`v2-small`、`large-margin` 三类变体，补充到 `catalogs.json` + 更新 `profiles.js:12-17`。

### 3.2 High 级

#### BUG-H4 [NEW] 🟠 `refineSubpixelOutline` 假设方形水印

**文件**: `src/core/adaptiveDetector.js:428, 442`  
```javascript
const size = position.width;          // ❌ 假设方形
if (!size || size <= 8) return null;
// ...
const gradientsI = new Float32Array(size * size);  // ❌ size*size
```

**影响**: 即使接入 `refineSubpixelOutline`，对 Doubao（401×173）/DALL-E（120×40）矩形水印会越界或计算错误。

**修复位置**: `adaptiveDetector.js:428-462` 全部改为 `position.width × position.height`。

#### BUG-H5 [NEW] 🟠 `estimateAlphaGain` 中心像素假设脆弱

**文件**: `src/core/applyRemoval.js:47`  
见 §1.3 问题 E。当模板中心 alpha ≤ 0.01 时直接返回 gain=1，跳过校准。

**修复位置**: 改为"取 alpha 图最大值"或"前 10% 分位数"作为 templateAlpha 参考值。

#### BUG-H6 [PENDING] 🟠 detector.js:604 表达式混淆

**文件**: `src/core/detector.js:604`  
```javascript
} else if (nccConf >= DETECTION_THRESHOLDS.EXACT_NCC_GATE + DETECTION_THRESHOLDS.GRADIENT_BOOST_GATE_EXACT - DETECTION_THRESHOLDS.EXACT_NCC_GATE) {
```

`EXACT_NCC_GATE + X - EXACT_NCC_GATE` 两项抵消，等价于 `nccConf >= GRADIENT_BOOST_GATE_EXACT`（0.12）。**数值当前正确**（与原 `0.12` 一致），但写法极度混淆，未来调整 `EXACT_NCC_GATE` 时会埋雷。

**修复位置**: 直接改为 `nccConf >= DETECTION_THRESHOLDS.GRADIENT_BOOST_GATE_EXACT`。

#### BUG-H7 [PENDING] 🟠 文档/README 测试计数过时

ROADMAP 自称"417 tests"，COMPREHENSIVE_STAGE_PLAN.md 称"实际 417 测试用例"。需重新核验当前真实计数并同步所有文档。

### 3.3 Medium 级

| ID | 文件:行 | 描述 |
|----|---------|------|
| BUG-M5 | `utils.js:61` | `regionStdDev` 缺 y 方向越界检查（仅靠 maxY 兜底） |
| BUG-M6 | `utils.js:76` | `variance = sq/n - mean*mean` 灾难性消去风险 |
| BUG-M7 | `applyRemoval.js:64` | `Float32Array.from` 预缩放在多遍间仍累积微小误差 |
| BUG-M8 | `blendModes.js:96` | `ALPHA_NOISE_FLOOR = 3/255` 过高，faint 水印残留 |
| BUG-M9 | `blendModes.js:111` | `Math.round` 每通道 ±0.5 量化，平滑区产生色带 |
| BUG-M10 | `alphaCalibration.js:114` | `MIN_RECALIBRATION_SCORE_DELTA=0.10` 偏高，0.09 改善被放弃 |
| BUG-M11 | `detectionPipeline.js:323-325` | adaptive 仅在 matches 为空或弱时触发，强 catalog 弱匹配会压制 adaptive |
| BUG-M12 | `detector.js:392` | 平滑背景 `varI<=0.0001` 返回 0.001，低于所有阈值 → 必然未命中 |
| BUG-M13 | `multiPassRemoval.js:58` | `assessReferenceTextureAlignment` 阈值 0.5/30 硬编码 |

### 3.4 Low 级

| ID | 文件:行 | 描述 |
|----|---------|------|
| BUG-L1 | `detector.js:807-821` | `@deprecated` 属性访问器仍保留 |
| BUG-L2 | `detectionPipeline.js:172-173` | `MIN_SWITCH_SCORE=0.25`, `MIN_SCORE_DELTA=0.10` 硬编码 |
| BUG-L3 | `detectionPipeline.js:47` | `tryGetAlphaMap` 的 `catch {}` 完全静默 |
| BUG-L4 | `adaptiveDetector.js:394-396` | 亚像素精修位移/缩放候选为离散值（-0.25/0/0.25, 0.99/1/1.01） |

---

## 4. 用户痛点根因分析

### 4.1 "未命中"全景图

```
输入图像
   │
   ▼
Phase 1 Catalog Probe ─── 失败 ──→ catalogs.json 不含新变体 [BUG-C5]
   │                                    │
   │ (confidence 低)                    ▼
   ▼                              Phase 1.4 resolveBestTemplateOrder
Phase 2 Scaled Catalog ──────────────────┘
   │
   │ (仍未达阈值)
   ▼
Phase 3 Heuristic Probe
   │ ← 平滑背景 varI≈0 → NCC 返回 0.001 [BUG-M12]
   │ ← 亮背景 (色=240) → 信噪比极低
   │ ← 弱 alpha 水印 → 上游已修，本分支未拉 [BUG-C5 关联]
   ▼
Phase 4 Adaptive ─── 触发条件苛刻 [BUG-M11]
   │  shouldRunAdaptive 要求 matches.length===0
   │  或 (!catalogBacked && conf<0.30)
   │  强 catalog 弱匹配会压制 adaptive
   ▼
Phase 5 Global Fallback
   │  GLOBAL_FALLBACK_MIN=0.25
   │  GLOBAL_FREE_MIN=0.35 (非锚点)
   ▼
返回 null → 未命中
```

**用户反馈的"部分图像未命中"主要发生在：**
1. 2026 年新版 Gemini 输出（新锚点）→ catalog 不匹配
2. 平滑/纯色背景（天空、墙、白底）→ 方差≈0 → NCC 失效
3. 亮背景 + 白水印 → 对比度极低
4. 弱 alpha 水印变体 → 上游已修，本分支未拉
5. 裁剪/缩放图像 → catalog 容差 0.10 之外

### 4.2 "微小偏差"全景图

```
检测得到 (x, y, w, h)  ← 整数像素位置（jitter 仅整数步）
   │
   ▼
estimateAlphaGain       ← 中心像素假设 [BUG-H5]
   │
   ▼
预缩放 alpha map        ← Float32Array.from 累积误差 [BUG-M7]
   │
   ▼
removeRepeatedWatermarkLayers (≤4 遍)
   │
   ├ 每遍 removeWatermark:
   │   ├ 双线性采样 alpha (亚像素)    ← 边界返回 0 → 边缘衰减
   │   ├ ALPHA_NOISE_FLOOR = 3/255    ← faint 残留 [BUG-M8]
   │   ├ (watermarked - α*255)/(1-α)  ← 反向混合
   │   └ Math.round                   ← ±0.5 量化 [BUG-M9]
   │
   ├ 安全门: near-black / texture / sign-flip
   └ ⚠️ 无 Halo / 伪影检测           ← [BUG-C4]
   │
   ▼
可选 recalibrateAlphaStrength
   │ ← 候选只向上 [1.05..2.6]
   │ ← MIN_DELTA=0.10 偏高 [BUG-M10]
   ▼
⚠️ 跳过 refineSubpixelOutline        ← [BUG-C3 死代码]
   │
   ▼
最终输出 → 用户看到微小偏差
```

**用户反馈的"微小偏差"主要来源于：**
1. **亚像素位置未精修**（BUG-C3，首要）
2. **多遍移除无伪影反馈**（BUG-C4）
3. **`Math.round` 量化色带**（BUG-M9）
4. **`ALPHA_NOISE_FLOOR` 残留**（BUG-M8）
5. **双线性采样边缘衰减**（blendModes.js:23）
6. **`Math.fround` 多次舍入**（blendModes.js:68,88,100-101,108）

### 4.3 两个痛点的耦合关系

未命中和微小偏差并非完全独立：
- 当检测位置偏移 1-2 像素时，移除会用错位的 alpha map → 微小偏差
- 当 alphaGain 估计错误时，可能触发 sign-flip 安全门提前停止 → 残留（既是偏差也算部分未命中）
- 平滑背景下 NCC 返回 0.001，即使位置正确也无法确认 → 未命中

**因此 Phase A（激活亚像素精修）和 Phase C（提升召回率）有协同效应。**

---

## 5. 现阶段工作总结与健康度评分

### 5.1 v2.5.1 已完成里程碑（来自 ROADMAP.md 验证）

| 项 | 状态 | 验证方式 |
|----|------|---------|
| BUG-C1 梯度公式三处一致 | ✅ 已修 | `gradient_formula_consistency.test.js` |
| BUG-C2 adaptive 默认阈值统一 | ✅ 已修 | adaptiveDetector.js:15 现引用常量 |
| BUG-H1 ObjectURL 清理顺序 | ✅ 已修 | dragDrop.js |
| BUG-H2 Worker 超时回收 | ✅ 已修 | workerPool.js:96-102 现 terminate+replace |
| BUG-H3 探针内存池 | ✅ 已修 | detector.js:507-518 现预分配 |
| 配置中心化 14 个新常量 | ✅ 已完成 | config.js:61-79 |
| 9 个前端修复 | ✅ 已完成 | 详见 ROADMAP v2.5.1 |
| 5 个新测试文件 36 个用例 | ✅ 已完成 | tests/ |

### 5.2 PENDING（来自 2026-06-14 仍未处理）

ROADMAP §"Short-term Plans (v2.6)" 列出 7 项，本次诊断全部继承：
1. Playwright E2E 浏览器测试
2. 真 SSIM 计算（替换 PSNR）
3. 多遍移除扩展到 doubao/dalle
4. 性能回归基线
5. 归档 legacy 测试脚本
6. 大测试超时修复（3 个文件）
7. **修 6 个仍失败的测试**：`e2e_integration`、`engine_lifecycle`、`parameter_matrix`、`product_audit`、`sdk_api`、`worker_resilience`

### 5.3 健康度评分（2026-06-16）

| 维度 | v2.5.0 (06-14) | v2.5.1 (06-16) | 变化 |
|------|----------------|----------------|------|
| 功能完整性 | 8.5 | **8.0** | ⬇ 死代码暴露实际功能缩水 |
| 代码质量 | 7.0 | **7.0** | 持平 |
| 测试覆盖 | 7.5 | **7.5** | 持平 |
| 架构健康 | 7.5 | **7.0** | ⬇ 移除管线深度缺口暴露 |
| 文档一致性 | 5.0 | **7.5** | ⬆ v2.5.1 大幅修复 |
| 安全性 | 8.0 | **8.0** | 持平 |
| **综合** | **7.3** | **7.5** | ⬆ 整体改善 |

**注意**: 功能完整性下调反映"亚像素精修虽实现但未接入"的事实 —— 用户视角的功能不如声称的完整。

---

## 6. 单元测试与验证体系设计

### 6.1 测试金字塔

```
                    ┌─────────────────┐
                    │   E2E (Playwright) │  ← Phase E-3 (新增)
                    └─────────────────┘
                  ┌─────────────────────┐
                  │  真实样本回归集        │  ← Phase E-2 (新增)
                  │  tests/fixtures/regression/ │
                  └─────────────────────┘
                ┌───────────────────────────┐
                │   集成测试 (pipeline, e2e)    │  ← 现有
                └───────────────────────────┘
              ┌─────────────────────────────────┐
              │       单元测试 (44 文件 / 417+)     │  ← 现有 + Phase E-1 (新增 25+)
              └─────────────────────────────────┘
```

### 6.2 P0 单元测试（必须新增 —— 对应已发现 BUG）

| 测试文件 | 验证目标 | 对应 BUG | 关键断言 |
|---------|---------|---------|---------|
| `subpixel_integration.test.js` | `applyRemovalStrategy` 在多遍后调用 `refineSubpixelOutline` | BUG-C3 | mock refineSubpixelOutline，断言被调用 ≥1 次 |
| `halo_detection.test.js` | `assessAlphaBandHalo` 检测已知光晕样本 | BUG-C4 | 构造带 halo 的合成图，断言检测到 |
| `diff_artifact.test.js` | `assessRemovalDiffArtifacts` 检测色带 | BUG-C4 | 构造量化色带，断言得分高 |
| `new_gemini_anchors.test.js` | 新 catalog 变体（2k-new-margin 等）能被检测 | BUG-C5 | 用新锚点合成图，断言 confidence ≥ 阈值 |
| `refine_rectangular.test.js` | `refineSubpixelOutline` 支持矩形水印 | BUG-H4 | 传入 401×173，断言不越界 |
| `alpha_gain_center_robust.test.js` | `estimateAlphaGain` 在中心 alpha≈0 时仍工作 | BUG-H5 | 构造中心低 alpha 模板 |
| `smooth_background_recall.test.js` | 平滑背景检测召回率 | BUG-M12 | 纯色背景 + 水印，confidence > 0.10 |
| `bright_background_recall.test.js` | 亮背景检测召回率 | BUG-M12 | 240 色背景，confidence > 0.10 |

### 6.3 P1 单元测试（重要补齐）

| 测试文件 | 验证目标 |
|---------|---------|
| `region_stddev_bounds.test.js` | utils.regionStdDev 在越界参数下返回 0 而非 NaN |
| `region_stddev_precision.test.js` | 数值稳定性（两遍式 vs 当前公式对比） |
| `alpha_noise_floor_sweep.test.js` | ALPHA_NOISE_FLOOR 在 1/255, 2/255, 3/255 下的残留对比 |
| `quantization_banding.test.js` | Math.round vs Math.fround vs 随机抖动的色带度量 |
| `recalibration_downward.test.js` | 向下增益搜索（修复 BUG alphaCalibration 只向上） |
| `multi_pass_halo_feedback.test.js` | 多遍移除接入 halo 检测后停止时机 |
| `weak_alpha_variant.test.js` | 上游 f9f6ae9 修复移植后的弱 alpha 检测 |
| `candidate_detection_improved.test.js` | 上游 07a1c2d 修复移植后的候选选择 |
| `multi_pass_rectangular.test.js` | 多遍移除对 Doubao/DALL-E 矩形水印的支持 |

### 6.4 真实样本回归集设计

```
tests/fixtures/regression/
├── gemini/
│   ├── standard_1024_96px_margin64.png         # 基线
│   ├── standard_512_48px_margin32.png
│   ├── new_margin_2048_96px_margin192.png      # 新锚点 [BUG-C5]
│   ├── v2_small_36px.png                       # v2-small 变体
│   ├── cropped_850x850.png                     # 裁剪
│   ├── resized_1500x1500.png                   # 缩放
│   ├── smooth_bg_sky.png                       # 平滑背景 [BUG-M12]
│   ├── bright_bg_white.png                     # 亮背景 [BUG-M12]
│   └── weak_alpha.png                          # 弱 alpha 变体
├── doubao/
│   ├── standard_br_2730x1535.png
│   └── standard_tl_2730x1535.png
├── negative/                                   # 无水印负样本
│   ├── landscape_clean.png
│   └── portrait_clean.png
├── precision/                                  # 微小偏差测试
│   ├── gradient_smooth.png                     # 易产生色带
│   └── high_frequency.png                      # 高频纹理
└── expected_results.json                       # 每个样本的期望结果
```

`expected_results.json` 格式：
```json
{
  "gemini/standard_1024_96px_margin64.png": {
    "expectedProfile": "gemini",
    "expectedConfidenceMin": 0.60,
    "expectedX": 864, "expectedY": 864,
    "expectedWidth": 96, "expectedHeight": 96,
    "expectedTier": "direct-match",
    "expectedMaxDeviation": 1.5      // 移除后水印区与原图最大像素差
  },
  "gemini/smooth_bg_sky.png": {
    "expectedConfidenceMin": 0.10,    // 已知弱区
    "expectedMaxDeviation": 3.0
  }
}
```

### 6.5 性能回归基线（防回归）

```javascript
// tests/performance_regression.test.js
const BASELINES = {
  '512x512_fast':         { maxMs: 100,  maxPasses: 2 },
  '512x512_balanced':     { maxMs: 300,  maxPasses: 3 },
  '1024x1024_balanced':   { maxMs: 500,  maxPasses: 3 },
  '1024x1024_thorough':   { maxMs: 3000, maxPasses: 4 },
  '2048x2048_balanced':   { maxMs: 2500, maxPasses: 3 },
  '4096x4096_balanced':   { maxMs: 10000, maxPasses: 3 }
};
```

### 6.6 精度回归基线（新增 —— 直接验证微小偏差修复）

```javascript
// tests/precision_regression.test.js
const PRECISION_BASELINES = {
  // 移除水印后，水印区与原始（未加水印）图的 PSNR 应高于此值
  'gemini_standard':       { minPSNR: 35, maxColorShift: 2 },
  'gemini_smooth_bg':      { minPSNR: 30, maxColorShift: 3 },
  'gemini_bright_bg':      { minPSNR: 28, maxColorShift: 3 },
  'doubao_br':             { minPSNR: 32, maxColorShift: 2 }
};
```

---

## 7. 修复计划（分阶段、具体到行号）

### Phase A：激活亚像素精修闭环（核心 — 微小偏差）

**目标**: 让 `refineSubpixelOutline` 真正参与移除路径；修复矩形水印支持。  
**预计工时**: 6h  
**用户感知**: 微小偏差显著减少。

| 序号 | 文件:行 | 动作 | 验证 |
|------|---------|------|------|
| A-1 | `src/core/applyRemoval.js:74-107` | 在 `multiPassResult` 取得后、`imageData.data.set` 之前，调用 `refineSubpixelOutline`。传入 `sourceImageData=multiPassResult.imageData`、`alphaMap=scaledAlpha`（注意：用未缩放 alpha + 传入 alphaGain）、`position=match.pos`、`alphaGain`、`baselineSpatialScore=lastPass.afterSpatialScore`、`baselineGradientScore`（需 multiPassRemoval 输出）。若返回非 null，用其 `imageData` | `subpixel_integration.test.js` |
| A-2 | `src/core/multiPassRemoval.js:137-144` | `passes.push` 增加 `afterGradientScore` 字段，供 A-1 使用 | 现有 multiPass 测试更新 |
| A-3 | `src/core/adaptiveDetector.js:428,442,456` | 将 `size = position.width` 改为 `sizeW = position.width; sizeH = position.height`，`size*size` 改为 `sizeW*sizeH`，所有相关循环改为 row<height / col<width | `refine_rectangular.test.js` |
| A-4 | `src/core/adaptiveDetector.js:396` | `OUTLINE_REFINEMENT_MIN_GAIN=1.2` 改为可配置，默认降到 1.05，让普通对比度水印也能进入精修 | 现有测试 |

### Phase B：移植 Halo / 伪影检测（精度闭环）

**目标**: 多遍移除有"伪影反馈"，能在产生光晕/色带时停止或回退。  
**预计工时**: 8h  
**用户感知**: 微小偏差进一步降低，复杂背景下尤其明显。

| 序号 | 文件:行 | 动作 | 验证 |
|------|---------|------|------|
| B-1 | `src/core/restorationMetrics.js`（新增方法） | 实现 `assessAlphaBandHalo(imageData, alphaMap, position)`：检测 alpha 边带（外环 1-3px）的亮度异常 | `halo_detection.test.js` |
| B-2 | `src/core/restorationMetrics.js`（新增方法） | 实现 `assessRemovalDiffArtifacts(before, after, position)`：差分图统计色带/块状伪影 | `diff_artifact.test.js` |
| B-3 | `src/core/multiPassRemoval.js:119-123` | 在 `assessReferenceTextureAlignment` 后增加 `assessAlphaBandHalo` 调用，halo 超阈值则 stopReason='safety-halo' | `multi_pass_halo_feedback.test.js` |
| B-4 | `src/core/applyRemoval.js:86-107` | 若 multiPass stopReason 是 'safety-halo'/'safety-texture-collapse'，尝试降低 alphaGain 重试（向下搜索） | `recalibration_downward.test.js` |

### Phase C：召回率提升（核心 — 未命中）

**目标**: 支持新 Gemini 锚点；改善平滑/亮背景检测；移植上游弱 alpha 修复。  
**预计工时**: 10h  
**用户感知**: 未命中显著减少。

| 序号 | 文件:行 | 动作 | 验证 |
|------|---------|------|------|
| C-1 | `src/core/catalogs.json` | 补充 `2k-new-margin`（96px @ 192px margin）、`v2-small`（36px）、`large-margin`（48/96px @ 96/128px）三类 Gemini 变体条目 | `new_gemini_anchors.test.js` |
| C-2 | `src/core/profiles.js:12-17` | gemini tiers 增加 `'2k-new': {logoSize:96, marginRight:192, marginBottom:192}` 等新 tier | 同上 |
| C-3 | `src/core/detector.js:387-392` | `varI <= 0.0001` 路径：返回值从 0.001 提升到 0.10，让后续 Phase 2 阈值（COARSE=0.10）能进入精搜；同时增加 localContrast 兜底 | `smooth_background_recall.test.js` |
| C-4 | `src/core/detector.js:462` | 平滑背景下 `LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN` 自适应降低（0.008→0.004），保留更多有效像素 | 同上 |
| C-5 | `src/core/detectionPipeline.js:323-325` | `shouldRunAdaptive` 条件放宽：catalog 匹配 confidence<0.30 也触发（不仅 !catalogBacked） | adaptive_detector 测试更新 |
| C-6 | 上游 commit `f9f6ae9` 移植 | 解析上游 `watermarkConfig.js` 的弱 alpha 处理逻辑，移植到 `detector.js` 或 `profiles.js` | `weak_alpha_variant.test.js` |
| C-7 | 上游 commit `07a1c2d` 移植 | 解析上游 `candidateSelector.js` 改进，移植候选选择逻辑到 `detector.js` Phase 2 | `candidate_detection_improved.test.js` |
| C-8 | 上游 commit `7f9e450` 移植 | 新锚点 catalog 条目已在 C-1 处理；此处确认 anchor 探针覆盖 | 同 C-1 |

### Phase D：一致性收尾

**目标**: 硬编码迁移、文档对齐、版本号统一、修剩余失败测试。  
**预计工时**: 6h

| 序号 | 文件:行 | 动作 |
|------|---------|------|
| D-1 | `src/core/detector.js:604` | 简化为 `nccConf >= DETECTION_THRESHOLDS.GRADIENT_BOOST_GATE_EXACT` |
| D-2 | `src/core/utils.js:61` | 增加 `y + rh > imgHeight` 检查 |
| D-3 | `src/core/utils.js:76` | 改用两遍式方差（先 mean 再 sq-sum） |
| D-4 | `src/core/detectionPipeline.js:172-173` | MIN_SWITCH_SCORE/MIN_SCORE_DELTA 迁入 DETECTION_THRESHOLDS |
| D-5 | `src/core/multiPassRemoval.js:58` | 0.5/30 硬编码迁入 DETECTION_THRESHOLDS |
| D-6 | 所有文档 | 同步版本号到 v2.6.0；更新测试计数；更新 README 功能列表（含亚像素精修） |
| D-7 | tests/ | 修 6 个仍失败测试（ROADMAP §v2.6 第 7 项） |
| D-8 | `src/core/blendModes.js:96` | 增加 ALPHA_NOISE_FLOOR 可配置（保留默认 3/255，允许 1/255 实验） |

### Phase E：测试网铺设

**目标**: 25+ 个新单元测试 + 真实样本回归集 + 精度基线。  
**预计工时**: 12h

详见 §6.2、§6.3、§6.4、§6.5、§6.6。

### 总工时与优先级

| Phase | 工时 | 优先级 | 用户痛点对应 |
|-------|------|--------|--------------|
| Phase A | 6h | 🔴 立即 | 微小偏差 |
| Phase B | 8h | 🔴 立即 | 微小偏差 |
| Phase C | 10h | 🔴 立即 | 未命中 |
| Phase D | 6h | 🟡 本周 | 一致性 |
| Phase E | 12h | 🟡 与 A-C 同步 | 验证 |
| **合计** | **42h** | | |

**建议执行顺序**: A → E(P0 部分) → C → B → E(P1 部分) → D。先解决微小偏差（A），同步铺测试网，再处理未命中（C）和精度闭环（B）。

---

## 8. 执行检查清单（Definition of Done）

每个 BUG 修复必须满足：

- [ ] 对应单元测试已编写且通过
- [ ] `pnpm lint` 保持 0 errors
- [ ] `pnpm test` 全量通过（无超时）
- [ ] `pnpm build` 生产构建成功
- [ ] 修改的文件运行 `lsp_diagnostics` 无新增错误
- [ ] 若修改了阈值，同步更新 `TECHNICAL_GUIDE.md` 参数表
- [ ] 若修改了 API，同步更新 `sdk/index.d.ts`
- [ ] 真实样本回归集对应样本通过（若涉及检测/移除行为变化）
- [ ] 性能回归基线未超时（若涉及热路径）

**全部完成的标准**：
- [ ] Phase A-E 全部完成
- [ ] 用户痛点（未命中 + 微小偏差）有可量化的改善（精度基线 PSNR 提升 ≥3dB，召回率基线提升 ≥10%）
- [ ] 版本号统一为 v2.6.0
- [ ] ROADMAP.md 更新进度

---

## 9. 附录：诊断证据索引

### 9.1 死代码证据

```
$ grep -r "refineSubpixelOutline" src/ tests/
src/core/adaptiveDetector.js:412: export function refineSubpixelOutline(params) {
src/sdk/index.js:4:               export { ..., refineSubpixelOutline } from '../core/adaptiveDetector.js';
src/sdk/index.d.ts:224:           export function refineSubpixelOutline(...);
tests/adaptive_detector.test.js:7: import { refineSubpixelOutline };
tests/adaptive_detector.test.js:91: test('refineSubpixelOutline returns null for small size', ...);
# ❌ src/core/applyRemoval.js / multiPassRemoval.js / watermarkEngine.js 中 0 处调用
```

### 9.2 已知弱区自证（来自 detection_recall.test.js）

```
tests/detection_recall.test.js:64
    assert.ok(result.confidence > 0.08,    // ← solid bg，标准是 0.15
tests/detection_recall.test.js:171
    assert.ok(result.confidence > 0.05,    // ← bright bg，标准是 0.15
```

### 9.3 上游关键 commit（来自 git log via gh）

```
7f9e450  2026-06-14  fix: handle new Gemini watermark anchors
f9f6ae9  2026-06-07  fix: handle Gemini weak-alpha watermark variant
07a1c2d  2026-06-08  Improve Gemini watermark candidate detection
```

### 9.4 上游独有模块（本分支缺失）

```
src/core/watermarkProcessor.js    (~1300 行，8 阶段精修)
src/core/candidateSelector.js     (~900 行，候选选择)
src/core/watermarkScoring.js      (三维评分 + 损伤检测)
src/core/restorationMetrics.js    (含 assessAlphaBandHalo 等本分支没有的方法)
src/core/geminiSizeCatalog.js     (含 2k-new-margin, v2-small, large-margin)
src/core/embeddedAlphaMaps.js     (含 '96-20260520' 新 alpha 图)
src/core/allenkFdncnn*.js         (AI 降噪，本分支定位不需要)
src/video/*                       (视频水印，本分支定位不需要)
```

### 9.5 本次诊断未完成项

- 未实际运行 `pnpm test` 全量（耗时，且 ROADMAP 已标 6 个失败测试）
- 未抓取上游 3 个关键 commit 的具体 diff（需在 Phase C 执行时解析）
- 未构造真实水印图做端到端验证（需真实样本）
- 未浏览器手工 QA

---

*文档结束 — 2026-06-16 完整诊断 v2.6 计划*
