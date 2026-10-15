# LEGEND 开发任务清单（同步自 OpenCode 任务系统）
> 更新时间：2026-10-14 | 状态标记：[ ] 未开始 [~] 进行中 [x] 完成

## 阶段一：核心骨架（P0）
- [x] 1.1 项目结构与入口 index.html / css / 脚本加载顺序
- [x] 1.2 config.js 全局配置与数值表（品质/羁绊/公式/区域坐标）
- [x] 1.3 utils.js 种子随机/数学/存储工具
- [x] 1.4 engine.js 主循环/场景管理/FPS
- [x] 1.5 input.js 统一输入（点击寻路/WASD/虚拟摇杆/捏合缩放/按键自定义）
- [x] 1.6 assets.js 程序化像素图生成（角色/敌人/地形/图标，32px）

## 阶段二：世界与地图（P0）
- [x] 2.1 terrain.js 2000×2000 岛屿生成（手工框架+局部随机/水/高差/矮障碍）
- [x] 2.2 pathfinding.js A* 寻路（堆优化）
- [x] 2.3 camera.js 视口/缩放/跟随
- [x] 2.4 minimap.js 大地图（点击传送）+设置内地图
- [x] 2.5 黑暗迷宫区域：程序迷宫+战争迷雾

## 阶段三：战斗系统（P0）
- [x] 3.1 player.js 玩家（自动回血/药水/格挡/伪跳跃/攻击模式on-off-half）
- [x] 3.2 武器形态：近战扇形/远程弹道/法杖AOE/盾
- [x] 3.3 enemy.js 敌人=人类军队（固定型弹幕+缓慢型警戒追击/精英/BOSS阶段）
- [x] 3.4 combat.js 伤害结算/飘字/轻量反馈
- [x] 3.5 死亡：倒地15秒可救+回营地掉10%银币

## 阶段四：数值与成长（P1）
- [x] 4.1 loot.js 品质掉落表（武器N~SSR/装备D~SS/难度加成）
- [x] 4.2 羁绊8种等概率/同类不叠加
- [x] 4.3 等级1-10封顶/经验=银币公式/溢出转银币
- [x] 4.4 inventory.js 40格背包/四件装备/银币强化+5%/级
- [x] 4.5 难度滑块0-2（默认0.9）影响数量/血量/伤害/掉率

## 阶段五：任务与NPC（P1）
- [x] 5.1 quest.js 主线+支线（击杀/收集/探索/讨伐/护送五类）
- [x] 5.2 npcs.js 营地6NPC+各区域1人（任务/商店/强化/对话/治疗）
- [x] 5.3 宝箱可交互+品质表概率
- [x] 5.4 世界观背景文案（黑暗军团设定）融入对话

## 阶段六：界面与系统（P1）
- [x] 6.1 ui.js HUD（血条/快捷栏）+五页菜单（背包/属性/任务/地图/设置）
- [x] 6.2 角色创建（外观/命名性别/初始武器）
- [x] 6.3 设置（音量/亮度/帧率/按键自定义/设置内地图/语言切换）
- [x] 6.4 楷体字体内置（LXGW子集）+FA图标子集
- [x] 6.5 中英双语 i18n

## 阶段七：联机（P1）
- [x] 7.1 net.js WebRTC P2P+房主权威（复制粘贴房间码，无服务器）
- [x] 7.2 lobby.js 联机大厅（房间码/局域网BroadcastChannel/在线列表/角色可见）
- [x] 7.3 角色数据本地存档+世界随房主
- [x] 7.4 LAN信令辅助脚本 tools/lan-signal.js（可选，Node）

## 阶段八：存档/音频/包装（P2）
- [x] 8.1 save.js 种子+增量/自动+手动多槽/导出导入
- [x] 8.2 audio.js 程序生成8-bit BGM（每区域）+音效
- [x] 8.3 capacitor.config.json + 打包文档（Android5/iOS/Win）
- [x] 8.4 新手教程（可跳过）
- [x] 8.5 docs/api.md 接口文档 + README

## 阶段九：验收测试
- [x] 9.1 本地服务器全流程冒烟测试（创建→大厅→战斗→掉落→任务→存档）★ 2026-10-14 通过
- [x] 9.2 双开浏览器联机互通测试（同浏览器 BroadcastChannel 信令，位置同步验证）★ 通过
- [x] 9.3 性能检查（逻辑层 4.7ms/帧，远低于 30 帧保底的 33ms 预算；视口外敌人冻结）
- [ ] 9.4 三端打包验证（Android APK / Windows / iOS）——需本机 Android Studio/Xcode，见 README 打包章节

