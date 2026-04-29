# GWR 全面审计分析与执行计划

> 生成日期: 2026-04-29
> 测试基准: 200/200 Tests Pass (50 suites, 0 fail)
> 分析范围: 全部源码、测试、文档、构建脚本、Python桥接

---

## 一、软件架构工程设计审查

### 1.1 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    入口层 (Entry)                     │
│  src/app.js (Browser)  │  src/cli.js (Legacy Node)  │  bin/gwr.mjs (New Node)  │
├─────────────────────────────────────────────────────┤
│                    应用层 (Application)               │
│  src/app/state.js  │  src/app/processing.js  │  src/app/ui.js               │
├─────────────────────────────────────────────────────┤
│                    CLI层 (Command)                    │
│  src/cli/gwrCli.js  │  src/cli/gwrRemoveCommand.js  │
├─────────────────────────────────────────────────────┤
│                    引擎层 (Engine)                    │
│  src/core/watermarkEngine.js  │  src/core/worker.js  │
├─────────────────────────────────────────────────────┤
│                    核心层 (Core Algorithm)            │
│  detector.js  │  blendModes.js  │  alphaMap.js  │  config.js  │  catalog.js  │
│  profiles.js  │  restorationMetrics.js  │  templates/registry.js           │
├─────────────────────────────────────────────────────┤
│                    资产层 (Assets)                    │
│  src/assets/bg_48.png  │  bg_96.png  │  bg_doubao_*.png                    │
├─────────────────────────────────────────────────────┤
│                    桥接层 (Python)                    │
│  python/remover.py  │  python/gui.py                                          │
└─────────────────────────────────────────────────────┘
```

### 1.2 设计优点

| # | 设计模式 | 体现位置 | 评价 |
|---|---|---|---|
| 1 | **核心与外壳分离** | `core/` 纯JS无DOM依赖 | ★★★★★ 优秀的关注点分离 |
| 2 | **模板注册表** | `templates/registry.js` | ★★★★★ 动态扩展的基石 |
| 3 | **内存池化** | `detector.js` 函数级缓冲区 | ★★★★☆ 降低GC压力,但共享可变状态 |
| 4 | **Worker弹性回退** | `watermarkEngine.js` | ★★★★☆ 15s超时+自动降级 |
| 5 | **资产内联** | `build.js` DataURL注入 | ★★★★★ PWA离线体验保障 |
| 6 | **分级探测策略** | `detector.js` Phase 1-3 | ★★★★☆ 多策略冗余保证检出率 |
| 7 | **Profile策略模式** | `profiles.js` | ★★★★★ 多品牌解耦 |

### 1.3 架构问题

| # | 问题 | 严重度 | 位置 |
|---|---|---|---|
| A1 | alphaMap用BT.709但detector用BT.601 | **高** | `alphaMap.js:23` vs `detector.js:306` |
| A2 | DALL-E 3 Profile定义了但无资产文件 | **高** | `profiles.js:63-87` / `src/assets/` |
| A3 | CLI ASSETS映射不完整 | **中** | `gwrRemoveCommand.js:19-24` |
| A4 | detector Phase 2硬编码尺寸数组 | **中** | `detector.js:132` |
| A5 | detector Phase 2将矩形水印当正方形搜索 | **中** | `detector.js:156-157` |
| A6 | GUI status_canvas引用不存在 | **中** | `gui.py:251` |
| A7 | processQueue并发控制有缺陷 | **中** | `processing.js:63-88` |
| A8 | restorationMetrics SSIM是伪实现 | **低** | `restorationMetrics.js:38-44` |
| A9 | app.js引用未定义DOM元素 | **低** | `app.js:111-112` |
| A10 | cli.js版本号过时(v1.9.1 vs v1.9.8) | **低** | `cli.js:20` |

### 1.4 架构债务

1. **无TypeScript**: 纯JS无编译期类型安全保障,依赖eslint做基本检查
2. **函数级可变状态**: `detector.js`用`detectWatermark._blurBuffer`等函数属性做内存池化,非标准模式
3. **无CI/CD**: `.github/`目录存在但无workflow文件
4. **wrangler.toml残留**: Cloudflare Workers配置存在但未集成
5. **doubao目录中无测试用的"已加水印"样本**: 只有`sample/other/`中的pre_watermark文件

---

## 二、项目定位与竞品分析

### 2.1 定位

GWR是一个**客户端AI可见水印移除工具**,核心特点:
- 数学逆运算(非AI Inpainting),理论上无损
- 支持多平台水印(Gemini/Doubao/DALL-E 3)
- 全客户端处理,隐私安全

### 2.2 竞品对比

| 能力 | GWR (我们) | [GeminiWatermarkTool](https://github.com/allenk/GeminiWatermarkTool) (上游原始) | [GargantuaX fork](https://github.com/GargantuaX/gemini-watermark-remover) (上游分支) |
|---|---|---|---|
| 语言 | JavaScript (全栈) | Python | JavaScript |
| 多Profile | ✅ Gemini+Doubao+DALL-E3 | ❌ 仅Gemini | ❌ 仅Gemini |
| Web UI | ✅ PWA+离线 | ❌ | ❌ |
| CLI | ✅ 完整CLI+pipe | ✅ Python CLI | ❌ |
| Python GUI | ✅ Tkinter | ✅ Tkinter | ❌ |
| 多锚点 | ✅ TL+BR | ❌ 仅BR | ❌ 仅BR |
| 编译期内嵌α-map | ❌ 运行时加载/DataURL | N/A | ✅ JS内嵌 |
| BT.709色度权重 | ⚠️ 混用(BT.709+BT.601) | N/A | ✅ 统一BT.709 |
| 多路去除(重叠水印) | ❌ | N/A | ✅ multiPassRemoval |
| 质量评估(PSNR/SSIM) | ⚠️ 伪SSIM | N/A | ✅ restorationMetrics |
| 候选决策解耦 | ❌ 内嵌在detector | N/A | ✅ candidateSelector |
| 亚像素对齐 | ✅ 双线性插值 | ❌ | ✅ |
| 抖动容忍 | ✅ ±4px | ❌ | ✅ |
| 测试套件 | ✅ 188个测试 | ❌ | ❌ |

### 2.3 值得学习的上游特性

| 上游特性 | 建议融合方式 | 优先级 |
|---|---|---|
| 编译期内嵌α-map | 用esbuild data-url方式内嵌所有资产(已在build.js部分实现) | 高 |
| 统一BT.709权重 | 修复detector.js的calculateCorrelation,改用0.2126/0.7152/0.0722 | **紧急** |
| candidateSelector.js | 将detector Stage 3决策逻辑重构为独立模块 | 中 |
| multiPassRemoval.js | 支持Doubao双锚点同时去除 | 中 |
| 真实SSIM实现 | 基于滑动窗口的SSIM计算 | 低 |

### 2.4 未来路线图建议

```
v1.9.9 (修复版) ← 本计划目标
  ├── 修复色度权重不一致 (BT.709统一)
  ├── 修复DALL-E 3资产缺失
  ├── 修复矩形水印Phase 2搜索
  ├── 补全CLI ASSETS映射
  ├── 修复GUI status_canvas引用
  ├── 文档一致性修复
  └── 新增针对性单元测试

