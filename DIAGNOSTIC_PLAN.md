# 全面诊断报告与行动计划（已完结）

## 一、总体架构评估

### 架构分层
```
Entry Layer:    CLI (src/cli/) | Web (src/app.js) | Python (python/) | Userscript
Application:    processing.js | ui.js | state.js | i18n
Core Layer:     watermarkEngine → detectionPipeline → detector → catalog/config/profiles
Foundation:     blendModes | alphaMap | templates/registry
```

### 架构健康度评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 模块化 | ★★★★☆ | 核心/应用/入口三层清晰分离 |
| 可扩展性 | ★★★★☆ | TemplateRegistry 支持动态 profile 注册 |
| 一致性 | ★★★★☆ | Web/CLI/Python 参数一致 |
| 测试覆盖 | ★★★★☆ | 271 测试，覆盖核心路径 |
| 检测鲁棒性 | ★★★★☆ | 多层阈值门控已调整，Recall/FP 平衡优化 |

---

## 二、与原分支(GargantuaX)对比分析

- **原分支**: 简单、聚焦、固定尺寸硬编码。
- **当前分支**: 抽象程度高，支持多 Profile，引入了目录(Catalog)和启发式(Heuristic)机制。
- **结论**: 架构领先；经两轮阈值调优后召回率与误报率已达平衡。

---

## 三、发现与修复的 BUG

| BUG | 问题 | 修复 |
|-----|------|------|
| BUG-1 | 阈值链过严：全局回退阈值 0.40 太高 | 降低至 0.25 |
| BUG-2 | Scaled Catalog 容差过窄（2%宽高比） | 放宽至 5%宽高比，8%缩放比 |
| BUG-3 | Gemini 启发式判断错误（全景图误判 0.5k） | 改为 pixels+shortSide 联合判断 |
| BUG-4 | 探针抖动范围太小（±4px） | 改为 ±4（官方目录）/ ±6（非官方） |
| BUG-5 | 资产缺失：DALL-E 3 bg_dalle3_bl.png | 标记为 experimental，暂不阻断 |
| BUG-6 | Phase 2 deepScan 使用 Math.max，对纯亮度假阳性无防御 | 改为梯度滤波：gradient<0.05 → *0.25，否则 Math.max |
| BUG-7 | Phase 1 calculateProbeConfidence 同上 | 同上（两处统一） |
| BUG-8 | 抖动搜索分支仍用 Math.max，评分不一致 | 统一为梯度滤波公式 |
| BUG-9 | exact catalog 容差 0.02 太宽（近匹配假阳性） | 收至 0.006（0.6%） |
| BUG-10 | isNearExpectedAnchor 位置容差 20% 太宽松（假阳性漏网） | 收至 5% |

---

## 四、两轮修复详情

### Round 1 (阈值放宽)
- `detectionPipeline.js`: DEFAULT_GLOBAL_FALLBACK_THRESHOLD 0.40→0.25, DEFAULT_PROBE_THRESHOLD 0.10→0.18, minFreeGlobalConfidence 0.78→0.50
- `catalog.js`: scaled 匹配容差放宽（宽高比 0.02→0.05，缩放比 0.05→0.08，最大缩放距离 0.20→0.30）
- `profiles.js`: 启发式层级改用像素+短边联合公式
- `detector.js`: 抖动范围 ±4→±6（非官方），步长优化（≤48px 用 1，其余用 2）
- `registry.js`: exact 匹配容差 0.02→0.006
- **测试结果**: 271/271 通过

### Round 2 (假阳性防御)
- `detector.js`: deepScan 改用梯度滤波（gradientConf<0.05 → 置信度×0.25；否则 Math.max），三处统一
- `detectionPipeline.js`: isNearExpectedAnchor 位置容差 20%→5%
- **测试结果**: 271/271 通过，lint/build 均 clean

---

## 五、当前验证基线

```bash
npm run lint          # clean
npm test              # 271/271 passing
npm run build         # clean
node --test tests/frontend_contract.test.js
node --test tests/gemini_regression.test.js
node --test tests/product_audit.test.js
python -m unittest tests\test_bridge_integration.py
```