## 阶段十：交互体验与多设备输入打磨（P1）★ 2026-10-14 完成
- [x] 10.1 点击远处 NPC/宝箱：自动寻路走过去再交互（`Engine._pending` 闭环，走不到提示"走不过去"）
- [x] 10.2 E键/触屏"交"按钮就近交互（NPC优先，超距提示"走近一点"）
- [x] 10.3 触屏按钮修复：命中检测提前到 handleHotkeys（此前点击被提前消费导致按钮全失效）
- [x] 10.4 虚拟摇杆可视化（底座圈+摇杆头）；渲染门控改 isTouchUI（粗指针），触屏笔记本不遮挡
- [x] 10.5 手柄支持（Gamepad API）：摇杆/十字键移动 + A/B/X/Y/LB/RT 边沿触发动作
- [x] 10.6 点按事件队列（`pressed[]`）：修复低帧率下"按下时长<帧间隔"的短点按被丢弃（E/J时灵时不灵根因）
- [x] 10.7 手动攻击 J/RT：无视攻击模式关，空挥或9格索敌
- [x] 10.8 悬停高亮（NPC金环/宝箱金环/敌人红环）+ pointer 光标 + 靠近时"[E] 交互"头顶提示
- [x] 10.9 角色精美化：镜像矩阵重写（★第7列=镜像中轴必须实心），修复"每个角色像两个小人并排"的中缝缺陷
- [x] 10.10 NPC 差异化外观（id哈希→性别/发型/发色/肤色/手持武器）；玩家手持武器跟随当前装备
- [x] 10.11 营地=安全区不刷敌人；HUD 文字楷体化+中英 i18n（银/药/攻击模式）；BOSS 名跟随语言

## 阶段十一：地形 2.5D 高低差 + 人物朝向（P0）★ 2026-10-14 完成
- [x] 11.1 台地生成：低频噪声 nHill（>0.73→2高山 / >0.63→1台地，成片台阶非碎点）；区域中心半径8清平（NPC/宝箱/传送防困山上）
- [x] 11.2 迷宫墙 height=2 挤出与不可走一致（通路清平0）；sprinkleFences 改 3~6 格连续段、遇非草地即断（废除4万次孤立碎点）
- [x] 11.3 `Assets.groundTile(type,level,cliffS,northDelta)` 预烘焙挤出瓦片：层级提亮白膜0.065×、南崖壁带（暗面+岩缝+受光棱，每级7px封顶2级）、北落影0.16、顶边亮棱、水面蓝膜；渲染仍每瓦片一次 drawImage
- [x] 11.4 `Terrain.heightAt(x,y)` 原始高度查询（热路径零分配，出界按0）；engine 地形循环接入，废除旧"高差阴影条/墙黑块/每帧水膜"
- [x] 11.5 人物 4 朝向精灵：正面 / 背面（后脑勺全发+马尾垂后） / 侧面（16列全宽非对称：单眼+鼻梁），'w' 由引擎翻转 'e'；玩家/敌人/NPC 共用骨架，BOSS 保持正面
- [x] 11.6 `Player.dir` / `Enemy.dir` 朝向状态（移动主轴更新；固定型远程面向玩家）；远端玩家与快照敌人由位置增量推朝向（零联机协议改动）；空挥斩击 4 向角度
- [x] 11.7 实体脚下椭圆投影 blobShadow（NPC/敌人/玩家/远端玩家/宝箱），跳跃时投影留地面
- [x] 11.8 B/M/L 快捷键 toggle（`UI.togglePage`：同页再按=关闭；触屏背包按钮同入口）
- [x] 11.9 验证：全图 25,103 南向崖壁面 / h分布 85.8:6.9:9.3 / FPS 61 / 寻路 15:15 全通 / 10 个向导 NPC 全部可走 / 0 报错（截图 e1~e4、f3/f4、g1/g2）

## 阶段十二：UI 视觉全面重做（P0）★ 2026-10-14 完成
> 设计语言：暗黑奇幻·像素中世纪 —— 深渊黑底 / 古金雕刻框 / 锻铁浮雕按钮（frontend-design 技能）
- [x] 12.1 css/style.css 整体重写：设计令牌（:root 金/铁/深渊配色）、面板四角 L 形金饰 + 铭牌标题栏（渐隐金线+浮雕 ✕）、
      panel-in/dlg-in/toast-in 动效、锻铁按钮体系（.btn/.primary/.on/.small，按压位移+鎏金 hover 发光）、
      内凹品质插槽（--q/--qg 双变量外圈+微光）、金框滑块/输入框/表格斑马纹/滚动条
