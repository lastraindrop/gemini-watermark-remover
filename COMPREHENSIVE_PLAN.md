# 现阶段综合审计与落地计划

> 审计日期: 2026-05-09
> 当前分支: `main`
> 当前版本: `package.json` v1.9.9
> 对比上游: `https://github.com/GargantuaX/gemini-watermark-remover`, `garg/main` = `6f7e3313d2479410a9da0469bf48c45e63900eab`
> 本次验证基线: `npm test` 203/203 pass, `npm run lint` 0 warning, `npm run build` pass, Python bridge pass

## 0. 执行摘要

当前分支已经不是 GargantuaX 上游的轻量 fork，而是一个面向 Web UI、CLI、Python bridge、Doubao 多锚点模板的产品化分支。核心能力已经覆盖 Gemini 与 Doubao 的可见水印检测、分析与反 alpha 去除，并有较完整的矩阵测试。

本次审计发现并修复了验证链路与行为一致性问题:

- `npm test` 依赖 `npx cross-env` 运行时下载，离线或受限网络下会失败。已改为本地 Node 测试命令。
- `npm run build` 依赖 `cross-env` 设置 `NODE_ENV`，已改为 `node build.js --production`。
- ESLint 无法解析 JSON import attributes，已切换 `ecmaVersion` 到 `latest`。
- CLI 版本测试硬编码 v1.9.8，已改为读取 `package.json`。
- Python bridge 集成测试在 Windows GBK 控制台输出 emoji 时失败，已改成 ASCII 输出。
- 浏览器引擎和 CLI 的 multi-probe 逻辑此前只去除最高置信度候选，却可能报告多个命中；已改为同一胜出 profile 下的所有候选都执行去除，并新增 Doubao TL+BR 端到端回归测试。
- Web UI 仍以 Gemini-only/GWR PRO 为主叙事，且把单图上传和目录上传绑在同一个 input 上；已改成 Gemini + Doubao profile 工作台、分离文件/目录入口，并暴露降噪开关。
- 前端批处理卡片曾用 `innerHTML` 拼接文件名，存在 DOM 注入风险；已改为 DOM API + `textContent` 渲染，并新增前端合约测试。
- 前端批处理失败项不会推进进度，可能导致批量进度条无法完成；已在 queue 层对 success/error 都计数并更新错误卡片。
- Web 统计页之前读取 `config.pos`，但 engine 返回值没有携带 `pos`；已将检测坐标从 engine 返回并在 UI/测试中锁定。
- 中文 README 与 Service Worker cache 版本仍停留在 v1.9.8，已同步到 v1.9.9。
- lint 的历史 unused warning 已清零。

## 1. 当前架构事实

### 1.1 运行入口

- Web app: `public/index.html` -> `src/app.js` -> `src/app/*` -> `src/core/*`
- Userscript: `src/userscript/index.js` -> `src/core/watermarkEngine.js`
- CLI: `bin/gwr.mjs` / `src/cli.js` -> `src/cli/gwrCli.js` -> `src/cli/gwrRemoveCommand.js`
- Python bridge: `python/remover.py` 调 Node CLI, `python/gui.py` 提供 Tkinter GUI
- Build: `build.js` 使用 esbuild 打包 `dist/app.js`, `dist/worker.js`, userscript, 并内联 PNG assets 到 `window.GWR_INLINED_ASSETS`

### 1.2 核心数据流

1. 输入图像被载入为 Canvas 或 Sharp raw RGBA。
2. 根据 profile 和 catalog 生成候选配置:
   - `src/core/profiles.js`: Gemini, Doubao, experimental DALL-E 3 metadata
   - `src/core/catalog.js`: 官方/已知分辨率与锚点目录
   - `src/core/config.js`: catalog 优先, heuristic fallback
