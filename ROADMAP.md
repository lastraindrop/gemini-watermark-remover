# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.1 - Stable)
- [x] 核心算法无损重构 (`Math.fround`)
- [x] 稳健检测：基于像素特征的自适应定位算法
- [x] 工程化标准：Lint、Prettier 及 GitHub Actions CI
- [x] Web Worker 持久化调度与 Canvas 复用
- [x] 支持 JSON/Pipe/并发的标准化 CLI
- [x] 带有类型提示的 Python 桥接 SDK

---

## 🚀 次世代计划 (Next Phase: 2026 Q2)

### 🎨 视觉与交互增强
- **实时对比引擎导出**：支持导出对比预览图（Split view / Difference mask）。
- **批量处理仪表盘**：网页版提供可视化的处理进度波形图和内存压力红线。

### 🧠 智能特征库扩展 (Enhanced Models)
- **多模型支持**：针对 DALL-E 3 和不同版本 Stable Diffusion 的原生水印进行建模与还原。
- **轻量级去噪预处理**：针对 JPEG 强制压缩导致的边缘伪影，加入可选的智能边缘重构。

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

---

## ⚖️ 设计哲学 (Philosophy)
1. **KISS**: 逻辑简单，胜过过度工程。
2. **Privacy**: 数据绝不出本地，这是我们的底线。
3. **Accuracy**: 数学还原，拒绝 AI 生成（Inpainting）带来的不确定性。
