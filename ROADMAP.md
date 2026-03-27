# Gemini Watermark Remover - Roadmap

本项目旨在打造全球最精进、最高效的 AI 去水印生产力工具。以下是我们的长期演进目标。

## 📍 当前状态 (v1.1 - Stable)
- [x] 核心算法无损重构 (`Math.fround`)
- [x] 稳健检测：基于 NCC 与 Top-5 插入排序的高精度、高性能定位算法
- [x] 智能判定：自适应 48px/96px 尺寸切换与维度触发逻辑 (MinSide >= 720)
- [x] 工程化标准：Windows 兼容构建、Lint、Prettier 及 GitHub Actions CI
- [x] 自动化验证：通过 **37 项** 可重现压力测试 (Seeded PRNG Adversarial Suite)
- [x] 安全加固：内置 XSS 转义与内存泄漏主动防御系统
- [x] Web Worker 持久化调度与主线程副本回退 (Fallback) 协议
- [x] 支持 JSON/Pipe/并发的标准化 CLI
- [x] 带有类型提示的 Python 桥接 SDK 及 Tkinter 线程安全 GUI

---

## 🚀 次世代计划 (Next Phase: 2026 Q2)

### 🎨 视觉与交互增强
- **实时对比引擎导出**：支持导出对比预览图（Split view / Difference mask）。
- **批量处理仪表盘**：网页版提供可视化的处理进度波形图和内存压力红线。

### 🧠 智能特征库扩展 (Universal Support)
- **通用水印插件系统**：支持 DALL-E 3、Midjourney 等不同模型的水印建模，实现一键通用去除。
- **轻量级去噪预处理**：针对 JPEG 强制压缩导致的边缘伪影，加入可选的智能边缘重构。

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

---

## ⚖️ 设计哲学 (Philosophy)
1. **KISS**: 逻辑简单，胜过过度工程。
2. **Privacy**: 数据绝不出本地，这是我们的底线。
3. **Accuracy**: 数学还原，拒绝 AI 生成（Inpainting）带来的不确定性。
