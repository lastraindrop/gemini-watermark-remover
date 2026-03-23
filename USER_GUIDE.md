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
  2. 程序会自动识别并瞬间完成处理。
  3. **对比滑块**：点击“切换对比模式”，左右滑动查看去水印前后的极致无损细节。
  4. 点击“下载结果”保存。

### 2. 自动化服务 (CLI)
适合开发者和需要大批量处理本地文件的场景。
- **环境要求**：Node.js v18+ 
- **安装依赖**：`npm install`
- **使用命令**：
  ```bash
  # 处理单张图片
  npm run cli -- -i input.webp -o output_dir
  
  # 批量处理整个目录
  npm run cli -- -i ./my_folder -o ./processed_results
  ```
- **输出**：自动将处理后的图片重命名并保存为 PNG (或指定格式)。

### 3. 油猴脚本 (Userscript)
无缝集成在 Gemini 官网页面中。
- **安装**：安装 `dist/userscript/gemini-watermark-remover.user.js`。
- **功能**：在 Gemini 生成图片时，右键或通过拦截器直接获取无水印版本。

---

## 🔬 技术原理简述
Gemini 的水印是在生成图层上覆盖了一个固定透明度的 Logo。本工具通过：
1. **校准**：获取水印在 48x48 和 96x96 两种规格下的精确 Alpha 映射。
2. **定位**：根据图像尺寸算法定位水印位置。
3. **解算**：使用公式 `Original = (Watermarked - Alpha * Logo) / (1 - Alpha)` 完美还原像素。

---

## ⚠️ 注意事项
- 本工具仅适用于 Gemini AI 原生生成的包含“Made with Google AI”水印的图片。
- 请确保输入的图片未经缩放、裁剪或二次压缩，否则算法定位和 Alpha 校准可能会偏移。
- 仅供学习与技术交流使用。
