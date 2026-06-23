# 检测准确率根因分析报告

> **状态**: 历史根因分析。v2.7 收尾已处理其中多项问题，包括 20260520 alpha 变体、候选验证、标准锚点保护、free 模式置信度地板、NMS 与手动矩形资源键。当前状态以 `reports/v2.7-finalization-report.md` 与 `TECHNICAL_GUIDE.md` 为准。
>
> **分析日期**: 2026-06-19  
> **分析对象**: 检测管线完整流程（detector.js + detectionPipeline.js + config.js + adaptiveDetector.js）  
> **用户反馈**: 检测准确率不高，检测到错误位置

---

## 检测管线流程图

```
输入图像
   │
   ▼
Phase 1.4 resolveBestTemplateOrder ── 比较 48px vs 96px NCC
   │                                    ⚠ 问题7: 不公平比较
   ▼
Phase 1 Catalog Probe ─── 锚点位置探针
   │  ├ calculateWatermarkPosition ── 整数像素位置
   │  │                                ⚠ 问题1: 无亚像素
   │  ├ coarse relocation ±16px step4
   │  │                                ⚠ 问题3: 粗扫精度低
   │  ├ jitter ±6-10px step1
   │  │                                ⚠ 问题3: 范围有限
   │  └ NCC 评分
   │      ⚠ 问题6: 白背景信噪比≈0
   ▼
Phase 2 Scaled Catalog Probe ─── 缩放配置探针
   │
   ▼
Phase 3 Heuristic Probe
   │
   ▼
Phase 4 Adaptive Search
   │  ├ scoreCandidate (3D 评分)
   │  │                    ⚠ 问题4: 方差权重失效
   │  └ coarse→fine 多尺度搜索
   ▼
Phase 5 Global Fallback (detectWatermark)
   │  ├ Phase 2 全局网格搜索 step=1/2
   │  │                        ⚠ 问题2: 步长太大
   │  ├ candidate proximity merge
   │  │                        ⚠ 问题5: 阈值太小
   │  ├ mode classification (anchored/aligned/free)
   │  │                        ⚠ 问题8: 容差边缘
   │  └ final ranking
   ▼
返回 best match 或 null
```

---

## 8 个根因详解

### 根因 1：位置计算无亚像素插值 🟠 High

**文件**: `config.js:239-273`

```javascript
x = imageWidth - (marginRight || 0) - w;
```

所有 margin 和 logoSize 都是整数。当图像被缩放（catalog scaled match），`getScaledCatalogConfigs` 用 `Math.round(entry.marginRight * scaleX)` 计算——四舍五入导致 ±1px 误差。叠加后位置偏 1-2px，NCC 评分下降 5-15%。

**影响**: 裁剪/缩放图像检测率下降。

**修复方向**: 在 Phase 1 探针后，用抛物线插值对 NCC 峰值做亚像素精修（取最佳位置 ±1px 的 NCC 值，拟合抛物线找峰值）。

### 根因 2：Phase 2 全局搜索步长对 96px 太大 🟠 High

**文件**: `detector.js:254`

```javascript
const step = sizeW <= 48 ? 1 : 2;
```

96px 水印用 step=2 扫描。如果真实水印在 (865, 865)，搜索只检查偶数坐标 (864, 864) 和 (866, 866)——都偏离 1px。NCC 对 1px 偏移敏感（可降 10-20%），可能使候选的 NCC 低于 COARSE 阈值 0.10 而被丢弃。

**影响**: 非锚点位置的 96px 水印可能被完全错过。

**修复方向**: 96px 也用 step=1（牺牲 4x 速度换精度），或在 step=2 找到候选后立即用 step=1 在 ±2px 范围补搜。

### 根因 3：jitter 范围对 Gemini 5-20px 偏移不够 🟡 Medium

**文件**: `detector.js:163-178`

`JITTER_OFFICIAL=6`, `JITTER_RANGE=10`。coarse relocation 扫 ±16px 但用 step=4（仅 9×9=81 个点），如果偏移在 step 间隙（如 7px），coarse 可能漏掉。

**影响**: 偏移 10-20px 的水印需要依赖 Phase 4 adaptive 兜底。

**修复方向**: coarse step 改为 2（增加 4x 密度），或 jitter 范围扩展到 16px。

