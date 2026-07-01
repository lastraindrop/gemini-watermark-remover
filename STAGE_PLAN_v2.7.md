# 综合阶段计划 v2.7 — 现阶段诊断、根因与修复蓝图

> ⚠️ **历史归档（最终校正：2026-07-01）**：本文记录的是诊断阶段的判断与当时计划，不是当前实现合同。当前状态以 [ROADMAP.md](./ROADMAP.md)、[TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md) 与 [v2.7 收尾报告](./reports/v2.7-finalization-report.md) 为准。以下关键问题已经关闭或重新定性：
> - **C6** (catalog 可达性): `catalog.js:30-32` 代理已暴露新 tier
> - **C7** (recalibration 死码): `applyRemoval.js:152-158` 已使用纯 NCC
> - **H8** (Python 60s 硬超时): `python/remover.py:50-57` 动态 timeout
> - **H9** (halo 处理): 旧重试和 edge-cleanup 路径因指标不足、缺少可靠验收/回滚而移除；halo 当前仅作诊断
> - **L5/L6** (死代码/命名冲突): 已清理
> 
> 原文中的开放项、行号和测试名称可能已失效；后续任务只在 [ROADMAP.md](./ROADMAP.md) 跟踪。
> 
> > **文档版本**: 2026-06-18 完整诊断（基于 v2.6.0 实际代码验证，非 ROADMAP 自述）  
> > **分析对象**: `@lastraindrop/gemini-watermark-remover` package.json v2.6.0  
> > **上游对比**: `@pilio/gemini-watermark-remover` v1.0.25 (GargantuaX/gemini-watermark-remover，HEAD 2026-06-17)  
> > **前序文档**: `STAGE_PLAN_v2.6.md` (2026-06-16)、`COMPREHENSIVE_STAGE_PLAN.md` (2026-06-14)、`FRONTEND_DIAGNOSTIC_REPORT.md`  
> > **诊断动机**: v2.6.0 宣称"diagnostic closure & precision upgrade"后，仍需独立验证实际交付质量、修正前序计划对上游基线的误判、并覆盖新发现的深层问题  
> > **执行纪律**: 本文档为**计划文档**，需用户确认后方可执行任何代码修改

---

## 目录

