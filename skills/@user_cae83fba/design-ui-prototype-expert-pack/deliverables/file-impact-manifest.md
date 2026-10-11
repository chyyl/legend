# 文件级影响清单

对比基准：`design-ui-prototype-expert-pack-1.1.3`（回滚点，未改动）
目标版本：`design-ui-prototype-expert-pack-1.2.0`
生成日期：2026-10-03

## 生成方式

本清单由脚本产出，未手工估算。执行命令：

```bash
diff -rq design-ui-prototype-expert-pack-1.1.3 design-ui-prototype-expert-pack-1.2.0
```

`diff -rq` 给出文件级差异归类，行数与 md5 由脚本按类补充：

| 统计项 | 数值 |
|---|---|
| 1.1.3 文件数 | 30 |
| 1.2.0 文件数 | 83 |
| 新增 | 61 |
| 修改 | 17 |
| 删除 | 8 |
| 内容未变 | 5 |
| 内容相同的移动 | 0 |
| 1.1.3 总行数 | 1951 |
| 1.2.0 总行数 | 10788 |
| 行数净增 | 8837 |

**关于「移动」判定为 0 的说明：** `diff -rq` 的移动识别按 basename 加 md5 相同来判定。本次 7 处路径迁移的旧文件与新位置文件的 md5 均不相同，原因是迁移同时做了内容重写，例如 references/input-triage.md 迁到 `workflows/requirement-intake.md` 时由 46 行扩为 95 行并补入门禁表与输出契约。因此脚本把它们归入「删除」与「新增」两类。7 处迁移在第 6 节单独列出，同时标注旧路径与新路径。

**关于文件数口径：** 83 含 P2 阶段新建的 `deliverables/` 三份文档，其中本清单为第 3 份。统计在清单写完后复算过一次，三份文档行数为 247、233、224，共 704 行。

## 1. 新增文件清单（61 个）

