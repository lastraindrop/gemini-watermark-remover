# Gemini Watermark Remover - 路线图

## 当前状态

- **版本**: v2.2.0
- **验证基线**: `npm test` 421/421 通过, `npm run lint` 0 errors 0 warnings, `npm run build` clean, Python bridge pass
- **当前重点**: 独立 fork 产品化、维持高召回低误报、多端参数一致化
- **架构**: 六层检测管线 (Catalog → Scaled → Heuristic → Adaptive → Global → Decision)

## 已完成事项 (v2.2.0)

### 诊断与基础修复
- Registry 目录匹配容差 1.5% → 5%，覆盖常见截图/缩放场景
- `standardMargins` 清理为标准值 [32, 64, 96]
- 初始模板比较: `resolveBestTemplateOrder()` 在探测前动态选择 48px/96px 最优模板

### 检测引擎重大升级
- **3D 多维评分**: spatial NCC (0.5) + gradient NCC (0.3) + variance (0.2)，替代原单维 NCC
- **自适应检测器**: `adaptiveDetector.js` — 粗到细多尺度搜索，Top-K 候选 + 精细 2px 步进搜索
- **模板插值与变形**: `interpolateAlphaMap()` + `warpAlphaMap()` 支持非标准尺寸和亚像素对齐

### 移除质量增强
- **多遍移除**: `multiPassRemoval.js` — 带近黑/纹理安全检查的迭代移除
- **Alpha 增益校准**: `alphaCalibration.js` — 14 档粗搜索 + 精细调整找最优增益
- **亚像素精炼**: `refineSubpixelOutline()` — 27 种位移×缩放×增益组合搜索

### 决策与可解释性
- **分层决策策略**: `decisionPolicy.js` — `direct-match` / `needs-validation` / `insufficient` 三级
- 每个检测结果附带 `decisionTier` 和 `reason` 字段

### BUG 修复
- Python pipe 命令补全 `"remove"` 关键字
- Worker 超时自适应化
- `probeThreshold` 计算简化
- auto profile 并发修复
- `removeWatermark()` alphaGain 静默忽略修复 (CRITICAL)

### 测试体系
- 新增 36 个专项测试，总测试数 **369 → 421**
- 诊断基线测试覆盖 7 类 18 个场景

## 短期计划 (v2.3 规划)

1. 将多遍移除 + Alpha 校准扩展到 doubao 和其他非 gemini profile
2. 实现边缘残余清理（blend-based，预览锚点专用）
3. WASM 加速 NCC 和 Sobel 梯度计算，降低 4K 图像处理时间
4. 补齐 CLI pipe 模式的端到端集成测试

## 中期计划

1. 频率域假阳性防御机制 (Spectral Analysis)
2. 为 DALL-E 3 profile 准备真实 alphaMap 资产
3. 统一 Web/CLI Engine: 抽象 AssetLoader 接口
4. 智能参数自适应：根据图像熵值 (Entropy) 自动微调检测阈值

## 长期计划

1. 维护可回归、可解释、可验证的纯数学去水印基准
2. 产品化增强：Chrome 扩展、Page 集成、SDK 发布
3. 持续扩充真实样本库，优先覆盖复杂背景和轻微缩放导出

## 已修复的 BUG 汇总 (v2.2 维护版本)

| 编号 | 问题描述 | 位置 | 修复状态 |
|------|---------|------|---------|
| BUG-01 | 缺少初始模板比较 (48px/96px) | `detectionPipeline.js` | ✅ 修复 |
| BUG-02 | 梯度惩罚过于激进 | 原有代码 (3D评分替代) | ✅ 已替代 |
| BUG-04 | Registry 匹配容差过严 (1.5%) | `registry.js:54` | ✅ 放宽至 5% |
| BUG-06 | `standardMargins` 含非标准值 | `detector.js:251` | ✅ 清理 |
| BUG-08 | Python pipe 缺少 `remove` 命令 | `remover.py:101` | ✅ 修复 |
| BUG-09 | Worker 超时固定 5s | `watermarkEngine.js` | ✅ 自适应 |
| BUG-10 | `_lastVar` 死代码 | `detector.js` | ✅ 移除 |
| BUG-11 | `probeThreshold` 比例换算不直观 | `app.js:572` | ✅ 简化 |
| BUG-12 | auto profile 并发限制过严 | `processing.js:67` | ✅ 1→2 |
| BUG-13 | Python pipe 模式路径缺失 | `remover.py:100` | ✅ 修复 |
| ISSUE-1 | `removeWatermark()` 缺少 alphaGain 参数 | `blendModes.js:62` | ✅ 修复 |

## 验证命令

```bash
npm run lint          # 0 errors, 0 warnings
npm test              # 421/421 passing
npm run build         # clean
npm run test:legacy   # maintained legacy smoke regressions
npm run test:python   # Python bridge
```
