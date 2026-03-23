# Gemini Watermark Remover - 开发者文档

本文档旨在帮助开发者了解项目的代码结构、核心算法以及未来的改进方向。

## 🏗 代码架构

项目遵循模块化设计，将核心算法与环境实现（Web/Node）彻底解耦：

### 1. 核心层 (`src/core/`)
- **`config.js`**: (New) 纯逻辑模块。包含 `detectWatermarkConfig` 和 `calculateWatermarkPosition`。它是环境无关的，方便单元测试。
- **`alphaMap.js`**: 负责从预设的校准图中计算 Alpha 透明度映射表。
- **`blendModes.js`**: 核心算法实现。执行反向 Alpha 混合数学运算。
- **`watermarkEngine.js`**: 引擎协调层。在浏览器环境下负责 Canvas 操作和资源加载。

### 2. 环境实现层
- **`app.js`**: 网页版主逻辑，负责 UI 交互、Object URL 管理及 `medium-zoom` 集成。
- **`worker.js`**: (New) Web Worker 脚本，处理高密度的像素运算，确保网页不卡顿。
- **`cli.js`**: (New) Node.js 命令行入口，利用 `sharp` 库实现本地高性能图像 I/O。
- **`userscript/`**: 包含油猴脚本逻辑，通过拦截网络请求或 DOM 注入实现功能。

---

## 🧮 核心算法：反向 Alpha 混合

水印合成公式：
`C_out = C_src * (1 - alpha) + C_logo * alpha`

去水印还原公式：
`C_src = (C_out - C_logo * alpha) / (1 - alpha)`

**开发重点**：
- `alpha` 的精度至关重要。本项目通过 `src/assets/` 下的 48px 和 96px 背景校准图实时计算 alpha 值。
- 为了防止计算出的像素值超出 [0, 255] 范围，算法在最后阶段执行了 `clamp` 操作。

---

## 🛠 构建与测试

### 构建系统
项目使用 `build.js` 驱动 `esbuild` 进行构建：
- **DataURL 注入**：`.png` 资源被自动转为 DataURL 注入 JS，实现零外部依赖加载。
- **多端输出**：一次构建同时生成 Web App、Web Worker 和 Userscript。

### 自动化测试
项目实现了**零依赖原生测试套件**：
- **运行命令**：`npm test`
- **实现方式**：利用 Node.js v22 内置的 `node:test` 运行 `tests/*_native.test.js`。
- **规范**：每次修改 `src/core/` 逻辑后，必须确保所有测试用例通过。

---

## 📈 未来改进方向 (Roadmap)
1. **多模型适配**：目前仅支持 Gemini，未来可引入其它 AI 模型（如 Midjourney, DALL-E）的水印校准参数。
2. **AI 水印检测**：目前通过 EXIF 信息判断，未来可添加简单的像素特征检测来增强稳定性。
3. **WebAssembly 分离**：对于极其巨大的图像，可以考虑将 `blendModes` 迁移至 Rust/Wasm。

---

## 👨‍💻 贡献指南
1. 始终保持 `src/core/` 的纯净度（环境无关）。
2. 在 `package.json` 中保持极简的依赖链。
3. 任何 UI 修改需符合“Premium & Dynamic”的设计准则。
