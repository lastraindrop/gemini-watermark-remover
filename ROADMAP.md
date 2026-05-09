# Gemini Watermark Remover - Roadmap

## 当前状态

- 版本：v1.9.9
- 当前验证：`npm test` 271/271 通过
- 当前重点：Web 交互稳定性、检测召回、文档一致化
- 当前架构：Web / CLI / Python 共享同一套 profile、catalog、detector 和 pipeline

## 已完成事项

- Gemini 与 Doubao 的 profile/catalog 对齐
- 共享检测决策管线落地
- 前端拖拽上传、语言显示、批量 ZIP 下载修复
- 弱水印与复杂背景的召回增强
- 回归测试与产品审计测试补齐

## 短期计划

1. 继续扩充 Gemini 复杂背景负样本和弱水印样本。
2. 继续收紧全局回退条件，降低复杂纹理误报。
3. 持续整理 Web/CLI/Python 的参数说明与示例。
4. 保持前端体验稳定，避免重新引入批量下载和拖拽问题。

## 中期计划

1. 把更多候选排序策略从 `detector.js` 拆到更清晰的策略层。
2. 扩充真实样本库，让 catalog 与 heuristic 更贴近导出场景。
3. 让测试矩阵继续覆盖新的 profile 和新的尺寸族。

## 长期计划

1. 如有必要，再考虑性能层面的更深优化。
2. 保持纯客户端优先，不把核心能力迁移到后端。
3. 维护可回归、可解释、可验证的检测策略。
