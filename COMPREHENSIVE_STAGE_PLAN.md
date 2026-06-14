# 综合阶段计划 — 架构审计、上游对比、Code Review 与验证策略

> **文档版本**: 2026-06-14 基线分析  
> **分析对象**: `@lastraindrop/gemini-watermark-remover` (package.json v2.2.3 / 文档标称 v2.5.0)  
> **上游对比**: `@pilio/gemini-watermark-remover` v1.0.20 (GargantuaX/gemini-watermark-remover)  
> **Git HEAD**: `aaae7db` — "v2.5.0: Detection geometry fixes, removal quality, browser CORS, unified UI, test de-hardcoding"  
> **工作区状态**: 3 个文件有未提交修改 (`adaptiveDetector.js`, `gwrRemoveCommand.js`, `manualSelection.js`)

---

## 目录

1. [总体架构工程审计](#1-总体架构工程审计)
2. [与原分支 (GargantuaX) 对比分析](#2-与原分支-gargantuax-对比分析)
3. [完整 Code Review 与 BUG 清单](#3-完整-code-review-与-bug-清单)
4. [现阶段工作总结](#4-现阶段工作总结)
5. [验证与单元测试计划](#5-验证与单元测试计划)
6. [修复优先级与行动项](#6-修复优先级与行动项)

---

## 1. 总体架构工程审计

### 1.1 分层架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  入口层 (Entry Layer)                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Web UI   │  │ CLI      │  │ Python   │  │ Userscript  │  │
│  │ app.js   │  │ cli.js   │  │ remover  │  │ index.js    │  │
│  │ + app/*  │  │ + cli/*  │  │ .py      │  │             │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       │              │              │               │         │
│       ▼              ▼              ▼               ▼         │
├─────────────────────────────────────────────────────────────┤
│  SDK 层 (src/sdk/)                                           │
│  index.js + index.d.ts — 36+ 公开导出                       │
├─────────────────────────────────────────────────────────────┤
│  核心层 (src/core/) — 19 个模块                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 配置中心    config.js (DETECTION_THRESHOLDS, PRESETS) │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 检测管线    detectionPipeline.js (5阶段编排)          │  │
│  │   ├── Phase 1: Catalog Probe (templates/registry.js)  │  │
│  │   ├── Phase 1.4: resolveBestTemplateOrder (48/96选择) │  │
│  │   ├── Phase 2: Scaled Catalog (catalog.js)            │  │
│  │   ├── Phase 3: Heuristic Probe (profiles.js)          │  │
│  │   ├── Phase 4: Adaptive Search (adaptiveDetector.js)  │  │
│  │   └── Phase 5: Global Fallback (detector.js)          │  │
│  │ 检测核心    detector.js (NCC/梯度/方差三维评分)       │  │
│  │ 决策层      decisionPolicy.js (三级分类)              │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 移除管线    applyRemoval.js (统一入口)                │  │
│  │   ├── blendModes.js (反向Alpha混合)                   │  │
│  │   ├── multiPassRemoval.js (4遍迭代+安全门)            │  │
│  │   └── alphaCalibration.js (增益校准)                  │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 引擎编排    watermarkEngine.js (检测→移除→Worker调度) │  │
│  │ 并行处理    worker.js + workerPool.js                 │  │
│  │ 工具        utils.js, alphaMap.js, restorationMetrics │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 架构优点

| 维度 | 评价 | 证据 |
|------|------|------|
| **统一检测管线** | ✅ 优秀 | Web/CLI/Python 三入口共享同一 `detectWatermarks()` → `applyRemovalStrategy()` 路径，无分叉实现 |
| **配置中心化** | ✅ 良好（待完善） | `DETECTION_THRESHOLDS` 集中管理 26 个阈值参数，`PERFORMANCE_PRESETS` 三档预设可组合 |
| **内存池化** | ✅ 良好 | `DetectorContext` 封装 `_blurBuffer`/`_sharedGradientsI/A`，避免热路径 GC 压力 |
| **Worker 透明降级** | ✅ 优秀 | `WorkerPool → 单Worker → 主线程` 三级降级，失败不可见用户 |
| **多 Profile 可扩展** | ✅ 良好 | 新增 profile 只需注册 `profiles.js` + `catalog.js`，引擎自动适配 |
| **决策可解释性** | ✅ 良好 | `decisionPolicy.js` 三级分类 (direct-match/needs-validation/insufficient)，每个检测结果携带 `source` 与 `confidence` |

### 1.3 架构问题（软件工程维度）

#### 问题 A: `detector.js` 巨型模块 (799 行) — 违反单一职责

**严重度**: High

`detector.js` 承担了 5 个职责：
1. `DetectorContext` 内存池管理 (L17-44)
2. `detectWatermark()` 全局搜索编排 (L76-346)
3. `calculateCorrelation()` NCC 计算 (L353-396)
4. `calculateLocalContrastCorrelation()` 局部残差 NCC (L414-481)
5. `calculateProbeConfidence()` 探针置信度 + 抖动搜索 (L486-606)
6. `calculateGradientCorrelation()` Sobel 梯度 NCC (L675-737)
7. `calculateVarianceScore()` 方差评分 (L627-663)
8. `fastBoxBlur()` 降噪 (L743-767)

**对比**: 上游将同类功能拆分为 `watermarkScoring.js` + `candidateSelector.js` + `watermarkPresence.js`。

**建议**: 拆分为 `scoring.js`（NCC/梯度/方差/局部对比度计算）、`search.js`（全局搜索编排）、`context.js`（内存池）。

#### 问题 B: 模块级单例 `_defaultContext` — 并发别名风险

**严重度**: High

```javascript
// detector.js:46
const _defaultContext = new DetectorContext();

// detector.js:76 — detectWatermark 默认参数使用单例
export function detectWatermark(imageData, alphaMaps, options = {}, context = _defaultContext) {
```

当 Web Worker 和主线程同时调用 `detectWatermark()`（不传 context 参数）时，两者共享同一个 `_defaultContext`，其 `_blurBuffer`/`_sharedGradientsI`/`_sharedGradientsA` 会被并发写入。虽然 JS 单线程模型在 Worker 间隔离，但主线程的 `removeWatermarkFromImage()` 和 Worker 内的 `worker.js` 各自调用 `detectWatermark` 时，主线程的 `_defaultContext` 在 `removeWatermarkFromImage` 期间可能被同一帧内其他同步调用覆盖。

**证据**: `watermarkEngine.js:204` 调用 `detectWatermarks()` → `detectionPipeline.js:374` 调用 `detectWatermark(imageData, alphaMaps, detectionOptions)` — 未传 context 参数。

#### 问题 C: `calculateProbeConfidence` 未使用 DetectorContext — 内存池失效

**严重度**: Medium

```javascript
// detector.js:545-546 (Gemini 路径)
const gradientsI = new Float32Array(logoW * logoH);
const gradientsA = new Float32Array(logoW * logoH);

// detector.js:579-580 (抖动搜索)
const gradientsI = new Float32Array(pos.width * pos.height);
const gradientsA = new Float32Array(pos.width * pos.height);
```

**矛盾**: `DetectorContext.getGradientBuffers()` 存在的目的就是复用这些缓冲区，但 `calculateProbeConfidence()` 在 Gemini 路径中忽略了 context 参数，每次调用都 `new Float32Array`。抖动搜索循环内（L573-601）每次迭代分配 2 个 Float32Array × (13×13=169 次迭代) = **338 次分配**。

仅 Doubao 路径 (L494-501) 正确使用了 context。文档声称的"内存池化"在主要检测路径上并未生效。

#### 问题 D: 单一真相源 (Single Source of Truth) 不完整

**严重度**: Medium

文档 (`DEVELOPER_GUIDE.md §2`, `TECHNICAL_GUIDE.md §11.1`) 声称 `DETECTION_THRESHOLDS` 是所有阈值的唯一来源。实际审计发现 **15+ 个魔法数字** 仍散落在 `detector.js` 中，未引用 `DETECTION_THRESHOLDS`：

| 文件:行 | 硬编码值 | 语义 | 应引用的常量 |
|---------|----------|------|-------------|
| detector.js:133 | `0.12`, `0.95` | 抖动搜索触发门控 | 新增 `JITTER_TRIGGER_MIN/MAX` |
| detector.js:262 | `0.04` | 深度扫描梯度计算门控 | 新增 `DEEPSCAN_GRADIENT_GATE` |
| detector.js:283-284 | `4` | 标准边距对齐容差 | 新增 `STANDARD_MARGIN_TOLERANCE` |
| detector.js:311 | `32` | 候选去重重叠阈值 | 新增 `CANDIDATE_OVERLAP_DISTANCE` |
| detector.js:324-325 | `0.3`, `0.10` | 锚定/对齐模式加分 | 新增 `MODE_BOOST_ANCHORED/ALIGNED` |
| detector.js:387 | `0.0001` | Alpha方差零检查 | 新增 `VARIANCE_EPSILON` |
| detector.js:393 | `0.0001`, `0.001` | 图像方差零检查+返回值 | 同上 |
| **detector.js:463** | **`0.008`** | **局部对比度Alpha残差门控** | **`DETECTION_THRESHOLDS.LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN` (已存在但未引用!)** |
| detector.js:487 | `0.30` | 梯度惩罚默认值 | `DETECTION_THRESHOLDS.GRADIENT_PENALTY` (不存在) |
| detector.js:507 | `0.14` | Doubao NCC门控 | 新增 `DOUBAO_NCC_GATE` |
| detector.js:527 | `0.14`, `0.10` | 缩放/精确匹配NCC门控 | 新增 `SCALED_NCC_GATE/EXACT_NCC_GATE` |
| detector.js:549 | `0.02` | 梯度相关忽略门控 | 新增 `GRADIENT_IGNORE_GATE` |
| detector.js:561 | `0.18`, `0.12` | 梯度提升门控 | 新增 `GRADIENT_BOOST_GATE_SCALED/EXACT` |
| detector.js:567 | `0.50` | 抖动精调触发门控 | 新增 `JITTER_FINETUNE_TRIGGER` |
| detector.js:629 | `8`, `0.5` | 方差评分最小尺寸+默认返回 | 新增 `VARIANCE_MIN_SIZE/DEFAULT_RETURN` |
| adaptiveDetector.js:15 | `0.35` | 自适应默认阈值 | `DETECTION_THRESHOLDS.ADAPTIVE_MIN_CONFIDENCE` (值不同: 0.22!) |

**特别注意**: `detector.js:463` 使用字面量 `0.008`，而 `DETECTION_THRESHOLDS.LOCAL_CONTRAST_ALPHA_RESIDUAL_MIN` 已定义为 `0.008` — 值相同但未引用，未来修改一处而忘记另一处将产生隐蔽 BUG。

**特别注意**: `adaptiveDetector.js:15` `DEFAULT_THRESHOLD = 0.35` 与 `DETECTION_THRESHOLDS.ADAPTIVE_MIN_CONFIDENCE = 0.22` **值不一致**。`detectAdaptiveWatermarkRegion()` 默认使用 0.35，但 `detectionPipeline.js:335` 显式传入 `0.22`。若其他调用者不传 threshold 参数，将使用更严格的 0.35，导致漏检。

#### 问题 E: 错误处理薄弱 — 静默吞噬

**严重度**: Medium

| 位置 | 问题 |
|------|------|
| `detectionPipeline.js:47` | `tryGetAlphaMap` 的 `catch {}` 完全静默 — Alpha 图加载失败不可见 |
| `watermarkEngine.js:100` | `_performWorkerRemoval` 的 `catch {}` 不记录错误详情 |
| `workerPool.js:47` | Worker 创建失败的 `catch {}` 不记录哪个 worker 索引失败 |
| `workerPool.js:150` | `worker.terminate()` 的 `catch {}` 完全静默 |

---

## 2. 与原分支 (GargantuaX) 对比分析

### 2.1 战略方向分叉

| 维度 | 上游 `@pilio` v1.0.20 | 本分支 `@lastraindrop` v2.5.0 |
|------|----------------------|-------------------------------|
| **产品定位** | Gemini 页面集成工具 (Chrome 扩展 + 油猴脚本 + 在线站) | 独立多平台水印工具 (Web + CLI + Python) |
| **核心场景** | 实时拦截 Gemini 页面的预览/下载/复制请求 | 批量处理本地图片文件 |
| **页面集成** | ✅ `src/page/` + `src/shared/` + `src/extension/` — 深度 DOM/fetch hook | ❌ 已移除全部页面集成代码 |
| **多 Profile** | ❌ 仅 Gemini | ✅ Gemini + Doubao + DALL-E 3 (实验) |
| **检测管线** | 单层: 尺寸目录 → 锚点搜索 → 验证 | 五层: Catalog → Scaled → Heuristic → Adaptive → Global |
| **自适应检测** | ❌ 无 | ✅ `adaptiveDetector.js` — 粗到细多尺度搜索 |
| **三维评分** | ❌ 纯 NCC | ✅ spatial×0.5 + gradient×0.3 + variance×0.2 |
| **性能预设** | ❌ 无 | ✅ fast/balanced/through 三档 |
| **决策策略** | ❌ 无分层 | ✅ direct-match / needs-validation / insufficient |
| **Python Bridge** | ❌ 无 | ✅ `python/remover.py` + `gui.py` |
| **多语言** | ❌ 中/英 | ✅ 7 语言 (zh/en/ja/ru/fr/es/de) |
| **Alpha图嵌入** | ✅ `embeddedAlphaMaps.js` — 已有 | ✅ v2.5 以 base64 data URL 内联 (功能等价但实现不同) |
| **Tampermonkey 调试** | ✅ CDP 固定配置文件 + 新鲜度检查 | ❌ 已移除 |
| **E2E 测试** | ✅ Playwright | ❌ 无浏览器 E2E |
| **SDK 子路径导出** | ✅ `./browser`, `./node`, `./image-data`, `./runtime-*` | ❌ 单一导出 |

### 2.2 核心模块结构对比

```
上游 src/core/ (19模块)                    本分支 src/core/ (19模块)
├── adaptiveDetector.js                    ├── adaptiveDetector.js      [共享]
├── alphaMap.js                            ├── alphaMap.js              [共享]
├── blendModes.js                          ├── blendModes.js            [共享]
├── candidateSelector.js     ◄─────────────┤ detector.js                [本分支合并为巨型模块]
├── canvasBlob.js                          │
├── embeddedAlphaMaps.js     ◄─────────────┤ watermarkEngine.js         [本分支改为运行时内联]
├── geminiSizeCatalog.js     ◄─────────────┤ catalog.js + catalogs.json [本分支改为JSON驱动]
├── multiPassRemoval.js                    ├── multiPassRemoval.js      [共享]
├── previewAlphaCalibration.js             │
├── restorationMetrics.js                  ├── restorationMetrics.js    [共享]
├── selectionDebug.js                      │
├── watermarkConfig.js       ◄─────────────┤ config.js                  [本分支扩展为配置中心]
├── watermarkDecisionPolicy  ◄─────────────┤ decisionPolicy.js          [共享，重命名]
├── watermarkDisplay.js                    │
├── watermarkEngine.js                     │
├── watermarkPresence.js                   │
├── watermarkProcessor.js    ◄─────────────┤ applyRemoval.js            [本分支提取为统一移除入口]
├── watermarkScoring.js      ◄─────────────┤ (合入 detector.js)
└── workerClient.js          ◄─────────────┤ workerPool.js + worker.js  [本分支拆分]

本分支独有 (上游无):
├── detectionPipeline.js    — 五阶段编排器
├── profiles.js             — 多Profile系统
├── templates/registry.js   — Profile/Catalog注册中心
└── alphaCalibration.js     — Alpha增益校准
```

### 2.3 上游已丢弃的能力 (Regression Risk)

| 上游能力 | 状态 | 风险评估 |
|---------|------|---------|
| `src/page/pageImageReplacement.js` — Gemini 实时预览替换 | ❌ 已移除 | **有意丢弃** — 本分支定位不同，非回归 |
| `src/shared/` — 请求拦截 + blob 管理 + 会话 | ❌ 已移除 | 同上 |
| `src/extension/` — Chrome 扩展打包 | ❌ 已移除 | 同上 |
| `skills/gemini-watermark-remover/` — AI Agent Skill | ❌ 已移除 | **建议评估** — 可作为 SDK 消费场景 |
| `examples/` — 示例图片 | ❌ 已移除 | **低风险** — `sample/` 目录有替代 |
| `AGENTS.md` — 调试工作流知识库 | ❌ 已移除 | **中风险** — 丢失了大量调试经验 (CDP配置、Tampermonkey新鲜度检查、性能陷阱记录等) |
| `CHANGELOG.md` / `RELEASE.md` | ❌ 已移除 | **中风险** — 版本历史丢失 |
| `geminiSizeCatalog.js` — 精确尺寸目录 | 🔄 改为 `catalogs.json` | **需验证** — JSON驱动 vs 代码驱动，覆盖度是否一致 |
| Playwright E2E 测试 | ❌ 已移除 | **高风险** — 无浏览器集成测试，UI 回归只能靠手工 |
| SDK 多子路径导出 (`./browser`, `./node`) | ❌ 简化为单一导出 | **中风险** — 消费者无法按运行时选择最优入口 |

### 2.4 版本号不一致 (Cross-cutting Issue)

| 来源 | 版本号 |
|------|--------|
| `package.json` | **2.2.3** |
| `README.md` 标题 | v2.5.0 |
| `DEVELOPER_GUIDE.md` 标题 | v2.5.0 |
| `TECHNICAL_GUIDE.md` 标题 | v2.5.0 |
| `TECHNICAL_GUIDE.md` 页脚 | Document version: **2.3.0** |
| `ROADMAP.md` | v2.5.0 |
| Git HEAD commit message | "v2.5.0" |
| 代码注释 (5处) | **v2.6** — 幽灵版本号，引用尚未发布的版本 |

`v2.6` 幽灵引用位置：
- `src/app/dragDrop.js:103`
- `src/app.js:250`
- `src/app/settings.js:170`
- `src/core/applyRemoval.js:67`
- `src/core/detectionPipeline.js:224`

**结论**: `package.json` 版本号落后于实际发布版本 2 个小版本。代码中已混入下一个版本 (v2.6) 的注释标记，说明 forceProcess 等功能是为 v2.6 规划但已提前合入 v2.5.0 代码库。

---

## 3. 完整 Code Review 与 BUG 清单

### 3.1 Critical 级 BUG

#### BUG-C1: 梯度惩罚公式三处不一致 — 违反设计规则

**文件**: `src/core/detector.js`  
**违反**: `DEVELOPER_GUIDE.md §5 规则6`: "梯度滤波的三个应用点必须保持公式一致，任何调整必须同步三处"

v2.5.0 将 Phase 2 精搜 (L274) 和 Phase 1.4 主探针 (L558) 的梯度惩罚从旧的乘法惩罚 (`confidence *= gradientPenalty`) 改为加权混合 (`spatial×0.5 + gradient×0.3 + variance×0.2`)，但**遗漏了第三处**：

```javascript
// detector.js:585 — 抖动搜索分支，仍使用旧公式
conf = gradientConf < 0.02 ? combined * Math.min(gradientPenalty, 0.50)  // ← 旧的乘法惩罚！
    : nccConf >= 0.12 ? Math.max(combined, gradientConf)
    : combined;
```

**影响**: 当 `deepScan=true` 且探针置信度 < 0.50 时，抖动搜索使用与主探针不同的评分公式。锚点偏移 1-6px 的候选位置可能被错误地惩罚或提升，导致最终选出的 (x,y) 坐标偏移。

**修复**: 将 L585 改为与 L558 一致的加权混合公式。

#### BUG-C2: `adaptiveDetector.js` 默认阈值与 `DETECTION_THRESHOLDS` 冲突

**文件**: `src/core/adaptiveDetector.js:15`

```javascript
const DEFAULT_THRESHOLD = 0.35;  // 硬编码默认值
```

vs `config.js:41`:
```javascript
ADAPTIVE_MIN_CONFIDENCE: 0.22,  // 配置中心值
```

`detectionPipeline.js:335` 调用时显式传入 `threshold: options.adaptiveMinConfidence ?? 0.22`（正确），但任何**不传 threshold 参数**的调用者将使用 0.35 而非 0.22，导致约 40% 的有效自适应检测被拒绝。

**影响**: SDK 消费者直接调用 `detectAdaptiveWatermarkRegion()` 且不传 threshold 时，检测率下降。

**修复**: `const DEFAULT_THRESHOLD = DETECTION_THRESHOLDS.ADAPTIVE_MIN_CONFIDENCE;`

### 3.2 High 级 BUG

#### BUG-H1: ObjectURL 清理时机 — 批量替换时旧 URL 泄漏

**文件**: `src/app/dragDrop.js:88,110`

```javascript
// dragDrop.js:88
objectUrlManager.clear();  // 清除所有已注册URL

// dragDrop.js:110
elements.imageList.innerHTML = '';  // 清除DOM但未先revoke旧card的ObjectURL
```

`handleFiles()` 在用户拖入新文件时先 `objectUrlManager.clear()` 撤销所有 URL，然后 `innerHTML = ''` 清除 DOM。但 `clear()` 在 `innerHTML` 之前执行，此时 `<img>` 元素仍引用着被撤销的 blob URL。虽然后续 `innerHTML=''` 会移除这些 img 元素，但在 `clear()` 到 `innerHTML=''` 之间的微小时间窗口内，浏览器可能仍在解码这些 img。

更重要的是：**`item.originalUrl` 在 `clear()` 后未被置空**，若异步队列中有正在处理的 item 引用了已撤销的 `originalUrl`，将导致图片加载失败。

**修复**: 先 `innerHTML = ''` 移除 DOM 引用，再 `objectUrlManager.clear()`。

#### BUG-H2: Worker 超时不回收 — 僵尸 Worker 持续占用

**文件**: `src/core/workerPool.js:76-81`

```javascript
const timer = setTimeout(() => {
    this._activeTasks.delete(taskId);
    worker._inUse = false;   // ← 标记为可用
    task.reject(new Error('Worker removal timed out'));
    this._processQueue();     // ← 立即派发新任务给这个"超时"的worker
}, timeout);
```

超时后，worker 被标记为 `_inUse = false`（可用），但**未被 terminate**。该 worker 可能仍在后台处理已超时的任务。当新任务派发给它时：
1. 新任务的 `taskId` 与旧任务不同
2. Worker 先完成旧任务 → `onmessage` 查找旧 `taskId` → `_activeTasks.get()` 返回 undefined → 结果被静默丢弃
3. Worker 完成新任务 → 正常返回

功能上不会返回错误结果，但**超时的 worker 可能处于内存泄漏或死循环状态**，持续消耗 CPU。

**修复**: 超时后 `worker.terminate()` + 创建新 worker 替换。

#### BUG-H3: `calculateProbeConfidence` Gemini 路径未用内存池 — 性能问题

**文件**: `src/core/detector.js:545-546, 579-580`

见 [§1.3 问题 C](#问题-c-calculateprobeconfidence-未使用-detectorcontext-内存池失效)。抖动搜索循环 (L573-601) 内每次迭代分配 2 个 `Float32Array`，共 169 次迭代 = 338 次分配。对于 96×96 模板，每次分配 96×96×4 = 36KB，总计 ~12MB 瞬时分配。

**修复**: 在抖动循环外预分配缓冲区，循环内复用。

### 3.3 Medium 级 BUG

#### BUG-M1: README 引用不存在的 `DIAGNOSTIC_PLAN.md`

**文件**: `README.md:88`

```markdown
- [Comprehensive Diagnostic & Fix Plan](./DIAGNOSTIC_PLAN.md) — Full architecture audit...
```

该文件已移动到 `reports/archive/DIAGNOSTIC_PLAN.md`，但 README 链接未更新。

#### BUG-M2: 文档测试计数不一致

| 来源 | 声称的计数 |
|------|-----------|
| README.md:26 | "44 files, 107+ tests" |
| ROADMAP.md:8 | "48 test files, 96+ regression tests" |
| TECHNICAL_GUIDE.md:399 | "107+ tests across 44 test files" |
| **实际值 (2026-06-14)** | **44 files, 417 test cases** (Select-String 计数) / **144 tests in 5 sample files** (node --test reporter) |

测试用例实际数量远超文档声称值。文档数据停留在旧版本。

#### BUG-M3: `fastBoxBlur` 输出缓冲区竞争

**文件**: `src/core/detector.js:743-767`

```javascript
function fastBoxBlur(data, width, height, outputBuffer = null) {
    const output = outputBuffer || new Uint8ClampedArray(data.length);
    if (output !== data) {
        output.set(data);  // ← 先全量复制
    }
    // 然后只修改中间像素 (1..width-2, 1..height-2)
```

先 `output.set(data)` 全量复制输入数据到输出缓冲区，然后只修改中间像素。边缘像素保持原值（来自复制）。这是正确的，但全量复制对于大图像（8000×8000 = 256MB）是显著的内存带宽开销。

更关键的是：`getBlurBuffer(requiredLength)` 返回的缓冲区**长度检查用 `!==`** 而非 `<`：

```javascript
// detector.js:25
if (!this._blurBuffer || this._blurBuffer.length !== requiredLength) {
    this._blurBuffer = new Uint8ClampedArray(requiredLength);
}
```

如果两次调用的图像尺寸不同（常见于批量处理），每次都重新分配。应改为 `< requiredLength` + 使用子视图。

#### BUG-M4: `innerH` / `refH` 计算过于复杂且有潜在负值

**文件**: `src/core/detector.js:637`

```javascript
refH = Math.min(logoH, imgWidth > 0 ? Math.min(logoH, Math.floor(data.length / (imgWidth * 4)) - refY) : 0);
```

嵌套 `Math.min` + 三元表达式。当 `data.length / (imgWidth * 4) - refY < 0`（图像高度 < refY）时，内层 Math.min 返回负值，外层 Math.min(logoH, 负值) 返回负值，随后被 `if (refH < 8) return 0.5` 捕获。功能正确但可读性极差且脆弱。

#### BUG-M5: `assessReferenceTextureAlignment` 硬编码阈值

**文件**: `src/core/multiPassRemoval.js:58`

```javascript
return { hardReject: meanShift > 0.5 && candMean < 30 };
```

`0.5`（亮度偏移比）和 `30`（绝对亮度）为硬编码魔法数字，未从配置中心获取。

#### BUG-M6: `downloadAllAsZip` 的 ObjectURL 未注册管理

**文件**: `src/app/processing.js:187`

```javascript
const url = URL.createObjectURL(blob);  // ← 未通过 objectUrlManager.register()
// ...
setTimeout(() => URL.revokeObjectURL(url), 30000);  // ← 直接revoke，绕过管理器
```

ZIP 下载创建的 ObjectURL 绕过 `objectUrlManager`，直接用 setTimeout 30s 后撤销。如果用户在 30s 内快速多次下载 ZIP，多个 setTimeout 堆积。

### 3.4 Low 级问题

| ID | 文件:行 | 描述 |
|----|---------|------|
| L1 | `detector.js:785-799` | `@deprecated` 的属性访问器仍保留，增加模块体积 |
| L2 | `TECHNICAL_GUIDE.md:473` | 页脚 "Document version: 2.3.0" 与标题 v2.5.0 不一致 |
| L3 | `reports/doubao-report.md:22` | 引用过时基线 "369/369, 452/452" |
| L4 | `reports/frontend-and-tests-report.md:26` | 引用过时基线 "369/369, v2.1.0" |
| L5 | `eslint.config.js` | 无 `no-empty` 规则 — 允许空 catch 块 |
| L6 | `processing.js:130` | `downloadNameForItem` 正则 `/\.[^.\\/]+$/` 在 Windows 上可能不正确匹配反斜杠路径 |
| L7 | `detectionPipeline.js:172-173` | `MIN_SWITCH_SCORE=0.25`, `MIN_SCORE_DELTA=0.10` 硬编码 |
| L8 | `workerPool.js:87` | Worker 任务大图像时，`new Uint8ClampedArray(task.imageData.data)` 在主线程同步复制，阻塞 UI |

---

## 4. 现阶段工作总结

### 4.1 已完成里程碑

| 版本 | 主题 | 关键成果 |
|------|------|---------|
| v1.4 | 高级对齐 | Gemini 目录 + Sobel 梯度检测 |
| v1.5 | 生产加固 | 内存池化、流式并发、UI 锁定 |
| v1.7 | 亚像素对齐 | 感知检测、架构加固 |
| v1.8 | 多Profile | Gemini + Doubao、多锚点探测、滑动窗口抖动校正 |
| v1.9 | 梯度滤波 | 假阳性防御、阈值调优 |
| v2.1 | SDK产品化 | Worker 接入、API 公开、一致性清理 |
| v2.2 | 引擎升级 | 六层管线、3D评分、自适应搜索、多遍移除 |
| v2.3 | 检测精度 | 缩放阈值降低、矩形水印支持、平滑背景方差、性能预设 |
| **v2.5** | **检测几何 + 移除质量** | **多边距模板探测、加权Alpha增益估计、内联资产嵌入、统一UI** |

### 4.2 当前工作区状态 (3 个未提交文件)

```
M src/app/manualSelection.js      — 手动选择画布增强
M src/cli/gwrRemoveCommand.js     — CLI 移除命令修改
M src/core/adaptiveDetector.js    — 自适应检测器修改
```

这些修改属于 v2.6 开发周期 (对应代码中的 `v2.6` 幽灵注释)，包含 forceProcess 功能和手动模式增强。**尚未提交、尚未测试、尚未文档化**。

### 4.3 验证基线 (2026-06-14)

```
pnpm lint    →  0 errors, 0 warnings  ✅
pnpm test    →  44 files, ~417 test cases (部分测试超时，需排查)
pnpm build   →  待验证
```

**注意**: 完整测试套件在 5 分钟内未完成（超时）。需要排查哪个测试文件卡住。可能原因：
1. 某个测试有无限循环或极慢操作
2. `memory_pressure.test.js` 需要特殊环境 (`--import ./scripts/stress-env.mjs`)
3. 某个测试等待 Promise 永不 resolve

### 4.4 健康度评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | 8.5/10 | 五层管线+多Profile+三入口覆盖完善；缺 SSIM、WASM、E2E |
| 代码质量 | 7.0/10 | 巨型模块、魔法数字、公式不一致拉低分数 |
| 测试覆盖 | 7.5/10 | 417 测试用例覆盖广；但无浏览器E2E、无性能回归、部分模块无专测 |
| 架构健康 | 7.5/10 | 分层清晰但 detector.js 过大、单例风险、内存池未完全生效 |
| 文档一致性 | 5.0/10 | 版本号三处不一致、测试计数过时、幽灵v2.6、断链 |
| 安全性 | 8.0/10 | 无外部上传、innerHTML 使用少且受控；XSS 风险低 |
| **综合** | **7.3/10** | 功能强但工程规范待提升 |

---

## 5. 验证与单元测试计划

### 5.1 现有测试覆盖矩阵

| 源模块 | 测试文件 | 覆盖状态 |
|--------|---------|---------|
| `core/config.js` | `config.test.js` | ✅ |
| `core/detector.js` | `detector.test.js`, `detector_scoring.test.js` | ✅ |
| `core/detectionPipeline.js` | `pipeline.test.js`, `detection_fallback_chain.test.js` | ✅ |
| `core/adaptiveDetector.js` | `adaptive_detector.test.js` | ✅ |
| `core/blendModes.js` | `blendModes.test.js` | ✅ |
| `core/multiPassRemoval.js` | `multiPass_removal.test.js` | ✅ |
| `core/alphaCalibration.js` | `alpha_calibration.test.js` | ✅ |
| `core/alphaMap.js` | `alpha_map_formula.test.js` | ✅ |
| `core/catalog.js` | `catalog.test.js` | ✅ |
| `core/profiles.js` | (无专测，间接覆盖) | ⚠️ |
| `core/decisionPolicy.js` | `decision_policy.test.js` | ✅ |
| `core/watermarkEngine.js` | `watermarkEngine.test.js` | ✅ |
| `core/workerPool.js` + `worker.js` | `worker_resilience.test.js`, `memory_queue.test.js` | ✅ |
| `core/applyRemoval.js` | (间接覆盖) | ⚠️ `estimateAlphaGain` 有测试但 `applyRemovalStrategy` 无专测 |
| `core/restorationMetrics.js` | `metrics_precision.test.js` | ✅ |
| `core/utils.js` | (间接覆盖) | ⚠️ |
| `core/templates/registry.js` | `registry.test.js`, `template_resolution.test.js` | ✅ |
| `app/state.js` | `object_url_lifecycle.test.js` | ✅ |
| `app/processing.js` | (间接覆盖) | ⚠️ 批量并发/ZIP 无专测 |
| `app/dragDrop.js` | `frontend_contract.test.js`, `frontend_interaction.test.js` | ✅ |
| `app/settings.js` | (间接覆盖) | ⚠️ `syncTogglesToPreset` 无专测 |
| `app/manualSelection.js` | `manual_selection.test.js` | ✅ |
| `app/viewModes.js` | (无) | ❌ |
| `app/magnifier.js` | (无) | ❌ |
| `app/keyboard.js` | (无) | ❌ |
| `app/ui.js` | (间接覆盖) | ⚠️ |
| `cli/*` | `cli.integration.test.js` | ✅ (部分) |
| `sdk/*` | `sdk_api.test.js` | ✅ |
| `i18n/*` | `i18n_completeness.test.js` | ✅ |
| `python/*` | `test_bridge_integration.py` | ✅ |

### 5.2 测试盲区 — 需新增的单元测试

#### 优先级 P0 (必须补齐 — 对应已发现的 BUG)

| 测试名 | 验证目标 | 对应BUG |
|--------|---------|---------|
| `gradient_formula_consistency.test.js` | 验证 detector.js 三处梯度惩罚公式输出一致（同输入同输出） | BUG-C1 |
| `adaptive_default_threshold.test.js` | 验证 `detectAdaptiveWatermarkRegion()` 不传 threshold 时使用 `ADAPTIVE_MIN_CONFIDENCE` 而非 0.35 | BUG-C2 |
| `threshold_sot_integrity.test.js` | 遍历 detector.js 所有数值字面量，断言与 `DETECTION_THRESHOLDS` 对应值一致 | §1.3 问题D |
| `objecturl_clear_ordering.test.js` | 验证 `handleFiles` 中 `innerHTML=''` 先于 `objectUrlManager.clear()` 执行 | BUG-H1 |
| `worker_timeout_recovery.test.js` | 验证 Worker 超时后被 terminate 并替换，新任务不派发给超时 worker | BUG-H2 |
| `probe_confidence_buffer_reuse.test.js` | 验证 `calculateProbeConfidence` 抖动搜索不重复分配 Float32Array | BUG-H3 |

#### 优先级 P1 (重要补齐)

| 测试名 | 验证目标 |
|--------|---------|
| `estimate_alpha_gain_edge_cases.test.js` | `estimateAlphaGain` 在全黑/全白/单像素/零alphaMap 输入下的行为 |
| `apply_removal_strategy.test.js` | `applyRemovalStrategy` 对 Gemini/non-Gemini/forceProcess/multi-match 的分支覆盖 |
| `batch_concurrency.test.js` | `processQueue` 在 MAX_CONCURRENCY 限制、部分失败、空队列下的行为 |
| `zip_download_memory.test.js` | `downloadAllAsZip` 多次调用不泄漏 ObjectURL |
| `dragdrop_folder_recursion.test.js` | 深层目录递归、空目录、符号链接的边界行为 |
| `python_bridge_encoding.test.js` | Python→Node JSON 通信在中文文件名/特殊字符下的正确性 |
| `cli_pipe_mode.test.js` | CLI stdin→stdout 管道模式的端到端 |
| `max_pixels_rejection.test.js` | 超过 `MAX_PIXELS` (64MP) 和 `MAX_FILE_SIZE` (20MB) 的输入被正确拒绝 |
| `performance_preset_override.test.js` | 三档预设的 overrides 正确合并到 SEARCH_CONFIG |

#### 优先级 P2 (覆盖率提升)

| 测试名 | 验证目标 |
|--------|---------|
| `multi_pass_safety_gates.test.js` | near-black/texture-collapse/sign-flip/residual-low 四个停止条件的独立触发 |
| `alpha_calibration_binary_search.test.js` | 14档粗搜索+精细调整的边界值 |
| `catalog_scaled_matching.test.js` | `getScaledCatalogConfigs` 的 5 个参数边界 |
| `decision_policy_matrix.test.js` | 四种 source × 三种 tier 的完整矩阵 |
| `i18n_missing_key_fallback.test.js` | 缺失 key 时回退到 en-US |
| `magnifier_bounds_clamping.test.js` | 放大镜位置不超出滑块边界 |
| `keyboard_shortcuts.test.js` | 1/2/3/Esc/Ctrl+S 快捷键绑定 |

### 5.3 集成与回归测试计划

#### 5.3.1 真实样本回归集

建立 `tests/fixtures/regression/` 目录，包含标注过的真实水印图片：

```
tests/fixtures/regression/
├── gemini/
│   ├── 512x512_48px_margin32.png       # 标准小尺寸
│   ├── 1024x1024_96px_margin64.png      # 标准中尺寸
│   ├── 2048x2048_96px_margin64.png      # 标准大尺寸
│   ├── 1024x1024_48px_margin32.png      # 非标准 (小水印大图)
│   ├── cropped_850x850_unknown.png      # 裁剪后
│   ├── resized_1500x1500_scaled.png     # 缩放后
│   └── smooth_bg_sky.png                # 平滑背景
├── doubao/
│   ├── standard_1920x1080.png
│   └── portrait_1080x1920.png
├── negative/                             # 无水印负样本
│   ├── landscape.png
│   ├── portrait.png
│   └── pure_noise.png
└── expected_results.json                 # 每个样本的期望检测结果
```

`expected_results.json` 格式：
```json
{
  "gemini/1024x1024_96px_margin64.png": {
    "expectedProfile": "gemini",
    "expectedConfidenceMin": 0.60,
    "expectedX": 864, "expectedY": 864,
    "expectedWidth": 96, "expectedHeight": 96,
    "expectedTier": "direct-match"
  }
}
```

#### 5.3.2 性能回归基线

```javascript
// tests/performance_regression.test.js
const BASELINES = {
  '512x512_fast':     { maxMs: 100,  maxPasses: 2 },
  '512x512_balanced': { maxMs: 300,  maxPasses: 3 },
  '1024x1024_fast':   { maxMs: 400,  maxPasses: 2 },
  '1024x1024_thorough': { maxMs: 3000, maxPasses: 4 },
  '2048x2048_balanced': { maxMs: 2000, maxPasses: 3 },
  '4096x4096_balanced': { maxMs: 8000, maxPasses: 3 },
};
```

#### 5.3.3 超时测试排查

当前 `pnpm test` 在 5 分钟内未完成。排查步骤：

```bash
# 逐文件运行，找出卡住的测试
for f in tests/*.test.js; do
  echo "=== $f ===";
  timeout 30 node --test "$f" 2>&1 | tail -3;
done
```

重点嫌疑文件：
- `memory_pressure.test.js` — 需要 `--import ./scripts/stress-env.mjs`
- `e2e_integration.test.js` — 可能有真实图片解码
- `real_sample.test.js` — 可能有文件系统依赖

### 5.4 验证检查清单 (Definition of Done)

每个 BUG 修复必须满足：

- [ ] 修复对应 BUG 的单元测试已编写且通过
- [ ] `pnpm lint` 保持 0 errors
- [ ] `pnpm test` 全量通过 (设定超时阈值)
- [ ] `pnpm build` 生产构建成功
- [ ] 修改的文件运行 `lsp_diagnostics` 无新增错误
- [ ] 若修改了阈值，同步更新 `TECHNICAL_GUIDE.md` 参数表
- [ ] 若修改了 API，同步更新 `sdk/index.d.ts`

---

## 6. 修复优先级与行动项

### Phase 1: 紧急修复 (Critical + High BUG)

| 序号 | BUG | 预估工时 | 影响范围 |
|------|-----|---------|---------|
| 1.1 | BUG-C1: 梯度公式不一致 | 0.5h | 检测精度 |
| 1.2 | BUG-C2: adaptiveDetector 默认阈值冲突 | 0.5h | 自适应检测率 |
| 1.3 | BUG-H1: ObjectURL 清理顺序 | 1h | 内存泄漏 |
| 1.4 | BUG-H2: Worker 超时不回收 | 2h | 稳定性 |
| 1.5 | BUG-H3: 探针内存池失效 | 1h | 性能 |
| 1.6 | 排查测试超时 | 2h | CI/CD |

### Phase 2: 一致性修复 (Medium BUG + 文档)

| 序号 | 项目 | 预估工时 |
|------|------|---------|
| 2.1 | 将 detector.js 15+ 魔法数字迁入 DETECTION_THRESHOLDS | 3h |
| 2.2 | 统一版本号: package.json → 2.5.0，清除 v2.6 幽灵注释 | 1h |
| 2.3 | 更新 README.md 断链 (DIAGNOSTIC_PLAN.md) | 0.5h |
| 2.4 | 更新所有文档的测试计数为实际值 | 0.5h |
| 2.5 | 更新 TECHNICAL_GUIDE.md 页脚版本号 | 0.2h |
| 2.6 | 清理 reports/ 中的过时基线引用 | 0.5h |

### Phase 3: 测试补齐 (P0 + P1)

| 序号 | 测试组 | 预估工时 |
|------|--------|---------|
| 3.1 | P0 测试 (6个文件) | 6h |
| 3.2 | P1 测试 (9个文件) | 9h |
| 3.3 | 真实样本回归集建设 | 4h |
| 3.4 | 性能回归基线 | 3h |

### Phase 4: 架构改进 (Long-term)

| 序号 | 项目 | 预估工时 |
|------|------|---------|
| 4.1 | 拆分 detector.js → scoring.js + search.js + context.js | 8h |
| 4.2 | 移除 `_defaultContext` 单例，强制注入 context | 4h |
| 4.3 | 补齐 Playwright E2E 测试 | 8h |
| 4.4 | SDK 多子路径导出 (./browser, ./node) | 4h |
| 4.5 | WASM 加速 NCC/Sobel (ROADMAP v2.4) | 16h+ |

### 总预估

| Phase | 工时 | 优先级 |
|-------|------|--------|
| Phase 1 | ~7h | 🔴 立即 |
| Phase 2 | ~6h | 🟡 本周 |
| Phase 3 | ~22h | 🟡 本周-下周 |
| Phase 4 | ~40h+ | 🟢 长期 |

---

## 附录: 审计方法论

### 数据来源

1. **Git 历史**: `git log --oneline -40` — v1.4.0 到 v2.5.0 完整版本线
2. **源码精读**: `src/core/` 全部 19 模块 + `src/app/` 全部 9 模块 + `build.js` + `eslint.config.js`
3. **上游对比**: `.tmp_original/` 目录 (GargantuaX v1.0.20 完整快照)
4. **文档审查**: README/DEVELOPER_GUIDE/TECHNICAL_GUIDE/ROADMAP + reports/ 全部
5. **静态分析**: Select-String 魔法数字扫描、grep 模式匹配
6. **运行时验证**: `pnpm lint` (0 errors)、`node --test` 子集运行

### 局限性

- 未进行真实图片端到端检测验证（需 sample/ 目录图片）
- 未进行浏览器 UI 手工测试
- 未进行 Python bridge 跨平台测试
- 测试超时根因未最终定位（排查步骤已给出）
- Worker Pool 并发场景未压力测试

---

*文档结束 — 2026-06-14 基线分析*