3. `src/core/watermarkEngine.js` / CLI 对每个候选读取 alphaMap。
4. `src/core/detector.js` 使用 NCC 与 Sobel gradient confidence 探测位置和轻微位移。
5. `src/core/blendModes.js` 使用反 alpha 混合公式恢复像素。
6. Web/CLI/Python 返回处理结果、置信度、profile、config 与输出图像。

### 1.3 设计优点

- Profile + catalog + registry 已经将品牌差异从核心算法中抽离。
- Doubao 同一分辨率多锚点 TL/BR 已有目录与测试覆盖。
- 浏览器和 CLI 共用核心数学模块，减少算法漂移。
- 测试覆盖从数学、探测、目录、矩阵、前端契约、CLI、Python bridge 到内存压力。
- 运行时资产已有浏览器内联优化，减少前端 PNG fetch 风险。

### 1.4 主要技术债

- Web engine 与 CLI 有重复候选探测逻辑，后续应提取为共享 `candidateRunner`。
- `detectWatermark` 与 `calculateProbeConfidence` 内含多阶段决策、阈值、候选排序，仍偏大，应拆出策略对象。
- DALL-E 3 profile 是 experimental，但缺少真实资产与样本，不应在生产文档里宣称可用。
- `serve` 仍使用 `npx serve dist`，未安装 serve 时仍会联网；应改为本地静态服务脚本或声明依赖。
- `public/index.html` 仍依赖 Tailwind CDN，离线/PWA 或受限网络下首屏样式存在外部依赖风险；发布版应将 Tailwind 输出纳入本地 build。
- 旧报告文件存在测试数量和版本漂移，应继续统一。

### 1.5 Web UI 与交互状态

- UI 现已从 Gemini-only 文案调整为 Gemini + Doubao 水印分析工作台，主标题、meta、页眉、页脚、profile 选择和活动日志文案更贴近当前 profile/catalog 架构。
- 上传区分为 `fileInput` 与 `folderInput`，点击上传默认打开图片文件选择，目录模式由独立按钮触发，避免 Chromium 下单图上传被目录选择行为干扰。
- 控制面板展示 `profile`, `deepScan`, `noiseReduction`, `autoDownload` 四个核心运行参数；这与 `getEngineOptions()` 和 CLI 能力保持一致。
- 单图结果页统计维度调整为 anchor、coordinate、confidence、algorithm，去掉长期固定为 `1.000x` 的展示噪声。
- 批量模式现在对失败项有可见状态，并且成功/失败都会推进进度；`Download All` 只下载成功项。
- 活动日志折叠由 JS 事件管理，移除 inline handler，便于测试和 CSP 收敛。

## 2. 与 GargantuaX 上游对比

### 2.1 上游当前形态

上游 `garg/main` 当前 package 版本为 v1.0.14，仓库重点已经转向:

- SDK surface: `src/sdk/*`, TypeScript declarations, package exports
- Runtime surface: `src/runtime/*`, `src/shared/*`
- Chrome extension: `src/extension/*`
- Userscript request/download/clipboard/page bridge 完整拆分
- Gemini-only core: `geminiSizeCatalog.js`, `watermarkProcessor.js`, `candidateSelector.js`, `watermarkDecisionPolicy.js`
- Embedded alpha maps: `embeddedAlphaMaps.js`
- Multi-pass removal: `multiPassRemoval.js`
- Preview calibration 与真实页面回归样本

### 2.2 当前分支优势

- Doubao 多锚点与矩形模板支持是当前分支的核心差异。
- Python bridge 与 GUI 对本地批处理友好。
- PWA/多语言/前端操作台更偏产品工具形态。
- 测试矩阵覆盖 Gemini + Doubao profile/catalog。
- Node CLI 支持 file, directory, pipe, JSON 输出。

### 2.3 上游优势

- 模块边界更细，候选决策与处理流水线更清晰。
- SDK/类型声明/包导出更成熟，适合被第三方集成。
- Chrome extension 体系完整。
- Userscript 对真实 Gemini 页面下载、复制、预览路径处理更深。
- 真实样本与 preview calibration 体系比当前分支更完整。

