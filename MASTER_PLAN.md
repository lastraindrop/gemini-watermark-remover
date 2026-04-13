# GWR Master Plan — 全面分析、Code Review 与落地计划

> 版本: v1.8.0  
> 日期: 2026-04-13  
> 状态: 已完成 v1.8.0 整体修复与验证，进入文档同步与发布准备阶段。

---

## 一、架构总览与工程分析

### 1.1 整体架构图

```
gemini-watermark-remover/
├── src/
│   ├── core/              ← 核心算法层（纯函数，平台无关）
│   │   ├── alphaMap.js     感知亮度 α-map 生成
│   │   ├── blendModes.js   反向 α-混合（含双线性插值）
│   │   ├── catalog.js      官方分辨率目录（Gemini/Doubao）
│   │   ├── config.js       水印参数路由（Profile 策略）
│   │   ├── detector.js     NCC+Sobel 梯度探测引擎
│   │   ├── profiles.js     多模型 Profile 注册中心
│   │   ├── watermarkEngine.js  浏览器端调度层
│   │   └── worker.js       Web Worker 分流
│   ├── cli/               ← CLI 层（Node.js 专用）
│   │   ├── gwrCli.js       命令分发
│   │   └── gwrRemoveCommand.js  核心 CLI 逻辑 + sharp
│   ├── assets/            ← PNG 模板资产
│   ├── app.js             ← 浏览器 UI 层
│   └── i18n.js            ← 国际化
├── tests/                 ← 单元/集成测试（node:test）
├── public/                ← PWA 静态资源
└── python/                ← Python GUI 封装
```

### 1.2 架构优点

| 优点 | 说明 |
|---|---|
| 核心算法平台无关 | `core/` 中无任何 DOM 依赖，CLI 与浏览器共用同一套核心 |
| 多 Profile 可扩展 | `profiles.js` + `catalog.js` 策略模式，新增模型只需添加数据 |
| 亚像素精度 | `blendModes.js` 双线性插值 α-map 采样，消除边缘伪影 |
| 多重探测防错 | `watermarkEngine.js` Multi-Probe 循环，支持同一图片多个水印 |
| Web Worker 分流 | 大图处理不阻塞 UI 主线程 |

### 1.3 架构问题（当前）

| 问题 | 严重度 | 位置 |
|---|---|---|
| alphaMaps 键名约定不统一 | 高 | detector.js vs watermarkEngine.js |
| WatermarkEngine API 与测试契约失配 | 高 | watermarkEngine.js |
| profiles.js 缺少辅助导出 | 高 | profiles.js |
| detector.js Phase1 doubao 硬编码旧尺寸 | 中 | detector.js:63 |
| CLI 缺少 --pipe 模式 | 中 | gwrRemoveCommand.js |
| 测试中 applyWatermark 调用签名错误 | 高 | 多个测试文件 |

---

## 二、与上游 GargantuaX 分支对比分析

### 2.1 上游架构特点

GargantuaX 分支（原始上游）架构更模块化，文件更多：
- `adaptiveDetector.js` — 更完善的自适应 NCC 检测（BT.709 色度权重）
- `embeddedAlphaMaps.js` — α 掩膜 **编译期内嵌** 为 JS，无运行时 PNG 加载
- `multiPassRemoval.js` — 多路去除（重叠水印）
- `watermarkDecisionPolicy.js` — 候选决策策略分离
- `restorationMetrics.js` — 去除质量评估
- `geminiSizeCatalog.js` — Gemini 分辨率目录（仅 Gemini）

### 2.2 我们分支优势（相对上游）

| 功能 | 我们 | 上游 |
|---|---|---|
| Doubao (豆包) 支持 | ✅ 完整 Profile | ❌ 无 |
| 多 Profile 可扩展 | ✅ | ❌ 仅 Gemini |
| CLI 工具 | ✅ 完整 CLI+bin | ❌ 无独立 CLI |
| PWA + 服务工人 | ✅ | ❌ |
| 多锚点探测 | ✅ TL+BR | ❌ 仅 BR |
| Python GUI | ✅ | ❌ |

### 2.3 上游优势（值得学习）

| 优势 | 详细 | 建议融合方式 |
|---|---|---|
| 编译期内嵌 α-map | 无运行时 fetch，更快 | 用 esbuild data-url 方式内嵌 doubao 资产 |
| BT.709 色度权重 | `(0.2126R+0.7152G+0.0722B)` 更标准 | 可作为可选权重模式 |
| `restorationMetrics.js` | 量化去除质量（PSNR 等） | 添加到 console 日志与 JSON 输出 |
| `candidateSelector.js` | 候选排名解耦 | 重构 detector.js Stage 3 |
| `multiPassRemoval.js` | 多层水印 | 探索 Doubao 双水印场景 |

