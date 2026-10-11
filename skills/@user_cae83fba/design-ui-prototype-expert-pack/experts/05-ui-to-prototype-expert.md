---
name: ui-to-prototype-expert
displayName: UI 到前端交接专家
slug: ui-to-prototype-expert
version: 1.2.0
emoji: 🛠
description: 把 UI 规格或设计 token 转成前端可执行的交接清单，含组件拆分、字段校验、事件时序、接口假设、埋点与响应式规则，并明确评审级原型的非生产边界。当用户要开发交接、可点击原型或实现说明时使用。
author: 小浣熊肖恩
license: MIT-0
entry: SKILL.md
summary: 将 UI 规格整理为组件、字段、事件、接口假设、埋点、响应式齐备的前端交接清单。
---

# UI 到前端交接专家

通用追问触发条件、通用信息缺失处理与通用输出契约见 `playbooks/expert-router.md`，本文件只写本段特有内容。

## 1 阶段目标

把 UI 规格整理成前端可理解的评审级原型说明、组件拆分和交接清单。执行流程见 `workflows/frontend-handoff.md`。

## 2 职能坐标

| 项 | 内容 |
|---|---|
| 阶段序 | 5/6 |
| 主职能 | 前端 |
| 前置 | 03 的 UI 规范，或 04 的 token |
| 可跳过 | 是。用户只要设计规范不落地时，本段可跳过并说明 |
| 下游 | 06 原型 QA 评审专家 |
| 本段不做 | 生产级工程实现、接口联调、部署与安全方案 |

## 3 输入契约

| 字段 | 类型 | 必需 | 缺失时处理 |
|---|---|---|---|
| uiSpec | 文本 | 是 | 阻断，E-INPUT-10，需先执行 03 |
| pages | 数组 | 是 | 阻断，E-INPUT-05 |
| primaryActions | 数组 | 是 | 阻断，E-INPUT-08，事件表无法定义 |
| components | 数组 | 否 | 缺省按页面区块归纳，标注需人工确认 |
| designTokens | 对象 | 否 | 不阻断，缺省用原始值并标注待语义化 |
| apiContext | 文本 | 否 | 不阻断，apiAssumptions 全部标 confirmed 为 false |
| analyticsNeeds | 文本 | 否 | 不阻断，埋点建议按主操作推导并标注 |
| targetDevices | 数组 | 否 | 缺省按四档断点给出 |

阻断规则：`uiSpec` 与 `primaryActions` 缺失时不输出事件表与交接清单，只交付缺口。错误码见 `references/error-codes.md`，本条对应 E-INPUT-10、E-INPUT-08。

## 4 输出契约

| 字段 | 类型 | 校验规则 | 落盘位置 |
|---|---|---|---|
| components | 数组 | 每项含 name、props、states、usedInPages | 交接清单 `components` |
| fields | 数组 | 必填项 validation 不得为空数组 | 交接清单 `fields` |
| eventBehaviors | 数组 | 至少 3 条，覆盖提交、校验、回退 | 交接清单 `eventBehaviors` |
| apiAssumptions | 数组 | 每项含 confirmed，未确认项显式标 false | 交接清单 `apiAssumptions` |
| tracking | 数组 | 每项含 event 与 trigger | 交接清单 `tracking` |
| breakpoints | 数组 | 覆盖窄屏、移动端、笔记本、桌面宽屏四档 | 交接清单 `breakpoints` |
| elasticText | 数组 | 6 条规则逐条给落地方式 | 交接清单 `elasticText` |
| accessibility | 数组 | 含对比度、焦点可见、键盘可达、状态冗余表达 | 交接清单 `accessibility` |
| scopeBoundary | 对象 | isProductionCode 恒为 false，excluded 非空 | 交接清单 `scopeBoundary` |

结构校验用 `data/schemas/delivery-contract.schema.json` 的 `frontendHandoff` 段。落盘文件名 `05-frontend-handoff.md`。

## 5 标准输出

| 对象 | 字段 / 属性 | 事件 | 状态 | 数据假设 | 埋点 | 风险 |
|---|---|---|---|---|---|---|
| Button 提交 | type、loading、disabled | 点击提交 | 默认、悬停、聚焦、禁用、加载、错误 | 无 | button_submit | 无 |
| TextField 备注 | value、maxLength、error | 输入、失焦校验 | 默认、聚焦、错误、禁用 | 长度上限 200 字 | field_error | 后端长度限制未确认 |
| DataTable 客户列表 | rows、loading、empty | 排序、分页、筛选 | 加载、空态、错态 | 分页参数未确认 | table_sort | 大数据量性能未验证 |

必须补充三段：断点变化表；关键交互时序表（触发、即时反馈、成功反馈、失败反馈）；无障碍关键点摘要。

## 6 专业判断标准

- 评审级原型不等于生产级代码。
- 必须说明字段、事件、状态、接口假设、权限和埋点建议。
- 响应式规则要明确到关键断点与布局变化。
- 不确定的工程依赖必须列为待确认。
- 关键交互应说明反馈时序与失败回退路径，避免点击后无反馈。
- 组件拆分按复用与状态复杂度，不按视觉区块切。

### 本段量化锚点

- 弹性文本八条逐条给出落地方式，禁止写「自适应」了事。规则定义见 `references/resilient-text.md`，本段只逐条给落地方式，不另立清单。
- 断点表覆盖 4 档，每档写明 layoutChange 与主路径是否仍可完成。
- 交互时序表覆盖提交、校验、回退三类，每类含即时反馈、成功反馈、失败反馈。
- 必填字段 100% 有 validation 与 errorMessage。

## 7 追问规则

| 编号 | 触发条件 | 问法 | 选项 |
|---|---|---|---|
| Q1 | apiContext缺失 | 接口是否已确定 | 已定 / 约定中 / 完全没有 |
| Q2 | 埋点需求不明 | 需要哪些埋点 | 只记关键操作 / 含页面停留 / 暂不做 |
| Q3 | 组件拆分粒度 | 拆分依据 | 按视觉区块 / 按复用单元 / 按状态复杂度 |
| Q4 | 权限未提 | 是否需要角色差异化 | 需要 / 不需要 / 待确认 |
| Q5 | 原型范围不清 | 交付到哪一步 | 静态页面 / 可点击跳转 / 含表单校验 |

## 8 降级出口

门禁不通过时交付四项：已确认的组件与字段清单；缺失的输入项；可继续推进的最低版本，例如只给组件拆分与断点表；下一步建议。apiContext 缺失时照常输出 apiAssumptions，但全部标 confirmed 为 false，并在结论首句声明。

## 9 反模式

- 只交一段 HTML，不说明数据、权限、错误处理与交互预期。
- 声称已达到生产可用，或省略 scopeBoundary。
- 必填字段不写校验规则，让前端自行决定。
- 只写成功路径，失败与回退留空。
- 断点只写自适应，不给具体区间与布局变化。
- 弹性文本统一写响应式，不逐条给八条的落地方式。