### 2.4 融合建议

短期不建议直接 merge 上游，因为两边架构已经大幅分叉，直接合并会破坏 Doubao/profile registry。建议按能力摘取:

1. 引入上游 `candidateSelector` / `watermarkDecisionPolicy` 思路，但保留当前 profile registry。
2. 将当前 `detector.js` Stage 3 排序迁移到独立决策模块。
3. 参考上游 SDK package exports，新增只读 API: `removeImageData`, `detectWatermark`, `registerProfile`。
4. 参考上游 extension/runtime，但先保持 Web/Python/CLI 主线稳定。
5. 参考上游真实页面样本回归，将当前 docs/sample 与 Doubao sample 合并成标准 fixtures。

## 3. Code Review 结论

### 3.1 已修复问题

- `package.json`: test/build/stress 脚本不再依赖 `npx cross-env` 运行时下载。
- `build.js`: 支持 `--production` 参数。
- `scripts/stress-env.mjs`: 为 stress test 提供本地 env 注入。
- `eslint.config.js`: 支持 import attributes 解析。
- `src/app/ui.js`: CSV export 符合单引号 lint 规则。
- `tests/cli.integration.test.js`: 版本断言跟随 package version。
- `tests/test_bridge_integration.py`: Windows 控制台安全输出。
- `src/core/watermarkEngine.js`: multi-probe 命中全部应用去除。
- `src/core/watermarkEngine.js`: 返回 `pos`，前端统计页可显示真实检测坐标。
- `src/cli/gwrRemoveCommand.js`: CLI 与 Web engine 行为一致，胜出 profile 内全部命中都去除。
- `tests/product_audit.test.js`: 增加 Doubao TL+BR 同图多锚点回归。
- `src/app.js`, `src/app/processing.js`: 拆分文件/目录上传、修复批处理错误进度、暴露 noise reduction、批处理卡片改为安全 DOM 渲染。
- `public/index.html`: 去除 GWR PRO/Gemini-only 叙事，补齐前端 DOM hook、移动端 side-by-side 布局、活动日志按钮和 i18n 文案。
- `src/i18n/*.json`, `src/i18n.js`: 新增品牌、上传、批处理、toast、检测类型、置信度等多语言键，并支持通用 `{{param}}` 插值。
- `tests/frontend_contract.test.js`: 锁定文件/目录 picker 分离、无 inline onclick、批处理文件名不插入 HTML。
- `src/app.js`, `src/app/processing.js`, `src/cli/gwrRemoveCommand.js`, `src/core/profiles.js`, `src/utils.js`: 清理 lint warning。
- `README_zh.md`, `public/sw.js`: 版本同步到 v1.9.9。

### 3.2 剩余风险

- 当前 multi-anchor 修复按“胜出 profile”全部候选去除，避免跨 profile 误删；但仍需增加重叠候选去重策略，防止同一水印被两个相近候选重复处理。
- CLI 阈值为 `0.25`，Web 阈值为 `0.10`，二者在低对比图上可能出现结果差异；应在测试中锁定预期。
- `calculateProbeConfidence` 每次滑窗都会分配 gradient buffer，Doubao 分支也会新分配；高分辨率批量场景可继续池化。
- Web 首屏样式仍依赖 `https://cdn.tailwindcss.com`；如果产品目标是完全离线/PWA，需要把 Tailwind 编译结果纳入本地 CSS。
- 前端仍存在若干非关键硬编码运行日志，例如远程 URL 拉取失败提示、profile 切换日志；后续可统一迁移到 i18n/log message registry。
- Python bridge 仅解析 JSON 行，不解析非 JSON CLI 输出；这是设计可接受，但应在文档中明确。
- `python/prefs.json` 当前为本地用户配置且工作区已是 dirty 状态，不应进入发布变更。

## 4. 文档一致性审计

### 4.1 已修复

