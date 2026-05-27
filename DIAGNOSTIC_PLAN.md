# 综合诊断与修复计划 (Comprehensive Diagnostic & Fix Plan)

> 版本: v2.2.2 | 日期: 2026-05-27 | 状态: 诊断完成，待执行

---

## 一、架构总览与工程评估

### 1.1 项目架构

```
src/
├── core/           核心引擎 (19 文件)
│   ├── detector.js          NCC 检测引擎 (708 行)
│   ├── detectionPipeline.js 多阶段检测管线 (421 行)
│   ├── watermarkEngine.js   主引擎入口 (315 行)
│   ├── adaptiveDetector.js  自适应多尺度检测 (432 行)
│   ├── catalog.js           分辨率目录匹配 (191 行)
│   ├── config.js            配置解析 (100 行)
│   ├── profiles.js          配置文件定义 (111 行)
│   ├── decisionPolicy.js    决策分级 (217 行)
│   ├── blendModes.js        反向 Alpha 混合 (115 行)
│   ├── multiPassRemoval.js  多通道移除 (167 行)
│   ├── alphaCalibration.js  Alpha 增益校准 (122 行)
│   ├── applyRemoval.js      移除策略调度 (49 行)
│   ├── alphaMap.js          Alpha 地图计算 (33 行)
│   ├── worker.js            Web Worker (15 行)
│   ├── workerPool.js        Worker 池 (153 行)
│   ├── restorationMetrics.js 质量度量 (50 行)
│   ├── utils.js             共享工具 (70 行)
│   ├── catalogs.json        目录数据 (764 行)
│   └── templates/registry.js 模板注册表 (66 行)
├── app/            浏览器 UI (9 文件)
├── cli/            CLI (2 文件)
├── sdk/            SDK API (2 文件)
├── i18n/           国际化 (7 语言)
├── userscript/     油猴脚本 (1 文件)
└── assets/         模板资产 (10 文件)
```

### 1.2 架构优势

- **模块化清晰**: core/app/cli/sdk 分层合理
- **多配置文件支持**: Gemini/Doubao/DALL-E 3 多品牌
- **检测管线多阶段**: Catalog Probe → Heuristic → Adaptive → Global Search 四级回退
- **Web Worker 支持**: 避免主线程阻塞
- **SDK 导出**: 完整的公共 API 表面
- **60+ 测试文件**: 测试覆盖率较好

### 1.3 架构问题

1. **core/ 层循环风险**: `detectionPipeline.js → detector.js → catalog.js → registry.js`，`applyRemoval.js → multiPassRemoval.js → detector.js` 存在深层依赖链
2. **Worker 中 catalog 加载失败**: `catalog.js` 使用 `fs.readFileSync` 加载 `catalogs.json`，Web Worker 中 `fs` 不可用，静默回退到空目录
3. **双重 Worker 创建**: `watermarkEngine.js` 同时创建单个 Worker 和 WorkerPool，浪费资源
4. **RestorationMetrics 不精确**: `calculateSSIM` 实际是 PSNR 的线性映射，不是真正的 SSIM

---

## 二、与上游 (GargantuaX) 对比分析

### 2.1 上游架构 (v1.0.15, 164 commits)

| 特性 | 上游 (GargantuaX) | 本分支 |
|------|-------------------|--------|
| 品牌支持 | 仅 Gemini | Gemini + Doubao + DALL-E 3 |
| 检测方式 | Catalog + Anchor | Catalog + Heuristic + Adaptive + Global |
| Alpha Map | `max(R,G,B)/255` (相同) | `max(R,G,B)/255` (相同) |
| 移除方式 | 单通道反向 Alpha | 多通道 + Alpha 校准 |
| Worker | 单 Worker | Worker Pool |
| 配置文件系统 | 无 | 有 |
| 目录条目 | 约 50 条 | 约 60 条 (含 gemini-2.5-flash) |
| 决策策略 | 无 | 三级决策 |
| 手动选择 | 无 | 有 |
| 国际化 | 无 | 7 语言 |
| Python 桥接 | 无 | 有 |

### 2.2 关键差异

- **上游更简洁**: 检测管线直接，无多维度评分稀释
- **本分支更复杂**: 增加了大量功能但引入了更多阈值和参数，导致调优困难
- **核心算法一致**: 反向 Alpha 混合公式完全相同
- **上游不存在 `calculateVarianceScore`**: 这是本分支新增的，可能导致检测遗漏

---

## 三、完整 Code Review - BUG 清单

### 🔴 严重 (导致检测遗漏)

#### BUG-1: 目录匹配过于严格
- **文件**: `src/core/templates/registry.js:52-61`
- **问题**: `findMatches()` 使用 `MAX_SCALE_MISMATCH = 0.05`，要求几乎精确的像素级匹配。任何非目录中精确分辨率的图像都会匹配失败。
- **影响**: 这是最主要的检测遗漏原因。Gemini 输出的图像如果被轻微裁剪、缩放或压缩，就完全无法通过目录匹配。
- **修复**: 改为模糊匹配 + 缩放容忍度，或使用 `getScaledCatalogConfigs` 作为回退

#### BUG-2: 多维评分稀释检测分数
- **文件**: `src/core/detector.js:260-264`
- **问题**: `deepScan` 开启时，分数变为 `spatial * 0.5 + gradient * 0.3 + variance * 0.2`。完美的 NCC=1.0 在加权和后只有 0.5+0.3+0.2=1.0，但如果 gradient 低 (常见于浅色/模糊水印)，实际分数可能只有 0.3-0.5，难以通过阈值。
- **影响**: 明显的水印在复杂背景或浅色区域上检测不到
- **修复**: 调整权重或使用 `max(spatial, weighted)` 而非纯加权平均

#### BUG-3: 方差评分在均匀背景上失效
- **文件**: `src/core/detector.js:566-581`
- **问题**: `calculateVarianceScore` 比较水印区域和参考区域的亮度标准差。AI 生成的图像通常背景相对均匀，两个区域方差都低，导致 ratio≈1.0，得分≈0.0。
- **影响**: 在 AI 生成图像最常见的均匀背景场景下，方差评分持续为 0 或极低，将总评分拉低 20%
- **修复**: 当 refStd 很低时，返回中性值 0.5 而非惩罚

