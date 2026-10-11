# 1.2.0 升级报告

## 版本信息

| 项 | 内容 |
|---|---|
| 包名 | design-ui-prototype-expert-pack |
| 变更前版本 | 1.1.3 |
| 变更后版本 | 1.2.0 |
| 升级日期 | 2026-10-03 |
| 升级类型 | 破坏性变更（许可证）+ 目录分层重构 + 契约层新建 + 内容富化 + 交付文档补齐 |
| 回滚点 | 1.1.3 目录原样保留，未做任何改动 |
| 门禁结论 | 14 项检查，0 项 FAIL，1 项 WARN（排版建议） |

## 变更摘要

### P0 层：元数据与契约基础

| 编号 | 变更 | 影响 |
|---|---|---|
| P0-1 | 版本号四处统一为 1.2.0 | `SKILL.md`、`manifest.json`、`package.json` 原为 1.1.1，`_meta.json` 为 1.1.3，四处不一致导致包管理器识别到的版本不可信 |
| P0-2 | frontmatter 从 4 字段补齐为 15 字段 | 补入 license、author、tags、triggerKeywords、category 等可检索与合规字段 |
| P0-3 | `display_name` 改为驼峰 `displayName` | 平台解析约定为驼峰，下划线写法可能导致展示名回退到包名 |
| P0-4 | `SKILL.md` 重构为十章 | 由 113 行线性清单扩为 287 行十章结构，判断与路由留在入口，方法细节下沉到 references 与 experts |
| P0-5 | 新建 `data/schemas/` 两份 JSON Schema | 页面清单与交付契约从纯文本约束变为机器可校验约束 |
| P0-6 | 新建 `scripts/validate_pack.py` 与 `scripts/check_frontmatter.py` | 包级门禁从人工检查变为脚本可重复执行 |
| P0-7 | 目录分层：入口上提，能力下沉 | 入口类文档移到根级或专属目录，能力类文件留在 `references/` |

### P1 层：内容富化与结构化数据

| 编号 | 变更 | 影响 |
|---|---|---|
| P1-1 | `references/` 新增 11 份文件 | 澄清门禁、行业反模式过滤、弹性文本、品牌 token 索引、错误码、结构化产物、口径与输出约定、文案规则等 |
| P1-2 | `experts/` 6 份文件深度补强 | 合计由约 360 行增至 668 行，每份补入输入契约表、输出契约表、量化锚点、追问规则表、降级出口、反模式清单 |
| P1-3 | 新建 `data/` 8 份结构化数据 | 品牌参照、组件状态、设计 token 基线、页面模式、评分标准、回归用例、响应式断点 |
| P1-4 | 新建 `templates/` 12 份产物模板 | 四类交付物的落盘格式固定，含示例数据行与落盘前删除提示 |
| P1-5 | 新建 `workflows/` 6 份流程文件 | 每段流程的门禁、执行步骤、输出契约与追问规则独立成文 |
| P1-6 | 新建 `qa/` 4 份质量文件 | 交付检查清单、发布门禁、评分流程、回归用例集 |
| P1-7 | `references/ui-design-system-guide.md` 扩写 | 由 157 行增至 215 行，补入对比度计算方法与无障碍判定细则 |
| P1-8 | `references/anti-patterns.md` 扩写 | 由 31 行增至 59 行，给出 14 条可判定反模式与 5 行业禁忌 |
| P1-9 | 新建 `docs/content-style-guide.md` | 10 条中文文案规则，含破折号、对比句式、拟人化、术语一致等纪律 |

### P2 层：示例补全、回归执行、交付文档

| 编号 | 变更 | 影响 |
|---|---|---|
| P2-1 | `examples/booking-flow-prototype.md` 由 34 行扩为 132 行 | 补入产品结构表、页面清单表、逐页五状态明细、响应式三档表、交互时序表、无障碍验收表、待确认问题表。原「（新增）」标题标记一并去除 |
| P2-2 | `examples/admin-config-page.md` 由 32 行扩为 146 行 | 同上结构，另补配置项生命周期六态表与回滚机制三条、权限边界按角色区分 |
| P2-3 | 执行 12 条回归用例并回填 | `tests/result-template.md` 填执行信息、12 行结果、失败明细、覆盖度核对、执行结论、12 条硬门禁逐条判定；`qa/prompt-regression-set.md` 结论表 12 行填齐 |
| P2-4 | 新建 `deliverables/` 三份文档 | 本报告、上传前审核报告、文件级影响清单 |

