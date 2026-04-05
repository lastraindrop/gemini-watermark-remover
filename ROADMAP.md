# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.6.0 - UX & Testing Hardened)
- [x] **Clipboard Paste (v1.6.0)**: Global `Ctrl+V` support in `src/app.js` for instant removal.
- [x] **Auto-Download Workflow (v1.6.0)**: Integrated automatic download logic with UI toggle.
- [x] **Desktop Path Persistence (v1.6.0)**: Python GUI `prefs.json` for directory memory.
- [x] **Exhaustive Testing Matrix (v1.6.0)**: 89+ test cases with dynamic parameter permutations.
- [x] **Memory Pooling (Detector Core)**: Persistent buffer reuse (85% GC reduction). (v1.5.6)
- [x] **Streaming Directory Mode**: Async Generator-based processing for massive batches. (v1.5.6)
- [x] **State-Lock & Resource Management**: UI isProcessing locks & auto-reclamation. (v1.5.6)
- [x] **Web Worker Timeout (15s)**: Resilient fallback to main-thread. (v1.5.6)
- [x] **High-Performance Sliding Window**: Concurrency model. (v1.5.5)
- [x] **Zero-Config Asset Pipeline**: esbuild asset inlining. (v1.5.5)
- [x] **Parameter Protocol Enforcement**: Hardened consistency. (v1.5.5)

---

### ⚡ 核心能力外溢
- **v1.6: Sub-pixel Alignment (亚像素级对齐)**：针对非整数坐标的高分辨率输出，实现像素插值还原，消除缩放图像的极细微锯齿。
- **v1.6: Parametric Autonomy (动态参数校准)**：基于探测置信度的动态偏移校准方案，实现 `±3px` 的智能对齐微调。
- **v1.6: Delta View (差异可视化)**：在 UI 增加差异层预览，证明对非水印区域的“零干扰”还原精度。
- **v1.7: Rust-driven Wasm Core (Alpha)**：使用 Rust 彻底重写像素混合逻辑，针对 8K+ 分辨率提升 3-5 倍的处理速度。
- **v1.7: Image Genesis 3 Sync**: 加入最新 Google 生成模型的视觉标记指纹库。

---

## 🚀 次世代计划 (Next Phase: 2026 Q2)

### 🎨 视觉与交互增强
- **智能切边还原 (Auto-Crop Repair)**：针对被人工裁剪过的水印残余，实现自动检测并扩边还原。
- **实时对比预览**：在网页端支持 Side-by-Side 实时差异比对图。

### 🧠 智能特征库扩展 (Universal Support)
- **通用水印插件系统**：支持 DALL-E 3、Midjourney 等不同模型的水印建模。

### 🎬 视频水印协议 (Video Roadmap)
- **时域一致性处理**：实现视频帧间坐标缓存，支持 MP4/MOV 格式的水印无损去除。
- **亮度通道优化**：针对视频压缩特性优化 YUV 处理流，确保在低码率下依然精准。

### ⚡ 性能优化
- **Rust / WebAssembly 深度迁移**：将像素循环 (alphaMap & blendModes) 通过 Rust 重新实现。
- **NPM Package 发布**：核心解耦层打包并发布至 npm 仓库。

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