- `README_zh.md`: 从 v1.9.8 描述更新到 v1.9.9 与 203/203 当前验证。
- `public/sw.js`: cache name 从 `gwr-v1.9.8-cache` 更新为 `gwr-v1.9.9-cache`。
- `COMPREHENSIVE_PLAN.md`: 重写为当前审计与落地计划。

### 4.2 仍需统一的文档

- `MASTER_PLAN.md`: 顶部写 200/200，但矩阵表仍写 188 tests / 46 suites，且含历史 v1.8/v1.9.8 计数。
- `reports/frontend-and-tests-report.md`: 已同步到当前前端审计结论与 203/203 验证。
- `reports/doubao-report.md`: 已同步 Doubao 专项测试 `35/35` 与全量 `203/203` 当前验证。
- `README.md`: 已同步为 v1.9.9 与 203/203 当前验证；后续建议改成引用 CI badge 避免数字漂移。
- `package.json` repository 指向 `journey-ad`，本地 origin 为 `lastraindrop`，上游对比为 `GargantuaX`；发布前应明确 canonical repo。
- `public/index.html` GitHub link 指向 `journey-ad`，如当前产品归属已变化，需要同步。
- `USER_GUIDE.md` 与 `DEVELOPER_GUIDE.md` 需补充 multi-anchor 实际去除、offline test/build 命令、experimental profile 说明。

## 5. 如何确认水印案例均可通过

### 5.1 必须覆盖的案例矩阵

- Gemini catalog: 512, 1024, 2048, 4096, portrait/landscape additions。
- Gemini heuristic: 非 catalog 尺寸、小图、宽图、轻微缩放。
- Doubao catalog: 2048 square, 2730x1535 TL/BR, 2364x1773 TL/BR, 1536x2727 TL/BR。
- Doubao heuristic: 非 catalog 矩形、TL/BR fallback。
- 对抗样本: JPEG 量化、heavy noise、edge crop、subpixel jitter。
- 负样本: 纯色/随机无水印图，必须 `removedCount=0` 或低 confidence。
- 运行面: Web engine, CLI JSON, CLI pipe, Python bridge。
- 前端面: 单图上传、目录上传、拖拽、粘贴、profile 选择、deep scan、noise reduction、auto download、单图/批量结果视图、活动日志导出。

### 5.2 通过标准

- detection: catalog 样本至少命中 1 个候选；多锚点图应命中并去除全部真实锚点。
- confidence: 合成样本应 > 0.40；真实 Doubao bridge 样本本次为 71.9%。
- fidelity: 合成可逆样本 PSNR > 24dB；关键像素误差保持在现有测试阈值内。
- safety: 无水印图不得高置信误判。
- build: `dist/app.js`, `dist/worker.js`, userscript 和静态 assets 必须生成。
- frontend: DOM hook 必须存在；文件 picker 不应带 `webkitdirectory`；目录 picker 必须带 `webkitdirectory`；文件名不得通过 `innerHTML` 拼入批量卡片；批处理失败项必须推进进度。

### 5.3 当前验证命令

```powershell
npm run lint
npm test
npm run build
python -m unittest tests\test_bridge_integration.py
node --test tests\product_audit.test.js
node --test tests\frontend_contract.test.js
```

## 6. 新增水印模板的适配方式

### 6.1 最小改动路径

1. 将模板 PNG 放入 `src/assets/`，命名为 `bg_<profile>_<anchor>.png`。
2. 在 `src/core/profiles.js` 增加 profile:
   - `id`, `name`, `brandColor`, `logoValue`
   - `anchors`
   - `assets`
   - `getHeuristicConfig(width, height, anchor)`
3. 在 `src/core/catalog.js` 增加 catalog entries:
   - `width`, `height`
   - `logoWidth`/`logoHeight` 或 `logoSize`
   - `marginLeft`/`marginTop` 或 `marginRight`/`marginBottom`
   - `anchor`