## 破坏性变更清单

### D1 许可证变更

| 项 | 内容 |
|---|---|
| 变更前 | `Proprietary or as specified by the publisher` |
| 变更后 | `MIT-0` |
| 影响面 | 全部下游使用者。原先的专有声明被移除，使用者可依据 MIT-0 条款使用、修改与再分发本包 |
| 下游应对 | 使用方需重新确认内部合规政策是否允许 MIT-0。若组织政策要求保留专有许可，需回退此项变更并同步 `SKILL.md`、`package.json`、`manifest.json`、6 份专家文件的 license 字段 |
| 涉及文件 | `SKILL.md`、`package.json`、`manifest.json`、`experts/` 全部 6 份 |

### D2 七处文件路径迁移

| 旧路径（1.1.3） | 新路径（1.2.0） | 下游应对 |
|---|---|---|
| references/quick-start.md | `README.md` 段五、段六 | 按文档类型分流，上手路径读 README，常见问题读 SKILL.md 第九章 |
| references/faq.md | `SKILL.md` 第九章 | 改为按章节定位，不再有独立文件 |
| references/input-triage.md | `workflows/requirement-intake.md` | 路径改为工作流目录 |
| references/qa-checklist.md | `qa/delivery-checklist.md` | 路径改为 qa 目录 |
| references/gray-release-checklist.md | `qa/release-gate.md` | 路径改为 qa 目录 |
| examples/regression-prompts.md | `qa/prompt-regression-set.md` 与 `tests/regression-cases.yaml` | 拆为两份：人读版与机读版分离 |
| references/source-map.md | `source-map.md`（根级） | 由 references 提升到包根 |

过渡期措施：7 处旧路径在 `_compat/` 各保留一份跳转说明，共 7 个文件 42 行，每份 6 行，标注 v1.3.0 移除。门禁第 4 类死链检查已把 `_compat/` 排除在判定范围外。

### D3 元数据键名变更

| 项 | 内容 |
|---|---|
| 变更前 | frontmatter 中 `display_name`，`package.json` 中同时存在 `displayName` 与 `display_name` 两个键 |
| 变更后 | 统一为 `displayName`，删除 `package.json` 中重复的 `display_name` 键 |
| 影响面 | 读取 `display_name` 的下游脚本或界面 |
| 下游应对 | 改为读 `displayName` |

### D4 manifest 数组语义收窄

| 项 | 内容 |
|---|---|
| 变更前 | `references` 数组包含入口文档与 QA 规则 |
| 变更后 | `references` 数组语义收窄为方法类参考文件，入口文档与 QA 规则移入新增的 `workflows`、`qa`、`schemas`、`meta`、`compat` 数组 |
| 影响面 | 依赖 `manifest.references` 做全量遍历的下游 |
| 下游应对 | 改为遍历 `manifest` 全部数组，或显式合并 `references`、`workflows`、`qa`、`schemas`、`meta`、`compat` 六组 |

## 架构变更前后对照

### 目录树

| 1.1.3 | 1.2.0 |
|---|---|
| 无 | `workflows/`（6 份流程） |
| 无 | `qa/`（4 份质量） |
| 无 | `tests/`（2 份回归） |
| 无 | `data/`（10 份含 2 份 schema） |
| 无 | `templates/`（12 份模板） |
| 无 | `scripts/`（2 个校验脚本） |
| 无 | `docs/`（1 份文案规则） |
| 无 | `assets/`（1 份资源位说明） |
| 无 | `_compat/`（7 份跳转说明） |
| `playbooks/`（1 份） | `playbooks/`（1 份，由 58 行扩为 116 行） |
| `examples/`（3 份） | `examples/`（3 份，其中 2 份由 P2 扩写） |
| `experts/`（6 份） | `experts/`（6 份，由约 360 行增至 668 行） |
| `references/`（13 份） | `references/`（18 份，含 1 份目录说明） |
| 根级 4 份 | 根级 7 份（新增 README、source-map、release-notes） |

