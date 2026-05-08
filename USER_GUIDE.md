# Gemini Watermark Remover - 使用指南

本工具面向 Gemini 和 Doubao 生成图像的可见水印分析与移除。当前实现不是靠固定分辨率硬编码，而是通过 profile、catalog、heuristic 三层动态对齐来决定检测与恢复流程。

## 核心能力

1. 数学逆运算恢复像素，不是 AI 补全。
2. Web、CLI、Python bridge 都在本地执行。
3. 前端支持单图、目录、拖拽、粘贴、批处理。
4. 新模板可以通过 profile/catalog/asset/test 的标准流程快速接入。

## 网页版

适合单图和小批量处理。

操作顺序：

1. 选择图片文件，或使用“选择目录”处理整个文件夹。
2. 选择 `Gemini`、`Doubao` 或 `AUTO` profile。
3. 根据图像质量决定是否开启 `Deep Scan`、`Noise Reduction`、`Auto Download`。
4. 处理完成后查看 `SLIDER`、`SIDE-BY-SIDE`、`STATS` 三种视图。
5. 单图可直接下载；批量模式下可逐张下载或全部下载成功结果。

网页端的关键一致性约束：

- `fileInput` 只负责文件选择。
- `folderInput` 只负责目录选择。
- 批量卡片文件名使用 `textContent` 渲染。
- 统计视图展示引擎返回的真实 `pos` 和 `confidence`。
- 活动日志、导出、批量状态都由 i18n 统一驱动。

快捷键：

- `1` 切换滑动对比
- `2` 切换左右对比
- `3` 切换统计视图
- `Esc` 重置工作区
- `Ctrl + S` 下载当前成功结果

## 命令行工具

适合批量处理和自动化场景。

前提：

- 安装 [Node.js](https://nodejs.org/)
- 在项目根目录运行 `npm install`

示例：

```bash
# 单文件或目录
node src/cli.js -i ./input -o ./output

# 开启降噪并关闭深层扫描
node src/cli.js -i input.png -o output.png --noiseReduction --no-deepScan

# JSON 输出
node src/cli.js -i input.png -o output.png --json
```

CLI 现在的行为与 Web 引擎保持一致：

- `profileId`、`deepScan`、`noiseReduction` 都来自统一的引擎选项。
- 胜出 profile 的全部命中都会被去除。
- 目录处理和单文件处理共用同一套候选生成逻辑。

## Python 集成

如果你需要从 Python 调用本工具，可以使用桥接类。

```python
from python.remover import GeminiWatermarkRemover

remover = GeminiWatermarkRemover("./")
results = remover.remove_watermark(
    "./input_dir",
    "./output_dir",
    deep_scan=True,
    noise_reduction=False,
)
```

## 技术原理

当前实现分四层：

1. `src/core/templates/registry.js` 保存 profile、catalog、assets、heuristic。
2. `getAllPotentialConfigs()` 根据图片尺寸与 profile 生成候选。
3. `calculateProbeConfidence()` 在候选位置附近计算置信度并返回 `pos`。
4. `removeWatermark()` 对 alpha map 做反向混合恢复。

### 参数一致化与动态对齐

这里最重要的是避免“UI 看起来像对齐了，但代码其实没对齐”的问题。

- 新模板不能只改前端文案。
- 必须同时补 profile、catalog、资产和回归测试。
- 前端、CLI、Python bridge 都从同一份 profile/catalog 派生候选。
- 统计视图显示的是引擎输出，不是界面自己猜的值。

### 如何确认新模板可用

1. 加入 profile 和 catalog。
2. 提供对应的资产文件。
3. 增加前端/i18n 文案。
4. 增加 `tests/product_audit.test.js` 或专项测试。
5. 跑 `npm test`、`npm run lint`、`npm run build`。

## 注意事项

- 本工具仅适用于当前 profile/catalog 覆盖的可见水印样本。
- 任何新模板都应先完成测试，再更新说明文档。
- 旧版版本号、旧测试数、旧标题如果不再代表当前基线，应当保留为历史记录而不是当前状态。
