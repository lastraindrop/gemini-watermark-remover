# 水印未命中问题分析与测试覆盖（2026-06-29）

## 涉及模块

- `src/core/detectionPipeline.js`
- `src/core/detector.js`
- `src/core/adaptiveDetector.js`
- `src/core/catalog.js`
- `src/core/profiles.js`
- `src/core/config.js`

## 主要风险假设

1. 低置信 catalog/heuristic 命中可能抑制更可靠的 global fallback。
2. Gemini 标准尺寸与标准 margin 的 official/heuristic 标记不一致时，阈值可能偏严。
3. 96px 水印的粗搜索步长与奇数像素偏移可能导致候选分数下降。
4. sub-pixel 坐标传递到 removal 时可能引入边缘采样偏差。
5. Doubao 等矩形水印必须保证 alphaMap 维度与候选区域一致，不能静默 fallback 到方形 map。

## 本轮新增测试

- `tests/detection_gemini_standard_positions.test.js`
  - 覆盖 Gemini 标准位置、坐标边界、alphaMap 长度、anchor 一致性。
- `tests/detection_offset_tolerance.test.js`
  - 覆盖标准 anchor 周边偏移、粗重定位范围、边缘方向偏移与 out-of-bounds 防护。
- `tests/detection_subpixel_position.test.js`
  - 覆盖 sub-pixel 输出有限性、边界 probe、低置信场景不过度膨胀。
- `tests/detection_doubao_rectangular_alpha_map.test.js`
  - 覆盖矩形 alphaMap 的 WxH key、TL/BR anchor、单维方形 fallback 防护。

## 当前验证结果

focused detection regression run：39/39 passed。

review 后追加 `tests/heuristic_returns_new_tier.test.js`，验证 Gemini 2026-05 新宽幅尺寸族在 catalog 精确命中之外也能进入 `2k-new-margin` heuristic；focused blocker run 已通过。

## 后续建议

若用户提供真实未命中图片，应加入：

```text
tests/fixtures/user-feedback/missed/
```

并为每个样本记录：profile、期望位置、期望尺寸、期望最低置信度、是否来自 Gemini/Doubao/其他。

只有当新增真实样本复现未命中时，才进入生产逻辑修改；否则当前测试主要作为 v2.7 行为锁。