- [x] 12.2 主菜单标题画面化（engine.showMenu）：金属立体 LEGEND + 传 奇 副题 + 菱形徽记 + lore 分隔 + 全宽按钮 + 版本署名；
      菜单/大厅场景氛围背景 renderAmbience（深渊渐变+金晕+70 粒飘升金尘，替代纯黑死屏）
- [x] 12.3 HUD 重绘（drawHUD）：四角金铆钉状态铭牌（LV 章/十段刻度红渐变血条/鎏金经验条/银币圆章+药水瓶图标）、
      攻击模式徽章（绿/金/灰宝石=开/半/关）、BOSS 金框血条（两端菱形铆）；坐标改 CSS 像素（修 DPR≥2 错位隐患）
- [x] 12.4 背包重排（renderBag）：装备列 5 槽全带文字标签（武器/头盔/护甲/护腿/鞋）+ 行囊计数 + 40 格网格 +
      物品详情卡；.panel-bag 显式 640 宽；小屏装备横排单行（390px 验证无横向溢出）
- [x] 12.5 面板关闭闭环：menu 场景关闭最后一个面板自动回弹主菜单（_opening 标志防误伤）+ 设置页 #s-back 返回键 +
      bootWorld 清残留；角色创建 .cc-frame 展示框 + 性别 .btn.on 选中态；大厅 .lobby-*/.pl-* 类化
- [x] 12.6 验证：菜单/设置/大厅/创建/HUD/背包/任务 7 屏截图 + 中英切换 + B/L 开关 + 返回/✕ 回弹 + 移动端 390×844
      布局 + FPS 48-61 + 0 console 错误（截图 u7~u18、m1/m2）

## 阶段十三：手机反馈修复 + P0 打磨 + 数值调整（P0）★ 2026-10-14 完成
> 两批共 7 条真机反馈全部修复；P0 打磨 5 项落地；自动化验收（桌面 t1 + iPhone12 t2）全绿、0 console 错误

### 手机反馈（7 条全修复）
- [x] 13.1 ①「UI太大建议缩小50%」→ drawHUD 虚拟坐标 `U=W<760?0.5:(W<1100?0.75:1)` + `fs()` 字号保底10物理像素；
      CSS @media(max-width:720px) 压缩排版（触控热区保持≥44px）；BOSS 条粗指针设备上移避开触屏按钮
- [x] 13.2 ②「左半屏无法点击移动」→ touchstart 左半屏记 pending（不建摇杆），touchmove 位移>8px 才激活摇杆，
      touchend <350ms 未拖动=点击寻路；按 id 归属清理、双指 pinch 清 pending
- [x] 13.3 ③「不知道干什么」→ HUD 任务追踪条（可提交优先→active[0]→引导找营地首领）+ 屏内金菱形/屏外边缘箭头+距离；
      **根因：`Quest.accept` 无任何调用方** → `renderQuests` 新增「可接任务」区（按 NPC 区域过滤）
- [x] 13.4 ④「可穿墙与海一部分」→ terrain 新增零分配 `freeTile/boxPenalty/passableBox`（脚印四角内缩0.02）；
      player 轴分离+非法位形脱困；enemy `stepTo` 同规则（追击+回家均修）；jumpable(h1)⊂walkable（死分支移除）
- [x] 13.5 ⑤「地图与真实地形不一样」→ `bakeTerrainMap` 按 `Terrain.raw()` 逐像素烘焙（类型色+高差明暗+迷宫未探索压黑），大地图/小地图共用
- [x] 13.6 ⑥「没有设置」→ keymap.menu=Escape + `UI.escMenu`（只接管无面板/`dataset.page` 页面面板）+ HUD 设置按钮 + 大厅设置按钮
- [x] 13.7 ⑦「开始游戏与联机大厅在一起」→ 主菜单拆分：开始游戏(primary)→`Lobby.startSolo()` 直开；联机大厅独立入口

### P0 打磨（5 项）
- [x] 13.8 落点菱形：地形循环后画 `Player.path` 末项脉冲金菱形
- [x] 13.9 伪光照：`drawLighting()` 特效层后径向暗角（maze 0.60 / void 0.66 / castle 0.50 / 其它 0.34）
- [x] 13.10 主题粒子：42 粒屏幕空间池按 `region.biome` 换主题（plain/farm/coast/maze/rock/snow/castle/void/default）
- [x] 13.11 飘字分级：`Enemy.damage(e,n,flags)` 透传 crit/tri → 普通14白 / 暴击18金 / 三倍24橙红（engine 文字渲染支持 `f.size`）
- [x] 13.12 小地图：右上 96(手机)/128(桌面) 物理像素、`bakeTerrainMap` 1.2s 重烘焙、玩家白点+`hudObjective()` 目标金菱形+金框、
      `hudHit('minimap')` 点击开大地图

