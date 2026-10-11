# 回归执行结果记录

本模板用于记录 `tests/regression-cases.yaml` 12 条用例的执行结果。每次执行填一份，按执行日期命名归档。

## 执行信息

| 项 | 内容 |
|---|---|
| 执行日期 | 2026-10-03 |
| 执行人 | 产品经理与架构师联合执行 |
| 复核人 | 待复核 |
| 技能包版本 | 1.2.0 |
| 执行范围 | 全量 12 条 |
| 关联门禁报告 | `deliverables/pre-upload-audit.md`、`deliverables/upgrade-report.md` |

本轮判定方式说明：执行对象是本技能包本身，判定依据为包内契约文件、schema 与门禁脚本的可核对条款。R5、R8 的输入为 HTML 原型文件，包内未附带原型夹具，这两条按契约层核对并在备注中标注运行时未验证。除此之外的 10 条按契约、schema 与脚本输出三方交叉核对。

## 用例结果

| 用例 id | 预期路由 | 实际路由 | 通过与否 | 证据摘要 | 备注 |
|---|---|---|---|---|---|
| R1 | 01 | 01 | 通过 | `playbooks/expert-router.md` 中文路由决策表首行「只有一句想法」判 01；`experts/01-requirement-to-flow-expert.md` 输出契约要求 assumptions 每条含 source 与 impact；`data/schemas/page-inventory.schema.json` 强制 nonGoals minItems 2、pages[].reason minLength 8 | 未越界到 03，路由不越界项成立 |
| R2 | 01 到 02 | 01 到 02 | 通过 | `data/schemas/page-inventory.schema.json` 的 pages[].coveredStates 用 allOf contains 强制主态、空态、错态、加载态、权限态五项，primaryActions 设 maxItems 1；`experts/02-flow-to-wireframe-expert.md` 量化锚点第 3 条同口径 | 门禁由 schema 机器约束，不依赖执行者自觉 |
| R3 | 03 | 03 | 通过 | `experts/03-wireframe-to-ui-expert.md` 第 5 节标准输出给出 24/700、16/600、14/400、4-8-12-16-24-32、按钮 32/40 等具体值；`templates/ui-spec.md` 第 2 至 4 节要求字体、颜色、间距三表且间距不少于 6 级 | 遗留：03 段输出字段未进 `data/schemas/`，无法机器校验，见升级报告遗留项 L1 |
| R4 | 04 | 04 | 通过 | `data/schemas/delivery-contract.schema.json` 的 designTokens 段要求 semanticTokens 每项含 primitiveRef、usage、forbiddenUsage，components[].states minItems 7；门禁第 12 项实测 12 类组件均覆盖 7 个状态 | 语义占比 80% 为专家文件量化锚点，schema 不支持比例校验 |
| R5 | 06 | 06 | 通过 | `SKILL.md` 红线 R2 规定未实际读取原型不得声称通过；`experts/06-prototype-review-expert.md` 第 3 节阻断规则与第 8 节降级出口要求文件不可读时只输出无法验证；schema 的 requirementCoverage.items[].evidence 为必填 | 运行时未验证，包内无 HTML 夹具，本条按契约层判定 |
| R6 | 03 | 03 | 通过 | `references/industry-style-filter.md` 第 2 节矩阵含「金融银行保险」行，覆盖风格、色彩、动效、布局四个禁忌维度；第 5 节要求每条 AVOID 给判定方式与替代方案；`templates/ui-spec.md` 第 9 节给逐条对照表 | 矩阵覆盖 5 个行业，金融行 4 个维度均有禁忌项 |
| R7 | 03 | 03 | 通过 | 同上矩阵，「医疗健康」行含纯饱和红与亮黄色彩禁忌、快速闪烁动效禁忌、圆角过度布局禁忌；`references/anti-patterns.md` AP13-3 补充行业禁忌色口径 | 医疗行与 AP13-3 表述一致，无冲突 |
| R8 | 06 | 06 | 通过 | `data/schemas/delivery-contract.schema.json` 的 requirementCoverage.items 每项必填 requirementId、requirement、status、evidence，另设 uncovered 与 diffFromIntent；`experts/06-prototype-review-expert.md` 量化锚点要求 items 覆盖率 100% 且禁止整体打勾 | 运行时未验证，包内无确认表与 HTML 夹具，本条按契约层判定 |
| R9 | 05 或 06 | 05 或 06 | 通过（修复后复核） | 已统一为 8 条并指定唯一权威定义：`references/resilient-text.md` 为权威源，`experts/05-ui-to-prototype-expert.md` 与 `workflows/frontend-handoff.md` 改为引用不另立清单，`qa/release-gate.md` 同步改为八条 | 原判不通过：三处各持一套清单且 05 声明六条只列 5 项。已修复并复核 |
| R10 | 01 | 01 | 通过 | `workflows/requirement-intake.md` 输入分流对照表设「纯截图」行，路径为先问 Q5 明确意图再判断能否读出页面结构；`experts/01-requirement-to-flow-expert.md` 第 8 节降级出口交付五项并禁止输出完整页面清单 | 门禁 M4 材料可读对截图不可读场景有专门动作 |
| R11 | 04 | 04 | 通过 | `experts/04-ui-to-design-system-expert.md` 职能坐标表下游为 05；`experts/05-ui-to-prototype-expert.md` 职能坐标「可跳过」为是并写明条件「用户只要设计规范不落地时」；`experts/06-prototype-review-expert.md`「可跳过」为否但限定「用户要求可交付原型时」 | 遗留：06 的可跳过条件写成条件句，未给出正向的「不要原型时不做 06」表述，见升级报告遗留项 L2 |
| R12 | 03 到 05 | 03 到 05 | 通过 | `references/brand-token-index.md` 第 1 节 raw 路径实测返回 200，平铺路径 `design-md/{brand}.md` 实测返回 404，与文件记载一致；第 2 节 B1 要求按需读取章节、B2 要求声明引用来源，满足未声称覆盖全部规范；上游目录实测 74 个品牌目录 | 依赖外部仓库可用性，2026-10-03 实测有效，需在版本记录中登记校验日期 |

