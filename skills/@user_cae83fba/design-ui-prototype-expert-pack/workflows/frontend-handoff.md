# 前端交接工作流

覆盖专家 05。用于把 UI 规格转成前端可执行的组件拆分、字段校验、事件时序、接口假设、埋点与响应式规则。

## 输入契约

| 字段 | 类型 | 必需 | 缺失时处理 |
|---|---|---|---|
| uiSpec | 文本 | 是 | 阻断，E-INPUT-10，需先执行 03 |
| pages | 数组 | 是 | 阻断，E-INPUT-05 |
| primaryActions | 数组 | 是 | 阻断，E-INPUT-08，事件表无法定义 |
| components | 数组 | 否 | 缺省按页面区块归纳，标注需人工确认 |
| designTokens | 对象 | 否 | 不阻断，缺省用原始值并标注待语义化 |
| apiContext | 文本 | 否 | 不阻断，apiAssumptions 全部标 confirmed 为 false |
| analyticsNeeds | 文本 | 否 | 不阻断，埋点按主操作推导并标注 |
| targetDevices | 数组 | 否 | 缺省按四档断点给出 |

## 门禁

| 门禁 | 判定标准 | 命中后动作 |
|---|---|---|
| H1 组件可实现 | 每组件有 props 与 states | 补齐后继续 |
| H2 必填有校验 | 必填字段 validation 非空 | 补规则与 errorMessage |
| H3 事件完整 | eventBehaviors 覆盖提交、校验、回退 | 补缺失类型 |
| H4 失败有回退 | 每事件含 failureFeedback | 走 Q1 确认业务规则 |
| H5 断点齐备 | 覆盖窄屏、移动端、笔记本、桌面宽屏四档 | 补档并写布局变化 |
| H6 边界已声明 | scopeBoundary 非空且 isProductionCode 为 false | 补 excluded 清单 |
| H7 弹性可落地 | elasticText 六条逐条给方式 | 补齐六条 |

## 执行步骤

1. **拆组件**。按复用与状态复杂度拆，不按视觉区块切。每组件写 props、states、usedInPages。
2. **列字段与校验**。逐字段写 type、required、validation、errorMessage。必填项不得空校验。
3. **写事件时序**。逐事件写 trigger、immediateFeedback、successFeedback、failureFeedback。必须覆盖提交、校验、回退三类。
4. **标接口假设**。逐条写 apiAssumptions，无上下文时 confirmed 全部为 false。
5. **给埋点建议**。按主操作推导 tracking，缺需求时走 Q2。
6. **写响应式**。四档断点逐档写 range、layoutChange、primaryPathKept。
7. **过弹性文本八条**。逐条给落地方式。规则定义见 `references/resilient-text.md`，本流程不另立清单。
8. **声明范围边界**。写 scopeBoundary，列 excluded 内容。

### 弹性文本落地要求速查

八条规则的完整定义在 `references/resilient-text.md`。本流程只补充落地时的最低要求：

| 规则 | 本流程的落地要求 |
|---|---|
| T1 标题换行 | 给换行阈值，说明是否使用手动换行标记 |
| T2 必要文本不可截断 | 说明价格、日期、状态的容器高度策略 |
| T3 Chip 与 Tag 溢出 | 说明换行策略或 `+n` 披露数量 |
| T4 Badge 冗余表达 | 说明除颜色外还用了图标还是文字 |
| T5 实时计数需语境 | 说明计数后缀文案或 `aria-label` |
| T6 动效降级 | 说明 `prefers-reduced-motion` 下的终态与焦点处理 |
| T7 窄屏按钮 | 说明换行后是否仍满足 44x44 触控尺寸 |
| T8 表格与数字 | 说明关键列冻结方式与数字不拆行的处理 |

## 输出契约

| 字段 | 类型 | 校验规则 | 落盘位置 |
|---|---|---|---|
| components | 数组 | 每项含 name、props、states | 交接清单 `components` |
| fields | 数组 | 必填项 validation 非空 | `fields` |
| eventBehaviors | 数组 | 至少 3 条，覆盖提交、校验、回退 | `eventBehaviors` |
| apiAssumptions | 数组 | 每项含 confirmed | `apiAssumptions` |
| tracking | 数组 | 每项含 event 与 trigger | `tracking` |
| breakpoints | 数组 | 四档齐备 | `breakpoints` |
| elasticText | 数组 | 6 条逐条给 approach | `elasticText` |
| accessibility | 数组 | 含对比度、焦点、键盘、状态冗余 | `accessibility` |
| scopeBoundary | 对象 | isProductionCode 为 false，excluded 非空 | `scopeBoundary` |

落盘文件名 `05-frontend-handoff.md`。字段定义见 `data/schemas/delivery-contract.schema.json` 的 `frontendHandoff` 段。

## 追问规则

| 编号 | 触发条件 | 问法 | 选项 |
|---|---|---|---|
| Q1 | 失败回退规则不明 | 提交失败后用户应看到什么 | 留在原地提示 / 回到列表 / 可重试 |
| Q2 | 埋点需求不明 | 需要哪些埋点 | 只记关键操作 / 含页面停留 / 暂不做 |
| Q3 | 组件拆分粒度 | 拆分依据 | 按视觉区块 / 按复用单元 / 按状态复杂度 |
| Q4 | 权限未提 | 是否需要角色差异化 | 需要 / 不需要 / 待确认 |
| Q5 | 原型范围不清 | 交付到哪一步 | 静态页面 / 可点击跳转 / 含表单校验 |

## 降级出口

H1 或 H3 命中时交付四项：已确认的组件与字段清单；缺失项与需补材料；可继续推进的最低版本，例如只给组件拆分与断点表；下一步建议。apiContext 缺失时照常输出 apiAssumptions，但全部标 confirmed 为 false，并在结论首句声明。

## 反模式

- 只交一段 HTML，不说明数据、权限、错误处理与交互预期。
- 声称已达到生产可用，或省略 scopeBoundary。
- 必填字段不写校验规则，让前端自行决定。
- 只写成功路径，失败与回退留空。
- 断点只写自适应，不给区间与布局变化。
- 弹性文本统一写响应式，不逐条给八条的落地方式。

## 关联

- 专家定义：`experts/05-ui-to-prototype-expert.md`
- 上游沉淀：`workflows/design-system-extract.md`
- QA 细则：`references/frontend-prototype-qa-guide.md`
- 交付标准：`references/delivery-contract.md`
