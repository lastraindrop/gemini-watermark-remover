# 全面诊断报告与行动计划

> 诊断日期: 2026-05-16
> 当前分支: `main` (fork)
> 当前版本: v2.1.0 (`@lastraindrop/gemini-watermark-remover`)
> 原仓库: `@pilio/gemini-watermark-remover` v1.0.14 (GargantuaX)
> 验证基线: 367/367 tests pass, lint pass, build pass

---

## 第一部分：架构分析

### 1.1 项目总体架构

本项目是一个 Gemini AI 生成图像水印检测与移除工具，采用纯 JavaScript 实现，基于数学精确的反向 Alpha 混合算法。支持三种运行模式：Web UI、CLI、Python Bridge。

```
架构分层：
┌──────────────────────────────────────────────┐
│  Web UI (app.js + app/*)                      │  ← 浏览器前端
├──────────────────────────────────────────────┤
│  SDK/API (sdk/index.js)                       │  ← 公共 API 面
├──────────────────────────────────────────────┤
│  CLI (cli.js + cli/*)                         │  ← 命令行入口
├──────────────────────────────────────────────┤
│  Detection Pipeline (core/detectionPipeline)  │  ← 检测管线 ★
│  ├── Profiles & Registry                      │
│  ├── Catalog (resolution → config mapping)    │
│  ├── Detector (NCC + gradient correlation)    │
│  └── Alpha Map calculation                    │
├──────────────────────────────────────────────┤
│  Removal Engine (core/blendModes + worker)     │  ← 移除引擎
│  └── Reverse Alpha Blending                   │
├──────────────────────────────────────────────┤
│  Assets (bg_48.png, bg_96.png, doubao assets) │  ← 校准资产
├──────────────────────────────────────────────┤
│  Python Bridge (python/remover.py)            │  ← Python 封装
└──────────────────────────────────────────────┘
```

### 1.2 架构评估

**优点：**
- 清晰的分层设计，Web/CLI/Python 共享核心管线
- Template Registry 设计合理，支持多 profile 扩展
- Worker 协程处理恢复阶段的像素操作，避免阻塞主线程
- Object URL 生命周期管理完善，防止内存泄漏
- i18n 国际化支持完善（7 语言）
- 367 个测试用例，覆盖面广

**问题：**
- 检测管线与原仓库相比严重退化（详见第二部分）
- 缺少原仓库的后验证和自适应机制
- Alpha Map 依赖外部图片加载，而非内嵌数据

---

## 第二部分：与原仓库对比分析

### 2.1 结构对比

| 模块 | 原仓库 (GargantuaX v1.0.14) | 本 fork (v2.1.0) | 差距 |
|------|---------------------------|-------------------|------|
| 自适应检测器 | `adaptiveDetector.js` (450+ 行) | 无 | **缺失** |
| 候选选择器 | `candidateSelector.js` | 无 | **缺失** |
| 水印决策策略 | `watermarkDecisionPolicy.js` (180+ 行) | 无 | **缺失** |
| 水印处理器 | `watermarkProcessor.js` (700+ 行) | 无 | **缺失** |
| 多遍移除 | `multiPassRemoval.js` (130+ 行) | 无 | **缺失** |
| 内嵌 Alpha Map | `embeddedAlphaMaps.js` | 无（依赖 PNG 加载） | **缺失** |
| 预览校准 | `previewAlphaCalibration.js` | 无 | **缺失** |
| 候选调试 | `selectionDebug.js` | 无 | **缺失** |
| Alpha 混合 | `blendModes.js` | `blendModes.js`（基本相同） | 等价 |
| 目录系统 | `geminiSizeCatalog.js` | `catalog.js` + `templates/registry.js` | 重构版 |
| 配置 | `watermarkConfig.js` | `config.js` + `profiles.js` | 扩展版 |
| 恢复质量 | `restorationMetrics.js` | `restorationMetrics.js`（简化版） | 退化 |

