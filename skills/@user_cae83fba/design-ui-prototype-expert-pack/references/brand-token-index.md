# 品牌设计 token 取用指南

供 04 段（UI 转设计系统）参考外部品牌设计规范使用。数据校验日期：2026-10-03。

## 1. 上游来源与取用路径

上游仓库 `https://github.com/VoltAgent/awesome-design-md`，`design-md/` 目录下共 74 个品牌目录，每个目录内含一份 `DESIGN.md`。

正确取用路径（raw）：

```
https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/{brand}/DESIGN.md
```

| 项 | 说明 |
|---|---|
| 路径层级 | 必须带 `{brand}/DESIGN.md` 这一层目录，不能省 |
| 已失效路径 | `design-md/{brand}.md` 平铺路径实测返回 404。外部资料若写该形式，照用会直接失败 |
| 汽车类双目录 | `bmw` 与 `bmw-m` 是两个独立目录，需分别索引，不可合并 |
| 含点号目录名 | `linear.app`、`mistral.ai`、`opencode.ai`、`together.ai`、`x.ai` 按原样使用 |
| 带年份后缀 | `bmw-m`、`dell-1996`、`nintendo-2001` 按原样使用 |

## 2. 取用规则

| 编号 | 规则 | 说明 |
|---|---|---|
| B1 | 按需读取所需章节 | 单份样本约 480 至 570 行、24 至 37 KB，整份载入会挤占上下文 |
| B2 | 声明引用来源 | 04 段输出须写明参考了哪个品牌的哪几个章节 |
| B3 | 最多混用 2 个品牌 | 超过 2 个会出现 token 语义冲突；混用须说明各品牌负责哪一层 |
| B4 | 复算对比度 | 品牌色直接引用前按 `references/ui-design-system-guide.md` 第 3.2 节复算 |
| B5 | 语义优先 | 优先取语义层 token，不照搬原始色值 |

## 3. 样本文件结构

frontmatter 提供结构化 token，可直接解析：`colors.primary`、`colors.surface-*`、`colors.ink` / `body`、`typography.hero-display.fontSize`、`letterSpacing`。

正文 9 节：视觉主题（Overview）、色彩角色（Colors）、排版规则（Typography）、布局原则（Layout）、深度与层次（Elevation & Depth）、形状规范（Shapes）、组件样式（Components）、Do's and Don'ts、Agent 提示指南。

## 4. 品牌索引表（74 个，按 9 类分组）

### 4.1 AI 大模型（12）

`claude` 暖陶土色衬线标题 · `mistral.ai` 深色基底青橙点缀 · `x.ai` 黑白高反差 · `together.ai` 柔和渐变圆角 · `cohere` 企业级克制绿灰 · `ollama` 本地运行朴素深色 · `opencode.ai` 终端感等宽字体 · `minimax` 双色对撞 · `elevenlabs` 声纹蓝紫渐变 · `runwayml` 影像工具暗色专业 · `replicate` 模型列表紧凑 · `superhuman` 高端邮件精致排版

### 4.2 开发者工具与 IDE（15）

`cursor` 深色编辑器紫蓝 · `warp` 终端现代版 · `linear.app` 暗色高密度低饱和强调 · `lovable` 明亮友好圆角 · `framer` 高对比黑白大字号 · `vercel` 纯黑白极细边框 · `expo` 深色文档代码配色 · `mintlify` 文档友好青绿 · `raycast` 渐变高光暗色面板 · `voltagent` 深色工业网格 · `composio` 开发者营销代码块主导 · `posthog` 数据产品多色编码 · `resend` 邮件发送极简表单 · `sanity` 内容工作台三栏 · `sentry` 监控告警状态色语义

### 4.3 生产力 SaaS（8）

`notion` 中性灰极简块结构 · `miro` 协作画布手绘感 · `slack` 多色侧栏活泼 · `airtable` 表格网格字段色彩编码 · `figma` 多彩画布感 · `intercom` 编辑排版米白暖色 · `cal` 日历优先干净白底 · `clickhouse` 数据密集深色表格

### 4.4 科技巨头（7）

`apple` 摄影优先单一交互色 · `meta` 蓝白圆角柔和 · `nvidia` 酸性绿深黑高对比 · `ibm` 网格严谨经典蓝 · `dell-1996` 企业蓝保守排版 · `hp` 简洁蓝白轻量 · `spacex` 任务导向单色工业感

### 4.5 汽车（7）

`bmw` 精密栅格深蓝白克制 · `bmw-m` 运动取向高对比动感 · `bugatti` 奢华点缀金色 · `ferrari` 红色主导跃动大字 · `lamborghini` 锋利几何黑黄 · `renault` 亲和圆形明亮现代 · `tesla` 单色极简大留白

### 4.6 金融科技（7）

`stripe` 渐变紫蓝精致排版 · `binance` 深色金黄数据密集 · `coinbase` 蓝白清晰栅格 · `kraken` 深色几何高密度 · `mastercard` 红橙对撞圆环 · `revolut` 黑白极简卡片化 · `wise` 亮绿明快友好

### 4.7 消费互联网（9）

`airbnb` 摄影主导圆润暖白 · `uber` 黑白地图主导极简 · `pinterest` 图片瀑布流暖色圆角 · `spotify` 深色绿点缀圆角卡片 · `starbucks` 绿棕复古现代混合 · `nike` 大字排版高反差 · `vodafone` 红白简洁企业感 · `playstation` 蓝白渐变游戏感 · `nintendo-2001` 明亮色块卡通圆润

### 4.8 电商零售（4）

`shopify` 绿色系功能优先工具感 · `webflow` 亮色视觉优先大标题 · `theverge` 编辑媒体黑白高对比 · `wired` 科技媒体黑色密集网格

### 4.9 基础设施（5）

`hashicorp` 暗色技术文档工程感 · `mongodb` 绿白简洁开发者友好 · `supabase` 深绿黑等宽字体 · `zapier` 暖橙多色友好流程图 · `clay` 数据外联明亮多色编码

## 5. 常用品牌速查

| 场景 | 建议参考品牌 |
|---|---|
| 通用精致后台 | linear.app、stripe |
| 工具型产品 | notion、raycast、voltagent |
| 数据密集界面 | clickhouse、kraken、posthog |
| 消费级移动端 | apple、airbnb、spotify |
| 高端品牌页 | bugatti、ferrari、tesla |
| 金融与合规 | stripe、wise、coinbase |

## 6. 引用声明格式

```
参考来源：linear.app（DESIGN.md）
引用章节：Colors、Typography、Do's and Don'ts
混用说明：主色与字体层级取自 linear.app，组件状态沿用本项目既有规范
复算记录：colors.primary 对白底对比度 4.62:1，已达普通文本门槛
```