| 路径 | 行数 | 所属层级 | 影响说明 |
|---|---|---|---|
| `README.md` | 129 | P0 | 上手路径。含项目定位、12 项能力、7 条安全边界、9 个目录说明、5 条应触发与 3 条不应触发示例 |
| `source-map.md` | 102 | P0 | 能力继承矩阵、路径迁移映射、目录职责表。原 references/source-map.md 提升至根级并扩写 |
| `workflows/requirement-intake.md` | 95 | P0 | 01 段流程。含 8 字段输入契约、M1 至 M6 门禁、输入分流对照、5 项降级出口 |
| `workflows/wireframe-to-ui.md` | 93 | P1 | 02 与 03 段流程 |
| `workflows/design-system-extract.md` | 88 | P1 | 04 段流程 |
| `workflows/frontend-handoff.md` | 96 | P1 | 05 段流程。含 H1 至 H7 七道门禁与弹性文本六条表 |
| `workflows/prototype-qa.md` | 90 | P1 | 06 段流程 |
| `workflows/full-chain.md` | 105 | P1 | 六段编排。含 F1 至 F5 门禁、三档深度裁剪、跨段上下文传递表、中断恢复表 |
| `qa/delivery-checklist.md` | 107 | P0 | 交付检查清单。原 references/qa-checklist.md 迁入并扩写 |
| `qa/release-gate.md` | 97 | P0 | 12 条硬门禁与发布判定标准。原 references/gray-release-checklist.md 迁入 |
| `qa/prompt-regression-set.md` | 160 | P0 | 12 条回归用例的人读版。原 examples/regression-prompts.md 迁入并扩写 |
| `qa/scoring-workflow.md` | 80 | P1 | 七维评分操作口径，含谁评分、评几次、抽样规则、权重表 |
| `tests/regression-cases.yaml` | 196 | P0 | 12 条回归用例的机读版，含 expectedRoute、requiredOutputs、passCriteria、covers 四字段 |
| `tests/result-template.md` | 92 | P0 | 回归执行记录模板。P2 阶段回填执行信息、12 行结果、失败明细、覆盖度核对、执行结论、12 条门禁判定 |
| `data/schemas/page-inventory.schema.json` | 174 | P0 | 页面清单结构约束。强制 coveredStates 五项 allOf contains、primaryActions maxItems 1 |
| `data/schemas/delivery-contract.schema.json` | 578 | P0 | 四类交付物结构约束。含 scopeBoundary 以 const false 约束、score 恰好 7 维 |
| `scripts/check_frontmatter.py` | 285 | P0 | frontmatter 校验脚本，被 validate_pack 复用 |
| `scripts/validate_pack.py` | 806 | P0 | 包级门禁。14 类检查，FAIL 使退出码非 0 |
| `references/clarification-gate.md` | 179 | P1 | 01 段澄清门禁。含 L0 至 L3 成熟度分级、三层挖掘、伪需求 4 信号、5 类矛盾检测、MRC 六项门禁 |
| `references/error-codes.md` | 287 | P1 | E 码定义。本轮新增文件中最长的一份 |
| `references/industry-style-filter.md` | 81 | P1 | 5 行业乘 4 维度禁忌矩阵、12 个风格方向、AVOID 栏四字段输出规范 |
| `references/resilient-text.md` | 71 | P1 | T1 至 T6 六条弹性文本规则与交付前 3 步实测法 |
| `references/brand-token-index.md` | 95 | P1 | 品牌样本 raw 取用路径、5 条取用规则、74 个品牌索引 |
| `references/ux-writing-rules.md` | 92 | P1 | 界面文案规则。含按钮、错误提示四要素、空状态三段式、场景禁止与推荐对照 |
| `references/output-conventions.md` | 78 | P1 | 产物命名、落盘目录、双份输出一致性 |
| `references/structured-artifacts.md` | 93 | P1 | 结构化产物字段口径与消费方 |
| `references/pre-delivery-checklist.md` | 70 | P1 | 交付前十项检查 |
| `references/design-heuristics.md` | 89 | P1 | 可用性启发式。作可选交叉验证，不参与结论判定 |
| `references/README.md` | 63 | P1 | references 目录说明与各文件读取时机 |
| `templates/README.md` | 31 | P1 | templates 目录说明 |
| `templates/page-inventory.md` | 99 | P1 | 页面清单模板 |
| `templates/requirement-breakdown.md` | 88 | P1 | 需求拆解模板 |
| `templates/wireframe-spec.md` | 85 | P1 | 线框规格模板 |
| `templates/ui-spec.md` | 116 | P1 | UI 规格模板。含 10 节，行业反模式对照表可逐条填 |
| `templates/design-tokens.md` | 130 | P1 | 设计 token 模板 |
| `templates/design-spec.md` | 84 | P1 | 设计规范模板 |
| `templates/component-state-table.md` | 83 | P1 | 组件状态表模板 |
| `templates/frontend-handoff.md` | 106 | P1 | 前端交接模板 |
| `templates/flow-diagram.md` | 85 | P1 | 流程图模板 |
| `templates/prototype-qa-report.md` | 117 | P1 | 原型 QA 报告模板 |
| `templates/review-summary.md` | 72 | P1 | 评审摘要模板 |
| `data/brand-references.json` | 502 | P1 | 品牌参照结构化数据。本轮新增文件中行数最多 |
| `data/page-patterns.json` | 289 | P1 | 页面模式结构化数据 |
| `data/design-tokens.base.json` | 276 | P1 | 设计 token 基线。component 层全部走 token 引用，由门禁第 13 类校验 |
| `data/component-states.json` | 192 | P1 | 12 类组件 7 态定义，由门禁第 12 类校验 |
| `data/qa-scoring-rubric.json` | 147 | P1 | 七维评分权重与档位 |
| `data/regression-cases.json` | 138 | P1 | 12 条回归用例的 JSON 形态，与 yaml 版 id 与 expectedRoute 逐条一致 |
| `data/responsive-breakpoints.json` | 94 | P1 | 四档断点的容器宽度、栅格、塌陷规则与 6 项验证清单 |
| `data/README.md` | 47 | P1 | data 目录说明 |
| `docs/content-style-guide.md` | 91 | P1 | 10 条中文文案规则 |
| `assets/README.md` | 34 | P1 | 资源位预留说明，含 3 个计划资源位与引入条件 |
| `_compat/references-quick-start.md` | 6 | P0 | 旧路径跳转说明 |
| `_compat/references-faq.md` | 6 | P0 | 旧路径跳转说明 |
| `_compat/references-input-triage.md` | 6 | P0 | 旧路径跳转说明 |
| `_compat/references-qa-checklist.md` | 6 | P0 | 旧路径跳转说明 |
| `_compat/references-gray-release.md` | 6 | P0 | 旧路径跳转说明 |
| `_compat/references-source-map.md` | 6 | P0 | 旧路径跳转说明 |
| `_compat/examples-regression.md` | 6 | P0 | 旧路径跳转说明 |
| `deliverables/upgrade-report.md` | 247 | P2 | 版本变更报告 |
| `deliverables/pre-upload-audit.md` | 233 | P2 | 上传前审核报告 |
| `deliverables/file-impact-manifest.md` | 224 | P2 | 文件级影响清单。本文件 |