### 2.2 关键差异详解

#### 差异 1：检测管线（最关键）

**原仓库的完整管线 (`watermarkProcessor.js` → `processWatermarkImageData`)：**
```
1. detectWatermarkConfig()           → 目录匹配
2. resolveInitialStandardConfig()    → 比较 48/96 模板相关性，选择最优
3. selectInitialCandidate()          → 多维度候选选择
   ├── 标准候选：目录精确位置
   ├── 自适应候选：多尺度全局搜索
   │   ├── 空间 NCC (权重 0.5)
   │   ├── 梯度 NCC (权重 0.3)
   │   └── 方差得分 (权重 0.2)
   ├── 亚像素偏移候选
   └── Alpha 增益候选
4. 首次移除 + 质量评估
5. 多遍移除 (removeRepeatedWatermarkLayers)
   ├── 近黑安全检查
   ├── 纹理崩溃检测
   └── 残差阈值控制
6. Alpha 强度重新校准 (recalibrateAlphaStrength)
7. 亚像素轮廓精炼 (refineSubpixelOutline)
8. 预览残余边缘清理 (refinePreviewResidualEdge)
   └── 多预设遍历 + 光环检测
```

**本 fork 的管线 (`detectionPipeline.js` → `detectWatermarks`)：**
```
1. getAllPotentialConfigs()     → 目录匹配 + 缩放匹配
2. calculateProbeConfidence()  → 单点 NCC + 局部对比度
3. detectWatermark()           → 全局搜索 (NCC + 梯度惩罚)
4. 直接排名 + 选择最佳
5. 移除（无后验证）
```

**结论：本 fork 缺少原仓库最核心的 5 个模块。**

#### 差异 2：检测评分函数

**原仓库 (`adaptiveDetector.js` → `scoreCandidate`)：**
```javascript
confidence = spatial * 0.5 + gradient * 0.3 + variance * 0.2
```
- 三维评分，方差维度帮助区分真实水印与背景纹理

**本 fork (`detector.js` → `calculateCorrelation`)：**
```javascript
// 仅 NCC 单一维度
return (count * sumIA - sumI * sumA) / Math.sqrt(varI * varA)
```
- 缺少方差维度
- 梯度惩罚 (`gradientPenalty=0.30`) 在 `gradientConf < 0.05` 时直接将 `confidence *= 0.30`，过于激进

#### 差异 3：Alpha Map 来源

**原仓库：** `embeddedAlphaMaps.js` 将 alpha map 编码为 Base64 字符串内嵌在代码中，零外部依赖。

**本 fork：** `watermarkEngine.js` 通过 `Image` 元素加载 `bg_48.png` / `bg_96.png`，然后 `canvas.getImageData()` + `calculateAlphaMap()` 计算。在 CLI 环境使用 `sharp` 库解码。

问题：
- Web 环境依赖图片正确加载，网络/路径错误会导致检测完全失败
- 额外的解码开销

#### 差异 4：决策策略

**原仓库 (`watermarkDecisionPolicy.js`)：**
- 分层决策：`direct-match` / `needs-validation` / `insufficient`
- 标准匹配：空间 ≥ 0.30 且梯度 ≥ 0.12，或空间 ≥ 0.295 且梯度 ≥ 0.45
- 自适应匹配：置信度 ≥ 0.50 且空间 ≥ 0.45 且梯度 ≥ 0.12
- 归因匹配：多维度验证（含抑制增益、残余检查等）

**本 fork：**
- 仅阈值过滤：`FINAL_ANCHORED ≥ 0.15`, `FINAL_ALIGNED ≥ 0.18`, `FINAL_FREE ≥ 0.22`
- 无分层决策，无验证机制

---

## 第三部分：完整代码审查与 BUG 清单

### 3.1 严重 BUG（影响检测命中率）

