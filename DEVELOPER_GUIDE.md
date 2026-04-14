# GWR Developer Guide (v1.9.1 Hardened)

本文档旨在帮助开发者了解 Gemini Watermark Remover 的项目架构、核心设计模式及开发规范。

## 🏗 代码架构 (v1.9.1 Hardened)

项目遵循“核心与外壳分离”的模块化设计，将核心算法与环境实现彻底解耦：

### 1. 核心算法层 (`src/core/`) - 纯 JS，无依赖
- **`templates/registry.js`**: **模板注册表系统**。这是 v1.8.5 的核心。它解耦了品牌配置与引擎逻辑，支持运行时动态注册水印 Profile（如 Gemini, Doubao）。
- **`detector.js`**: **梯度探测引擎 (v1.9.0加固)**。引入 +/- 4px 滑动窗口抖动搜寻与距离惩罚机制，解决由于图像剪裁或宿主环境缩放带来的亚像素偏移问题。新增多模态评分系统（Anchored/Aligned/Free）。
- **`blendModes.js`**: **数学复原层**。使用反向 Alpha 混合模型，通过双线性插值实现亚像素级的无损复原。
- **`worker.js`**: Web Worker 封装，确保耗时的像素计算不阻塞主线程。

### 2. 应用逻辑层 (`src/app/`) - 浏览器端调度
- **`state.js`**: 全局状态中心。管理处理进度、图片队列及关键的对象 URL 生命周期（防止内存泄漏）。
- **`processing.js`**: 并发控制中心。实现了并发数为 4 的任务调度队列。
- **`ui.js`**: 交互增强工具。统筹 Toast 通知、Audit Log 日志输出及 Premium UI 动效。

### 3. 环境适配层
- **`app.js`**: 浏览器端入口，负责引导 UI 初始化。
- **`src/cli/`**: Node.js 环境下的命令行交互实现，支持批量与 Pipe 模式。

## 💎 设计哲学：动态对齐 (Dynamic Alignment)

为了消除“硬编码坏味道”，GWR 采用**单元测试驱动的参数矩阵**。
- **Single Source of Truth**: 开发者只需在注册表中添加新分辨率或锚点。
- **Auto-Regression**: `tests/product_audit.test.js` 会自动扫描注册表，针对每一个已注册的条目生成虚拟图片进行端到端测试。

## 🛠 开发流程
1. **安装**: `npm install`
2. **开发**: 修改 `src/` 中的模块化文件。
3. **编译**: `node build.js` 将 ESM 模块打包为浏览器可用的单文件。
4. **测试**: `pnpm test` (或 `node --test tests/*.js`) 运行全量审计套件。

## 📍 路线图 (Roadmap)
后续重点在于 **Rust/WASM 性能迁移** 与 **智能模型特征识别**。详情请参阅 [ROADMAP.md](./ROADMAP.md)。
