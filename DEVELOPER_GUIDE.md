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
- **`worker.js`**: Web Worker 脚本，处理高密度的像素运算，确保网页不卡顿。
- **`cli.js`**: (New) Node.js 命令行入口，利用 `sharp` 库实现本地高性能图像 I/O。
- **`userscript/`**: 包含油猴脚本逻辑。
- **`tests/`**: (New) 原生测试套件，包含 `core_native.test.js` (核心逻辑) 和 `integration_native.test.js` (全流程仿真)。

---

## 🧮 核心算法：反向 Alpha 混合

水印合成公式：
`C_out = C_src * (1 - alpha) + C_logo * alpha`

去水印还原公式：
`C_src = (C_out - C_logo * alpha) / (1 - alpha)`

### 💎 参数一致性与动态对齐 (Best Practices)
在处理反向算法时，必须注意**浮点数精度的放大效应**：
- **误差放大**: 在 `alpha` 较高（如 0.95）时，分母 `(1 - alpha)` 极小，此时 `watermarked` 像素点的 1 单位四舍五入误差会被放大 20 倍。
- **动态容差测试**: 在编写单元测试时，测试用例应当根据 `alpha` 的值动态计算 `tolerance`（容差），计算公式建议为 `Math.ceil(0.51 / (1 - alpha))`。
- **类型安全**: 跨环境传递图像数据（如 CLI 中的 Buffer 到 Uint8ClampedArray）时，应始终通过 `.buffer` 引用底层物理内存，确保数据的一致性对齐。

---

## 📈 路线图 (Roadmap)

### 第一阶段：架构优化 (COMPLETED ✅)
- [x] 核心算法与 DOM 环境彻底解耦。
- [x] 引入 Web Worker 异步处理。
- [x] 实现高性能 Node.js CLI。
- [x] 建立 100% 覆盖核心逻辑的原生自动化测试套件。

### 第二阶段：检测与增强 (Short-term 🚀)
- [ ] **多模型支持**：引入其它 AI 模型（如 DALL-E, Midjourney）的水印特征库。
- [ ] **像素级特征检测**：不依赖 EXIF，通过采样边缘像素特征自动判定水印区域。
- [ ] **批量导出优化**：Web 端支持更高效的 ZIP 实时流式压缩。

### 第三阶段：工程化提升 (Long-term 🛠)
- [ ] **WebAssembly (Wasm) 迁移**：将像素混合循环迁移至 Rust，提升极特大分辨率图片的处理速度。
- [ ] **移动端应用 (PWA)**：完全适配移动端，支持拍照即去。