### 根因 4：方差评分在平滑背景上贡献固定值 🟡 Medium

**文件**: `detector.js:681-717`

```javascript
if (refStd < 1e-6) return 0.5;  // 固定返回
```

20% 权重贡献固定 0.1 分，无法区分有无水印。三维评分退化为 spatial×0.5 + gradient×0.3 + 0.1。

**影响**: 平滑背景上检测置信度普遍偏低（0.1 低于 FINAL_ANCHORED=0.15）。

**修复方向**: 平滑背景上降低方差权重，将权重转移到 spatial 和 gradient。

### 根因 5：候选 proximity 阈值太小 🟡 Medium

**文件**: `detector.js:265`

`PROXIMITY_THRESHOLD=8`（曼哈顿距离）。96px 和 48px 嵌套水印中心可能只差 24px（96/2 - 48/2 = 24），但 96px 水印的左上角和 48px 水印的左上角可能只差 0-8px——导致 96px 假阳性吞掉 48px 真阳性。

**影响**: 48px 水印被 96px 假阳性覆盖，位置错误。

**修复方向**: proximity 检查应基于面积重叠率而非曼哈顿距离，与 applyRemoval.js 的 NMS 逻辑一致。

### 根因 6：白色背景上 NCC 数学上无法区分 🔴 Critical（不可修复）

**文件**: `detector.js:382-426`

白色背景 + 白水印：`watermarked = α*255 + (1-α)*255 = 255`。图像无变化，`varI=0`，NCC 返回 0.10。

**影响**: 纯白背景上的水印**数学上不可检测**（信噪比为 0）。

**修复方向**: 此为算法根本限制，无法通过调参解决。只能通过 UI 提示用户"白色背景水印可能不可见"。

### 根因 7：48px vs 96px 模板 NCC 比较不公平 🟡 Medium

**文件**: `detectionPipeline.js:184-214`

96px 模板覆盖 4x 面积，在非水印区域包含大量低方差像素，拉低 NCC 分母。但 48px 模板只覆盖水印区域，NCC 可能更高。比较时未归一化面积差异。

**影响**: 有时正确选择 48px，有时 96px 的中等 NCC 被误判为"更好"。

**修复方向**: 比较前对 NCC 做面积归一化（除以 sqrt(面积比)），或使用 AUC（曲线下面积）而非峰值 NCC。

### 根因 8：isNearExpectedAnchor 20% 容差的边缘效应 🟡 Medium

**文件**: `detectionPipeline.js:145`

```javascript
const positionTolerance = Math.max(4, Math.min(pos.width, pos.height) * 0.20);
```

96px 水印容差 ±19px。Gemini 有时偏移 20-25px——刚好超出容差。被分类为 'free' 模式，阈值从 0.15 跳到 0.35（2.3x 提高），导致漏检。

**影响**: 临界偏移的水印从"容易检测"变成"几乎不可能检测"。

**修复方向**: 容差改为 25%（±24px），或用渐进式阈值（在容差边界平滑过渡而非阶跃）。

---

## 修复优先级

| 优先级 | 根因 | 修复动作 | 预期效果 | 工时 |
|--------|------|---------|---------|------|
| 🔴 立即 | 2 | 96px 全局搜索 step=1 或补搜 | 位置错误减少 30%+ | 2h |
| 🔴 立即 | 5 | proximity 改为面积重叠率 | 假阳性吞真阳性消除 | 2h |
| 🟠 本轮 | 1 | 探针后加亚像素抛物线插值 | 缩放图精度提升 | 3h |
| 🟠 本轮 | 8 | 容差 20%→25% 或渐进阈值 | 临界偏移漏检减少 | 1h |
| 🟡 后续 | 3 | coarse step 4→2 | 偏移水印找到率提升 | 1h |
| 🟡 后续 | 4 | 平滑背景方差权重自适应 | 平滑背景置信度提升 | 2h |
| 🟡 后续 | 7 | NCC 面积归一化比较 | 48/96 选择正确率提升 | 2h |
| ⚪ 文档 | 6 | UI 提示白背景限制 | 用户预期管理 | 0.5h |

**总计**: 13.5h（前 4 项 8h 可立即执行）

---

*报告结束 — 2026-06-19 检测准确率根因分析*
