# 上游对比摘要（2026-06-29）

## 对比对象

- 本地：`@lastraindrop/gemini-watermark-remover`，当前版本 `2.7.0`
- 上游：`https://github.com/GargantuaX/gemini-watermark-remover`，当前主线约为 `@pilio/gemini-watermark-remover v1.0.28`

## 总体结论

两者已经显著分叉，不建议直接合并或覆盖。本地应保留自身 UI、i18n、Python bridge、Cloudflare 部署与性能预设；上游更适合作为算法、pipeline tracing、candidate evaluation、fixtures 与 regression tests 的参考源。

## 主要差异

| 维度 | 上游 | 本地 |
|---|---|---|
| SDK surface | 多入口，含 browser/node/video/runtime | 主要为 `.` 与 `./sdk` |
| 视频处理 | 有 video pipeline | 暂无 |
| AI 去噪 | 有 ONNX/FDnCNN 方向 | 暂无 |
| UI | 更偏产品/SDK 配套 | Tailwind Web UI + i18n |
| Python | 无 | `python/remover.py` + `python/gui.py` |
| 测试组织 | 多目录、偏标准化 | 自定义 `scripts/test-groups.mjs`，测试较多但较平铺 |
| 检测策略 | 更重的 pipeline/candidate selector | `detectionPipeline.js` + `detector.js` + `adaptiveDetector.js` |

## 对本轮工作的影响

本轮不引入上游大模块，只吸收以下工程原则：

1. 用 characterization tests 锁定当前行为。
2. 为未命中与微偏差建立可复现 synthetic fixtures。
3. 后续可考虑引入 pipeline trace，而非立即重构检测/去除核心。

## 暂不处理项

- 视频水印处理
- ONNX 去噪
- Chrome extension
- 上游完整 SDK surface

这些属于产品方向扩展，不应混入当前“图像未命中与去除微偏差”修复阶段。