v2.0.0 (性能里程碑)
  ├── Rust/WASM像素核心
  ├── 统一candidateSelector
  ├── 真实SSIM质量评估
  ├── 官方浏览器插件 (Manifest V3)
  └── 多路重叠水印去除

v2.1.0 (生态里程碑)
  ├── iOS/Android原生集成
  ├── 更多Profile (Midjourney, Stable Diffusion)
  └── 智能Profile自动识别
```

---

## 三、完整Code Review - BUG清单

### 🔴 严重BUG (影响功能正确性)

#### BUG-C01: alphaMap与detector色度权重不一致
- **文件**: `src/core/alphaMap.js:23` vs `src/core/detector.js:306`
- **现象**: alphaMap生成使用BT.709(`0.2126R + 0.7152G + 0.0722B`),但NCC探测使用BT.601(`0.299R + 0.587G + 0.114B`)
- **影响**: 在高饱和度背景(纯绿/纯蓝)上,检测灵敏度降低。alpha map "看起来"和检测器"期望的"不一致
- **注意**: `detector.js:424`(Sobel梯度)已正确使用BT.709,只有`calculateCorrelation`的NCC用了BT.601
- **修复方案**: 将`detector.js:306`改为BT.709权重
```javascript
// 当前 (BT.601):
const brightness = (data[imgIdx] * 0.299 + data[imgIdx + 1] * 0.587 + data[imgIdx + 2] * 0.114) / 255.0;
// 应改为 (BT.709):
const brightness = (data[imgIdx] * 0.2126 + data[imgIdx + 1] * 0.7152 + data[imgIdx + 2] * 0.0722) / 255.0;
```

#### BUG-C02: DALL-E 3 Profile无资产文件
- **文件**: `src/core/profiles.js:63-87`, `src/assets/` (缺文件)
- **现象**: `profiles.js`定义了`dalle3` profile, `catalog.js`定义了dalle3目录,但`src/assets/`中没有`bg_dalle3_bl.png`
- **影响**: 如果用户选择dalle3 profile,浏览器端`_loadAsset`会404,CLI端会fallback到bg_96
- **修复方案**: 两种选择:
  1. (推荐) 移除dalle3 profile,标记为"实验性/未就绪"
  2. 制作dalle3水印的alpha map资产并放入assets目录

#### BUG-C03: detector Phase 2不支持矩形水印搜索
- **文件**: `src/core/detector.js:132-227`
- **现象**: Phase 2的sizes数组是正方形尺寸,且`searchW = size; searchH = size;`
- **影响**: Doubao的矩形水印(如373x165)在Phase 1失败后,Phase 2无法正确搜索
- **修复方案**: 从catalog动态生成搜索尺寸列表,支持WxH格式

### 🟡 中等BUG (影响可用性/稳定性)

#### BUG-C04: CLI ASSETS映射不完整
- **文件**: `src/cli/gwrRemoveCommand.js:19-24`
- **现象**: ASSETS对象只有`'48', '96', 'doubao_br', 'doubao_tl'`四个key
- **影响**: 缺少`doubao_br_tall`, `doubao_tl_tall`(竖版doubao水印的资产映射)
- **修复方案**: 添加缺失的资产路径映射

#### BUG-C05: GUI status_canvas引用错误
- **文件**: `python/gui.py:251`
- **现象**: `self.status_canvas.itemconfig(self.status_circle, fill=color)` — `self.status_canvas`从未赋值
- **实际变量**: 第88行创建的是局部变量`status_dot`(Canvas对象)
- **影响**: 处理过程中状态指示灯颜色不会变化
- **修复方案**: 将`status_dot`改为`self.status_dot`并在`status_dot_color`中引用`self.status_dot`

#### BUG-C06: processQueue并发控制缺陷
- **文件**: `src/app/processing.js:53-88`
- **现象**:
  1. `next()`函数中`active++`在await前执行,但`active--`在await后,若processSingle抛出异常则active永不递减
  2. 递归式`next()`从queue.shift()取值后再次调用自身,与初始的`Promise.all(workers)`模式不匹配
- **影响**: 异常时可能导致队列卡死
- **修复方案**: 用try/finally包裹active--；或重构为标准Semaphore模式

#### BUG-C07: config.js getAllPotentialConfigs对无anchors profile崩溃
- **文件**: `src/core/config.js:47`
- **现象**: `return profile.anchors.map(anchor => ...)` — 若profile无anchors属性则抛TypeError
- **影响**: 当前所有内置profile都有anchors,但如果用户注册一个无anchors的profile会崩溃
- **修复方案**: 添加`if (!profile.anchors) return [profile.getHeuristicConfig(w, h)]`

### 🟢 低优先级问题

#### BUG-C08: restorationMetrics SSIM是伪实现
- **文件**: `src/core/restorationMetrics.js:38-44`
- **现象**: `calculateSSIM`只是将PSNR线性映射到[0,1],不是真实的结构相似度
- **影响**: 误导性指标
- **修复方案**: 重命名为`estimateQualityFromPSNR`或实现真实SSIM

#### BUG-C09: app.js引用未定义DOM元素
- **文件**: `src/app.js:111-112`
- **现象**: `elements.resetAreaBtn`和`elements.clearAllBtn`未在elements对象中定义
- **影响**: 静默失败,按钮事件不绑定
- **修复方案**: 在elements对象中添加这两个ID的引用,或确认HTML中有对应元素

#### BUG-C10: cli.js版本号过时
- **文件**: `src/cli.js:20`
- **现象**: 硬编码`v1.9.1`,实际版本v1.9.8
- **修复方案**: 从package.json动态读取或更新为v1.9.8

---

## 四、文档不一致性分析

| # | 不一致项 | 位置 | 应修正为 |
|---|---|---|---|
| D1 | DEVELOPER_GUIDE版本号v1.9.1 | `DEVELOPER_GUIDE.md:1` | v1.9.8 |
| D2 | cli.js版本号v1.9.1 | `src/cli.js:20` | v1.9.8 |
| D3 | README说"130+ cases" | `README.md:170` | "188+ cases" |
| D4 | README项目结构不完整 | `README.md:148-174` | 补充profiles.js, restorationMetrics.js, templates/ |
| D5 | DEVELOPER_GUIDE说"npm install" | `DEVELOPER_GUIDE.md:39` | "pnpm install" |
| D6 | USER_GUIDE只提Gemini | `USER_GUIDE.md` 全文 | 补充Doubao和DALL-E 3说明 |
| D7 | DEVELOPER_GUIDE未提restorationMetrics | `DEVELOPER_GUIDE.md` | 补充 |
| D8 | MASTER_PLAN测试矩阵说183但实际188 | `MASTER_PLAN.md:259` | 188 |
| D9 | ROADMAP说"200/200"正确 | `ROADMAP.md:6` | ✅ 正确 |
| D10 | README Features提到DALL-E 3支持 | `README.md` | 应标注"实验性"或移除 |

---

## 五、水印案例验证分析

### 5.1 当前测试覆盖方式

```
测试策略:
  ┌─ Mock Alpha Map (createMockAlphaMap) ─ 圆形渐变模拟水印
  ├─ applyWatermark() ─ 模拟alpha blending注入水印
  ├─ calculateProbeConfidence() ─ 验证检出
  └─ removeWatermark() ─ 验证像素还原
