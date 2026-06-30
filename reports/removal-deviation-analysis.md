# 去水印后微小偏差分析与测试覆盖（2026-06-29）

## 涉及模块

- `src/core/blendModes.js`
- `src/core/applyRemoval.js`
- `src/core/multiPassRemoval.js`
- `src/core/alphaCalibration.js`
- `src/core/alphaMap.js`
- `src/core/edgeCleanup.js`
- `src/core/restorationMetrics.js`

## 主要风险假设

1. 反向 alpha blend 的量化误差会在平滑渐变背景中形成微弱 banding。
2. alpha 较高时，`1 - alpha` 变小，反推公式会放大输入量化误差。
3. `calculateAlphaMap()` 使用 max-channel 会提升边缘检测敏感度，但可能在彩色抗锯齿边缘高估 alpha。
4. `alphaGain` 过低会残留亮水印，过高会过度变暗；估计与校正需要被测试约束。
5. `edgeCleanup` 应只在 alpha 边缘带降低微偏差，不能扩大 halo 或模糊非边缘区域。

## 本轮新增测试

- `tests/removal_precision_gradient_background.test.js`
  - 覆盖水平/垂直/二维渐变、强/弱 alpha、RGB 独立通道、低于 noise floor 的区域。
- `tests/removal_alpha_gain_stability.test.js`
  - 覆盖 gain=1 正确重建、低 gain 残留、高 gain 过修、单调性、确定性、输出范围。
- `tests/alpha_map_estimation_accuracy.test.js`
  - 覆盖 max-channel alpha 估计、BT.709 对比、`estimateAlphaGain()` 对已知 trueGain 的恢复。
- `tests/removal_edge_cleanup_effectiveness.test.js`
  - 覆盖 no-op 条件、高纹理早退、边缘 spike 缓和、halo 不增大。

## 当前验证结果

focused removal/alpha regression run：44/44 passed。

review 后强化 `tests/halo_feedback_retry.test.js`，新增 `getHaloRetryGains()` 合同测试，验证 safety-halo retry gain 按 `×0.8` 衰减并在 `0.5` floor 停止；focused blocker run 已通过。

## 后续建议

真实用户反馈中若存在“肉眼可见微偏差”，应补充 paired fixture：

```text
tests/fixtures/user-feedback/deviation/
```

每个 case 至少记录：原图或期望无水印图、处理输出、profile、检测位置、alpha variant、用户观察到的偏差类型。随后用 MAE、max delta、PSNR、haloScore 和 residualNcc 量化，不只依赖截图观察。
