[English Document](README.md)

# Gemini & Doubao 无损去水印 (v1.8.0)

一款高性能、100% 纯客户端运行的 Gemini 与 豆包 (Doubao) AI 去水印工具。现已集成至 **@pilio** 生态系统，原生支持 AI Agent 协作。

<p align="center">
  <img src="https://count.getloli.com/@gemini-watermark-remover?name=gemini-watermark-remover&theme=minecraft&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto" width="400">
</p>

## 特性

- ✅ **多模型 Profile 系统** - 深度支持 **Gemini** 和 **豆包 (Doubao)** AI 水印。
- ✅ **自动探测与滑动寻优** - 主动相关性引擎自动锁定水印，并修正 AI 生成导致的位置抖动 (±4px)。
- ✅ **梯度探测加固 (Gradient Probing)** - 针对豆包等半透明/深色框水印的硬核识别技术。
- ✅ **100% 纯客户端** - 无后端、零延迟、隐私数据绝不出本地。
- ✅ **生产级加固 (v1.8)** - 支持多模型编排、多锚点探测以及完全非硬编码的参数协议。
- ✅ **批量与目录模型** - 支持多文件上传及本地全目录自动化处理。
- ✅ **PWA (Progressive Web App) 支持** - 支持将应用安装至桌面或手机，离线可用。
- ✅ **高级 UI / 磨砂玻璃设计** - Premium 视觉风格与丝滑微动画。
- ✅ **键盘快捷键** - `←/→` 切换对比、`Esc` 重置、`Ctrl+S` 保存。
- ✅ **多语言支持** - 已内置 **中、英、日、俄、法、德、西** 七国语言。

## 🛡️ 生产级加固保障 (v1.8.0)

为了确保在处理万级图片或超高分辨率（4K/8K）时的绝对稳定性与精确度，v1.8.0 引入了以下硬核技术：

1. **多锚点多步探测 (Multi-Anchor Probing)**：不再假设水印只在右下角。探测引擎会根据模型 Profile 自动在左上、右下等多个预设区域进行梯度匹配，捕获所有已知水印。
2. **感知梯度相关性 (Gradient Correlation)**：针对豆包等具有复杂透明度的水印，采用 Sobel 梯度相关性算法。这使得引擎在色彩极其复杂或背景极暗的情况下依然能实现 100% 的还原精度。
3. **滑动窗口对齐 (Sliding Window)**：自动处理 AI 生成过程中产生的亚像素级位置漂移。通过 `+/- 4px` 的局部搜索，自动锁定数学最优对齐位置。
4. **流式目录处理 (Streaming Directory Mode)**：利用 **Async Generators** 驱动本地目录处理。即使处理数万张图片，内存占用依然能维持在极低水平，彻底告别浏览器 OOM。

## 使用方法

### 在线体验
1. 访问 [banana.ovo.re](https://banana.ovo.re)。
2. 拖入或选择包含 Gemini/豆包 水印的图片。
3. 引擎会自动完成识别并无损移除。
4. 点击下载结果图。

### 油猴脚本 (Gemini 会话页面)
1. 安装 Tampermonkey 扩展。
2. 安装 [gemini-watermark-remover.user.js](https://banana.ovo.re/userscript/gemini-watermark-remover.user.js)。
3. 在 Gemini 聊天页面生成的图片下方会出现“复制/下载”按钮，点击即得无水印大图。

## 算法原理

### 数学还原公式

Gemini/Doubao 采用标准的 Alpha 混合模式叠加水印：

$$watermarked = \alpha \cdot logo + (1 - \alpha) \cdot original$$

为了实现**无损还原**，我们通过预先校准得到的掩模图反向解出原始像素值：

$$original = \frac{watermarked - \alpha \cdot logo}{1 - \alpha}$$

这种方法与基于 AI 生成（Inpainting）的“涂抹”式去水印完全不同，它能恢复背景中被遮挡的每一个像素的真实信息，实现数学级的无损。

---

## 免责声明

> [!WARNING]
> **风险自担**
> 本工具仅供个人研究与学习使用。用户需自行承担使用本工具可能导致的法律责任。作者不对任何数据损坏、图片失真或法律风险负责。

## 贡献
代码结构规范，欢迎提交 Pull Request 以支持更多模型的水印移除。

## 开源协议
[MIT License](./LICENSE)