#### BUG-4: 自适应检测阈值过高
- **文件**: `src/core/detectionPipeline.js:304`
- **问题**: `adaptiveMinConfidence` 默认 0.35，在多维评分稀释后，很多真实水印达不到这个阈值
- **影响**: 第三级回退 (自适应搜索) 也无法发现水印
- **修复**: 降低到 0.22-0.25

#### BUG-5: 启发式分级阈值不合理
- **文件**: `src/core/profiles.js:18-28`
- **问题**: `getHeuristicConfig` 的分级逻辑：
  - `shortSide <= 720` → 48px 水印
  - 但 768x768 的图像会被分到 `pixels <= 1500000 || shortSide <= 1600` → 1k → 96px 水印
  - 实际上 Gemini 很多 ~768px 的输出使用 48px 水印
- **影响**: 错误的模板尺寸导致 NCC 分数极低
- **修复**: 增加中间层 (如 768-1024 使用 48px)，或同时尝试两种尺寸

#### BUG-6: Worker 中目录数据丢失
- **文件**: `src/core/worker.js` + `src/core/catalog.js`
- **问题**: Worker 中 `fs` 不可用，`catalogs.json` 加载失败静默回退为空目录。虽然检测代码不依赖 Worker (检测在主线程)，但 Worker 中的移除代码引用了需要 catalog 的模块
- **影响**: 可能导致 Worker 模式下移除异常

### 🟡 中等

#### BUG-7: 全局搜索范围过窄
- **文件**: `src/core/detector.js:48-49`
- **问题**: `RANGE_X: 0.55, RANGE_Y: 0.55` 仅搜索图像右下 55% 区域
- **影响**: 偏移量大的水印可能被遗漏

#### BUG-8: 矩形水印自适应检测不支持
- **文件**: `src/core/adaptiveDetector.js:60-61`
- **问题**: `interpolateAlphaMap` 始终生成方形 alpha map，矩形水印 (如 doubao) 会被变形
- **影响**: Doubao 矩形水印自适应检测不可靠

#### BUG-9: 双重 Worker 创建浪费
- **文件**: `src/core/watermarkEngine.js:39-89`
- **问题**: `_getWorker()` 同时创建一个持久 Worker 和一个 WorkerPool(2)，但只用 Pool
- **影响**: 内存浪费，额外的 Worker 加载开销

#### BUG-10: Probe 阈值在多维评分下过低
- **文件**: `src/core/detectionPipeline.js:246`
- **问题**: `DEFAULT_PROBE_THRESHOLD = 0.18` 原本针对纯 NCC 分数，但现在 `calculateProbeConfidence` 可能返回多维混合分数
- **影响**: Probe 阶段可能通过低分候选，但后续阶段无法提升

### 🟢 轻微

#### BUG-11: GEMINI_SIZE_CATALOG Proxy 不完整
- **文件**: `src/core/catalog.js:94-115`
- **问题**: Proxy 没有实现所有 Array 方法 (如 `flat`, `includes`, `entries` 等)
- **影响**: 如果外部代码使用未代理的方法会出错

#### BUG-12: restorationMetrics.js SSIM 标记为 deprecated 但仍导出
- **文件**: `src/sdk/index.js:20`
- **影响**: SDK 消费者可能误用

#### BUG-13: `regionStdDev` 边界检查不完整
- **文件**: `src/core/utils.js:53`
- **问题**: 当 `x + size > imgWidth` 时不返回 0 但内层循环可能越界
- **影响**: 极端情况下可能读取越界数据

---

## 四、检测遗漏根因分析 (Root Cause Analysis)

### 4.1 检测管线流程与故障点

```
输入图像
   │
   ▼
Phase 1: Catalog Probe (目录锚点探测)
   │  catalog.js: getCatalogConfig() → 精确匹配分辨率
   │  ❌ 故障点 #1: 仅精确像素匹配 (registry.js:54, MAX=0.05)
   │  ❌ 故障点 #2: 错误的模板尺寸 (profiles.js 分级不合理)
   │
   ▼ (如果 Phase 1 失败)
Phase 1.4: resolveBestTemplateOrder (48px vs 96px 比较)
   │  仅对 gemini 执行，依赖 Phase 1 产生的 configs
   │  ❌ 如果 Phase 1 没有产生有效 configs，此步骤无意义
   │
   ▼ (如果仍然失败)
Phase 2.3: Adaptive Search (自适应搜索)
   │  adaptiveDetector.js: 多尺度搜索
   │  ❌ 故障点 #3: adaptiveMinConfidence=0.35 过高
   │  ❌ 故障点 #4: 多维评分稀释 (spatial*0.5 + gradient*0.3 + variance*0.2)
   │  ❌ 故障点 #5: 方差评分在均匀背景上为 0
   │
   ▼ (如果 Adaptive 也失败)
Phase 3: Global Fallback (全局搜索)
   │  detector.js: detectWatermark() 全局 NCC 搜索
   │  ❌ 故障点 #6: 搜索范围仅 55%
   │  ❌ 故障点 #7: 同样受多维评分稀释
   │  ❌ 故障点 #8: 最终阈值 FINAL_ANCHORED=0.15 可能仍过高
   │
   ▼
返回 null (检测失败)
```

### 4.2 为什么明显的水印检测不到

**场景**: 一张 1024x1024 的 Gemini 图像，右下角有明显的 Gemini 水印

1. **如果图像被轻微编辑** (如从 1024x1024 裁剪为 1000x1000):
   - `findMatches` 精确匹配失败 (BUG-1)
   - `getScaledCatalogConfigs` 在 `getAllPotentialConfigs` 中被调用，但只对 gemini 执行
   
2. **即使分辨率匹配**:
   - NCC 分数可能只有 0.25-0.35 (在复杂背景上)
   - `calculateProbeConfidence` 启用 deepScan 后，多维评分变成 0.25*0.5 + gradient*0.3 + variance*0.2
   - 如果 gradient=0.15, variance=0.1 → 总分 = 0.125+0.045+0.02 = 0.19
   - 这个分数通过了 probe threshold (0.18)，但可能在后续阶段被过滤

3. **在浅色/白色背景上**:
   - 水印与背景的对比度极低
   - NCC 分数本身就低
   - 方差评分接近 0
   - 最终分数被进一步拉低