#### BUG-01：缺少初始模板比较
- **位置**: `src/core/detectionPipeline.js` L148-223
- **描述**: 原仓库在检测前先比较 48/96 模板在各候选位置的 NCC 得分 (`resolveInitialStandardConfig`)，动态选择更合适的模板大小。本 fork 直接用 `getAllPotentialConfigs` 返回所有候选配置逐一尝试，不做初始比较，导致：
  - 96px 模板在复杂背景上可能误匹配
  - 48px 模板在需要 96px 的场景被忽略
- **影响**: 检测命中率下降
- **严重度**: 🔴 CRITICAL

#### BUG-02：梯度惩罚过于激进
- **位置**: `src/core/detector.js` L243
- **代码**: `if (gradientConf < 0.05) confidence = confidence * gradientPenalty;`（gradientPenalty = 0.30）
- **描述**: 当图像在候选区域梯度很低（均匀背景/水印区域天然平滑）时，NCC 得分被乘以 0.30，直接大幅降低有效置信度。Gemini 水印在浅色/均匀背景上最常见，此时图像梯度天然很低，但水印确实存在。
- **影响**: 大量真实水印被误判为"未检测到"
- **严重度**: 🔴 CRITICAL

#### BUG-03：缺少方差维度评分
- **位置**: `src/core/detector.js` L322-358 (`calculateCorrelation`)
- **描述**: 原仓库的 `scoreCandidate` 使用空间 + 梯度 + 方差三维加权评分，方差维度专门检测"水印区域方差低于周围背景"这一特征。本 fork 仅用 NCC 单一维度，无法有效区分真实水印与相似纹理。
- **影响**: 纹理复杂背景下的误报和漏报
- **严重度**: 🔴 CRITICAL

#### BUG-04：Registry 匹配容差过严
- **位置**: `src/core/templates/registry.js` L54-61
- **代码**: `MAX_SCALE_MISMATCH = 0.015`
- **描述**: 仅允许 1.5% 的缩放误差，意味着只有完全精确的分辨率匹配才能命中目录。用户导出的图像如果经过了任何缩放/重采样（极其常见），都会 miss 目录，进入启发式搜索。
- **影响**: 大部分真实用户图像无法命中精确目录
- **严重度**: 🟠 HIGH

#### BUG-05：缺少后验证管线
- **位置**: `src/core/detectionPipeline.js` 全局
- **描述**: 原仓库的完整管线包括：
  - 首次移除后的残差评估
  - 多遍移除（带近黑安全检查和纹理崩溃检测）
  - Alpha 强度重新校准（14 档候选 + 精细调整）
  - 亚像素轮廓精炼（9 个位移候选 × 3 个缩放候选）
  - 边缘残余清理（4 预设 + 1 激进预设，带光环检测）
  
  本 fork 在检测后直接单次移除，无任何后验证。这导致：
  - 检测位置微偏时无法自动纠正
  - Alpha 强度不匹配时无法自适应调整
  - 移除不彻底时无法多遍迭代
- **影响**: 水印移除质量不稳定
- **严重度**: 🔴 CRITICAL

### 3.2 高优先级问题

#### BUG-06：`standardMargins` 硬编码列表含非标准值
- **位置**: `src/core/detector.js` L251
- **代码**: `const standardMargins = [32, 64, 96, 24, 10, 4, 38, 25, 39, 16];`
- **描述**: 38, 25, 39 不是 Gemini 标准边距值。这导致某些随机位置被错误标记为"aligned"（得分 +0.10），可能选错候选位置。
- **严重度**: 🟠 HIGH

#### BUG-07：Alpha Map 加载路径在构建后可能失效
- **位置**: `src/core/watermarkEngine.js` L140
- **代码**: `src = \`assets/${assetName}.png\``
- **描述**: 在 esbuild 打包后，相对路径 `assets/` 可能无法正确解析。原仓库通过 `embeddedAlphaMaps.js` 将数据内嵌在代码中避免了此问题。
- **严重度**: 🟠 HIGH

