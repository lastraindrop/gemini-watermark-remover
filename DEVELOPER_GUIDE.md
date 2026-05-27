# GWR Developer Guide (v2.2.2)

本指南说明当前分支的工程结构、参数一致化规则、检测管线（五层）、前端构建架构、测试策略，以及新增模板或修改检测策略时必须遵守的流程。

## 1. 当前架构

### 核心层

- `src/core/catalog.js`：尺寸与锚点目录，优先级最高
- `src/core/config.js`：根据图片尺寸生成候选参数（官方目录 → 近似尺寸 → 启发式）
- `src/core/detector.js`：候选评分（NCC、局部对比度、梯度相关、方差评分）、三维评分融合
- `src/core/detectionPipeline.js`：统一 Web/CLI 的五层检测管线（Catalog → Scaled → Heuristic → Adaptive → Global）
- `src/core/adaptiveDetector.js`：自适应检测（粗到细多尺度搜索 + 三维评分）
- `src/core/multiPassRemoval.js`：多遍移除（带近黑/纹理安全检查）
- `src/core/alphaCalibration.js`：Alpha 增益校准（14 档粗搜索 + 精细调整）
- `src/core/decisionPolicy.js`：分层决策策略（direct-match / needs-validation / insufficient）
- `src/core/watermarkEngine.js`：主引擎，协调检测→移除→校准管线
- `src/core/blendModes.js`：反向 alpha 混合恢复（支持 alphaGain 参数）
- `src/core/utils.js`：共享工具函数（cloneImageData, calculateNearBlackRatio, regionStdDev）
- `src/core/worker.js`：Web Worker 入口，批量处理像素恢复
- `src/core/templates/registry.js`：Profile 与 Catalog 注册中心

### 应用层

- `src/app.js`：薄入口，协调子模块
- `src/app/state.js`：全局状态管理、ObjectURL 生命周期
- `src/app/processing.js`：批处理、并发、下载、ZIP 输出
- `src/app/ui.js`：界面交互辅助（toast、审计日志、进度条）
- `src/app/dragDrop.js`：窗口级拖拽、文件验证、URL 获取、文件夹递归
- `src/app/keyboard.js`：快捷键绑定 (1/2/3/Esc/Ctrl+S)
- `src/app/settings.js`：参数持久化、语言选择、引擎选项构建
- `src/app/viewModes.js`：View 切换、对比滑块、Stats UI、Profile 主题
- `src/app/magnifier.js`：3x 放大镜（Slider 视图专用）
- `public/index.html`、`src/tailwind.css`：前端骨架与样式（Tailwind 静态构建，无外部CDN；使用系统字体栈；`public/index.html` 容错加载 `../dist/` 资源以兼容多部署场景）

### SDK 层

- `src/sdk/index.js`：独立 fork 公开 API 入口
- `src/sdk/index.d.ts`：TypeScript 类型声明

### 入口层

- `src/cli.js`、`src/cli/gwrCli.js`、`src/cli/gwrRemoveCommand.js`：CLI
- `python/remover.py`、`python/gui.py`：Python bridge 与 GUI
- `src/userscript/index.js`：userscript 入口
- `build.js`：打包与静态资源内联

## 2. 参数一致化原则

当前 Web、CLI、Python bridge 必须共享同一组引擎参数：

- `profileId`：`gemini`、`doubao`、`auto`
- `deepScan`：是否启用梯度滤波（梯度相关 + 亮度 NCC 融合）
- `noiseReduction`：对输出进行更强的去噪预处理
- `autoDownload`：单图与批量处理后的自动下载

禁止在某一端私自引入新语义、改名或自行硬编码阈值。真正的策略应进入 `config.js`、`catalog.js`、`detector.js` 或 `detectionPipeline.js`。

### 2.1 动态参数覆盖 (v2.1)

引擎现在支持从入口层（Web UI/CLI/Python）透传参数覆盖。开发者在调用 `removeWatermarkFromImage` 时可提供以下可选参数：

- `probeThreshold`: (Number) 覆盖默认的探针灵敏度 (0.18)。
- `fallbackThreshold`: (Number) 覆盖默认的全局回退阈值 (0.25)。
- `gradientPenalty`: (Number) 覆盖梯度滤波惩罚 multiplier (0.30)。
- `manualConfig`: (Object) `{ x, y, width, height }` 直接指定水印位置，绕过搜索管线。
- `overrides`: (Object) 允许覆盖 `detector.js` 中的 `SEARCH_CONFIG` 全量常量（如 `RANGE_X`, `jitterRange` 等）。

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
6. 梯度滤波的三个应用点必须保持公式一致，任何调整必须同步三处。

## 6. 调试重点

当用户反馈"明显水印也检测不到"时，优先检查：

- 是否命中 catalog 精确尺寸（registry.MAX_SCALE_MISMATCH = 0.10）
- 是否命中近似尺寸候选（catalog.getScaledCatalogConfigs / findCloseMatches）
- `detector.js` 的置信度是否被局部纹理稀释（查看 `max(spatial, weighted)` 行为）
- `detectionPipeline.js` 的全局回退是否过严（minGlobalConfidence = 0.25）
- 缩放匹配的门控阈值是否过高（scaled baseNcc=0.14, gradient=0.18, probe=0.35）

当用户反馈"误报太多"时，优先检查：

- 低置信度全局回退是否过宽
- 负样本测试是否充分
- `deepScan` 梯度滤波是否生效
- `isNearExpectedAnchor` 位置容差是否过宽（positionTolerance 默认 10%）

## 7. 测试策略

当前验证基线应至少包括：

```bash
pnpm lint         # ESLint
pnpm test         # 主测试集 (49 文件, ~390 tests)
pnpm build        # 静态 Tailwind CSS 构建
```

## 8. 文档维护规则

文档里如果写到版本号、测试总数、流程状态或当前架构，必须是当前基线。历史数值应当进入 `DIAGNOSTIC_PLAN.md` 或 `ROADMAP.md` 的历史段落，而不是混在用户指南里。