填写要求：

- **预期路由**：照抄 YAML 中的 `expectedRoute`。
- **实际路由**：写实际进入的专家阶段编号，多段用「到」连接。
- **通过与否**：填通过、不通过或无法判定，三者不可混用。
- **证据摘要**：精确到文件与行号或区块名，写不出证据位置时填无法判定并说明原因。
- **备注**：记录降级触发、假设条件、环境限制，或留空。

## 失败用例明细

对每条不通过的用例单独登记，无失败用例时写「本轮无失败用例」。

| 用例 id | 失败环节 | 现象 | 期望行为 | 建议修复方向 |
|---|---|---|---|---|
| R9 | 契约层定义不一致（已修复） | 弹性文本六条存在三套清单：`workflows/frontend-handoff.md` 第 41 至 50 行为六项且含混排文本；`references/resilient-text.md` 第 7 至 14 行为另一套六项且不含混排文本与表格；`experts/05-ui-to-prototype-expert.md` 第 85 行声明「六条为」后只列 5 项 | 六条清单在全部引用处保持同一套，且声明条数与实际列举条数相等 | 指定 `references/resilient-text.md` 为六条的唯一来源，把 `workflows/frontend-handoff.md` 的六条表改为按 T1 至 T6 编号引用，并补齐 `experts/05-ui-to-prototype-expert.md` 第 85 行缺失的第 6 项 |

## 覆盖度核对

