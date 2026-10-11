# 上传前审核报告

审核对象：`design-ui-prototype-expert-pack-1.2.0`
审核日期：2026-10-03
审核人：产品经理与架构师联合执行
审核结论：**有条件通过**。包体本身零禁用文件、零敏感信息、零路径泄漏。放行前需处理 2 项登记事项，均由 `manifest.json` 的写入权限归属决定，见第 9 节。

## 1. 审核项与判定标准

| 编号 | 审核项 | 判定标准 | 检查方法 |
|---|---|---|---|
| A1 | 冗余文件 | 包内不得含系统文件、缓存目录、临时后缀、二进制与 Office 文件 | 遍历全量文件，按文件名与后缀白名单逐项比对 |
| A2 | 版本控制残留 | 不得含隐藏文件、编辑器备份文件、版本控制目录 | 遍历全量文件，检测路径任一段以点开头 |
| A3 | 目录结构与命名 | 文件名不得含空格与非 ASCII；扩展名文件统一小写 | 遍历全量文件名做字符级检查 |
| A4 | 空文件与体积 | 不得含 0 字节文件；单文件不得超 200KB | 遍历全量文件取字节数 |
| A5 | 品牌中立 | 正文不得出现平台品牌词，含大小写、空格、连字符、下划线变体 | 正则扫描全部 md、json、py、yaml 文本文件 |
| A6 | 信息脱敏 | 不得含本机绝对路径、个人用户名 | 三类路径正则逐行扫描 |
| A7 | 密钥类敏感信息 | 不得含私钥块、API key、Bearer 头、云厂商访问键、内网 IP、数据库连接串、口令赋值 | 七类正则逐行扫描 |
| A8 | 未引用资源 | `data/` 与 `templates/` 下每个文件必须在 `manifest.json` 登记 | 实际文件集与 manifest 登记集合求差集 |
| A9 | manifest 登记完整性 | 登记项与实际文件集双向一致，无幽灵登记、无漏登记 | 同上，双向差集 |
| A10 | 内容重复 | 不得含 md5 完全相同的重复文件；主题重叠文件须为互补关系 | 全量文件求 md5 分组；对疑似主题对算 6-gram 重合率 |

## 2. 冗余文件检查

扫描范围：全量 83 个文件，含本次新建的 `deliverables/` 三份文档。

| 检查对象 | 判定标准 | 实测结果 |
|---|---|---|
| 系统文件 | `.DS_Store`、`Thumbs.db`、`desktop.ini` 零命中 | 命中 0 |
| 缓存目录 | `__pycache__`、`.pytest_cache`、`.ipynb_checkpoints` 零命中 | 命中 0 |
| 临时后缀 | `.pyc`、`.pyo`、`.log`、`.tmp`、`.bak`、`.swp` 零命中 | 命中 0 |
| 二进制与 Office | `.zip`、`.doc(x)`、`.xls(x)`、`.ppt(x)`、图片、字体、音视频零命中 | 命中 0 |
| 嵌套压缩包 | 文件名不得含 `.zip` | 命中 0 |
| 0 字节文件 | 零命中 | 命中 0 |
| 超过 200KB 的文件 | 零命中 | 命中 0，最大文件为 `scripts/validate_pack.py` 约 30KB |

运行 `python3 scripts/validate_pack.py` 前后各做一次目录快照对比，`scripts/` 目录未产生 `__pycache__` 或 `.pyc` 残留。脚本内的 `sys.path.insert` 加 `from check_frontmatter import` 写法会触发 Python 写字节码缓存，实测未生成，判定为环境已关闭字节码写入。

## 3. 敏感信息检查

| 检查对象 | 判定标准 | 实测结果 |
|---|---|---|
| 私钥块 | `BEGIN ... PRIVATE KEY` 零命中 | 命中 0 |
| API key 赋值 | 形如 `api_key = 长串` 零命中 | 命中 0 |
| Bearer 头 | 零命中 | 命中 0 |
| 云厂商访问键 | `AKIA` 加 16 位大写字母零命中 | 命中 0 |
| 内网 IP 地址 | 10.x、192.168、172.16 至 31 段零命中 | 命中 0 |
| 数据库连接串 | mysql、postgres、mongodb、redis 协议头零命中 | 命中 0 |
| 口令字段赋值 | 形如 `password = "值"` 零命中 | 命中 0 |
| 本机绝对路径 | `/Users/` 加用户名零命中 | 命中 0 |
| Linux 家目录路径 | `/home/` 加用户名零命中 | 命中 0 |
| Windows 用户路径 | 盘符加 `Users` 零命中 | 命中 0 |
| 邮箱地址 | 常规邮箱模式逐行扫描 | 命中 2 处，均为 `references/ux-writing-rules.md` 第 28 行与第 44 行的文案示例 `name@example.com`。该域名属 RFC 2606 保留示例域名，不可路由到真实信箱，判定为**保留不删** |
| 手机号 | 11 位中国大陆号段零命中 | 命中 0 |
| 身份证号 | 18 位校验格式零命中 | 命中 0 |

