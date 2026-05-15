[English](README.md)

# Gemini & Doubao 无损去水印工具 (v2.2.0)

用于检测、分析并去除 Gemini、Doubao 图片中可见 AI 水印的独立 fork 生产级客户端工具。v2.2.0 新增六层检测管线、三维评分、自适应多尺度搜索、多遍安全移除与 Alpha 增益校准。

## 当前版本覆盖

- Web / CLI / Python 共享检测管线
- Gemini 目录优先匹配 + 启发式回退 + 近似尺寸缩放
- Doubao 多锚点支持（左上 + 右下）
- **Deep Scan 梯度滤波** 假阳性防御
- 前端拖拽上传与批量 ZIP 下载
- 多语言界面与契约测试
- 独立 SDK/API 入口：`@lastraindrop/gemini-watermark-remover`
- 369 个回归测试覆盖困难样本

## 验证基线

```bash
npm test          # 369/369 通过
npm run lint      # clean
npm run build     # clean
npm run test:legacy
node --test tests/gemini_regression.test.js
npm run test:python
```

## 架构概览

| 层 | 文件 | 职责 |
|-------|-------|---------------|
| 基础 | `blendModes.js`, `alphaMap.js`, `templates/registry.js` | 反向 alpha 混合、模板注册 |
| 核心 | `catalog.js`, `config.js`, `detector.js`, `detectionPipeline.js`, `watermarkEngine.js` | 检测、评分、管线编排 |
| 应用 | `app.js`, `processing.js`, `ui.js` | 前端状态、拖拽、队列、下载 |
| 入口 | `cli.js`, `gwrRemoveCommand.js`, `remover.py`, `gui.py` | CLI、Python bridge |

## 技术特性

- **梯度滤波**: Sobel 边缘相关抑制纯亮度假阳性，保留真水印
- **多阶段检测**: 目录→近似→启发式→全局回退，逐级阈值
- **Profile 系统**: 可插拔 profile（Gemini、Doubao；DALL-E 3 为实验研究项）
- **尺寸目录**: 标准尺寸 2% 容差匹配，近似覆盖裁切/缩放导出
- **纯客户端**: 所有处理在本地完成

## 文档

- [用户指南](./USER_GUIDE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [技术指南](./TECHNICAL_GUIDE.md)
- [路线图](./ROADMAP.md)

## 许可证

MIT
