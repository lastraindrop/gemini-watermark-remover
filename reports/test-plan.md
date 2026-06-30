# 测试计划与执行顺序（2026-06-29）

## 原则

1. 先测试锁定，再修改生产逻辑。
2. synthetic fixtures 用于稳定复现边界；真实反馈样本用于最终回归。
3. 优先不改 `src/`；若 review 发现测试合同对应的生产缺口，允许最小生产逻辑修复并用 focused tests 锁定。
4. 所有新增 top-level tests 必须加入 `scripts/test-groups.mjs` 分组。

## 已新增测试基础设施

- `tests/helpers/imageQualityAssertions.js`
  - `meanAbsoluteError`
  - `maxChannelDelta`
  - `psnr`
  - `residualNcc`
  - `haloScore`
  - `assertImageClose`
  - `assertWithin`
- `tests/helpers/syntheticWatermarkFactory.js`
  - `createSyntheticCase`
  - `createBackgroundImageData`
  - `createAlphaMap`
  - `blendWatermarkIntoImageData`
  - `cloneImageData`
  - `extractRegion`

## 已新增回归测试

检测类：

- `tests/detection_gemini_standard_positions.test.js`
- `tests/detection_offset_tolerance.test.js`
- `tests/detection_subpixel_position.test.js`
- `tests/detection_doubao_rectangular_alpha_map.test.js`

去除精度类：

- `tests/removal_precision_gradient_background.test.js`
- `tests/removal_alpha_gain_stability.test.js`
- `tests/alpha_map_estimation_accuracy.test.js`
- `tests/removal_edge_cleanup_effectiveness.test.js`

## 推荐执行顺序

1. Import/syntax check：

```bash
node --input-type=module -e "import('./tests/helpers/imageQualityAssertions.js')"
node --input-type=module -e "import('./tests/helpers/syntheticWatermarkFactory.js')"
```

2. 分组 dry-run：

```bash
node scripts/test-groups.mjs unit --dry-run
node scripts/test-groups.mjs precision --dry-run
```

3. Focused detection：

```bash
node --import ./tests/fixtures/canvas-mock.mjs --loader ./tests/fixtures/png-loader.mjs --test --test-concurrency=1 tests/detection_subpixel_position.test.js tests/detection_gemini_standard_positions.test.js tests/detection_offset_tolerance.test.js tests/detection_doubao_rectangular_alpha_map.test.js
```

4. Focused removal：

```bash
node --import ./tests/fixtures/canvas-mock.mjs --loader ./tests/fixtures/png-loader.mjs --test --test-concurrency=1 tests/removal_precision_gradient_background.test.js tests/removal_alpha_gain_stability.test.js tests/alpha_map_estimation_accuracy.test.js tests/removal_edge_cleanup_effectiveness.test.js
```

5. 大组回归，建议串行长超时：

```bash
pnpm test:unit
pnpm test:precision
pnpm test:integration
pnpm test:audit
pnpm test:diagnostic
```

## 下一阶段进入条件

真实用户图片或新增 synthetic case 能稳定复现未命中/微偏差失败时，才继续扩大 `src/core/*` 修改范围。当前已完成的 `src/core/*` 修改仅限 review 阻塞项要求的最小合同修复。
