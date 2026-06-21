# 前端分析报告 v2.7 — 5 维度审计

> **分析日期**: 2026-06-19  
> **分析对象**: `public/index.html` + `src/app.js` + `src/app/*` (9 文件) + `src/tailwind.css` + `src/i18n.js`  
> **分析范围**: 14 个前端文件，~2400 行代码  
> **方法**: 逐行人工审计 + grep 交叉验证

---

## 维度 1：UI 是否体现了最新的架构、功能与设计

### 1.1 已体现的能力 ✅

| 架构能力 | UI 体现 | 证据 |
|---------|---------|------|
| 三 Profile（Gemini/Doubao/DALL-E） | Profile 下拉选择器 | index.html:95 `#profileSelect` |
| 三档性能预设（fast/balanced/thorough） | 单选按钮组 + 图标 + 描述 | index.html:160-179 |
| DeepScan/NoiseReduction 由预设控制 | 诚实的只读状态徽章（非交互） | index.html:112-124，settings.js:178-216 |
| 阈值/梯度惩罚可调 | 滑块 + 实时数值显示 | index.html:186-200 |
| 手动区域选择 | 拖拽画布 + 坐标输入 + 模板尺寸单选 | index.html:203-294，manualSelection.js |
| 高级覆盖（alphaGain/searchRange） | 折叠式 `<details>` 面板 | index.html:257-282 |
| 批量处理 | 统一卡片网格 + 进度条 + ZIP 下载 | index.html:301-321，processing.js |
| 前后对比 | 卡片右上角 Compare 徽章切换 | dragDrop.js:48-69 |
| 7 语言 i18n | 语言下拉 + data-i18n 全覆盖 | i18n.js + 7 个 JSON |
| 暗色模式 | 三态循环（auto/dark/light） | settings.js:218-243 |
| 快捷键 | 1/2/3/Esc/Ctrl+S | keyboard.js |
| 审计日志 | 可折叠控制台 + CSV 导出 | index.html:354-364，ui.js |

### 1.2 未体现的架构能力 ❌

| 架构能力 | UI 缺失 | 影响 |
|---------|---------|------|
| **新 catalog 变体**（2k-new-margin/v2-small/large-margin） | Profile 选择器无变体指示；用户无法知道当前图用的是哪个 tier | 中——技术已实现（Phase A 修复后）但用户不可见 |
| **alphaVariant**（96-20260520） | 无 UI 提示使用了备用 alpha 图 | 低——内部细节，高级用户才关心 |
| **NMS 抑制** | 多匹配时无"检测到 N 个候选，保留最高置信度"的反馈 | 低——技术正确但用户不可见 |
| **亚像素精修** | 无"正在精修对齐…"的进度反馈 | 低——过程太快无需反馈 |
| **halo 检测** | 无"检测到光晕伪影，降低强度重试"的反馈 | 低——内部安全门 |
| **recalibration** | 无"残差仍高，正在校准 alpha 强度"的反馈 | 低——但修复后（Phase A）会真实触发，用户应感知到结果改善 |
| **置信度/检测源** | 卡片元数据只显示 `removedCount / latency`，不显示 confidence/tier/source | 中——用户无法判断检测质量 |

### 1.3 结论

UI **大体反映了架构**，但存在"黑箱化过度"问题——v2.6.0 新增的检测能力（NMS/亚像素/halo/recalibration）对用户完全不可见。建议在卡片元数据中增加 `confidence` 显示（processing.js:45 已传递但未在 UI 渲染）。

---

## 维度 2：硬编码现象与灵活性

### 2.1 硬编码清单

