# 用户指南 (v2.7.0)

本指南面向实际使用者，说明如何通过 Web、CLI 和 Python bridge 处理 Gemini 与 Doubao 图片中的可见 AI 水印。所有处理默认在本地完成。

## 1. 支持范围

生产入口：

- `Gemini`
- `Doubao`
- `Auto`，自动在生产 profile 中选择最可信结果

内部实验项：

- `dalle3` 在代码中保留为实验 profile，用于研究和回归测试；生产 UI 与普通 CLI 使用指南不把它作为正式支持目标。

## 2. Web 使用流程

1. 运行 `pnpm build` 后打开 `dist/index.html`，或运行 `pnpm serve` 访问本地服务。
2. 将图片或文件夹拖入页面，也可以点击上传入口。
3. 选择 `Gemini`、`Doubao` 或 `Auto`。
4. 选择性能预设：
   - `Fast`：快速，适合标准尺寸和干净背景。
   - `Balanced`：默认推荐，兼顾速度与检出率。
   - `Thorough`：更大搜索范围和更强自适应兜底，适合裁剪、缩放、复杂背景和偏移水印。
5. 需要时打开手动模式，直接圈选水印区域。
6. 处理完成后使用每张卡片上的 compare 按钮在原图和结果之间切换。
7. 批量结果会打包为 ZIP 下载，避免浏览器多文件下载丢失。

## 3. 手动模式

手动模式用于自动检测失败或水印位置明显异常的图像。

可配置项：

- `x`, `y`, `width`, `height`：水印区域。
- 模板尺寸：`auto`、`48`、`96`。`auto` 会根据 profile 与手动区域动态生成资源键；Doubao 矩形区域会使用 `宽x高` 资源键。
- `forceProcess`：跳过置信度门控，强制处理选区。
- Alpha 增益：控制移除强度。淡水印可适当提高；出现暗斑时应降低。
- 搜索范围：在手动区域附近查找更准确的中心位置。

建议：

- 能自动检测时优先使用自动模式。
- 自动漏检但位置明确时，使用手动 `auto` 模板。
- 去除后出现轻微偏差时，先降低 alpha 增益，再增大搜索范围。

## 4. CLI

```bash
node src/cli.js -i input.png -o output.png --profile gemini
node src/cli.js -i input.png -o output.png --profile doubao --json
node src/cli.js -i ./input-dir -o ./output-dir --profile auto
node src/cli.js --pipe < input.png > output.png
```

常用参数：

- `--profile gemini|doubao|auto`
- `--json` 输出机器可读结果
- `--noiseReduction`
- `--no-deepScan`
- `--overwrite`
- `--format png|webp|jpeg`

## 5. Python Bridge

```python
from python.remover import GeminiWatermarkRemover

remover = GeminiWatermarkRemover("./")
results = remover.remove_watermark(
    "./input",
    "./output",
    deep_scan=True,
    noise_reduction=False,
)
```

## 6. 参数如何影响结果

| 参数 | 作用 | 建议 |
| --- | --- | --- |
| `profileId` | 指定检测 profile | 不确定时用 `auto` |
| `deepScan` | 启用梯度相关，减少纹理假阳性 | 默认保持开启 |
| `noiseReduction` | 增强噪声抑制 | 复杂噪声或全面模式下使用 |
| `adaptiveMode` | 弱 catalog 命中时启用自适应搜索 | 默认 `auto` |
| `probeThreshold` | catalog/heuristic 探针阈值 | 漏检时小幅降低 |
| `fallbackThreshold` | 全局回退阈值 | 误检时提高 |
| `gradientPenalty` | 梯度防御强度 | 复杂纹理误检时提高 |

## 7. 常见问题

### Q1: 明显有水印却检测不到怎么办？

按顺序尝试：

1. 切换到 `Thorough`。
2. 使用 `Auto` profile。
3. 对明确位置使用手动模式，模板选 `auto`。
4. 适当降低检测阈值。
5. 如果是非常淡或纯白背景上的白色水印，可能已经没有可恢复的信号。

### Q2: 去除后有暗斑、亮边或轻微偏移怎么办？

优先处理方式：

1. 使用 compare 检查是否是局部偏差。
2. 手动选区后降低 alpha 增益到 0.7-0.9。
3. 增大位置搜索范围到 20-30px。
4. 对复杂背景尝试 `Balanced` 和 `Thorough` 分别处理，选择 artifact 更少的结果。

当前引擎已包含 NMS、trial-removal 候选验证、halo 检测、弱 alpha 链与亚像素精修，但极端背景仍可能需要手动模式。

### Q3: 为什么纯白背景可能无法检测？

白色水印叠加在纯白背景上时，数学上可能没有像素变化：

```text
watermarked = alpha * 255 + (1 - alpha) * 255 = 255
```

如果图像中没有可观测信号，任何基于像素的检测和恢复算法都无法可靠判断水印存在。

## 8. 验证命令

用户通常只需要：

```bash
pnpm build
pnpm test
```

完整维护验证：

```bash
pnpm lint
pnpm build
pnpm test:all
pnpm test:diagnostic
pnpm test:stress
```

`test:diagnostic` 和 `test:stress` 是慢速专项入口，不放入普通 `test`。
