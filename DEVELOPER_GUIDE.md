# Gemini Watermark Remover - 开发者文档

本文档旨在帮助开发者了解项目的代码结构、核心算法以及未来的改进方向。

## 🏗 代码架构

项目遵循模块化设计，将核心算法与环境实现（Web/Node）彻底解耦：

### 1. 核心层 (`src/core/`)
- **`catalog.js`**: (v1.4 New) **官方分辨率目录**。内置了从 512px 到 4096px 的 Gemini 官方比例输出数据。
- **`config.js`**: 水印维度预测。v1.4 已重构为优先调用 `catalog.js` 进行精确匹配，仅在非标准尺寸下使用启发式逻辑。
- **`alphaMap.js`**: 负责从预设的校准图中计算 Alpha 透明度映射表。
- [x] **Smart Edge Crop Tolerance**: Detect and remove watermarks even if partially outside image boundaries. (v1.5)
- [x] **Adaptive Noise Reduction**: Enhanced detection confidence via pre-processing for low SNR images. (v1.5)
- [x] **Batch Bounded Directory Mode**: Memory-safe automated batch processing for huge folders. (v1.5)
- [x] **Tiered Hybrid Detection**: NCC + Sobel Gradient + Catalog matching. (v1.5)
- [x] **Standardized Testing (node:test)**: Comprehensive test suite with 100% core logic coverage. (v1.5)
- [x] **UI/UX Optimization**: Advanced Engine Parameters toggles and Audit Console. (v1.5)
- **`watermarkEngine.js`**: 引擎调度层。支持 `noiseReduction` 和 `deepScan` 选项配置，并维护单例 Web Worker 与主线程回退。
- **`i18n.js`**: (v1.5.5) **多语言引擎**。支持 5 国语言动态加载与浏览器语言自动识别。

### 2. 交互与持久化实现 (UI & Persistence)
- **设置持久化**: 程序通过 `localStorage` 自动同步用户的 `locale`、`deepScan` 和 `noiseReduction` 偏好。
- **一键剪贴板**: 使用现代 `Clipboard API` 实现 PNG 二进制数据复制。注意：此功能要求环境为 Secure Context (HTTPS 或 localhost)。
- **Audit Console**: 实时追踪引擎状态、Worker 通信耗时及探测置信度，由 `AuditLog` 工具类驱动。

### 3. 参数一致性协议 (Core Parameter Protocol)

为了确保各平台（Web, CLI, Python）与测试套件的动态对齐，所有水印配置对象 **必须** 严格遵循以下命名协议：

| 属性名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `logoSize` | `Number` | 水印正方形边长 (通常为 48 或 96) |
| `marginRight` | `Number` | 水印距离图像右边缘的像素距离 |
| `marginBottom` | `Number` | 水印距离图像下边缘的像素距离 |
| `isOfficial` | `Boolean` | (可选) 是否匹配官方分辨率目录条目 |

**逻辑优先级与动态对齐 (Dynamic Alignment)**：
1. **Catalog Match**: 优先检索 `catalog.js`。若命中，则直接应用官方偏移量，跳过启发式计算。
2. **Heuristic Fallback**: 若未命中官方分辨率，则在 `config.js` 中根据图像长边 (maxSide) 进行分阶预测。
3. **Anti-Regression Testing**: 每次更新参数协议或配置规则后，**必须** 运行 `npm test`。现有的 `consistency.test.js` 会自动化校验 512px 到 4096px 的全路径参数一致性，防止 `logoSize` 或 `margin` 的硬编码回归。

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
- **标准化测试 (v1.5)**：使用 Node.js Native Test Runner (`npm test`)。
- **验证范围**：覆盖了 `blendModes` 精度、`catalog` 容差、`config` 优先级、`detector` 置信度及 CLI 集成。
- **测试工厂 (`test_utils.js`)**：支持 20MB+, 21:9 超宽屏、9:16 人像以及受控噪点注入测试。
- **CI/CD**：引入 GitHub Actions 自动验证每一次提交，确保在 Ubuntu/Node 版本矩阵下表现一致。

### 4. 外部接口化 (Interfacing)
- **CLI 模式**：通过 `node src/cli.js -i <in> -o <out> --json` 实现机器可读输出（包含探测元数据）。
- **Python Bridge**：提供带有完整类型提示的抽象类，方便 AI 工作流集成。

---

## 📈 路线图 (Roadmap)

### 第一阶段：架构优化与标准化 (COMPLETED ✅ v1.1 - v1.5.5)
- [x] **v1.1-1.2**: 核心算法解耦、Web Worker 单例化、Node.js CLI 工具链。
- [x] **v1.5**: 分级混合探测 (NCC/Sobel)、官方目录数据库 (`catalog.js`)、切边容错支持。
- [x] **v1.5.5**: 设置持久化、一键剪贴板复制、五国语言支持 (ZH, EN, RU, FR, JA)。

### 第二阶段：检测与增强 (Short-term 🚀)
- [ ] **多模型特征提取**：研究 DALL-E 3 和 Midjourney 的水印特征并集成。
- [ ] **网页端实时预览优化**：引入 WebGL 片元着色器加速渲染 A/B 对比效果。

### 第三阶段：工程化提升 (Long-term 🛠)
- [ ] **WebAssembly (Wasm) 迁移**：将像素混合循环迁移至 Rust，针对 4K+ 图像极致提速。
- [ ] **浏览器原生插件**：开发跨浏览器的 Extension 自动去水印预览。
- [ ] **移动端应用适配**：利用 Capacitor 或 PWA 提供移动端原生拍摄去水印能力。

> [!NOTE]
> 关于未来的详细开发路线，请参阅 [ROADMAP.md](./ROADMAP.md)。