`scripts/validate_pack.py` 第 8 类检查独立扫描后同样零命中，与本次结果一致。

## 4. 目录结构与命名规范检查

| 检查项 | 实测 | 判定 |
|---|---|---|
| 文件名含空格 | 0 处 | 通过 |
| 文件名含非 ASCII 字符 | 0 处 | 通过 |
| 顶层目录命名前缀 | 14 个顶层项，均为小写或单字母，无驼峰与连字符混用 | 通过 |
| 目录职责边界 | `data/` 只放结构化数据，`templates/` 只放产物模板，`workflows/` 只放流程，`qa/` 只放质量规则，`tests/` 只放回归用例与记录，`scripts/` 只放可执行脚本，`deliverables/` 只放交付文档，`docs/` 只放文案规则，`_compat/` 只放迁移跳转说明，`assets/` 只放资源位说明 | 通过 |
| 文件扩展名统一小写 | 6 处大写，均为 `README.md` 与 `SKILL.md` | 保留。README 与 SKILL 为通用约定文件名，大写属标准写法 |

## 5. 未引用资源检查

### assets/ 是否为空壳

`assets/` 下仅 1 个文件 `assets/README.md`，34 行。文件已写明保留空目录的三条理由：不打包第三方字体与图标集、不打包上游品牌样本全文与图片、引入二进制资源前先确认许可与体积。文件内还给出 `diagrams/`、`icons/`、`tokens/` 三个计划资源位及其引入条件。

判定：**不视为空壳**。目录有明确用途声明与扩展计划，上架时保留不影响功能。

### data/ 与 templates/ 是否都被 manifest 登记

| 检查项 | 文件数 | 判定 |
|---|---|---|
| `data/` 下文件全部登记 | 10 个全部已登记 | 通过 |
| `templates/` 下文件全部登记 | 12 个全部已登记 | 通过 |
| 登记项与实际文件集一致性 | 双向差集均为空 | 通过 |
| 门禁第 6 类校验 | data 与 templates 下 22 个文件全部已登记 | 通过 |

### 其他目录的引用情况

| 目录 | 引用来源 | 判定 |
|---|---|---|
| `experts/` 6 份 | `SKILL.md` 核心能力速查表逐份列出 | 通过 |
| `workflows/` 6 份 | `manifest.json` 的 workflows 数组、`playbooks/expert-router.md` 的契约与工作流文件表 | 通过 |
| `qa/` 4 份 | `manifest.json` 的 qa 数组、`SKILL.md` 第十章审计读分组 | 通过 |
| `tests/` 2 份 | `manifest.json` 的 tests 数组、`qa/release-gate.md` 执行方式第 1 步 | 通过 |
| `scripts/` 2 份 | `manifest.json` 的 scripts 数组、`assets/README.md` 相关节 | 通过 |
| `docs/` 1 份 | `manifest.json` 的 docs 数组、`assets/README.md` 相关节 | 通过 |
| `_compat/` 7 份 | `manifest.json` 的 compat.files 数组 | 通过，标注 v1.3.0 移除 |

### 全量未引用检测

以文件名、basename、去扩展名 stem 三种形态在全部文本文件中检索引用。排除 `SKILL.md`、`README.md`、`manifest.json`、`source-map.md` 四个索引文件自身后，**无引用数为 0**。所有资源均可达。

## 6. 版本控制残留检查

| 检查项 | 实测 | 判定 |
|---|---|---|
| `.git` 目录 | 包内不存在 | 通过 |
| `.gitignore`、`.gitattributes` | 不存在 | 通过 |
| `.gitkeep` | 不存在 | 通过 |
| 任何以点开头的文件或目录 | 包内 0 个 | 通过 |
| 编辑器备份文件（`~` 前后缀、`.bak`、`.orig`、`.rej`、`.swp`） | 0 个 | 通过 |
| IDE 配置目录（`.idea`、`.vscode`） | 不存在 | 通过 |
| 依赖目录（`node_modules`、`.venv`） | 不存在 | 通过 |

