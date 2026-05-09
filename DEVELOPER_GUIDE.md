# GWR Developer Guide

本指南说明当前分支的工程结构、参数一致化规则、测试策略，以及新增模板或修改检测策略时必须遵守的流程。

## 1. 当前架构

### 核心层

- `src/core/catalog.js`：尺寸与锚点目录，优先级最高
- `src/core/config.js`：根据图片尺寸生成候选参数
- `src/core/detector.js`：候选评分、局部相关性与置信度计算
- `src/core/detectionPipeline.js`：统一 Web/CLI 的接受策略
- `src/core/watermarkEngine.js`：主引擎，负责候选执行与结果归一化
- `src/core/blendModes.js`：反向 alpha 混合恢复

### 应用层

- `src/app.js`：事件、状态、拖拽、文件导入
- `src/app/processing.js`：批处理、并发、下载、ZIP 输出
- `src/app/ui.js`：界面交互辅助
- `public/index.html`、`public/index.css`：前端骨架与样式

### 入口层

- `src/cli.js`、`src/cli/gwrRemoveCommand.js`：CLI
- `python/remover.py`、`python/gui.py`：Python bridge 与 GUI
- `src/userscript/index.js`：userscript 入口
- `build.js`：打包与静态资源内联

## 2. 参数一致化原则

当前 Web、CLI、Python bridge 必须共享同一组引擎参数：

- `profileId`
- `deepScan`
- `noiseReduction`
- `autoDownload`

禁止在某一端私自引入新语义、改名或自行硬编码阈值。真正的策略应该进入 `config.js`、`catalog.js`、`detector.js` 或 `detectionPipeline.js`。

## 3. 新增 profile 或模板的流程

1. 在 `src/core/profiles.js` 注册 profile。
2. 在 `src/core/catalog.js` 补齐官方尺寸、锚点或近似尺寸。
3. 如需新资源，把资产放入 `src/assets/` 并更新打包引用。
4. 更新 `src/core/config.js`，确保候选生成逻辑覆盖新 profile。
5. 更新 `src/core/detector.js` 或 `src/core/detectionPipeline.js` 的接受条件。
6. 补充 `tests/*.test.js`，至少覆盖：
   - 目录精确匹配
   - 近似尺寸
   - 无水印负样本
   - Web/CLI 一致性
7. 最后同步文档，不要只改代码不改说明。

## 4. 设计规则

1. profile、catalog、assets 必须同步变化。
2. Web 与 CLI 不得各自实现不同的检测策略。
3. UI 不得自己猜测检测坐标，必须使用引擎返回的 `pos` 与 `confidence`。
4. 批处理成功与失败都要推进状态，不能让进度条停住。
5. 任何批量文件名渲染都必须使用 DOM API 和 `textContent`，不能回退到 `innerHTML` 拼接。

## 5. 调试重点

当用户反馈“明显水印也检测不到”时，优先检查：

- 是否命中 catalog 精确尺寸
- 是否命中近似尺寸候选
- `detector.js` 的置信度是否被局部纹理稀释
- `detectionPipeline.js` 的全局回退是否过严
- `tests/gemini_regression.test.js` 是否已有对应样本

当用户反馈“误报太多”时，优先检查：

- 低置信度全局回退是否过宽
- 负样本测试是否充分
- `deepScan` 是否把噪声背景抬成了假阳性

## 6. 测试策略

当前验证基线应至少包括：

```bash
npm run lint
npm test
npm run build
node --test tests/frontend_contract.test.js
node --test tests/gemini_regression.test.js
node --test tests/product_audit.test.js
python -m unittest tests\test_bridge_integration.py
```

对检测算法做修改时，必须同时看：

- 回归样本
- 负样本
- 前端契约
- CLI 行为
- Python bridge 输出

## 7. 文档维护规则

文档里如果写到版本号、测试总数、流程状态或当前架构，必须是当前基线。历史数值应当进入 `MASTER_PLAN.md` 或 `COMPREHENSIVE_PLAN.md` 的历史段落，而不是混在用户指南里。