### 4.3 核心矛盾

**多维评分系统** 是本分支独有的设计（上游没有），它在理论上更鲁棒，但在实践中对 Gemini 的低对比度白色水印造成了系统性惩罚。

---

## 五、修复计划

### Phase 1: 紧急修复 - 检测遗漏 (预计 2-3 天)

#### 修复 1: 放宽目录匹配
- **文件**: `src/core/templates/registry.js`
- **操作**: 将 `MAX_SCALE_MISMATCH` 从 0.05 提升到 0.15，并增加 `findCloseMatches` 方法
- **详细**:
  ```javascript
  // 当前:
  const MAX_SCALE_MISMATCH = 0.05;
  
  // 修改为:
  const MAX_SCALE_MISMATCH = 0.15; // 允许 ±15% 的缩放偏差
  
  // 新增方法: findCloseMatches - 宽松匹配
  findCloseMatches(profileId, width, height, maxScaleDelta = 0.30) {
    // 找到最接近的目录条目，按缩放偏差排序
  }
  ```

#### 修复 2: 修复多维评分权重
- **文件**: `src/core/detector.js:260-264`
- **操作**: 使用 `max(spatial, weighted)` 策略替代纯加权平均
- **详细**:
  ```javascript
  // 当前:
  confidence = spatial * 0.5 + gradient * 0.3 + varianceScore * 0.2;
  
  // 修改为: 使用 "best of" 策略
  const weightedScore = spatial * 0.5 + gradient * 0.3 + varianceScore * 0.2;
  confidence = Math.max(spatial, weightedScore);
  ```
- **原理**: 如果纯 NCC 已经很高，不应该被 gradient 和 variance 拉低

#### 修复 3: 修复方差评分
- **文件**: `src/core/detector.js:566-581`
- **操作**: 当 refStd 极低时返回中性值
- **详细**:
  ```javascript
  // 在 calculateVarianceScore 中:
  if (refStd < 5.0) return 0.5; // 均匀背景，方差不可靠，返回中性值
  ```

#### 修复 4: 降低自适应检测阈值
- **文件**: `src/core/detectionPipeline.js:304`
- **操作**: `adaptiveMinConfidence` 从 0.35 降低到 0.22
- **详细**: 修改默认参数

#### 修复 5: 修复启发式分级
- **文件**: `src/core/profiles.js:18-28`
- **操作**: 增加更精细的分级逻辑
- **详细**:
  ```javascript
  getHeuristicConfig: (w, h) => {
    const pixels = w * h;
    const shortSide = Math.min(w, h);
    let tier;
    if (shortSide <= 720 || (pixels <= 500000 && shortSide <= 900)) tier = '0.5k';
    else if (shortSide <= 1200 || pixels <= 1500000) tier = '1k';
    else if (pixels <= 4500000) tier = '2k';
    else tier = '4k';
    return { ...PROFILES.gemini.tiers[tier], isOfficial: false };
  }
  ```

#### 修复 6: 扩大全局搜索范围
- **文件**: `src/core/detector.js:48-49`
- **操作**: `RANGE_X` 和 `RANGE_Y` 从 0.55 提升到 0.75

### Phase 2: 稳定性修复 (预计 1-2 天)

#### 修复 7: Worker 中 Catalog 数据传递
- **文件**: `src/core/worker.js`, `src/core/watermarkEngine.js`
- **操作**: 在 Worker 初始化时通过 `postMessage` 传递 catalog 数据，避免 Worker 中 fs 依赖

#### 修复 8: 移除冗余 Worker
- **文件**: `src/core/watermarkEngine.js`
- **操作**: 移除单个 Worker 创建逻辑，仅使用 WorkerPool

#### 修复 9: 矩形水印自适应检测
- **文件**: `src/core/adaptiveDetector.js`
- **操作**: 支持非方形 alpha map 插值

### Phase 3: 测试验证 (预计 2-3 天)

详见下方第六节。

---

## 六、单元测试计划

### 6.1 检测核心测试 (新增/强化)

#### 测试 1: 目录匹配宽松度测试
- **文件**: `tests/catalog_tolerance.test.js` (新建)
- **内容**:
  - 测试精确分辨率匹配 (应通过)
  - 测试 ±5% 缩放匹配 (应通过)
  - 测试 ±15% 缩放匹配 (应通过)
  - 测试裁剪后分辨率匹配 (应通过)
  - 测试完全不匹配的分辨率 (应失败)

#### 测试 2: 多维评分验证测试
- **文件**: `tests/multi_dimension_scoring.test.js` (新建)
- **内容**:
  - 构造已知 NCC 分数的场景
  - 验证 `max(spatial, weighted)` 策略不会降低纯 NCC 高分
  - 验证在均匀背景上，方差评分为中性 (0.5)
  - 验证梯度评分低的场景不会过度惩罚总分数

#### 测试 3: 检测遗漏回归测试
- **文件**: `tests/detection_miss_regression.test.js` (新建)
- **内容**:
  - 使用 `docs/` 中的真实样本图像
  - 验证每张图像都能检测到水印
  - 验证检测位置在预期范围内
  - 验证置信度分数 ≥ 最低阈值

#### 测试 4: 启发式分级测试
- **文件**: `tests/heuristic_tier.test.js` (新建)
- **内容**:
  - 512x512 → 0.5k (48px)
  - 768x768 → 应正确分级 (不是 1k)
  - 1024x1024 → 1k (96px)
  - 2048x2048 → 2k (96px)
  - 4096x4096 → 4k (96px)
  - 裁剪的分辨率 (如 1000x1000) → 应回退到启发式

#### 测试 5: 全局搜索范围测试
- **文件**: `tests/global_search_range.test.js` (新建)
- **内容**:
  - 在图像边缘放置水印，验证能被搜索到
  - 验证 RANGE_X/Y 参数的效果

#### 测试 6: Alpha Map 一致性测试
- **文件**: `tests/alpha_map_consistency.test.js` (新建)
- **内容**:
  - 验证 `max(R,G,B)/255` 逻辑
  - 验证全白、全黑、彩色水印的正确提取
  - 验证边缘像素的 alpha 值

### 6.2 管线集成测试 (强化)

