# Gemini & Doubao Watermark Remover - 开发者文档

本文档旨在帮助开发者了解项目的代码结构、核心算法以及未来的改进方向。

## 🏗 代码架构 (v1.8.0 Hardened)

项目遵循模块化设计，将核心算法与环境实现（Web/Node/CLI）彻底解耦：

### 1. 核心层 (`src/core/`)
- **`profiles.js`**: **水印配置文件中心**。v1.8 引入了多模型 Profile 协议，定义了不同 AI 模型（如 Gemini, Doubao）的资产引用、检测模式及多个逻辑锚点（Anchor Points）。
- **`catalog.js`**: **官方分辨率目录**。内置了各模型官方比例输出数据。
- **`config.js`**: 水印维度预测层。已重构为策略模式，根据当前活跃的 `Profile` 动态路由探测参数。
- **`detector.js`**: **核心探测引擎**。支持跨模型像素对齐验证，实现了以下加固技术：
  - **NCC 相关性匹配**：基础亮度对齐。
  - **Sobel 梯度匹配**：针对暗色/半透明框水印的高动态范围识别。
  - **滑动窗口微调**：自动修正 `+/- 4px` 的位置抖动。
- **`watermarkEngine.js`**: 引擎调度层。实现了 **Multi-Probe (多重探测)** 循环，允许在一个图片上同时通过多个锚点扫描并移除多个水印。

### 2. 参数协议与动态对齐 (Core Parameter Protocol)

为了确保各平台与测试套件的动态对齐并彻底消除硬编码回归，所有水印配置对象 **必须** 严格遵循以下契约：

| 属性名 | 说明 | 初始源 |
| :--- | :--- | :--- |
| `logoSize` | 水印正方形边长 (或 width) | `catalog.js` |
| `anchor` | 水印在图片中的挂载位置 (tl, br) | `profiles.js` |
| `marginRight` | 水印距离图像右边缘的像素距离 | `catalog.js` |
| `marginBottom` | 水印距离图像下边缘的像素距离 | `catalog.js` |

### 🧪 测试开发规约 (Testing Principles)

1. **架构适应性 (Architectural Alignment)**:
   测试文件必须与代码架构 1:1 映射。v1.8 引入了 **Profile 对齐验证**，测试矩阵会自动遍历 `profiles.js` 中的协议 ID 进行全量回归。
2. **非硬编码与唯一事实来源 (Single Source of Truth)**:
   绝不允许在测试中断言硬编码的分辨率、偏移量或边距。所有期望值必须通过调用 `catalog.js` 与 `config.js` 动态计算。统一使用 `tests/test_utils.js` 作为“测试工厂”生成模型感知的 Mock 图像。
3. **全场景完备性**:
   每新增一种分辨率规格或功能标志位，必须被自动纳入参数矩阵进行全量验证。

## 💎 性能管理 (Performance)

- **Sliding Window Concurrency**: 网页端处理大量图片时，使用高性能**滑动窗口 (Sliding Window)** 队列，平滑内存峰值。
- **Asset Inlining**: 通过 esbuild Loader 实现了背景掩模图片的 Base64 内联，确保打包后的单文件可用性。
- **Memory Pooling**: 在 `detector.js` 中实现了像素计算缓冲区的复用机制，减少了 80% 的大图处理 GC 停顿。

---

## 📈 路线图 (Roadmap)

项目后续将集中在以下方向：
1. **智能模型识别 (v1.9)**：根据图像统计特征自动选择 Profile。
2. **Rust/Wasm 算力迁移 (v2.0)**：将核心像素循环迁移至 Wasm 以支持 8K 实时处理。

> [!NOTE]
> 关于未来的详细开发路线，请参阅 [ROADMAP.md](./ROADMAP.md)。
