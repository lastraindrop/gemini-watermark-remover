# Gemini Watermark Remover - 路线图

## 当前状态

- **版本**: v2.1.0
- **验证基线**: `npm test` 369/369 通过, `npm run lint` clean, `npm run build` clean, Python bridge pass
- **当前重点**: 独立 fork 产品化、维护自有 SDK/API、提升极端场景召回率、多端参数一致化
- **架构**: 支持动态参数覆盖的四层检测管线 (Catalog -> Scaled -> Heuristic -> Global)

## 已完成事项 (v2.1.x 维护版本)

- **[v2.1] 自定义配置模式**: 支持手动调整阈值、梯度惩罚与手动指定坐标区域。
- **[v2.1] 多端参数一致化**: Web/CLI/Python 三处参数命名统一，高级参数 (probeThreshold, fallbackThreshold, gradientPenalty, manualConfig, overrides) 在三层均已透传并生效。
- **[v2.1] 单元测试覆盖率提升**: 从 277 测试增加至 369 测试，覆盖 SDK/API、URL 生命周期、CLI 参数、手动配置校验等领域:
  - `registry.test.js`: TemplateRegistry 单例、注册、目录查询
  - `scaled_catalog.test.js`: 近似尺寸缩放匹配逻辑
  - `local_contrast.test.js`: 局部对比度相关计算
  - `box_blur.test.js`: 快速盒式模糊算法
  - `overrides_dynamic.test.js`: v2.1 动态参数覆盖机制
  - `metrics_precision.test.js`: 恢复质量指标 (MSE/PSNR) 精度
  - `detection_fallback_chain.test.js`: 检测回退链 (catalog → global) 完整流程
  - `i18n_completeness.test.js`: 7 语言国际化完整性校验
- **[v2.0] 召回率专项增强**: 梯度滤波惩罚系数调优 (0.30) 与位置容差 (5%) 平衡。
- **[v1.9] 共享检测管线**: Web / CLI / Python 共享同一套 profile、catalog 和 detector。
- 前端拖拽上传、多语言支持、批量 ZIP 下载。

## 短期计划 (v2.2 规划)

1. 继续优化复杂纹理（如高频正弦波、细密网格）下的误报过滤算法。
2. 收集更多非标准 Gemini 导出尺寸并补齐 Catalog。
3. 保持 Python Bridge 与 Node CLI 的同步更新。
4. 补充 CLI pipe 模式的端到端集成测试。
5. 验证 `manualConfig` 通过 CLI 的完整流程。
6. ~~明确 worker 下一步：接入 off-main-thread 恢复或移除 worker bundle。~~ ✅ 已接入：像素恢复默认委托 Worker 执行，带 5s 超时回退。

## 中期计划

1. 引入 **WebAssembly (WASM)** 加速核心 NCC 互相关运算与 Sobel 梯度计算，提升 4K 图像处理速度。
2. 探索基于频率域（Spectral Analysis）的假阳性防御机制。
3. 为 DALL-E 3 profile 准备真实 alphaMap 资产。
4. 统一 Web/CLI Engine: 抽象 `AssetLoader` 接口，让 `watermarkEngine.js` 在 Node.js 下使用 sharp 而非 DOM。

## 长期计划

1. 实现智能参数自适应系统：根据图像熵值（Entropy）自动微调检测阈值。
2. 维护可回归、可解释、可验证的纯数学去水印基准。
3. 产品化增强：Chrome 扩展、Page 集成、SDK 发布。

## 已修复的 BUG 汇总 (v2.1 维护版本)

| 编号 | 问题描述 | 位置 | 修复状态 |
|------|---------|------|---------|
| 1 | `detectionPipeline.js:175` 未使用的 `fallbackThreshold` 变量 | 已移除 | ✅ 修复 |
| 2 | `detector.js` Phase 2/3 阈值使用硬编码 `SEARCH_CONFIG` 而非 merged config | 已替换 | ✅ 修复 |
| 3 | `app.js` 阈值 slider: probeThreshold/fallbackThreshold 共用同一 slider，无比例关系 | 已修复为 0.25/0.18 固定比例 | ✅ 修复 |
| 4 | `gui.py:14` 版本号硬编码 `v1.9.9` | 已更新为 `v2.1.0` | ✅ 修复 |
| 5 | `README.md:3` 版本号 `v1.9.9` 与 package.json `v2.1.0` 不一致 | 已同步 | ✅ 修复 |
| 6 | `README_zh.md` 版本号 `v1.9.9`、测试数 `271` 未同步 | 已同步 | ✅ 修复 |
| 7 | `gui.py:263` 多文件判断逻辑: `str(fileSize)` 比较字符串而非数字 | 已修复为数字比较 | ✅ 修复 |
| 8 | `remover.py:100` pipe 模式: CLI 路径判断未正确处理全局安装 | 已修复为检查 `.js` 后缀 | ✅ 修复 |

## 验证命令

```bash
npm run lint          # 0 errors, 0 warnings
npm test              # 369/369 passing
npm run build         # clean
npm run test:legacy   # maintained legacy smoke regressions
npm run test:python   # Python bridge

# 分项验证新增测试
node --test tests/registry.test.js
node --test tests/scaled_catalog.test.js
node --test tests/local_contrast.test.js
node --test tests/overrides_dynamic.test.js
node --test tests/metrics_precision.test.js
node --test tests/detection_fallback_chain.test.js
node --test tests/i18n_completeness.test.js
```