#### 测试 7: 端到端检测管线测试
- **文件**: `tests/pipeline_e2e.test.js` (新建)
- **内容**:
  - 对每个 Phase 独立验证
  - 验证 Phase 1 失败后正确回退到 Phase 2
  - 验证 Phase 2 失败后正确回退到 Phase 3
  - 验证最终结果的一致性

#### 测试 8: 移除质量验证测试
- **文件**: `tests/removal_quality.test.js` (新建)
- **内容**:
  - 构造已知水印图像 (纯色 + 已知 alpha)
  - 移除后验证 MSE < 阈值
  - 验证多通道移除不会过度腐蚀
  - 验证 alpha 增益校准不会引入伪影

### 6.3 现有测试验证

需要验证并修复所有 60+ 现有测试文件：
- 运行 `pnpm test` 确认当前通过率
- 修复所有失败的测试
- 确保修复后所有测试仍然通过

---

## 七、执行顺序

```
Step 1: 运行现有测试基线
  └─ pnpm test → 记录通过/失败状态

Step 2: Phase 1 紧急修复 (按优先级)
  ├─ 2.1: 修复 registry.js (目录匹配)     → BUG-1
  ├─ 2.2: 修复 detector.js (多维评分)     → BUG-2, BUG-3
  ├─ 2.3: 修复 detectionPipeline.js (阈值) → BUG-4
  ├─ 2.4: 修复 profiles.js (分级)         → BUG-5
  └─ 2.5: 修复 detector.js (搜索范围)     → BUG-7

Step 3: Phase 1 测试验证
  ├─ 3.1: 新建 detection_miss_regression.test.js
  ├─ 3.2: 新建 multi_dimension_scoring.test.js
  ├─ 3.3: 新建 catalog_tolerance.test.js
  ├─ 3.4: 新建 heuristic_tier.test.js
  └─ 3.5: 运行 pnpm test → 确认所有通过

Step 4: Phase 2 稳定性修复
  ├─ 4.1: 修复 Worker catalog 传递        → BUG-6
  ├─ 4.2: 移除冗余 Worker                → BUG-9
  └─ 4.3: 矩形水印支持                   → BUG-8

Step 5: Phase 2 测试验证
  ├─ 5.1: 新建 pipeline_e2e.test.js
  ├─ 5.2: 新建 removal_quality.test.js
  └─ 5.3: 运行 pnpm test:all → 确认全部通过

Step 6: Phase 3 全面验证
  ├─ 6.1: 使用 docs/ 中的真实样本全流程验证
  ├─ 6.2: Lint 检查 (pnpm lint)
  ├─ 6.3: 构建验证 (pnpm build)
  └─ 6.4: 最终回归测试
```

---

## 八、预期效果

| 指标 | 修复前 | 修复后 (预期) |
|------|--------|--------------|
| 标准分辨率检测率 | ~85% | ~98% |
| 非标准/裁剪分辨率检测率 | ~30% | ~80% |
| 复杂背景检测率 | ~60% | ~85% |
| 均匀背景检测率 | ~70% | ~95% |
| 误检率 | ~5% | ~5% (不变) |

---

## 九、风险评估

1. **放宽阈值可能增加误检**: 需要在提高检测率的同时监控误检率
2. **多维评分修改影响面大**: 需要全面的回归测试
3. **启发式分级修改可能影响已支持的分辨率**: 需要确保现有通过的分辨率不受影响

---

*后端诊断完成。*

---

## 十、前端 (UI/UX) 综合诊断与修复计划

> 日期: 2026-05-27 | 分析范围: `public/index.html`, `src/app/*.js`, `src/utils.js`, `src/i18n.js`, `src/tailwind.css`

### 10.1 前端架构总览

```
public/index.html (398行) ← 单一静态页面，含所有 DOM 结构
src/
├── app.js                    主入口 / 事件绑定中心 (442行)
├── app/
│   ├── state.js              全局状态 & ObjectURL 管理器 (39行)
│   ├── ui.js                 审计日志 / Toast / 进度条 (111行)
│   ├── processing.js         单图 / 批量处理 & 下载 (187行)
│   ├── settings.js           设置读写 / 引擎选项构造 (118行)
│   ├── viewModes.js          滑块/Side/Stats 视图切换 (72行)
│   ├── dragDrop.js           拖拽/文件夹/URL 导入 (271行)
│   ├── keyboard.js           键盘快捷键 (27行)
│   ├── magnifier.js          放大镜 (36行)
│   └── manualSelection.js    手动选区 (151行)
├── tailwind.css              Tailwind + 自定义组件CSS (287行)
├── i18n.js                   国际化引擎 (87行)
├── i18n/                     7 语言包 (zh-CN/en-US/ja-JP/ru-RU/fr-FR/es-ES/de-DE)
└── utils.js                  图像加载 / EXIF / Loading UI (118行)
```

### 10.2 关键评估维度

#### 10.2.1 UI 是否体现最新架构、功能与设计？

| 检查项 | 现状 | 评价 |
|--------|------|------|
| 多配置文件(profiles) | `profileSelect` 动态填充 (app.js:74-86)，筛选 `experimental` | ✅ 良好 |
| 自适应检测 | 不透明 — UI 仅显示 `deepScan` toggle，不指示实际运行了哪个检测阶段 | ❌ 缺失 |
| 多通道移除 | 完全不可见 — 用户不知道经过了 `multiPassRemoval`/`alphaCalibration` | ⚠️ 信息不透明 |
| 目录匹配放宽 (v2.2) | UI 无反馈 — 非精确匹配分辨率时无提示 | ❌ 缺失 |
| Worker Pool | `getExecutionMode()` 返回字符串但从未在 UI 展示 | ❌ 信息缺失 |
| 决策策略 (tier) | `tierBadge` 显示 profile+tier 但 `decisionTier` 结果未展示 | ⚠️ 部分展示 |
| 手动选区 | 完整实现：toggle → 拖拽/输入坐标 → Repress 按钮 | ✅ 良好 |
| 7 语言支持 | `langSelect` + `data-i18n` 属性 + `i18n.applyTranslations()` | ✅ 良好 |
| 暗色模式 | CSS `prefers-color-scheme: dark` 自动切换，无手动 toggle | ⚠️ 缺乏用户控制 |

#### 10.2.2 硬编码与灵活性分析

