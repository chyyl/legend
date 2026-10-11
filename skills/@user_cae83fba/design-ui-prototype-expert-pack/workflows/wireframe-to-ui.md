# 线框到 UI 工作流

覆盖专家 02 与 03。用于确定页面目标与信息优先级，并把线框规格转成含参数取值的 UI 规格。

## 输入契约

| 字段 | 类型 | 必需 | 缺失时处理 |
|---|---|---|---|
| pages | 数组 | 是 | 阻断，E-INPUT-05，需先执行 01 |
| mainPath | 数组 | 是 | 阻断，E-INPUT-06 |
| primaryActions | 数组 | 是 | 阻断，E-INPUT-08，视觉焦点无法确定 |
| coveredStates | 数组 | 否 | 缺省按主态、空态、加载态、错态、权限态补齐并标注 |
| industryContext | 文本 | 是 | 追问一次，缺省时不做行业声明并阻断进入 04 |
| density | 枚举：紧凑 / 标准 / 宽松 | 否 | 缺省按标准 |
| targetDevices | 数组 | 否 | 缺省按移动端、笔记本、桌面宽屏三档 |
| brandAssets | 文件 | 否 | 缺省用中性色系并标注可替换 |

## 门禁

| 门禁 | 判定标准 | 命中后动作 |
|---|---|---|
| W1 页面目标明确 | 每页 goal 可一句话复述 | 走 Q1 追问 |
| W2 主操作唯一 | 每页 primaryActions 恰好 1 个 | 多余项降为 secondaryActions |
| W3 状态覆盖 | 每页不少于 4 个状态，含主态与空态 | 补齐后继续 |
| W4 区块顺序有据 | blocks 顺序按用户决策顺序 | 走 Q2 确认 |
| W5 行业已声明 | industryContext 非空 | 走 Q3 追问 |
| W6 参数可落地 | 每项规则含具体数值或 token 名 | 补数值，不接受形容词 |

## 执行步骤

1. **确定页面目标**。逐页写 goal，用户任务动词开头，例如查看、录入、审批。
2. **排定信息优先级**。给每个区块定 priority，1 为最高，首屏必须含 priority 1 的区块。
3. **定义布局决策**。每项决策写选型与理由，理由须指向用户任务或阅读顺序。
4. **给视觉参数**。按第「参数基线」表给出字体层级、间距 token、颜色语义、组件样式、状态反馈取值。
5. **算对比度**。逐对前景背景算比值，普通文本不低于 4.5:1，关键控件不低于 3:1，记录比值与阈值。
6. **对照行业反模式**。按行业逐条对照 `references/anti-patterns.md`，命中项写调整后取值。

### 参数基线

| 项目 | 缺省取值 | 可否调整 |
|---|---|---|
| 字体层级 | 页面标题 24/700、区块标题 16/600、正文 14/400、辅助 12/400、表格 13/400 | 可调，须仍保持 5 级 |
| 间距 token | 4/8/12/16/24/32 六档 | 可调，须仍不少于 6 个 |
| 颜色语义 | 主色、成功、警示、错误、中性五类 | 可调，须仍按语义命名 |
| 组件尺寸 | 按钮高 32/40，输入框高 36，边框 1px | 可调，须写明档位 |
| 动效时长 | 150 至 250ms | 可调，须给 reduceMotion 兜底 |
| 触控尺寸 | 不小于 44x44 | 不可下调 |
| 断点 | 320-767移动端、768-1023 笔记本、1024 以上桌面 | 可调，须写区间与布局变化 |

## 输出契约

| 字段 | 类型 | 校验规则 | 落盘位置 |
|---|---|---|---|
| blocks[].priority | 整数 | 取值 1 至 3 | `blocks[].priority` |
| layoutDecisions | 数组 | 每项含 decision 与 reason | 线框规格 `layoutDecisions` |
| fontScale | 数组 | 至少 5 级，含 size、weight、lineHeight、usage | UI 规格 `fontScale` |
| spacingTokens | 数组 | 至少 6 个 | `spacingTokens` |
| colorSemantics | 数组 | 每项含 token、usage、forbiddenUsage | `colorSemantics` |
| contrastChecks | 数组 | 每项含 pair、ratio、threshold、pass | `contrastChecks` |
| stateFeedback | 数组 | 覆盖默认、悬停、聚焦、禁用、加载、错误 | `stateFeedback` |
| antiPatternChecklist | 数组 | 逐条给出是否命中与调整取值 | `antiPatternChecklist` |

落盘文件名 `02-wireframe-spec.md` 与 `03-ui-spec.md`。字段定义见 `data/schemas/page-inventory.schema.json` 与 `data/schemas/delivery-contract.schema.json`。

## 追问规则

| 编号 | 触发条件 | 问法 | 选项 |
|---|---|---|---|
| Q1 | 页面目标不明 | 用户到这页最想完成什么 | 查看数据 / 录入信息 / 审批决策 |
| Q2 | 区块顺序有争议 | 首屏优先放哪块 | 筛选与汇总 / 明细列表 / 图表概览 |
| Q3 | 行业未声明 | 这份 UI 服务哪个行业 | 金融 / 医疗 / 政务 / 通用工具 |
| Q4 | 密度未定 | 信息密度偏好 | 紧凑 / 标准 / 宽松 |
| Q5 | 设备范围不清 | 需要覆盖哪些设备 | 仅移动端 / 移动加笔记本 / 三档全覆盖 |

## 降级出口

W1、W2 或 W5 命中时交付四项：已确认的页面目标与区块清单；缺失项与需补材料；可继续推进的最低版本，例如只给主路径页面的区块草图与字体层级；下一步建议。参数可先按缺省值给出，但须逐条标注默认值可调整。

## 反模式

- 用高级、简洁、现代替代具体取值。
- 区块顺序照搬后台菜单或数据库字段顺序。
- 一页放两个主按钮，主操作被稀释。
- 只画主态，把空态与错态留给开发发挥。
- 对比度只写「符合规范」，不给比值与阈值。
- 行业反模式写「已注意行业规范」，评审无法验证。

## 关联

- 专家定义：`experts/02-flow-to-wireframe-expert.md`、`experts/03-wireframe-to-ui-expert.md`
- UI 规范细则：`references/ui-design-system-guide.md`
- 行业反模式：`references/anti-patterns.md`
- 模板：`references/output-templates.md`