新增合计 61 个文件。其中 `deliverables/` 三份文档共 704 行。

## 2. 修改文件清单（17 个）

| 路径 | 行数变化 | 差值 | 所属层级 | 影响说明 |
|---|---|---|---|---|
| `SKILL.md` | 112 → 287 | +175 | P0 | 重写。frontmatter 补齐为 15 字段，正文重组为十章，含 7 条红线、三档深度、7 状态状态机、四维度自检、6 条不适用边界、8 条问答 |
| `experts/01-requirement-to-flow-expert.md` | 58 → 115 | +57 | P0 | 补输入契约表、输出契约表、量化锚点、5 条追问规则表、降级出口、5 条反模式 |
| `experts/02-flow-to-wireframe-expert.md` | 53 → 109 | +56 | P0 | 同上结构。补主操作恰好 1 个、信息架构五层、布局决策须写理由 |
| `experts/03-wireframe-to-ui-expert.md` | 72 → 114 | +42 | P0 | 补行业反模式逐条对照要求、参数缺省值段、对比度可复算锚点 |
| `experts/04-ui-to-design-system-expert.md` | 63 → 108 | +45 | P0 | 补三层 token 输出契约、语义占比 80% 锚点、前端映射覆盖率 90% 锚点、missingStates 机制 |
| `experts/05-ui-to-prototype-expert.md` | 57 → 111 | +54 | P0 | 补非生产边界 scopeBoundary、弹性文本六条、断点四档、交互时序三类覆盖锚点 |
| `experts/06-prototype-review-expert.md` | 57 → 111 | +54 | P0 | 补三输入阻断规则、需求覆盖矩阵、P0 至 P3 分级、七维评分 deductions 必填 |
| `playbooks/expert-router.md` | 58 → 116 | +58 | P0 | 补通用追问触发条件、信息缺失处理、输出契约五项、契约与工作流文件路由表、中文路由决策表 |
| `manifest.json` | 33 → 120 | +87 | P0 | 版本号、displayName、license、readme 字段，路径清单重建为 22 组 |
| `package.json` | 17 → 16 | -1 | P0 | 版本号、许可证，删除与 displayName 重复的 display_name 键 |
| `_meta.json` | 6 → 6 | 0 | P0 | 仅版本号由 1.1.3 改为 1.2.0 |
| `release-notes.md` | 70 → 183 | +113 | P0 | 新增 1.2.0 条目，含破坏性变更、路径迁移表、变更文件清单、升级提示 |
| `references/anti-patterns.md` | 31 → 59 | +28 | P1 | 补 14 条可判定反模式与 5 行业禁忌 |
| `references/product-wireframe-playbook.md` | 66 → 103 | +37 | P1 | 补信息架构五层与页面清单 gate |
| `references/ui-design-system-guide.md` | 157 → 215 | +58 | P1 | 补对比度计算方法与无障碍判定细则 |
| `examples/booking-flow-prototype.md` | 34 → 132 | +98 | P2 | 补输入七项、产品结构表、页面清单表、逐页五状态明细、响应式三档表、交互时序表、无障碍验收表、4 条选项化待确认问题 |
| `examples/admin-config-page.md` | 32 → 146 | +114 | P2 | 同上结构，另补配置项生命周期六态表与回滚机制三条 |