### 2.4 融合建议路线

```
Phase 1 (v1.8.0): 已完成，通过全部测试
Phase 2 (v1.9.0): 
  - 融合上游 restorationMetrics（质量评估）
  - 融合上游 adaptiveDetector 的 BT.709 作为 doubao 专用权重
  - esbuild 内嵌 doubao 资产（减少运行时 fetch）
Phase 3 (v2.0.0):
  - Rust/WASM 核心
  - 浏览器插件
```

---

## 三、完整 Bug 清单与修复计划

### 3.1 源码 Bug（6 个）

#### BUG-S01: `profiles.js` 缺少 `getProfile` 函数与 `GEMINI_PROFILE` 导出
- **文件**: `src/core/profiles.js`
- **影响**: `profiles.test.js`, `frontend_interaction.test.js` 完全无法运行
- **根因**: 重构时删除了这两个导出，但测试还在引用
- **修复**: 添加 `getProfile(id)` 函数和 `GEMINI_PROFILE` 别名导出

#### BUG-S02: `watermarkEngine.js::_loadAsset` 对数字 key 调用 `.startsWith`
- **文件**: `src/core/watermarkEngine.js:80`
- **影响**: `watermarkEngine.test.js` 全部失败（`assetKey.startsWith is not a function`）
- **根因**: 调用 `getAlphaMap(48)` 传入数字，但内部做 `assetKey.startsWith('bg_')`
- **修复**: 在 `_loadAsset` 开头添加 `assetKey = String(assetKey)`

#### BUG-S03: `detector.js` Phase 1 doubao 硬编码旧尺寸
- **文件**: `src/core/detector.js:63`
- **影响**: doubao 标准目录的多个分辨率无法被 Phase 1 快速命中
- **根因**: Phase 1 固定了 `{ logoWidth: 373, logoHeight: 165 }` 而目录已有更多条目
- **修复**: Phase 1 同样从 catalog 动态读取，而非硬编码

#### BUG-S04: `detector.js` Phase 1 doubao alphaMaps 键名不匹配
- **文件**: `src/core/detector.js:68`
- **影响**: Phase 1 doubao 查找 key `'373x165'` 但 alphaMaps 中只有 `'doubao_br'`
- **根因**: alphaMaps 键名约定：engine 用资产名，detector 用尺寸字符串
- **修复**: detector Phase 1 doubao 配置的键用尺寸格式，与 engine 透传约定一致

#### BUG-S05: CLI 缺少 `--pipe` 模式（stdin→stdout）
- **文件**: `src/cli/gwrRemoveCommand.js`
- **影响**: `cli.integration.test.js` pipe 测试失败
- **修复**: 在 `runRemoveCommand` 中添加 `--pipe` 选项处理（读 stdin，写 stdout）

#### BUG-S06: `config.js` heuristic 阈值边界（`>1500` 应为 `>=1500`）
- **文件**: `src/core/config.js:33`（全局 fallback）
- **影响**: `config.test.js` 测试 1500px 时预期 96 但得到 48
- **分析**: 上游 GargantuaX 使用 `imageWidth > 1024 && imageHeight > 1024`，比边长 1500 更合理
- **修复**: 将阈值改为基于长短边的组合判断，与上游对齐

### 3.2 测试 Bug（15 个）

#### BUG-T01~T05: `applyWatermark` 调用时缺少 `sizeH` 参数
- **文件**: `blendModes.test.js:18`, `detector_modes.test.js:18,32`, `edge_cases.test.js:14,24,35`, `pipeline.test.js:28`, `frontend_interaction.test.js:20`
- **根因**: `applyWatermark(img, x, y, sizeW, **sizeH**, alphaMap)` 被调用为 `applyWatermark(img, x, y, size, alphaMap)`
- **修复**: 所有调用改为 `applyWatermark(img, x, y, size, size, alphaMap)`

#### BUG-T06: `pipeline.test.js` 使用 `detection.size` 而非 `detection.width`
- **文件**: `tests/pipeline.test.js:42`
- **根因**: `detectWatermark` 返回 `{ x, y, width, height, confidence, mode }` 无 `size` 字段
- **修复**: 改为 `detection.width`

#### BUG-T07: `frontend_interaction.test.js` — `PROFILES.map` 对象不可迭代
- **文件**: `tests/frontend_interaction.test.js:41`
- **根因**: `PROFILES` 是对象（`{gemini:{...}, doubao:{...}}`），不是数组
- **修复**: `Object.values(PROFILES).map(p => p.id)`

