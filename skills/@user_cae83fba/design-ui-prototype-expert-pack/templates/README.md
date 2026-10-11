# templates/ 产物模板索引

11 份 Markdown 模板，供各阶段产物落盘时套用。字段名与 `data/schemas/` 及 `data/*.json` 保持一致，便于机器复核。

## 选用规则

| 阶段 | 模板 | 何时用 |
|---|---|---|
| 01 需求到产品结构 | `templates/requirement-breakdown.md` | 产出目标、非目标、角色、假设、待确认问题 |
| 01 需求到产品结构 | `templates/page-inventory.md` | 产出页面清单，字段对应 `page-inventory.schema.json` |
| 02 流程到线框图 | `templates/wireframe-spec.md` | 产出区块结构、信息层级、操作优先级、五状态 |
| 02 流程到线框图 | `templates/flow-diagram.md` | 产出主路径、分支与异常路径流转说明 |
| 03 线框转 UI | `templates/ui-spec.md` | 产出参数化视觉规则与组件样式 |
| 04 UI 转设计系统 | `templates/design-tokens.md` | 产出三层 token 表，含 usage 与 forbiddenUsage |
| 04 UI 转设计系统 | `templates/component-state-table.md` | 产出 12 类组件七态矩阵 |
| 品牌参照产出 | `templates/design-spec.md` | 按上游 DESIGN.md 落页面规范时使用 |
| 05 UI 转前端交接 | `templates/frontend-handoff.md` | 产出组件拆分、状态机、接口字段、埋点、验收用例 |
| 06 原型 QA | `templates/prototype-qa-report.md` | 产出问题分级、证据、七维评分 |
| 任意阶段收尾 | `templates/review-summary.md` | 产出结论、风险、待确认与下一步 |

## 使用约定

1. 保留表头与字段名，只替换数据行。字段缺失时填「待确认」，不删行。
2. 每份模板第 3 行是 1 行示例数据，落盘前删除该行。
3. 假设类内容必须标注来源，与事实分开写，不混入结论。
4. 落盘文件名按 `SKILL.md` 第六章规则：`<主题>-<类型>-v<版本>.md`。
5. 模板中不放真实客户名、本机路径与内部项目代号。

## 边界

模板只规定结构与字段，不规定设计取值。UI 参数、行业反模式、token 具体数值按项目实际情况填写，判定口径见 `data/` 下对应 JSON。