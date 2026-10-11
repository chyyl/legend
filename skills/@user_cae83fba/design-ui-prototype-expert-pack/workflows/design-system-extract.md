# 设计系统沉淀工作流

覆盖专家 04。用于从多个 UI 页面或 UI 规格中提炼 token 三层映射、组件状态矩阵与复用边界。

## 输入契约

| 字段 | 类型 | 必需 | 缺失时处理 |
|---|---|---|---|
| uiPages | 数组或文件 | 是 | 阻断，E-INPUT-09，少于 2 页不构成系统 |
| uiSpec | 文本 | 否 | 不阻断，从页面反推 token 并标注来源为反推 |
| colorSemantics | 数组 | 否 | 不阻断，缺省从页面取色并标注待确认 |
| fontScale | 数组 | 否 | 不阻断，缺省按 5 级补齐并标注默认值 |
| components | 数组 | 否 | 不阻断，由页面区块归纳，标注需人工确认 |
| brandAssets | 文件 | 否 | 不阻断，标注可替换 |
| frontendTarget | 文本 | 否 | 缺省按 CSS 变量给映射建议 |

## 门禁

| 门禁 | 判定标准 | 命中后动作 |
|---|---|---|
| S1 页面数足够 | uiPages 不少于 2 页 | 走 Q3 决策 |
| S2 语义占比达标 | 语义 token 占全部 token 不低于 80% | 补语义层 |
| S3 状态覆盖 | 每组件 states 不少于 7 态 | 缺项登记 missingStates |
| S4 无语义直绑 | 语义层不直接写死原始值 | 拆层或走 Q1 |
| S5 边界已判定 | 每条规则标记可复用、不可复用或待确认 | 走 Q5 判定 |
| S6 映射可落地 | 前端映射覆盖率不低于 90% | 补映射或说明原因 |

## 执行步骤

1. **收集原始值**。把所有页面的色值、字号、间距、圆角、阴影登记为 primitiveTokens，不做语义判断。
2. **建语义层**。为每个原始值补 usage 与 forbiddenUsage，形成 semanticTokens。
3. **补组件层**。仅在组件级参数与语义不同时建 componentTokens，避免无意义层级。
4. **填状态矩阵**。逐组件列 states，缺适用性的写进 missingStates 并说明原因。
5. **判复用边界**。逐条标记可复用、不可复用、待确认，语义冲突走 Q1。
6. **给前端映射**。输出 frontendMapping，逐 token 写 CSS 变量名、Tailwind token 或组件 props。
7. **算比例自检**。计算语义 token 占比与映射覆盖率，不达标回到第 2 与第 6 步。

### 三层映射示例

| 层 | 名称 | 值或引用 | 语义 |
|---|---|---|---|
| 原始值 | red-600 | #d92d20 | 无 |
| 语义 | color-danger | 引用 red-600 | 错误提示与危险操作确认 |
| 组件 | Button.dangerBg | 覆盖为 red-700 | 危险按钮背景，满足对比度 |

## 输出契约

| 字段 | 类型 | 校验规则 | 落盘位置 |
|---|---|---|---|
| primitiveTokens | 数组 | 每项含 name、value、category | 设计系统 `primitiveTokens` |
| semanticTokens | 数组 | 每项含 name、primitiveRef、usage、forbiddenUsage | `semanticTokens` |
| componentTokens | 数组 | 每项含 name、semanticRef、override | `componentTokens` |
| components | 数组 | 每项 states 不少于 7 态 | `components[].states` |
| nonReusable | 数组 | 每项含 item 与 reason | `nonReusable` |
| undecided | 数组 | 每项含 item 与 question | `undecided` |
| frontendMapping | 数组 | 覆盖率不低于 90% | `frontendMapping` |

落盘文件名 `04-design-system.md`。字段定义见 `data/schemas/delivery-contract.schema.json` 的 `designTokens` 段。

## 追问规则

| 编号 | 触发条件 | 问法 | 选项 |
|---|---|---|---|
| Q1 | 同色值语义冲突 | 同一色值在两页含义不同时取哪个 | 以主流程页为准 / 以高频页为准 / 拆为两个 token |
| Q2 | 状态适用性不明 | 某组件是否需要 hover 态 | 桌面端需要 / 触屏端不需要 / 仅可点击元素需要 |
| Q3 | 页面数不足 | 是否先补一页再沉淀 | 补一页 / 按现有页沉淀并标注 / 暂不做系统 |
| Q4 | 命名偏好 | token 命名语言 | 英文短横线 / 英文驼峰 / 中文拼音 |
| Q5 | 复用边界争议 | 某元素是组件还是页面临时 | 抽为组件 / 保留页内 / 标记待确认 |

## 降级出口

S1 命中时交付四项：单页 token 草稿并标注来源页；页面数不足的说明；补齐建议，含建议补哪类页面；下一步建议。单页基础上不得宣称已形成设计系统。

## 反模式

- 只输出颜色值和字号，没有使用场景说明。
- 语义层直接写死色值，跳过原始值层。
- 组件只给默认态与悬停态，禁用与错误态缺失。
- 一次性页面特例塞进组件库，污染复用规则。
- 为了显得体系化，给每个像素值都建 token。
- 两处同名组件规则不同，却按同一组件登记。

## 关联

- 专家定义：`experts/04-ui-to-design-system-expert.md`
- UI 规范细则：`references/ui-design-system-guide.md`
- 下游交接：`workflows/frontend-handoff.md`
- 交付标准：`references/delivery-contract.md`