## 7. 与功能无关的杂物文件检查

逐目录核对文件与目录职责的对应关系，未发现杂物。

| 目录 | 文件数 | 杂物 | 说明 |
|---|---|---|---|
| 根级 | 7 | 无 | `SKILL.md` 为入口，`README.md` 为上手说明，`source-map.md` 为能力继承与路径迁移记录，`release-notes.md` 为版本变更记录，`manifest.json`、`package.json`、`_meta.json` 为元数据 |
| `_compat/` | 7 | 无 | 7 份迁移跳转说明，每份 6 行，共 42 行 |
| `assets/` | 1 | 无 | 资源位说明 |
| `data/` | 10 | 无 | 8 份结构化数据加 1 份目录说明加 2 份 schema |
| `docs/` | 1 | 无 | 中文文案规则 |
| `examples/` | 3 | 无 | 三份示例，2 份由 P2 扩写 |
| `experts/` | 6 | 无 | 六段专家文件 |
| `playbooks/` | 1 | 无 | 路由手册 |
| `qa/` | 4 | 无 | 质量规则 |
| `references/` | 18 | 无 | 17 份方法文件加 1 份目录说明 |
| `scripts/` | 2 | 无 | 校验脚本 |
| `templates/` | 12 | 无 | 目录说明加 11 份产物模板 |
| `tests/` | 2 | 无 | 回归用例与记录模板 |
| `workflows/` | 6 | 无 | 六段流程文件 |
| `deliverables/` | 3 | 无 | 本次新建的三份交付文档 |

`examples/customer-management-dashboard.md` 的 3 处二级标题含「（新增）」字样（9.1、9.2、9.3 节）。该文件不在本次可改范围内，判定为**遗留项**，见第 10 节。

## 8. 内容重复检查

### md5 完全相同的文件

全量 83 个文件求 md5 分组，**重复组数为 0**。

### 主题重叠文件对

`data/` 的结构化数据与 `references/` 的方法文档存在主题对应关系，逐对计算 6-gram 重合率：

| 文件对 | 6-gram 重合率 | 判定 |
|---|---|---|
| `data/regression-cases.json` 与 `tests/regression-cases.yaml` | 21.2% | 同一用例的双形态载体，YAML 供人读与门禁校验，JSON 供程序读取。字段 id、expectedRoute、requiredOutputs、passCriteria、covers 完全对应。重叠属设计预期 |
| `data/brand-references.json` 与 `references/brand-token-index.md` | 5.1% | JSON 为结构化品牌索引，md 为取用规则与风格描述。互补关系 |
| `data/component-states.json` 与 `references/ui-design-system-guide.md` | 0.4% | JSON 为 12 类组件 7 态定义，md 为方法与对比度计算。互补关系 |
| `data/qa-scoring-rubric.json` 与 `qa/scoring-workflow.md` | 0.6% | JSON 为权重与档位数据，md 为操作流程。互补关系 |
| `data/page-patterns.json` 与 `references/product-wireframe-playbook.md` | 0.1% | 互补关系 |
| `data/responsive-breakpoints.json` 与 `references/resilient-text.md` | 0.0% | 互补关系 |

**无冗余重复文件。**

## 9. 清理清单与清理结果

### 清理清单

| 序号 | 文件路径 | 类别 | 处理理由 | 是否执行 |
|---|---|---|---|---|
| C1 | `/tmp/p2_audit_scan.py` | 临时脚本 | 本次审核自建的扫描脚本，位于系统临时目录，不属于包体 | 已执行删除 |
| C2 | `/tmp/p2_sensitive_scan.py` | 临时脚本 | 同上 | 已执行删除 |
| C3 | `/tmp/p2_unreferenced.py` | 临时脚本 | 同上 | 已执行删除 |
| C4 | `/tmp/p2_manifest_check.py` | 临时脚本 | 同上 | 已执行删除 |
| C5 | `/tmp/p2_final_audit.py` | 临时脚本 | 同上 | 已执行删除 |
| C6 | `/tmp/diff12.json` | 临时数据 | 文件级差异的中间数据，脚本化清单已落盘为 `deliverables/file-impact-manifest.md` | 已执行删除 |

### 明确不清理项