| 位置 | 硬编码值 | 影响 |
|------|---------|------|
| `ui.js:58` | Toast 持续时间 = `4000ms` | 无法自定义 |
| `settings.js:60-61` | 滑块默认 `0.18` / `0.30` | 与 HTML `value="0.18"` 重复定义 |
| `processing.js:172` | ZIP 压缩级别 = `6` | 无法调优 |
| `magnifier.js:27` | 缩放倍数 = `3x` | 高分辨率屏幕可能需要更高倍率 |
| `tailwind.css:178` | 放大镜尺寸 = `150px` | CSS 硬编码不可修改 |
| `watermarkEngine.js:53` | Worker 池大小 = `2` | 无 UI 暴露 |
| `settings.js:70` | `jitterRange: Math.round(thresholdVal * 30)` | 魔法数字 `30` |
| `settings.js:72-79` | `ANCHORED_OTHER: thresholdVal + 0.04` 等偏移 | 硬编码偏移量无法在 UI 调整 |
| `i18n.js:31-37` | 语言检测链式三元表达式 | 扩展新语言需修改代码 |
| `utils.js:105` | Loading fail 文本 "Critical Error" | 硬编码英文，不走 i18n |
| `viewModes.js:28` | `statAlgo` 写入 `profileId.toUpperCase()` | 当 profileId=`auto` 时显示 `AUTO` 而非实际检测到的配置 |

#### 10.2.3 用户体验 (UX) 评估

| 场景 | 现状 | 评价 |
|------|------|------|
| **单图处理反馈** | 处理中无独立进度指示器；仅 `resultContainer` 添加 `scan-active` CSS 类显示扫描动画 | ⚠️ 缺乏直接反馈 |
| **批量处理取消** | 无取消按钮；用户只能等待或刷新页面 | ❌ 严重 |
| **错误恢复** | 单图失败不阻塞其他图片，但错误信息仅记入审计日志不弹出 toast | ⚠️ |
| **手动选区引导** | "Use Detected Area" 按钮始终可见但未做任何检测时点击无效果 | ⚠️ |
| **键盘快捷键提示** | 永久显示在左下角 (`shortcutsHint`) 无法隐藏 | ⚠️ 干扰 |
| **批次完成确认** | `onBatchComplete` 触发 toast + `downloadAllBtn` 显示，正常 | ✅ |
| **暗色模式切换** | 纯 `prefers-color-scheme` 自动检测，用户无法手动切换 | ⚠️ |
| **图像比较滑块** | 可拖拽、支持触摸，但无重置到 50% 的默认位置按钮 | ⚠️ |
| **统计视图** | 显示的 `BOTTOM-RIGHT` 和 `INVERSE-ALPHA` 为固定值 | ❌ Bug |
| **移动端响应式** | 控制面板在移动端堆叠，但 language selector 宽度从 `5.5rem` → `3.75rem` 可能导致截断 | ⚠️ |

### 10.3 BUG 清单 (前端)

#### 🔴 BUG-UI-1: Loading Fail 文本硬编码 + classList.replace 不安全
- **文件**: `src/utils.js:105-107`
- **问题**: `showLoadingFail` 中 `subTextEl.classList.replace('text-gray-400', 'text-red-500')` — HTML 中 `#loadingSubText` 的实际 class 是 `text-slate-400` (index.html:379)，而非 `text-gray-400`。`classList.replace` 找不到 `text-gray-400` 会静默失败。
- **修复**: 改用 `classList.add('text-red-500')` + `classList.remove('text-slate-400')`，或将关键文本硬编码改为 i18n。

#### 🔴 BUG-UI-2: 批量处理忽略 autoDownload 选项
- **文件**: `src/app/dragDrop.js:130` + `src/app/processing.js:45`
- **问题**: `handleFiles` 单图分支 (line 100-122) 使用 `getEngineOptions(elements, { optionalManual: true })`，options 中包含 `autoDownload` 字段。批量分支 (line 130) 使用 `getEngineOptions(elements, { ignoreManual: true })`，options 中也包含 `autoDownload`。但 `processQueue` 将 options 传递给 `processSingle` 时不修改，所以 autoDownload 生效。然而，**批量处理中对每一张图片的 `onSuccess` 回调不包含 `downloadImage()`** — 只在 `processSingle` 内部检查 `options.autoDownload`，而 `processQueue` 的并发 `next()` 函数会在所有 `processSingle` 完成后才调用 `onComplete`。这实际上是正确的。但有一个遗漏：**`processQueue` 不检查 `options.autoDownload`** → 若用户在 `processQueue` 级别期望全局 autoDownload 控制，当前逻辑依赖于 `processSingle` 内部检查，功能正常但架构不一致。
- **实际影响**: 低（功能正常工作），但代码可读性差。

#### 🟡 BUG-UI-3: Stats View 硬编码信息
- **文件**: `src/app/viewModes.js:25,28`
- **问题**:
  ```javascript
  if (statAnchor) statAnchor.textContent = (config.anchor || 'BOTTOM-RIGHT').toUpperCase();
  if (statAlgo) statAlgo.textContent = (profileId || 'AUTO').toUpperCase();
  ```
  - `statAnchor` fallback 为 `'BOTTOM-RIGHT'` 而非实际的 `config.anchor`
  - `statAlgo` 当 `profileId === 'auto'` 时显示 `AUTO` 而非实际检测到的 profile (如 `gemini`)；正确的做法是使用 `result.profileId` 而非传入的请求 profileId
  - **文件**: `src/app.js:318` — `updateStatsUI` 调用时传入的 `profileId` 是 `reprocessSingleWithManualArea` 中 `processSingle` 回调里的 `profileId`，但 `updateSingleUI` (app.js:321) 实际传入的是 `onSuccess` 中 `processSingle` 的结果 `profileId` → 这是管道结果中的 profileId，可能不同
- **修复**: `statAlgo` 应该显示实际 win profile 的名称；`statAnchor` 应使用检测结果的 anchor