### 数值调整（玩家要求）
- [x] 13.13 敌人伤害=10%：`Config.ENEMY_DMG_MULT=0.1`，`Player.takeDamage` 入口统一乘算（近战/弹道/范围技唯一入口；
      格挡/闪避在其后，仍保底1点磨血）
- [x] 13.14 玩家攻击范围×2：`Config.PLAYER_RANGE_MULT=2`，`Inv.calcStats` 归一化乘算（近战/远程/魔法统一经 `s.range`）

### 验收
- [x] 13.15 桌面 t1（1280×800）+ 手机 t2（iPhone12 390×844 hasTouch/isMobile）全绿、0 console 错误：
      balancePass（100→实扣10、range=2）、pathPass、minimapHit/Click、gradePass（14/18/24）、
      前 7 反馈断言全部保持（墙1502.019/水1502.007/敌人拦停/hud四热区/ESC/任务接取/map18/trackerClick）
      脚本留存 `.playwright-mcp/t1.js`、`t2.js`（用途见同目录 README）

## 阶段十四：玩家反馈三 Bug 修复 + 测试基建（P0）★ 2026-10-14 完成
> 玩家反馈原话：「迷宫走不出去，地图不能放大，BOSS血条竟然可以重叠」——三项全修复，t1/t2/t3 回归全绿

### 三 Bug 修复
- [x] 14.1 「迷宫走不出去」→ terrain.generate() 中 buildMaze/buildRoads **顺序调换**（先迷宫后道路）：
      道路后铺才能打进迷宫、贯通出入口并清平中心（原顺序迷宫把 240×240 刷成墙覆盖道路成"密封盒"，
      中心也是墙、BOSS 落墙里）；营地→中心 184 采样 badCount 4→0，中心可走
- [x] 14.2 「地图不能放大」→ renderMap 重写：离屏底图 + 视图态 `mapV={x0,y0,z}`（**z∈[1,8] 跨面板开关持久**）：
      滚轮锚点缩放、双指捏合（锚在两指中点）、－/＋ 按钮（`#bm-out`/`#bm-in`，标签 `#bm-zoom` 步进0.5）、
      指针捕获拖拽 + 触屏单指平移（拖拽/捏合超阈值置 panned 抑制误传送）、点击传送按当前视图换算世界坐标、
      打开时玩家不在可见区自动对焦、画布 touch-action:none；i18n `teleport_hint` 同步「滚轮或双指缩放」
- [x] 14.3 「BOSS血条竟然可以重叠」→ drawHUD 血条定位 topBar 分支：触屏横屏（coarse && W>H）**置顶居中**
      （bby=34、宽 min(W×0.5,540)）——固定 H-210 在矮屏（390~440 高）会落到屏幕中部切过 BOSS 本体；
      竖屏 H-210 / 桌面 H-62 保持底部不变

### 连带修复
- [x] 14.4 迷宫雾静止全黑：`fog.reveal` 原在 player.update 的移动分支内，传送落点/站立不揭示 →
      移出分支**每帧跟随**（regionOf 非迷宫区域提前返回，开销可忽略）；6 格内敌人不再隐身挨打
- [x] 14.5 combat.js enemy_dead 空指针：联机同步重建敌人 region 可能为 null →
      `e.region || Terrain.regionOf(e.x, e.y)` 兜底、lv 缺省 1（击杀 region=null 敌人不崩溃）

### 测试基建
- [x] 14.6 恢复 t1/t2（打包前清理提交误删、README 仍引用）；t2 手机端改**页面内 JS 派发**——
      宿主机 Windows 显示缩放 110% 下 isMobile 模拟把 CDP 坐标 ×1.1 重映射，
      `page.click('#mm-start')` 误点到联机大厅、`touchscreen.tap(375,30)` 落到屏外（非产品 bug）
- [x] 14.7 新增 `t3.js` 三 Bug 回归（11 断言）：迷宫采样/雾跟随/缩放按钮·滚轮·拖拽不传送·
      点击传送·缩放持久·捏合/血条横竖屏画布像素扫描（**逐行取红最大值**——血条物理高=16×U、
      竖屏仅 8px，单行取样会踩黑边框）/region=null 击杀
- [x] 14.8 验收：t1 桌面全量 + t2 手机 + t3 全绿、0 console 错误；docs/api.md（generate 先迷宫后道路/
      fog 每帧揭示/drawHUD topBar/renderMap 缩放视图）、README（操作表+特色行）、
      .playwright-mcp/README（三脚本+×1.1 陷阱）同步