| 位置 | 硬编码值 | 问题 | 严重度 |
|------|---------|------|--------|
| `app.js:102` | `8000` (loading timeout) | 魔法数，不可配置 | 🟡 |
| `app.js:220` | `gwr_batch_${timestamp}.zip` | 文件名模式硬编码 | ⚪ |
| `dragDrop.js:15` | `image/(jpeg|png|webp)` | 支持格式硬编码——AVIF/HEIC 等新格式无法通过 | 🟡 |
| `dragDrop.js:16` | `\.(jpe?g|png|webp)$` | 同上，扩展名双重硬编码 | 🟡 |
| `processing.js:70` | `Math.min(requested, 4)` | 最大并发 4 硬编码——应引用 `ENGINE_LIMITS.MAX_CONCURRENCY` | 🟠 |
| `processing.js:72` | `queue.length > 8 ? 1 : 2` | 队列长度阈值 8 硬编码 | 🟡 |
| `processing.js:131` | `unwatermarked_${stem}.png` | 输出文件名前缀硬编码 | ⚪ |
| `processing.js:165` | `30000` (URL.revokeObjectURL 延迟) | 魔法数 | ⚪ |
| `ui.js:15` | `MAX_AUDIT_ENTRIES = 100` | 日志上限硬编码 | ⚪ |
| `ui.js:65` | `duration = 4000` (toast 默认时长) | 合理默认 | ⚪ |
| `keyboard.js:20` | `['fast', 'balanced', 'thorough']` | 预设列表硬编码——应从 `PERFORMANCE_PRESETS` 导入 | 🟡 |
| `manualSelection.js:9` | `ZOOM = 3` | 放大倍数硬编码（但 magnifier.js 是死代码，不影响） | ⚪ |
| `settings.js:19` | `'gwr_pro_settings'` | localStorage key 硬编码——分散在 saveSettings/loadSettings | 🟡 |
| `settings.js:222` | `'gwr_dark_mode'` | 同上，key 硬编码 | 🟡 |
| `index.html:191` | `min="0.05" max="0.80" step="0.01" value="0.18"` | 滑块范围硬编码——与 `DETECTION_THRESHOLDS` 不同步 | 🟠 |
| `index.html:199` | `min="0.10" max="0.90" step="0.01" value="0.30"` | 同上——梯度惩罚滑块范围硬编码 | 🟠 |

### 2.2 灵活性评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 阈值灵活性 | 7/10 | 滑块可调，但范围硬编码，与 config.js 可能漂移 |
| 预设灵活性 | 9/10 | 三档预设 + 用户覆盖，设计良好 |
| 格式灵活性 | 5/10 | 仅 JPG/PNG/WebP，无 AVIF/HEIC/GIF 支持 |
| 并发灵活性 | 6/10 | 硬编码上限 4，未引用 `ENGINE_LIMITS.MAX_CONCURRENCY` |
| i18n 灵活性 | 9/10 | 7 语言全覆盖，fallback 完善 |
| 主题灵活性 | 8/10 | 三态暗色模式 + profile 主题色，但无用户自定义色 |

### 2.3 关键建议

1. **滑块范围从 config.js 注入**：`syncSliderDefaults()`（app.js:33-48）已同步默认值，但 min/max 仍硬编码在 HTML。应在 init 时从 `DETECTION_THRESHOLDS` 设置滑块 min/max
2. **并发上限引用常量**：`processing.js:70` 改为 `Math.min(requested, ENGINE_LIMITS.MAX_CONCURRENCY)`
3. **预设列表从 config 导入**：`keyboard.js:20` 改为 `Object.keys(PERFORMANCE_PRESETS)`
4. **localStorage key 集中管理**：新建 `const STORAGE_KEYS = { SETTINGS: 'gwr_pro_settings', DARK_MODE: 'gwr_dark_mode' }`

---

## 维度 3：界面的直观度与使用者体验性

### 3.1 优点 ✅

| 特性 | 评价 |
|------|------|
| 首屏视觉 | 玻璃拟态 + 翠绿渐变 + 星形 logo，品牌一致性强 |
| 拖拽体验 | 全窗口拖拽 + 半透明覆盖层 + 弹跳动画，反馈清晰 |
| 处理反馈 | 扫描线动画（scanner-effect）+ 进度条 + toast 通知 |
| 批量网格 | 响应式 1/2/3 列，卡片 hover 上浮 + 边框发光 |
| 对比功能 | Compare 徽章点击切换前后图，简洁直觉 |
| 暗色模式 | 三态循环（auto/dark/light），自动跟随系统 |
| 键盘快捷键 | 1/2/3 快速切换，Esc 重置，Ctrl+S 下载 |
| 审计控制台 | 可折叠，CSV 导出，日志着色 |
| a11y | focus-visible ring、aria-label、lang 同步 |

### 3.2 问题 ❌

