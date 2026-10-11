# 来源地图与能力继承说明

本文件记录当前专家包如何继承并重构原始 6 个子技能资产。它用于发布审查和后续维护，也帮助确认本次优化不是简单改目录，而是把原有能力转成可执行的专家工作流。

## 原始技能资产映射

| 原始技能资产 | 当前包承接位置 | 继承能力 | 本次变化 | 后续可增强点 |
|---|---|---|---|---|
| PRD 到原型 | 01、02、`references/product-wireframe-playbook.md` | 需求拆解、页面清单、流程状态 | 从单点能力改为阶段化流程 | 可继续增加行业案例 |
| 线框图 | 02、`references/output-templates.md` | 信息结构、页面区块、状态覆盖 | 增加验收标准 | 可补充更多页面模式 |
| UI 设计 | 03、`references/ui-design-system-guide.md` | 视觉规则、可读性、组件样式 | 新增参数化基线、无障碍阈值与动效时序 | 可增加视觉反例 |
| 设计系统 | 04、`references/output-templates.md` | token、组件、状态、复用边界 | 增加语义化要求 | 可增加更完整组件库 |
| 前端设计交接 | 05、`references/frontend-prototype-qa-guide.md` | 字段、事件、接口假设、响应式 | 明确评审级与生产级边界 | 可增加接口契约示例 |
| 设计转代码 / 原型检查 | 06、`qa/delivery-checklist.md` | 运行时检查、选择器、交互验收 | 增加 P0/P1/P2 门禁与 100 分制评分 | 可增加自动化检查脚本 |

## 1.2.0 路径迁移映射

本次重构把入口类文档从 `references/` 提升到根级或专属目录，能力内容文件保留在 `references/`。迁移对照：

| 1.1.x 路径 | 1.2.0 路径 | 迁移理由 |
|---|---|---|
| `references/quick-start.md` | `README.md` 段六 | 上手说明属于对外入口，放README 更易被读到 |
| `references/faq.md` | `SKILL.md` 第九章 | 8 条问答与红线、流程同处入口，便于同源维护 |
| `references/input-triage.md` | `workflows/requirement-intake.md` | 输入分流属流程动作，单独成流程目录 |
| `references/qa-checklist.md` | `qa/delivery-checklist.md` | 交付检查属验收环节，与发布门禁并列 |
| `references/gray-release-checklist.md` | `qa/release-gate.md` | 发布门禁独立成文件，与交付检查分离 |
| `examples/regression-prompts.md` | `qa/prompt-regression-set.md` 与 `tests/regression-cases.yaml` | 回归提示词与回归用例分离，前者供人阅读，后者供机器执行 |
| `references/source-map.md` | `source-map.md`（根级） | 继承关系属包级元信息，与入口文档同层 |

旧路径在 `_compat/` 保留同名跳转说明，仅为过渡期引用兜底，不作为 1.2.0 的推荐入口。

## 目录职责说明

| 目录 | 职责 | 边界 |
|---|---|---|
| 根目录 | 入口文档、包元数据、版本变更与来源地图 | 放对所有角色都读的文档 |
| `experts/` | 六个阶段专家模块 | 只放执行逻辑，不放通用规则 |
| `workflows/` | 跨阶段的流程定义 | 只放流程编排，不放方法细节 |
| `references/` | 方法细节与规则手册 | 只放被引用的知识资产 |
| `qa/` | 验收清单与发布门禁 | 只放判定规则，不放执行步骤 |
| `tests/` | 可机器执行的回归用例 | 只放结构化用例数据 |
| `data/schemas/` | JSON Schema，定义交付物结构约束 | 只放 schema，不放示例数据 |
| `playbooks/` | 路由手册 | 只放阶段归属与分配规则 |
| `examples/` | 端到端交付样例 | 只放完整示范，不写规则 |
| `_compat/` | 旧路径跳转说明 | 过渡期专用，1.3.0 计划移除 |

## 继承原则

- 继承专家能力，不继承旧包的多 ZIP 结构问题。
- 把分散子技能整合成一个总控入口和内部阶段模块。
- 用户只需要理解“我要从哪里开始”，不需要理解内部目录结构。
- 不迁移隐藏文件、二进制文件和平台上传风险文件。
- 不暴露本机路径、个人用户名、真实客户名或可反向识别的项目痕迹。
- 路径调整以「同类文件归同目录」为依据，不做无规则的位置变动。

## 能力覆盖检查

