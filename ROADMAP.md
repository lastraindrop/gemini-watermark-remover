# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.9.9 - Final Release ✅)
- [x] **200/200 Tests Pass (v1.9.9)**: Full test suite passes including i18n completeness, frontend interaction, and experimental profile filtering.
- [x] **Zero-Latency Inlining**: All core watermark masks are now embedded as DataURLs to eliminate network overhead.
- [x] **Auto-Brand Synchronization**: UI dynamically adapts its theme color based on the detected AI model (Gemini/Doubao).
- [x] **Hardened Detection (v1.9.0)**: Introduced +/- 4px jitter resilience with distance penalty to handle real-world image offsets.
- [x] **Exhaustive Parameter Matrix**: Automated CI validation across the entire Cartesian product of models and resolutions.

---

### ⚡ 核心能力外溢
- [x] **v1.9.8: Adversarial Robustness (对抗性鲁棒)**：引入极端随机噪声与局部截断样本测试，杜绝假阳性判定。
- [x] **v1.9.8: Performance Inlining (性能内联)**：核心资产随 JS 分发，极大提升 PWA 离线体验。
- [x] **v1.7.5: Profile Strategy (架构策略重构)**：系统逻辑与品牌型号彻底解耦，支持第三方水印协议注入。
- [x] **v1.7.5: Dynamic Test Alignment (动态测试对齐)**：测试套件自动跟随架构参数漂移，消除参数不一致导致的硬编码坏味道。
- [x] **v1.7.0: Sub-pixel Alignment (亚像素级对齐)**：实现像素插值还原，消除缩放锯齿。
- [ ] **v2.0: Rust-driven Wasm Core**: Porting pixel loops to Rust for 8K+ ultra-extremes performance.

---

## 🚀 次世代计划 (Next Phase: 2026 Q3)

### 🎨 指纹库泛化 (Universal Model Support)
- **集成多种水印协议**：基于 `Profile` 协议，发布针对 Midjourney、DALL-E 3 完整版的水印去除支持。
- **智能 Profile 自动识别**：利用轻量级特征分类器，在 AUTO 模式下实现更精准的模型初筛。

### 🎨 高级工具链与效能
- **Rust / WebAssembly 深度迁移**：将像素循环（alphaMap & blendModes）通过 Rust 重新实现，针对超高分辨率 (8K+) 获取原生级别的处理性能。
- **Web Worker 切片渲染**：针对超大图像实现切片并行处理，进一步挖掘多核性能。

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
