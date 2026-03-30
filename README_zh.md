[English](README.md)

# Gemini 无损去水印工具 - [banana.ovo.re](https://banana.ovo.re)

基于 Javascript 的纯浏览器端 Gemini AI 图像无损去水印工具，使用数学精确的反向 Alpha 混合算法

<p align="center">
  <img src="https://count.getloli.com/@gemini-watermark-remover?name=gemini-watermark-remover&theme=minecraft&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto" width="400">
</p>

## 特性

- ✅ **纯浏览器端处理** - 无需后端服务器，所有处理在本地完成
- ✅ **隐私保护** - 图片不会上传到任何服务器
- ✅ **数学精确** - 基于反方向 Alpha 混合算法，非 AI 生成模型
- ✅ **强大混合探测 (v1.5)** - 结合尺寸规则、**NCC (归一化相关性)** 及 **自适应降噪**。
- ✅ **切边容错恢复** - 智能识别并去除超出图像边界（部分被裁剪）的水印。
- ✅ **批量与目录模式** - 支持多文件上传及全自动本地目录批处理。
- ✅ **多语言支持 (5国语言)** - 完整支持 **中、英、日、俄、法** 五国语言及自动识别。(v1.5.5)
- ✅ **一键剪贴板复制** - 处理完成后可直接点击“复制”进行即时分享。(v1.5.5)
- ✅ **设置持久化** - 通过 `localStorage` 自动记忆您的扫描偏好与语言设置。(v1.5.5)
- ✅ **安全加固** - 内置 XSS 防御与内存泄漏主动防护机制。
- ✅ **开发者友好** - 完整的单元测试套件 (node:test) 与标准化的测试工具集。
- ✅ **跨平台支持** - 兼容主流浏览器、Node.js 以及 Python 桌面版程序。

## 效果示例

<details open>
<summary>点击查看/收起示例</summary>
　
<p>无损 diff 示例</p>
<p><img src="docs/lossless_diff.webp"></p>


<p>示例图片</p>

| 原图 | 去水印后 |
| :---: | :----: |
| <img src="docs/1.webp" width="400"> | <img src="docs/unwatermarked_1.webp" width="400"> |
| <img src="docs/2.webp" width="400"> | <img src="docs/unwatermarked_2.webp" width="400"> |
| <img src="docs/3.webp" width="400"> | <img src="docs/unwatermarked_3.webp" width="400"> |
| <img src="docs/4.webp" width="400"> | <img src="docs/unwatermarked_4.webp" width="400"> |
| <img src="docs/5.webp" width="400"> | <img src="docs/unwatermarked_5.webp" width="400"> |

</details>

## ⚠️ 使用需注意

> [!WARNING]
> **使用此工具产生的风险由用户自行承担**
>
> 本工具涉及对图像数据的修改。尽管在设计上力求处理结果的可靠性，但由于以下因素，仍可能产生非预期的处理结果：
> - Gemini 水印实现方式的更新或变动
> - 图像文件损坏或使用了非标准格式
> - 测试案例未能覆盖的边界情况
>
> 作者对任何形式的数据丢失、图像损坏或非预期的修改结果不承担法律责任。使用本工具即代表您已了解并接受上述风险。

> [!NOTE]
> 另请注意：使用此工具需禁用 Canvas 指纹防护扩展（如 Canvas Fingerprint Defender），否则可能会导致处理结果错误。 https://github.com/journey-ad/gemini-watermark-remover/issues/3

## 使用方法

### 在线使用

