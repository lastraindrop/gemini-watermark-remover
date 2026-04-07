# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.7.0 Production - Precision & Consistency)
- [x] **Full Sub-pixel Alignment (v1.7.0)**: Bilinear interpolation for BOTH image data and Alpha masks (eliminating edge artifacts perfectly).
- [x] **Unified Perceptual Detection (v1.7.0)**: Standardized 0.299R+0.587G+0.114B formula across mask extraction and detection engine.
- [x] **Clean Mode Labeling (v1.7.0)**: Fixed heuristic labeling bug to ensure accurate anchored/aligned/free status reporting.
- [x] **CLI Robustness (v1.7.0)**: Automatic extension fallback and enhanced integration testing for edge paths.
- [x] **Stress Test Audit Loop (v1.7.0)**: Dedicated `test:stress` for deep memory stability verification.
- [x] **Premium UI/UX (v1.6.0)**: Glassmorphism, dark mode, and smooth micro-animations.
- [x] **PWA Support (v1.6.0)**: Installable desktop/mobile app via Service Worker & Manifest.
- [x] **Safe DOM Architecture (v1.6.0)**: 100% removal of `innerHTML` for XSS-proof UI.
- [x] **Keyboard Shortcuts (v1.6.0)**: `←/→` for slider, `Esc` for reset, `Ctrl+S` for save.
- [x] **Clipboard Paste (v1.6.0)**: Global `Ctrl+V` support in `src/app.js` for instant removal.
- [x] **Auto-Download Workflow (v1.6.0)**: Integrated automatic download logic with UI toggle.
- [x] **Desktop Path Persistence (v1.6.0)**: Python GUI `prefs.json` for directory memory.
- [x] **Exhaustive Testing Matrix (v1.6.0)**: 130+ test cases (Security, Edge cases, i18n, Matrix).
- [x] **Production Hardening (v1.6.0)**: Fixed Python GUI crashes, memory leaks, and XSS vulnerabilities.
- [x] **Official Tier Badge (v1.6.0)**: Restored precise catalog matching for official resolutions.
- [x] **Memory Pooling (Detector Core)**: Persistent buffer reuse (85% GC reduction).
- [x] **Streaming Directory Mode**: Async Generator-based processing for massive batches.
- [x] **Parametric Autonomy (v1.6.0)**: Hardened consistency protocol and dynamic tier detection.

---

### ⚡ 核心能力外溢
- [x] **v1.7.0: Sub-pixel Alignment (亚像素级对齐)**：针对非整数坐标的高分辨率输出，实现像素插值还原，消除缩放图像的极细微锯齿。
- [x] **v1.7.0: Perceptual Detection (感知级探测)**：升级亮度计算公式，提升其在彩色/复杂背景下的捕捉精度。
- [x] **v1.7.0: Adaptive SNR Weighting**：动态熵权分配，自动抑制低纹理背景下的梯度噪声影响。
- [x] **v1.7.0: Hyper-Fast CI/Local Testing**：通过并发执行与分级 Mock 策略，大幅缩碳自动化验证周期。
- **v1.8: Rust-driven Wasm Core (Alpha)**：使用 Rust 彻底重写像素混合逻辑，针对 8K+ 分辨率提升 3-5 倍的处理速度。 (Researching)
- **v1.8: Image Genesis 3 Sync**: 加入最新 Google 生成模型的视觉标记指纹库。 (Pending Model Release)


---

## 🚀 次世代计划 (Next Phase: 2026 Q2)

### 🎨 架构解耦与多模型支持 (Strategic Abstraction)
- **多模型策略模式 (Strategy Pattern)**：重构 `src/core/config.js`，将目前硬编码的 Gemini 规则抽象为通用的 `WatermarkProfile` 协议。
- **扩展指纹库**：研究并集成 DALL-E 3 (彩色 Logo, 不同锚点) 和 Midjourney 的水印建模逻辑。
- **RGB Alpha 掩膜**：升级 `alphaMap` 逻辑以支持彩色水印的反向混合还原。

### 🎨 视觉与交互增强
- **智能切边还原 (Auto-Crop Repair)**：针对被人工裁剪过的水印残余，实现自动检测并扩边还原。
- **实时对比预览**：在网页端支持 Side-by-Side 实时差异比对图。

### 🧠 智能特征库扩展 (Universal Support)
- **通用水印插件系统**：支持 DALL-E 3、Midjourney 等不同模型的水印建模。

### 🧪 测试与工程化基础设施 (Test & Infrastructure Hardening)
- **CI 专属穷尽矩阵 (Environment-Aware Matrix)**：解除本地测试矩阵的限速，在 CI/CD 流水线中强制执行所有超大分辨率与降噪组合的笛卡尔积穷尽测试。
- **CLI 流式内存泄漏监控 (Memory Leak Automation)**：在 Node.js 集成测试中引入 `process.memoryUsage()` 快照比对，验证大批量目录处理时的堆栈健康度。
- **真实浏览器集成测试 (Browser Automation)**：引入 Playwright 或 Puppeteer，对 Web Worker 线程调度、DOM 状态锁和 PWA 缓存进行端到端的真实环境验证。
- **极端色彩空间边界测试 (Color Profile Edge Cases)**：扩充核心数学层测试用例，涵盖带预乘 Alpha 通道的原图、纯色极简图以及 HDR 高色域溢出模拟，彻底消除底层逆向混合算法在非标准图像上的计算盲区。

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
