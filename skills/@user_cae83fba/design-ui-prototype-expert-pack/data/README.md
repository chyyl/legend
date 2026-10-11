# data/ 结构化数据说明

本目录存放供专家模块按需读取的机器可读数据。全部为 JSON，加载策略是按阶段取用，不做整包注入。

## 加载顺序

| 阶段 | 读取文件 | 用途 |
|---|---|---|
| 01 需求到产品结构 | `data/regression-cases.json` 的 R1 与 R10 段 | 门禁触发与降级规则自查 |
| 02 流程到线框图 | `data/page-patterns.json` | 选页面模式，核对必备区块与五状态 |
| 03 线框转 UI | `data/design-tokens.base.json`、`data/component-states.json`、`data/responsive-breakpoints.json` | token 基线、组件七态、断点规则 |
| 03 品牌参照 | `data/brand-references.json` | 需要品牌风格参照时按需拉取上游规范 |
| 04 UI 转设计系统 | `data/design-tokens.base.json`、`data/component-states.json` | 三层 token 映射与状态矩阵 |
| 05 UI 转前端交接 | `data/responsive-breakpoints.json`、`data/component-states.json` | 响应式规则与交互时序 |
| 06 原型 QA | `data/qa-scoring-rubric.json`、`data/component-states.json`、`data/page-patterns.json` | 七维评分、状态核对、模式误用比对 |
| 发布前 | `data/regression-cases.json` | 12 条回归用例定义 |

`data/schemas/` 下两份 JSON Schema 用于校验交付物结构，只在结构校验时读取。

## 文件清单

| 文件 | 内容 | 行数量级 |
|---|---|---|
| `data/design-tokens.base.json` | primitive / semantic / component 三层 token 与命名规则 | 约 280 |
| `data/component-states.json` | 12 类组件 × 7 状态，含 focus 与 disabled 传达要求 | 约 190 |
| `data/page-patterns.json` | 14 种页面模式的适用条件、必备区块、常见误用、状态要求 | 约 290 |
| `data/responsive-breakpoints.json` | 四档断点、栅格、塌陷规则与验证要求 | 约 90 |
| `data/brand-references.json` | 74 个品牌样本索引，按需拉取，不打包全文 | 约 500 |
| `data/qa-scoring-rubric.json` | 七维评分权重、判定条件、扣分项与结论档位 | 约 150 |
| `data/regression-cases.json` | 12 条回归用例，与 `tests/regression-cases.yaml` 对应 | 约 140 |

## 维护约定

- 三层 token 用 `{path.to.token}` 引用，不复制值。`component` 层禁止出现色值与尺寸字面量。
- 改动 `data/regression-cases.json` 时同步 `tests/regression-cases.yaml`，两处 id、路由与必需产物须一致。
- 品牌样本索引只保留名称、分类、关键词与路径，不落上游全文与二进制资源。
- `data` 目录在清理脚本中属可选清理项，默认不删，删除需显式开启清理数据目录开关。

## 校验

```
python3 -c "import json,glob; [json.load(open(p)) for p in glob.glob('data/*.json')+glob.glob('data/schemas/*.json')]; print('OK')"
python3 scripts/validate_pack.py
python3 scripts/check_frontmatter.py
```

`validate_pack.py` 覆盖 12 类包级门禁，`check_frontmatter.py` 单独校验 frontmatter 字段完整性与版本四处一致，两者都只依赖 Python 3 标准库。