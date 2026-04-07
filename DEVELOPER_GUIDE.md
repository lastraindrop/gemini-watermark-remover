# Gemini Watermark Remover - 开发者文档

本文档旨在帮助开发者了解项目的代码结构、核心算法以及未来的改进方向。

## 🏗 代码架构

项目遵循模块化设计，将核心算法与环境实现（Web/Node）彻底解耦：

### 1. 核心层 (`src/core/`)
- **`catalog.js`**: (v1.4 New) **官方分辨率目录**。内置了从 512px 到 4096px 的 Gemini 官方比例输出数据。
- **`config.js`**: 水印维度预测。v1.4 已重构为优先调用 `catalog.js` 进行精确匹配。
- **`alphaMap.js`**: 负责从预设的校准图中计算 Alpha 透明度映射表。
- **`blendModes.js`**: (v1.7.0 Hardened) **反向 Alpha 混合**。实现了 **双线性插值 (Bilinear Interpolation)**，支持浮点级亚像素对齐。
- **`detector.js`**: (v1.7.0 Precision) **水印探测引擎**。引入了 **感知亮度公式 (Perceptual Luminance)** 和 **熵权自适应滤波 (Entropy-Adaptive SNR)**。
- **`watermarkEngine.js`**: 引擎调度层。支持 `noiseReduction` 和 `deepScan` 选项配置。
- **`i18n.js`**: (v1.5.5) **多语言引擎**。支持 5 国语言动态加载、浏览器语言自动识别与全局动态 ID 映射。
- **PWA (v1.6.0)**: 通过 `sw.js` 和 `manifest.json` 实现本地安装与离线资产缓存。

### 2. 交互与持久化实现 (UI & Persistence)
- **设置持久化**: 程序通过 `localStorage` 自动同步用户的 `locale`、`deepScan` 和 `noiseReduction` 偏好。
- **一键剪贴板**: 使用现代 `Clipboard API` 实现 PNG 二进制数据复制。注意：此功能要求环境为 Secure Context (HTTPS 或 localhost)。
- **Audit Console**: 实时追踪引擎状态、Worker 通信耗时及探测置信度，由 `AuditLog` 工具类驱动。在 v1.6.0 中增加了非开发环境下的自动折叠逻辑。
- **UI Security (v1.6.0 Hardened)**: 移除了 `app.js` 中所有 `innerHTML` 调用。所有状态更新（如 `updateStatus`）均通过 `document.createTextNode` 或 `createElement` 动态生成。

### 3. 参数协议与动态对齐 (Core Parameter Protocol v1.5.5)

为了确保各平台（Web, CLI, Python）与测试套件的动态对齐并彻底消除硬编码回归，所有水印配置对象 **必须** 严格遵循以下契约：

| 属性名 | 类型 | 说明 | 初始源 |
| :--- | :--- | :--- | :--- |
| `logoSize` | `Number` | 水印正方形边长 (通常为 48 或 96) | `catalog.js` |
| `marginRight` | `Number` | 水印距离图像右边缘的像素距离 | `catalog.js` |
| `marginBottom` | `Number` | 水印距离图像下边缘的像素距离 | `catalog.js` |
| `isOfficial` | `Boolean` | 是否匹配官方分辨率目录条目 | `detectWatermarkConfig` |

**高级引擎选项 (Advanced Options)**：
- `deepScan`: (Default: `true`) 启用后将额外对图像梯度进行 Sobel 扫描，大幅提升复杂背景下的识别精度。
- `noiseReduction`: (Default: `false`) 针对 JPEG 高压缩产生的“蚊状噪声”，在探测前进行快速 Box Blur 预处理。

**自动化对齐与红线机制 (Enforcement)**：
1. **Catalog Single Source**: 所有的官方 Tier 参数统一维护在 `src/core/catalog.js`。这是系统的**唯一事实来源 (Single Source of Truth)**。严禁在 UI 层或 Python 层硬编码这些偏移量。
2. **Data-Driven Validation**: 每次修改参数协议后，**必须** 运行 `npm test`。现有的 `tests/consistency.test.js` 和 `tests/catalog.test.js` 会动态拉取目录条目进行全量校验，绝非硬编码比对。
3. **Hyper-Fast Test Matrix (v1.7.0 Optimized)**: 测试套件现已优化为双轨制。默认 `npm test` 通过 **256x256 级并行 Mock** 和 **分级探测逻辑**，将 138+ 用例的总时间压缩至 30 秒内（提升 30 倍）。任何新的引擎参数都应在 `tests/test_utils.js` 的 `generateParameterMatrix` 中注册。
4. **Stress Testing (v1.7.0)**: 使用 `npm run test:stress` 命令可以触发深度的内存压力审计（500 次大图循环），用于针对 Buffer 复用逻辑的长周期验证。

### 🧪 测试开发规约 (Testing Principles)
为避免出现历史版本中的参数硬编码与环境隔离失效问题，未来所有新提交的模块与测试必须严格遵守以下三大纪律：

1. **架构适应性 (Architectural Alignment)**:
   测试文件必须与代码架构 1:1 映射（例如：`core_math` 验证底层算子，`detector` 验证调度策略，`watermarkEngine` 验证 Worker 生命周期与异常降级）。禁止跨层调用引发隐式副作用。