## 阶段十五：自动保存与读取存档 ★ 2026-10-14 完成
> 需求：「自动保存与读取存档」——此前 save.js 只有 60s 定时 + beforeunload（手机 WebView 杀进程
> 不触发）且无任何自动读取入口，读档后 expTo 不重算、背包不清残留、宝箱重开刷新

- [x] 15.1 **自动存档三类触发器**（save.autosave，进世界调用一次）：① 立即落档+每 60s；
      ② 关键事件 levelup/quest_done/enter_region/chest_open/BOSS 击杀（openChest 新发 chest_open）；
      ③ 生命周期 visibilitychange(切后台)/pagehide/beforeunload——Android WebView 划掉任务只有
      visibilitychange 可靠；flush() 仅 scene==='game' 落档、监听绑一次防重复订阅
- [x] 15.2 **读档续玩**：showMenu 查 hasSave(1)——有档 #mm-start 变「继续游戏」+新增 #mm-new
      「新游戏」（无档保持「开始游戏」，id 不变兼容旧测试）；beginGame 单人且 consumeContinue()
      （意向单次消费，联机入口清零防误带档）→ bootWorld(saved) 按档种子重建、跳过角色创建/营地出生、
      buildChests 后 apply 整表恢复、_lastRegion=null 首帧重刷区域敌人与 BGM
- [x] 15.3 **存档内容与恢复修正**：snapshot 增 mode+chests（宝箱含已开标记，防重开无限开箱刷物品）；
      apply 重算 expTo=player.expNeed(level)（原先读档后 100 起算导致连升）、背包定长覆写清残留、
      hp 按新上限截断、P.spawnedHpInit=true 防首帧满血覆盖、倒地/寻路态清零；旧存档缺新字段有缺省兜底
- [x] 15.4 **测试**：新增 t4.js 存档 E2E（9 断言：无档菜单/新游戏创建/事件存档/pagehide 存档/
      手动读档/继续菜单/状态一致恢复/新游戏覆盖/0 错误）；t1/t3 补「开跑清档重载」——进世界即自动存档
      会让默认上下文跨跑残留 legend_save_1 使菜单变继续游戏、#cc-ok 超时；t1/t2/t3/t4 回归全绿
- [x] 15.5 文档同步：api.md（7.8 Save 接口/事件总线 chest_open/Engine 存档入口）、README 存档特色行

## 阶段十六：Android APK 命令行出包全链打通 ★ 2026-10-14 完成

> 恢复被打断的打包主线：纯命令行（不依赖 Android Studio）出签名 Release 包

- [x] 16.1 工具链定案：Gradle 9.5.1（wrapper，腾讯镜像）+ AGP 8.13.0（Capacitor 7 锁定）；
      先试系统 JDK 26 → 撞死（见 16.2③）→ 换 **Temurin 21**（清华 TUNA Adoptium 镜像 zip 195MB，
      `jar xf` 解压至 `C:\Users\L1896\tools\jdk21\`，不进 PATH），`org.gradle.java.home` 指定后一次通过
- [x] 16.2 三个环境坑修复：
      ① `dl.google.com` 超时 → `~/.gradle/init.d/mirror.gradle` 注入阿里云四镜像并**真正前置**
      （普通仓库「快照既有→清空→镜像→还原」；buildscript 侧直接追加即可）；
      ② `local.properties` 单反斜杠被 Properties 转义吞掉 → SdkLocator Win32 error 123 → 改正斜杠；
      ③ JDK 26 jlink 报「java.base 中找不到工作版本签名」→ AGP 已知 bug「JdkImageTransform failure
      with JDK 26」（Google Issue #486844145，AGP 9.2.0 才修复），**无开关可绕** → 16.1 的 JDK 21 解
- [x] 16.3 签名与出包：`android/keystore/legend-release.jks`（alias `legend`、密码 `legend2026`、
      RSA2048/10000天）挂 `app/build.gradle → signingConfigs.release`；
      `assembleDebug` 1m15s、`assembleRelease` 1m57s 均 BUILD SUCCESSFUL
- [x] 16.4 产物验证（aapt2 dump badging）：`package com.legend.game v1.0` /
      `application-label 'LEGEND'` / `minSdkVersion '23'` / `targetSdkVersion '35'` /
      `INTERNET` 权限；归档 `dist/LEGEND-v1.0-release.apk`（3.5MB）与 `dist/LEGEND-v1.0-debug.apk`（4.4MB）
- [x] 16.5 文档实况化：README「📦 打包发布」整章重写（原 webDir:"."/minSdk21/兼容Android5 已过时）、
      api.md §10 打包与运行、`capacitor.config.json` 对齐 minSdk23/targetSdk35、
      `.gitignore` 加 `/dist/`（产物重构建即得，不入库）
- [ ] 16.6 真机安装验收（本机 SDK 只有 build-tools/platform-tools，无模拟器与系统镜像）：
      安装 → 启动 → 触屏操作 → 存档读写 → 断网可玩 → 局域网联机（走阶段九 9.4 清单）

## 阶段十七：手机实测触屏双 bug + 武器基础射程接入 ★ 2026-10-14 完成

> 用户真机反馈：「使用遥感，点击其他按钮直接人物停止不动，地图无法传送」；另拍板武器基础射程接入 calcStats（"是"）

- [x] 17.1 **摇杆点按钮人物卡死**（`core/input.js`）：`touchstart` 见 `touches===2` 无条件清空
      `joy+pending` 且本手势内无法重建 → 摇杆进行中或第二指命中 HUD 按钮（`hitButton`）判非捏合、
      保持不动；真捏合才启动 `pinchStart` 并经 `pinchSaved` 挂起 `pending`，捏合结束若该指仍按住则恢复
- [x] 17.2 **地图无法传送**（`game/ui.js renderMap`）：地图画布 `touchstart.preventDefault()` 吞掉
      合成 click → `cv.onclick` 触屏永不触发 → 抽 `tryTeleport(sx,sy)` 共用核心，
      触屏改在 `touchend` 判单指轻点（<350ms 且 `!panned`）传送；拖拽/捏合/长按不触发
- [x] 17.3 **横屏矮视口地图被裁**（`css/style.css`，17.2 探针时连带发现）：面板 86vh+`overflow:hidden`
      在 390 高视口把画布底部裁掉 108px，裁剪区外触点命中底层游戏画布 → `@media (max-height:560px)`
      面板放宽 96vh、`#bigmap` 按 `calc(96vh-140px)` 收敛（画布尺寸定义归 CSS，ui.js 只管绘制）
