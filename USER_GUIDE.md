# Gemini Watermark Remover - 用户指南

本工具用于对 Gemini、Doubao 生成图片进行本地检测、分析与去水印。DALL-E 3 目前仅作为实验性研究 profile 保留，真实资产补齐前不在 CLI 生产路径启用。当前实现不是固定尺寸硬编码，而是通过 `profile`、`catalog`、`heuristic`、`deepScan` 梯度滤波四层协同决定检测与恢复流程。

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
- `deepScan`：启用梯度滤波（推荐开启）。开启后引擎会同时检查亮度 NCC 和 Sobel 边缘梯度相关，对纯噪声假阳性有防御效果
- `noiseReduction`：对输出进行更强的噪声抑制（3x3 盒式模糊预处理）
- `autoDownload`：单图与批量处理后的自动下载

### 2.1 高级参数 (Advanced Settings)

在 Web 界面点击“齿轮”图标可展开高级配置面板，适用于自动检测失败的特殊情况：

- **检测灵敏度 (Threshold)**：默认 0.25。调低该值可识别更淡的水印，但会增加误报风险。
- **梯度防御力 (Penalty)**：默认 0.30。控制梯度滤波的惩罚强度。如果水印非常淡且背景复杂，可适当调高此值（放宽惩罚）。
- **手动选区模式 (Manual Area)**：
    1. 开启“手动选区模式”开关。
    2. 输入水印的精确坐标 (X, Y) 与尺寸 (Width, Height)。
    3. 引擎将绕过自动搜索，直接对指定区域进行数学恢复。

## 3. 检测原理

当前流程可以理解为四层：

1. **`catalog` 精确匹配**：先查找官方目录尺寸（registry.MAX_SCALE_MISMATCH = 0.02，即 2% 缩放容差），若匹配则使用目录配置的 logo 大小与边距。
2. **`catalog` 近似匹配**：若精确匹配失败，尝试 scaled catalog（宽高比容差 5%，缩放比容差 8%），从最近官方尺寸等比缩放。
3. **`heuristic` 启发式补充**：对于大面积不规则尺寸，根据像素数+短边联合判断 tier 级别（0.5k/1k/2k/4k），使用标准尺寸模板。
4. **`deepScan` 梯度滤波**：在检测相位（Phase 1 probes + Phase 2 全局搜索 + 抖动精搜）中统一应用梯度相关滤波。只有 Sobel 边缘结构与水印模板边缘结构匹配的候选才会被保留，纯亮度噪声假阳性被压制。

这意味着页面上看到的"检测位置"不是界面猜出来的，而是引擎真实返回的 `pos` 与 `confidence`。

## 4. 常见问题

### Q1. 为什么有些图检测不到？

通常是因为：

- 图片经过重新导出，尺寸不再是官方目录的精确值（可尝试 `Deep Scan` 模式）
- 水印非常淡，且背景纹理过于复杂
- 图片经过了剧烈的缩放、裁切或压缩

当前版本已经增强了近似尺寸、梯度滤波与局部残差相关性，但极端样本仍可能需要后续继续补 catalog 或阈值样本。

### Q2. 什么是 Deep Scan？什么时候需要开启？

`Deep Scan` 启用时，引擎会在亮度相关（NCC）基础上额外计算 Sobel 梯度相关，并使用梯度滤波机制防止假阳性。建议在处理复杂背景或不确定水印是否存在的图片时始终保持开启。关闭后检测速度更快但假阳性风险略高。

### Q3. 为什么网页曾经卡顿？

原因主要是批处理并发过高、动画没有及时停、以及下载策略过于激进。当前版本已经改为自适应低并发，并把批量下载改成 ZIP。

### Q4. 为什么之前不能拖拽上传？

因为文件输入和目录输入没有真正统一到窗口级拖拽事件，且某些本地文件的 MIME 为空。当前版本已经同时处理了这两个问题。

### Q5. 为什么语言下拉里看不清选项？

这是样式与浏览器默认 `select/option` 配色冲突导致的。当前版本已经显式设置了前景色与背景色。

## 5. 验证命令

```bash
npm run lint          # ESLint
npm run test:all      # 完整测试集（含 legacy smoke + Python bridge）
npm run build         # 生产构建
npm run test:legacy   # 维护型历史回归
npm run test:python   # Python bridge
```

## 6. 维护原则

- 新增 profile 时，必须同步 catalog、detector、engine、测试与文档。
- 调整阈值时，必须同时检查误报和漏报。
- 梯度滤波的三个应用点（Phase 1 / Phase 2 / 抖动分支）必须同步修改。
- 调整前端参数时，必须同步 Web/CLI/Python。
- 版本号、测试总数、URL、包名等元信息在所有文档中必须一致。
- 如果某个数字是历史快照，必须明确标注为历史，不能写成当前基线。