修改合计 17 个文件，净增 1075 行。

## 3. 删除文件清单（8 个）

| 路径 | 1.1.3 行数 | 所属层级 | 删除理由 | 替代位置 |
|---|---|---|---|---|
| references/quick-start.md | 48 | P0 | 内容并入 `README.md` 段五与段六，独立文件不再维护 | `README.md` |
| references/faq.md | 35 | P0 | 内容并入 `SKILL.md` 第九章 | `SKILL.md` 第九章 |
| references/input-triage.md | 46 | P0 | 迁至 `workflows/` 并扩写 | `workflows/requirement-intake.md` |
| references/qa-checklist.md | 77 | P0 | 迁至 `qa/` 并扩写 | `qa/delivery-checklist.md` |
| references/gray-release-checklist.md | 94 | P0 | 迁至 `qa/` 并重写为 12 条硬门禁 | `qa/release-gate.md` |
| references/source-map.md | 70 | P0 | 提升至包根并扩写 | `source-map.md` |
| examples/regression-prompts.md | 91 | P0 | 拆为人读版与机读版两份 | `qa/prompt-regression-set.md` 与 `tests/regression-cases.yaml` |
| `.DS_Store` | 二进制 | P0 | macOS 系统文件，知识资产包不应携带 | 无。门禁第 5 类会拦截 |

删除合计 8 个文件，461 行。其中 7 个为路径迁移，业务内容未丢失。

## 4. 内容未变文件清单（5 个）

| 路径 | 行数 | 说明 |
|---|---|---|
| `examples/customer-management-dashboard.md` | 131 | 三份示例之一。本次未改动。该文件 3 处标题仍含「（新增）」字样，属遗留项 |
| `references/delivery-contract.md` | 102 | 1.1.3 已有，1.2.0 未改动 |
| `references/frontend-prototype-qa-guide.md` | 90 | 同上 |
| `references/output-templates.md` | 88 | 同上。该文件与新建的 `templates/` 目录职责不同，前者讲组织方法，后者给落盘格式 |
| `references/prompt-recipes.md` | 103 | 同上 |

未变合计 5 个文件，514 行。

## 5. 层级归属统计

| 层级 | 新增 | 修改 | 删除 | 新增行数 | 修改净增 |
|---|---|---|---|---|---|
| P0 | 19 | 12 | 8 | 2863 | +750 |
| P1 | 39 | 3 | 0 | 4656 | +123 |
| P2 | 3 | 2 | 0 | 704 | +212 |
| 合计 | 61 | 17 | 8 | 8223 | +1085 |

P0 新增 19 个文件 2863 行，修改 12 个删除 8 个。P1 新增 39 个文件 4656 行，修改 3 个。P2 新增 3 个文件 704 行，修改 2 份示例净增 212 行。

修改类 17 个中，`_meta.json` 行数未变（仅版本号字符串不同），实际净增由其余 16 个文件贡献。

各层级的归属依据：

| 层级 | 新增文件范围 |
|---|---|
| P0 | 入口与契约层。README、source-map、workflows/requirement-intake、qa 三份、tests 两份、data/schemas 两份、scripts 两份、_compat 七份 |
| P1 | 内容与方法层。references 11 份、data 八份、templates 12 份、workflows 五份、qa/scoring-workflow、docs、assets |
| P2 | 交付层。deliverables 三份 |

## 6. 路径迁移对照（7 处）

脚本按 md5 相同判定移动，本次 7 处迁移的文件内容均有重写，故未计入「移动」类。此处按业务语义单独列出。

