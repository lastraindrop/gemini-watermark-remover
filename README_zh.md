[English](README.md)

# Gemini & Doubao 无损去水印工具 (v2.2.1)

用于检测、分析并去除 Gemini、Doubao 图片中可见 AI 水印的独立 fork 生产级客户端工具。v2.2.1 包含五阶段检测管线、三维评分、自适应多尺度搜索、多遍安全移除、Alpha 增益校准与决策分阶系统。前端已实现零外部CDN/零Google Fonts依赖的完全本地化部署。

## 当前版本覆盖

- **五阶段检测管线**: 目录→缩放→启发式→自适应→全局
- **三维评分**: 空间 NCC (0.5) + 梯度 NCC (0.3) + 方差 (0.2)
- **自适应检测器**: 粗到精多尺度搜索
- **多遍安全移除**: 含近黑保护与纹理保护
- **Alpha 增益校准**: 自动搜索最优 alpha 乘数（支持矩形水印）
- **决策策略**: 三级分类 (direct-match / needs-validation / insufficient)
- **恢复质量度量**: MSE、PSNR 及质量评估
- 亚像素轮廓精化，模板插值与变形
- Worker Pool 并行处理，DetectorContext 内存池管理
- 延迟目录加载，共享移除逻辑 (`applyRemoval.js`)
- Web / CLI / Python 共享检测管线
- Gemini 目录优先匹配 + 启发式回退 + 自适应检测
- Doubao 多锚点支持（左上 + 右下）+ 矩形水印尺寸
- 前端拖拽上传（含全局遮罩反馈）与批量 ZIP 下载
- 7 语言界面，键盘快捷键提示面板
- 完整 TypeScript 类型定义
- 独立 SDK/API 入口：`@lastraindrop/gemini-watermark-remover`
- 523 个回归测试

## 验证基线

```bash
pnpm test        # 523/523 通过
pnpm lint        # clean
pnpm build       # clean (静态 Tailwind CSS，无 CDN 依赖)
```

## 架构概览

| 层 | 模块 | 职责 |
|-------|---------|---------------|
| 基础 | `blendModes.js`, `alphaMap.js`, `utils.js`, `templates/registry.js` | 反向 alpha 混合、alpha 映射计算、共享工具、模板注册 |
| 核心 | `catalog.js` (+ `catalogs.json`), `config.js`, `detector.js` (+ `DetectorContext`), `detectionPipeline.js`, `adaptiveDetector.js`, `multiPassRemoval.js`, `alphaCalibration.js`, `decisionPolicy.js`, `restorationMetrics.js`, `applyRemoval.js`, `worker.js`, `workerPool.js`, `watermarkEngine.js`, `profiles.js` | 检测、评分、自适应搜索、多遍移除、alpha 校准、决策分阶、共享移除、Worker 池、管线编排 |
| 应用 | `app.js` → 9 个子模块 | 前端状态、UI 组件、拖拽、快捷键、设置、视图模式、放大镜、手动选择 |
| 入口 | `cli.js`, `sdk/index.js`, `userscript/index.js`, `python/` | CLI、SDK 导出、油猴脚本、Python 桥接 |
| 构建 | `build.js`, `tailwind.config.js`, `src/tailwind.css` | esbuild 打包、静态 Tailwind CSS 生成 |

## 技术特性

- **梯度滤波**: Sobel 边缘相关抑制纯亮度假阳性，使用动态 `gradientPenalty` 参数（默认 0.30）
- **多阶段检测**: 目录→缩放→启发式→自适应→全局，逐级阈值
- **Profile 系统**: 可插拔 profile（Gemini、Doubao；DALL-E 3 为实验研究项）
- **尺寸目录**: 标准尺寸 5% 容差匹配，缩放目录覆盖裁切/缩放导出
- **内存池优化**: `DetectorContext` 类封装可复用缓冲区
- **Worker Pool**: 多 worker 并行像素修复，Transferable ArrayBuffer 零拷贝
- **纯客户端**: 所有处理在本地完成

## 文档

- [用户指南](./USER_GUIDE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [技术指南](./TECHNICAL_GUIDE.md)
- [路线图](./ROADMAP.md)
- [综合分析计划](./COMPREHENSIVE_ANALYSIS_PLAN.md)
- [归档报告](./reports/)

## 许可证

MIT
