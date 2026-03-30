# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.5 - Production Hardening)
- [x] **Smart Edge Crop Tolerance**: Detect and remove watermarks even if partially outside image boundaries. (v1.5)
- [x] **Adaptive Noise Reduction**: Enhanced detection confidence via pre-processing for low SNR images. (v1.5)
- [x] **Batch Bounded Directory Mode**: Memory-safe automated batch processing for huge folders. (v1.5)
- [x] **Tiered Hybrid Detection**: NCC + Sobel Gradient + Catalog matching. (v1.5)
- [x] **Standardized Testing (node:test)**: Comprehensive test suite for all tiers (39+ tests). (v1.5)
- [x] **Parameter Protocol Enforcement**: Hardened `logoSize/marginRight` consistency across engine and tests. (v1.5)

---

### ⚡ 核心能力外溢
- **v1.6: Sub-pixel Alignment (亚像素级对齐)**：针对非整数坐标的水印进行像素插值还原，消除锯齿感。
- **v1.6: Dynamic Parameter Autonomy**: 实现基于探测反馈的动态参数对齐，允许微调 `margin` 偏移量。
- **v1.7: Multi-model Presets**: 加入 Imagen 3 等其他 AI 模型的水印特征。
- **v1.7: Wasm Core (Alpha)**：将 NCC 探测与 Alpha 合成迁移至 Rust 以对抗 8K 巨图。

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
