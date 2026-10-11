# 设计 token 表 · <主题> · v<版本>

| 项 | 内容 |
|---|---|
| 阶段 | 04 UI 转设计系统 |
| 基线 | `data/design-tokens.base.json` |
| 覆盖页面 | 示例：跟进质量看板、客户明细列表、跟进记录详情 |

示例数据行以「示例：」开头，落盘前删除。三层结构完整，component 层不得出现色值与尺寸字面量。

## 1. primitive 层

原始值，不带语义。可被 semantic 层引用。

### 1.1 颜色

| token | 值 |
|---|---|
| gray-0 | 示例：#FFFFFF |
| gray-50 | 示例：#F7F8FA |
| gray-200 | 示例：#DDE1E7 |
| gray-900 | 示例：#111827 |
| blue-600 | 示例：#1D4ED8 |
|  |  |

### 1.2 间距

| token | 值 |
|---|---|
| spacing-1 | 示例：4px |
| spacing-2 | 示例：8px |
| spacing-3 | 示例：12px |
| spacing-4 | 示例：16px |
| spacing-5 | 示例：24px |
| spacing-6 | 示例：32px |
|  |  |

### 1.3 圆角与阴影

| token | 值 |
|---|---|
| radius-md | 示例：4px |
| radius-lg | 示例：8px |
| shadow-low | 示例：0 1px 2px rgba(17,24,39,0.06) |
|  |  |

## 2. semantic 层

按用途-属性命名，含 usage 与 forbiddenUsage。语义 token 占比不低于 80%。

| token | 引用 | usage | forbiddenUsage |
|---|---|---|---|
| bg-canvas | `{primitive.color.gray-0}` | 示例：页面底色 | 示例：不用于卡片内嵌层 |
| bg-surface | `{primitive.color.gray-0}` | 示例：卡片与表格底色 | 示例：不用于页面底色 |
| bg-subtle | `{primitive.color.gray-50}` | 示例：表格隔行与次级区块 | 示例：不用于主要操作按钮 |
| text-primary | `{primitive.color.gray-900}` | 示例：正文与标题 | 示例：不用于禁用态文字 |
| text-muted | `{primitive.color.gray-500}` | 示例：辅助说明与占位文字 | 示例：不用于正文 |
| action-primary | `{primitive.color.blue-600}` | 示例：主要操作按钮与链接 | 示例：不用于普通标签 |
| border-subtle | `{primitive.color.gray-200}` | 示例：区块分隔线 | 示例：不用于输入框边框 |
| focus-ring | `{primitive.color.blue-600}` | 示例：焦点环 | 示例：不用于常规边框 |
|  |  |  |  |

### 2.1 typography 语义

按用途命名，不按字号命名。

| token | fontFamily | fontSize | fontWeight | lineHeight | letterSpacing | usage |
|---|---|---|---|---|---|---|
| hero-display | `{primitive.fontFamily.sans}` | 示例：28px | 示例：600 | 示例：36px | 示例：-0.2px | 示例：页面主标题 |
| body | `{primitive.fontFamily.sans}` | 示例：13px | 示例：400 | 示例：20px | 示例：0 | 示例：正文与表格单元格 |
| caption | `{primitive.fontFamily.sans}` | 示例：12px | 示例：400 | 示例：18px | 示例：0 | 示例：辅助说明 |
|  |  |  |  |  |  |  |

### 2.2 尺寸与焦点

| token | 值 | usage |
|---|---|---|
| size.controlHeight | 示例：32px | 示例：按钮与输入框高度 |
| size.touchTarget | 示例：44px | 示例：移动端最小可点区域 |
| focus.ringWidth | 示例：2px | 示例：焦点环宽度 |
| focus.ringOffset | 示例：2px | 示例：焦点环偏移 |
|  |  |  |

## 3. component 层

只允许出现 `{path.to.token}` 引用。跨页面复用后才允许进本层。

| component.变体 | 属性 | 引用 |
|---|---|---|
| Button.primary | bg | `{semantic.color.action-primary}` |
| Button.primary | text | `{semantic.color.text-on-inverse}` |
| Button.primary | minHeight | `{semantic.size.controlHeight}` |
| Button.primary | focusRing | `{semantic.focus.ring}` |
| Card.default | bg | `{semantic.color.bg-surface}` |
| Card.default | padding | `{primitive.spacing.5}` |
|  |  |  |

## 4. 前端映射建议

| token | CSS 变量 | 说明 |
|---|---|---|
| semantic.color.action-primary | `--color-action-primary` | 示例：直接映射，不做额外计算 |
| semantic.color.text-primary | `--color-text-primary` |  |
| semantic.typography.body | `--typography-body` | 示例：拆为 size、weight、line-height 三个变量 |
|  |  |  |

## 5. 复用边界

### 5.1 可复用

| 样式 | 出现页面数 | 收敛为 | 理由 |
|---|---|---|---|
| 示例：卡片底色与圆角 | 示例：3 | 示例：Card.default | 示例：三页结构一致 |

### 5.2 不可复用清单

| 样式 | 页面 | 不可复用理由 |
|---|---|---|
| 示例：看板指标卡数值字号 | 示例：跟进质量看板 | 示例：仅单页使用，收敛反而增加负担 |
|  |  |  |

## 6. 检查项

| 检查 | 结论 |
|---|---|
| primitive 只被 semantic 引用 | 是 |
| semantic 只被 component 引用 | 是 |
| component 层无色值与尺寸字面量 | 是 |
| 语义 token 占比不低于 80% | 示例：是 |
| typography 按用途命名 | 是 |