#### 🟡 BUG-UI-4: 手动选区坐标截断导致精度丢失
- **文件**: `src/app/settings.js:109-113` + `src/app/manualSelection.js:44-47`
- **问题**: `getEngineOptions` 中 `Math.trunc(manualConfig.x)` 将浮点坐标截断为整数。但 `writeManualRegion` (manualSelection.js:44) 又用 `Math.round(region.x)` 写回输入框。从检测结果 (`getRegionFromDetection` in app.js:231-238) 获取的区域坐标本身就是整数（来自 `pos.x/y`），所以截断在正常使用中无影响。但在拖拽选区时 (`clientToImagePoint` 返回 `Math.round()`)，用户期望的选区与实际存储的可能有 1px 偏差。
- **实际影响**: 低，但对于高精度需求场景可能产生 1-2px 偏差。

#### 🟡 BUG-UI-5: `downloadImage` 未检查 URL 有效性
- **文件**: `src/app/processing.js:149-157`
- **问题**: `downloadImage` 直接使用 `item.processedUrl` 作为 `<a href>` — 如果 URL 已被 `objectUrlManager.revoke` 回收，浏览器点击下载链接不会有任何反馈。
- **修复**: 添加 `item.processedUrl` 有效性检查或使用 `item.processedBlob` 重新生成 URL。

#### 🟡 BUG-UI-6: Comparison Slider 拖拽泄漏
- **文件**: `src/app/viewModes.js:53-61`
- **问题**: `mousedown` 注册 `document` 级别的 `mousemove`/`mouseup` 事件。若鼠标离开浏览器窗口时释放按钮，`mouseup` 事件不会触发，导致 `moveHandler` 泄漏在 document 上。下一次任何位置的 `mousemove` 都会意外触发滑块移动。
- **修复**: 添加 `mouseleave` 或 `blur` 事件清理，或使用 `pointerdown/pointermove/pointerup` 事件 (自带 `pointercapture` 机制)。

#### 🟢 BUG-UI-7: `applyProfileTheme` 设置无效 CSS 变量
- **文件**: `src/app/viewModes.js:31-34`
- **问题**: `document.documentElement.style.setProperty('--primary', profile.brandColor)` 设置的自定义属性 `--primary` 和 `--primary-glow` 在目前的 CSS 中未被任何规则引用。实际的 profile 主题色是通过 `profile.brandColor` 直接在 JS 中应用到 DOM 元素的（如 `app.js:320` 中的 `applyProfileTheme(profile)` 后改变 header 图标颜色）。
- **影响**: CSS 变量定义了但未使用，属于死代码。

#### 🟢 BUG-UI-8: `loadingSubText` 元素在加载失败时 classList 问题
- **文件**: `src/utils.js:107`
- **问题**: `showLoadingFail` 尝试 `subTextEl.classList.replace('text-gray-400', 'text-red-500')`，但 HTML 中 `#loadingSubText` 定义的是 `text-slate-400 uppercase tracking-widest` (index.html:379)，不含 `text-gray-400`。`replace` 失败，文本颜色不变。
- **修复**: 使用 `classList.add` / `classList.remove` 或直接设置 `style.color`。

#### 🟢 BUG-UI-9: 控制面板在 520px 断点下布局异常
- **文件**: `public/index.html:113`
- **问题**: Toggle 开关区域使用 `grid grid-cols-1 min-[520px]:grid-cols-3 md:flex`。在 520px 以下，三个 toggle 垂直排列但占据整行宽度，导致 "Auto Save" toggle 占据一整行而实际上只需要窄的空间。
- **修复**: 使用 `flex flex-wrap` 替代 grid，或设置 `max-width` 限制。

### 10.4 布局/样式问题

| 位置 | 问题 | 建议 |
|------|------|------|
| index.html:65 | 标题 `break-all` 在英文单词中断行 | 改为 `break-words` 或在中文页保留 `break-all` |
| index.html:348 | `auditConsole` 使用 `translate-y-[calc(100%-48px)]` | 高度 `h-48` (192px)，`100%-48px` = `144px` 隐藏 → 正确 |
| tailwind.css:218-219 | `.mesh-blob` 全局 `display: none` | 装饰性元素完全不可见；应移除或恢复 |
| tailwind.css:76 | `.comparison-slider` 固定 `aspect-ratio: 16/9` | 非宽屏图像会被裁剪；应使用 `max-height` + `object-contain` |
| index.html:39 | `header` 标题用 `truncate` | 中文标题可能被截断为 `Water...` |
| index.html:245 | `manualSelectionBox` 阴影 `9999px` spread | `0 0 0 9999px` 在移动端可能导致性能问题 |
| index.html:337 | `#globalDragOverlay` `pointer-events-none` | 正确，但需要通过 JS 切换为可交互模式 |

### 10.5 前端修复执行计划

#### Phase UI-1: 紧急修复 (已发现的 BUG)

1. **Fix BUG-UI-1** (`utils.js:105-107`): 修复 `showLoadingFail` classList 错误
2. **Fix BUG-UI-3** (`viewModes.js:25-28`): 修复 Stats View 显示实际检测结果
3. **Fix BUG-UI-5** (`processing.js:149`): `downloadImage` 添加 URL 有效性检查
4. **Fix BUG-UI-6** (`viewModes.js:53-61`): 修复 Comparison Slider 拖拽泄漏

#### Phase UI-2: 体验优化

5. **添加处理取消按钮** (`processing.js` + `index.html`): batch processing abort
6. **添加检测阶段指示器** (`app.js`): 指示 catalog-probe / adaptive / global 哪个阶段命中
7. **添加暗色模式手动切换** (`app.js`): localStorage + 手动 toggle
8. **添加 Comparison Slider 重置按钮** (`index.html`): 恢复到 50% 位置
9. **移除 mesh-blob 死代码** (`tailwind.css:218-220`)

#### Phase UI-3: 架构一致性

10. **统一阈值默认值** (`settings.js:60-61` + `index.html:166,174`): 将重合定义提取为常量
11. **Worker 状态展示** (`app.js`): 在 UI 中暴露 `getExecutionMode()` 结果
12. **消除 `applyProfileTheme` 死代码** (`viewModes.js:31-34`): 移除未使用的 CSS 变量或实现其效果

---

## 十一、集成单元测试审计与精简优化计划

> 日期: 2026-05-27 | 分析范围: `tests/` 目录下 61 个 `.test.js` 文件 | 366 个 `test()` 调用

### 11.1 测试套件全景

