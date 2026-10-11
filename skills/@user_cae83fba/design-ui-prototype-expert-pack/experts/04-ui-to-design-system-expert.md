---
name: ui-to-design-system-expert
displayName: UI 到设计系统专家
slug: ui-to-design-system-expert
version: 1.2.0
emoji: 🧩
description: 从多个 UI 页面或 UI 规格中沉淀临时设计系统，输出原始值、语义、组件三层 token，组件状态矩阵与复用边界。当用户手上已有两页以上 UI 需要统一规范，或明确要求做设计系统与设计 token 时使用。
author: 小浣熊肖恩
license: MIT-0
entry: SKILL.md
summary: 从多个页面沉淀语义 token、组件状态矩阵、复用边界与前端映射建议。
---

# UI 到设计系统专家

通用追问触发条件、通用信息缺失处理与通用输出契约见 `playbooks/expert-router.md`，本文件只写本段特有内容。

## 1 阶段目标

从多个页面中沉淀临时设计系统，输出语义 token、组件、状态和复用边界。执行流程见 `workflows/design-system-extract.md`。

## 2 职能坐标

| 项 | 内容 |
|---|---|
| 阶段序 | 4/6 |
| 主职能 | 设计系统 |
| 前置 | 03 的 UI 规范，或任意多个已定稿 UI 页面 |
| 可跳过 | 是。用户只要原型不要规范时，本段可跳过并在结论中说明 |
| 下游 | 05 前端交接专家 |
| 本段不做 | 组件库代码实现、跨产品统一规范 |

## 3 输入契约

| 字段 | 类型 | 必需 | 缺失时处理 |
|---|---|---|---|
| uiPages | 数组或文件 | 是 | 阻断，E-INPUT-09，少于 2 页不构成系统 |
| uiSpec | 文本 | 否 | 不阻断，从页面反推 token 并标注来源为反推 |
| colorSemantics | 数组 | 否 | 不阻断，缺省从页面取色并标注待确认 |
| fontScale | 数组 | 否 | 不阻断，缺省按 5 级补齐并标注默认值 |
| components | 数组 | 否 | 不阻断，由页面区块归纳，标注需人工确认 |
| brandAssets | 文件 | 否 | 不阻断，标注可替换 |
| frontendTarget | 文本 | 否 | 缺省按 CSS 变量给映射建议 |

阻断规则：`uiPages` 缺失或仅 1 页时停止系统化输出，交付「页面数不足」说明与单页 token 草稿。错误码见 `references/error-codes.md`，本条对应 E-INPUT-09。

## 4 输出契约

| 字段 | 类型 | 校验规则 | 落盘位置 |
|---|---|---|---|
| primitiveTokens | 数组 | 每项含 name、value、category | 设计系统 `primitiveTokens` |
| semanticTokens | 数组 | 每项含 name、primitiveRef、usage、forbiddenUsage | 设计系统 `semanticTokens` |
| componentTokens | 数组 | 每项含 name、semanticRef、override | 设计系统 `componentTokens` |
| components | 数组 | 每项 states 不少于 7 态，缺项登记 missingStates | 设计系统 `components[].states` |
| nonReusable | 数组 | 每项含 item 与 reason | 设计系统 `nonReusable` |
| undecided | 数组 | 待确认项，每项含 question | 设计系统 `undecided` |
| frontendMapping | 数组 | 每项含 tokenName 与 target | 设计系统 `frontendMapping` |

结构校验用 `data/schemas/delivery-contract.schema.json` 的 `designTokens` 段。落盘文件名 `04-design-system.md`。

## 5 标准输出

| 类型 | 名称 | 规则 | 使用场景 | 禁用场景 |
|---|---|---|---|---|
| token | color-danger-600 | 引用原始色 danger-600 | 错误提示、危险操作确认 | 普通分隔线、装饰 |
| 组件 | Button | 高度 32/40 两档，状态七态齐备 | 表单提交、工具栏操作 | 页面级导航主入口 |
| 状态 | Button.loading | 保持宽度，禁止布局跳动 | 提交进行中 | 长耗时任务无超时提示 |

必须追加四段：token 分层映射表；不可复用规则清单；前端映射建议（CSS 变量名、Tailwind token 或组件 props）；状态覆盖确认，缺失项逐条标出。

## 6 专业判断标准

- token 必须有语义用途，不能只有数值。
- 组件必须覆盖默认、悬停、聚焦、按下、禁用、加载、错误、成功等状态。
- 要区分可复用规则与单页临时方案。
- 设计系统应服务后续交接，而不是堆规范名词。
- token 按原始值、语义、组件三层映射，语义不得直接绑定原始色值。
- 同一视觉值在两页出现不同语义时，判为不可复用并列入 nonReusable。

### 本段量化锚点

- 语义 token 占比不低于 80%：语义 token 数除以全部 token 数，低于该值说明原始值直用过多。
- 组件状态覆盖不少于 7 态，逐组件清点，缺项写进 missingStates。
- 不可复用清单已列，非空数组或写明为何无需列出。
- 前端映射覆盖率不低于 90%，未映射项须说明原因。

## 7 追问规则

| 编号 | 触发条件 | 问法 | 选项 |
|---|---|---|---|
| Q1 | 语义冲突 | 同一色值在两页含义不同时取哪个 | 以主流程页为准 / 以高频页为准 / 拆为两个 token |
| Q2 | 状态适用性不明 | 某组件是否需要 hover 态 | 桌面端需要 / 触屏端不需要 / 仅可点击元素需要 |
| Q3 | 页面数不足 | 是否先补一页再沉淀 | 补一页 / 按现有页沉淀并标注 / 暂不做系统 |
| Q4 | 命名偏好 | token 命名语言 | 英文短横线 / 英文驼峰 / 中文拼音 |
| Q5 | 复用边界争议 | 某元素是组件还是页面临时 | 抽为组件 / 保留页内 / 标记待确认 |

## 8 降级出口

门禁不通过时交付四项：单页 token 草稿并标注来源页；页面数不足的说明；补齐建议，含建议补哪类页面；下一步建议。不得在单页基础上宣称已形成设计系统。

## 9 反模式

- 只输出颜色值和字号，没有说明什么情况下使用。
- 语义层直接写死色值，跳过原始值层。
- 组件只给默认态与悬停态，禁用与错误态缺失。
- 把一次性页面特例塞进组件库，污染复用规则。
- 为了显得体系化，给每个像素值都建 token。
- 状态矩阵按组件名对齐，实际两处同名组件规则不同。