### 规模对比

| 指标 | 1.1.3 | 1.2.0 | 变化 |
|---|---|---|---|
| 文件总数 | 30 | 83 | 增加 53 |
| 总行数 | 1951 | 10788 | 增加 8837，约为原 5.5 倍 |
| 顶层目录数 | 4 | 14 | 增加 10 |
| 专家文件行数 | 360 | 668 | 增加 308 |
| references 文件数 | 13 | 18 | 增加 5 |
| 机器可校验约束 | 无 | 2 份 schema 加 2 个脚本 | 从 0 到 4 |

文件总数与总行数含 P2 阶段新建的 `deliverables/` 三份文档共 704 行。文件级明细见 `deliverables/file-impact-manifest.md`。

### 规模对比的构成拆解

| 层级 | 新增文件数 | 新增行数 | 主要内容 |
|---|---|---|---|
| P0 | 19 | 2863 | README 129、source-map 102、workflows/requirement-intake 95、qa 三份 364、tests 两份 288、data/schemas 两份 752、scripts 两份 1091、_compat 七份 42 |
| P1 | 39 | 4656 | references 11 份 1198、data 八份 1685、templates 12 份 1096、workflows 五份 472、qa/scoring-workflow 80、docs 91、assets 34 |
| P2 | 3 | 704 | deliverables 三份文档，另 2 份示例扩写 212 行计入修改类 |

三层新增合计 61 个文件 8223 行。另有 17 个文件修改，净增 1075 行。分层归属明细见 `deliverables/file-impact-manifest.md` 第 5 节。

## 新增能力清单

按六段链路说明 1.2.0 相对 1.1.3 的能力增量。

### 段 1 需求到产品结构

| 项 | 1.1.3 | 1.2.0 |
|---|---|---|
| 输入门禁 | 概念性描述 | 9 字段输入契约表 + M1 至 M6 门禁 + E 码阻断 |
| 追问 | 未定义轮数 | L0 至 L3 成熟度分级，按级别定追问轮数与深度 |
| 矛盾检测 | 无 | 5 类矛盾检测，含用户群体、目标、边界、优先级、端 |
| 输出校验 | 无 | `data/schemas/page-inventory.schema.json` 强制非目标不少于 2 条、存在理由不少于 8 字、主路径不少于 2 步 |
| 假设标注 | 口头要求 | schema 强制每条假设含 statement、source、impact 三字段 |

### 段 2 流程到线框图

| 项 | 1.1.3 | 1.2.0 |
|---|---|---|
| 状态覆盖 | 提到五状态 | schema 用 allOf contains 强制主态、空态、错态、加载态、权限态五项同时存在 |
| 主操作 | 建议恰好一个 | schema 设 maxItems 1，机器强制 |
| 布局决策 | 无 | 每项决策须写选型理由，无理由计为未完成 |
| 信息架构 | 无 | 五层齐备要求：入口层、导航层、内容层、操作层、反馈层 |

### 段 3 线框到 UI 规格

| 项 | 1.1.3 | 1.2.0 |
|---|---|---|
| 参数化 | 要求给数值 | 量化锚点明确：字体不少于 5 级、间距 token 不少于 6 个、对比度每项给比值与阈值 |
| 行业适配 | 无 | 新增 `references/industry-style-filter.md`，5 行业乘 4 维度禁忌矩阵，12 个风格方向，AVOID 栏四字段输出规范 |
| 可读性 | 原则性描述 | 对比度 4.5:1 与 3:1 双门槛，聚焦态须有可见轮廓，触控不小于 44 乘 44 |
| 产物模板 | 无 | 新增 `templates/ui-spec.md` 等 4 份模板，含示例数据行与落盘前删除提示 |

### 段 4 UI 到设计系统

