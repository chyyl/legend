# assets/ 资源位预留

## 当前定位

本技能包是知识资产包，不强依赖二进制资源。`assets/` 目前只保留本说明，不放实际文件。

## 为何保持空目录

界面结构与交互规则用文字与 token 表达即可，示意图、字体、图标集都不是交付物成立的必要条件。预留目录是为了后续扩展时不必改动目录结构。

## 计划中的资源位

以下为占位说明，实际文件尚未纳入本包。

| 资源位 | 用途 | 引入条件 |
|---|---|---|
| `diagrams/` | 流程图与信息架构图，与 `templates/flow-diagram.md` 配套 | 图形能显著提升评审效率，且能用文本等价表达 |
| `icons/` | 界面图标集 | 用户品牌规范已提供可授权图标 |
| `tokens/` | 平台原生 token 导出文件，如 CSS 变量、Swift、Compose | 目标技术栈确定后按需生成 |

## 边界

1. 不打包第三方字体与图标集，许可边界不清。
2. 不打包上游品牌样本的 DESIGN.md 全文与图片资源，按需拉取。
3. 引入任何二进制资源前先确认许可与体积，并在 `manifest.json` 登记。
4. 交付物中的图片需自带来源标注，不引用本机路径。

## 相关

- 结构化数据在 `data/`，见 `data/README.md`
- 产物模板在 `templates/`，见 `templates/README.md`
- 界面文案规则在 `docs/content-style-guide.md`
- 包级校验：`python3 scripts/validate_pack.py`，其中第 5 类检查会拦截二进制与 Office 文件
- frontmatter 校验：`python3 scripts/check_frontmatter.py`