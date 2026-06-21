# GWR Developer Guide (v2.7.0)

本指南说明当前分支的工程结构、参数一致化规则、检测管线（五层）、前端构建架构、测试策略，以及新增模板或修改检测策略时必须遵守的流程。

## 1. 当前架构

### 核心层

- `src/core/config.js`：统一配置中心 — `DETECTION_THRESHOLDS`（所有检测阈值单点管理）、`PERFORMANCE_PRESETS`（快速/均衡/全面三档性能模式）、`ENGINE_LIMITS`、候选生成
- `src/core/catalog.js`：尺寸与锚点目录，优先级最高
- `src/core/detector.js`：候选评分（NCC、局部对比度、梯度相关、方差评分 v2.3 改进）、三维评分融合
- `src/core/detectionPipeline.js`：统一 Web/CLI 的五层检测管线（Catalog → Scaled → Heuristic → Adaptive → Global），缩放配置阈值已降至 0.25
- `src/core/adaptiveDetector.js`：自适应检测（粗到细多尺度搜索 + 三维评分，**v2.3 支持矩形尺寸**如 401×173）
- `src/core/multiPassRemoval.js`：多遍移除（带近黑/纹理安全检查）
- `src/core/alphaCalibration.js`：Alpha 增益校准（14 档粗搜索 + 精细调整，边界条件已修复）
- `src/core/decisionPolicy.js`：分层决策策略（direct-match / needs-validation / insufficient）
- `src/core/watermarkEngine.js`：主引擎，协调检测→移除→校准管线
- `src/core/blendModes.js`：反向 alpha 混合恢复（支持 alphaGain 参数）
- `src/core/utils.js`：共享工具函数（cloneImageData, calculateNearBlackRatio, regionStdDev）
- `src/core/worker.js`：Web Worker 入口，批量处理像素恢复
- `src/core/templates/registry.js`：Profile 与 Catalog 注册中心

### 应用层

- `src/app.js`：薄入口，协调子模块（含版本号展示、预设同步、重处理按钮）
- `src/app/state.js`：全局状态管理、ObjectURL 生命周期
- `src/app/processing.js`：批处理、并发、下载、ZIP 输出
- `src/app/ui.js`：界面交互辅助（toast、审计日志、进度条）
- `src/app/dragDrop.js`：窗口级拖拽、文件验证、URL 获取、文件夹递归
- `src/app/keyboard.js`：快捷键绑定 (1/2/3/Esc/Ctrl+S)
- `src/app/settings.js`：参数持久化、语言选择、引擎选项构建、**`syncTogglesToPreset()` v2.3**
- `src/app/viewModes.js`：View 切换、对比滑块、Stats UI、Profile 主题
- `src/app/magnifier.js`：3x 放大镜（Slider 视图专用，v2.3 边界钳制）
- `public/index.html`、`src/tailwind.css`：前端骨架与样式（Tailwind 静态构建；v2.3 性能预设选择器、预设提示、重处理按钮）

### SDK 层

- `src/sdk/index.js`：独立 fork 公开 API 入口（calculateSSIM 已标记 @deprecated）
- `src/sdk/index.d.ts`：TypeScript 类型声明

### 入口层

- `src/cli.js`、`src/cli/gwrCli.js`、`src/cli/gwrRemoveCommand.js`：CLI（参数验证已增强）
- `python/remover.py`、`python/gui.py`：Python bridge 与 GUI
- `src/userscript/index.js`：userscript 入口
- `build.js`：打包与静态资源内联

## 2. 参数一致化原则（v2.3 更新）

当前 Web、CLI、Python bridge 必须共享同一组引擎参数：

- `profileId`：`gemini`、`doubao`、`auto`
- `deepScan`：是否启用梯度滤波（**v2.3 由性能预设控制**，不再由 UI 独立切换）
- `noiseReduction`：对输出进行降噪预处理（**v2.3 由性能预设控制**）
- `adaptiveMode`：自适应多尺度搜索开关（`'auto'` 或 `'off'`）
- `autoDownload`：单图与批量处理后的自动下载

### 2.1 性能预设覆盖 (v2.3)

引擎参数 `deepScan`、`noiseReduction`、`adaptiveMode` 和搜索几何参数**由性能预设控制**。用户在 UI 中选择 `fast`/`balanced`/`thorough` 后，预设的 overrides 会通过 `deepMerge()` 与用户阈值/惩罚滑块合并。开发者在调整预设参数时，只需修改 `config.js` 中的 `PERFORMANCE_PRESETS` 对象——引擎选项自动保持一致。

