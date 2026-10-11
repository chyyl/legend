# 设计规范 · <主题> · v<版本>

上游品牌设计规范落地用模板。上游样本索引见 `data/brand-references.json`，按 `raw_path_template` 按需拉取，不打包全文。

| 项 | 内容 |
|---|---|
| 品牌 | 示例：tesla |
| 来源 URL | 示例：https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/tesla/DESIGN.md |
| 拉取时间 | 示例：2026-10-03 |
| 拉取状态 | 示例：HTTP 200 |
| 覆盖声明 | 示例：仅采用色彩与字体规则，未声称覆盖该规范全部内容 |

示例数据行以「示例：」开头，落盘前删除。

## 1. 取用范围

| 项 | 内容 |
|---|---|
| 采用部分 | 示例：colors、typography 两节 |
| 未采用部分 | 示例：动效与插画规范，超出界面结构范围 |
| 许可说明 | 示例：仅引用数值规则，未复制上游文本与二进制资源 |

## 2. 色彩落地

上游给色值，本包转成语义 token，不直接使用色值。

| 上游 token | 上游值 | 本包 semantic token | 本包取值 | 用途 |
|---|---|---|---|---|
| 示例：canvas | 示例：#FFFFFF | bg-canvas | `{primitive.color.gray-0}` | 示例：页面底色 |
| 示例：ink | 示例：#000000 | text-primary | `{primitive.color.gray-900}` | 示例：正文与标题 |
| 示例：accent | 示例：#E82127 | action-primary | `{primitive.color.red-600}` | 示例：主要操作按钮 |
|  |  |  |  |  |

上游强调色对比度若不足 4.5:1，改为本包取值并在第 6 节记录。

## 3. 字体落地

| 上游 token | fontSize | fontWeight | lineHeight | letterSpacing | 本包用途 token |
|---|---|---|---|---|---|
| 示例：hero-display | 示例：56px | 示例：600 | 示例：1.07 | 示例：-0.28px | hero-display |
| 示例：body | 示例：17px | 示例：400 | 示例：1.47 | 示例：0 | body |
|  |  |  |  |  |  |

上游 letterSpacing 为负值时直接保留，这是大字号下的必要修正，不视为多余装饰。

## 4. 间距与圆角

| 上游 token | 上游值 | 本包 primitive token | 本包取值 |
|---|---|---|---|
| 示例：space-md | 示例：16px | spacing-4 | 示例：16px |
| 示例：radius | 示例：8px | radius-lg | 示例：8px |
|  |  |  |  |

## 5. 组件映射

| 组件 | 引用 | 与上游差异 |
|---|---|---|
| Button.primary | `{semantic.color.action-primary}` | 示例：上游无按钮规范，按 token 取值 |
| Input.text | `{semantic.color.bg-surface}` | 示例：上游输入框为下划线式，改为边框式以满足对比度门槛 |
|  |  |  |

## 6. 偏离记录

与上游不一致处须逐条写明理由，不静默改动。

| 项 | 上游规则 | 本包取值 | 偏离理由 |
|---|---|---|---|
| 示例：正文对比度 | 示例：#767676 对白底 | 示例：gray-500 之外改用 gray-700 | 示例：原值对比度约 4.5:1 边界，AA 要求留余量 |
|  |  |  |  |

## 7. 复用边界

| 项 | 内容 |
|---|---|
| 可复用 | 示例：色彩与字体规则，可映射为 semantic 层 |
| 不可复用 | 示例：品牌插画与特定图形元素，属视觉识别范畴，不在界面结构范围内 |
| 风险 | 示例：品牌规范可能更新，需记录拉取时间并在必要时重新核对 |

## 8. 待确认

| 问题 | 是否阻断 |
|---|---|
| 示例：是否需要保留上游下划线式输入框 | 否 |
|  | 是 / 否 |