| 文件路径 | 不清理理由 |
|---|---|
| `data/` 全部 10 个文件 | 依据 `scripts/validate_pack.py` 的 `_runtime_data_dirs` 定义，`data` 属运行时数据目录，只在显式传 `--clean-data` 时清理，默认不删。本包的结构化数据是门禁第 6 类与第 13 类的校验对象，删除会直接导致门禁 FAIL |
| `assets/README.md` | 目录用途声明，见第 5 节 |
| `_compat/` 全部 7 个文件 | 承担 7 处路径迁移的过渡期跳转，标注 v1.3.0 移除。当前版本仍需 |
| `README.md` 与 `SKILL.md` 的大写文件名 | 通用约定文件名 |
| `references/ux-writing-rules.md` 第 28、44 行的 `name@example.com` | RFC 2606 保留示例域名，不可路由 |
| `release-notes.md` 第 5、118、182 行的行尾双空格 | Markdown 的强制换行语法，属有效格式，不影响解析 |

### 包外观察项，不在本次处理范围

| 路径 | 说明 |
|---|---|
| 上层目录的 `.DS_Store` | 位于工作区根，不属于本包体。上架取包只取包目录，无影响 |
| `design-ui-prototype-expert-pack-1.1.3/.DS_Store` | 位于 1.1.3 回滚点目录。按回滚点只读原则，未触碰 |
| `design-ui-prototype-expert-pack-1.1.3.zip` | 1.1.3 的打包产物，回滚用。未触碰 |
| `.upgrade-notes/` 目录 | 升级过程笔记，含 1.1.3 快照 tar.gz 与错误码草案。不属于包体 |

### 清理结果

| 指标 | 数值 |
|---|---|
| 删除文件数 | 6 |
| 删除文件类型 | 临时脚本 5 个，临时数据 1 个，全部位于 `/tmp` |
| 包体内删除文件数 | 0 |
| 包体内容变更 | 无。审核前后的包体文件集完全一致，均为 80 个文件，不含本次新建的 `deliverables/` 3 份文档 |

**清理动作的真实结论：包体本身无需删除任何文件。** 全部 6 个删除项均为本次审核自建的临时脚本与中间数据，位于系统临时目录。包体的整洁性来自 `scripts/validate_pack.py` 第 5 类与第 6 类检查在 P0 阶段的拦截效果，以及 P1 阶段新增文件时的规范执行。

## 10. 放行前需处理的登记事项

| 序号 | 事项 | 具体情况 | 影响 | 处理方式 |
|---|---|---|---|---|
| G1 | `deliverables/` 未在 manifest 登记 | 三份交付文档均在 `manifest.json` 的 22 个数组之外。上架时若按 manifest 遍历资产，这三份文件不可达 | 上架资产清单不完整 | 需在 `manifest.json` 新增 `deliverables` 数组。`manifest.json` 不在本次可改范围内，未执行 |
| G2 | `SKILL.md` 与 `playbooks/expert-router.md` 的登记方式 | 两份文件未出现在任何数组中，但分别通过 `entry` 与 `skillset` 标量字段登记 | 无。属正确设计 | 保留。审核时已排除，非漏登记 |

## 11. 审核结论

| 审核项 | 判定 |
|---|---|
| A1 冗余文件 | 通过 |
| A2 版本控制残留 | 通过 |
| A3 目录结构与命名 | 通过 |
| A4 空文件与体积 | 通过 |
| A5 品牌中立 | 通过。82 个文本文件零命中，含 `deliverables/` 三份 |
| A6 信息脱敏 | 通过 |
| A7 密钥类敏感信息 | 通过 |
| A8 未引用资源 | 通过 |
| A9 manifest 登记完整性 | 有条件通过。data 与 templates 全登记；`deliverables/` 待补登记 |
| A10 内容重复 | 通过。无 md5 重复，主题重叠均为互补 |

**最终判定：有条件通过。** 条件为 G1，即在 `manifest.json` 补 `deliverables` 数组。该条件不涉及包体内容变更，只涉及元数据登记。若上传流程按目录整体打包而非按 manifest 遍历，G1 可降级为非阻塞。

### 遗留项

| 编号 | 遗留项 | 说明 |
|---|---|---|
| R-1 | `examples/customer-management-dashboard.md` 三处标题含「（新增）」 | 9.1、9.2、9.3 节。该文件不在本次可改范围内 |
| R-2 | `manifest.json` 缺 `deliverables` 数组 | 见 G1 |
| R-3 | 3 处行尾双空格 | `release-notes.md` 第 5、118、182 行，属 Markdown 强制换行语法，无需处理 |
