# Gemini Watermark Remover - 路线图

## 当前状态

- **版本**: v2.1.0
- **验证基线**: `npm test` 277/277 通过, `npm run lint` clean, `npm run build` clean
- **当前重点**: 交付用户自定义能力、提升极端场景召回率、多端参数一致化
- **架构**: 支持动态参数覆盖的四层检测管线 (Catalog -> Scaled -> Heuristic -> Global)

## 已完成事项

- **[v2.1] 自定义配置模式**: 支持手动调整阈值、梯度惩罚与手动指定坐标区域。
- **[v2.0] 召回率专项增强**: 梯度滤波惩罚系数调优 (0.30) 与位置容差 (5%) 平衡。
- **[v1.9] 共享检测管线**: Web / CLI / Python 共享同一套 profile、catalog 和 detector。
- 前端拖拽上传、多语言支持、批量 ZIP 下载。

## 短期计划

1. 继续优化复杂纹理（如高频正弦波、细密网格）下的误报过滤算法。
2. 收集更多非标准 Gemini 导出尺寸并补齐 Catalog。
3. 保持 Python Bridge 与 Node CLI 的同步更新。

## 中期计划

1. 引入 **WebAssembly (WASM)** 加速核心 NCC 互相关运算与 Sobel 梯度计算，提升 4K 图像处理速度。
2. 探索基于频率域（Spectral Analysis）的假阳性防御机制。

## 长期计划

1. 实现智能参数自适应系统：根据图像熵值（Entropy）自动微调检测阈值。
2. 维护可回归、可解释、可验证的纯数学去水印基准。
