# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.8.0 - Production Ready)
- [x] **Universal Model Integration (v1.8.0)**: Supports Gemini AND **Doubao (豆包)**.
- [x] **Multi-Anchor Verification**: Probing system verifies and removes multiple watermarks (e.g., TL/BR corner combinations) in a single pass.
- [x] **Sliding-Window Hardening**: Automatic Correction of positional jitter (±4px) for perfect mask alignment.
- [x] **Gradient Correlation Core**: Support for transparent/dark-box watermarks using Sobel gradient matching.
- [x] **@pilio Ecosystem Integration**: Package renamed to `@pilio/gemini-watermark-remover`. Added `bin/` and `skills/` for AI Agent compatibility.
- [x] **Modular CLI Architecture**: Refactored CLI into `src/cli/` modules.
- [x] **Detection Confidence Probe**: Real-time certainty reporting (Confidence %) in UI and Audit Console.

---

### ⚡ 核心能力外溢
- [x] **v1.7.5: Profile Strategy (架构策略重构)**：系统逻辑与品牌型号彻底解耦，支持第三方水印协议注入。
- [x] **v1.7.5: Dynamic Test Alignment (动态测试对齐)**：测试套件自动跟随架构参数漂移，消除参数不一致导致的硬编码坏味道。
- [x] **v1.7.0: Sub-pixel Alignment (亚像素级对齐)**：实现像素插值还原，消除缩放锯齿。
- [x] **v1.7.0: Perceptual Detection (感知级探测)**：升级亮度权重公式，提升复杂背景捕捉精度。
- [ ] **v1.9: Intelligent Auto-Profile (Targeted)**: Automatic detection of image generator type via visual fingerprinting.
- [ ] **v2.0: Rust-driven Wasm Core**: Porting pixel loops to Rust for 8K+ ultra-extremes performance.

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

---

## ⚖️ 设计哲学 (Philosophy)
1. **KISS**: 逻辑简单，胜过过度工程。
2. **Privacy**: 数据绝不出本地，这是我们的底线。
3. **Accuracy**: 数学还原，拒绝 AI 生成（Inpainting）带来的不确定性。