| 问题 | 位置 | 影响 | 严重度 |
|------|------|------|--------|
| **高级面板默认隐藏** | index.html:150 `hidden` | 新用户不知道有性能预设/手动模式——核心功能不可发现 | 🟠 |
| **DeepScan/NoiseReduction 徽章无 tooltip** | index.html:112-124 | 用户不理解"为什么不能点击"——需解释"由预设控制" | 🟡 |
| **手动模式在高级面板内** | index.html:203-294 | 手动选择是常用功能却藏在 3 层折叠下（高级按钮→面板→手动开关） | 🟡 |
| **无拖拽提示动画** | uploadArea | 拖拽时只有覆盖层，无"松开即可上传"的文字提示 | ⚪ |
| **卡片无置信度显示** | dragDrop.js:87 `meta.textContent` | 用户无法判断检测质量——confidence 数据已有但未显示 | 🟠 |
| **无检测结果详情** | 卡片 | 不显示检测到的水印位置/尺寸/tier——用户无法验证 | 🟡 |
| **footer 链接 `terms.html` 不存在** | index.html:336 | 点击 404 | 🟠 |
| **版本号显示 `v-`** | index.html:333 | 加载前显示 `v-`，加载后 `v2.6.0`——无骨架屏过渡 | ⚪ |
| **快捷键提示固定在左下角** | index.html:367 | 移动端隐藏（`hidden md:flex`），桌面端可能与审计控制台重叠 | ⚪ |
| **loading overlay 无进度** | index.html:374-388 | 只显示 spinner + "INITIALIZING"，无引擎加载步骤 | ⚪ |
| **无错误恢复指引** | app.js:174 `showLoadingFail` | 引擎加载失败只显示错误，无"检查 Node 版本/重新构建"指引 | 🟡 |

### 3.3 体验性评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 首屏直觉度 | 8/10 | 拖拽区+按钮清晰，但高级功能隐藏 |
| 操作流畅度 | 8/10 | 动画流畅，但批量处理时无单图进度 |
| 反馈及时性 | 7/10 | toast/审计日志好，但卡片缺置信度 |
| 错误处理 | 6/10 | 错误显示但恢复指引不足 |
| 可发现性 | 6/10 | 核心功能（预设/手动）藏在折叠面板 |
| 无障碍 | 7/10 | aria-label 有，但部分动态元素缺 |
| **综合 UX** | **7.4/10** | 视觉优秀，信息透明度待提升 |

---

## 维度 4：重要 BUG

### 🔴 Critical（运行时错误）

#### FE-BUG-C1：`reprocessBtn` 引用不存在的 DOM 元素

**文件**: `src/app.js:81, 301-334`

```javascript
// app.js:81 — elements 对象注册了 reprocessBtn
reprocessBtn: document.getElementById('reprocessBtn')

// app.js:301 — 事件监听器绑定到 null
elements.reprocessBtn?.addEventListener('click', async () => { ... });

// app.js:312 — 运行时访问 null 的属性
elements.reprocessBtn.setAttribute('disabled', 'true');  // ← 如果 reprocessBtn 是 null，这里会抛 TypeError
```

**证据**: `grep "reprocessBtn" public/index.html` → **无匹配**。`#reprocessBtn` 在 index.html 中不存在。

**影响**: `elements.reprocessBtn` 是 `null`。`?.addEventListener` 被保护了，但 line 312 `elements.reprocessBtn.setAttribute` **没有用 `?.`**——如果用户触发了某个流程走到这里会抛 TypeError。但实际上由于 reprocessBtn 不存在，事件监听器从未绑定，所以这段代码**永远不会执行**——是死代码。

**根因**: v2.6 删除了 `#singlePreview` section（含 reprocessBtn），但 app.js 中的事件绑定和 elements 注册未清理。

#### FE-BUG-C2：`resultContainer` 引用不存在的 DOM 元素

**文件**: `src/app.js:314, 329, 410, 424`

```javascript
document.getElementById('resultContainer')?.classList.add('scan-active');
```

**证据**: `grep "resultContainer" public/index.html` → **无匹配**。

**影响**: `getElementById('resultContainer')` 返回 `null`。`?.` 链保护了运行时，但 `scan-active` 类永远不会被添加——**扫描线动画在重新处理时不触发**。这是功能退化。

### 🟠 High

#### FE-BUG-H1：`manualSelectionLayer` 和 `comparisonSlider` 引用不存在的 DOM

**文件**: `src/app/manualSelection.js:72-73`

```javascript
export function setManualSelectionEnabled(elements, enabled) {
    elements.manualSelectionLayer?.classList.toggle('hidden', !enabled);
    elements.comparisonSlider?.classList.toggle('manual-select-active', enabled);
}
```

