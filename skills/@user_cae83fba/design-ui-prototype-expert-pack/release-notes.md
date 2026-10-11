# Release Notes

## Version 1.2.0

发布日期：2026-10-03  
发布类型：破坏性变更（许可证）+ 元数据一致性修复 + 入口文档重构 + 新增 README

### 本版本目标

让包的元数据、入口结构与对外说明达到可发布状态：版本号单一来源、入口文档结构完整、上架前有 README 可读、能力边界对外可见。

### 破坏性变更（需确认）

**许可证从 `Proprietary or as specified by the publisher` 改为 `MIT-0`。**

- 影响：原「专有」声明被移除，使用者可依据 MIT-0 条款使用、修改与再分发本包。
- 需要下游使用者知悉并重新确认合规要求。若组织政策不允许 MIT-0，需回退此项变更。

### 版本号四处统一为 1.2.0

修复前包内存在四个版本号：`SKILL.md`、`manifest.json`、`package.json` 为 `1.1.1`，`_meta.json` 为 `1.1.3`。现已全部统一：

| 文件 | 变更前 | 变更后 |
|---|---|---|
| `SKILL.md` | 1.1.1 | 1.2.0 |
| `manifest.json` | 1.1.1 | 1.2.0 |
| `package.json` | 1.1.1 | 1.2.0 |
| `_meta.json` | 1.1.3 | 1.2.0 |
| `references/source-map.md` 正文 | `v3.3.1` | `1.2.0` |

### frontmatter 补齐为 15 字段

原 frontmatter 仅有 4 个字段（`name`、`display_name`、`description`、`version`），缺license、author、tags 等可检索与合规字段。现补齐为：`name`、`displayName`、`slug`、`version`、`emoji`、`description`、`author`、`license`、`category`、`subcategory`、`tags`、`triggerKeywords`、`modes`、`compatibility`、`entry`。

同时修正：`display_name` 改为驼峰 `displayName`；`package.json` 中与 `displayName` 重复的 `display_name` 键已删除。

### Markdown 结构修复

- 修复第 94 行之后的列表与标题断裂（缺空行导致标题被并入列表项渲染）。
- 合并 `## 参考资料` 与 `## 专家能力资产` 两节为单一 `## 参考资料`，去除 `qa-checklist.md` 与 `source-map.md` 的重复列出。
- 原 `## 能力补强说明` 的 3 条内容并入参考文件索引。
- `## 中文专家包定位` 上移至正文末尾，与工作原则同层。

### SKILL.md 扩为十章

原入口文档为线性清单（113 行）。现按「判断与路由在上、方法细节下沉」的原则重组为十章，273 行：

| 章 | 标题 |
|---|---|
| 零 | 不可突破的红线（7 条编号规则 R1 至 R7） |
| 一 | 核心能力速查（能力表含专家模块与产物对应） |
| 二 | 标准工作流程（三档深度、阶段动作、工作原则、提问方式） |
| 三 | 任务状态机（7 状态、流转规则、恢复规则） |
| 四 | 数据合规与安全 |
| 五 | 性能与容量 |
| 六 | 交付形态（五种形态与落盘约定） |
| 七 | 交付前自检（四维度 12 项） |
| 八 | 何时不用本技能（6 条边界表） |
| 九 | 常见问题（8 条问答） |
| 十 | 参考文件索引（四组按需读取） |

原有有效内容全部保留并归入新章：标准交付物 9 条、工作原则 9 条、什么时候使用 6 条、不适用范围 4 条、用户如何提问、补问 3 类信息、专家路由 6 个模块。

### 新增 README.md

新增 122 行 README，含六段：项目定位、主要能力 12 项、安全边界 7 条、目录说明（含关键文件对照）、使用示例（应触发 5 例、不应触发 3 例）、补充说明（版本记录、写作方式、合规声明）。

### 目录重构与路径迁移

入口类文档从 `references/` 提升到根级或专属目录，能力内容文件保留在 `references/`：

| 1.1.x 路径 | 1.2.0 路径 |
|---|---|
| `references/quick-start.md` | `README.md` 段五、段六 |
| `references/faq.md` | `SKILL.md` 第九章 |
| `references/input-triage.md` | `workflows/requirement-intake.md` |
| `references/qa-checklist.md` | `qa/delivery-checklist.md` |
| `references/gray-release-checklist.md` | `qa/release-gate.md` |
| `examples/regression-prompts.md` | `qa/prompt-regression-set.md` 与 `tests/regression-cases.yaml` |
| `references/source-map.md` | `source-map.md`（根级） |

新增目录：`workflows/`、`qa/`、`tests/`、`data/schemas/`、`_compat/`。旧路径在 `_compat/` 保留跳转说明，1.3.0 移除。

`source-map.md` 新增三节：路径迁移映射、目录职责说明（含边界列）、更新后的能力点级继承矩阵，表中引用全部改为实际路径。

