# Gemini Watermark Remover - 用户指南

本工具用于对 Gemini 与 Doubao 生成图片进行本地检测、分析与去水印。当前实现不是固定尺寸硬编码，而是通过 `profile`、`catalog`、`heuristic` 三层对齐来决定检测与恢复流程。

## 1. 使用入口

### Web

适合交互式单图与少量批量处理。

1. 直接把图片或文件夹拖到网页窗口，或使用上传入口。
2. 选择 `Gemini`、`Doubao` 或 `AUTO`。
3. 根据需要开启 `Deep Scan`、`Noise Reduction`、`Auto Download`。
4. 处理完成后切换比较视图查看结果。
5. 批量结果会以 ZIP 形式下载，避免浏览器并发下载遗漏。

### CLI

适合批量处理、自动化和脚本集成。

```bash
node src/cli.js -i ./input -o ./output
node src/cli.js -i input.png -o output.png --noiseReduction --no-deepScan
node src/cli.js -i input.png -o output.png --json
```

### Python

适合嵌入到 Python 工具链或 GUI。

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

## 2. 关键参数

- `profileId`：`gemini`、`doubao`、`auto`
- `deepScan`：更激进的候选探测，适合复杂背景
- `noiseReduction`：对输出进行更强的噪声抑制
- `autoDownload`：单图与批量处理后的自动下载

Web、CLI、Python 三端都使用同一套参数名。以后如果改名，必须同步三端与测试。

## 3. 检测原理

当前流程可以理解为四层：

1. `catalog` 先匹配官方或已知尺寸与锚点。
2. `heuristic` 为近似尺寸、缩放导出和轻微偏移提供补充。
3. `detector` 计算局部相关性、梯度相关性与候选置信度。
4. `detectionPipeline` 决定是否接受结果，并控制回退条件。

这意味着页面上看到的“检测位置”不是界面猜出来的，而是引擎真实返回的 `pos` 与 `confidence`。

## 4. 常见问题

### Q1. 为什么有些图检测不到？

通常是因为：

- 图片经过重新导出，尺寸不再是官方目录的精确值
- 水印非常淡，且背景纹理过于复杂
- 图片是缩放、裁切、压缩后的版本

当前版本已经增强了近似尺寸与局部残差相关性，但极端样本仍可能需要后续继续补 catalog 或阈值样本。

### Q2. 为什么网页曾经卡顿？

原因主要是批处理并发过高、动画没有及时停、以及下载策略过于激进。当前版本已经改为自适应低并发，并把批量下载改成 ZIP。

### Q3. 为什么之前不能拖拽上传？

因为文件输入和目录输入没有真正统一到窗口级拖拽事件，且某些本地文件的 MIME 为空。当前版本已经同时处理了这两个问题。

### Q4. 为什么语言下拉里看不清选项？

这是样式与浏览器默认 `select/option` 配色冲突导致的。当前版本已经显式设置了前景色与背景色。

## 5. 验证命令

```bash
npm run lint
npm test
npm run build
node --test tests/frontend_contract.test.js
node --test tests/gemini_regression.test.js
python -m unittest tests\test_bridge_integration.py
```

## 6. 维护原则

- 新增 profile 时，必须同步 catalog、detector、engine、测试与文档。
- 调整阈值时，必须同时检查误报和漏报。
- 调整前端参数时，必须同步 Web/CLI/Python。
- 如果某个数字是历史快照，必须明确标注为历史，不能写成当前基线。
