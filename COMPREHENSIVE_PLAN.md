# Current Audit and Delivery Plan (v2.1.0)

> 审计日期: 2026-05-10
> 当前分支: `main`
> 当前版本: `package.json` v2.1.0
> 当前验证基线: `npm test` 356/356 pass, `npm run lint` pass, `npm run build` pass, Python bridge pass

## 1. 当前结论

当前分支已完成 v2.1.0 交付。本项目不仅通过调优核心阈值解决了漏检问题，还引入了全新的“自定义配置模式”，赋予了用户手动干预算法的能力。架构现已实现多端参数一致化、动态对齐与高度解耦，具备极强的工业级可用性。

## 2. 已完成的特性与修复 (v2.1.0)

- **自定义配置模式 (Custom Mode)**：新增高级设置面板，支持手动微调灵敏度、梯度惩罚，以及通过精确坐标强制执行恢复逻辑。
- **召回率专项增强**：梯度惩罚 multiplier 调优至 0.30，有效降低了复杂背景下的假阴性。
- **动态参数注入架构**：重构 `detector.js` 与 `detectionPipeline.js`，支持从 UI/CLI/Python 无缝透传配置。
- **文档与一致化**：全面同步更新了用户指南、开发者指南、技术说明与路线图，基线版本统一为 v2.1.0。
- **全量回归验证**：356 个测试用例全部通过，无性能衰减或逻辑回归。

## 3. 仍需持续关注的问题

- 复杂纹理背景下的误报边界（梯度滤波已大幅改善，仍需持续监控）
- 弱水印样本的召回与误报的平衡
- 新 profile 进入时的测试覆盖完整性
- Web/CLI/Python 的参数一致性

## 4. 长期维护建议

1. 持续扩充真实样本库，优先覆盖复杂背景和轻微缩放导出。
2. 若后续引入新 profile，先补样本与测试，再补页面文案。
3. 保持测试总数、版本号、路线图和 README 的同步。

## 5. 验证命令

```bash
npm run lint
npm test
npm run build
node --test tests/frontend_contract.test.js
node --test tests/gemini_regression.test.js
node --test tests/product_audit.test.js
python -m unittest tests\\test_bridge_integration.py
```