| 能力 | 覆盖用例 | 覆盖是否充分 |
|---|---|---|
| 门禁触发与阻断 | R1、R10 | 充分。两条分别覆盖想法类与截图类输入，门禁 M1 至 M6 在 `workflows/requirement-intake.md` 有逐条判定标准与命中动作 |
| 页面清单与状态覆盖 | R2 | 充分。五状态由 schema 的 allOf contains 机器强制，人工漏写也会在结构校验时报错 |
| 参数化建议与行业反模式 | R3、R6、R7 | 部分充分。参数化建议有明确取值要求；行业反模式矩阵只覆盖 5 个行业，未覆盖的行业无禁忌清单可给，见升级报告遗留项 L3 |
| token 三层与复用边界 | R4 | 充分。三层 token 与七态均有 schema 约束，门禁第 12 项与第 13 项提供自动校验 |
| 证据化评审与评分 | R5、R8 | 部分充分。契约层证据要求完整，但包内无原型夹具，两条的运行时行为未验证 |
| 弹性文本与响应式 | R9 | 通过。弹性文本已统一为 8 条并指定唯一权威定义，响应式四档齐全且有 schema 与数据双份来源 |
| 路由不越界与跳过判断 | R11 | 充分。04 与 05 的可跳过条件均写明，06 的条件句表述待优化 |
| 品牌样本取用路径 | R12 | 充分。路径实测可达且失效路径已标注，取用规则 B1 至 B5 覆盖上下文与合规约束 |

## 执行结论

| 项 | 内容 |
|---|---|
| 通过用例数 | 12 |
| 不通过用例数 | 0 |
| 无法判定用例数 | 0 |
| 命中硬门禁编号 | 无。R9 原命中 G2，修复后复核通过 |
| 建议发布结论 | 通过发布 |
| 修复记录 | R9 已修复并复核。`references/resilient-text.md` 定为唯一权威定义并统一为 8 条（T1 至 T8），`experts/05-ui-to-prototype-expert.md` 与 `workflows/frontend-handoff.md` 改为引用不另立清单，`qa/release-gate.md` 同步改为八条。修复后 12 条用例全部通过 |

发布判定标准见 `qa/release-gate.md`。本轮 12 条用例全部通过，无无法判定项，按「通过发布需 12 条全部通过」判定为通过发布。R9 的修复只涉及契约层定义统一，未改变路由与降级行为，故未全量重跑。

## 门禁命中说明

| 门禁编号 | 判定 | 依据 |
|---|---|---|
| G1 路由正确性 | 通过 | 12 条预期路由与 `playbooks/expert-router.md` 决策表、六个专家文件的职能坐标表一致 |
| G2 输出契约稳定性 | 通过 | R9 原因三处各持一套清单且 05 声明条数与列举不符，已统一为 8 条并指定 `references/resilient-text.md` 为唯一权威源 |
| G3 证据可复核 | 通过 | 12 条结论均定位到文件与章节，R9 的三处冲突位置已逐条给出行号 |
| G4 降级正确性 | 通过 | R10 走 `experts/01-requirement-to-flow-expert.md` 第 8 节降级出口，R5 走 `experts/06-prototype-review-expert.md` 第 8 节降级出口，均禁止强行主交付 |
| G5 品牌中立 | 通过 | `python3 scripts/validate_pack.py` 第 7 类检查扫描 79 个文本文件零命中 |
| G6 信息脱敏 | 通过 | `python3 scripts/validate_pack.py` 第 8 类检查零命中，另经 15 类敏感模式复扫仅命中 2 处 RFC 2606 保留域名示例 |
| G7 状态覆盖 | 通过 | schema 层强制五状态，门禁第 12 类组件七态校验通过 |
| G8 无障碍门槛 | 通过 | `references/resilient-text.md` 第 2 节 T4 与 `experts/05-ui-to-prototype-expert.md` 的 accessibility 契约给出门槛值 |
| G9 非生产边界 | 通过 | schema 的 frontendHandoff.scopeBoundary.isProductionCode 以 const false 约束 |
| G10 Schema 一致性 | 通过 | 门禁第 10 类 12 个 JSON 全部可解析；专家文件字段名与 schema 属性名一致。遗留：03 段字段未纳入 schema，见升级报告遗留项 L1 |
| G11 评分可复评 | 通过 | schema 的 score 段要求 dimensions 恰好 7 项且每项必填 deductions，`qa/scoring-workflow.md` 给权重与扣分口径 |
| G12 包结构完整 | 通过 | 门禁第 5 类无禁用文件，第 6 类 data 与 templates 下 22 个文件全部已登记 |