- [x] 17.4 **武器基础射程接入 calcStats**（`core/config.js`/`game/loot.js`/`game/ui.js`/`game/inventory.js`）：
      掉落与初始武器 `stats.range = Config.WEAPONS.range + 品质词条`（弓7.0/弩8.0/杖6.0/近战1.6~2.2）→
      `calcStats` 装备环**覆盖式**取主手武器值（空手保留基础1）× 羁绊 `rangeMul`；
      退役全局 `PLAYER_RANGE_MULT(2)`（旧"固定1格×2"平衡随真实射程退役）
- [x] 17.5 测试：新增 `t5.js`（6 断言：摇杆点按钮存活/续走、地图轻点传送、拖拽/长按不误传、零报错）
      + t1~t4 回归全绿（t1 射程断言 2→1.6、增 `dropRangeOk` 掉落射程≥武器基础）
- [x] 17.6 实现坑复盘：① 二维分支引用循环外 `p` → `ReferenceError`（判定挪到循环外用 `started` 记录落指）；
      ② CDP `dispatchTouchEvent` 部分抬指语义有歧义 → 多指序列改页面内合成 `TouchEvent`
      （`changedTouches` 精确可控=真机形状）；③ `calcStats` 基础1与武器值双重计入 → 装备环覆盖式
- [ ] 17.7 真机回归验收（并入 16.6 清单）：摇杆+点按钮、地图点按传送、横屏地图完整可见、弓/杖射程手感

## 阶段十八：地图寻路与观感优化 ★ 2026-10-14 完成

> 用户反馈原话："地图路线应该类似一个圈，高低不明显，玩家容易走散"

- [x] 18.1 **环形主干道**（`world/terrain.js buildRoads`）：按 `REGIONS` 数组顺序（=等级推进顺序）
      营地→边境长城→…→终末之战串成闭合环线，末段回接营地收口；旧"营地→各区放射直线"
      （星型无回路）退役——沿环走总能回到出发点，联机有统一巡线
- [x] 18.2 **高低对比加强**：主视口 `groundTile` 层级提亮 0.065→0.11、顶边落影/亮棱 0.16/0.12→0.22；
      大地图/小地图烘焙台地 ×1.14→×1.28、高山 ×0.62→×0.52（t6 量化断言 h1>h0×1.10、h2<h0×0.75，
      实测 292/228 台地、119/228 高山）
- [x] 18.3 **队友地图标点**（"容易走散"直接解）：`Net.peers` 大地图动态层（青点 6px+名字）+
      小地图（4px 青点）逐个绘制，`#6cf` 与世界内名字同色；单机无 peers 零开销
- [x] 18.4 测试：新增 `t6.js`（5 断言：环线 11 段中点=道路/水面、内陆锚点段必须为路、
      烘焙对比度×2、队友标点像素命中、零报错）；t3 迷宫 A1 断言改写（星型路退役后
      "营地→迷宫直线全可走"语义失效 → farm→maze 环线段 184 采样可走 + A* 可达）；t1~t6 全绿
