# GWR Developer Guide

本文档说明当前分支的架构、参数一致化策略、动态对齐规则，以及新增模板时必须遵守的测试流程。

## 架构概览

### 核心层

- `src/core/templates/registry.js` 是单一事实来源，保存 profile、catalog、assets、heuristic。
- `src/core/profiles.js` 提供品牌与模板策略。
- `src/core/catalog.js` 提供分辨率与锚点目录。
- `src/core/detector.js` 负责候选位置探测、置信度评分和坐标回传。
- `src/core/blendModes.js` 负责反向 Alpha 混合恢复。
- `src/core/watermarkEngine.js` 统筹 multi-probe、候选应用和结果归一化。

### 应用层

- `src/app.js` 负责网页事件、状态、渲染和 profile 选择。
- `src/app/processing.js` 负责单图与队列并发。
- `src/app/ui.js` 负责 Toast、进度和活动日志。

### 环境层

- `src/cli.js` 与 `src/cli/*` 负责命令行入口。
- `python/remover.py` 负责 Python bridge。
- `build.js` 负责打包和静态资源同步。

## 当前设计原则

1. profile/catalog/assets 三者必须同步变化。
2. 前端和 CLI 不能直接写死分辨率。
3. 统计 UI 必须使用 engine 返回的真实 `pos` 与 `confidence`。
4. 批处理成功和失败都要推进进度。
5. 批量卡片、日志和文案都必须走安全渲染与 i18n。

## 动态对齐

这是目前最重要的工程约束。

新增模板时，不允许只加一处：

1. 先在 `src/core/templates/registry.js` 或对应 profile 文件里登记模板。
2. 再在 `src/core/catalog.js` 补分辨率与锚点。
3. 再补资产文件。
4. 最后补回归测试。

这样做的目的，是让测试成为参数一致性的守门人，而不是事后补洞。

## 参数一致化

当前前端、CLI、Python bridge 都从同一组引擎参数派生：

- `profileId`
- `deepScan`
- `noiseReduction`
- `autoDownload`

Web UI 里的统计面不再自行推断坐标，而是直接使用 engine 回传的 `pos`。

## 测试策略

当前验证基线应至少包含：

- `npm run lint`
- `npm test`
- `npm run build`
- `node --test tests/frontend_contract.test.js`
- `node --test tests/product_audit.test.js`
- `python -m unittest tests\\test_bridge_integration.py`

新增模板时，必须补至少以下一种：

- `tests/product_audit.test.js` 的矩阵覆盖
- 专项 profile/catalog/detector 测试
- 前端契约测试中的 i18n 或 DOM hook 断言

## 文档维护规则

如果代码重构了，文档必须同步，尤其是下面几类信息：

- 当前版本号和测试数
- 当前 UI 控件与交互
- CLI / Web / Python 的参数对齐方式
- 新模板的接入步骤

不要在说明里继续把历史状态写成当前状态。历史结论应留在 `MASTER_PLAN.md` 或专题报告里，并明确标注为历史快照。

## 开发流程

1. 修改源码。
2. 更新相应测试。
3. 更新用户指南、开发者指南、路线图和计划。
4. 跑完整验证。
5. 再提交。

## 路线图

当前短期方向：

- 收敛文档漂移。
- 保持 profile/catalog 动态对齐。
- 把新模板接入流程固定为标准化步骤。

中长期方向：

- 抽出更细的共享候选执行器。
- 继续优化高分辨率与批处理性能。
- 若引入 Rust/WASM，必须先用测试锁定行为，再替换实现。