2. **非硬编码与唯一事实来源 (DRY & Single Source of Truth)**:
   绝不允许在测试中断言硬编码的分辨率、偏移量或边距（如 `assert(pos.x === 928)`）。所有期望值必须通过调用 `catalog.js` 与 `config.js` 动态计算得出。统一使用 `tests/test_utils.js` 作为“测试工厂”生成 Mock 图像和 Alpha 贴图，彻底消除冗余代码。
3. **全场景完备性与沙箱隔离 (Completeness & Isolation)**:
   - **自动化矩阵**：每新增一种分辨率规格或功能标志位（如 `noiseReduction`），必须被自动纳入参数矩阵进行全量验证，确保没有组合遗漏。
   - **沙箱级清理**：所有修改全局对象（如 `global.window`、`Worker` 模拟）或操作内部持久化缓冲区（如 `detectWatermark._blurBuffer`）的测试，必须通过严格的 `before/after` 钩子进行环境清理，确保并发测试执行时的绝对纯净与无状态。

---

## 💎 最佳实践与性能 (Performance)

### 1. 多线程与并发模型 (Threading & Concurrency)
- **Sliding Window Model (v1.5.5)**: 网页版处理大量图片时，不再使用简单的 `Promise.all` 分块，而是采用高性能**滑动窗口 (Sliding Window)** 队列。在一个 Worker 任务完成后立即填充下一个，极大提升了多核心 CPU 的利用率，并防止大内存峰值导致的 OOM。
- **Streaming Directory Processing (v1.5.6)**: 针对全目录扫描，引入了 **Async Generator**。通过 `for await...of` 驱动的文件流性能优异。
- **Parallel Test Execution (v1.7.0)**: 使用 `node --test --test-concurrency` 实现了跨文件并行验证。这不仅提升了开发速度，也为未来集成更多高频 CI/CD 流程奠定了基础。
- **Resilient Worker Context & Timeouts**: 网页版采用单例 Worker。v1.5.6 引入了 **15秒强制超时检测**。若 Worker 线程在处理极高分辨率或异常图片时挂起，主线程会自动触发 Fallback 机制，切换至串行模式完成任务，保障队列的连续性。

### 2. 内存管理与优化 (Memory Management)
- **内存缓冲池 (Memory Pooling)**: 在 `src/core/detector.js` 中实现了像素计算缓冲区的复用机制。通过持久化持有的 `Float32Array`（用于梯度计算）和 `Uint8ClampedArray`（用于快速均值滤波），消除了高频处理时的内存瞬时分配。这在 4K 图像连续处理场景下能减少约 80% 的垃圾回收 (GC) 停顿。
- **生命周期管控**：在 `utils.js` 中实现了图片加载即释放的策略 (`revokeObjectURL`)。对于批量处理产生的 ZIP Blob，采用按需撤销 (On-demand revocation)。
- **UI 状态锁与自动回收**: `app.js` 维护了 `isProcessing` 状态位，并与 `objectUrlManager` 联动。当用户点击“重置”或新任务开始时，会强制执行 `URL.revokeObjectURL` 的全量清理，确保浏览器内存占用在任务结束后迅速回落。

### 3. 工程化标准 (Engineering Standards)
- **esbuild 资产内联**: 通过 `dataurl` loader 实现了背景掩模图片的 Base64 内联。构建后的 `dist/app.js` 是零依赖自包含的，解决了路径引用失效的顽疾。
- **标准化测试 (node:test)**：使用 Node.js Native Test Runner (`npm test`)。
- **全场景验证 (v1.6.0 Hardened)**: 总计 130+ 测试用例，覆盖了从底层数学混合、XSS 注入防护、超大分辨率边界到高层 CLI 流协议的全链路。修复了先前版本中目录探测结果无法正确透传至 UI 的 Tier 识别逻辑 Bug。

### 4. 外部接口化 (Interfacing)
- **CLI 模式**：通过 `node src/cli.js -i <in> -o <out> --json` 实现机器可读输出（包含探测元数据）。
- **Python Bridge**：提供 `remover.py` 作为中间桥接，`ModernGUI` 实现了 `prefs.json` 路径持久化，确保用户工作流的连贯性。

---

## 📈 路线图 (Roadmap)

### 第一阶段：架构优化与标准化 (COMPLETED ✅ v1.1 - v1.5.5)
- [x] **v1.1-1.2**: 核心算法解耦、Web Worker 单例化、Node.js CLI 工具链。
- [x] **v1.5**: 分级混合探测 (NCC/Sobel)、官方目录数据库 (`catalog.js`)、切边容错支持。
- [x] **v1.6.0 (Hardened)**: 超大批量处理内存优化、全局剪贴板粘贴 (Ctrl+V)、自动下载工作流、穷尽式测试矩阵、GUI 路径记忆。

### 第二阶段：检测与增强 (Short-term 🚀)
- [ ] **多模型特征提取**：研究 DALL-E 3 和 Midjourney 的水印特征并集成。
- [ ] **网页端实时预览优化**：引入 WebGL 片元着色器加速渲染 A/B 对比效果。

### 第三阶段：工程化提升 (Long-term 🛠)
- [ ] **WebAssembly (Wasm) 迁移**：将像素混合循环迁移至 Rust，针对 4K+ 图像极致提速。
- [ ] **浏览器原生插件**：开发跨浏览器的 Extension 自动去水印预览。
- [ ] **移动端应用适配**：利用 Capacitor 或 PWA 提供移动端原生拍摄去水印能力。

> [!NOTE]
> 关于未来的详细开发路线，请参阅 [ROADMAP.md](./ROADMAP.md)。