- [ ] 18.5 真机走环验收（并入 16.6）：沿环巡逻一圈全程可达、横屏高低观感、双开联机看队友点

## 阶段十九：更新日志与自动更新 ★ 2026-10-14 完成

> 用户需求："最好有游戏更新日志（每次会话算至少一次）和自动更新游戏"

- [x] 19.1 **CHANGELOG.md**（仓库根）：版本号唯一来源，回填 v1.0.0（阶段一~十七初版）/v1.1.0（阶段十八），
      本次起每次开发会话至少一条（README 二次开发守则第 6 条固化）
- [x] 19.2 **游戏内更新日志**：设置页新增「更新日志」按钮（`#s-log`）→ `UI.renderChangelog()` 子页
      （版本+日期+要点列表、底部当前版本）；数据源 `js/generated/changelog.js`（`LG.CHANGELOG`，
      sync 从 CHANGELOG.md 生成，折行条目自动合并）
- [x] 19.3 **网页版自动更新**：`core/updater.js`（`LG.Updater`）——启动 1.5s + 每 10 分钟无缓存检测
      `version.json`；主菜单发现新版自动重载（`?vup=` 冲刷 index.html；`sessionStorage` 单次防循环，
      坏部署只重载一次再走 confirm 手动确认）；游戏进行中不打断；file:///断网/未部署静默跳过。
      APK 内置资源恒同版永不触发（断网可玩优先，APK 更新仍为重装包）
- [x] 19.4 **构建链**（tools/build-www.mjs）：CHANGELOG 解析 → `js/generated/changelog.js` +
      `www/version.json`（仓库根同名文件 gitignore，避免开发服 fetch 404 控制台噪音）+
      `www/index.html` 资源 `?v=<www 内容哈希>` 冲刷（部署新版后浏览器必然拉新资源）
- [x] 19.5 版本号 1.0→1.2（versionCode 1→2，dist 产物 `LEGEND-v1.2-*.apk`）；测试新增 `t7.js`
      （数据链闭环/设置页入口/自动重载+防循环模拟，4 断言）；t1~t7 全绿
- [ ] 19.6 真机/部署验收（并入 16.6）：网页托管部署后改 CHANGELOG 版本号重发，打开页面应自动更新；
      设置页「更新日志」在楷体/无楷体下排版正常

## 阶段二十：背包详情卡/武器前缀/一键分解/字体大小 ★ 2026-10-15 完成

> 用户反馈："还有就是不能查看装备武器详情，装备和强化按钮找不到（在背包界面底部），最好每一个
> 武器都有前缀名字（系统随机就行了），字体放大3倍，添加字体大小和一键分解功能"
> + 追加"地图的字体要放大"、"手机版字体太大，UI太大"

- [x] 20.1 **物品详情卡**：`UI.itemDetail(it, src)` / `itemTitle()`——标题「前缀·基础名」+品质/等级+
      数值行（武器：攻击·攻速·射程·暴击；防具：防御·攻击·移速·闪避）+羁绊+按钮组（装备|卸下、强化、出售）；
      卡片为 `.pbody` 直下子元素 `position:sticky` 吸底常驻（留在 `.bag-right` flex 子项内时 sticky
      无吸底空间、滚动画出视口——t8 stickyOk 实测踩中后改位）；行囊格与已装备槽点击均进详情卡；
      **已装备槽不再一点即卸**（卸下移入卡内按钮，防误操作）
- [x] 20.2 **武器随机前缀**：`Config.WEAPON_PREFIXES` 16 词对（中英）；`loot.rollWeapon` 生成时随机挂
      `prefix:{zh,en}`，防具无前缀（显示槽位名）；随存档序列化
- [x] 20.3 **一键分解**：`Inv.dismantleAll()` → `{count, silver}` 按售价表折银（新增 `priceOf` 与出售
      共用）；背包 `.bag-cap` 左计数右按钮，**两段式确认**（首点变"确认分解？"3 秒内再点执行，防误触）
- [x] 20.4 **字体大小**：`UI.applyFontScale(v, userSet?)` → `--fs-inv` + `#overlay > *` 的 zoom
      （子元素挂法实测面板仍居中），视口类尺寸 14 处反比补偿；设置页 `#s-font` 滑杆 1~3 步进 0.5 即时生效；
      **默认 1×**（`fontScaleUser` 标记，动过滑杆保留用户选择，旧 3×/1.5× 落库值无标记回落）；
      大地图区域名/队友名字号 = 基础字号（15/13px，反馈"地图的显示地面字体大一[点]"，原 11/10）× 当前倍率