| 项 | 1.1.3 | 1.2.0 |
|---|---|---|
| token 分层 | 提到底层与语义 | schema 强制三层：primitiveTokens、semanticTokens、componentTokens，语义项必填 usage 与 forbiddenUsage |
| 组件状态 | 提默认与悬停 | schema 强制 states 不少于 7 态，缺项须在 missingStates 登记；`data/component-states.json` 12 类组件均覆盖 7 态由门禁校验 |
| 复用边界 | 无 | nonReusable 必填 item 与 reason，reason 不少于 4 字 |
| 字面量检查 | 无 | 门禁第 13 类检查 component 层无裸色值字面量，当前 6 个组件全部走 token 引用 |

### 段 5 UI 到前端交接

| 项 | 1.1.3 | 1.2.0 |
|---|---|---|
| 弹性文本 | 无 | schema 强制 elasticText 不少于 6 条，每条含 rule 与 approach，approach 不少于 4 字 |
| 响应式 | 提到断点 | schema 强制 breakpoints 不少于 4 档，档位名限定为窄屏、移动端、笔记本、桌面宽屏；`data/responsive-breakpoints.json` 给容器宽度、栅格、塌陷规则 |
| 非生产边界 | 文字声明 | schema 以 const false 约束 scopeBoundary.isProductionCode，excluded 不少于 1 项 |
| 接口假设 | 无 | apiAssumptions 每项含 confirmed，无上下文时全部为 false |

### 段 6 原型 QA 评审

| 项 | 1.1.3 | 1.2.0 |
|---|---|---|
| 结论 | 提到三选一 | schema 以枚举约束 verdict，未读取文件时禁止给通过类结论 |
| 问题分级 | P0 至 P2 | P0 至 P3 四级，每项必填 evidence 与 severity |
| 需求覆盖 | 无 | schema 强制 items 每条含 requirementId、requirement、status、evidence，未覆盖项入 uncovered |
| 评分 | 100 分制概念 | schema 强制 dimensions 恰好 7 项，权重枚举为 20、15、20、15、10、10、10，每项必填 deductions |

### 跨段能力

| 项 | 1.2.0 新增 |
|---|---|
| 包级门禁 | `scripts/validate_pack.py` 14 类检查，覆盖版本一致性、frontmatter、结构、死链、禁用文件、孤儿资产、品牌中立、脱敏、关键词、JSON 可解析、回归填写、组件状态、字面量 |
| 回归用例 | 12 条机器可读用例，覆盖 8 类输入与 8 类能力，人读版与机读版分离 |
| 响应式验证 | 6 个视口宽度加 100% 与 200% 两档字号，含触控尺寸、无横向滚动、弹性布局四类检查 |
| 内容纪律 | `docs/content-style-guide.md` 10 条规则，涵盖破折号、对比句式、拟人化、语气词、结构、术语、数字单位、错误提示四要素、空状态三段式 |

## 门禁校验结果

`python3 scripts/validate_pack.py` 执行输出，退出码 0。

| 序号 | 检查项 | 结果 | 实测详情 |
|---|---|---|---|
| 1 | 版本号四处一致 | PASS | 四处一致，均为 1.2.0 |
| 2 | frontmatter 完整 | PASS | 7 个文件全部完整（SKILL.md 与 6 份专家文件） |
| 3 | Markdown 结构无断裂 | PASS | 全部二级标题前置空行正常 |
| 3b | Markdown 标题后留空行 | WARN | 1 处，见 `playbooks/expert-router.md:4`。排版建议，不阻塞 |
| 4 | 无死链（跳过 _compat/） | PASS | 无死链 |
| 5 | 无禁用文件 | PASS | 无禁用文件 |
| 6 | 无孤儿资产 | PASS | data 与 templates 下 22 个文件全部已登记 |
| 7 | 品牌中立 | PASS | 扫描 79 个文本文件，无平台品牌残留 |
| 8 | 信息脱敏 | PASS | 无本机路径与用户名 |
| 9 | triggerKeywords 不少于 10 个 | PASS | 20 个，下限 10 |
| 10 | 结构化 JSON 全部可解析 | PASS | 12 个 JSON 全部可解析 |
| 11 | 回归结论表已填写 | PASS | 回归结论表已完整填写（P2 回填后由 WARN 转为 PASS） |
| 12 | 组件状态完整性 | PASS | 12 类组件均覆盖 7 个状态 |
| 13 | component 层无色值字面量 | PASS | component 层 6 个组件全部走 token 引用 |
| 合计 | 14 项 | 0 FAIL | 13 PASS，1 WARN |