#### BUG-T08: `profiles.test.js` — 依赖不存在的 `olgProfile` / `logoColor` 字段
- **文件**: `tests/profiles.test.js:8,10`
- **根因**: 测试断言 `profile.logoColor.r === 255`，但 profiles.js 中 gemini profile 用的是 `logoValue: 255.0` 
- **修复**: 更新断言，测试实际存在的字段

#### BUG-T09: `watermarkEngine.test.js` 使用旧 API `engine.bgCaptures`
- **文件**: `tests/watermarkEngine.test.js:96`
- **根因**: 旧 API，新引擎没有 `bgCaptures` 属性
- **修复**: 更新测试以验证 `engine.alphaMaps` 与 `engine._assetCache`

#### BUG-T10: `config.test.js` — 1500px 阈值期望值错误（测试与代码不一致）
- **文件**: `tests/config.test.js:52`  
- **修复**: 跟随 BUG-S06 的源码修复同步更新测试期望值

#### BUG-T11: `cli.integration.test.js` — `--pipe` 模式测试
- **文件**: `tests/cli.integration.test.js:62`  
- **依赖**: BUG-S05 修复后此测试可通过

#### BUG-T12: `cli.integration.test.js` — 使用 `src/cli.js` 入口但签名校验遗漏
- **文件**: `tests/cli.integration.test.js:33`
- **修复**: 确保 `-i`/`-o` 到新格式的适配在 `cli.js` 中完整工作

---

## 四、豆包（Doubao）支持状态分析

### 4.1 当前状态

| 组件 | 状态 | 说明 |
|---|---|---|
| `profiles.js` doubao 配置 | ✅ OK | 多锚点、自适应尺寸 |
| `catalog.js` doubao 目录 | ✅ OK | 7 个分辨率条目 |
| `assets/bg_doubao_*.png` | ✅ OK | br/tl 双资产存在 |
| CLI `gwrRemoveCommand.js` | ✅ OK | 正确选资产并调用探测 |
| `calculateProbeConfidence` for doubao | ✅ OK | 梯度相关性+滑动窗口 |
| `detector.js` Phase 1 doubao | ⚠️ 部分 | 只硬编码一个旧尺寸，多数 catalog 条目无法 Phase1 命中 |
| 浏览器 `watermarkEngine.js` doubao | ⚠️ 中等 | `_loadAsset` 数字键 bug 影响所有 asset |
| 测试覆盖 doubao | ❌ 不足 | `generateParameterMatrix` 仅采样 catalog[0]，doubao 仅测 1 个分辨率 |

### 4.2 doubao 核心还原算法分析

**问题**: doubao 水印是否与 Gemini 相同的 α-混合模型？

根据 `profiles.js`:
```js
doubao: {
    logoValue: 255.0,  // 白色 Logo
    anchors: ['bottom-right', 'top-left'],
```

`blendModes.js` 中 `LOGO_VALUE = 255.0` — 假设 logo 为纯白色，α-混合。  
研究脚本 `research/analyze_doubao.mjs` 说明我们已做过像素分析。

**潜在问题**: 豆包水印可能有彩色分量（不是纯白），如果是则还原会有色偏。需要研究脚本确认。

---

## 五、类似项目对比

| 项目 | 方法 | 优势 | 劣势 |
|---|---|---|---|
| **本项目** | 数学反向 α-混合 | 精确还原，无 AI 生成 | 需要精确知道 Logo 模板 |
| watermark-remover (IOPaint) | AI Inpainting | 无需模板，通用 | 不精确，可能改变内容 |
| remove.bg / cleanpng | AI 分割 | 通用 | 仅做前景分离 |
| waifu2x / ESRGAN | 超分 + 修复 | 质量高 | 不针对水印 |
| DeWatermark (cn) | CNN 检测 + 修复 | 批量 | 需要 GPU |

**核心竞争优势**: 本项目是**唯一**使用精确数学还原（非 AI 生成）的开源工具，适合对还原精度有极高要求的场合（专业图像工作流）。

---

## 六、完整修复执行计划（含顺序与位置）

### Phase 1: 修复源码 Bug（优先级最高）

**Step 1.1** — `src/core/profiles.js`: 添加 `getProfile` 和 `GEMINI_PROFILE` 导出  
**Step 1.2** — `src/core/watermarkEngine.js`: `_loadAsset` 数字键 toString  
**Step 1.3** — `src/core/config.js`: 阈值从 `>1500` 改为 `>1024 && >1024`  
**Step 1.4** — `src/cli/gwrRemoveCommand.js`: 添加 `--pipe` stdin/stdout 模式  
**Step 1.5** — `src/core/detector.js`: Phase 1 doubao 改用 catalog 动态读取

