# Gemini Watermark Remover - 使用指南

本工具是针对 Gemini AI 生成图像的一个专用去水印增强版。通过 **反向 Alpha 混合 (Reverse Alpha Blending)** 算法，实现 100% 无损的原始像素还原。

## 🌟 核心特性
1. **100% 无损还原**：非 AI 补全，而是通过数学逆运算还原被遮挡的原始像素。
2. **极速性能**：网页版使用 Web Worker 异步处理，CLI 版基于 Sharp 引擎。
3. **隐私安全**：100% 浏览器本地或本地命令行处理，图片绝不上传服务器。
4. **全平台支持**：提供网页版、油猴脚本、以及自动化 CLI 服务。

---

## 💻 命令行工具 (CLI) - 进阶用法

对于需要批量处理本地图片的开发者，可以使用 CLI 工具：

### 使用前提
- 安装了 [Node.js](https://nodejs.org/)。
- 在项目目录运行 `pnpm install` 安装依赖（主要为 `sharp`）。

### 命令格式
```bash
# 处理单个文件或整个目录
node src/cli.js -i <输入路径> -o <输出目录>
```

### 示例
```bash
# 批量处理 images 文件夹下的所有图片
node src/cli.js -i ./images -o ./processed_images
```

---

## 🛠 使用方式
### 1. 网页版 (Web Experience)
最直观的使用方式，适合单张或小批量处理。
- **访问**：打开 `dist/index.html` (或部署后的地址)。
- **操作**：
  1. 将 Gemini 生成的图片拖入上传区。
  2. 程序会自动识别（优先使用 **NCC 高精度像素特征检测 + Top-5 排序优化**）并完成处理，支持各种比例与裁剪图。
  3. **对比滑块**：点击“切换对比模式”，左右滑动查看无损细节。
  4. **诊断日志**：右侧边栏提供实时处理延迟、检测置信度 (Confidence) 及 Lease-based 内存管理状态监控。

### 2. 命令行工具 (CLI) - 进阶用法
适合需要大规模批量处理图片的开发者。

#### 使用前提
- 安装了 [Node.js](https://nodejs.org/) v18+。
- 在项目目录运行 `pnpm install` 安装依赖。

#### 命令示例
```bash
# 1. 常规批量处理 (处理图像或目录)
node src/cli.js -i ./images -o ./processed

# 2. 机器友好模式 (输出包含详细探测信息的 JSON)
node src/cli.js -i input.png -o output.png --json

# 3. 高性能管道模式 (Unix 风格)
cat image.png | node src/cli.js --pipe > clean.png
```

---

## 🐍 Python 集成实现 (Integration)

如果您需要在 Python 程序中调用本工具，可以使用我们封装的“桥接类”：

### Python 调用示例
```python
from python.remover import GeminiWatermarkRemover

# 初始化桥接
remover = GeminiWatermarkRemover("./")

# 1. 批量处理
results = remover.remove_watermark("./input_dir", "./output_dir")
for res in results:
    print(f"File: {res['file']}, Method: {res['detection']}")

# 2. 字节流管道处理
with open("input.png", "rb") as f:
    clean_bytes = remover.remove_watermark_pipe(f.read())
```

---

## 🔬 技术原理简述
Gemini 的水印是在生成图层上覆盖了一个固定透明度的 Logo。本工具通过：
1. **校准**：获取水印在 48x48 和 96x96 两种规格下的精确 Alpha 映射。
1. **定位 (Robust Detector)**：
   - **优先级 1**：NCC (归一化互相关) 像素探测，支持任意比例缩放、裁剪图及复杂背景。
   - **优先级 2**：基于图像尺寸的规则推定（自适应 48px/96px）。
3. **解算**：使用公式 `Original = (Watermarked - Alpha * Logo) / (1 - Alpha)` 完美还原像素。

---

## ⚠️ 注意事项
- 本工具仅适用于 Gemini AI 原生生成的包含“Made with Google AI”水印的图片。
- 像素探测算法对大部分背景有效，但在纯白背景上水印极不明显时可能回退到尺寸检测。
- 仅供学习与技术交流使用。
