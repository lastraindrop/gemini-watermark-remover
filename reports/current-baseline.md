# 当前基线记录（2026-06-29）

## 范围

本记录用于锁定本轮测试基础设施与回归测试补充前后的可验证状态。初始阶段只新增测试与报告；review 后为满足缺失 P0 合同，追加了最小生产逻辑修复：Gemini 新尺寸 heuristic、halo retry gain helper、Python timeout scaling helper。

## 已确认命令

来自 `package.json`：

- `pnpm test` / `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:precision`
- `pnpm test:audit`
- `pnpm test:diagnostic`
- `pnpm test:all`
- `pnpm test:worker`
- `pnpm test:stress`

## 初始 baseline

- `pnpm test:unit`：通过，120s 内完成。
- `pnpm test:integration`：并行 baseline 试跑时达到 120s 超时；输出未显示断言失败，需要串行长超时复跑。
- `pnpm test:precision`：并行 baseline 试跑时达到 120s 超时；输出未显示断言失败，需要串行长超时复跑。
- `pnpm test:audit`：并行 baseline 试跑时达到 120s 超时；输出未显示断言失败，需要串行长超时复跑。
- `pnpm test:diagnostic`：并行 baseline 试跑时达到 120s 超时；输出未显示断言失败，需要串行长超时复跑。

## 本轮新增 focused 验证

### 检测未命中专项

命令：

```bash
node --import ./tests/fixtures/canvas-mock.mjs --loader ./tests/fixtures/png-loader.mjs --test --test-concurrency=1 tests/detection_subpixel_position.test.js tests/detection_gemini_standard_positions.test.js tests/detection_offset_tolerance.test.js tests/detection_doubao_rectangular_alpha_map.test.js
```

结果：

- 4 个 suite
- 39 个 test
- 39 passed
- 0 failed

### 去除微偏差专项

命令：

```bash
node --import ./tests/fixtures/canvas-mock.mjs --loader ./tests/fixtures/png-loader.mjs --test --test-concurrency=1 tests/removal_precision_gradient_background.test.js tests/removal_alpha_gain_stability.test.js tests/alpha_map_estimation_accuracy.test.js tests/removal_edge_cleanup_effectiveness.test.js
```

结果：

- 7 个 suite
- 44 个 test
- 44 passed
- 0 failed

## 分组校验

- `node scripts/test-groups.mjs unit --dry-run`：通过，未发现未分组测试。
- `node scripts/test-groups.mjs precision --dry-run`：通过，新增测试已进入分组。

## 当前结论

1. 本轮新增测试辅助设施与 focused regression tests 可独立运行通过。
2. 大组测试仍需串行长超时复跑，不能把 120s 并行超时记为失败断言。
3. review 后补齐的阻塞项 focused tests 已通过：`heuristic_returns_new_tier`、`python_timeout_scales`、`halo_feedback_retry`、`build_pipeline`。
4. `pnpm test:unit`、`pnpm test:precision`、`pnpm test:diagnostic` 已通过；`integration/audit` 仍属于长耗时/悬挂的既有测试问题。
