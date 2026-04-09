# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.7.5 Production - Architecture Hardened)
- [x] **Strategic Abstraction (v1.7.5)**: Decoupled `src/core/profiles.js` from hardcoded logic, enabling the Strategy Pattern for multi-model protocols.
- [x] **Multi-Model UI Support (v1.7.5)**: Added Profile Selector to the frontend, supporting Gemini, DALL-E, and custom AI profiles.
- [x] **Detection Confidence Probe (v1.7.5)**: Real-time certainty reporting (Confidence %) in UI and Audit Console for better quality assurance.
- [x] **Dynamic Test Matrix (v1.7.5)**: Unit tests now dynamically adapt to `Profiles` and `Catalog` data, eliminating hardcoded magic numbers.
- [x] **Full Sub-pixel Alignment (v1.7.0)**: Bilinear interpolation for BOTH image data and Alpha masks.
- [x] **Unified Perceptual Detection (v1.7.0)**: Standardized 0.299R+0.587G+0.114B formula across mask extraction and detection engine.
- [x] **Clean Mode Labeling (v1.7.0)**: Fixed heuristic labeling bug to ensure accurate anchored/aligned/free status reporting.
- [x] **CLI Robustness (v1.7.0)**: Automatic extension fallback and enhanced integration testing for edge paths.
- [x] **Audit Console v1.0**: Pro-grade logging window in `src/app.js` for real-time engine diagnostics.
- [x] **Premium UI/UX (v1.6.0)**: Glassmorphism, dark mode, and smooth micro-animations.
- [x] **PWA Support (v1.6.0)**: Installable desktop/mobile app via Service Worker.
- [x] **Keyboard Shortcuts (v1.6.0)**: `←/→` for slider, `Esc` for reset, `Ctrl+S` for save.
- [x] **Clipboard Paste (v1.6.0)**: Global `Ctrl+V` support for instant removal.
- [x] **Streaming Directory Mode**: Async Generator-based processing for massive batches.

---

### ⚡ 核心能力外溢
- [x] **v1.7.5: Profile Strategy (架构策略重构)**：系统逻辑与品牌型号彻底解耦，支持第三方水印协议注入。
- [x] **v1.7.5: Dynamic Test Alignment (动态测试对齐)**：测试套件自动跟随架构参数漂移，消除参数不一致导致的硬编码坏味道。
- [x] **v1.7.0: Sub-pixel Alignment (亚像素级对齐)**：实现像素插值还原，消除缩放锯齿。
- [x] **v1.7.0: Perceptual Detection (感知级探测)**：升级亮度权重公式，提升复杂背景捕捉精度。
- **v1.8: Rust-driven Wasm Core (Targeted)**：通过 Wasm 实施核心像素算力加速，适配 8K 极清图像处理。 (In Development)

---

## 🚀 次世代计划 (Next Phase: 2026 Q3)

### 🎨 指纹库泛化 (Universal Model Support)
- **集成多种水印协议**：基于 `Profile` 协议，正式发布针对 DALL-E 3、Midjourney 等模型的水印去除支线。
- **智能 Profile 自动识别**：基于图像元数据或局部视觉特征，自动为用户匹配最佳去水印方案。

### 🎨 高级工具链与效能
- **Web Worker 分片渲染**：针对超大图像实现切片并行处理，进一步挖掘多核性能。
- **开发者 CLI 增强**：支持通过命令行快速导出特定分辨率下的 Alpha Map 调试信息。

---

## 🛠 长期愿景 (Long-term: 2026 Q4 & Future)

### 🌐 生态扩展 (Ecosystem)
- **全平台浏览器插件**：实现后台自动拦截 Gemini/Google Images 图片并实时提供纯净预览下载。
- **iOS/Android 原生集成**：通过 Capacitor 实现移动端 App，支持系统“分享”菜单直接去水印。

### ⚡ 性能天花板 (Performance)
- **Rust / WebAssembly 深度迁移**：将整个像素循环（alphaMap & blendModes）通过 Rust 重新实现，针对超高分辨率 (8K+) 获取原生级别的处理性能。
- **边缘算力共享 (Optional)**：探索基于 P2P 的批量处理能力加速（实验性）。

### 🤖 泛化支持 (Generalized Support)
- **通用 AI 视觉指纹库**：支持多款 AI 生成器（如 Midjourney, DALL-E, Stable Diffusion 各类定制水印）的特征识别与数学还原。

### 📖 Core Detection Algorithm (v1.5)
The engine uses a tiered approach:
1. **Catalog Matching**: O(1) resolution lookup.
2. **Noise-Aware NCC**: Optimized Normalized Cross-Correlation. If `noiseReduction` is enabled, a Fast Box Blur is applied to the detection copy to improve SNR.
3. **Edge Crop Tolerance**: The search range and NCC calculation allow for negative coordinates and pixel overflow, enabling detection of watermarks that have been partially cropped.
4. **Deep Sobel Gradient Scan**: NCC of image gradients for final verification.

---

## ⚖️ 设计哲学 (Philosophy)
1. **KISS**: 逻辑简单，胜过过度工程。
2. **Privacy**: 数据绝不出本地，这是我们的底线。
3. **Accuracy**: 数学还原，拒绝 AI 生成（Inpainting）带来的不确定性。