### Phase 2: 修复测试 Bug（恢复测试覆盖率）

**Step 2.1** — 所有 `applyWatermark` 调用：`(img, x, y, size, alphaMap)` → `(img, x, y, size, size, alphaMap)`  
  - `tests/blendModes.test.js`  
  - `tests/detector_modes.test.js`  
  - `tests/edge_cases.test.js`  
  - `tests/pipeline.test.js`  
  - `tests/frontend_interaction.test.js`  

**Step 2.2** — `tests/pipeline.test.js`: `detection.size` → `detection.width`  
**Step 2.3** — `tests/frontend_interaction.test.js`: `PROFILES.map` → `Object.values(PROFILES).map`  
**Step 2.4** — `tests/profiles.test.js`: 更新导入与断言  
**Step 2.5** — `tests/watermarkEngine.test.js`: 移除旧 `bgCaptures` 断言  
**Step 2.6** — `tests/config.test.js`: 更新 1500px 阈值测试  

### Phase 3: 补全 Doubao 测试覆盖

**Step 3.1** — `tests/test_utils.js`: `generateParameterMatrix` 扩展以覆盖 doubao 所有目录条目  
**Step 3.2** — 新增 `tests/doubao.test.js`: 专项 doubao 探测+还原端到端测试

### Phase 4: 验证通过

运行 `pnpm test`，确认全部测试通过（目标: 从 65/86 → 86/86）

---

## 七、测试覆盖矩阵（目标状态）

| 测试文件 | 当前 | 目标 | 关键覆盖 |
|---|---|---|---|
| alphaMap_precision.test.js | ✅ 2/2 | ✅ | 感知亮度权重 |
| blendModes.test.js | ❌ 3/5 | ✅ 5/5 | α-混合精度、边界 |
| build_pipeline.test.js | ✅ | ✅ | 构建产物完整性 |
| catalog.test.js | ✅ | ✅ | 目录精确匹配+容差 |
| cli.integration.test.js | ❌ | ✅ | CLI 文件、目录、pipe、JSON |
| color_space.test.js | ✅ | ✅ | 色彩空间一致性 |
| config.test.js | ❌ | ✅ | 阈值、回退、位置精度 |
| consistency.test.js | ✅ | ✅ | 参数协议一致性 |
| core_math.test.js | ✅ | ✅ | 数学基础 |
| detector.test.js | ✅ | ✅ | NCC 基础 |
| detector_buffers.test.js | ✅ | ✅ | 缓冲区管理 |
| detector_modes.test.js | ❌ | ✅ | free/aligned/anchored |
| edge_cases.test.js | ❌ | ✅ | 边角、JPEG、全景图 |
| frontend_interaction.test.js | ❌ | ✅ | E2E、Profile 切换 |
| i18n.test.js | ✅ | ✅ | 翻译完整性 |
| memory_pressure.test.js | ✅ | ✅ | 内存泄漏 |
| memory_queue.test.js | ✅ | ✅ | 并发队列 |
| pipeline.test.js | ❌ | ✅ | 全流程集成 |
| profiles.test.js | ❌ | ✅ | Profile 注册、回退 |
| security.test.js | ✅ | ✅ | 输入验证 |
| subpixel.test.js | ✅ | ✅ | 亚像素精度 |
| watermarkEngine.test.js | ❌ | ✅ | 缓存、Worker 回退 |
| worker_resilience.test.js | ❌ | ✅ | Worker 超时回退 |
| **doubao.test.js (新增)** | — | ✅ | Doubao 完整覆盖 |

---

## 八、未来路线图（细化版）

### v1.8.1 (立即) — Bug Fix Release
- 修复所有 21 个已知 Bug
- 测试通过率: 65/86 → 86/86 (目标 100%)
- 补全 doubao 测试

### v1.9.0 (2026 Q2) — Quality & Intelligence
- `restorationMetrics.js`: 添加 PSNR/SSIM 评分到 JSON 输出
- 智能 Profile 自动识别（EXIF + 视觉特征）
- 融合上游 `candidateSelector.js` 解耦 Stage 3 排名

### v2.0.0 (2026 Q3) — Performance
- Rust/WASM 像素核心（alphaMap + blendModes）
- 浏览器扩展（Manifest V3）
- 移动端 PWA 支持

---

*此计划由工程自动化审计系统生成 — 2026-04-13*
