# Gemini Watermark Remover - 路线图

## 当前状态

- **版本**: v2.2.0
- **验证基线**: `pnpm test` 465/465 通过, `pnpm lint` 0 errors, `pnpm build` clean (静态 Tailwind CSS, 零外部CDN), Python bridge pass
- **当前重点**: 代码去重与一致性、前端性能优化、文档同步 ✅ 已完成
- **架构**: 六层检测管线 (Catalog → Scaled → Heuristic → Adaptive → Global → Decision) + 共享工具层

## 已完成事项 (v2.2.0 发布版)

### 诊断与基础修复
- Registry 目录匹配容差 1.5% → 5%，覆盖常见截图/缩放场景
- `standardMargins` 清理为标准值 [32, 64, 96]
- 初始模板比较: `resolveBestTemplateOrder()` 在探测前动态选择 48px/96px 最优模板

### 检测引擎重大升级
- **3D 多维评分**: spatial NCC (0.5) + gradient NCC (0.3) + variance (0.2)，替代原单维 NCC
- **自适应检测器**: `adaptiveDetector.js` — 粗到细多尺度搜索，Top-K 候选 + 精细 2px 步进搜索
- **模板插值与变形**: `interpolateAlphaMap()` + `warpAlphaMap()` 支持非标准尺寸和亚像素对齐

### 移除质量增强
- **多遍移除**: `multiPassRemoval.js` — 带近黑/纹理安全检查的迭代移除（梯度差已实际计算）
- **Alpha 增益校准**: `alphaCalibration.js` — 14 档粗搜索 + 精细调整找最优增益（支持矩形水印）
- **亚像素精炼**: `refineSubpixelOutline()` — 27 种位移×缩放×增益组合搜索

### 决策与可解释性
- **分层决策策略**: `decisionPolicy.js` — `direct-match` / `needs-validation` / `insufficient` 三级

### 代码质量与架构 (Sprint 1-4)
- 提取共享工具 `core/utils.js` (cloneImageData, calculateNearBlackRatio, regionStdDev)
- 消除 4 个文件中的代码重复 (~120 行)
- `app.js` 拆分 (730行 → 286行入口 + 6 个子模块)
- CLI Engine 添加多遍移除 + Alpha 校准路径
- advanced panel `overrides` 正确传递到检测管线
- 前端: Tailwind CDN → 静态 CSS 构建 (32KB, 零外部 CDN, 零 Google Fonts 依赖) ✅ 已完成
- 前端: 系统字体栈 (PingFang SC, Microsoft YaHei, Segoe UI) 替代 Google Fonts
- 前端: 全局拖拽遮罩 + 错误处理 + mesh-blob GPU 优化 ✅ 已完成
- 前端: thresholdSlider 默认值统一 0.18, loadingOverlay flex 修复, statsView 列数修复 ✅ 已完成
- 前端: 容错资源加载 (自动回退 dist/ 路径, Worker URL 回退, loadingOverlay 超时兜底) ✅ 已完成
- 前端: Service Worker 升级 v2.2.1 (network-first 策略, 旧缓存自动注销) ✅ 已完成
- 根目录 index.html 自动跳转至 dist/index.html ✅ 已完成

### 测试体系
- 新增 96 个测试 (原文369 → 465)
- 新增健壮性边界测试 (26 用例), 多遍次回归测试 (5 用例)

### BUG 修复 (v2.2 维护版本)
| 编号 | 问题描述 | 位置 | 修复状态 |
|------|---------|------|---------|
| BUG-01 | 缺少初始模板比较 (48px/96px) | `detectionPipeline.js` | ✅ 修复 |
| BUG-02 | 梯度惩罚过于激进 | 原有代码 (3D评分替代) | ✅ 已替代 |
| BUG-04 | Registry 匹配容差过严 (1.5%) | `registry.js:54` | ✅ 放宽至 5% |
| BUG-06 | `standardMargins` 含非标准值 | `detector.js` | ✅ 清理 |
| BUG-08 | Python pipe 缺少 `remove` 命令 | `remover.py` | ✅ 修复 |
| BUG-09 | Worker 超时固定 5s | `watermarkEngine.js` | ✅ 自适应 |
| BUG-10 | 死代码清理 | `detector.js` | ✅ 移除 |
| BUG-11 | `probeThreshold` 比例换算不直观 | `app.js` | ✅ 简化 |
| BUG-12 | auto profile 并发限制过严 | `processing.js` | ✅ 1→2 |
| BUG-13 | Python pipe 模式路径缺失 | `remover.py` | ✅ 修复 |
| ISSUE-1 | `removeWatermark()` 缺少 alphaGain 参数 | `blendModes.js` | ✅ 修复 |
| **BUG-2** | alphaCalibration 仅支持正方形水印 | `alphaCalibration.js` | ✅ 修复 (sizeW/sizeH) |
| **BUG-5** | detect.js 缩进不一致 | `detector.js:471-525` | ✅ 修复 |
| **BUG-6** | gradientDelta 硬编码为 0 | `multiPassRemoval.js:144` | ✅ 实现真实梯度差 |
| **BUG-7** | app.js overrides 未传递 | `app/settings.js` | ✅ 修复 |
| **BUG-4** | CLI Engine 缺少多遍次移除 | `gwrRemoveCommand.js` | ✅ 修复 |
| F1 | thresholdSlider HTML 默认值不一致 | `index.html` | ✅ 0.25→0.18 |
| F2 | memoryCount 元素缺失 | `index.html + state.js` | ✅ 修复 |
| F3 | statsView 列数错误 (5→4) | `index.html` | ✅ 修复 |
| F8 | loadingOverlay flex 类缺失 | `index.html` | ✅ 修复 |
| F4 | Google Fonts @import 阻塞 | `index.html + index.css` | ✅ 修复 |

## 短期计划 (v2.3 规划)

1. 将多遍移除 + Alpha 校准扩展到 doubao 和其他非 gemini profile
2. 实现边缘残余清理（blend-based，预览锚点专用）
3. WASM 加速 NCC 和 Sobel 梯度计算，降低 4K 图像处理时间
4. 补齐 CLI pipe 模式的端到端集成测试
5. 实现真正的 SSIM 计算替换 PSNR 估算
6. 增强 userscript（预览替换、copy/download 拦截）

## 中期计划

1. 频率域假阳性防御机制 (Spectral Analysis)
2. 为 DALL-E 3 profile 准备真实 alphaMap 资产
3. 统一 Web/CLI Engine: 抽象 AssetLoader 接口
4. 智能参数自适应：根据图像熵值 (Entropy) 自动微调检测阈值
5. Chrome 扩展实现

## 长期计划

1. 维护可回归、可解释、可验证的纯数学去水印基准
2. 产品化增强：Chrome 扩展、Page 集成、SDK 发布
3. 持续扩充真实样本库，优先覆盖复杂背景和轻微缩放导出

## 验证命令

```bash
pnpm lint                  # 0 errors, 0 warnings
pnpm test                  # 465/465 passing
pnpm build                 # clean (static Tailwind CSS)
pnpm test:legacy           # maintained legacy smoke regressions
pnpm test:python           # Python bridge
```
