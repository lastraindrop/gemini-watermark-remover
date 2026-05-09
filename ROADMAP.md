# Gemini Watermark Remover - 路线图

## 当前状态

- **版本**: v1.9.9
- **验证基线**: `npm test` 271/271 通过, `npm run lint` clean, `npm run build` clean
- **当前重点**: 检测召回率与误报率平衡、文档一致化、长期可维护性
- **架构**: Web / CLI / Python 共享同一套 profile、catalog、detector 和 pipeline

## 已完成事项

- Gemini 与 Doubao 的 profile/catalog 对齐
- 共享检测决策管线 `detectionPipeline.js` 落地
- 前端拖拽上传、语言显示、批量 ZIP 下载修复
- 弱水印与复杂背景的召回增强（DEFAULT_GLOBAL_FALLBACK_THRESHOLD 0.25）
- 假阳性防御：梯度滤波（gradientConf<0.05 → ×0.25），三处统一
- 位置锚点容差收紧（isNearExpectedAnchor 20%→5%）
- 回归测试与产品审计测试补齐（271 测试）
- 技术文档完善（TECHNICAL_GUIDE.md）

## 短期计划

1. 继续扩充真实 Gemini 负样本（复杂纹理无水印）和弱水印样本。
2. 持续监控误报边界，必要时微调梯度滤波阈值。
3. 保持 Web/CLI/Python 的参数一致性文档。
4. 保持前端体验稳定，避免回归。

## 中期计划

1. 把更多候选排序策略从 `detector.js` 拆到更清晰的策略层。
2. 扩充真实样本库，让 catalog 与 heuristic 更贴近实际导出场景。
3. 让测试矩阵继续覆盖新的 profile 和新的尺寸族。

## 长期计划

1. 如有必要，考虑性能层面的更深优化（WebAssembly 加速 NCC）。
2. 保持纯客户端优先，不把核心能力迁移到后端。
3. 维护可回归、可解释、可验证的检测策略。