#### BUG-08：CLI 的 `--pipe` 模式路径错误
- **位置**: `src/cli/gwrRemoveCommand.js` L100-103
- **代码**: `cmd = ["node", self.cli_path, "--pipe"]`（缺少 "remove" 子命令）
- **描述**: Python bridge 的 `remove_watermark_pipe` 在 `cli_path` 以 `.js` 结尾时，生成的命令缺少 `remove` 关键字，导致 pipe 模式实际执行的是 help 输出而非处理。
- **严重度**: 🟠 HIGH

#### BUG-09：Worker 超时时间过短
- **位置**: `src/core/watermarkEngine.js` L91
- **代码**: `}, 5000)` (5 秒超时)
- **描述**: 4K 图像（4096×4096）处理时间可能超过 5 秒，导致超时回退到主线程。应改为自适应超时或至少 15 秒。
- **严重度**: 🟡 MEDIUM

### 3.3 中等优先级问题

#### BUG-10：`calculateProbeConfidence` 每次抖动搜索分配新 Float32Array
- **位置**: `src/core/detector.js` L502-503
- **描述**: `doubao` 分支使用了外部传入的 `gradientsI`/`gradientsA` 缓冲区，但 `gemini` 分支在每次抖动循环中 `new Float32Array()`，造成不必要的 GC 压力。
- **严重度**: 🟡 MEDIUM

#### BUG-11：`getEngineOptions` 中 `probeThreshold` 计算逻辑
- **位置**: `src/app.js` L574
- **代码**: `probeThreshold: thresholdSliderVal / fallbackToProbeRatio`（fallbackToProbeRatio = 0.25/0.18 ≈ 1.39）
- **描述**: 当用户设置阈值滑块为 0.25 时，probeThreshold 实际传入 0.18，这个比例关系无文档说明且不直观。
- **严重度**: 🟡 MEDIUM

#### BUG-12：`getBatchConcurrency` 逻辑不匹配
- **位置**: `src/app/processing.js` L67
- **代码**: `if (options.profileId === 'auto' ...) return 1`
- **描述**: auto profile 本应最需要并行（因为要尝试多个 profile），但反而限制为并发 1。
- **严重度**: 🟡 MEDIUM

#### BUG-13：Python bridge `remove_watermark_pipe` 缺少 `remove` 命令
- **位置**: `python/remover.py` L100-103
- **代码**: `cmd = ["node", self.cli_path, "--pipe"]`
- **描述**: 与 BUG-08 相同的 pipe 模式问题。当 `cli_path` 指向 `.js` 文件时，生成的命令是 `node cli.js --pipe` 而非 `node cli.js remove --pipe`。
- **严重度**: 🟠 HIGH

### 3.4 低优先级问题

#### BUG-14：`_lastVar` 模块级可变状态
- **位置**: `src/core/detector.js` L19
- **描述**: 模块级 `_lastVar` 变量用于在 `calculateCorrelation` 和 Phase 2 间通信。虽然功能正确，但并发/批处理场景可能互相干扰。
- **严重度**: 🟢 LOW

#### BUG-15：`fastBoxBlur` 边界像素未模糊
- **位置**: `src/core/detector.js` L608-623
- **描述**: 模糊仅处理 `[1, height-2]` × `[1, width-2]` 区域，边界像素直接拷贝。对水印检测影响极小。
- **严重度**: 🟢 LOW

#### BUG-16：`RestorationMetrics.calculateSSIM` 标记为 deprecated 但仍导出
- **位置**: `src/core/restorationMetrics.js` L47, `src/sdk/index.js` L14
- **描述**: `calculateSSIM` 实际不是 SSIM 而是 PSNR 映射，但通过 SDK 公开导出，可能误导用户。
- **严重度**: 🟢 LOW

---

## 第四部分：水印检测未命中根因分析

### 4.1 根因链