| 序号 | 1.1.3 旧路径 | 1.1.3 行数 | 1.2.0 新路径 | 1.2.0 行数 | 迁移后变化 |
|---|---|---|---|---|---|
| M1 | references/quick-start.md | 48 | `README.md` 段五、段六 | 129 | 并入新文件的上手路径节 |
| M2 | references/faq.md | 35 | `SKILL.md` 第九章 | 287 | 并入新文件的常见问题章，收录 8 条问答 |
| M3 | references/input-triage.md | 46 | `workflows/requirement-intake.md` | 95 | 迁入工作流目录，补输入契约、门禁、分流、降级四节 |
| M4 | references/qa-checklist.md | 77 | `qa/delivery-checklist.md` | 107 | 迁入 qa 目录并扩写 |
| M5 | references/gray-release-checklist.md | 94 | `qa/release-gate.md` | 97 | 迁入 qa 目录，重写为 12 条编号硬门禁 |
| M6 | examples/regression-prompts.md | 91 | `qa/prompt-regression-set.md` 与 `tests/regression-cases.yaml` | 160 与 196 | 拆为人读版与机读版 |
| M7 | references/source-map.md | 70 | `source-map.md` | 102 | 由 references 提升至包根并扩写 |

7 处迁移的过渡期措施：`_compat/` 下各留一份 6 行跳转说明，共 7 个文件 42 行，标注 v1.3.0 移除。门禁第 4 类死链检查已把 `_compat/` 排除在判定范围外，并在 `MIGRATED_PATHS` 白名单中登记 7 个旧路径。

## 7. 目录级规模对比

| 目录 | 1.1.3 文件数 | 1.2.0 文件数 | 1.1.3 行数 | 1.2.0 行数 |
|---|---|---|---|---|
| 根级 | 6 | 7 | 238 | 843 |
| `_compat/` | 0 | 7 | 0 | 42 |
| `assets/` | 0 | 1 | 0 | 34 |
| `data/` | 0 | 10 | 0 | 2437 |
| `deliverables/` | 0 | 3 | 0 | 704 |
| `docs/` | 0 | 1 | 0 | 91 |
| `examples/` | 4 | 3 | 288 | 409 |
| `experts/` | 6 | 6 | 360 | 668 |
| `playbooks/` | 1 | 1 | 58 | 116 |
| `qa/` | 0 | 4 | 0 | 444 |
| `references/` | 13 | 18 | 1007 | 1958 |
| `scripts/` | 0 | 2 | 0 | 1091 |
| `templates/` | 0 | 12 | 0 | 1096 |
| `tests/` | 0 | 2 | 0 | 288 |
| `workflows/` | 0 | 6 | 0 | 567 |
| 合计 | 30 | 83 | 1951 | 10788 |

1.1.3 根级 6 个文件为 `SKILL.md`、`manifest.json`、`package.json`、`release-notes.md`、`_meta.json` 与 `.DS_Store`。其中 `.DS_Store` 为二进制，不计入行数。

`examples/` 文件数由 4 减为 3、行数由 288 减为 409，是因 `regression-prompts.md` 迁出至 `qa/` 与 `tests/`，同时 2 份示例在 P2 阶段扩写。`references/` 文件数由 13 增至 18，是迁出 7 个、新增 11 个，另加 1 份目录说明。

## 8. 下游影响提示

| 变更类别 | 文件数 | 下游应对 |
|---|---|---|
| 路径迁移 | 7 | 按第 6 节对照表改路径，或在过渡期依赖 `_compat/` 跳转说明。1.3.0 后 `_compat/` 移除 |
| 许可证变更 | 12 处字段 | 重新确认内部合规政策是否允许 MIT-0。涉及 `SKILL.md`、`package.json`、`manifest.json` 与 6 份专家文件的 license 字段 |
| 元数据键名变更 | 1 | `display_name` 改 `displayName`，删除 `package.json` 中重复键 |
| manifest 数组语义收窄 | 1 | `references` 数组语义改为方法类参考文件。依赖该数组全量遍历的下游需改读全部数组 |
| 版本号统一 | 4 | 下游从单一来源读版本号，四处已一致为 1.2.0 |
| 门禁脚本新增 | 2 | 上架前可执行 `python3 scripts/validate_pack.py` 作为准入检查，退出码 0 为通过 |