**证据**: `grep "manualSelectionLayer\|comparisonSlider" public/index.html` → **无匹配**。

**影响**: `elements.manualSelectionLayer` 和 `elements.comparisonSlider` 都是 `undefined`（app.js elements 对象未注册它们）。`?.` 保护了运行时，但 `manual-select-active` CSS 类（tailwind.css:130-137）永远不会被应用——手动模式的十字光标样式不生效。

#### FE-BUG-H2：`magnifier.js` 整文件是死代码

**文件**: `src/app/magnifier.js`（44 行）

**证据**: 
- `grep "magnifier" src/app.js` → 无 import 语句
- `grep "setupMagnifier" src/` → 无调用
- 文件引用 `elements.comparisonSlider` 和 `elements.magnifierLens`，两者在 DOM 和 elements 对象中都不存在

**影响**: 文件被 esbuild 打包但永远不会执行。增加 bundle 体积约 1KB。

#### FE-BUG-H3：`footer terms.html` 链接 404

**文件**: `public/index.html:336`

```html
<a href="terms.html" ...>Terms</a>
```

**证据**: 项目中无 `terms.html` 文件。

**影响**: 用户点击"Terms"链接得到 404。

### 🟡 Medium

#### FE-BUG-M1：滑块 min/max 硬编码与 config.js 不同步

**文件**: `public/index.html:191, 199`

```html
<!-- 阈值滑块 -->
<input type="range" id="thresholdSlider" min="0.05" max="0.80" step="0.01" value="0.18">
<!-- 梯度惩罚滑块 -->
<input type="range" id="penaltySlider" min="0.10" max="0.90" step="0.01" value="0.30">
```

**问题**: `syncSliderDefaults()`（app.js:33-48）只同步 `value`，不同步 `min`/`max`。如果 `DETECTION_THRESHOLDS` 的值超出 HTML 范围，滑块会钳制值。

#### FE-BUG-M2：`processing.js:70` 并发上限硬编码 4，未引用 ENGINE_LIMITS

**文件**: `src/app/processing.js:70`

```javascript
if (Number.isInteger(requested) && requested > 0) return Math.min(requested, 4);
```

**问题**: `ENGINE_LIMITS.MAX_CONCURRENCY = 4`（config.js:7）存在但未被引用。修改常量不会生效。

#### FE-BUG-M3：`keyboard.js:20` 预设列表硬编码

**文件**: `src/app/keyboard.js:20`

```javascript
const presets = ['fast', 'balanced', 'thorough'];
```

**问题**: 应从 `PERFORMANCE_PRESETS` 导入 `Object.keys()`。新增预设时快捷键循环不会自动包含。

### ⚪ Low

| ID | 文件:行 | 描述 |
|----|---------|------|
| FE-BUG-L1 | `tailwind.css:73-137` | `.comparison-slider` 相关 CSS（65 行）对应已删除的 DOM，是死 CSS |
| FE-BUG-L2 | `tailwind.css:176-189` | `.magnifier-lens` CSS（14 行）对应已删除的 DOM，是死 CSS |
| FE-BUG-L3 | `app.js:79-80` | `manualSelectionLayer` 和 `manualSelectionBox` 在 elements 对象注册但 DOM 中不存在 |
| FE-BUG-L4 | `app.js:504` | `elements.multiPreview.style.display = 'none'` 无 null 检查（multiPreview 存在但防御性不足） |

### BUG 检验方法

| BUG | 检验方法 |
|-----|---------|
| FE-BUG-C1 | `node -e "const {JSDOM}=require('jsdom');..."` 或浏览器 DevTools 控制台执行 `document.getElementById('reprocessBtn')` → 应返回 null |
| FE-BUG-C2 | 同上，`document.getElementById('resultContainer')` → null |
| FE-BUG-H1 | `document.getElementById('manualSelectionLayer')` → null |
| FE-BUG-H2 | `grep -r "setupMagnifier" src/` → 无结果 |
| FE-BUG-H3 | 访问 `terms.html` → 404 |
| FE-BUG-M1 | 在 config.js 改 `DEFAULT_PROBE_THRESHOLD = 0.95`，刷新页面 → 滑块显示 0.80（被 HTML max 钳制） |
| FE-BUG-M2 | 在 config.js 改 `MAX_CONCURRENCY = 8`，批量处理 → 仍最多 4 并发 |

