# Current Audit and Delivery Plan (v1.9.9)

> 审计日期: 2026-05-10
> 当前分支: `main`
> 当前版本: `package.json` v1.9.9
> 当前验证基线: `npm test` 271/271 pass, `npm run lint` pass, `npm run build` pass, Python bridge pass

## 1. 当前结论

当前分支已完成从单纯去水印脚本到完整产品化工具的演进。Web、CLI、Python 三条入口已统一到共享的 profile / catalog / detector / pipeline 结构。经过两轮调优：

- **Round 1**: 放宽阈值链，修复启发式判断错误，增大探针范围 → 召回率大幅提升
- **Round 2**: 引入梯度滤波假阳性防御，收紧锚点容差 → FP 率下降，271/271 全通过

当前最重要的工程原则是：

1. 任何检测策略改动都必须同步 Web、CLI、Python。
2. 任何 profile 或 catalog 改动都必须同步测试与文档。
3. 任何阈值调整都必须同时看负样本与回归样本。
4. 文档中的版本号和测试总数必须与当前基线一致，历史记录另存。

## 2. 已完成的修复

- 共享检测管线 `src/core/detectionPipeline.js`
- detector 候选排序与局部相关性评分修复
- 梯度滤波假阳性防御（Phase 1 + Phase 2 + 抖动分支统一）
- 位置锚点容差收紧（20%→5%）
- Gemini catalog 与近似尺寸覆盖
- Doubao 多锚点支持
- 网页拖拽上传和目录遍历修复
- 批量下载改为 ZIP
- 语言选择可见性修复
- 前端契约、Gemini 回归、产品审计测试补齐（271 测试）
- 技术文档完善

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