- [x] 20.5 **修复**：`enhance` 改传物品对象——旧传 `_id` 与背包下标撞号，行囊有空位时会误强化同编号
      的已装备物品（数字参数兼容保留）
- [x] 20.6 版本 1.2→1.3（versionCode 2→3，dist `LEGEND-v1.3-*.apk`）；测试新增 `t8.js`（8 断言组）；
      t2 menuFit 改滚动可达式（fs 下菜单由 pbody 滚动承接）、t3 画布交互点改左上三分位、
      t5 传送目标改顶部安全带搜索（CDP 坐标 ×1.1 + fs3 出屏）、t6 对比采样期临时 1×
      （33px 区域名字形污染亮度采样 617=#e8d9a8）——**t1~t8 全绿零报错**
- [ ] 20.7 真机验收（并入 16.6）：默认 1× 观感与滑杆手感、详情卡吸底与强化入口可达、
      一键分解两段确认、大地图区域名字号可读性（15px 基础）

## 已修复的关键缺陷（测试记录 2026-10-14 · 阶段十二）

- **关掉设置后卡死**：menu 场景关闭设置/大厅面板后场景停在 menu 但无任何入口 → closePanel 场景感知回弹主菜单
- **背包网格塌成 1 列**：40 格竖排 86vh 长条 → grid auto-fill 在 shrink-to-fit 面板按 max-content 只算 1 列 → .panel-bag 显式宽度
- **DPR≥2 时 HUD 右侧元素隐形**：drawHUD 用 canvas.width（物理像素）而变换已是 CSS 像素 → 改 window.innerWidth/Height
- **`.panel .btn.primary` 选择器被抢**：性别选中态误用 .primary 类导致测试/调用方点错按钮 → 独立 .btn.on 语义
- **大厅"在线玩家"标签左对齐**：类化时丢了 inline 居中 → .lobby-cap 补 text-align:center

## 已修复的关键缺陷（测试记录 2026-10-14 · 阶段十一）
- **"人物感觉是镜像的"**：精灵只画左半→镜像生成（100% 轴对称假脸）+ 只有水平翻转无朝向（向上走也是正面脸）→ 4 朝向视图（正/背/侧）
- **隐形空气墙**：height=2 高山在渲染层零表现 → 挤出崖壁可视化；迷宫墙从黑平面块变成挤出城墙
- **背包按 B 关不掉**：`renderBag` 只开不关无 toggle → `togglePage` 同页再按关闭（B/M/L/触屏四入口）
- **向导 NPC 站墙上**：区域中心+5 可能落在迷宫墙（h=2 不可走）→ `nearestWalkable` 吸附（10/10 验证）
- **投影不可见**：blobShadow 椭圆（0.3×size）比躯干窄，整只藏精灵后面 → 0.4×size + 下移越过双脚
- **h1 台地过稀**（阈值0.67 仅3.9%）→ 放低到 0.63（升至6.9%），层级感不足

## 已修复的关键缺陷（测试记录 2026-10-14）
- lobby.js show 未挂载到 LG.Lobby
- player.js 未公开 stats/path getter（combat 每帧崩溃）
- 场景在地形生成前切入 game（regionOf 空引用崩溃）
- LG.Config.SIZE 未定义（地形全黑不渲染）+ 相机缺少每帧 follow
- RTCSessionDescription 不可被 BroadcastChannel 克隆（联机信令 DataCloneError）
- 信令 offer 不重发（后加入者收不到）；房主缺"开始游戏"按钮
- CSS 亮度滤镜改为仅≠1时注入（低端机省每帧合成开销）；favicon 404

## 已修复的关键缺陷（测试记录 2026-10-14 · 阶段十）
- **点击 NPC 没反应**：`open_quests` 事件从未绑定（任务NPC白走）+ `open_tutorial` 拼写不一致（ui 绑了 open_tutorials）
- **点击远处目标无响应**：超出3格直接静默无事发生 → 改为寻路+到达自动交互
- **触屏按钮全失效**：click 被 handleHotkeys 提前消费，drawTouchButtons 读不到 → 命中检测前移
- **短点按丢失**：一次性动作靠每帧轮询按键状态，低帧率下短于一帧的点按被吞 → 事件驱动 pressed[] 队列
- **角色渲染成"双胞胎"**：镜像矩阵第7列（中轴）透明，镜像后中缝2px被描边描黑 → 矩阵重写（勿回归，见 assets.js 头注释）
- **触屏摇杆/按钮不显示**：渲染用 `ontouchstart` 门控，部分设备无此属性 → 改 isTouchUI（pointer: coarse）+ 摇杆按下即绘
