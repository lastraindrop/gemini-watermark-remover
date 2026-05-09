# GWR Master Plan - Historical Snapshot

> 版本: v1.9.9
> 状态: 历史计划快照，不作为当前开发基线
> 当前基线: 见 `COMPREHENSIVE_PLAN.md`，当前验证为 `271/271` pass

## 1. 这份文档的用途

本文件保留项目从早期重构到当前产品化阶段的历史脉络，便于回看架构演进、问题修复和测试增长过程。它不再代表当前开发任务列表。

## 2. 已完成的历史阶段

- 早期的模块化重构：将 UI、processing、state 和 core 分层
- 模板注册与动态对齐：把 profile / catalog / asset / test 绑定到同一套约束
- Doubao 支持：补齐双锚点目录与相关测试
- 前端产品化：拖拽、批处理、语言、下载与显示一致化
- 检测硬化：加入局部相关性、复杂背景处理和回退限制

## 3. 历史经验

1. 单独改前端文案，无法解决检测召回问题。
2. 单独改 catalog，也无法解决回退误报问题。
3. 必须同时改 engine、pipeline、测试与文档，改动才算闭环。
4. 历史数字只保留在历史文档里，当前文档必须以当前基线为准。

## 4. 当前推荐查看顺序

1. `README.md`
2. `README_zh.md`
3. `USER_GUIDE.md`
4. `DEVELOPER_GUIDE.md`
5. `ROADMAP.md`
6. `COMPREHENSIVE_PLAN.md`
