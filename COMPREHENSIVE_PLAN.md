# Current Audit and Delivery Plan (v2.2.0)

> 审计日期: 2026-05-16
> 当前分支: `main`
> 当前版本: `package.json` v2.2.0
> 当前验证基线: `npm test` 421/421 pass, `npm run lint` 0 errors 0 warnings, `npm run build` pass

## 1. 当前结论

本次审计与诊断完成了从 v2.1.0 到 v2.2.0 的主要进化，重点补齐了与原仓库 (GargantuaX/gemini-watermark-remover v1.0.14) 之间最关键的检测管线差距。当前分支已具备与原仓库可比拟且更丰富的检测能力。

## 2. 已完成的工作 (v2.2.0)

### Phase 0: 诊断基线
- 新建 `tests/diagnostic_baseline.test.js`（18 场景，覆盖均匀/纹理/缩放/无水印等典型场景）
- 验证基线：385/385 现有测试通过

### Phase 1: 关键 BUG 修复
- **BUG-01**: 新增 `resolveBestTemplateOrder()` — 在检测前比较 48px/96px 模板 NCC，动态选择最优模板大小
- **BUG-02**: 梯度惩罚策略标记为需配合后续 Phase 解决（Phase 2 的 3D 评分解决了此问题）
- **BUG-04**: Registry 匹配容差从 1.5% 放宽到 5% (`registry.js:54`)
- **BUG-06**: `standardMargins` 清理为 `[32, 64, 96]` (`detector.js:251`)

### Phase 2: 自适应检测引擎
- **2.1** 方差评分: 新增 `calculateVarianceScore()` 函数 (`detector.js`)
- **2.2** 自适应检测器: 新建 `src/core/adaptiveDetector.js`（470 行）
  - 粗到细多尺度搜索
  - 3D 评分: spatial NCC (0.5) + gradient NCC (0.3) + variance (0.2)
  - 模板插值 (`interpolateAlphaMap`)
  - Alpha Map 变形 (`warpAlphaMap`)
- **2.3** 集成到 `detectionPipeline.js` 的目录探测和全局回退之间

### Phase 3: 后验证管线
- **3.1** 多遍移除: 新建 `src/core/multiPassRemoval.js`（175 行）
  - 安全门控: 近黑检测、纹理崩溃防护
  - 残差阈值自动停止
- **3.2** Alpha 增益校准: 新建 `src/core/alphaCalibration.js`（152 行）
  - 14 档增益粗搜索 + 精细调整 (±0.05)
  - 仅在 Gemini profile 上使用
- **3.3** 亚像素精炼: `refineSubpixelOutline()` 集成到 `adaptiveDetector.js`
  - 27 种位移×缩放×增益组合搜索

### Phase 4: 其他 BUG 修复
- **BUG-08/13**: Python pipe 命令补全 `"remove"` 关键字 (`python/remover.py:101`)
- **BUG-09**: Worker 超时改为自适应: `max(5000, pixels/500000)` (`watermarkEngine.js`)
- **BUG-10**: 移除 `_lastVar` 死代码 (`detector.js`)
- **BUG-11**: `probeThreshold` 计算简化，移除 0.25/0.18 比例换算 (`app.js`)
- **BUG-12**: auto profile 并发从 1 改为 2 (`processing.js`)

### Phase 5: 决策策略
- 新建 `src/core/decisionPolicy.js`（186 行）
  - 标准信号分级: `direct-match` / `needs-validation` / `insufficient`
  - 自适应信号分级
  - 移除归因分级
- 集成 `decideDetectionTier()` 到 `detectProfileWatermarks` 返回值

### Phase 6: 测试体系扩展
- `tests/multiPass_removal.test.js` — 6 项测试
- `tests/alpha_calibration.test.js` — 5 项测试
- `tests/adaptive_detector.test.js` — 8 项测试
- `tests/decision_policy.test.js` — 14 项测试
- 总测试数: 369 → 421

### 紧急修复 (收尾阶段)
- **ISSUE #1 (CRITICAL)**: `removeWatermark()` 在 `blendModes.js` 缺少 `options` 参数 — `alphaGain` 曾被 4 个调用方静默忽略。已修复: 新增第 4 参数 `options = {}`，正确应用 `alphaGain` 到像素恢复公式。

## 3. 仍需持续关注的问题

- 复杂纹理背景下的误报边界（3D 评分显著改善，但需持续监控）
- 弱水印样本的召回（自适应检测器已覆盖）
- 新 profile 进入时的测试覆盖完整性
- DALL-E 3 真实 alpha 资产未完成前保持 experimental/research-only
- Worker 恢复逻辑目前仅用于 gemini 的单次移除模式

## 4. 长期维护建议

1. 持续扩充真实样本库，优先覆盖复杂背景和轻微缩放导出。
2. 若后续引入新 profile，先补样本与测试，再补页面文案。
3. 保持测试总数、版本号、路线图和 README 的同步。
4. 考虑将剩余的多遍移除逻辑扩展到 doubao 等非 gemini profile。

## 5. 验证命令

```bash
npm run lint
npm test
npm run build
npm run test:legacy
npm run test:python
```