### 入口文档同步更新

- `SKILL.md` 第十章索引全部改为新路径；第五章性能表按实际行数更新，并新增「机器可读产物」行。
- `README.md` 目录说明改为 9 个目录，关键文件表补入 `source-map.md`、`workflows/`、`qa/`、`data/schemas/`、`_compat/`。
- `manifest.json` 补齐 `readme`、`license` 字段与 `workflows`、`qa`、`schemas`、`meta`、`compat` 五组路径清单。

### 变更文件清单

| 文件 | 变更类型 |
|---|---|
| `SKILL.md` | 重写（frontmatter 补齐 + 十章正文 + 路径同步） |
| `README.md` | 新增（目录说明含新目录） |
| `source-map.md` | 版本号、迁移映射、目录职责、继承矩阵路径更新 |
| `release-notes.md` | 新增 1.2.0 条目 |
| `manifest.json` | 版本号、`displayName`、路径清单重建 |
| `package.json` | 版本号、许可证、删除重复键 |
| `_meta.json` | 版本号 |
| `qa/*.md` | 由 `references/` 迁入，含交付检查与发布门禁 |
| `workflows/requirement-intake.md` | 由 `references/input-triage.md` 迁入 |
| `data/schemas/*.json` | 新增交付契约与页面清单结构约束 |
| `experts/*.md` | 深度补强，行数由约 380 增至约 660 |
| `_compat/*.md` | 新增旧路径跳转说明 |

### 升级提示

- 使用旧版入口文档的下游流程需改为读取十章结构，原「参考资料」章节已并入第十章。
- 引用 `references/` 下 7 个已迁出文件的下游需改用新路径，或在过渡期依赖 `_compat/` 跳转说明。
- 许可证变更需重新确认合规要求。
- `manifest.json` 的 `references` 数组语义已收窄为「方法类参考文件」，不再包含入口文档与 QA 规则，依赖该数组做全量遍历的下游需改读 `compat.files` 与新增的 `workflows`、`qa`、`schemas` 数组。

## Version 1.1.1

发布日期：2026-08-05  
发布类型：能力增强 + 质量门禁升级 + 专家路由器结构重构

## 核心升级

1. 补齐从 P0 到 P2 的能力深度：
   - P0：参数化 UI 规范、无障碍关键门槛、证据化 QA。
   - P1：布局决策矩阵、交互动效基线、响应式断点验收。
   - P2：国际化与性能友好设计约束。
2. QA 升级为双轨输出：
   - P0/P1/P2 风险分级。
   - 100 分制设计质量评分。
3. 输出模板升级：
   - 新增 UI 参数建议表、响应式断点变化表、可访问性验收表、交互状态与反馈时序表。
4. 示例升级：
   - 三个示例补齐无障碍、响应式与交互时序证据段。
5. 结构重构为专家路由器：
   - 从“总控 Skill + skills 子 Skill”改为“总控路由 + experts 专家模块 + playbooks 手册”。

## 关键文件变更

- 专家模块：
  - `experts/01-requirement-to-flow-expert.md`
  - `experts/02-flow-to-wireframe-expert.md`
  - `experts/03-wireframe-to-ui-expert.md`
  - `experts/04-ui-to-design-system-expert.md`
  - `experts/05-ui-to-prototype-expert.md`
  - `experts/06-prototype-review-expert.md`
- 路由手册：
  - `playbooks/expert-router.md`
- 参考资料：
  - `references/ui-design-system-guide.md`
  - `references/frontend-prototype-qa-guide.md`
  - `references/output-templates.md`
  - `references/qa-checklist.md`
  - `references/delivery-contract.md`
  - `references/product-wireframe-playbook.md`
  - `references/source-map.md`
  - `references/quick-start.md`
  - `references/faq.md`
- 示例：
  - `examples/customer-management-dashboard.md`
  - `examples/booking-flow-prototype.md`
  - `examples/admin-config-page.md`

## 兼容性说明

- 保持原有 6 阶段能力不变，仅替换为专家路由器结构。
- 新增规则是“增强约束”，不会破坏已有提问入口。
- 对于信息不完整输入，仍支持降级交付并明确假设边界。

## 一致性修复

- 统一版本号到 `1.1.1`：
  - `SKILL.md`
  - `manifest.json`
  - `package.json`
  - `_meta.json`（已为 `1.1.1`，本次保持一致）
- 修复引用路径命名不一致：
  - `product-and-wireframe-playbook.md` -> `product-wireframe-playbook.md`
  - `ui-and-design-system-guide.md` -> `ui-design-system-guide.md`

## 发布后建议

上线前执行一次灰度回归：`references/gray-release-checklist.md`。  
建议至少完成 5 条回归提示词全链路验证，并记录通过证据。
