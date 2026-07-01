[English](README.md)

# Gemini & Doubao 水印检测与移除工具 (v2.7.0)

这是一个本地优先的水印检查、分析与移除工具，面向 Gemini 与 Doubao 图片中的可见 AI 水印。支持的 profile 选择为 `gemini`、`doubao` 与 `auto`。

本工具使用确定性的图像分析与反向 alpha 混合恢复，不上传图片，也不使用生成式修复。

## 当前版本重点

- **减少漏检**：新增 Gemini 20260520 alpha 变体、48/96 模板动态排序、近锚点 25% 容差、自适应兜底放宽、Doubao 矩形资源键动态解析。
- **减少误检**：候选 trial-removal 验证、标准锚点保护、free 模式置信度地板、重叠候选 NMS。
- **降低去除偏差**：多遍移除、弱 alpha 链、artifact 诊断、亚像素精修、alpha 增益校准。
- **前端一致化**：生产 UI 只展示 Gemini/Doubao/Auto；手动模板支持 `auto`；移动端 toast 与批量布局修复；对比按钮补齐无障碍属性。
- **测试分层**：新增统一测试分组 runner，明确 unit/integration/precision/audit/diagnostic/stress。

## 快速开始

```bash
pnpm install
pnpm build
pnpm serve
```

开发模式：

```bash
pnpm dev
```

CLI 示例：

```bash
node src/cli.js -i input.png -o output.png --profile gemini
node src/cli.js -i ./input-dir -o ./output-dir --profile doubao --json
node src/cli.js --pipe < input.png > output.png
```

Python 示例：

```python
from python.remover import GeminiWatermarkRemover

remover = GeminiWatermarkRemover("./")
results = remover.remove_watermark("./input", "./output", deep_scan=True)
```

## 架构概览

| 层级 | 主要文件 | 职责 |
| --- | --- | --- |
| Profile 与目录 | `profiles.js`, `catalog.js`, `catalogs.json`, `templates/registry.js` | 生产 profile、官方尺寸、锚点、资源键与目录匹配 |
| 检测 | `detectionPipeline.js`, `detector.js`, `adaptiveDetector.js`, `decisionPolicy.js` | Catalog/启发式/自适应/全局检测、候选验证与排序 |
| 候选 | `candidateGeometry.js` | 重叠几何、候选合并、NMS 与锚点排序 |
| 移除 | `applyRemoval.js`, `blendModes.js`, `multiPassRemoval.js`, `alphaCalibration.js` | 反向 alpha 混合、多遍移除、增益校准、artifact 诊断 |
| 运行时 | `watermarkEngine.js`, `worker.js`, `workerPool.js` | 资源加载、缓存、Worker 辅助与主线程回退 |
| 前端 | `src/app/*.js`, `public/index.html`, `src/i18n/*.json` | 上传、拖拽、设置、手动选区、批量处理、结果对比、多语言 |
| 接口 | `src/cli.js`, `src/sdk/index.js`, `python/remover.py` | CLI、SDK、TypeScript 类型、Python bridge |

## 测试与验证

```bash
pnpm lint             # ESLint
pnpm build            # 生产构建
pnpm test             # 快速 unit 层
pnpm test:integration # 运行时/前端/CLI/Worker/管线集成层
pnpm test:precision   # 检出率、真实样本、大型合成矩阵
pnpm test:audit       # 产品验收审计
pnpm test:diagnostic  # 慢速诊断基线
pnpm test:stress      # 有边界的内存压力测试
pnpm test:all         # 标准完整门禁：unit + integration + precision + audit + legacy
pnpm test:exhaustive  # 真正全量：包含 diagnostic 与 stress
```

`scripts/test-groups.mjs` 是测试分层的唯一入口。新增顶层 `tests/*.test.js` 时必须归入一个主分组，`tests/test_groups_contract.test.js` 会自动检查遗漏和重复。

## 参数一致化规则

- 所有检测阈值集中在 `src/core/config.js` 的 `DETECTION_THRESHOLDS`。
- 性能预设集中在 `PERFORMANCE_PRESETS`，UI 滑块不能覆盖预设内部的结构化阈值。
- Profile、catalog、assets 与测试 mock 资产尺寸必须从同一套元数据推导，不能散落硬编码。
- 手动模式通过 `manualConfig` 传递区域、模板、alpha 增益、搜索范围与强制处理参数。
- 用户文档与生产 UI 只承诺 Gemini、Doubao、Auto；新 profile 必须先满足资源、目录、入口与真实样本验收合同。

## 文档

- [用户指南](./USER_GUIDE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [技术指南](./TECHNICAL_GUIDE.md)
- [路线图](./ROADMAP.md)
- [收尾报告](./reports/v2.7-finalization-report.md)

## 许可

MIT
