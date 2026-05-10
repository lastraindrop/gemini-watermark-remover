[English](README.md)

# Gemini & Doubao 无损去水印工具 (v2.1.0)

用于检测、分析并去除 Gemini、Doubao 和 DALL-E 3（实验性）图片中可见 AI 水印的生产级客户端工具。

## 当前版本覆盖

- Web / CLI / Python 共享检测管线
- Gemini 目录优先匹配 + 启发式回退 + 近似尺寸缩放
- Doubao 多锚点支持（左上 + 右下）
- **Deep Scan 梯度滤波** 假阳性防御
- 前端拖拽上传与批量 ZIP 下载
- 多语言界面与契约测试
- 356 个回归测试覆盖困难样本

## 验证基线

```bash
npm test          # 356/356 通过
npm run lint      # clean
npm run build     # clean
node --test tests/gemini_regression.test.js
python -m unittest tests\\test_bridge_integration.py
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
- **Profile 系统**: 可插拔 profile（Gemini、Doubao、DALL-E 3）
- **尺寸目录**: 标准尺寸 2% 容差匹配，近似覆盖裁切/缩放导出
- **纯客户端**: 所有处理在本地完成

## 文档

- [用户指南](./USER_GUIDE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [技术指南](./TECHNICAL_GUIDE.md)
- [路线图](./ROADMAP.md)

## 许可证

MIT