- 产品逻辑：由 01 模块、`references/product-wireframe-playbook.md` 和 `references/delivery-contract.md` 覆盖。
- 线框逻辑：由 02 模块、`references/output-templates.md` 和 `workflows/requirement-intake.md` 覆盖。
- 视觉设计：由 03 模块和 `references/ui-design-system-guide.md` 覆盖。
- 设计系统：由 04 模块、`references/output-templates.md` 和 `data/schemas/page-inventory.schema.json` 覆盖。
- 前端交接：由 05 模块和 `references/frontend-prototype-qa-guide.md` 覆盖。
- 原型评审：由 06 模块、`qa/delivery-checklist.md` 和 `qa/release-gate.md` 覆盖。

## 能力点级继承矩阵

| 原能力点 | 当前包文件 | 使用位置 | 继承状态 | 说明 |
|---|---|---|---|---|
| PRD 结构化 | 01、`references/delivery-contract.md` | 需求到产品结构 | 已继承 | 增加目标、非目标、用户和路径拆解 |
| 页面清单 | 01、`data/schemas/page-inventory.schema.json` | 产品结构输出 | 已继承 | 要求说明页面存在理由 |
| 主路径与异常 | 01、02、`qa/delivery-checklist.md` | 流程和线框评审 | 已继承 | 覆盖空、错、加载、权限 |
| 线框区块 | 02、`references/product-wireframe-playbook.md` | 线框图规格 | 已继承 | 强调信息优先级 |
| UI 视觉规则 | 03、`references/ui-design-system-guide.md` | UI 规格输出 | 已继承 | 避免只写抽象形容词 |
| 设计 token | 04、`data/schemas/page-inventory.schema.json` | 设计系统 | 已继承 | 增加语义化要求 |
| 组件状态 | 04、`qa/delivery-checklist.md` | 设计系统和验收 | 已继承 | 覆盖禁用、加载、错误等状态 |
| 前端交接 | 05、`data/schemas/delivery-contract.schema.json` | 交接说明 | 已继承 | 明确字段、事件、接口假设 |
| 原型 QA | 06、`qa/delivery-checklist.md` | 验收结论 | 已继承 | 按 P0/P1/P2 分类 |
| 可访问性量化 | `references/ui-design-system-guide.md`、`qa/delivery-checklist.md` | UI 规格与 QA 验收 | 已补强 | 增加对比度、焦点、键盘可达门槛 |
| 响应式断点验收 | `references/frontend-prototype-qa-guide.md`、`references/output-templates.md` | 原型与交接检查 | 已补强 | 增加窄屏/笔记本/宽屏检查点 |
| 交互动效基线 | `references/ui-design-system-guide.md`、`references/frontend-prototype-qa-guide.md` | 交互输出与评审 | 已补强 | 增加时序区间与反馈要求 |
| 输入分流 | `workflows/requirement-intake.md` | 新手使用 | 已增强 | 降低普通用户使用门槛 |
| 回归样例 | `qa/prompt-regression-set.md`、`tests/regression-cases.yaml` | 发布前检查 | 已增强 | 支撑后续迭代稳定性 |

## 发布解释

当某项能力同时出现在至少一个执行模块，以及至少一个可复用的参考资料、模板、案例或 QA 规则中，才视为完整继承。1.2.0 的目标是让用户通过一个中文总入口获得稳定、可评审、可交接的专家能力，继承判定以能力可调用、可验收为准，不以旧文件形态保留为准。路径调整不改变继承判定标准。


## 六个模块的差异化职责

| 模块 | 解决的问题 | 核心判断 | 主要交付 | 质量风险 |
|---|---|---|---|---|
| 01 需求到产品结构 | 做什么、给谁做、为什么做 | 页面是否服务用户任务 | 目标、页面、流程、状态、风险 | 模糊需求被当成事实 |
| 02 流程到线框图 | 页面怎么组织 | 信息优先级是否清楚 | 低保真页面规格 | 只画布局不覆盖状态 |
| 03 线框图到 UI | 视觉如何服务任务 | 字体、颜色、间距是否可执行 | UI 规格 | 抽象形容词替代规则 |
| 04 UI 到设计系统 | 规则如何复用 | token 和组件是否语义化 | 设计系统草案 | 只有数值没有用途 |
| 05 UI 到前端交接 | 如何交给前端 | 字段、事件、状态是否明确 | 交接清单 | 把评审级当生产级 |
| 06 原型 QA 评审 | 是否能进入评审 | 是否有证据支持结论 | P0/P1/P2 评审表 | 未读取文件却声称通过 |

## 继承完整性的判断

当前专家包不以“旧文件是否原样保留”为继承标准，而以“旧能力是否能被稳定调用和验收”为标准。每项核心能力都至少同时出现在执行模块、参考资料和 QA 规则中，确保用户能问、助手能做、结果能验收。文件位置变化不影响该判定，只要上述三处引用同步更新。
