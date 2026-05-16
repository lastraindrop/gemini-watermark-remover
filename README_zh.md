[English](README.md)

# Gemini & Doubao 无损去水印工具 (v2.2.0)

用于检测、分析并去除 Gemini、Doubao 图片中可见 AI 水印的独立 fork 生产级客户端工具。v2.2.0 包含六阶段检测管线、三维评分、自适应多尺度搜索、多遍安全移除、Alpha 增益校准与决策分阶系统。

## 当前版本覆盖

- **六阶段检测管线**: 目录→缩放→启发式→自适应→全局→决策
- **三维评分**: 空间 NCC (0.5) + 梯度 NCC (0.3) + 方差 (0.2)
- **自适应检测器**: 粗到精多尺度搜索
- **多遍安全移除**: 含近黑保护与纹理保护
- **Alpha 增益校准**: 自动搜索最优 alpha 乘数（支持矩形水印）
- **决策策略**: 三级分类 (direct-match / needs-validation / insufficient)
- **恢复质量度量**: MSE、PSNR 及质量评估
- 亚像素轮廓精化
- 模板插值与变形
- Web / CLI / Python 共享检测管线
- Gemini 目录优先匹配 + 启发式回退 + 自适应检测
- Doubao 多锚点支持（左上 + 右下）+ 矩形水印尺寸
- 前端拖拽上传（含全局遮罩反馈）与批量 ZIP 下载
- 7 语言界面与契约测试
- 独立 SDK/API 入口：`@lastraindrop/gemini-watermark-remover`
- 452 个回归测试

## 验证基线

```bash
pnpm test        # 452/452 通过
pnpm lint        # clean
pnpm build       # clean (静态 Tailwind CSS，无 CDN 依赖)
pnpm test:legacy
node --test tests/gemini_regression.test.js
pnpm test:python
```

## 架构概览

| 层 | 模块 | 职责 |
|-------|---------|---------------|
| 基础 | `blendModes.js`, `alphaMap.js`, `utils.js`, `templates/registry.js` | 反向 alpha 混合、alpha 映射计算、共享工具、模板注册 |
| 核心 | `catalog.js`, `config.js`, `detector.js`, `detectionPipeline.js`, `adaptiveDetector.js`, `multiPassRemoval.js`, `alphaCalibration.js`, `decisionPolicy.js`, `restorationMetrics.js`, `watermarkEngine.js`, `worker.js`, `profiles.js` | 检测、评分、自适应搜索、多遍移除、alpha 校准、决策分阶、质量度量、管线编排、Web Worker |
| 应用 | `app.js` → `app/state.js`, `app/ui.js`, `app/processing.js`, `app/dragDrop.js`, `app/keyboard.js`, `app/settings.js`, `app/viewModes.js`, `app/magnifier.js` | 前端状态、UI 组件、拖拽、快捷键、设置、视图模式、放大镜 |
| 入口 | `cli.js` → `cli/gwrCli.js`, `cli/gwrRemoveCommand.js`, `bin/gwr.mjs`, `sdk/index.js`, `userscript/index.js`, `python/remover.py`, `python/gui.py` | CLI、NPM 二进制、SDK 导出、油猴脚本、Python 桥接、桌面 GUI |
| 构建 | `build.js`, `tailwind.config.js`, `src/tailwind.css` | esbuild 打包、静态 Tailwind CSS 生成 |

## 技术特性

- **梯度滤波**: Sobel 边缘相关抑制纯亮度假阳性，使用动态 `gradientPenalty` 参数（默认 0.30）
- **多阶段检测**: 目录→缩放→启发式→自适应→全局→决策，逐级阈值
- **Profile 系统**: 可插拔 profile（Gemini、Doubao；DALL-E 3 为实验研究项）
- **尺寸目录**: 标准尺寸 5% 容差匹配，缩放目录覆盖裁切/缩放导出
- **内存池优化**: 可复用缓冲区降低大图处理的 GC 压力
- **纯客户端**: 所有处理在本地完成

## 文档

- [用户指南](./USER_GUIDE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [技术指南](./TECHNICAL_GUIDE.md)
- [路线图](./ROADMAP.md)
- [综合分析报告](./ANALYSIS_AND_PLAN.md)
- [改进实施计划](./IMPROVEMENT_PLAN.md)
- [前端审查报告](./FRONTEND_REVIEW.md)

## 许可证

MIT
