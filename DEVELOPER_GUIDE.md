# Gemini Watermark Remover - 开发者文档

本文档旨在帮助开发者了解项目的代码结构、核心算法以及未来的改进方向。

## 🏗 代码架构

项目遵循模块化设计，将核心算法与环境实现（Web/Node）彻底解耦：

### 1. 核心层 (`src/core/`)
- **`catalog.js`**: (v1.4 New) **官方分辨率目录**。内置了从 512px 到 4096px 的 Gemini 官方比例输出数据。
- **`config.js`**: 水印维度预测。v1.4 已重构为优先调用 `catalog.js` 进行精确匹配，仅在非标准尺寸下使用启发式逻辑。
- **`alphaMap.js`**: 负责从预设的校准图中计算 Alpha 透明度映射表。
- **`blendModes.js`**: 核心算法实现。统一导出了 `removeWatermark` 函数，使用 `Math.fround` 确保各端精度对齐。
- **`detector.js`**: (v1.5 Robust Detection) **分层混合探测器**。
    - **Tier 1: 官方目录匹配**：直接比对官方分辨率锚点，实现秒级高置信度锁定。
    - **Tier 2: 自适应降噪搜索**：(v1.5) 引入 `fastBoxBlur` 预处理。通过对探测副本进行平滑处理提高信噪比（SNR），解决高压缩 JPEG 的识别难题。
    - **Tier 3: 智能切边容错**：(v1.5) 允许探测窗口溢出图像边界，识别并修复部分被裁剪（Occluded）的水印。
    - **Tier 4: 深度 Sobel 梯度扫描**：应用 Sobel 算子进行边缘匹配，提升复杂背景下的稳定性。
- **`watermarkEngine.js`**: 引擎协调层。支持 `noiseReduction` 和 `deepScan` 选项配置。

---

## 💎 最佳实践与性能 (Performance)

### 1. 多线程模型 (Threading)
- 网页版不再频繁创建 Worker，而是启动时初始化单例 Worker，通过消息传递处理 `Transferable Objects` (ArrayBuffer)，避免大图克隆开销。
- **并发协议**：实现了基于 `taskId` 的异步消息映射机制。即使 `app.js` 以高并发模式（`concurrency > 1`）向单例 Worker 发送任务，引擎也能通过 `taskId` 精确归还数据，杜绝了串行污染和竞态条件。
- **容错处理**：Worker 层包装了 `try...catch` 边界。若运算抛错或由于 Transferable Buffer 被 Detach 导致后续操作失效，系统会自动利用预先克隆的 `Uint8ClampedArray` 镜像在主线程无损恢复处理。
- Userscript 版由于跨域限制，默认回退至主线程同步执行。

### 2. 内存管理 (Memory Context)
- **生命周期管控**：在 `utils.js` 中实现了图片加载即释放的策略 (`revokeObjectURL`)。对于批量处理生成的 ZIP Blob，采用 Lease-based 延时释放。
- **Bounded Batching (v1.5)**：目录处理模式引入了有限并发队列方案，防止成千上万张图片同时压入内存导致 OOM。
- **Canvas 重用**：主应用层维持单例对比 Canvas，仅在尺寸变化时重新分配内存。

### 3. 工程化标准 (Engineering Standards)
- **代码规范**：集成 ESLint 和 Prettier 进行风格统一。
- **标准化测试 (v1.5)**：弃用了散乱的脚本，统一使用 Node.js Native Test Runner (`node --test tests/*.test.js`)。
- **测试工厂 (`test_utils.js`)**：引入了标准化的图像与 Alpha 映射工厂，支持 21:9 超宽屏、9:16 人像以及受控噪点注入测试。
- **CI/CD**：引入 GitHub Actions 自动验证每一次提交，确保在 Ubuntu/Node 版本矩阵下表现一致。

### 4. 外部接口化 (Interfacing)
- **CLI 模式**：通过 `node src/cli.js -i <in> -o <out> --json` 实现机器可读输出（包含探测元数据）。
- **Python Bridge**：提供带有完整类型提示的抽象类，方便 AI 工作流集成。

---

## 📈 路线图 (Roadmap)

### 第一阶段：架构优化与标准化 (COMPLETED ✅ v1.1 - v1.2)
- [x] 核心算法与 DOM 环境彻底解耦。
- [x] 引入 Web Worker 异步处理与持久化。
- [x] 实现高性能 Node.js CLI (支持并发、JSON、管道)。
- [x] **稳健探测**：实现基于 **NCC** 与 **Top-5 排名** 的零 EXIF 依赖检测，性能显著提升。
- [x] **高精度逻辑**：支持两阶段搜索（粗查+精调）与智能维度判定。
- [x] **对抗性验证**：建立 `v1.2` 可重现对抗性压力测试套件（Seeded PRNG），达到 100% 检出。
- [x] **工程化**：建立标准化 Lint、Format 及 Windows 兼容的 cross-env CI 流水线。
- [x] **安全加固**：实现 XSS 自动转义与内存泄漏主动防御。
- [x] 提供带有类型提示的 Python 集成 SDK。

### 第二阶段：检测与增强 (Short-term 🚀)
- [ ] **多模型特征提取**：研究 DALL-E 3 和 Midjourney 的水印特征并集成。
- [ ] **网页端实时预览优化**：引入 WebGL 片元着色器加速渲染 A/B 对比效果。
- [ ] **性能压测工具**：开发针对万级图像处理生成的报告评估工具。

### 第三阶段：工程化提升 (Long-term 🛠)
- [ ] **WebAssembly (Wasm) 迁移**：将像素混合循环迁移至 Rust，针对 4K+ 图像极致提速。
- [ ] **浏览器原生插件**：开发跨浏览器的 Extension 自动去水印预览。
- [ ] **移动端应用适配**：利用 Capacitor 或 PWA 提供移动端原生拍摄去水印能力。