1. 浏览器打开 [banana.ovo.re](https://banana.ovo.re)
2. 拖拽或点击选择带水印的 Gemini 图片
3. 图片会自动开始处理，移除水印
4. 下载处理后的图片

### 油猴脚本

1. 安装油猴插件（如 Tampermonkey 或 Greasemonkey）
2. 打开 [gemini-watermark-remover.user.js](https://banana.ovo.re/userscript/gemini-watermark-remover.user.js)
3. 脚本会自动安装到浏览器中
4. Gemini 对话页面点击复制或者下载图片时，会自动移除水印

## 开发

```bash
# 安装依赖
pnpm install

# 开发构建
pnpm dev

# 生产构建
pnpm build

# 本地预览
pnpm serve
```

## 算法原理

### Gemini 添加水印的方式

Gemini 通过以下方式添加水印：

$$watermarked = \alpha \cdot logo + (1 - \alpha) \cdot original$$

其中：
- `watermarked`: 带水印的像素值
- `α`: Alpha 通道值 (0.0-1.0)
- `logo`: 水印 logo 的颜色值（白色 = 255）
- `original`: 原始像素值

### 反向求解移除水印

为了去除水印，可以反向求解如下：

$$original = \frac{watermarked - \alpha \cdot logo}{1 - \alpha}$$

通过在纯色背景上捕获水印，我们可以重建 Alpha 通道，然后应用反向公式恢复原始图像

## 水印检测规则

引擎采用 **分级混合探测策略 (v1.5)**：
1. **第一级：官方目录匹配**：直接比对 512px 到 4096px（含 21:9）的官方标准分辨率数据库。
2. **第二级：自适应降噪搜索**：若开启 `noiseReduction`，会对探测副本进行专门的平滑处理以提高信噪比，同时保持像素级的去除精度。
3. **第三级：智能切边恢复**：允许探测窗口溢出边界，识别被裁剪的水印（最高支持 60% 遮挡）。
4. **第四级：深度 Sobel 强度扫描**：针对复杂背景，通过 Sobel 算子比对梯度特征以确保零误报。

| 官方分辨率梯队 | 水印尺寸 | 默认边距 | 状态 |
| :--- | :--- | :--- | :--- |
| 0.5k (如 512x512) | 48×48 | 32px | 已集成 |
| 1.0k (如 1024x1024 / 1536x672) | 96×96 | 64px | 已集成 |
| 2.0k (如 2048x2048) | 96×96 | 64px | 已集成 |
| 4.0k (如 4096x4096) | 96×96 | 64px | 已集成 |

## 项目结构

```
├── src/
│   ├── assets/            # 校准后的水印掩码 (bg_48, bg_96)
│   ├── core/
│   │   ├── alphaMap.js    # Alpha map 计算逻辑
│   │   ├── blendModes.js  # 优化版反向 alpha 混合算法
│   │   ├── catalog.js     # 官方 Gemini 分辨率数据库
│   │   ├── config.js      # 水印尺寸规则与参数协议
│   │   ├── detector.js    # 分级混合探测器 (NCC + Sobel + Catalog)
│   │   └── watermarkEngine.js  # 引擎调度 (含持久化 Worker)
│   ├── i18n/              # 国际化语言文件 (JSON)
│   ├── userscript/        # 油猴脚本
│   ├── app.js             # 网站应用入口
│   ├── cli.js             # 标准化命令行工具 (JSON, Pipe, 并发)
│   ├── i18n.js            # 国际化工具
│   └── utils.js           # 共享工具类 (环境守护)
├── python/                # 带有跨平台 GUI 的 Python 集成
├── tests/                 # 标准化测试套件 (39+ 测试用例)
│   ├── consistency.test.js # 新增：参数协议自动化校验
│   ├── test_utils.js      # 稳健的测试工厂
│   └── ...                # 详细的单元与集成测试
├── .github/workflows/      # CI/CD 自动化流水线
└── package.json           # 标准化脚本 (lint, format, test)
```

## 核心模块

### alphaMap.js

从背景捕获图像计算 Alpha 通道：

```javascript
export function calculateAlphaMap(bgCaptureImageData) {
    // 提取 RGB 通道最大值并归一化到 [0, 1]
    const alphaMap = new Float32Array(width * height);
    for (let i = 0; i < alphaMap.length; i++) {
        const maxChannel = Math.max(r, g, b);
        alphaMap[i] = maxChannel / 255.0;
    }
    return alphaMap;
}
```

### blendModes.js

实现反向 Alpha 混合算法：

```javascript
export function removeWatermark(imageData, alphaMap, position) {
    // 对每个像素应用公式：original = (watermarked - α × 255) / (1 - α)
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const alpha = Math.min(alphaMap[idx], MAX_ALPHA);
            const original = (watermarked - alpha * 255) / (1.0 - alpha);
            imageData.data[idx] = Math.max(0, Math.min(255, original));
        }
    }
}
```

### watermarkEngine.js

主引擎类，协调整个处理流程：

```javascript
export class WatermarkEngine {
    async removeWatermarkFromImage(image) {
        // 1. 检测水印尺寸
        const config = detectWatermarkConfig(width, height);

        // 2. 获取 alpha map
        const alphaMap = await this.getAlphaMap(config.logoSize);

        // 3. 移除水印
        removeWatermark(imageData, alphaMap, position);

        return canvas;
    }
}
```

## 浏览器兼容性

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

需要支持：
- ES6 Modules
- Canvas API
- Async/Await
- TypedArray (Float32Array, Uint8ClampedArray)

---

## 局限性

- 只去除了 **Gemini 可见的水印**<small>（即右下角的半透明 Logo）</small>
- 无法去除隐形或隐写水印。<small>[（了解更多关于 SynthID 的信息）](https://support.google.com/gemini/answer/16722517)</small>
- 针对 Gemini 当前的水印模式设计<small>（截至 2025 年）</small>

## 免责声明

本工具仅限**个人学习研究**所用，不得用于商业用途。

根据您所在的司法管辖区及图像的实际用途，移除水印的行为可能具有潜在的法律影响。用户需自行确保其使用行为符合适用法律、相关服务条款以及知识产权规定，并对此承担全部责任。

作者不纵容也不鼓励将本工具用于侵犯版权、虚假陈述或任何其他非法用途。

**本软件按“原样”提供，不提供任何形式（无论是明示或暗示）的保证。在任何情况下，作者均不对因使用本软件而产生的任何索赔、损害或其他责任承担任何义务。**

## 致谢

本项目是 [Gemini Watermark Tool](https://github.com/allenk/GeminiWatermarkTool) 的 JavaScript 移植版本，原作者 Allen Kuo ([@allenk](https://github.com/allenk))

反向 Alpha 混合算法和用于校准的水印图像基于原作者的工作 © 2024 AllenK (Kwyshell)，采用 MIT 许可证

## 相关链接

- [Gemini Watermark Tool](https://github.com/allenk/GeminiWatermarkTool)
- [算法原理说明](https://allenkuo.medium.com/removing-gemini-ai-watermarks-a-deep-dive-into-reverse-alpha-blending-bbbd83af2a3f)

## 许可证

[MIT License](./LICENSE)