```
tests/ (61 个 *.test.js 文件, 366 个 test() 调用, 外加 legacy 2 个)
├── 🟢 核心引擎层 (20 文件, ~200 tests)
│   ├── detector 相关: detector.test.js, detector_buffers.test.js, detector_modes.test.js
│   ├── catalog 相关: catalog.test.js, catalog_tolerance.test.js, scale_tolerance.test.js, scaled_catalog.test.js
│   ├── registry 相关: registry.test.js, productization.test.js
│   ├── 检测管线: detection_fallback_chain.test.js, detection_recall.test.js, diagnostic_baseline.test.js
│   ├── 评分与精度: ncc_scoring.test.js, local_contrast.test.js, multi_dimension_scoring.test.js
│   ├── 移除相关: blendModes.test.js, multiPass_removal.test.js, alpha_calibration.test.js
│   └── 其他: adaptive_detector.test.js, subpixel.test.js, alpha_map_formula.test.js, ...
├── 🟡 配置/契约层 (10 文件, ~60 tests)
│   ├── config.test.js, custom_config.test.js, overrides_dynamic.test.js
│   ├── decision_policy.test.js, profile_system.test.js, consistency.test.js
│   └── parameter_matrix.test.js, bt709_color.test.js, color_space.test.js, ...
├── 🔴 集成/回归层 (10 文件, ~70 tests)
│   ├── gemini_regression.test.js, edge_cases.test.js, doubao.test.js
│   ├── product_audit.test.js, pipeline.test.js, real_sample.test.js
│   └── rectangular_watermark.test.js, security_adversarial.test.js, ...
├── ⚪ 前端/CLI 层 (8 文件, ~50 tests)
│   ├── frontend_contract.test.js, frontend_interaction.test.js
│   ├── cli.integration.test.js, cli_edge_cases.test.js
│   └── i18n_completeness.test.js, manual_selection.test.js, ...
└── ❌ 空文件/存根 (8 文件, 0 tests)
    ├── cli_edge_cases.test.js
    ├── concurrency_memory.test.js
    ├── cross_module_integration.test.js
    ├── numerical_precision.test.js
    ├── profile_system.test.js
    ├── rectangular_watermark.test.js
    ├── robustness_edge_cases.test.js
    ├── security_adversarial.test.js
    └── worker_protocol.test.js
```

### 11.2 关键问题清单

#### ❌ 问题 1: 8 个空测试文件 — 死代码

这些文件存在于仓库中但没有 `test()` 调用，占用维护心智负担。

| 文件 | 预期覆盖内容 | 现状 |
|------|-------------|------|
| `worker_protocol.test.js` | Worker 消息协议 | 空 |
| `security_adversarial.test.js` | 对抗性输入安全 | 空 |
| `cross_module_integration.test.js` | 跨模块集成 | 空 |
| `robustness_edge_cases.test.js` | 移除鲁棒性边界 | 空 |
| `concurrency_memory.test.js` | 并发与内存 | 空 |
| `rectangular_watermark.test.js` | 矩形水印 | 空 |
| `cli_edge_cases.test.js` | CLI 边缘情况 | 空 |
| `numerical_precision.test.js` | 数值精度 | 空 |
| `profile_system.test.js` | 配置文件系统 | 空 |

#### ❌ 问题 2: 显著测试冗余

| 冗余组 | 文件 | 重复覆盖 |
|--------|------|---------|
| **Catalog 匹配** (4 文件, 24 tests) | `catalog.test.js`(3), `catalog_tolerance.test.js`(7), `scale_tolerance.test.js`(3), `scaled_catalog.test.js`(11) | 全部测试 `getCatalogConfig` / `findMatches` / `getScaledCatalogConfigs`。`catalog_tolerance.test.js` 和 `scale_tolerance.test.js` 内容几乎完全相同。`catalog.test.js` 的 data-driven 测试与 `scaled_catalog.test.js` 的遍历重叠。 |
| **Registry** (2 文件, 17 tests) | `registry.test.js`(13), `productization.test.js`(4) | 都测试 registry 中 profile 存在性和 catalog 条目 |
| **Detector 基础设施** (3 文件, 10 tests) | `detector.test.js`(4), `detector_buffers.test.js`(4), `detector_modes.test.js`(2) | 分散在 3 个文件中，可合并 |
| **检测反压** (2 文件, 23 tests) | `detection_fallback_chain.test.js`(10), `detection_recall.test.js`(13) | 都测试 watermark 检测流程，fallback_chain 侧重回退，detection_recall 侧重召回率 |
| **参数矩阵** (2 文件, 13 tests) | `custom_config.test.js`(3), `overrides_dynamic.test.js`(9) | 都测试 options 参数传递与动态覆盖 |

#### ❌ 问题 3: 覆盖率缺口 (针对 v2.2 新架构)

以下关键组件/路径 **完全没有测试**：

| 组件 | 优先级 | 说明 |
|------|--------|------|
| `registry.findCloseMatches()` | 🔴 | 新增的核心 API，无测试 |
| `calculateProbeConfidence{isScaledMatch}` | 🔴 | 新增的缩放匹配门控逻辑 |
| `detector.js` 方差评分中性值 | 🟡 | `varianceScore` 在 `refStd < 5` 时返回 0.5，无验证 |
| `detector.js` `max(spatial, weighted)` | 🟡 | 多维评分新逻辑 |
| `applyProfileTheme()` DOM 操作 | 🟡 | 从 CSS 变量改为 DOM 样式，无测试 |
| 暗色模式手动切换 | 🟡 | `setupDarkModeToggle()` |
| `downloadImage` 回退行为 | 🟡 | URL 失效 → blob 回退 |
| Slider pointer events 拖拽 | 🟢 | pointerdown/pointermove/pointerup |
| `interpolateAlphaMap` 矩形尺寸 | 🟢 | 新增 targetHeight 参数 |
| `warpAlphaMap` 矩形尺寸 | 🟢 | 新增 targetHeight 参数 |
| `detectionPipeline` `isScaledMatch` 传递 | 🟡 | detectProfileWatermarks 传递参数 |
| `catalog.js` 静态 JSON import | 🟢 | 替代 fs.readFileSync |

#### ❌ 问题 4: 硬编码值泛滥

测试中大量重复硬编码值，修改一个参数需要改数十处：