---

## 维度 5：布局问题与网页错误

### 5.1 布局问题

| 问题 | 位置 | 影响 | 严重度 |
|------|------|------|--------|
| **控制面板在窄屏下挤压** | index.html:90-147 | `flex-wrap` + 多元素，<520px 时换行混乱 | 🟡 |
| **高级面板内手动坐标网格在窄屏下不友好** | index.html:213 `grid-cols-2` | 手机端 2 列坐标输入太窄 | 🟡 |
| **性能预设三列在窄屏下不变为单列** | index.html:160 `grid-cols-3` | 手机端三个单选按钮挤压 | ⚪ |
| **卡片网格在中等屏幕下 2 列间距过大** | index.html:319 `md:grid-cols-2 lg:grid-cols-3` | 768-1023px 时 2 列卡片间距 24px 偏大 | ⚪ |
| **footer py-20 间距过大** | index.html:324 | 移动端 footer 上下间距 80px 过多 | ⚪ |
| **审计控制台和快捷键提示在底部可能重叠** | index.html:355+367 | 两者都 `fixed bottom-6`，左右分布但小屏可能重叠 | ⚪ |
| **loading overlay 覆盖全屏但无取消** | index.html:375 | 加载中用户无法操作（有 retry 按钮但仅在失败后显示） | ⚪ |

### 5.2 网页错误

| 错误 | 位置 | 描述 |
|------|------|------|
| **`terms.html` 404** | index.html:336 | 链接目标不存在 |
| **`<html lang="en">` 初始值与 i18n 不同步** | index.html:2 | 硬编码 `en`，i18n.init() 后才更新为实际 locale——搜索引擎爬虫看到的是 `en` |
| **`<script>` 内联 document.write** | index.html:15 | `document.write` 被 CSP 策略禁止时失效；现代浏览器已不推荐 |
| **`onerror` 内联 HTML 注入** | index.html:399 | `insertAdjacentHTML` 注入未转义的 HTML——如果错误消息含 `<script>` 会被执行（XSS 风险低但存在） |
| **`script.onerror` 回调内 `<code>` 标签** | index.html:399 | 提示文本含 `<code>pnpm build</code>`——非 i18n，硬编码英文 |
| **`<input webkitdirectory directory>`** | index.html:72 | 非标准属性，仅 Chrome/Edge 支持——Safari/Firefox 无文件夹选择 |
| **`<select id="langSelect">` 无 `<option>`** | index.html:44-46 | 初始无选项，JS 加载前显示空下拉——有 FOUC 风险 |

### 5.3 响应式评价

| 断点 | 布局 | 问题 |
|------|------|------|
| <520px | 控制面板换行、手动坐标 2 列太窄 | 🟡 功能可用但拥挤 |
| 520-768px | 控制面板 3 列徽章、卡片 1 列 | ✅ 合理 |
| 768-1024px | 卡片 2 列、间距 24px | ⚪ 间距偏大 |
| 1024-1280px | 卡片 3 列 | ✅ 最佳 |
| >1280px | max-w-4xl 限制主区域宽度 | ✅ 合理 |
| >1536px | nav 链接显示、内容居中 | ✅ 合理 |

---

## 修复优先级

| 优先级 | BUG | 修复动作 | 风险 |
|--------|-----|---------|------|
| 🔴 立即 | FE-BUG-C1+C2 | 删除 app.js 中 reprocessBtn/resultContainer 死代码 | 低 |
| 🔴 立即 | FE-BUG-H2 | 删除 magnifier.js + 死 CSS | 低 |
| 🟠 本轮 | FE-BUG-H1 | 清理 manualSelection.js 死引用 | 低 |
| 🟠 本轮 | FE-BUG-H3 | 修复/删除 terms.html 链接 | 低 |
| 🟡 后续 | FE-BUG-M1 | 滑块 min/max 从 config 注入 | 中 |
| 🟡 后续 | FE-BUG-M2 | 并发上限引用 ENGINE_LIMITS | 低 |
| 🟡 后续 | FE-BUG-M3 | 预设列表从 PERFORMANCE_PRESETS 导入 | 低 |
| ⚪ 后续 | FE-BUG-L1+L2 | 删除死 CSS | 低 |

---

*报告结束 — 2026-06-19 前端 5 维度审计*
