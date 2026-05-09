[English Document](README.md)

# Gemini & Doubao 无损去水印 (v1.9.9)

这是一个完全在本地运行的图像水印检测、分析与移除工具，面向 Gemini 与 Doubao 图片。

## 当前版本说明

v1.9.9 的重点是把 Web、CLI、Python 三条入口统一到同一套检测与去除管线，并补齐前端交互、拖拽上传、批量 ZIP 下载、语言显示和回归测试。

## 核心能力

- Web 端单图和批量处理
- CLI 文件、目录、管道和 JSON 输出
- Python bridge 与 GUI 集成
- 统一的 profile / catalog / config / engine 结构
- Gemini catalog 优先，近似尺寸与启发式作为补充
- Doubao 多锚点支持
- 批量下载打包为 ZIP，避免浏览器并发下载遗漏
- 前端拖拽上传与目录拖拽
- 本地处理，不上传服务器

## 架构说明

- `src/core/catalog.js`：尺寸和锚点目录
- `src/core/config.js`：候选参数生成
- `src/core/detector.js`：置信度与局部探测评分
- `src/core/detectionPipeline.js`：共享决策策略
- `src/core/watermarkEngine.js`：浏览器与 CLI 的统一执行层
- `src/app.js`、`src/app/processing.js`：前端状态、拖拽、队列与下载
- `src/cli/gwrRemoveCommand.js`：CLI 入口
- `python/remover.py`：Python 桥接

## 验证基线

当前本地验证结果：

- `npm test` -> 271/271 通过
- `npm run lint` -> 通过
- `npm run build` -> 通过
- `node --test tests/frontend_contract.test.js`
- `node --test tests/gemini_regression.test.js`
- `python -m unittest tests\\test_bridge_integration.py`

## 使用方法

### Web

1. 打开本地网页端。
2. 直接拖拽文件或文件夹，或使用上传入口。
3. 选择 `Gemini`、`Doubao` 或 `AUTO`。
4. 按需开启 `Deep Scan`、`Noise Reduction`、`Auto Download`。
5. 处理后查看检测结果并下载输出。

### CLI

```bash
node src/cli.js -i ./input -o ./output
node src/cli.js -i ./input.png -o ./output.png --noiseReduction --no-deepScan
node src/cli.js -i ./input.png -o ./output.png --json
```

### Python

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

## 贡献说明

- 改动 profile、catalog、asset 时，必须同步测试。
- 调整检测阈值或候选排序时，必须补回归测试。
- 修改 Web 检测策略时，CLI 也要保持一致。
- 文档中的数字如果是历史基线，应明确标记，不要混成当前状态。

## License

MIT