| 硬编码值 | 出现次数 (估) | 应抽取为 |
|----------|--------------|---------|
| `'gemini'` profileId | 40+ 次 | `TEST_CONSTANTS.DEFAULT_PROFILE` |
| `96` logo尺寸 | 30+ 次 | `TEST_CONSTANTS.LOGO_SIZE_96` |
| `48` logo尺寸 | 20+ 次 | `TEST_CONSTANTS.LOGO_SIZE_48` |
| `1024` 分辨率 | 25+ 次 | `TEST_CONSTANTS.RES_1K` |
| `512` 分辨率 | 15+ 次 | `TEST_CONSTANTS.RES_0_5K` |
| `0.18` 阈值 | 10+ 次 | `TEST_CONSTANTS.DEFAULT_THRESHOLD` |
| `alphaMap` mock 构建 | 20+ 次 | `test_utils` 已有但测试未统一使用 |
| `createMockImageData` 参数 | 25+ 次 | `test_utils` 已有 |

#### ❌ 问题 5: 缺少端到端集成测试

- 没有测试验证 **完整的浏览器模拟流程**: load → detect → remove → download
- 没有测试验证 **app.js 生命周期**: `init()` → handle files → process → update UI → download
- 没有测试验证 **Worker → Main thread 回退**: `_getWorkerPool()` → `_performWorkerRemoval` → fallback
- 没有测试验证 **多配置切换**: gemini → doubao → auto 的实际检测效果

#### ❌ 问题 6: 测试环境隔离不足

- 多个测试直接 import 了 `registry` 和 `catalog` 的单例，测试间通过全局 `_catalogData` / `_loadedProfiles` 共享状态
- `edge_cases.test.js` 的 "Slightly scaled image" 测试依赖 `catalog.js` 的全局加载，但未显式重置
- `doubao.test.js` 与 `product_audit.test.js` 都操作同一个 `registry` 实例

### 11.3 合并与精简方案

#### Step 1: 删除空文件 (8 个 → 0)

直接删除所有 0-test 文件，释放仓库空间和心智负担。

#### Step 2: 合并冗余测试组

| 合并方案 | 目标文件 | 合并来源 | 预期测试数 |
|----------|---------|---------|-----------|
| Catalog 统一 | `tests/catalog.test.js` | ← `catalog_tolerance.test.js` + `scale_tolerance.test.js` + `scaled_catalog.test.js` | 15 |
| Registry 统一 | `tests/registry.test.js` | ← `productization.test.js` (合并进去) | 16 |
| Detector 统一 | `tests/detector.test.js` | ← `detector_buffers.test.js` + `detector_modes.test.js` | 9 |
| 检测统一 | `tests/detection_pipeline.test.js` (新建) | ← `detection_fallback_chain.test.js` + `detection_recall.test.js` | 18 |
| 参数统一 | `tests/parameter_overrides.test.js` (新建) | ← `custom_config.test.js` + `overrides_dynamic.test.js` | 10 |
| Edge/Cases 合并 | `tests/edge_cases.test.js` | ← `robustness_edge_cases.test.js` (空, 删除) | 5 (不变) |

#### Step 3: 填充覆盖率缺口 (新建文件)

| 新文件 | 覆盖内容 | 测试数 (估) |
|--------|---------|------------|
| `tests/v2_2_probe_gating.test.js` | `isScaledMatch` 门控 + `findCloseMatches` + 方差中性值 + `max(spatial,weighted)` | 12 |
| `tests/v2_2_frontend.test.js` | `applyProfileTheme`, `setupDarkModeToggle`, `downloadImage` 回退, slider pointer events | 8 |
| `tests/v2_2_adaptive_rect.test.js` | `interpolateAlphaMap`/`warpAlphaMap` 矩形尺寸 | 6 |
| `tests/e2e_integration.test.js` | 完整流程: engine → detect → remove → verify PSNR (无需完整 DOM, 已有 `test_utils.js` 提供 Mock) | 8 |

#### Step 4: 提取共享测试常量

```javascript
// tests/test_constants.js (新文件)
export const TEST_CONSTANTS = {
    RES_0_5K: 512,
    RES_1K: 1024,
    RES_2K: 2048,
    RES_4K: 4096,
    LOGO_48: 48,
    LOGO_96: 96,
    MARGIN_32: 32,
    MARGIN_64: 64,
    DEFAULT_THRESHOLD: 0.18,
    DEFAULT_PROBE_THRESHOLD: 0.18,
    DEFAULT_SCALED_THRESHOLD: 0.35,
    PROFILES: { GEMINI: 'gemini', DOUBAO: 'doubao', DALLE3: 'dalle3', AUTO: 'auto' },
};
```

### 11.4 执行计划

```
Phase A: 清理 (预计 10 min)
├── A1. 删除 8 个空测试文件
├── A2. 提取 test_constants.js 到 test_utils.js
└── A3. 为现有 test_utils.js 增加 mock 辅助函数

Phase B: 合并 (预计 20 min)
├── B1. 合并 catalog 4 文件 → catalog.test.js
├── B2. 合并 registry 2 文件 → registry.test.js
├── B3. 合并 detector 3 文件 → detector.test.js
├── B4. 新建 detection_pipeline.test.js (合并 fallback + recall)
├── B5. 新建 parameter_overrides.test.js (合并 config + overrides)
└── B6. 重命名 doubao.test.js → profile_doubao.test.js (命名规范)

Phase C: 填充 (预计 30 min)
├── C1. 新建 v2_2_probe_gating.test.js
├── C2. 新建 v2_2_frontend.test.js  
├── C3. 新建 v2_2_adaptive_rect.test.js
└── C4. 新建 e2e_integration.test.js

Phase D: 验证 (预计 10 min)
├── D1. pnpm lint → 确保无 lint 错误
├── D2. pnpm test → 确保所有测试通过
└── D3. 更新 DIAGNOSTIC_PLAN.md 完成标记
```

### 11.5 预期效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 测试文件数 | 61 (含 8 空) | 54 (无空文件) |
| 冗余文件 | 12 | 0 |
| 测试总数 | 366 | ~380 (新增覆盖 + 合并) |
| 硬编码出现次数 | ~200 | ~50 (通过常量引用) |
| v2.2 新功能覆盖率 | ~20% | ~90% |
| E2E 集成测试 | 0 | 1 个完整流程 |

---

*测试审计完成。*