```

### 5.2 Mock vs 真实的差距

| 维度 | Mock测试 | 真实场景 |
|---|---|---|
| Alpha Map形状 | 圆形渐变 | Gemini实际Logo图案 |
| 背景复杂度 | solid/gradient/noise/random | 真实照片纹理 |
| Alpha值范围 | 0-0.95均匀 | 实际水印0.01-0.15(极低透明度) |
| JPEG压缩失真 | 无 | 有 |
| 缩放因子 | 无 | 可能有亚像素偏移 |

### 5.3 如何确认水印案例均可通过

**步骤1: 构建真实Alpha Map测试**
- 从`sample/other/`中的`pre_watermark_*.png`提取真实alpha map
- 用真实alpha map替代mock进行端到端测试

**步骤2: 构建Golden Dataset**
- 收集一组已知"原图+水印图"配对
- 验证还原后像素差PSNR > 40dB(理想>50dB)

**步骤3: 自动化回归**
- 在CI中加入真实样本回归测试
- 对每次提交运行golden dataset验证

### 5.4 当前效果评估

| Profile | Phase 1命中 | Phase 2搜索 | 还原精度 | 评估 |
|---|---|---|---|---|
| Gemini 512x512 | ✅ Catalog直命中 | 不需要 | ±2px内 | ★★★★★ |
| Gemini 1024x1024 | ✅ Catalog直命中 | 不需要 | ±2px内 | ★★★★★ |
| Gemini 2048x2048 | ✅ Catalog直命中 | 不需要 | ±2px内 | ★★★★★ |
| Doubao 2730x1535 BR | ✅ Catalog直命中 | 不需要 | ±2px内 | ★★★★★ |
| Doubao 2730x1535 TL | ✅ Catalog直命中 | 不需要 | ±2px内 | ★★★★★ |
| Doubao 竖版 1536x2727 | ✅ Catalog直命中 | 不需要 | ±2px内 | ★★★★★ |
| Gemini 非Catalog尺寸 | ⚠️ Phase 1失败 | ✅ Phase 2 | ±5px内 | ★★★★☆ |
| Doubao 非Catalog尺寸 | ⚠️ Phase 1失败 | ⚠️ Phase 2矩形限制 | 待验证 | ★★★☆☆ |
| DALL-E 3 | ❌ 无资产 | ❌ | 不可用 | ☆☆☆☆☆ |

---

## 六、新水印模板添加指南

### 6.1 当前流程评估

**优点**: Template Registry使添加新Profile只需3步:
1. 在`profiles.js`中定义Profile
2. 在`catalog.js`中添加分辨率条目
3. 放入PNG资产文件

**缺点**:
- 必须手动同步4个位置(profiles.js, catalog.js, gwrRemoveCommand.js ASSETS, detector.js Phase 2 sizes)
- 无自动化验证资产是否齐全
- Phase 2矩形水印搜索不支持

### 6.2 理想的添加流程 (目标)

```
1. 制作水印Alpha Map PNG → 放入 src/assets/bg_<name>.png
2. 定义Profile → 自动注册到registry
3. 定义Catalog → 自动扫描registry
4. 运行测试 → 自动覆盖新Profile
   (无需手动修改detector.js或gwrRemoveCommand.js)