## 已知限制与遗留项

| 编号 | 遗留项 | 具体描述 | 影响 | 建议处理 |
|---|---|---|---|---|
| L1 | 03 段输出字段未纳入 schema | `experts/03-wireframe-to-ui-expert.md` 定义的 fontScale、spacingTokens、colorSemantics、contrastChecks、stateFeedback、motionSpec、touchTarget 七个字段在 `data/schemas/delivery-contract.schema.json` 中均无对应定义，实测出现次数为 0 | 03 段产物无法机器校验，回归用例 R3 的通过判定只能靠人工核对 | 下一版本补 `uiSpec` 段 schema 定义 |
| L2 | 06 段可跳过条件表述为条件句 | `experts/06-prototype-review-expert.md` 职能坐标表的「可跳过」写为「否。用户要求可交付原型时本段必须执行」，属条件句，未给出正向的「用户不要原型时不做 06」表述 | 依赖该表判断能否跳过的下游需自行推断 | 改为「是。用户明确不要求原型交付时跳过，并说明跳过理由」 |
| L3 | 行业反模式矩阵只覆盖 5 个行业 | `references/industry-style-filter.md` 第 2 节矩阵含金融银行保险、医疗健康、企业级 SaaS、政务公共服务、电商消费品 5 行 | 矩阵外的行业输入无禁忌清单可给，03 段只能声明不适用 | 下一版本按行业扩行，或补一条兜底规则 |
| L4 | 回归用例无原型夹具 | R5 与 R8 的输入为 HTML 原型与需求确认表，包内未附带任何 HTML 文件，实测 `find` 结果为空 | 两条用例的运行时行为无法验证，本轮按契约层判定并已在 `tests/result-template.md` 备注 | 下一版本补一份最小原型夹具与一份确认表样例 |
| L5 | 弹性文本六条定义冲突 | 见 `tests/result-template.md` 的 R9 失败明细。三处定义互不相同，`experts/05-ui-to-prototype-expert.md:85` 声明六条但只列 5 项 | 本轮回归唯一不通过项，命中硬门禁 G2，发布结论为暂缓发布 | 指定 `references/resilient-text.md` 为唯一来源，另两处改为编号引用并补齐缺失项 |
| L6 | 语义 token 占比无法机器校验 | `experts/04-ui-to-design-system-expert.md` 要求语义 token 占比不低于 80%，schema 不支持比例校验 | 该指标只能人工核对 | 下一版本补一条门禁检查 |
| L7 | 外部品牌样本依赖 | `references/brand-token-index.md` 依赖外部仓库的 raw 路径。2026-10-03 实测该路径返回 200，平铺路径返回 404，与文件记载一致 | 上游仓库结构变化时取用路径会失效 | 保留文件内的失效路径记录，每季度复测一次并更新校验日期 |
| L8 | `assets/` 为空目录 | 仅含 1 份资源位说明，无实际资源 | 无功能影响。若上架平台要求目录非空需确认处理方式 | 保持现状，`assets/README.md` 已写明保留原因 |

## 发布建议

按 `qa/release-gate.md` 的判定标准，「通过发布」需 12 条用例全部通过且 12 条硬门禁无一命中。本轮 12 条中 R9 不通过，命中 G2，**当前结论为暂缓发布**。

L5 的修复范围为两处共约 10 行，不触及 `references/` 与 `experts/` 的其他内容。修复后重跑 R9 单条用例即可复核，无需全量重跑。L1 至 L4、L6 至 L8 不阻塞发布，建议在下一版本一并处理。