4. 注册 profile 与 catalog 到 `registry`。
5. 如果颜色不是白色 alpha blend，需要扩展 `blendModes.js` 的 logoValue/profile 传参。

### 6.2 必须新增的测试

- `tests/profiles.test.js`: profile 注册、anchors、assets、heuristic。
- `tests/catalog.test.js`: catalog exact/tolerance match。
- `tests/config.test.js`: `getAllPotentialConfigs` 与坐标计算。
- `tests/detector.test.js`: `calculateProbeConfidence` 对单锚点/多锚点命中。
- `tests/product_audit.test.js`: 新 profile 全 catalog 矩阵与多锚点 E2E。
- `tests/frontend_contract.test.js`: 新 profile 出现在 profile select 生成链路中；新增模板相关 UI 文案要有 i18n key。
- `tests/cli.integration.test.js`: `--profile <id> --json`。
- `tests/real_sample.test.js`: 至少 1 个真实样本 metadata/catalog 对齐。

### 6.3 边界要求

- 新 profile 默认不进入 auto-detect，除非已有真实样本与负样本证明误判可控。
- experimental profile 必须标记 `experimental: true`，前端默认隐藏。
- 模板资产尺寸必须与 catalog 的 `logoWidth/logoHeight` 对齐，或测试必须覆盖 resize 误差。
- 如果同一图存在多个真实水印，必须断言 `removedCount` 等于真实锚点数。

## 7. 后续落地顺序

### P0 已完成

- 修复本地验证链路。
- 修复 multi-probe 只去除一个候选的问题。
- 修复 Web UI 上传入口、批量失败进度、检测坐标统计、批量卡片 DOM 注入风险。
- 将前端主叙事与控件同步到 Gemini + Doubao + profile architecture。
- 清理 lint。
- 同步部分版本文档。
- 重新跑全量验证。

### P1 文档收敛

1. 更新 `MASTER_PLAN.md` 测试矩阵到 203/203，删除历史错误计数或移动到 changelog。
2. 更新 `reports/frontend-and-tests-report.md` 当前状态为 203/203，保留历史段落。
3. 后续将 README 测试数量改成引用 CI badge，避免数字漂移。
4. 明确 canonical repository，并同步 `package.json`, `public/index.html`, README links。

### P2 架构收敛

1. 从 `watermarkEngine.js` 与 `gwrRemoveCommand.js` 抽出共享候选执行器。
2. 从 `detector.js` 抽出候选排序与去重策略。
3. 统一 Web/CLI 阈值策略，profile 可覆盖 threshold。
4. 将真实样本验证统一到 `tests/fixtures`，避免 sample/research/report 混用。

### P3 上游能力择优融合

1. 参考上游 SDK exports，提供稳定 JS API。
2. 参考上游 extension/runtime 拆分 userscript 页面桥接。
3. 引入上游真实页面 benchmark 思路，但继续保留 Doubao registry。
4. 对 preview calibration 做独立实验分支，避免影响稳定主线。

### P4 新模板流程产品化

1. 增加 `docs/TEMPLATE_AUTHORING.md`。
2. 增加 `scripts/create-profile-fixture.mjs`，从真实 before/after 或 watermark-only 图生成模板校验报告。
3. 增加 `tests/template_contract.test.js`，自动校验所有非 experimental profile 的 assets/catalog/heuristic。
4. 新模板合入必须同时提供真实样本、负样本、CLI JSON 样本和文档片段。

## 8. 发布前检查清单

- `git status --short` 只包含预期源码/文档改动，不包含 `python/prefs.json` 这类本地偏好。
- `npm run lint` 无输出。
- `npm test` 全部通过。
- `npm run build` 通过，`dist/` 产物可打开。
- `python -m unittest tests\test_bridge_integration.py` 通过。
- README/README_zh/package/public links 指向同一 canonical repo。
- Service Worker cache version 与 package version 对齐。
- experimental profiles 不在默认 UI 中暴露。