0. [执行摘要（TL;DR）](#0-执行摘要)
1. [总体架构工程与设计审计](#1-总体架构工程与设计审计)
2. [与原分支 GargantuaX 对比分析（基线修正版）](#2-与原分支-gargantuax-对比分析基线修正版)
3. [完整 Code Review 与 BUG 清单](#3-完整-code-review-与-bug-清单)
4. [v2.6.0 交付审计：声称 vs 实际](#4-v260-交付审计声称-vs-实际)
5. [用户痛点根因分析（未命中 + 微小偏差）](#5-用户痛点根因分析)
6. [现阶段工作总结与健康度评分](#6-现阶段工作总结与健康度评分)
7. [单元测试与验证体系设计](#7-单元测试与验证体系设计)
8. [修复计划（分阶段、具体到行号）](#8-修复计划分阶段具体到行号)
9. [执行检查清单（Definition of Done）](#9-执行检查清单)
10. [附录：诊断证据索引](#10-附录诊断证据索引)

---

## 0. 执行摘要

### 0.1 本次诊断的三个独立信息源

本计划基于三个**相互独立**的诊断流交叉验证：

1. **手动代码审计**：逐行阅读 `src/core/` 14 个关键模块 + `python/remover.py`，对照 `STAGE_PLAN_v2.6.md` 列出的 BUG 逐项核验
2. **原仓库深度调研**（librarian）：通过 GitHub API + webfetch 抓取 `GargantuaX/gemini-watermark-remover` v1.0.25 完整文件树、package.json、CHANGELOG、release notes，**修正前序计划对上游版本号和能力基线的误判**
3. **架构与测试静态映射**（explore × 2）：构建 `src/` 完整 import 邻接表 + `tests/` 覆盖矩阵，识别死代码、DRY 违背、覆盖盲区

### 0.2 三大核心结论

#### 结论 ①：v2.6.0 ROADMAP 自述与实际代码**部分不符**

ROADMAP §"Completed (v2.6.0)"声称 8 项交付，本次核验结果：

| 声称 | 实际 | 差距 |
|------|------|------|
| Sub-pixel refinement integrated | ✅ `applyRemoval.js:170` 确实调用 | 真实落地 |
| NMS false-positive suppression | ✅ `applyRemoval.js:67-117` 实现 | 真实落地 |
| Halo detection safety gate | ✅ `multiPassRemoval.js:140` 接入 | 真实落地 |
| Coarse relocation search | 🟡 部分 — jitter 范围扩展，但无独立粗扫阶段 | 部分 |
| Position tolerance overhaul | ✅ jitter 6→10，`isNearExpectedAnchor` 20% | 真实落地 |
| **New catalog variants** | **🚨 名义落地，实际不可达** | **见 BUG-C6** |
| Smooth background varI 0.001→0.10 | ✅ `detector.js:423` | 真实落地 |
| ~140 行死代码清理 | ✅ 但**新发现 `magnifier.js` 仍是死代码** | BUG-A1 |

#### 结论 ②：上游基线被严重低估，"移植"实为"重写"

`STAGE_PLAN_v2.6.md` §2.1 称上游为 v1.0.23，并把 `assessAlphaBandHalo` / 亚像素 warp / 多遍移除当作"待移植"。**实际**：

- 上游已发布 **v1.0.25**（2026-06-17），578+ 测试，4466 stars
- 上游 `watermarkProcessor.js`（~1300 行）的 8 阶段精修管线**早已存在**
- 上游 `restorationMetrics.js` 的 `assessAlphaBandHalo` / `assessRemovalDiffArtifacts` / `assessWatermarkResidualVisibility` **早已存在**
- 上游 `adaptiveDetector.js` 的 `refineSubpixelOutline`（dx/dy/scale warp）**早已存在**

本分支并非"移植上游"，而是用 ~451 行（`applyRemoval.js` 189 + `multiPassRemoval.js` 154 + `alphaCalibration.js` 108）**重写**了上游 ~2200 行的移除管线。**压缩比 80%**，这正是"微小偏差"的根源——不是缺一个函数，而是整个精修管线的深度系统性不足。

#### 结论 ③：发现多个前序计划遗漏的 BUG

最严重的 4 个新发现：

| ID | 严重度 | 位置 | 概述 |
|----|--------|------|------|
| **BUG-C6** | 🔴 Critical | `catalog.js:24-29` + `catalogs.json` + `profiles.js:19-29` | "新 Gemini 锚点"支持**完全不可达**：新 tier 在 proxy 中不暴露、`CATALOGS.gemini` 无对应条目、`getHeuristicConfig` 永不返回新 tier |
| **BUG-C7** | 🔴 Critical | `applyRemoval.js:185-191` | `recalibrateAlphaStrength` 实际是死代码：传入的 `originalSpatialScore` 是 3D 混合分（`match.confidence`），而 `shouldRecalibrateAlphaStrength` 要求 `processedScore >= 0.5`（纯 NCC），多遍后 NCC 极少 ≥0.5 |
| **BUG-H8** | 🟠 High | `python/remover.py:73` | 60 秒硬超时对 4K+ 图像必然超时（`ENGINE_LIMITS.MAX_PIXELS = 64MP`） |
| **BUG-M14** | 🟡 Medium | `detectionPipeline.js:60-68` vs `applyRemoval.js:90-110` | 两套不同的 overlap 算法（中心距 vs bbox 交集），语义不一致 |

### 0.3 修复路径预览

| 阶段 | 目标 | 关键动作 | 用户痛点对应 |
|------|------|---------|------|
| Phase A | 修复 v2.6.0 半修项 | 让新 catalog tier 真正可达；修复 recalibration 类型不匹配 | 未命中 + 微小偏差 |
| Phase B | 精修管线补深 | 移植上游 weak-residual / dark-catalog / edge-cleanup 三阶段 | 微小偏差 |
| Phase C | 召回率兜底 | 平滑/亮背景专项、上游 f9f6ae9 弱 alpha 逻辑移植 | 未命中 |
| Phase D | 架构清理 | 删 `magnifier.js`、合并 CLI/WatermarkEngine、修 `utils.js` 命名冲突 | 可维护性 |
| Phase E | 测试网铺设 | 25+ 新单元测试 + 真实样本回归集 + 精度基线 + **app 层覆盖**（当前 7/9 模块零测试） | 防回归 |

**总工时预估**: 56h（v2.6 计划是 42h，因发现新问题增加 14h）

---

## 1. 总体架构工程与设计审计

### 1.1 分层架构现状（v2.6.0 验证后）

```
┌──────────────────────────────────────────────────────────────────────┐
│ 入口层  Web(app.js + app/*) │ CLI(cli.js + cli/*) │ Python │ 油猴     │
├──────────────────────────────────────────────────────────────────────┤
│ SDK 层  src/sdk/index.js + index.d.ts                                 │
├──────────────────────────────────────────────────────────────────────┤
│ 核心层 src/core/ (19 个 .js + 1 个 .json + templates/)                │
│  ┌─ 配置中心  config.js (DETECTION_THRESHOLDS 26 常量 + 3 档预设)    │
│  ├─ 检测管线  detectionPipeline.js (5 阶段编排)                       │
│  │   ├ Phase 1   Catalog Probe                                        │
│  │   ├ Phase 1.4 resolveBestTemplateOrder                             │
│  │   ├ Phase 2   Scaled Catalog                                       │
│  │   ├ Phase 3   Heuristic Probe                                      │
│  │   ├ Phase 4   Adaptive (adaptiveDetector.js)                      │
│  │   └ Phase 5   Global Fallback (detector.js)                       │
│  ├─ 检测核心  detector.js (853 行，巨型模块)                          │
│  ├─ 决策层    decisionPolicy.js (三级分类)                            │
│  ├─ 移除管线  applyRemoval.js (NMS + 多遍触发 + 亚像素 + 校准)        │
│  │   ├ blendModes.js       (反向 Alpha 混合 + 双线性采样)             │
│  │   ├ multiPassRemoval.js (4 遍 + 4 安全门：near-black/texture/halo) │
│  │   └ alphaCalibration.js (14 档粗搜 + 精搜，⚠️ 实际死代码)          │
│  ├─ 引擎编排  watermarkEngine.js                                      │
│  ├─ 并行      worker.js + workerPool.js                               │
│  └─ 工具      utils.js, alphaMap.js, restorationMetrics.js            │
├──────────────────────────────────────────────────────────────────────┤
│ 基础层（物理上位于 src/core/，概念上独立）                            │
│  blendModes.js, alphaMap.js, utils.js, templates/registry.js,         │
│  restorationMetrics.js — 全部零 import，纯叶节点                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 架构优点（v2.6.0 已验证）

| 维度 | 评价 | 证据 |
|------|------|------|
| 分层清晰 | ✅ 优秀 | 33 个 JS 源文件，import 邻接表**严格无环**（explore agent 验证） |
| 配置中心化 | ✅ 优秀 | `DETECTION_THRESHOLDS` 26 常量，几乎所有阈值已迁入 |
| 统一检测管线 | ✅ 优秀 | Web/CLI/Python 三入口共享 `detectWatermarks → applyRemovalStrategy` |
| 内存池化 | ✅ 已修 | `calculateProbeConfidence` 复用缓冲区（BUG-H3 修复持续生效） |
| Worker 僵尸回收 | ✅ 已修 | `workerPool.js:96-102` 终止并替换超时 worker |
| 决策可解释 | ✅ 良好 | `decisionPolicy.js` 三级分类 + source/confidence 字段 |
| 多 Profile | ✅ 良好 | Gemini + Doubao + DALL-E 3（实验） |
| i18n 完整性 | ✅ 良好 | 7 语言，i18n_completeness.test.js 9/9 通过 |

### 1.3 架构问题（v2.6.0 仍存在 + 新发现）

#### 问题 A：**移除管线深度系统性不足——本分支相对上游的核心架构缺陷**

**严重度**: Critical（直接对应用户反馈"微小偏差"）

| 模块 | 本分支 | 上游 v1.0.25 | 缺口 |
|------|--------|-------------|------|
| 主移除编排 | `applyRemoval.js` 212 行 | `watermarkProcessor.js` ~1300 行 | -1090 行 |
| 多遍移除 | `multiPassRemoval.js` 180 行 | 上游同名模块 ~400 行 | -220 行 |
| Alpha 校准 | `alphaCalibration.js` 124 行（含向下搜索） | 上游 ~250 行 | -130 行 |
| 候选选择 | **缺失**（合并入 detector.js） | `candidateSelector.js` ~900 行 | **完全缺失** |
| 评分系统 | `decisionPolicy.js` 181 行（简化） | `watermarkScoring.js` ~600 行 | -420 行 |
| **合计** | **~700 行** | **~3450 行** | **-2750 行（80% 缺口）** |

上游 `watermarkProcessor.js` 的 8 阶段管线（来自 CHANGELOG v1.0.18 重写）：

1. 初始候选选择（candidateSelector 评分排序）
2. **模板变形**（subpixel outline refinement）← 本分支已激活
3. Alpha 增益校准（recalibration，**双向**搜索）← 本分支有但**实际死代码** [BUG-C7]
4. **暗目录微调**（dark catalog fine-tune）← 本分支**无**
5. **弱正残差微调**（weak positive residual fine-tune）← 本分支**无**
6. **背景清理**（preview background cleanup）← 本分支**无**
7. **边缘清理**（known-48 edge, v2-small edge）← 本分支**无**
8. **小锚点重定位** ← 本分支**无**

**缺失的 5 个阶段（4-8）就是"微小偏差"的主要来源**。

#### 问题 B：`detector.js` 仍为巨型模块（853 行）

**严重度**: Medium（未恶化）

5 个职责混合：内存池 / 全局搜索 / NCC 计算 / 局部对比度 / 探针置信度 / 梯度 NCC / 方差评分 / 降噪。上游将同类功能拆分为 `watermarkScoring.js` + `candidateSelector.js` + `watermarkPresence.js`。

**建议**: 当 v2.7 Phase B 完成后，作为 Phase D 的子任务拆分。

#### 问题 C：模块级单例 `_defaultContext`（detector.js:46）

**严重度**: Medium（未变）

`detectWatermark()` 默认参数使用模块级单例。主线程 + Worker 间逻辑隔离下安全，但 `detectionPipeline.js:210` 已显式 `new DetectorContext()` 规避，说明设计本身有风险。

#### 问题 D：基础层物理位置错乱

**严重度**: Low（可维护性问题）

README 声称基础层为独立层，但所有基础模块（`blendModes.js`、`alphaMap.js`、`utils.js`、`templates/registry.js`、`restorationMetrics.js`）物理上**位于 `src/core/`**。概念层与物理层不一致，新开发者易混淆。

**建议**: 移到 `src/foundation/`（Phase D）。

#### 问题 E：`src/utils.js` 与 `src/core/utils.js` 命名冲突

**严重度**: Medium（探索性发现）

| 文件 | 大小 | 职责 |
|------|------|------|
| `src/utils.js` | 4605 字节 | UI 工具：`loadImage`、`checkOriginal`、`showLoading`（依赖 `exifr` + `./i18n.js`） |
| `src/core/utils.js` | 2918 字节 | 算法工具：`cloneImageData`、`calculateNearBlackRatio`、`regionStdDev` |

同名不同义，App 层 import 时极易写错相对路径。

**建议**: 重命名 `src/utils.js` → `src/app-utils.js` 或 `src/dom-utils.js`（Phase D）。

#### 问题 F：CLI 与 WatermarkEngine **重复实现**

**严重度**: Medium（DRY 违背）

`cli/gwrRemoveCommand.js:46-133` 内联了 `Engine` 类，与 `core/watermarkEngine.js:40-272` 的 `WatermarkEngine` 类**功能完全重叠**（同样的 `getAlphaMap → detectWatermarks → applyRemovalStrategy` 流程）。任何检测管线变更必须**双向同步**，极易漂移。

**证据**: `gemini_regression.test.js` 同时测试两者，结果显示二者行为有细微差异（CLI 用 sharp 解码，Engine 用 browser ImageData）。

**建议**: CLI 改为继承/委托 `WatermarkEngine`，仅保留 sharp 解码适配层（Phase D）。

---

## 2. 与原分支 GargantuaX 对比分析（基线修正版）

### 2.1 前序计划的关键错误修正

`STAGE_PLAN_v2.6.md` §0.2、§2.2 列出的"上游未拉取的关键 commit"基于一个**错误前提**：上游停留在 v1.0.23。实际（librarian 通过 GitHub API 确认）：

| 字段 | STAGE_PLAN_v2.6 假设 | 实际（librarian 验证） |
|------|----------------------|----------------------|
| 上游版本 | v1.0.23 | **v1.0.25**（2026-06-17） |
| 上游 HEAD | `0cc5554` | 2026-06-17 release commit |
| 上游测试数 | 未知 | **578+ pass, 1 skip** |
| 上游 stars | 未知 | **4466** |
| 上游包名 | `@pilio/gemini-watermark-remover` | ✅ 正确 |
| `assessAlphaBandHalo` | "完全缺失，需新增" | **上游早已有** |
| `assessRemovalDiffArtifacts` | "完全缺失，需新增" | **上游早已有** |
| `refineSubpixelOutline` | "本分支已移植算法" | **上游早已有，本分支是平行实现** |
| 多遍移除 | "本分支移植自上游" | ✅ 正确 |

**含义**: STAGE_PLAN_v2.6 §3.1 的 BUG-C3/C4 描述（"算法已移植但未接入" / "完全缺失需新增"）**部分失准**。真实情况是：
- BUG-C3（subpixel 死代码）已在 v2.6.0 修复 ✅
- BUG-C4（halo 检测）已在 v2.6.0 实现 ✅
- 但**实现深度远不及上游**（见 §1.3 问题 A）

### 2.2 战略方向分叉（修正版）

| 维度 | 上游 `@pilio` v1.0.25 | 本分支 `@lastraindrop` v2.6.0 |
|------|----------------------|-------------------------------|
| 产品定位 | Gemini 页面集成 + Chrome 扩展 + 油猴 + 视频去水印 | 独立多平台批量处理工具 |
| **移除管线深度** | ✅ 8 阶段（含水印变形/边缘清理/暗目录微调/弱残差微调/背景清理） | ❌ 2 阶段（多遍+校准），校准实际死代码 |
| **质量评估** | ✅ Halo/伪影/残差可见性三维评估（已全部实现） | 🟡 已实现 halo+banding，但**未在评分决策中使用** |
| 视频水印 | ✅ 完整（含 AI 降噪 FDnCNN ONNX） | ❌ 无（定位外） |
| AI 降噪 | ✅ ONNX/FDnCNN | ❌ 无（定位外） |
| 新 Catalog 变体 | ✅ 2k-new-margin, v2-small(36px), large-margin, 96-20260520 | 🚨 **声称支持但运行时不可达** [BUG-C6] |
| 多 Profile | ❌ 仅 Gemini | ✅ Gemini + Doubao + DALL-E 3 |
| 五层检测管线 | ❌ 单层 adaptive | ✅ Catalog→Scaled→Heuristic→Adaptive→Global |
| 三维评分 | ❌ 纯 NCC + 梯度辅助 | ✅ spatial×0.5+gradient×0.3+variance×0.2 |
| 性能预设 | ❌ 无 | ✅ fast/balanced/thorough |
| 决策分层 | ❌ 无 | ✅ 三级 |
| Python 桥 | ❌ 无 | 🟡 有，但 60s 超时致命 [BUG-H8] |
| 多语言 | ❌ 中英 | ✅ 7 语言 |
| E2E 测试 | ✅ Playwright | ❌ 无 |
| **测试数** | **578+** | **480+（实际 55 .test.js + 1 .py 文件，测试用例数低于上游）** |
| Chrome 扩展 | ✅ Manifest V3 | ❌ 无（定位外） |
| 页面集成 | ✅ 预览替换、全屏处理、剪贴板拦截 | ❌ 无（定位外） |

### 2.3 关键模块对比（行数对照）

```
上游 src/core/（移除路径）
   watermarkProcessor.js   ~1300 行  (8 阶段)
   candidateSelector.js    ~900 行   (候选评分排序)
   watermarkScoring.js     ~600 行   (三维评分 + 损伤检测)
   multiPassRemoval.js     ~400 行   (多遍 + 5 安全门)
   alphaStrengthCalib.js   ~250 行   (双向增益搜索)
   restorationMetrics.js   ~400 行   (halo/banding/residual 三维)
   adaptiveDetector.js     ~800 行   (含 warp 精修)
   合计                    ~4650 行

本分支 src/core/（移除路径）
   applyRemoval.js         212 行    (NMS + 多遍触发 + 亚像素 + 校准)
   multiPassRemoval.js     180 行    (4 遍 + 4 安全门)
   alphaCalibration.js     124 行    (校准，实际死代码)
   restorationMetrics.js   249 行    (halo + banding，未参与决策)
   adaptiveDetector.js     489 行    (含 refineSubpixelOutline)
   detector.js             853 行    (评分合并于此)
   合计                    ~2107 行  (差距 ~2543 行，主要在精修阶段)
```

### 2.4 上游本分支未拉取的关键能力（按用户痛相关性排序）

| 上游能力 | 本分支状态 | 对用户痛点的影响 | 建议 |
|---------|-----------|------------------|------|
| `watermarkProcessor` 阶段 4 暗目录微调 | ❌ 缺失 | 🟡 微小偏差次要源 | Phase B 移植 |
| `watermarkProcessor` 阶段 5 弱正残差微调 | ❌ 缺失 | 🟡 微小偏差次要源 | Phase B 移植 |
| `watermarkProcessor` 阶段 6 背景清理 | ❌ 缺失 | 🟡 平滑背景残留 | Phase B 移植 |
| `watermarkProcessor` 阶段 7 边缘清理 | ❌ 缺失 | 🔴 微小偏差主要源（量化色带） | Phase B 移植 |
| `candidateSelector` 评分排序 | ❌ 缺失 | 🟡 多候选时选错 | Phase B 移植 |
| `assessWatermarkResidualVisibility` | ❌ 缺失 | 🟡 无残差可见性反馈 | Phase B 移植 |
| `embeddedAlphaMaps['96-20260520']` | ❌ 缺失 | 🔴 2026-05 后新水印检测失败 | Phase A 移植 |
| `geminiSizeCatalog` 新尺寸条目 | 🚨 模板存在但不可达 | 🔴 直接致未命中 | Phase A 修复 [BUG-C6] |
| `watermarkConfig` 强力移除模式 | ❌ 缺失 | 🟡 移除强度不足 | Phase B 评估 |
| 平滑先验高斯清理（v1.0.25） | ❌ 缺失 | 🟡 浅层离目录残留 | Phase B 评估 |
| 弱 alpha 链 60% 强度（v1.0.17） | ❌ 缺失 | 🔴 弱 alpha 变体检测失败 | Phase C 移植 |

**建议**: 不必全量 cherry-pick（视频/AI 降噪/扩展与本分支定位不符），但 **BUG-C6（catalog 不可达）+ 阶段 7 边缘清理 + 弱 alpha 链**三项为优先项。

---

## 3. 完整 Code Review 与 BUG 清单

> **优先级**: 🔴 Critical / 🟠 High / 🟡 Medium / ⚪ Low  
> **状态**: [v2.6-FIXED] v2.6.0 已修 / [v2.6-PARTIAL] v2.6.0 半修 / [NEW] 本诊断新发现 / [PENDING] 自 v2.5 未处理

### 3.1 Critical 级

#### BUG-C6 [NEW] 🔴 新 Gemini 锚点支持完全不可达——未命中首要根因

**文件**: 
- `src/core/catalog.js:24-29`（WATERMARK_CONFIGS proxy）
- `src/core/catalogs.json:18-32`（WATERMARK_CONFIGS 定义）
- `src/core/profiles.js:12-18`（gemini tiers）
- `src/core/profiles.js:19-29`（getHeuristicConfig）

**证据链**:

1. `catalogs.json` 定义了新 tier：
   ```json
   "2k-new-margin": { "logoSize": 96, "marginRight": 192, "marginBottom": 192 },
   "v2-small":      { "logoSize": 36, "marginRight": 32,  "marginBottom": 32  },
   "large-margin":  { "logoSize": 48, "marginRight": 96,  "marginBottom": 96  }
   ```

2. 但 `catalog.js:24-29` 的导出 proxy 只暴露 4 个 getter：
   ```javascript
   export const WATERMARK_CONFIGS = {
       get '0.5k'() { return getCatalogData().WATERMARK_CONFIGS['0.5k']; },
       get '1k'()  { return getCatalogData().WATERMARK_CONFIGS['1k']; },
       get '2k'()  { return getCatalogData().WATERMARK_CONFIGS['2k']; },
       get '4k'()  { return getCatalogData().WATERMARK_CONFIGS['4k']; }
       // ❌ 没有 '2k-new-margin'、'v2-small'、'large-margin'
   };
   ```

3. `CATALOGS.gemini` 数组（catalogs.json:40-700）**所有条目的 tier 字段**只有 `'0.5k'`/`'1k'`/`'2k'`/`'4k'`，**无任何条目引用新 tier**。

4. `profiles.js:19-29` 的 `getHeuristicConfig` 只基于 shortSide 返回 `'0.5k'`/`'1k'`/`'2k'`/`'4k'`，**永不返回新 tier**。

5. profiles.js:16 的 `'2k-new': { logoSize: 96, marginRight: 192, marginBottom: 192 }` 定义存在，但**无任何代码路径消费它**。

**影响**: ROADMAP §"Completed (v2.6.0)" 声称"New catalog variants: 192px margin, 2k-new-margin, v2-small, large-margin"——**实际运行时不可达**。2026 年 5 月后新版 Gemini 输出（新锚点/新尺寸）的水印**仍然检测不到**，Phase 1-2 全部失败，依赖 Phase 3-5 兜底但兜底阈值更高，未命中概率显著上升。这是用户反馈"部分图像未命中"的**首要根因**。

**修复**:
1. `catalog.js:24-29` 增加新 tier 的 getter
2. `catalogs.json` CATALOGS.gemini 数组增加使用新 tier 的条目（需对应上游 `geminiSizeCatalog.js` 的实际尺寸）
3. `profiles.js:19-29` `getHeuristicConfig` 在检测到新尺寸时返回新 tier
4. 新增对应 alphaMap 资源（特别是 `96-20260520`）

#### BUG-C7 [NEW] 🔴 Alpha 校准实际是死代码——微小偏差次要根因

**文件**: `src/core/applyRemoval.js:184-205`

**证据**:

```javascript
// applyRemoval.js:185-191
const originalSpatialScore = match.confidence;  // ❌ 这是 3D 混合分
const suppressionGain = Math.abs(originalSpatialScore) - Math.abs(lastPass.afterSpatialScore);

if (shouldRecalibrateAlphaStrength({
    originalScore: Math.abs(originalSpatialScore),       // 3D 混合 (0.3-0.7)
    processedScore: Math.abs(lastPass.afterSpatialScore), // 纯 NCC (0.0-0.4)
    suppressionGain
})) {
```

`shouldRecalibrateAlphaStrength`（alphaCalibration.js:30-35）的条件：
```javascript
return originalScore >= 0.6 &&           // match.confidence 阈值
       processedScore >= 0.5 &&           // ❌ 多遍后 NCC 极少 ≥0.5
       suppressionGain <= 0.18;
```

**问题**:
- `originalScore` 是 3D 混合分（spatial×0.5 + gradient×0.3 + variance×0.2），范围 0.3-0.7
- `processedScore` 是纯 NCC（`lastPass.afterSpatialScore`），多遍移除后通常 < 0.25
- **类型不匹配**：把 3D 混合分当纯 NCC 用
- 条件 `processedScore >= 0.5` 几乎永不满足 → 整个 recalibration 路径**实际是死代码**

**影响**: `recalibrateAlphaStrength`（alphaCalibration.js 全部 124 行）虽然测试覆盖（alpha_calibration.test.js 7 个用例），但**生产路径永不触发**。当多遍移除后残差仍高，本应通过校准改善，实际直接提交多遍结果。

**与上游对比**: 上游 `alphaStrengthCalibration.js` 同样有该模块但**双向搜索 + 类型一致**（originalSpatialScore 是纯 NCC），所以上游的校准真正参与决策。

**修复**:
1. `applyRemoval.js:130` 在 `estimateAlphaGain` 之前记录 `originalSpatialScore = calculateCorrelation(imageData, match.pos.x, match.pos.y, ...)` 取纯 NCC
2. 或者：把 `shouldRecalibrateAlphaStrength` 的 `processedScore >= 0.5` 阈值降到 0.18，并改为基于纯 NCC 比较
3. 推荐方案 1（语义清晰）

#### BUG-C8 [PENDING] 🔴 上游新 alpha 资源 `96-20260520` 缺失

**文件**: `src/core/templates/`（资源目录）

**证据**: 上游 v1.0.15（2026-05-20）添加 `'96-20260520'` alpha 映射 + 192px 锚点用于 2K 输出。本分支 `src/assets/` 无此资源。

**影响**: 即使 BUG-C6 修复使新 tier 可达，仍需对应 alpha 资源，否则 Phase 1.4 `resolveAssetKey` 找不到资源而跳过。

**修复**: 从上游 `src/core/embeddedAlphaMaps.js` 提取 `96-20260520` 的 base64 数据，转为 PNG 放入 `src/assets/`。

### 3.2 High 级

#### BUG-H8 [NEW] 🟠 Python bridge 60s 硬超时致命

**文件**: `python/remover.py:73`

```python
result = subprocess.run(final_cmd, capture_output=True, text=True, check=False, timeout=60)
```

**问题**:
- `ENGINE_LIMITS.MAX_PIXELS = 64MP`（8000×8000）
- 4K 图（24MP）在 thorough 预设下处理时间通常 5-15 秒
- 8K 图（64MP）在 thorough 预设下可达 60-120 秒
- **必然超时**，且超时后返回 `{"status": "error", "message": "Processing timed out after 60s"}`，无重试

**附加问题**:
- `remove_watermark_pipe`（line 95-116）**无超时**，可能永久挂起
- 无进度反馈机制

**修复**:
1. `timeout` 改为 `max(60, expected_pixels / 100000)`（即每 0.1MP 给 1 秒）
2. 暴露 `timeout` 参数让用户覆盖
3. `remove_watermark_pipe` 加 `timeout=300`

#### BUG-H9 [NEW] 🟠 halo 检测实现但未参与评分决策

**文件**: `src/core/multiPassRemoval.js:140-144` + `src/core/restorationMetrics.js:68-138`

**证据**:
- ✅ `multiPassRemoval.js:140` 调用 `assessAlphaBandHalo`，halo 严重度 > 0.5 时 `stopReason='safety-halo'` 中断
- ❌ 但 `applyRemoval.js:169` 的 subpixel 触发条件是 `multiPassResult.stopReason !== 'residual-low'`——**任何非 residual-low 都触发**，包括 halo
- ❌ subpixel 失败后落到 recalibration（已死代码，BUG-C7）
- ❌ 最终 fallback `imageData.data.set(multiPassResult.imageData.data)`（applyRemoval.js:207）提交的是**halo 触发前的最后一遍**，但**没有"用 halo 反馈降低 alphaGain 重试"的逻辑**

**与上游对比**: 上游 `watermarkProcessor.js` 在 halo 检测后会**降低 alphaGain 重试**，本分支只中断不重试。

**影响**: 即使检测到 halo，也没有修复 halo 的机制。用户看到的"微小偏差"中"边缘光晕"成分无法消除。

**修复**:
1. `applyRemoval.js` 增加 halo 反馈路径：当 `stopReason === 'safety-halo'` 时，降低 alphaGain（×0.8）重试多遍
2. 把 `assessAlphaBandHalo` 接入 `decisionPolicy` 的评分输出

#### BUG-H10 [PENDING] 🟠 detector.js:604 公式混淆（v2.6 验证状态）

**文件**: `src/core/detector.js:606`（v2.6 行号）

**v2.6 验证**: ✅ **已修复**。原 `EXACT_NCC_GATE + X - EXACT_NCC_GATE` 已替换为 `blendMultiDimensionalScore()` 调用（detector.js:606）。本节作为"已修"标记，不再列入修复计划。

#### BUG-H11 [PENDING] 🟠 文档/README 测试计数过时

**证据**:
- README.md §"Verification baseline" 称 "48 files, 480+ tests"
- ROADMAP.md §"Current Status" 称 "48 test files (4 new)"
- 实际 explore agent 静态统计：**55 个 .test.js + 1 个 .py = 56 文件**
- ROADMAP.md §"Verification Commands" 又称 "417 tests"

**修复**: 跑一次 `pnpm test` 拿真实计数，同步到 README/ROADMAP/DEVELOPER_GUIDE。

### 3.3 Medium 级

| ID | 状态 | 文件:行 | 描述 |
|----|------|---------|------|
| BUG-M6 | PENDING | `utils.js:77` | `variance = sq/n - mean*mean` 灾难性消去（数值精度），平滑背景贡献到微小偏差 |
| BUG-M13 | PENDING | `multiPassRemoval.js:59` | `assessReferenceTextureAlignment` 阈值 0.5/30 硬编码，未迁入 DETECTION_THRESHOLDS |
| BUG-M14 | NEW | `detectionPipeline.js:60-68` vs `applyRemoval.js:90-110` | **两套 overlap 算法**：`isOverlapping` 用中心距 + 半宽判断；`suppressOverlappingMatches` 用 bbox 交集面积 > 25% 判断。语义不同，NMS 阶段可能放行 detectionPipeline 已抑制的匹配，反之亦然 |
| BUG-M15 | NEW | `detectionPipeline.js:47` | `tryGetAlphaMap` 的 `catch {}` 完全静默，资源加载失败时无任何日志，难调试 |
| BUG-M16 | NEW | `adaptiveDetector.js:245` | alpha map 查找回退到 `alphaMaps['96']`/`alphaMaps['48']`——对 Doubao/DALL-E 矩形水印**完全不合理**，会拿 96×96 Gemini 模板去匹配 401×173 Doubao |
| BUG-M17 | NEW | `adaptiveDetector.js:331` | `adjustedScore < 0.06` 硬编码魔法数，控制 topK 候选过滤门槛，未迁入配置 |
| BUG-M18 | NEW | `adaptiveDetector.js:394-396` | 亚像素精修位移/缩放候选仍为离散值（-0.25/0/0.25, 0.99/1/1.01），上游已有更细梯度 |
| BUG-M19 | NEW | `applyRemoval.js:170-182` | subpixel 精修 baseline 用 `lastPass.afterSpatialScore`（多遍后），但 source 是原ImageData；精修空间不一致 |
| BUG-M20 | NEW | `multiPassRemoval.js:166-170` | first-pass-sign-flip 只在 `passIndex === 0` 触发；2/3 遍后符号翻转无早停（可能漏检过校正） |
| BUG-M21 | NEW | `python/remover.py:80` | JSON 行解析依赖 `"status"` 字段存在，CLI 输出格式变更即崩 |

### 3.4 Low 级

| ID | 状态 | 文件:行 | 描述 |
|----|------|---------|------|
| BUG-L1 | PENDING | `detector.js:807-821` | `@deprecated` 属性访问器仍保留 |
| BUG-L2 | PENDING | `detectionPipeline.js:172-173` | `MIN_SWITCH_SCORE=0.25`, `MIN_SCORE_DELTA=0.10` 硬编码 |
| BUG-L5 | NEW | `src/app/magnifier.js` 全文件 | **死代码**：exports `setupMagnifier`，但全仓库零 import（explore agent 验证） |
| BUG-L6 | NEW | `src/utils.js` vs `src/core/utils.js` | 命名冲突，维护风险 |
| BUG-L7 | NEW | `cli/gwrRemoveCommand.js:46-133` | 与 `WatermarkEngine` DRY 违背，双重维护 |
| BUG-L8 | NEW | `tests/color_space.test.js` | 第二个测试用例**无 assert 语句**（explore agent 发现），是死测试 |
| BUG-L9 | NEW | `tests/build_pipeline.test.js` | 若 `dist/` 不存在则 3 个测试全部静默 return（假通过） |

---

## 4. v2.6.0 交付审计：声称 vs 实际

### 4.1 ROADMAP §"Completed (v2.6.0)" 8 项逐条核验

| ROADMAP 声称 | 核验方法 | 实际状态 | 备注 |
|-------------|---------|---------|------|
| Sub-pixel refinement integrated | grep `refineSubpixelOutline` in applyRemoval.js | ✅ **真实** | line 170 调用 |
| NMS false-positive suppression | 读 applyRemoval.js:67-117 | ✅ **真实** | 实现 bbox-overlap + 50% confidence floor |
| Halo detection safety gate | 读 multiPassRemoval.js:140 | ✅ **真实** | 但 [BUG-H9] 未反馈到 alphaGain 重试 |
| Coarse relocation search | grep ±16px coarse scan | 🟡 **部分** | jitter 范围扩展到 10/6（balanced），但**无独立 ±16px 粗扫阶段**，与 ROADMAP 描述不符 |
| Position tolerance overhaul | 读 config.js:49-50, isNearExpectedAnchor | ✅ **真实** | JITTER_RANGE 10, JITTER_OFFICIAL 6 |
| **New catalog variants** | 读 catalog.js + catalogs.json + profiles.js | **🚨 不可达** | **[BUG-C6]** |
| Smooth background varI 0.001→0.10 | 读 detector.js:423 | ✅ **真实** | LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN 也降到 0.004 |
| Frontend ~140 行死代码清理 | 读 app.js + grep magnifier | 🟡 **部分** | `#singlePreview` 已删，但 `src/app/magnifier.js` 整文件仍是死代码 [BUG-L5] |
| Tests 4 new files (31 tests) | glob tests/*.test.js | ✅ **真实** | subpixel_integration, refine_rectangular, alpha_gain_center_robust, position_offset_tolerance 存在 |

**净结果**: 8 项中 **5 项真实落地，1 项严重失准（catalog 不可达），2 项部分落地**。

### 4.2 v2.6.0 未交付项（继承自 STAGE_PLAN_v2.6）

ROADMAP §"Short-term Plans (v2.6)" 7 项**全部仍待处理**：

1. ❌ Playwright E2E 浏览器测试
2. ❌ 真 SSIM 计算（替换 PSNR）
3. ❌ 多遍移除扩展到 doubao/dalle（目前 applyRemoval.js:127 仅 gemini 走多遍）
4. ❌ 性能回归基线
5. ❌ 归档 legacy 测试脚本
6. ❌ 大测试超时修复（3 个文件）
7. ❌ 修 6 个仍失败的测试（`e2e_integration`、`engine_lifecycle`、`parameter_matrix`、`product_audit`、`sdk_api`、`worker_resilience`）

**风险评估**: 第 7 项最严重——**6 个测试持续失败意味着 CI 红灯常亮**，新提交无法被有效拦截。这是工程纪律问题。

---

## 5. 用户痛点根因分析

### 5.1 "未命中"全景图（v2.6.0 后更新）

```
输入图像
   │
   ▼
Phase 1 Catalog Probe ─── 失败 ──→ catalogs.json 无新条目 [BUG-C6]
   │                                    │
   │ (confidence 低)                    ▼ Phase 1.4 resolveBestTemplateOrder
   ▼                              也无法选新 tier
Phase 2 Scaled Catalog ──────────────────┘
   │
   │ (仍未达阈值)
   ▼
Phase 3 Heuristic Probe
   │ ← getHeuristicConfig 永不返回新 tier [BUG-C6]
   │ ← 平滑背景 varI→0.10 已改善，但亮背景仍弱
   ▼
Phase 4 Adaptive ─── 触发条件已放宽 ✅
   │ ← alphaMaps['96-20260520'] 缺失 [BUG-C8]
   │ ← alphaMaps 回退到 '96'/'48' 对矩形水印无意义 [BUG-M16]
   ▼
Phase 5 Global Fallback
   │  GLOBAL_FALLBACK_MIN=0.25
   ▼
返回 null → 未命中
```

**v2.6.0 后用户反馈"未命中"主要场景**:
1. **2026 年 5 月后新版 Gemini 输出**（新锚点 + 96-20260520 alpha）→ **BUG-C6 + BUG-C8 联合作用**
2. **裁剪/缩放图像** → catalog 容差 0.10 之外，scaled catalog 也未覆盖新尺寸
3. **弱 alpha 水印变体** → 上游 v1.0.17 弱 alpha 链未移植

### 5.2 "微小偏差"全景图（v2.6.0 后更新）

```
检测得到 (x, y, w, h)
   │
   ▼
estimateAlphaGain       ← 中心像素假设仍存在（applyRemoval.js:48）
   │                    ← 但 weighted estimation 已改善
   ▼
预缩放 alpha map        ← Float32Array.from 仍累积误差
   │
   ▼
removeRepeatedWatermarkLayers (≤4 遍)
   │
   ├ 每遍 removeWatermark:
   │   ├ 双线性采样 alpha
   │   ├ ALPHA_NOISE_FLOOR = 3/255
   │   ├ 反向混合
   │   └ Math.round 量化
   │
   ├ 安全门: near-black / texture / halo ✅
   └ ⚠️ halo 检测到后无重试 [BUG-H9]
   │
   ▼
refineSubpixelOutline ✅ 已接入
   │ ← 但 baseline 用 afterSpatialScore，source 用原ImageData [BUG-M19]
   │ ← 候选仍离散 [BUG-M18]
   ▼
recalibrateAlphaStrength ❌ 实际死代码 [BUG-C7]
   │
   ▼
最终输出
   │
   ├ 缺上游阶段 4-8（暗目录/弱残差/背景/边缘清理）
   └ 用户看到微小偏差
```

**v2.6.0 后用户反馈"微小偏差"主要来源**:
1. **recalibration 死代码**（BUG-C7，新发现首要）
2. **halo 检测无重试**（BUG-H9，新发现次要）
3. **上游精修阶段 4-8 缺失**（架构性，需 Phase B）
4. **`Math.round` 量化色带**（blendModes.js:111，未变）
5. **`ALPHA_NOISE_FLOOR` 残留**（blendModes.js:96，未变）
6. **utils.js variance 灾难性消去**（BUG-M6，未修）

### 5.3 两个痛点的耦合关系（v2.6.0 后）

未命中和微小偏差**强耦合**：
- 当 BUG-C6 导致 Phase 1-2 失败、Phase 4 adaptive 在错误尺寸上找到弱匹配 → 位置偏 2-3 px → 微小偏差
- 当 BUG-C7 使校准死代码 → 多遍残差高 → 微小偏差
- 当弱 alpha 变体（上游 v1.0.17 已修）未检测 → 用户重试 → 不同预设下结果不一致 → 视为"程序不稳定"

**因此 Phase A（修 catalog）和 Phase B（精修补深）有协同效应。**

---

## 6. 现阶段工作总结与健康度评分

### 6.1 v2.6.0 已确认完成里程碑

| 项 | 状态 | 验证证据 |
|----|------|---------|
| BUG-C3 亚像素死代码 | ✅ 已激活 | `applyRemoval.js:170` |
| BUG-C4 Halo 检测 | ✅ 已实现 | `restorationMetrics.js:68` + `multiPassRemoval.js:140` |
| BUG-H6 公式混淆 | ✅ 已修 | `detector.js:606` 用 `blendMultiDimensionalScore()` |
| BUG-M5 utils y 越界 | ✅ 已修 | `utils.js:62` 加 `y + rh > maxImgY` |
| BUG-M12 varI 阈值 | ✅ 已修 | `detector.js:423` 0.001 → 0.10 |
| BUG-M11 adaptive 触发 | ✅ 已修 | `detectionPipeline.js:349-351` 移除 catalog 抑制 |
| 配置中心化扩展 | ✅ 持续生效 | `DETECTION_THRESHOLDS` 26 常量 + 3 预设 |
| NMS 抑制 | ✅ 新增 | `applyRemoval.js:67-117` |
| 4 个新测试文件 | ✅ 已加 | subpixel_integration / refine_rectangular / alpha_gain_center_robust / position_offset_tolerance |

### 6.2 v2.6.0 未完成 / 半完成

| 项 | 状态 | 详情 |
|----|------|------|
| **新 catalog 变体可达性** | 🚨 半修 | [BUG-C6] |
| **recalibration 激活** | 🚨 失准 | [BUG-C7] 类型不匹配，实际死代码 |
| **halo 反馈重试** | 🚨 缺失 | [BUG-H9] |
| **magnifier.js 死代码清理** | 🟡 部分 | `#singlePreview` HTML 已删，但 magnifier.js 整文件仍在 |
| 6 个失败测试 | ❌ 未修 | ROADMAP §v2.6 第 7 项 |
| Playwright E2E | ❌ 未做 | ROADMAP §v2.6 第 1 项 |
| 真 SSIM | ❌ 未做 | ROADMAP §v2.6 第 2 项 |
| 多遍移除扩展到 doubao/dalle | ❌ 未做 | applyRemoval.js:127 仍只 gemini |

### 6.3 健康度评分（2026-06-18 v2.6.0 实际）

| 维度 | v2.5.1 (06-16) | v2.6.0 自述 | v2.6.0 实测 (06-18) | 变化 |
|------|----------------|------------|---------------------|------|
| 功能完整性 | 8.0 | 9.0 | **7.5** | ⬇ catalog 不可达暴露 |
| 代码质量 | 7.0 | 7.5 | **7.0** | ⬇ recalibration 死代码暴露 |
| 测试覆盖 | 7.5 | 8.0 | **6.5** | ⬇ 13 模块零测试暴露，6 测试失败 |
| 架构健康 | 7.0 | 7.5 | **7.0** | ⬇ magnifier 死代码、CLI DRY 违背 |
| 文档一致性 | 7.5 | 8.0 | **6.5** | ⬇ 测试计数三处不一致 |
| 安全性 | 8.0 | 8.0 | **7.5** | ⬇ Python 超时致命 |
| 上游同步 | 5.0 | 7.0 | **5.5** | ⬇ 基线误判暴露，关键资源未拉 |
| **综合** | **7.3** | **7.7** | **6.9** | ⬇ 实测低于自述 |

**关键信息**: v2.6.0 自评 7.7 vs 实测 6.9，**差距 0.8**。主要拉低项是"上游同步"（基线误判）和"文档一致性"（测试计数三处不符）。

---

## 7. 单元测试与验证体系设计

### 7.1 当前测试覆盖盲区（explore agent 静态映射）

**总览**:
- 测试文件：**55 .test.js + 1 .py = 56**（README 称 48）
- 13 个 src 模块**零单元测试**
- App 层 9 个模块中 **7 个无任何测试**
- 6 个测试**持续失败**（ROADMAP 已记录）
- 1 个测试**无 assert**（color_space.test.js）
- 1 个测试**静默跳过**（build_pipeline.test.js 若 dist/ 不存在）

**未测模块风险分级**:

| 风险 | 模块 | 行数 | 原因 |
|------|------|------|------|
| 🔴 高 | `src/app.js` | 488 | 主入口，编排全 DOM/事件 |
| 🔴 高 | `src/app/dragDrop.js` | 258 | 拖拽 + 文件夹递归 + MIME 校验 |
| 🔴 高 | `src/app/settings.js` | 220 | 设置持久化 + 预设同步 |
| 🟡 中 | `src/app/ui.js` | 104 | 渲染 + 事件 |
| 🟡 中 | `src/core/utils.js` | 74 | `clamp`/`lerp`/`regionStdDev` 全局使用 |
| 🟡 中 | `src/core/worker.js` | 12 | Worker 消息处理，失败静默挂起 |
| 🟡 中 | `src/i18n.js` | 76 | i18n JS 逻辑（JSON 已测） |
| 🟡 中 | `src/userscript/index.js` | 150 | 油猴入口 |
| 🟢 低 | `src/app/keyboard.js` | 37 | 快捷键 |
| 🟢 低 | `src/app/magnifier.js` | 34 | 死代码 [BUG-L5]，删后无需测 |
| 🟢 低 | `src/app/viewModes.js` | 15 | 常量 |
| 🟢 低 | `src/cli.js` | 63 | 间接覆盖（cli.integration.test.js） |
| 🟢 低 | `src/cli/gwrCli.js` | 13 | 薄包装 |

### 7.2 测试金字塔（v2.7 目标）

```
                       ┌─────────────────────────────┐
                       │  E2E (Playwright) [Phase E-3]│  ← 新增
                       └─────────────────────────────┘
                     ┌─────────────────────────────────┐
                     │  真实样本回归集 [Phase E-2]      │  ← 新增
                     │  tests/fixtures/regression/     │
                     └─────────────────────────────────┘
                   ┌─────────────────────────────────────┐
                   │   集成测试（pipeline, e2e）         │  ← 修 6 个失败
                   └─────────────────────────────────────┘
                 ┌─────────────────────────────────────────┐
                 │  App 层测试 [Phase E-4，新增]            │  ← 当前 0
                 └─────────────────────────────────────────┘
               ┌─────────────────────────────────────────────┐
               │   核心单元测试（55 → 80 文件）[Phase E-1]    │  ← +25
               └─────────────────────────────────────────────┘
```

### 7.3 P0 单元测试（必须新增——对应已发现 BUG）

| 测试文件 | 验证目标 | 对应 BUG | 关键断言 |
|---------|---------|---------|---------|
| `catalog_new_tiers_reachable.test.js` | 新 tier 在 `WATERMARK_CONFIGS` proxy 中可访问 | BUG-C6 | `assert.ok(WATERMARK_CONFIGS['2k-new-margin'])` |
| `catalog_new_entries_exist.test.js` | `CATALOGS.gemini` 包含使用新 tier 的条目 | BUG-C6 | 遍历 catalog，断言至少 1 条 tier='2k-new-margin' |
| `heuristic_returns_new_tier.test.js` | `getHeuristicConfig` 对新尺寸返回新 tier | BUG-C6 | 构造 2026 新尺寸图，断言 tier |
| `recalibration_type_match.test.js` | `recalibrateAlphaStrength` 的 originalScore 用纯 NCC | BUG-C7 | mock `calculateCorrelation`，断言被调用且参数非 `match.confidence` |
| `recalibration_actually_fires.test.js` | 构造高残差场景，断言 recalibration 真实触发 | BUG-C7 | 合成图，多次移除后残差仍 > 0.3，断言 `recalibrateAlphaStrength` 被调用 |
| `halo_feedback_retry.test.js` | halo 触发后 alphaGain 降级重试 | BUG-H9 | mock halo=severity 0.8，断言 alphaGain × 0.8 重试 |
| `python_timeout_scales.test.js` | Python 超时随像素数缩放 | BUG-H8 | 像素 24MP 时 timeout ≥ 240s |
| `alpha_resource_96_20260520.test.js` | 新 alpha 资源加载成功 | BUG-C8 | `getAlphaMap('96-20260520', 96, 96)` 返回非空 |

### 7.4 P1 单元测试（重要补齐——覆盖盲区）

| 测试文件 | 验证目标 | 风险 |
|---------|---------|------|
| `app_entry.test.js` | app.js init 流程（mock DOM） | 🔴 |
| `drag_drop.test.js` | 拖拽 + MIME + 文件夹递归 | 🔴 |
| `settings.test.js` | saveSettings/loadSettings 往返 | 🔴 |
| `ui_render.test.js` | 卡片渲染 + 对比切换 | 🟡 |
| `core_utils.test.js` | `regionStdDev` 边界 + `cloneImageData` 深拷贝 | 🟡 |
| `i18n_logic.test.js` | `t()` fallback + 插值 | 🟡 |
| `worker_message.test.js` | Worker 消息处理（mock postMessage） | 🟡 |
| `userscript_entry.test.js` | 油猴入口（mock GM_*） | 🟡 |
| `overlap_algorithm_consistency.test.js` | 两套 overlap 算法语义对齐 | 🟡 (BUG-M14) |
| `variance_numerical_stability.test.js` | `regionStdDev` 两遍式 vs 单遍式对比 | 🟡 (BUG-M6) |

### 7.5 P2 单元测试（针对上游同步与精度）

| 测试文件 | 验证目标 |
|---------|---------|
| `weak_alpha_variant.test.js` | 上游 v1.0.17 弱 alpha 链移植后检测 |
| `edge_cleanup_phase.test.js` | 上游阶段 7 边缘清理移植后无色带 |
| `dark_catalog_finetune.test.js` | 上游阶段 4 暗目录微调 |
| `candidate_selector.test.js` | 上游 candidateSelector 评分排序 |
| `residual_visibility.test.js` | 上游 `assessWatermarkResidualVisibility` |
| `multi_pass_rectangular.test.js` | 多遍移除对 Doubao/DALL-E 矩形支持 |
| `subpixel_finer_grid.test.js` | 亚像素候选从离散改连续梯度 [BUG-M18] |

### 7.6 真实样本回归集设计

```
tests/fixtures/regression/
├── gemini/
│   ├── standard_1024_96px_margin64.png         # 基线
│   ├── standard_512_48px_margin32.png
│   ├── new_margin_2048_96px_margin192.png      # [BUG-C6] 新锚点
│   ├── new_alpha_96_20260520.png               # [BUG-C8] 新 alpha
│   ├── v2_small_36px.png                       # v2-small 变体
│   ├── cropped_850x850.png                     # 裁剪
│   ├── resized_1500x1500.png                   # 缩放
│   ├── smooth_bg_sky.png                       # 平滑背景
│   ├── bright_bg_white.png                     # 亮背景
│   └── weak_alpha.png                          # 弱 alpha 变体
├── doubao/
│   ├── standard_br_2730x1535.png
│   └── standard_tl_2730x1535.png
├── dalle3/
│   └── standard_1024.png
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
    "expectedMaxDeviation": 1.5,
    "expectedMaxColorShift": 2
  },
  "gemini/new_margin_2048_96px_margin192.png": {
    "expectedProfile": "gemini",
    "expectedConfidenceMin": 0.50,
    "expectedTier": "2k-new-margin",
    "comment": "样本依赖 [BUG-C6] 修复"
  }
}
```

### 7.7 性能与精度回归基线

```javascript
// tests/performance_regression.test.js
const BASELINES = {
  '512x512_fast':         { maxMs: 100,  maxPasses: 2 },
  '512x512_balanced':     { maxMs: 300,  maxPasses: 3 },
  '1024x1024_balanced':   { maxMs: 500,  maxPasses: 3 },
  '1024x1024_thorough':   { maxMs: 3000, maxPasses: 4 },
  '2048x2048_balanced':   { maxMs: 2500, maxPasses: 3 },
  '4096x4096_balanced':   { maxMs: 12000, maxPasses: 3 }
};

// tests/precision_regression.test.js
const PRECISION_BASELINES = {
  'gemini_standard':       { minPSNR: 35, maxColorShift: 2 },
  'gemini_smooth_bg':      { minPSNR: 30, maxColorShift: 3 },
  'gemini_bright_bg':      { minPSNR: 28, maxColorShift: 3 },
  'gemini_new_anchor':     { minPSNR: 32, maxColorShift: 3, dependsOn: 'BUG-C6' },
  'doubao_br':             { minPSNR: 32, maxColorShift: 2 }
};
```

### 7.8 测试执行命令（v2.7 建议）

```json
{
  "test": "node --test --test-concurrency=4 \"tests/*.test.js\"",
  "test:unit": "node --test --test-concurrency=4 \"tests/*.test.js\"",
  "test:regression": "node --test \"tests/regression/*.test.js\"",
  "test:precision": "node --test \"tests/precision_regression.test.js\"",
  "test:performance": "node --test \"tests/performance_regression.test.js\"",
  "test:app": "node --test \"tests/app_*.test.js\"",
  "test:e2e": "playwright test",
  "test:python": "python -m unittest tests\\test_bridge_integration.py",
  "test:all": "node --test --test-concurrency=4 \"tests/*.test.js\" && pnpm test:e2e && pnpm test:python"
}
```

---

## 8. 修复计划（分阶段、具体到行号）

### Phase A：修复 v2.6.0 半修项（核心——未命中 + 微小偏差）

**目标**: 让新 catalog tier 真正可达；修复 recalibration 类型不匹配；激活新 alpha 资源。
**预计工时**: 10h
**用户感知**: 未命中显著减少；recalibration 真正生效后微小偏差改善。

| 序号 | 文件:行 | 动作 | 验证 |
|------|---------|------|------|
| A-1 | `src/core/catalog.js:24-29` | `WATERMARK_CONFIGS` proxy 增加 `'2k-new-margin'`/`'v2-small'`/`'large-margin'` getter | `catalog_new_tiers_reachable.test.js` |
| A-2 | `src/core/catalogs.json` CATALOGS.gemini | 增加使用新 tier 的实际尺寸条目（参照上游 `geminiSizeCatalog.js`，需包含 2026-05 后的实际尺寸） | `catalog_new_entries_exist.test.js` |
| A-3 | `src/core/profiles.js:19-29` | `getHeuristicConfig` 在 shortSide ≥ 1800 或匹配新模式时返回新 tier | `heuristic_returns_new_tier.test.js` |
| A-4 | `src/assets/` | 从上游 `embeddedAlphaMaps.js` 提取 `96-20260520` base64，转 PNG 放入 | `alpha_resource_96_20260520.test.js` |
| A-5 | `src/core/applyRemoval.js:130` 附近 | 在 `estimateAlphaGain` 调用前，用 `calculateCorrelation` 计算纯 NCC `originalSpatialScore`，替换 `match.confidence` 的错误用法 | `recalibration_type_match.test.js` |
| A-6 | `src/core/applyRemoval.js:184-205` | 用 A-5 计算的纯 NCC 作 `originalScore`，保持其他逻辑不变 | `recalibration_actually_fires.test.js` |
| A-7 | `src/core/blendModes.js:96`（可选） | `ALPHA_NOISE_FLOOR` 改为可配置（保留默认 3/255） | 现有测试 |

### Phase B：精修管线补深（核心——微小偏差）

**目标**: 移植上游 watermarkProcessor 阶段 4-8 中的 3 个最关键阶段；halo 反馈重试。
**预计工时**: 16h
**用户感知**: 微小偏差显著降低，复杂背景尤其明显。

| 序号 | 文件 | 动作 | 验证 |
|------|------|------|------|
| B-1 | `src/core/applyRemoval.js` | 增加 halo 反馈路径：`stopReason === 'safety-halo'` 时，alphaGain × 0.8 重试多遍（最多 2 次降级） | `halo_feedback_retry.test.js` |
| B-2 | `src/core/restorationMetrics.js` | 实现 `assessWatermarkResidualVisibility`（移植上游） | `residual_visibility.test.js` |
| B-3 | 新增 `src/core/edgeCleanup.js` | 实现上游阶段 7 边缘清理（alpha 梯度掩码混合式淡化） | `edge_cleanup_phase.test.js` |
| B-4 | `src/core/applyRemoval.js:207` 前 | 多遍+校准完成后，调用 `edgeCleanup` 处理量化色带 | 同上 |
| B-5 | 新增 `src/core/darkCatalogFinetune.js` | 实现上游阶段 4 暗目录微调 | `dark_catalog_finetune.test.js` |
| B-6 | `src/core/applyRemoval.js` | 在多遍移除后、校准前，调用 `darkCatalogFinetune`（仅 gemini） | 同上 |
| B-7 | 新增 `src/core/weakResidualFinetune.js` | 实现上游阶段 5 弱正残差微调 | `weak_residual_finetune.test.js` |
| B-8 | `src/core/alphaCalibration.js:88-94` | 精搜候选改用连续梯度（-0.05 到 +0.05 步长 0.005），而非离散 | `subpixel_finer_grid.test.js` |

### Phase C：召回率兜底（核心——未命中）

**目标**: 移植上游弱 alpha 链；扩展多遍到 doubao/dalle。
**预计工时**: 8h
**用户感知**: 弱 alpha 变体检测改善；doubao/dalle 移除质量提升。

| 序号 | 文件:行 | 动作 | 验证 |
|------|---------|------|------|
| C-1 | 上游 v1.0.17 commit 移植 | 解析上游弱 alpha 链（60% 强度）逻辑，移植到 `detector.js` 或新增 `weakAlphaChain.js` | `weak_alpha_variant.test.js` |
| C-2 | `src/core/applyRemoval.js:127` | `useMultiPass` 条件扩展到 doubao/dalle3（需矩形支持安全门） | `multi_pass_rectangular.test.js` |
| C-3 | `src/core/multiPassRemoval.js:21-25` | `scoreRegion` 适配矩形水印（已部分支持，需验证） | 同上 |
| C-4 | `src/core/adaptiveDetector.js:245` | 移除对矩形水印不合理的 '96'/'48' fallback，或改为 profile-aware | 修 BUG-M16 |
| C-5 | `src/core/adaptiveDetector.js:331` | `0.06` 硬编码迁入 `DETECTION_THRESHOLDS.ADAPTIVE_MIN_ADJUSTED_SCORE` | 修 BUG-M17 |

### Phase D：架构清理（可维护性）

**目标**: 删死代码；合并 CLI/Engine；修命名冲突；拆 detector.js。
**预计工时**: 8h

| 序号 | 文件 | 动作 | 验证 |
|------|------|------|------|
| D-1 | `src/app/magnifier.js` | **删除整文件** [BUG-L5] | `pnpm build` 通过，grep 确认零引用 |
| D-2 | `src/utils.js` → `src/dom-utils.js` | 重命名 + 全部 import 路径更新 [BUG-L6] | `pnpm test` 通过 |
| D-3 | `src/cli/gwrRemoveCommand.js:46-133` | `Engine` 类改为委托 `WatermarkEngine`，仅保留 sharp 解码适配 [BUG-L7] | `gemini_regression.test.js` 通过 |
| D-4 | `src/core/detector.js` | 拆分为 `detector.js`（核心 NCC）+ `watermarkScoring.js`（评分融合）+ `probeConfidence.js`（探针） | 现有测试通过 |
| D-5 | `tests/color_space.test.js` | 删除无 assert 的死测试 [BUG-L8] | `pnpm test` 计数减 1 |
| D-6 | `tests/build_pipeline.test.js` | dist/ 不存在时改为 `assert.fail` 而非 silent return [BUG-L9] | 测试真实执行 |
| D-7 | 6 个失败测试 | 逐一修复（ROADMAP §v2.6 第 7 项） | `pnpm test` 全绿 |

### Phase E：测试网铺设（防回归）

**目标**: +25 单元测试 + 真实样本回归集 + 精度基线 + app 层覆盖 + Playwright E2E。
**预计工时**: 14h

详见 §7.3（P0）、§7.4（P1）、§7.5（P2）、§7.6（回归集）、§7.7（基线）。

| 子阶段 | 内容 | 工时 |
|--------|------|------|
| E-1 | P0 单元测试 8 个（BUG 对应） | 4h |
| E-2 | 真实样本回归集（10+ 样本 + expected_results.json） | 4h |
| E-3 | Playwright E2E（5 场景：拖拽/对比/快捷键/设置/手动选择） | 3h |
| E-4 | App 层测试（dragDrop/settings/ui/app.js） | 3h |

### 总工时与优先级

| Phase | 工时 | 优先级 | 用户痛点 |
|-------|------|--------|----------|
| Phase A | 10h | 🔴 立即 | 未命中 + 微小偏差 |
| Phase B | 16h | 🔴 立即 | 微小偏差 |
| Phase C | 8h | 🟠 本周 | 未命中 |
| Phase D | 8h | 🟡 本月 | 可维护性 |
| Phase E | 14h | 🟡 与 A-B 同步 | 防回归 |
| **合计** | **56h** | | |

**建议执行顺序**: **A → E-1 → C → B → E-2/E-3/E-4 → D**

理由:
1. **A 先行**：BUG-C6/C7/C8 直接致用户痛点，修复成本低收益高
2. **E-1 同步**：每个 BUG 修复同时加测试，防止回归
3. **C 跟进**：召回率兜底，弱 alpha / 矩形多遍
4. **B 随后**：精修管线补深是最大工程量，但 A+C 已显著改善体验
5. **E-2/E-3/E-4**：B 完成后铺真实样本回归集和 E2E，固化成果
6. **D 最后**：架构清理风险最低，可独立排期

---

## 9. 执行检查清单（Definition of Done）

### 9.1 每个 BUG 修复必须满足

- [ ] 对应单元测试已编写且通过
- [ ] `pnpm lint` 保持 0 errors
- [ ] `pnpm test` 全量通过（**包括 v2.6 遗留的 6 个失败测试**）
- [ ] `pnpm build` 生产构建成功
- [ ] 修改的文件运行 `lsp_diagnostics` 无新增错误
- [ ] 若修改了阈值，同步更新 `TECHNICAL_GUIDE.md` 参数表
- [ ] 若修改了 API，同步更新 `sdk/index.d.ts`
- [ ] 真实样本回归集对应样本通过
- [ ] 性能回归基线未超时

### 9.2 全部完成的标准

- [ ] Phase A-E 全部完成
- [ ] 用户痛点有可量化改善：
  - 精度基线 PSNR 提升 ≥ 3dB（vs v2.6.0 基线）
  - 召回率提升 ≥ 15%（特别是新锚点样本从 0 → ≥ 50%）
- [ ] 13 个零测试模块至少 8 个有覆盖（app 层 7/9 → 至少 5/9）
- [ ] 6 个 v2.6 遗留失败测试全部修复
- [ ] 版本号统一为 v2.7.0（package.json + README + ROADMAP + DEVELOPER_GUIDE）
- [ ] 测试计数同步真实值
- [ ] ROADMAP.md 更新进度

---

## 10. 附录：诊断证据索引

### 10.1 BUG-C6 不可达证据链

```
$ grep -n "2k-new-margin\|v2-small\|large-margin" src/core/catalogs.json
  18: "2k-new-margin": { ... }
  23: "v2-small":      { ... }
  28: "large-margin":  { ... }
# 仅在 WATERMARK_CONFIGS 中，CATALOGS.gemini 数组无任何引用

$ grep -n "tier" src/core/catalogs.json | grep -v "0.5k\|1k\|2k\|4k"
# （空结果——无任何 CATALOGS 条目使用新 tier）

$ grep -n "get '0.5k'\|get '1k'\|get '2k'\|get '4k'\|get '2k-new\|get 'v2-small\|get 'large-margin" src/core/catalog.js
  25: get '0.5k'() { ... }
  26: get '1k'()  { ... }
  27: get '2k'()  { ... }
  28: get '4k'()  { ... }
# proxy 不暴露新 tier

$ grep -n "'2k-new'" src/core/profiles.js
  16: '2k-new': { logoSize: 96, marginRight: 192, marginBottom: 192 }
# 定义存在，但：

$ grep -n "return.*tier" src/core/profiles.js
  28: return { ...PROFILES.gemini.tiers[tier], isOfficial: false };
# tier 仅来自 shortSide 判断（0.5k/1k/2k/4k），永不返回 '2k-new'
```

### 10.2 BUG-C7 recalibration 死代码证据

```
$ grep -n "recalibrateAlphaStrength\|shouldRecalibrateAlphaStrength" src/core/applyRemoval.js
  188: if (shouldRecalibrateAlphaStrength({
  193:     const recalibrated = recalibrateAlphaStrength({

# alphaCalibration.js:30-35 条件
return originalScore >= 0.6 &&           # ← 3D 混合分（来自 match.confidence）
       processedScore >= 0.5 &&           # ← 纯 NCC，多遍后 < 0.25
       suppressionGain <= 0.18;

# applyRemoval.js:185
const originalSpatialScore = match.confidence;   # ← 3D 混合 (spatial×0.5+gradient×0.3+variance×0.2)
# 与 processedScore (纯 NCC) 不可比

# alphaCalibration.js:79 内部用纯 NCC：
const score = Math.abs(calculateCorrelation(candidate, position.x, position.y, sizeW, sizeH, alphaMap, true));
# 类型不一致确认
```

### 10.3 上游基线修正证据（librarian 验证）

```
$ gh api repos/GargantuaX/gemini-watermark-remover --jq '.pushed_at,.stargazers_count'
2026-06-17T...
4466

$ gh api repos/GargantuaX/gemini-watermark-remover/releases/latest --jq '.tag_name,.published_at,.name'
v1.0.25
2026-06-17
v1.0.25

# 上游 src/core/ 文件树（含本分支缺失模块）：
watermarkProcessor.js      ~1300 行
candidateSelector.js       ~900 行
watermarkScoring.js        ~600 行
alphaStrengthCalibration.js ~250 行
restorationMetrics.js      ~400 行（含 assessAlphaBandHalo，早已存在）
embeddedAlphaMaps.js       （含 '96-20260520'）
```

### 10.4 测试覆盖盲区证据（explore agent 静态映射）

```
零单元测试模块（13 个）：
  src/app.js                  488 行
  src/app/dragDrop.js         258 行
  src/app/settings.js         220 行
  src/app/ui.js               104 行
  src/core/utils.js            74 行
  src/i18n.js                  76 行
  src/userscript/index.js     150 行
  src/core/worker.js           12 行
  src/cli.js                   63 行（仅间接）
  src/cli/gwrCli.js            13 行
  src/app/keyboard.js          37 行
  src/app/viewModes.js         15 行
  src/app/magnifier.js         34 行 [BUG-L5 死代码]

测试文件总数：55 .test.js + 1 .py = 56（README 称 48）
```

### 10.5 死代码证据

```
$ grep -rn "magnifier" src/ tests/
src/app/magnifier.js:1: export function setupMagnifier() { ... }
src/app.js:433: // removed old magnifier code (comment)
src/app/viewModes.js:4: // magnifier no longer used (comment)
# 零 import 语句
```

### 10.6 本次诊断未完成项（留待 Phase A-E 执行时补充）

- 未实际运行 `pnpm test` 全量（耗时；ROADMAP 已标 6 个失败）
- 未抓取上游 `watermarkProcessor.js` 完整源码（Phase B 执行时解析）
- 未构造真实水印图做端到端验证（需真实样本，Phase E-2）
- 未浏览器手工 QA（Phase E-3 Playwright）
- 未对上游 v1.0.17 弱 alpha commit 做精确 diff（Phase C-1）

---

*文档结束 — 2026-06-18 完整诊断 v2.7 计划（基于 v2.6.0 实测代码 + 上游 v1.0.25 基线 + 三 agent 交叉验证）*