```
用户反馈：很多图像水印检测未命中
         ↓
直接原因：检测管线返回 confidence 低于阈值
         ↓
根本原因 1：NCC 单维评分无法区分水印与背景纹理
            （缺少原仓库的梯度+方差多维评分）
         ↓
根本原因 2：梯度惩罚将均匀背景上的真实水印 confidence 大幅压低
            (BUG-02: confidence * 0.30)
         ↓
根本原因 3：目录匹配容差过严 (1.5%)，缩放图像全部 miss 目录
            (BUG-04: MAX_SCALE_MISMATCH = 0.015)
         ↓
根本原因 4：无初始模板比较，无法动态选择最优模板大小
            (BUG-01: 缺少 resolveInitialStandardConfig)
         ↓
根本原因 5：无后验证管线，检测位置微偏时无法自动修正
            (BUG-05: 缺少完整后处理管线)
```

### 4.2 典型场景复现

**场景 1：Gemini 标准输出，均匀浅色背景**
1. 图像分辨率 1024×1024，精确匹配目录 → 进入 catalog-probe
2. `calculateProbeConfidence` 计算 NCC → 得到 0.35
3. `deepScan=true`，计算梯度相关 → 梯度很低（均匀背景）→ `gradientConf = 0.03 < 0.05`
4. `confidence = 0.35 * 0.30 = 0.105` → 低于 `FINAL_ANCHORED = 0.15`
5. **结果：检测失败** ✗

**场景 2：用户截图/裁剪后，轻微缩放**
1. 图像分辨率 1080×1080（被用户缩放），不匹配任何目录条目
2. 进入 `getScaledCatalogConfigs` → `MAX_SCALE_MISMATCH = 0.015` 可能通过
3. 但 Registry 的 `findMatches` 用 `MAX_SCALE_MISMATCH = 0.015` → 严格匹配失败
4. 退到 `detectWatermark` 全局搜索
5. 搜索范围 45%×45% → 在大图上搜索面积巨大
6. 梯度惩罚再次压低分数
7. **结果：检测失败** ✗

**场景 3：纹理复杂背景（风景、花朵）**
1. NCC 在纹理区域产生高假阳性候选
2. 但真实水印位置因纹理干扰导致 NCC 不够高
3. 缺少方差维度评分，无法区分
4. **结果：漏报或位置偏移** ✗

---

## 第五部分：行动计划

### 总体策略

**不直接回退到原仓库代码**，而是在现有架构基础上，将原仓库的核心算法能力移植到本 fork 的模块化结构中。保持多 profile、i18n、Web UI、Python bridge 等 fork 特色。

### Phase 0：准备与基线 (1天)

#### 0.1 创建诊断测试基线
- **文件**: 新建 `tests/diagnostic_baseline.test.js`
- **内容**: 
  - 准备一组已知 Gemini 水印图像的测试 fixture（包括：均匀背景、纹理背景、标准分辨率、缩放分辨率、不同水印大小 48/96）
  - 每个测试用例定义：输入图像 → 期望检测结果（是否检测到、期望置信度范围）
  - 记录当前检测结果作为基线
- **目的**: 后续每个 Phase 的修改都有量化对比

#### 0.2 建立持续验证机制
- 运行 `npm test` + `npm run lint` + `npm run build` 三件套
- 确保 367 个现有测试全部通过作为回归基线

---

### Phase 1：修复关键检测 BUG (3天)

#### 1.1 修复 BUG-02：梯度惩罚策略优化
- **文件**: `src/core/detector.js`
- **位置**: L243, L485
- **修改方案**:
  ```javascript
  // 现有代码（过于激进）:
  if (gradientConf < 0.05) confidence = confidence * gradientPenalty;
  
  // 改为分层策略:
  if (gradientConf < 0.02) {
    // 极低梯度 - 仅在 NCC 本身也很低时惩罚
    if (confidence < 0.20) confidence = confidence * gradientPenalty;
  } else if (gradientConf < 0.08) {
    // 低梯度 - 温和惩罚
    confidence = confidence * (0.5 + gradientPenalty * 0.5);
  }
  // 梯度 ≥ 0.08 时不惩罚，直接取 max
  ```