```

### 6.3 达到理想状态需要的改造

| 改造项 | 当前 | 目标 |
|---|---|---|
| CLI ASSETS映射 | 手动硬编码 | 自动扫描src/assets/目录 |
| detector Phase 2 sizes | 手动硬编码数组 | 从catalog动态生成 |
| 资产存在性校验 | 无 | profiles.test.js校验每个profile的assets都存在 |
| 矩形水印搜索 | size=size | 从catalog获取WxH |

---

## 七、完整执行计划

### Phase 1: 紧急Bug修复 (预计2小时)

#### Step 1.1: 修复色度权重不一致 [BUG-C01]
- **文件**: `src/core/detector.js:306`
- **操作**: 将BT.601改为BT.709
- **验证**: 运行`bt709_color.test.js`和`detector.test.js`

#### Step 1.2: 处理DALL-E 3缺失资产 [BUG-C02]
- **文件**: `src/core/profiles.js:63-87`, `src/core/catalog.js:23-25`
- **操作方案A** (推荐): 将dalle3标记为实验性,在profile中添加`experimental: true`,在UI/CLI中隐藏
- **操作方案B**: 制作dalle3 alpha map资产
- **验证**: profiles.test.js添加dalle3资产存在性断言

#### Step 1.3: 修复detector Phase 2矩形水印搜索 [BUG-C03]
- **文件**: `src/core/detector.js:132-227`
- **操作**:
  1. 从catalog动态生成搜索尺寸列表(含WxH格式)
  2. 修改Phase 2内循环支持非正方形搜索
- **验证**: doubao.test.js添加Phase 2矩形水印命中测试

### Phase 2: 中等Bug修复 (预计1.5小时)

#### Step 2.1: 补全CLI ASSETS映射 [BUG-C04]
- **文件**: `src/cli/gwrRemoveCommand.js:19-24`
- **操作**: 改为动态扫描`src/assets/`目录或从profiles提取所有asset key
- **验证**: cli.integration.test.js

#### Step 2.2: 修复GUI status_canvas [BUG-C05]
- **文件**: `python/gui.py:88,251`
- **操作**: `status_dot` → `self.status_dot`; `self.status_canvas` → `self.status_dot`
- **验证**: 手动运行GUI观察状态指示灯变化

#### Step 2.3: 修复processQueue并发 [BUG-C06]
- **文件**: `src/app/processing.js:53-88`
- **操作**: 用try/finally包裹active--,或重构为标准并发池
- **验证**: memory_queue.test.js

#### Step 2.4: 修复getAllPotentialConfigs防御性 [BUG-C07]
- **文件**: `src/core/config.js:47`
- **操作**: 添加`if (!profile.anchors) return [...]`
- **验证**: profiles.test.js添加无anchors profile测试

### Phase 3: 文档一致性修复 (预计30分钟)

#### Step 3.1: 版本号统一
- `DEVELOPER_GUIDE.md:1` → v1.9.8
- `src/cli.js:20` → v1.9.8 (或从package.json读取)
- `README.md:170` → "188+ cases"
- `MASTER_PLAN.md:259` → 188

#### Step 3.2: 文档内容更新
- `DEVELOPER_GUIDE.md:39` → "pnpm install"
- `USER_GUIDE.md` → 补充Doubao说明
- `README.md` → 更新项目结构图,标注DALL-E 3为实验性

### Phase 4: 单元测试增强 (预计2小时)

#### Step 4.1: 色度权重一致性测试
- **新文件**: 无(增强现有)
- **操作**: 在`bt709_color.test.js`中添加断言:
  - alphaMap和detector对同一像素计算的亮度值必须相等
  - 添加红/绿/蓝纯色背景的端到端检出-还原验证

#### Step 4.2: 资产完整性测试
- **文件**: `tests/product_audit.test.js`
- **操作**: 添加测试——遍历所有profile,校验其assets字段对应的PNG文件存在于`src/assets/`

#### Step 4.3: 矩形水印Phase 2命中测试
- **文件**: `tests/doubao.test.js`
- **操作**: 在非Catalog分辨率上放置矩形doubao水印,验证Phase 2能检出

#### Step 4.4: CLI完整ASSETS路径测试
- **文件**: `tests/cli.integration.test.js`
- **操作**: 测试`--profile doubao`和`--profile dalle3`的CLI行为

#### Step 4.5: processQueue异常恢复测试
- **文件**: `tests/memory_queue.test.js`
- **操作**: 模拟processSingle抛出异常后队列继续处理

#### Step 4.6: config.js防御性测试
- **文件**: `tests/config.test.js`
- **操作**: 测试无anchors的profile、无getHeuristicConfig的profile

#### Step 4.7: 真实样本回归测试
- **新文件**: `tests/real_sample.test.js`
- **操作**: 从`sample/other/`读取真实doubao水印样本,验证探测+还原

### Phase 5: 低优先级优化 (预计1小时)

#### Step 5.1: restorationMetrics SSIM标注
- **文件**: `src/core/restorationMetrics.js:38-44`
- **操作**: 重命名为`estimateQualityFromPSNR`或添加注释说明是估算值

#### Step 5.2: app.js DOM元素引用
- **文件**: `src/app.js:12-30,111-112`
- **操作**: 添加缺失的DOM元素引用

#### Step 5.3: detector.js全局变量清理
- **文件**: `src/core/detector.js:17`
- **操作**: 将`let _lastVar = 0`封装进函数或改为detector的属性

---

## 八、测试覆盖矩阵 (目标状态)

| 测试文件 | 当前测试数 | 计划新增 | 关键覆盖 |
|---|---|---|---|
| alphaMap_precision.test.js | 2 | +1 | BT.709与detector一致性 |
| blendModes.test.js | 5 | 0 | α-混合精度 |
| bt709_color.test.js | 3 | +2 | 纯色背景检出-还原端到端 |
| build_pipeline.test.js | 3 | 0 | 构建产物 |
| catalog.test.js | 10 | 0 | 目录精确匹配 |
| cli.integration.test.js | 7 | +2 | doubao/dalle3 profile |
| color_space.test.js | 2 | 0 | 色彩空间 |
| config.test.js | 6 | +2 | 无anchors/无heuristic防御 |
| consistency.test.js | 3 | 0 | 参数协议 |
| core_math.test.js | 4 | 0 | 数学基础 |
| detector_buffers.test.js | 3 | 0 | 缓冲区管理 |
| detector_modes.test.js | 2 | 0 | 模式标记 |
| detector.test.js | 4+32(matrix) | 0 | NCC+矩阵验证 |
| doubao.test.js | 18 | +2 | 矩形Phase 2命中 |
| edge_cases.test.js | 5 | 0 | 边角 |
| frontend_contract.test.js | 4 | 0 | DOM hooks |
| frontend_interaction.test.js | 3 | 0 | E2E还原 |
| i18n.test.js | 12 | 0 | 7语言翻译 |
| memory_pressure.test.js | 1 | 0 | 50轮内存 |
| memory_queue.test.js | 3 | +1 | 异常恢复 |
| parameter_matrix.test.js | 5 | 0 | 参数矩阵 |
| pipeline.test.js | 2 | 0 | 全流程 |
| product_audit.test.js | 4+1+1+2 | +1 | 资产存在性校验 |
| productization.test.js | 4 | 0 | 注册表 |
| profiles.test.js | 4 | +1 | dalle3资产校验 |
| restoration_metrics.test.js | 3 | 0 | PSNR/MSE |
| security.test.js | 6+2 | 0 | 安全验证 |
| subpixel.test.js | 2 | 0 | 亚像素 |
| watermarkEngine.test.js | 5 | 0 | 缓存/Worker |
| worker_resilience.test.js | 2 | 0 | Worker回退 |
| **real_sample.test.js** | **0** | **+3** | **真实样本回归** |
| **合计** | **188** | **+15** | **目标 203** |

---

## 九、执行顺序总表

```
┌─ Phase 1: 紧急Bug (先修后测)
│  ├─ 1.1 detector.js:306 色度权重 → BT.709
│  ├─ 1.2 profiles.js dalle3 → experimental标记
│  └─ 1.3 detector.js:132-227 Phase 2矩形支持
│
├─ Phase 2: 中等Bug
│  ├─ 2.1 gwrRemoveCommand.js:19-24 ASSETS动态映射
│  ├─ 2.2 gui.py:88,251 status_dot引用
│  ├─ 2.3 processing.js:53-88 并发池try/finally
│  └─ 2.4 config.js:47 无anchors防御
│
├─ Phase 3: 文档
│  ├─ 3.1 版本号统一 (4处)
│  └─ 3.2 内容更新 (3处)
│
├─ Phase 4: 单元测试 (+15个)
│  ├─ 4.1 bt709一致性 (+1)
│  ├─ 4.2 资产完整性 (+1)
│  ├─ 4.3 矩形Phase 2 (+2)
│  ├─ 4.4 CLI profile覆盖 (+2)
│  ├─ 4.5 队列异常恢复 (+1)
│  ├─ 4.6 config防御性 (+2)
│  └─ 4.7 真实样本回归 (+3, 新文件)
│
├─ Phase 5: 低优先级
│  ├─ 5.1 SSIM标注
│  ├─ 5.2 DOM引用
│  └─ 5.3 全局变量清理
│
└─ 验证: pnpm test → 目标 203/203 pass
```

---

*此分析由全面代码审计系统生成 — 2026-04-29*