### 2.2 动态参数覆盖 (v2.1+)

引擎现在支持从入口层（Web UI/CLI/Python）透传参数覆盖。开发者在调用 `removeWatermarkFromImage` 时可提供以下可选参数：

- `probeThreshold`: (Number) 覆盖默认的探针灵敏度（`DETECTION_THRESHOLDS.DEFAULT_PROBE_THRESHOLD`）
- `fallbackThreshold`: (Number) 覆盖默认的全局回退阈值（`DETECTION_THRESHOLDS.GLOBAL_FALLBACK_MIN`）
- `gradientPenalty`: (Number) 覆盖梯度滤波惩罚 multiplier（默认 0.30）
- `manualConfig`: (Object) `{ x, y, width, height }` 直接指定水印位置，绕过搜索管线
- `overrides`: (Object) 允许覆盖 `detector.js` 中的 `SEARCH_CONFIG` 全量常量

## 3. 梯度滤波机制（v2.1.0）

`deepScan` 启用时，检测引擎在三个位置应用梯度滤波：

### 3.1 Phase 1（calculateProbeConfidence）

```
confidence = NCC
if (baseNcc >= 0.10 for exact matches, 0.14 for scaled) {
   confidence = Math.max(confidence, localContrastConf)
   if (deepScan) {
     计算 Sobel 梯度相关 gradientConf
     if (gradientConf < 0.02) confidence = confidence × gradientPenalty（上限0.50）
     else if (confidence >= 0.12 for exact / 0.18 for scaled)
       confidence = Math.max(confidence, gradientConf)
   }
}
```
*注：缩放匹配（`isScaledMatch`）禁用抖动精调（jitter）以避免虚警*

### 3.2 Phase 2（detectWatermark 精搜）

```
confidence = NCC (fullPrecision)
if (deepScan && confidence > 0.04) {
   计算梯度相关（复用显存池 _sharedGradientsI / _sharedGradientsA）
   方差评分 + 三维融合: weighted = spatial×0.5 + gradient×0.3 + variance×0.2
   confidence = max(spatial, weighted)  // v2.2: 防止高NCC被稀释
}
```

### 3.3 抖动搜索分支

```
combined = Math.max(NCC, localContrastConf)
if (gradientConf < 0.02) conf = combined × gradientPenalty（上限0.50）
else if (NCC >= 0.12) conf = Math.max(combined, gradientConf)
else conf = combined
```

### 3.4 设计说明

- **目的**: 防止纯亮度噪声（如正弦纹理、高频图案）产生假阳性 NCC 高值
- **原理**: Sobel 梯度相关测量图像边缘结构与水印模板边缘结构的对齐程度；无边缘匹配的 NCC 高分极可能是噪声假阳性
- **阈值 0.02**: 区分"有/无边缘匹配"的分界线，低于此值说明梯度相关可忽略
- **惩罚系数**: 由 `gradientPenalty` 参数控制（默认 0.30），上限 0.50
- **动态对齐**: 三处使用完全一致的公式，确保评分尺度统一。缩放匹配使用更高门控以减少虚警

## 4. 新增 profile 或模板的流程

1. 在 `src/core/profiles.js` 注册 profile。
2. 在 `src/core/catalog.js` 补齐官方尺寸、锚点或近似尺寸。
3. 如需新资源，把资产放入 `src/assets/` 并更新打包引用。
4. 更新 `src/core/config.js`，确保候选生成逻辑覆盖新 profile。
5. 更新 `src/core/detector.js` 或 `src/core/detectionPipeline.js` 的接受条件。
6. 补充 `tests/*.test.js`，至少覆盖：
   - 目录精确匹配
   - 近似尺寸
   - 无水印负样本
   - Web/CLI 一致性
7. 最后同步文档，不要只改代码不改说明。

## 5. 设计规则