- **测试**: 新增 `tests/detection_gradient_penalty.test.js`
  - 测试均匀背景上的已知水印不被梯度惩罚误杀
  - 测试无水印区域仍被正确排除

#### 1.2 修复 BUG-04：Registry 匹配容差
- **文件**: `src/core/templates/registry.js`
- **位置**: L54
- **修改**: `MAX_SCALE_MISMATCH = 0.015` → `MAX_SCALE_MISMATCH = 0.05`
- **理由**: 允许 5% 缩放误差，覆盖常见截图/导出场景
- **测试**: 新增 `tests/scaled_catalog_strict.test.js`
  - 测试精确匹配仍返回 isOfficial
  - 测试 3-5% 缩放图像能命中目录
  - 测试 >10% 缩放仍正确 fall through 到启发式

#### 1.3 修复 BUG-06：standardMargins 清理
- **文件**: `src/core/detector.js`
- **位置**: L251
- **修改**: `const standardMargins = [32, 64, 96, 24, 10, 4, 38, 25, 39, 16]` → 仅保留 Gemini 已知边距 `[32, 64, 96]` 加上 doubao 已知边距 `[11, 24, 38, 39, 16, 10, 4, 25]`
- **测试**: 修改现有 `tests/detector.test.js` 添加 alignment 判定用例

#### 1.4 修复 BUG-01：添加初始模板比较
- **文件**: `src/core/detectionPipeline.js`
- **位置**: 在 L196（`potentialConfigs` 循环前）插入
- **修改**: 添加 `resolveInitialStandardConfig` 逻辑
  ```javascript
  function resolveInitialTemplateConfig(imageData, alphaMaps, catalogConfigs) {
    // 对每个 catalog 配置，比较 NCC 得分
    // 如果 48px 得分比 96px 高出 minScoreDelta (0.08)，切换到 48px
    // 否则保持默认（96px for >1024, 48px for <=1024）
  }
  ```
- **测试**: 新增 `tests/initial_template_selection.test.js`

---

### Phase 2：移植自适应检测评分 (3天)

#### 2.1 添加方差维度评分
- **文件**: `src/core/detector.js`
- **位置**: 在 `calculateCorrelation` 之后新增函数
- **新增函数**: `calculateVarianceScore(imageData, x, y, width, height, alphaMap)`
  - 计算候选区域与上方参考区域的方差比
  - 真实水印区域方差低于周围背景
  - 返回 [0, 1] 分数
- **集成点**: `detectWatermark` Phase 2 评分处，添加方差维度
  ```javascript
  // 综合评分（与原仓库一致）
  const spatialScore = confidence; // NCC
  const gradientScore = gradientConf; // 梯度
  const varianceScore = calculateVarianceScore(...);
  confidence = Math.max(0, spatialScore) * 0.5 +
               Math.max(0, gradientScore) * 0.3 +
               varianceScore * 0.2;
  ```
- **测试**: 新增 `tests/variance_scoring.test.js`
  - 测试水印区域方差低于周围
  - 测试均匀无水印区域方差比接近 1.0

#### 2.2 移植自适应检测器核心逻辑
- **文件**: 新建 `src/core/adaptiveDetector.js`
- **从原仓库移植**: `detectAdaptiveWatermarkRegion` 的核心逻辑
  - 粗到细多尺度搜索
  - 多维评分（空间 + 梯度 + 方差）
  - 模板插值（`interpolateAlphaMap`）支持非标准大小
  - Top-K 候选收集 + 精细搜索
- **接口适配**: 保持本 fork 的 profile/catalog 接口
- **集成点**: 在 `detectionPipeline.js` 的全局搜索阶段调用
- **测试**: 新增 `tests/adaptive_detector.test.js`
  - 合成水印图像检测
  - 缩放图像检测
  - 偏移位置检测

---

### Phase 3：移植后验证管线 (3天)

