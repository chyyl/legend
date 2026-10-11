# 组件状态表 · <主题> · v<版本>

| 项 | 内容 |
|---|---|
| 阶段 | 04 UI 转设计系统 |
| 基线 | `data/component-states.json` |
| 组件数 | 示例：12 |

示例数据行以「示例：」开头，落盘前删除。每类组件必须覆盖 7 个状态，缺一即在 06 记为 P1。

## 1. 状态清单

default、hover、focus、active、disabled、loading、error。

## 2. 状态矩阵

一行一个组件 × 状态，便于逐格核对。

| 组件 | default | hover | focus | active | disabled | loading | error |
|---|---|---|---|---|---|---|---|
| Button.primary | 示例：底 action-primary | 示例：底色加深 | 示例：outline 2px，offset 2px | 示例：同 hover | 示例：底 inset + 禁用属性 + 原因说明 | 示例：宽度锁定 + 图标 | 不适用，见 2.1 |
| Input.text | 示例：底 surface，边 border-strong | 示例：边 text-muted | 示例：边 focus-ring + outline | 示例：保持 focus | 示例：底 inset + 禁用属性 + 原因说明 | 示例：右侧图标，内容不清空 | 示例：边 danger + 就近说明 |
|  |  |  |  |  |  |  |  |

## 3. 逐组件明细

### 3.1 Button

| 状态 | 表现 | token 引用 | 备注 |
|---|---|---|---|
| default | 示例：底色 action-primary，文字 text-on-inverse | `{semantic.color.action-primary}` |  |
| hover | 示例：底色 action-primary-hover | `{semantic.color.action-primary-hover}` | 示例：不改尺寸与边框宽度 |
| focus | 示例：outline 2px solid focus-ring，outlineOffset 2px | `{semantic.focus.ring}` | 示例：Enter 与 Space 均可激活 |
| active | 示例：同 hover |  | 示例：与 hover 相同即可 |
| disabled | 示例：底色 bg-inset，文字 text-muted，cursor not-allowed |  | 示例：须说明缺少哪个前置条件 |
| loading | 示例：宽度锁定，左侧旋转图标 |  | 示例：aria-busy 为 true |
| error | 不适用 |  | 见 2.1 |

### 3.2 Input

| 状态 | 表现 | token 引用 | 备注 |
|---|---|---|---|
| default | 示例：底 surface，边 border-strong |  |  |
| hover | 示例：边 text-muted |  |  |
| focus | 示例：边 focus-ring + outline 2px offset 2px | `{semantic.focus.ring}` | 示例：焦点环不得被容器裁切 |
| active | 示例：保持 focus 边框 |  |  |
| disabled | 示例：底 bg-inset，文字 text-muted |  | 示例：须说明原因 |
| loading | 示例：右侧指示图标 |  |  |
| error | 示例：边 danger，字段下方红字 | `{semantic.color.action-danger}` | 示例：aria-invalid 为 true，不用仅颜色表达 |

### 3.3 其余组件

按 `data/component-states.json` 逐个补齐，字段一致：表现、token 引用、备注。

## 4. notApplicable 说明

标注不适用的状态必须写明理由与替代表达位置。

| 组件.状态 | 不适用理由 | 替代表达位置 |
|---|---|---|
| Button.error | 示例：按钮自身一般无 error 态。按钮的失败由其触发的业务结果承载，视觉上体现为 Toast 或表单错误。若关联校验失败应在表单层表达，由字段错误提示指出哪个字段不合法，而不是把按钮染成红色。 | 示例：表单字段错误提示、Toast |
| Checkbox.loading | 示例：本地勾选无异步过程 | 示例：提交按钮 loading 态 |
| Toast.disabled | 示例：Toast 为系统单向通知，无用户交互状态 | 示例：操作按钮禁用时不展示该 Toast |
|  |  |  |

## 5. 无障碍要求

| 项 | 要求 | 结论 |
|---|---|---|
| 焦点环 | outline 2px + offset 2px，与相邻元素对比度不低于 3:1 | 示例：达标 |
| 焦点顺序 | 与视觉阅读顺序一致 | 示例：达标 |
| 状态冗余 | 选中、错误、禁用不只用颜色表达 | 示例：达标 |
| 错误关联 | aria-invalid 与 aria-describedby 关联字段 | 示例：达标 |
| 禁用原因 | 每类禁用均给出原因传达方式 | 示例：达标 |

## 6. 检查项

| 检查 | 结论 |
|---|---|
| 12 类组件均覆盖 7 状态 | 示例：是 |
| focus 状态均给出 outline 与 offset 具体值 | 示例：是 |
| disabled 状态均给出原因传达方式 | 示例：是 |
| notApplicable 均写明理由 | 示例：是 |