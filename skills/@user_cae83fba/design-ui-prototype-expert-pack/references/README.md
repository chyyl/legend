# references 目录说明

本目录存放方法层文件，回答「怎么判断、怎么写、怎么验收」。执行流程在 `workflows/`，质量门禁在 `qa/`，结构化数据在 `data/`，产物模板在 `templates/`。

**读取原则：按需读取，不在首轮全量加载。** 下面每份文件都标了读取时机。

## 核心契约（先读）

| 文件 | 作用 | 何时读 |
|---|---|---|
| `delivery-contract.md` | 六段各自的任务类型、最低交付要求、不通过条件 | 每次任务的判定基准，始终先读 |
| `clarification-gate.md` | MRC 六项门禁、成熟度分级、三层挖掘、矛盾检测、选项化提问规范 | 需求澄清阶段，执行追问循环前 |
| `structured-artifacts.md` | 五类结构化产物的字段口径、生成时机、消费方 | 需要产出机器可读交付物时 |
| `output-conventions.md` | 产物命名规则、落盘目录、双份输出一致性 | 落盘任何交付物前 |

## 方法手册（按阶段读）

| 文件 | 覆盖段 | 何时读 |
|---|---|---|
| `product-wireframe-playbook.md` | 01 至 02 | 拆页面、定信息架构、判页面清单是否过 gate |
| `industry-style-filter.md` | 03 | 定行业归属后选风格方向，产出 AVOID 栏 |
| `ui-design-system-guide.md` | 03 至 04 | 写 UI 规格、算对比度、定 token 三层映射、查无障碍细则 |
| `brand-token-index.md` | 04 | 需要品牌风格参照时查取用路径与 74 品牌索引 |
| `resilient-text.md` | 05 | 核对窄屏、放大字号、动效降级下的文本表现 |
| `ux-writing-rules.md` | 05 | 生成按钮、错误提示、空状态、权限提示等界面文案 |
| `frontend-prototype-qa-guide.md` | 05 至 06 | 前端交接与原型运行检查 |
| `output-templates.md` | 全段 | 组织页面清单、状态表、token 表与交接表（实体模板在 `templates/`） |

## 验收与自审（审计时读）

| 文件 | 作用 | 何时读 |
|---|---|---|
| `pre-delivery-checklist.md` | 交付前十项检查，含勾选格式与高危项说明 | 交付前逐项过一遍 |
| `design-heuristics.md` | Nielsen 10 条启发式与 0 至 4 分标尺 | 用户要求可用性评估时作可选交叉验证。不替代 7 维 100 分制，不参与结论判定 |
| `anti-patterns.md` | 14 条可判定反模式，每条含现象、后果、改正动作 | 自审发现反复出现的同类缺陷时，核对是否踩了行业禁忌 |

## 提问范式

| 文件 | 何时读 |
|---|---|
| `prompt-recipes.md` | 需要为常见任务找现成问法时 |

## 依赖关系

```
clarification-gate ──→ 01 段产出需求确认表（字段见 structured-artifacts）
       ↓
product-wireframe-playbook ──→ 02 段产出页面清单（结构见 data/schemas/page-inventory.schema.json）
       ↓
industry-style-filter + brand-token-index ──→ 03 段产出 UI 规格（含 AVOID 栏）
       ↓
ui-design-system-guide ──→ 04 段产出 token 三层映射
       ↓
resilient-text + ux-writing-rules ──→ 05 段产出前端交接清单
       ↓
pre-delivery-checklist + anti-patterns ──→ 06 段产出评审结论
```

`output-conventions.md` 贯穿全程，规定每类产物的命名与落盘。

## 边界说明

本目录只放判断与理由。凡取值可枚举的内容（token 数值、组件状态、断点宽度、页面模式、评分权重、回归用例）一律落在 `data/` 下的 JSON，散文文件引用而不复制。JSON 是单一事实源，可被脚本机器校验。