#### 3.1 移植多遍移除
- **文件**: 新建 `src/core/multiPassRemoval.js`
- **从原仓库移植**: `removeRepeatedWatermarkLayers`
  - 带安全检查的迭代移除
  - 近黑检测、纹理崩溃检测
  - 残差阈值控制
- **集成点**: `watermarkEngine.js` L242-245，将单次 `removeWatermark` 替换为多遍调用
- **测试**: 新增 `tests/multipass_removal.test.js`
  - 测试多遍后残余分数递减
  - 测试安全检查正确触发

#### 3.2 移植 Alpha 强度校准
- **文件**: 新建 `src/core/alphaCalibration.js`
- **从原仓库移植**: `recalibrateAlphaStrength`
  - 14 档增益候选遍历
  - 精细调整（±0.05 步进）
  - 近黑安全约束
- **集成点**: 多遍移除之后
- **测试**: 新增 `tests/alpha_calibration.test.js`

#### 3.3 移植亚像素精炼
- **文件**: `src/core/adaptiveDetector.js`（已在 2.2 创建）
- **从原仓库移植**: `warpAlphaMap` + `refineSubpixelOutline`
  - 9 位移 × 3 缩放候选搜索
  - 代价函数：|spatial| × 0.6 + max(0, gradient)
- **测试**: 新增 `tests/subpixel_refinement.test.js`

#### 3.4 移植边缘残余清理
- **文件**: 新建 `src/core/edgeCleanup.js`
- **从原仓库移植**: `refinePreviewResidualEdge` + `blendPreviewResidualEdge`
  - 4 标准 + 1 激进预设
  - 光环检测与抑制
  - 多轮迭代（最多 3 次）
- **测试**: 新增 `tests/edge_cleanup.test.js`

---

### Phase 4：修复其他 BUG + 增强 (2天)

#### 4.1 修复 BUG-07：Alpha Map 内嵌
- **文件**: 新建 `src/core/embeddedAlphaMaps.js`
- **从原仓库移植**: 将 `bg_48.png` / `bg_96.png` 编码为 Base64 内嵌
- **修改**: `watermarkEngine.js` 的 `getAlphaMap` 方法，优先使用内嵌数据
- **修改**: `gwrRemoveCommand.js` 的 `Engine.getAlphaMap`，优先使用内嵌数据
- **测试**: 新增 `tests/embedded_alpha_maps.test.js`

#### 4.2 修复 BUG-08 + BUG-13：Python pipe 命令
- **文件**: `python/remover.py` L100-103
- **修改**:
  ```python
  if self.cli_path.endswith(".js"):
      cmd = ["node", self.cli_path, "remove", "--pipe"]  # 添加 "remove"
  ```

#### 4.3 修复 BUG-09：Worker 超时
- **文件**: `src/core/watermarkEngine.js` L91
- **修改**: `5000` → `Math.max(5000, imageData.width * imageData.height / 500000)`（自适应超时）

#### 4.4 修复 BUG-10：内存池复用
- **文件**: `src/core/detector.js` L502-503
- **修改**: 使用 `detectWatermark._probeGradientsI` 等复用缓冲区

#### 4.5 修复 BUG-11：probeThreshold 计算
- **文件**: `src/app.js` L574
- **修改**: 直接使用 `thresholdSliderVal` 作为 `probeThreshold`，移除不直观的比例换算

#### 4.6 修复 BUG-12：batchConcurrency
- **文件**: `src/app/processing.js` L67
- **修改**: auto profile 使用并发 2（而非 1）

---

### Phase 5：决策策略移植 + 统一 (2天)

#### 5.1 移植决策策略
- **文件**: 新建 `src/core/decisionPolicy.js`
- **从原仓库移植**: `classifyStandardWatermarkSignal` + `classifyAdaptiveWatermarkSignal`
- **集成点**: `detectionPipeline.js` 最终决策处
- **修改**: 将纯阈值过滤替换为分层决策
- **测试**: 新增 `tests/decision_policy.test.js`

