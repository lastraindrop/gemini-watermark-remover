# Current Audit and Delivery Plan

> 审计日期: 2026-05-09
> 当前分支: `main`
> 当前版本: `package.json` v1.9.9
> 当前验证基线: `npm test` 271/271 pass, `npm run lint` pass, `npm run build` pass, Python bridge pass

## 1. 当前结论

当前分支已经完成从单纯去水印脚本到完整产品化工具的演进。Web、CLI、Python 三条入口已经统一到共享的 profile / catalog / detector / pipeline 结构，前端拖拽、批量下载、语言显示和复杂背景下的召回问题也已经做了修复。

当前最重要的工程原则是：

1. 任何检测策略改动都必须同步 Web、CLI、Python。
2. 任何 profile 或 catalog 改动都必须同步测试与文档。
3. 任何阈值调整都必须同时看负样本与回归样本。
4. 文档中的版本号和测试总数必须与当前基线一致，历史记录另存。

## 2. 现阶段已完成的关键工作

- 建立共享检测管线 `src/core/detectionPipeline.js`
- 修复 detector 候选排序与局部相关性评分
- 补回 Gemini catalog 与近似尺寸覆盖
- 补齐 Doubao 多锚点支持
- 修复网页拖拽上传和目录遍历
- 将批量下载改为 ZIP
- 修复语言选择可见性
- 补充前端契约、Gemini 回归、产品审计测试

## 3. 仍需持续关注的问题

- 复杂纹理背景下的误报边界
- 弱水印样本的持续召回提升
- 新 profile 进入时的测试覆盖完整性
- Web/CLI/Python 的参数一致性
- 历史文档与当前基线的分离

## 4. 下一步建议

1. 继续扩充真实样本库，优先覆盖复杂背景和轻微缩放导出。
2. 继续整理历史快照文档，让它们只保留历史，不混淆当前。
3. 继续保持测试总数、版本号、路线图和 README 的同步。
4. 若后续引入新 profile，先补样本与测试，再补页面文案。

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
