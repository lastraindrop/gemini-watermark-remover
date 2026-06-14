# 前端深度诊断报告

> **分析日期**: 2026-06-14  
> **分析范围**: `src/app.js`, `src/app/*.js` (9 模块), `public/index.html`, `src/i18n.js`, `src/utils.js`, `src/tailwind.css`  
> **方法**: 逐文件源码精读 + 静态交叉引用分析 + 运行时行为推演

---

## 目录

1. [UI 架构对齐性](#1-ui-架构对齐性)
2. [硬编码与灵活性](#2-硬编码与灵活性)
3. [直观度与用户体验](#3-直观度与用户体验)
4. [BUG 清单与修复](#4-bug-清单与修复)
5. [优先修复矩阵](#5-优先修复矩阵)

---

## 1. UI 架构对齐性

### 1.1 总体评价: 中等偏上，但存在"幽灵控件"和"死代码路径"

引擎（core 层）已经演进到 v2.5.1：五阶段管线、三维评分、性能预设、决策分层、forceProcess。前端**部分**跟上了，但存在明显的同步滞后。

### 1.2 已对齐的部分 ✅

| 引擎能力 | 前端体现 | 文件:行 |
|---------|---------|---------|
| 性能预设 (fast/balanced/thorough) | 三档单选按钮 + 动态参数提示 | `index.html:158-178`, `settings.js:184-217` |
| 检测阈值/梯度惩罚可调 | 双滑块 + 实时数值显示 | `index.html:184-198`, `settings.js:103-137` |
| 多 Profile (Gemini/Doubao/DALL-E 3) | `<select>` 动态填充 + 品牌主题色 | `app.js:112-133`, `viewModes.js:31-41` |
| 手动模式 (forceProcess + 模板尺寸) | 拖拽选区画布 + 48/96px 单选 + 强制开关 | `manualSelection.js`, `index.html:230-264` |
| 重新处理 | Re-process 按钮 (不重置工作区) | `app.js:272-306` |
| 决策分层展示 | tierBadge 显示 source + tier + anchor | `app.js:414-423` |

### 1.3 未对齐的部分 ❌（架构滞后）

#### 问题 U1: DeepScan / NoiseReduction 开关是**装饰性幽灵控件**

**严重度**: High

`index.html:110-122` 渲染了两个物理开关：
```html
<input type="checkbox" id="deepScanToggle" class="sr-only peer" checked>
<input type="checkbox" id="noiseReductionToggle" class="sr-only peer">
```

但 `syncTogglesToPreset()` (`settings.js:193-199`) **强制覆盖**这两个开关的状态：
```javascript
toggle.checked = value;  // 强制写入预设值
toggle.classList.toggle('preset-controlled', true);
```

用户点击这两个开关后，**下一次任何触发 `syncTogglesToPreset()` 的事件**（预设切换、页面加载、语言切换）都会把用户的手动选择覆盖掉。更关键的是：`getEngineOptions()` (`settings.js:129-130`) 完全**不读取**这两个开关的 DOM 状态，只读取 `preset.deepScan` 和 `preset.noiseReduction`：

```javascript
deepScan: preset.deepScan,           // ← 来自预设，忽略开关
noiseReduction: preset.noiseReduction, // ← 来自预设，忽略开关
```

**结论**: 这两个开关是**纯装饰**——用户点击它们没有任何实际效果。这是严重的架构-UI 不一致。引擎支持运行时切换 `deepScan`/`noiseReduction`，但前端通过预设机制剥夺了用户的细粒度控制权。

**用户感知**: 用户以为自己在控制"深度扫描"和"降噪"，实际上控制的是"什么都不影响"。

#### 问题 U2: 手动选区画布只在单图模式可见，批量模式无入口

**严重度**: Medium

`index.html:255` 的 `#manualSelectCanvas` 位于 Advanced Panel 内，逻辑上对单图和批量都可用。但 `app.js:249-258` 的 `manualModeToggle` 处理器只检查 `getActiveSingleItem()`：

```javascript
const item = getActiveSingleItem();
if (item?.originalUrl) {
    showManualSelectCanvas(elements, item.originalUrl);
}
```

`getActiveSingleItem()` (`app.js:326-328`) 在批量模式下（队列长度 ≠ 1）返回 `null`。因此批量处理时手动模式不可用——但 UI 上开关仍然可见可点，只是点了没反应。用户会困惑"为什么开关打开了但画布不出现"。

#### 问题 U3: comparisonSlider 视图模式与统一卡片布局矛盾

**严重度**: Medium

v2.5 的 ROADMAP 声称"移除了旧版对比滑块单预览路径，统一为卡片网格"。但 `index.html:272-346` 的 `#singlePreview` section 仍然完整包含：
- comparisonSlider (带 handle、magnifier、manualSelectionLayer)
- sideBySideView
- statsView
- modeSliderBtn / modeSideBtn / modeStatsBtn 三个视图切换按钮

当只有 1 张图片时，`dragDrop.js` 将 `multiPreview` 设为 `block` 并走卡片网格路径，但 `singlePreview` section 从未被显示（`style="display: none"` 且无代码将其设为 `block`）。`updateSingleUI()` (`app.js:406-434`) 仍然写入 `sliderOriginal.src`、`sliderProcessed.src` 等——这些 DOM 操作是**死代码**，因为 singlePreview 永远不可见。

**影响**: ~140 行 HTML 和 ~30 行 JS 是无法到达的死路径。维护成本 + 用户困惑（如果代码 bug 意外显示了 singlePreview，视图布局会错乱）。

#### 问题 U4: Auto Save 开关读取路径正确但未持久化独立

**严重度**: Low

`autoDownloadToggle` (`index.html:126`) 在 `getEngineOptions()` (`settings.js:131`) 中被正确读取。但 `saveSettings()` (`settings.js:24-34`) **不保存** `autoDownload` 的状态——用户下次打开页面时该开关总是 reset 为 unchecked。相比之下，threshold、penalty、preset、profile、locale 都被持久化了。

---

## 2. 硬编码与灵活性

### 2.1 严重硬编码问题

#### H1: `getEngineOptions()` 中阈值派生公式硬编码

**文件**: `src/app/settings.js:110-120`

```javascript
const baseOverrides = {
    jitterRange: Math.round(thresholdVal * 30),     // ← 30 硬编码
    THRESHOLDS: {
        ANCHORED_OFFICIAL: thresholdVal,
        ANCHORED_OTHER: thresholdVal + 0.04,         // ← 0.04 硬编码
        COARSE: thresholdVal * 0.55,                  // ← 0.55 硬编码
        FINAL_ANCHORED: Math.max(0.10, thresholdVal - 0.03),  // ← 0.10, 0.03
        FINAL_ALIGNED: thresholdVal,
        FINAL_FREE: thresholdVal + 0.04              // ← 0.04
    }
};
```

用户拖动"检测阈值"滑块时，这些派生关系是**固定的魔法比例**。它们不在 `DETECTION_THRESHOLDS` 或 `PERFORMANCE_PRESETS` 中，无法被引擎或配置中心感知。如果引擎修改了 `ANCHORED_OTHER` 与 `ANCHORED_OFFICIAL` 的差值关系，这里的 `+0.04` 不会自动同步。

**对比**: `config.js` 的 `PERFORMANCE_PRESETS` 已经为每个预设定义了完整的 `THRESHOLDS` 覆盖。但 `baseOverrides` 的硬编码公式会在 `deepMerge` 中与预设 THRESHOLDS 合并——由于 `deepMerge` 是递归的，`baseOverrides.THRESHOLDS.ANCHORED_OFFICIAL` 会覆盖预设的 `THRESHOLDS.ANCHORED_OFFICIAL`。**这意味着用户滑块实际上覆盖了预设精心调优的阈值**，破坏了预设的设计意图。

#### H2: magnifier.js 魔法数字

**文件**: `src/app/magnifier.js:25-34`

```javascript
const LENS_SIZE = 150;       // ← 硬编码
const clampedLeft = Math.max(0, Math.min(rect.width - LENS_SIZE, x - 75));  // ← 75 = LENS_SIZE/2 但未引用
const clampedTop = Math.max(0, Math.min(rect.height - LENS_SIZE, y - 75));
const zoom = 3;              // ← 硬编码
```

`75` 应该是 `LENS_SIZE / 2`，但写成字面量。修改 `LENS_SIZE` 时必须同步修改 75——典型的硬编码耦合。

#### H3: keyboard.js 快捷键到视图模式的映射硬编码

**文件**: `src/app/keyboard.js:11-17`

```javascript
if (e.key === '1') switchViewMode('slider', elements);
if (e.key === '2') switchViewMode('side', elements);
if (e.key === '3') switchViewMode('stats', elements);
if (e.key === 'ArrowRight') switchViewMode('side', elements);   // ← ArrowRight=side?
if (e.key === 'ArrowLeft') switchViewMode('slider', elements);  // ← ArrowLeft=slider?
```

`←/→` 键的映射语义不直观：`→` = side（并排）、`←` = slider（滑块）。`shortcutsHint` (`index.html:420`) 写的是 `←/→: Compare images`——没有说明哪个方向对应哪个视图。用户无法推断。

#### H4: app.js 版本号显示逻辑脆弱

**文件**: `src/app.js:16-26`

```javascript
const pkg = await import('../package.json');
_pkgVersion = pkg.default?.version || pkg.version || 'dev';
```

在浏览器环境（esbuild bundle）中，`import('../package.json')` 依赖 bundler 的 JSON loader。如果 bundler 配置变化或文件移动，静默 fallback 到 `'dev'`——用户看到 `v-dev` 但不知道是真 dev 还是加载失败。无错误日志。

#### H5: settings.js 默认 penalty 值硬编码

**文件**: `src/app/settings.js:105`

```javascript
const penaltyVal = parseFloat(elements.penaltySlider?.value ?? '0.30');
```

`'0.30'` 字符串硬编码，应引用 `DETECTION_THRESHOLDS.GRADIENT_PENALTY_DEFAULT`（我上一轮已添加到 config.js）。同样，HTML 中 `<input ... value="0.30">` (`index.html:197`) 和 `value="0.18"` (`index.html:189`) 也是硬编码默认值，未从 `DETECTION_THRESHOLDS` 动态生成。

### 2.2 灵活性评估

| 维度 | 评分 | 说明 |
|------|------|------|
| Profile 可扩展性 | 8/10 | 新增 profile 只需注册 `profiles.js`，UI select 自动填充 |
| 语言可扩展性 | 7/10 | 新增语言需：加 JSON + 加 `i18n.js` import + 加 `supportedLanguages` 条目（3 处同步） |
| 预设可扩展性 | 9/10 | `PERFORMANCE_PRESETS` 加条目即可，但 UI 的 3 列 radio 布局是硬编码的（无法自动适配 4+ 预设） |
| 滑块范围 | 4/10 | threshold `0.05-0.80` 和 penalty `0.10-0.90` 硬编码在 HTML `min`/`max` 属性中，无法从配置调整 |
| 视图模式 | 3/10 | slider/side/stats 三模式完全硬编码在 HTML 和 JS 中，无法插件化扩展 |

---

## 3. 直观度与用户体验

### 3.1 优点 ✅

- **拖放体验**: 窗口级拖放 + 全屏 overlay + 深度文件夹递归——业界水准
- **剪贴板粘贴**: Ctrl+V 直接粘贴图片——便捷
- **暗色模式**: 三态循环 (auto→dark→light) + localStorage 持久化
- **审计日志**: 右下角可折叠控制台 + CSV 导出——调试友好
- **批量进度**: 顶部进度条 + 批量进度条 + 逐卡片状态——清晰
- **键盘快捷键**: Esc 重置、1/2/3 切视图、Ctrl+S 下载——效率工具
- **品牌主题**: 切换 Profile 时 header 图标和 tierBadge 变色——视觉反馈

### 3.2 体验问题

#### UX1: 首次使用无引导，功能发现性差

新用户打开页面看到：
1. 一个巨大的拖放区
2. 一个控制面板（Profile + 3 个开关 + 3 个工具按钮）
3. Advanced Settings 折叠隐藏

但**核心功能（处理图片）的反馈循环很长**：用户必须先拖入图片 → 等待处理 → 才能看到结果。没有"示例图片"或"试试看"按钮。`sample/` 目录有示例图片但前端未引用。

#### UX2: 幽灵控件导致用户信任危机

如 [§1.3 U1](#问题-u1-deepscan--noisereduction-开关是装饰性幽灵控件) 所述，DeepScan 和 NoiseReduction 开关点击无效。用户反复点击后发现"好像没反应"或"刚才的设置又变回来了"，会丧失对工具的信任。

#### UX3: 错误提示过于技术化

**文件**: `src/core/watermarkEngine.js:194-197`

```javascript
msg = `Security Error: ${e.message}. 1. The image is from a third-party website...`;
```

CORS 错误提示是一大段英文技术文本，即使用户切换到中文界面也是如此（i18n fallback 失败时）。`error.cors.detail` 的中文翻译存在但只有 fallback 路径生效时才用。

#### UX4: 批量处理无取消机制

一旦 `processQueue()` 启动，用户**无法中途取消**。`state.isProcessing = true` 后，新文件拖入只会 toast "processing busy"，但没有"停止"按钮。对于 100+ 张图片的批量任务，用户只能等待或刷新页面。

#### UX5: 手动选区坐标与画布选区不同步的混乱

手动模式有两种输入方式：
1. 在 `#manualSelectCanvas` 上拖拽（自动填充 X/Y/W/H 输入框）
2. 手动在 X/Y/W/H 输入框中键入数字

但输入框的 `max` 属性未设置——用户可以输入超过图片尺寸的坐标。`getEngineOptions()` (`settings.js:162`) 只检查 `x < 0 || y < 0 || width <= 0 || height <= 0`，**不检查上界**。引擎的 `validateManualConfig()` (`detectionPipeline.js:115`) 会拒绝越界坐标并抛出 RangeError，但用户看到的错误是 toast "Invalid manualConfig: region must be inside the image bounds"——没有告知具体哪个值越界、图片实际尺寸是多少。

#### UX6: 放大镜仅在 slider 视图可用，但 slider 视图在统一卡片布局下不可达

`magnifier.js` 绑定到 `comparisonSlider`，但如 [U3](#问题-u3-comparisonslider-视图模式与统一卡片布局矛盾) 所述，singlePreview 不可见。因此**放大镜功能实际不可用**。用户看到 `shortcutsHint` 提到"对比"功能，但找不到入口。

#### UX7: 视图切换按钮 (SLIDER/SIDEBAR/STATS) 在卡片布局下无意义

`index.html:280-284` 的三个视图按钮位于 `#singlePreview` 内，而该 section 不可见。但 `keyboard.js:11-13` 的 1/2/3 快捷键仍然调用 `switchViewMode()`——切换的是隐藏元素的 class，用户看不到任何效果。

#### UX8: 进度条在错误时可能卡住

`processing.js:107-116` 的 `finally` 块检查 `!accounted && item.status !== 'pending'` 来补计进度。但如果 `processSingle` 抛出未捕获异常（如 worker transfer 失败），`item.status` 可能仍是 `'pending'`（未被设为 `'error'`），导致 `accounted = false` 且条件不满足，进度条卡住。

### 3.3 可访问性 (A11y) 问题

| 问题 | 位置 | 影响 |
|------|------|------|
| 拖放区 `role="button"` 但无 `aria-label` | `index.html:70` | 屏幕阅读器无法描述用途 |
| 暗色模式按钮 title 是英文硬编码 `"Toggle dark mode"` | `index.html:135` | 非 en 用户看到英文 |
| 工具按钮 title 全是英文 (`"Reset"`, `"Advanced Settings"`) | `index.html:138-143` | 未 i18n |
| 进度条无 `role="progressbar"` | `index.html:363-365` | ARIA 语义缺失 |
| toast 通知无 `role="alert"` | `ui.js:69` | 屏幕阅读器不播报 |

---

## 4. BUG 清单与修复

### 4.1 Critical BUG

#### FE-BUG-C1: 5 个语言文件缺失 3 个 `manual.*` 键

**文件**: `src/i18n/ja-JP.json`, `ru-RU.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`

**缺失键**: `manual.templateSize`, `manual.forceProcess`, `manual.dragHint`

**影响**: 日/俄/法/西/德语用户打开手动模式时，看到的是英文 fallback 文本（或 raw key 字符串）。`i18n_completeness.test.js` 因此失败。

**修复**: 为 5 个语言文件各添加 3 个键的翻译。zh-CN 和 en-US 已有。

#### FE-BUG-C2: DeepScan/NoiseReduction 开关完全无效

见 [§1.3 U1](#问题-u1-deepscan--noisereduction-开关是装饰性幽灵控件)。

**影响**: 用户交互无效，信任危机。

**修复方案 A（推荐）**: 移除这两个物理开关，改为只读状态指示器（显示当前预设控制的值），避免误导。
**修复方案 B**: 让 `getEngineOptions()` 读取开关 DOM 状态，优先级高于预设（用户手动覆盖预设）。

### 4.2 High BUG

#### FE-BUG-H1: `baseOverrides` 硬编码公式覆盖预设 THRESHOLDS

见 [§2.1 H1](#h1-getengineoptions-中阈值派生公式硬编码)。

**影响**: 预设的 `THRESHOLDS` 精调被用户滑块覆盖，预设设计意图失效。

**修复**: `getEngineOptions()` 中，用户滑块只应覆盖 `probeThreshold`/`fallbackThreshold`（传入引擎 options），不应重写 `THRESHOLDS.*`。让 `deepMerge(preset.overrides, userThresholdAdjustments)` 以预设为 base。

#### FE-BUG-H2: `objectUrlManager` 方法被猴补丁覆盖，破坏封装

**文件**: `src/app.js:515-533`

```javascript
const _originalRegister = objectUrlManager.register.bind(objectUrlManager);
objectUrlManager.register = function(url) {
    const result = _originalRegister(url);
    updateMemoryCounter();
    return result;
};
// ... 同样覆盖 revoke 和 clear
```

`app.js` 在模块顶层（非函数内）永久修改了 `state.js` 导出的 `objectUrlManager` 对象的方法。如果未来有多个模块导入 `objectUrlManager`，它们拿到的都是被 app.js 猴补丁后的版本。这是全局可变状态的滥用。

**修复**: `state.js` 应内置内存计数器回调（observer 模式），而非让 app.js 外科手术式覆盖。

#### FE-BUG-H3: magnifier `processedImg` 引用可能为 null 导致崩溃

**文件**: `src/app/magnifier.js:4,32`

```javascript
const processedImg = document.getElementById('sliderProcessed');  // 模块加载时获取一次
// ...
lens.style.backgroundImage = `url(${processedImg?.src || ''})`;
```

`processedImg` 在模块加载时获取一次。如果 magnifier.js 在 DOM 完全渲染前加载（esbuild bundle 场景），`processedImg` 为 null。虽然 `?.` 防止了崩溃，但放大镜显示空白背景——静默失败。应在 `moveLens` 内动态获取。

#### FE-BUG-H4: 手动选区画布坐标输入无上界校验

见 [§3.2 UX5](#ux5-手动选区坐标与画布选区不同步的混乱)。

**修复**: `getEngineOptions()` 中增加上界检查，或给输入框设置 `max` 属性。

### 4.3 Medium BUG

| ID | 文件:行 | 描述 |
|----|---------|------|
| FE-BUG-M1 | `settings.js:131` | `autoDownload` 未持久化到 localStorage |
| FE-BUG-M2 | `app.js:409-412` | `updateSingleUI` 写入 `sliderOriginal.src` 等死代码路径 |
| FE-BUG-M3 | `ui.js:81` | `iconSpan.innerHTML = icons[type]` — icons 对象是硬编码 SVG 字符串，非 i18n，但内容是安全的（无用户输入） |
| FE-BUG-M4 | `viewModes.js:31-41` | `applyProfileTheme` 直接写 `style.backgroundColor`，不清理旧值；切换 Gemini→Doubao 后再切回 Gemini，Doubao 的 indigo 色残留（因为只设置新色不清除） |
| FE-BUG-M5 | `keyboard.js:15-17` | ArrowLeft/Right 映射到 slider/side 语义不直观，且与 shortcutsHint 描述不符 |
| FE-BUG-M6 | `app.js:484` | `resetWorkspace` 调用 `objectUrlManager.clear()` 但不清除 `state.imageQueue` 中的 `item.processedUrl`/`item.originalUrl` 引用——item 对象仍持有已撤销的 URL 字符串（虽不影响 GC，但若异步任务后续访问会 404） |
| FE-BUG-M7 | `processing.js:120` | `Array(Math.min(concurrency, queue.length)).fill(0).map(() => next())` — 如果 concurrency=0 或负数（极端情况），`Array(0)` 不启动任何 worker，Promise.all([]). 立即 resolve，但队列未处理 |

### 4.4 Low BUG

| ID | 文件:行 | 描述 |
|----|---------|------|
| FE-BUG-L1 | `index.html:135-143` | 工具按钮 title 硬编码英文，未 i18n |
| FE-BUG-L2 | `index.html:70` | 拖放区缺 aria-label |
| FE-BUG-L3 | `magnifier.js:25-27` | `75` 应为 `LENS_SIZE/2` |
| FE-BUG-L4 | `app.js:89-91` | loadingTimeout 8s 硬编码 |
| FE-BUG-L5 | `ui.js:15` | `MAX_AUDIT_ENTRIES=100` 硬编码 |
| FE-BUG-L6 | `settings.js:105` | `'0.30'` 应引用 `DETECTION_THRESHOLDS.GRADIENT_PENALTY_DEFAULT` |
| FE-BUG-L7 | `index.html:189,197` | 滑块默认值 `0.18`/`0.30` 硬编码在 HTML，未从 config 动态生成 |
| FE-BUG-L8 | `index.html:2` | `<html lang="zh-CN">` 硬编码，i18n.init() 后才更新为实际 locale——首屏闪烁 |

---

## 5. 优先修复矩阵

### Phase FE-1: 关键修复（用户可感知）

| 序号 | BUG | 工时 | 用户影响 |
|------|-----|------|---------|
| 1.1 | FE-BUG-C1: 5 语言补齐 3 个 manual.* 键 | 0.5h | 5 语言用户看到正确翻译 |
| 1.2 | FE-BUG-C2: DeepScan/NoiseReduction 幽灵控件 → 改为只读指示器 | 1.5h | 消除信任危机 |
| 1.3 | FE-BUG-H1: baseOverrides 覆盖预设 THRESHOLDS | 1h | 预设设计意图恢复 |
| 1.4 | FE-BUG-H4: 手动坐标上界校验 | 0.5h | 减少越界错误 |

### Phase FE-2: 架构清理

| 序号 | 项目 | 工时 |
|------|------|------|
| 2.1 | FE-BUG-H2: objectUrlManager 猴补丁 → observer 模式 | 1h |
| 2.2 | FE-BUG-M2: 移除 updateSingleUI 死代码路径 | 0.5h |
| 2.3 | U3: 移除不可达的 singlePreview section 或重新启用 | 2h |
| 2.4 | UX6/UX7: 放大镜+视图切换 — 要么移除要么重新接入卡片布局 | 1h |

### Phase FE-3: 体验提升

| 序号 | 项目 | 工时 |
|------|------|------|
| 3.1 | UX1: 添加"试试示例图片"按钮 | 1h |
| 3.2 | UX3: CORS 错误提示 i18n 化 + 简化 | 0.5h |
| 3.3 | UX4: 批量处理取消按钮 | 1.5h |
| 3.4 | FE-BUG-L1/L2/L8: ARIA + title i18n + lang 动态化 | 1h |
| 3.5 | FE-BUG-L3/L6/L7: 硬编码默认值从 config 动态注入 | 0.5h |

### Phase FE-4: 验证

| 序号 | 项目 | 工时 |
|------|------|------|
| 4.1 | i18n_completeness.test.js 通过（补齐后验证） | 0.2h |
| 4.2 | 新增 ghost_controls.test.js — 验证 DeepScan/NoiseReduction 指示器状态 | 0.5h |
| 4.3 | 新增 manual_bounds.test.js — 验证手动坐标上界 | 0.5h |
| 4.4 | 浏览器手工 QA: 7 语言 × 3 预设 × Gemini/Doubao | 1h |

### 总预估

| Phase | 工时 |
|-------|------|
| FE-1 (关键) | ~3.5h |
| FE-2 (架构) | ~4.5h |
| FE-3 (体验) | ~4.5h |
| FE-4 (验证) | ~2.2h |
| **合计** | **~14.7h** |

---

## 附录: 前端健康度评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构对齐 | 6.5/10 | 预设/手动/Profile 对齐良好；DeepScan 开关和视图模式严重滞后 |
| 硬编码控制 | 5.5/10 | 阈值派生公式、放大镜参数、快捷键映射均硬编码 |
| 用户体验 | 7.0/10 | 拖放/暗色/审计/快捷键优秀；幽灵控件和死路径拉低分数 |
| BUG 密度 | 7.5/10 | 1 Critical (i18n) + 4 High + 7 Medium + 8 Low = 20 个问题 |
| 可访问性 | 5.0/10 | 部分 aria-label 缺失，title 未 i18n |
| **综合** | **6.3/10** | 功能完备但工程细节待打磨 |

---

*文档结束 — 2026-06-14 前端深度诊断*