#### 5.2 统一元数据输出格式
- **修改**: `watermarkEngine.js` 的返回值增加 `meta` 字段
  - `decisionTier`: 'direct-match' / 'needs-validation' / 'insufficient'
  - `suppressionGain`: 移除前后空间分数差
  - `passCount`: 实际移除遍数
  - `alphaGain`: 最终 Alpha 增益
- **修改**: CLI JSON 输出包含新字段
- **测试**: 新增 `tests/metadata_contract.test.js`

---

### Phase 6：完整单元测试体系 (3天)

#### 6.1 检测精度测试矩阵
- **文件**: 新建 `tests/detection_accuracy_matrix.test.js`
- **内容**:
  | 场景 | 图像 | 期望结果 |
  |------|------|---------|
  | 标准 Gemini 1:1 1K | 1024×1024 合成水印 | confidence ≥ 0.5, 正确位置 |
  | 标准 Gemini 16:9 1K | 1376×768 合成水印 | confidence ≥ 0.4, 正确位置 |
  | 缩放 95% | 972×972 | 检测到，位置正确 |
  | 缩放 105% | 1075×1075 | 检测到，位置正确 |
  | 均匀白色背景 | 1024×1024 | 检测到（梯度惩罚不应误杀） |
  | 均匀黑色背景 | 1024×1024 | 检测到 |
  | 浅灰渐变背景 | 1024×1024 | 检测到 |
  | 复杂纹理（花朵/风景） | 1024×1024 | 检测到，误报率低 |
  | 无水印图像 | 1024×1024 | 不应误报 |
  | 裁剪图像 | 900×900 裁剪自 1024 | 检测到 |
  | 48px 水印 | 512×512 | 检测到，使用 48px 模板 |
  | 非标准分辨率 | 800×600 | 检测到（启发式模式） |

#### 6.2 移除质量测试
- **文件**: 新建 `tests/removal_quality.test.js`
- **内容**:
  - 合成水印 → 移除 → PSNR ≥ 40dB
  - Alpha 增益校准前后对比
  - 多遍移除残差递减验证
  - 边缘清理效果验证

#### 6.3 回归测试
- **文件**: 确保现有 367 个测试全部通过
- **新增**: 针对每个修改点的专项测试

#### 6.4 性能基准
- **文件**: 新建 `tests/performance_benchmark.test.js`
- **内容**:
  - 1K 图像处理时间 < 500ms（主线程）
  - 2K 图像处理时间 < 2s
  - 4K 图像处理时间 < 8s
  - 内存峰值 < 200MB

---

## 第六部分：执行顺序与时间线

```
Week 1:
  Day 1:  Phase 0 (基线建立) + Phase 1.1-1.3 (快速修复)
  Day 2:  Phase 1.4 (初始模板比较) + Phase 2.1 (方差评分)
  Day 3:  Phase 2.2 (自适应检测器移植)

Week 2:
  Day 4:  Phase 3.1 (多遍移除)
  Day 5:  Phase 3.2-3.3 (Alpha 校准 + 亚像素)
  Day 6:  Phase 3.4 (边缘清理) + Phase 4 (其他 BUG)

Week 3:
  Day 7:  Phase 5 (决策策略)
  Day 8-9: Phase 6 (测试体系)
  Day 10: 全量回归 + 文档更新
```

## 第七部分：验证清单

每个 Phase 完成后必须通过：
- [ ] `npm test` 全部通过（367+ 测试用例）
- [ ] `npm run lint` 无错误
- [ ] `npm run build` 成功
- [ ] 新增测试覆盖修改内容
- [ ] Phase 0 基线测试用例的命中率提升

最终验证：
- [ ] Phase 6 的完整精度矩阵全部通过
- [ ] 至少 5 张真实 Gemini 水印图像手动验证
- [ ] CLI + Web UI + Python bridge 三端验证
