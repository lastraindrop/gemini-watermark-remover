# Gemini Watermark Remover - 开发者文档

本文档旨在帮助开发者了解项目的代码结构、核心算法以及未来的改进方向。

## 🏗 代码架构

项目遵循模块化设计，将核心算法与环境实现（Web/Node）彻底解耦：

### 1. 核心层 (`src/core/`)
- **`config.js`**: 纯逻辑模块。包含 `detectWatermarkConfig` 和 `calculateWatermarkPosition`。
- **`alphaMap.js`**: 负责从预设的校准图中计算 Alpha 透明度映射表。
- **`blendModes.js`**: 核心算法实现。统一导出了 `removeWatermark` 函数供 Web Worker 和主线程公用，使用 `Math.fround` 确保精度一致性。
- **`detector.js`**: (New v1.1) 稳健探测层。使用滑动窗口互相关算法识别水印的精确像素位置，解决 EXIF/尺寸依赖。
- **`watermarkEngine.js`**: 引擎协调层。集成了混合检测逻辑，并实现了 **持久化 Worker** 和 **Canvas 重用**。

---

## 💎 最佳实践与性能 (Performance)

### 1. 多线程模型 (Threading)
- 网页版不再频繁创建 Worker，而是启动时初始化单例 Worker，通过消息传递处理 `Transferable Objects` (ArrayBuffer)，避免大图克隆开销。
- Userscript 版由于跨域限制，默认回退至主线程同步执行。

### 2. 工程化标准 (Engineering Standards)
- **代码规范**：集成 ESLint 和 Prettier 进行风格统一。
- **自动化测试**：使用 Node.js Native Test Runner，覆盖 100% 核心链路。
- **CI/CD**：引入 GitHub Actions 自动验证每一次提交。

### 3. 外部接口化 (Interfacing)
- **CLI 模式**：通过 `node src/cli.js -i <in> -o <out> --json` 实现机器可读输出（包含探测元数据）。
- **Python Bridge**：提供带有完整类型提示的抽象类，方便 AI 工作流集成。

---

## 📈 路线图 (Roadmap)

### 第一阶段：架构优化与标准化 (COMPLETED ✅ v1.1)
- [x] 核心算法与 DOM 环境彻底解耦。
- [x] 引入 Web Worker 异步处理与持久化。
- [x] 实现高性能 Node.js CLI (支持并发、JSON、管道)。
- [x] **稳健探测**：实现基于像素特征的零 EXIF 依赖检测。
- [x] **工程化**：建立标准化 Lint、Format 及 GitHub Actions CI 流水线。
- [x] 提供带有类型提示的 Python 集成 SDK。

### 第二阶段：检测与增强 (Short-term 🚀)
- [ ] **多模型特征提取**：研究 DALL-E 3 和 Midjourney 的水印特征并集成。
- [ ] **网页端实时预览优化**：引入 WebGL 片元着色器加速渲染 A/B 对比效果。
- [ ] **性能压测工具**：开发针对万级图像处理生成的报告评估工具。

### 第三阶段：工程化提升 (Long-term 🛠)
- [ ] **WebAssembly (Wasm) 迁移**：将像素混合循环迁移至 Rust，针对 4K+ 图像极致提速。
- [ ] **浏览器原生插件**：开发跨浏览器的 Extension 自动去水印预览。
- [ ] **移动端应用适配**：利用 Capacitor 或 PWA 提供移动端原生拍摄去水印能力。