1. profile、catalog、assets 必须同步变化。
2. Web 与 CLI 不得各自实现不同的检测策略。
3. UI 不得自己猜测检测坐标，必须使用引擎返回的 `pos` 与 `confidence`。
4. 批处理成功与失败都要推进状态，不能让进度条停住。
5. 任何批量文件名渲染都必须使用 DOM API 和 `textContent`，不能回退到 `innerHTML` 拼接。
6. **梯度滤波公式统一**（v2.5.1 强化）：三处梯度滤波点（`detectWatermark` Phase 2、`calculateProbeConfidence` 主探针、抖动搜索）必须调用同一个 `blendMultiDimensionalScore()` 函数。新增第四处时必须调用此函数，严禁内联公式。`gradient_formula_consistency.test.js` 自动验证此规则。
7. **阈值单一真相源**（v2.5.1）：所有检测调优常量必须在 `config.js` 的 `DETECTION_THRESHOLDS` 中定义。`detector.js` 中出现的任何数值字面量都应有对应的 `DETECTION_THRESHOLDS.*` 引用。`threshold_sot_integrity.test.js` 自动扫描源代码验证此规则。
8. **预设阈值不可被用户滑块覆盖**（v2.5.1）：`PERFORMANCE_PRESETS` 的 `overrides.THRESHOLDS` 是预设精调值，`getEngineOptions()` 不得用用户滑块的派生值覆盖它们。
9. **ObjectURL 生命周期**：使用 `objectUrlManager` observer 模式（`onChange` 回调），不得 monkey-patch 其方法。

## 6. 调试重点

当用户反馈"明显水印也检测不到"时，优先检查：

- 是否命中 catalog 精确尺寸（registry.MAX_SCALE_MISMATCH = 0.10）
- 是否命中近似尺寸候选（catalog.getScaledCatalogConfigs / findCloseMatches）
- `detector.js` 的置信度是否被局部纹理稀释（查看 `max(spatial, weighted)` 行为）
- **v2.3**: 缩放匹配门控是否过严（`SCALED_CONFIG_MIN = 0.25`，低于此值可能拒绝有效检测）
- **v2.3**: 自适应检测器是否因矩形水印而失败（检查 `baseW !== baseH` 路径）
- **v2.3**: 平滑背景的方差分数是否合理（应使用绝对差值模式，不再固定 0.5）
- `detectionPipeline.js` 的全局回退是否过严（`GLOBAL_FALLBACK_MIN = 0.25`）
- 性能预设是否设置为 `fast`（搜索范围仅 60%、无深度扫描、无自适应模式）

当用户反馈"误报太多"时，优先检查：

- 低置信度全局回退是否过宽
- 负样本测试是否充分
- `deepScan` 梯度滤波是否生效
- `isNearExpectedAnchor` 位置容差是否过宽（positionTolerance 默认 10%）

## 7. 测试策略

当前验证基线应至少包括：

```bash
pnpm lint         # ESLint (0 errors, 0 warnings on source)
pnpm build        # 生产构建
pnpm test         # 顶层 JS 测试套件（通过 canvas/png fixtures 加载）
pnpm test:all     # 顶层 JS 测试 + legacy script regressions
```

### v2.5.1 新增测试文件 (5 文件, 36 tests)

| 测试文件 | 覆盖 |
|---------|------|
| `gradient_formula_consistency.test.js` | 梯度公式三处一致性 + 权重和=1.0 验证（源码扫描） |
| `threshold_sot_integrity.test.js` | 阈值单一真相源完整性 + 26 必需键验证（源码扫描） |
| `worker_timeout_recovery.test.js` | Worker 超时 terminate+replace + 状态追踪 |
| `apply_removal_strategy.test.js` | Gemini/非Gemini/forceProcess/多匹配/空匹配分支覆盖 |
| `performance_preset_override.test.js` | 预设结构完整性 + 阈值不被覆盖 + 范围验证 |

### 已知慢速测试（v2.5.1 记录）

3 个测试文件（`detection_fallback_chain`, `adaptive_detector`, `diagnostic_baseline`）在 >1MP 图像上触发 Phase 2 全局 NCC 扫描（`deepScan: true`, `RANGE_X=0.90`），导致 ~27 亿次像素操作/测试。**非 hang，只是极慢**。`pnpm test` 默认排除这些文件；`pnpm test:all` 包含它们。

### 已知预先存在的失败测试（6 个，非本次修改引入）

`e2e_integration`, `engine_lifecycle`, `parameter_matrix`, `product_audit`, `sdk_api`, `worker_resilience` — 在原始代码上同样失败，已通过 `git stash` 基线对比确认。

## 8. 文档维护规则

文档里如果写到版本号、测试总数、流程状态或当前架构，必须是当前基线。历史数值应当进入 `DIAGNOSTIC_PLAN.md` 或 `ROADMAP.md` 的历史段落，而不是混在用户指南里。
