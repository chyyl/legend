# LEGEND 接口文档（docs/api.md）

> 本文件是各模块的对外契约。**修改任何模块内部实现时，不得改变这里的签名**；
> 新增能力请新建模块并在此登记。所有模块挂在 `window.LG` 命名空间下，
> 彼此通过公开接口或事件总线 `LG.U.bus` 通信，互不直接引用内部实现。

---

## 0. 全局约定

| 约定 | 说明 |
|---|---|
| 坐标系 | 世界坐标单位为「格」（1格=32px），左上角为 (0,0)，向右为 +x，向下为 +y |
| 时间 | 所有 `dt` 单位秒；`performance.now()/1000` 为全局时钟 |
| 品质色 | N/D灰 R/C蓝 SR/B紫 SSR/A橙 S/SS红（CSS 类 `.q-<品质>`） |
| 事件总线 | `LG.U.bus.on(evt, fn)` / `.emit(evt, data)`，见 §9 事件表 |
| 文案 | 全部经 `LG.I18n.get(key)` / `T()('key')`，新增键必须同时登记 `js/data/i18n.js`（zh/en）；近期新增：`start_game quest_available quest_none guide_none guide_ready guide_dist` |

加载顺序（index.html 中固定）：
`i18n → config → utils → assets → input → audio → terrain → pathfinding → camera → loot → inventory → player → enemy → combat → quest → npc → save → ui → net → lobby → engine → main`

---

## 1. LG.Config（js/core/config.js）— 数值唯一可信源

| 成员 | 签名/类型 | 说明 |
|---|---|---|
| `TILE` | `32` | 瓦片像素 |
| `WORLD` / `SIZE` | `2000` | 世界边长（格） |
| `REGIONS` | `Region[]` | 10+1 区域：`{id, zh, en, cx, cy, dir, biome, lv, boss}` |
| `DIFFICULTY` | `{min,max,default, scale(d), density(d), drop(d), currency(d)}` | Q33 连续滑块 0~2，默认 0.9 |
| `QUALITY_W` / `QUALITY_A` | 品质表 | 武器 N/R/SR/SSR、装备 D~SS，含概率 `p`、羁绊数 `bonds:[min,max]` |
| `WEAPONS` | 武器定义 | `{id, kind:'melee'\|'ranged'\|'magic'\|'shield', zh, en, base, range, aspd, arc?, proj?, aoe?}` |
| `WEAPON_PREFIXES` | 武器前缀词池（阶段二十） | `{zh, en}[]` 16 词；`loot.rollWeapon` 随机取一挂到实例 `prefix`，展示为「前缀·基础名」，防具无前缀 |
| `ARMOR_SLOTS` | `['helm','chest','legs','boots']` 对象化 | 四装备槽 |
| `BONDS` | 羁绊8种 | `{id, zh, en, desc_zh, desc_en, apply(stats)}`，等概率随机、同类不叠加 |
| `ENEMY_TYPES` | 敌人类型 | 人类军队：`{id, zh, move:'fixed'\|'slow', hp, dmg, range, aspd, speed, aggro, elite, proj?, aoe?}` |
| `LORE` | 世界观 | `{zh, en}` 长文，用于开场与占卜师对话 |
| `dropQuality(table, difficulty, bonusP)` | → 品质项 | Q34 难度加成放大高品质概率 |
| `enemyStat(type, difficulty, regionLv)` | → `{hp,dmg,speed,...}` | Q75 难度不改移速 |
| `silverExp(enemyLv, kind, difficulty, expMul)` | → `{silver, exp}` | 文档公式：敌等级×10×r×难度；r=0.3/2/4 |
| `regionAt(x, y)` | → Region | 就近区域查询 |
| `ENEMY_DMG_MULT` | `0.1` | 数值调整：敌人伤害=原来的10%（在 `Player.takeDamage` 入口统一乘算，格挡/闪避在其后结算） |
| `PLAYER_RANGE_MULT` | ~~2~~ **已退役（阶段十七）** | 射程改为武器基础值接入：`Config.WEAPONS.range`（弓7.0/弩8.0/杖6.0/近战1.6~2.2）→ 掉落/初始武器 `stats.range` → `calcStats` 直接取主手武器值（品质词条在其上加成、羁绊 `rangeMul` 乘算，空手=1） |

## 2. LG.U（js/core/utils.js）

| 接口 | 说明 |
|---|---|
| `rng(seed)` | mulberry32 种子随机（世界生成可复现，Q59） |
| `randInt(a,b)` / `pick(arr)` / `range([a,b])` / `clamp` / `lerp` / `dist` | 数学工具 |
| `LS.get(k,def)` / `LS.set(k,v)` / `LS.del(k)` | 存储封装（无 localStorage 时降级内存） |
| `bus.on/off/emit` | 事件总线 |

## 3. LG.Assets（js/core/assets.js）— 程序化像素图

`tile(name)` `groundTile(type,level,cliffS,northDelta)` `hero(opts,dir)` `enemy(type,dir)` `boss(id,color)`
`weaponIcon(id)` `armorIcon(slot,color)` `bondIcon(id)` `chest()` —— 均返回缓存的离屏 canvas（32×32，BOSS 64×64）。

- **4 朝向精灵**：`dir = 's'正面 | 'n'背面（后脑勺全发） | 'e'侧面（16列全宽非对称矩阵）`；`'w'` 由引擎水平翻转 `'e'` 生成（不重复缓存）。玩家/敌人/NPC 共用骨架；BOSS 保持正面。
- **groundTile 2.5D 挤出烘焙**（缓存键 `gt:type:level:cliffS:northDelta`，渲染仅一次 drawImage）：
  `level` 层级提亮（白膜 0.11×level，2026-10-14 反馈"高低不明显"由 0.065 加强）、`cliffS>0` 画南向崖壁带（暗面+岩缝+顶缘受光棱，每级7px 封顶2级）、
  `northDelta>0` 顶边落影（0.22）/ `<0` 顶边亮棱（0.22）、水面蓝膜烘焙。崖壁画在高层瓦片自身底边内（单瓦片内完成，无跨瓦片遮挡）。

## 4. LG.Input（js/core/input.js）

| 接口 | 说明 |
|---|---|
| `init(canvas)` | 绑定鼠标/触屏/键盘/手柄；左半屏触摸=待定指针（轻点=点击寻路，拖动>8px=虚拟摇杆），右半=点击；hover→`state.hover` |
| `updateMoveVec()` | 每帧调用，合并 键盘>手柄左摇杆/十字键>虚拟摇杆 → `state.moveVec` |
| `state` | `{click, hover, moveVec, keys, pressed[], joy, pinch, wheel, padMove, padHit}` |
| `consumeClick()/consumePinch()/consumeWheel()` | 消费一次性输入（hover 位置直接读 `state.hover`） |
| `takePress(code)` | 消费一次点按（keydown 即入 `pressed[]` 队列；短于一帧的点按不丢失） |
| `padAction(action)` | 手柄按键边沿触发：`interact/block/jump/potion/mode/attack/bag/map` |
| `touchButtons()` | 触屏 HUD 按钮几何 `[{id,x,y,r}]`（engine 命中检测+绘制共用，所见即所点） |
| `hitButton(p)` | 命中检测（触屏按钮优先于点击移动） |
| `down(action)` / `keyFor(a)` / `setKey(a,code)` | Q57 按键自定义（存 LS `keymap`，与默认值合并兼容旧存档）；action 含 `menu`（默认 `Escape`）→ `UI.escMenu()` |

手柄标准映射（`PAD`）：左摇杆/十字键移动，A=交互 B=格挡 X=跳跃 Y=药水 LB=切换攻击模式 RT/RB=攻击 Start=背包。

触屏多指语义（2026-10-14 阶段十七，修复"摇杆时点按钮人物卡死"）：`touchstart` 落下第二指时，
若**摇杆进行中**（`state.joy`）或第二指命中 HUD 按钮（`hitButton`）→ 判定非捏合意图，
摇杆/待定指针保持不动；仅真双指捏合才启动 `pinchStart` 并挂起 `pending`（`pinchSaved`），
捏合结束若该指仍按住则恢复 `pending`，继续拖动即可升级摇杆。此前实现见第二指即清空
`joy+pending` 且本手势内无法重建 → 人物永久卡住。

## 5. LG.Terrain（js/world/terrain.js）

| 接口 | 说明 |
|---|---|
| `generate(seed)` | 手工框架+局部随机；含岛屿海岸线、台地高差（低频噪声 nHill：>0.73→2高山 / >0.63→1台地）、区域中心半径8清平、**先迷宫后道路**（`buildMaze(seed)`→`buildRoads`：道路后铺才能打进迷宫、贯通出入口并清平中心，顺序反了会把道路覆盖成密封墙盒）、成段矮台；**环形主干道**（2026-10-14 反馈"路线应类似一个圈"：按 `REGIONS` 数组顺序=等级推进顺序把相邻区域串成闭合环线，末段终末之战回接营地收口；旧实现为营地→各区放射直线，星型无回路易走散） |
| `tileAt(x,y)` | `{type, height, water, walk, jump, wall}` |
| `heightAt(x,y)` | 原始层级 0/1/2（渲染热路径专用，不建对象；出界按0，世界边缘不画崖） |
| `walkable(x,y)` / `jumpable(x,y)` / `isWater(x,y)` | 通行判定（水与墙阻挡，height=1 可跳，height=2 不可走） |
| `freeTile(x,y)` / `boxPenalty(x,y)` / `passableBox(x,y)` | 碰撞专用（零分配）：`boxPenalty` 返回 0可走/1矮障跳过/2不可走（按脚印四角内缩0.02 判形位，容许贴墙走）；`passableBox`=boxPenalty 0。player 轴分离与 enemy.stepTo 共用 |
| `raw()` | → `{tiles, height}` 原始数组引用（大地图/小地图烘焙 `UI.bakeTerrainMap`、测试改地形用） |
| `regionOf(x,y)` | 区域归属 |
| `fog.reveal(x,y)` / `fog.visible(x,y)` | Q17 迷宫战争迷雾；`reveal` 由 player.update **每帧**调用（含传送落点/静止站立，radius6 即时光圈；原先只在移动分支内调，传送进迷宫落点全黑、6格内敌人隐身挨打） |
| `TYPE` | 瓦片枚举 |

## 6. LG.Path / LG.Camera

- `LG.Path.find(sx,sy,tx,ty,maxSteps)` → `[{x,y}]`（A*，允许跳格通行，超限返回直线引导）
- `LG.Path.nearestWalkable(x,y,radius)` → `{x,y}|null`
- `LG.Camera.init(canvas)` `follow(x,y)` `update()`（消费缩放输入）`setZoom/zoomBy`
  `worldToScreen(x,y)` `screenToWorld(x,y)` `view()` → `{x0,y0,x1,y1}` `zoomVal`

## 7. 玩法模块

### 7.1 LG.Loot（js/game/loot.js）
- `rollWeapon(difficulty, regionLv, bonusP)` / `rollArmor(...)` → 装备实例
  实例：`{slot, weaponId?|armorSlot?, kind?, quality, lv, stats:{dmg,aspd,range,crit|def,spd,dodge}, bonds:[id], _id}`
  武器另带 `prefix:{zh,en}`（阶段二十：生成时从 `Config.WEAPON_PREFIXES` 随机前缀，随存档序列化；防具无前缀）
- `dropFromEnemy(kind,difficulty,regionLv)` → `{silver, exp, items[]}`（普通12%/精英45%/BOSS必掉+保底高品质）
- `openChest(difficulty,regionLv)` → 同上（品质加成 ×1.5）

### 7.2 LG.Inv（js/game/inventory.js）
- `bag`（40格数组） `equip`（weapon+四槽） `silver`
- `add(item)` → bool；`equipItem(i)`（换下旧装备）/ `unequip(slot)` 
- `enhance(ref)`（Q35 银币强化，每级+5%，上限10）：**首选传物品对象**——阶段二十修复：旧版传 `_id`
  会与背包下标撞号，行囊有空位时误强化同编号的已装备物品；数字参数（下标/编号）兼容保留
- `sell(i)` → 银币；`priceOf(it)` → 品质售价×等级（出售/一键分解共用折银表）；
  `dismantleAll()` → `{count, silver}`（阶段二十"一键分解"：分解行囊全部物品、已装备槽不受影响）；`activeBonds()` → 去重羁绊（Q29）；`calcStats()` → 综合属性（基础+装备+羁绊归一化）；
  **射程**（阶段十七）= 主手武器 `stats.range`（`Config.WEAPONS` 基础值+品质词条，覆盖空手基础1）× 羁绊 `rangeMul`

### 7.3 LG.Player（js/game/player.js）
- 只读属性：`x,y,level,exp,expTo,hp,maxHp,potions,mode,down,facing,jumping,blockUntil,dir`
- `dir`：渲染朝向 `'s'|'n'|'e'|'w'`（移动主轴自动更新，斜向取绝对值大轴；`facing` 仅保留水平语义）
- `spawn(x,y)` `update(dt)` `moveTo(x,y)`（A*寻路） `setMode('on'|'off'|'half')`（Q19 half=原地打不追击）
- `gainExp(n)`（Q31 满级溢出转银币20%） `takeDamage(n)`（**入口即乘 `ENEMY_DMG_MULT=0.1`**——敌人近战/弹道/范围技全部经此；其后依次格挡减伤50%、闪避、`def×0.1`、下限1点）
- `heal(n)` `usePotion()`（Q62） `block()`（Q23 减伤50%/2s/CD3s） `jump()`（Q21 伪跳跃）
- `rescue()` / `revive()`（Q26/Q66 掉10%银币回营地）；`_raw` 供存档访问内部状态

### 7.4 LG.Enemy（js/game/enemy.js）
- `setDifficulty(d)` `spawnRegion(region)`（Q63 密度×难度） `spawnBoss(region)`（可重复 Q65）
- `update(dt)`（fixed=弹幕、slow=警戒5格追击/脱战回家 Q74、精英/BOSS技能循环）
- `damage(e,n,flags)` `list[]` `clear()`；`flags={crit,tri}` 透传给 `enemy_hit` 供飘字分级（缺省=普通白字）

### 7.5 LG.Combat（js/game/combat.js）
- `init()` 订阅战斗事件；`update(dt)` 推进弹道+特效+玩家自动攻击
- `forceSwing()` 手动攻击（J键/手柄RT）：无视"攻击模式关"，9格内有敌则索敌出击，否则朝面向空挥
- `projectiles[]` `effects[]`（text/slash/warn/aoe，Q25 轻量反馈）
- 飘字分级（P0）：`enemy_hit` 按 flags 决定 text 特效 `size/color/life` —— 普通 14/#fff、暴击 18/#ffd777、三倍暴击 24/#ff7a3c；近战/魔法传 `{crit,tri}`，远程弹道把整颗 `p`（创建时记录 crit/tri）传给 `Enemy.damage`

### 7.6 LG.Quest（js/game/quest.js）
- `init()` 构建主线（各区域BOSS讨伐链）+支线（击杀/探索/收集/护送 Q39/Q40）
- `accept(id)` `submit(id)`（Q43 固定+概率装备） `progress(type,key,n)` `checkExplore(x,y)`
- `all[]` `active[]` `rebuild()`

### 7.7 LG.NPC（js/game/npc.js）
- `spawnAll()` 营地6功能NPC+各区1向导（Q42）；`nearby(x,y)` `interact(npc)`（经bus通知ui开面板）
- bus 事件：`open_quests`（任务）`open_shop`（商店）`open_enhance`（强化）`open_dialog`（剧情）`open_tutorial`（教官）
- `list[]` `update(dt)`；NPC 外观由 id 哈希稳定生成（性别/发型/发色/手持，engine.npcLook）

### 7.8 LG.Save（js/game/save.js）
- `save(slot)` `load(slot)` `listSlots()` `remove(slot)` `exportSlot/importSlot`
- `raw(slot)` 读档原文（不重建世界，beginGame 判定用）；`apply(d)` 状态恢复——
  假定世界已按 `d.seed` 生成且 Quest.init/NPC/Enemy 就位，恢复位置/等级/背包/任务/难度/
  宝箱整表替换；`expTo` 不入档按 `player.expNeed(level)` 重算，旧存档缺 `mode/chests` 字段有缺省兜底
- `snapshot()` 存 `{seed, ts, difficulty, player, mode, inv, quest, chests}`（Q59 种子+增量）
- `autosave()`（阶段十五，bootWorld 调用一次）**三类自动存档触发器**：
  ① 进世界立即落档 + 每 60s 定时；② 关键事件 `levelup`/`quest_done`/`enter_region`/
  `chest_open`/BOSS 击杀；③ 页面生命周期 `visibilitychange`(切后台)/`pagehide`/`beforeunload`
  ——Android WebView 划掉任务不保证触发 beforeunload，visibilitychange 是手机端主力；
  全部经 `flush()` 仅在 `scene==='game'` 落档，事件监听绑一次防 bootWorld 重复订阅
- `hasSave(slot)` 主菜单判定；`setContinue(v)/consumeContinue()` "继续游戏"意向（单次消费，
  联机大厅入口先清零防误带档）
- 自动读取链路：主菜单 `#mm-start`（有档时文案="继续游戏"，id 不变）→ `beginGame(ev)`
  单人且意向置位 → `bootWorld(saved)` 跳过角色创建按档续玩；`#mm-new`("新游戏")清意向
  重走创建并覆盖槽1；迷雾不入档（重进重探）
- 中途读档（设置页 `#s-load`）走 `load(slot)`：重建世界 + apply + 敌人/NPC 刷新 + `_lastRegion` 清空

### 7.9 LG.UI（js/game/ui.js）
- `init(canvas)` `drawHUD()` `toast(msg)` `panel(title,html)` `closePanel()`
- `togglePage(pageId, render)` —— 按键开关面板：同页再按=关闭（B/M/L 与触屏按钮走此入口；NPC 打开的面板不受影响）
- **panel/closePanel 场景语义（阶段十二）**：`panel()` 内部开面板不算"用户关闭"（`_opening` 标志）；
  用户在 menu 场景关掉最后一个面板（✕/语言切换/读档）时 `closePanel()` 自动回弹主菜单（`Engine.openMenu`），
  避免场景停在 menu 却无任何入口；game 场景关闭即回游戏，无回弹。
- `drawHUD()` 阶段十二重绘为雕纹铭牌风：四角金铆钉状态板（等级章/十段刻度血条/鎏金经验条/银币药水图标）、
  右上攻击模式徽章（绿/金/灰宝石=开/半/关）、BOSS 金框血条（**触屏横屏 W>H 时置顶居中 bby=34**，
  防固定 H-210 在矮屏落到屏幕中部切过 BOSS 本体；竖屏 H-210、桌面 H-62 保持底部）；坐标一律 CSS 像素（DPR≥2 下 canvas.width 会错位）
- 五页：`renderBag() renderStats() renderQuests() renderMap() renderSettings()`（Q50，前三个 return 面板对象供 toggle 识别）
- `renderBag()` 结构（阶段二十重做）：`.panel-bag` 显式宽度（grid auto-fill 在 shrink-to-fit 下会塌成 1 列）+
  `.eq-col` 装备列带 `.slot-tag` 槽位标签（点击=**查看详情**，不再一点即卸）+ `.bag-grid` 40 格（`.bag-cap` 顶部
  左计数右「一键分解」）+ `.item-card` 详情卡——**卡片为 `.pbody` 直下子元素**（若留在 `.bag-right` flex 子项内
  则 sticky 无吸底空间、滚动即被裁走），吸底常驻
- `itemDetail(it, src)` / `itemTitle(it)`（阶段二十）：详情卡内容=「前缀·基础名」标题+品质/等级+数值行
  （武器：攻击·攻速·射程·暴击；防具：防御·攻击·移速·闪避）+羁绊+按钮组（装备|卸下、强化、出售）；
  `src={bag:i}` 或 `{eq:slot}`；`bindDismantle(btn)` 两段式确认（首点变"确认分解？"3 秒内再点执行）
- 字体大小（阶段二十）：`applyFontScale(v, userSet?)` 即时改 `--fs-inv` 与 `#overlay > *` 的 zoom 并落库
  （`fontScale` 1~3；`userSet=true` 落 `fontScaleUser` 标记）；`fontScale` getter 返回当前倍率；
  **分端默认**：触屏手机 1.5×、桌面 3×（反馈"手机版字体太大，UI太大"），动过滑杆则尊重用户选择；
  `renderMap()` 的区域名/队友名字号 = 基础字号 × 当前倍率（反馈"地图的字体要放大"）
- `renderSettings()`：menu 场景打开时追加 `#s-back` 返回按钮（回 `Engine.openMenu`）；
  阶段十九追加 `#s-log`「更新日志」按钮（开 `renderChangelog` 子页）与 `#s-ver` 当前版本行；
  阶段二十追加 `#s-font` 字号滑杆（1~3 步进 0.5，oninput 即时生效）
- `renderChangelog()`（阶段十九）：更新日志页，数据源 `LG.CHANGELOG`（`js/generated/changelog.js`，
  由仓库根 `CHANGELOG.md` 经 `npm run sync` 生成，每次开发会话至少一条）；条目=版本+日期+要点列表，
  底部显示当前版本（`LG.Updater.current()`）；`dataset.page='settings'` 归设置语义关闭
- `charCreate(cb)`（Q51，预览走 `.cc-frame` 展示框、性别按钮 `.btn.on` 选中态） `dialog(npc,lines)` `tutorial()`（Q67 可跳过）
- `hudHit(c)`（P0 阶段十三）→ `'mode'|'settings'|'tracker'|'minimap'|null`：HUD 热区命中，坐标=物理 CSS 像素；
  drawHUD 每帧缓存 `hudRects`，engine 点击分发：mode→切模式、settings→设置页、tracker→任务页、minimap→大地图页
- `escMenu()`（keymap.menu=Escape）：只接管"无面板"与 `dataset.page` 自标的页面面板（bag/stat/quest/map/settings），
  角色创建/商店/对话等模态面板不劫持（交还各自关闭按钮）
- `renderQuests(npc)`：除 active 进度外新增「可接任务」区（按 NPC 区域过滤，排除 escort 与无进度来源任务）——
  修复 `Quest.accept` 此前无任何调用方的死路
- `drawHUD()` 阶段十三：手机 `U=W<760?0.5:(W<1100?0.75:1)` 整体虚拟坐标缩放（`fs()` 字号保底10物理像素）；
  左上铭牌下任务追踪条（可提交优先→active[0]→引导找营地首领；屏内金菱形/屏外边缘箭头+距离）；
  右下小地图（96/128 物理像素，复用 `bakeTerrainMap` 1.2s 重烘焙 + 玩家白点 + **联机队友青点**（2026-10-14 反馈"玩家容易走散"，`Net.peers` 逐个 4px `#6cf`，与世界内名字同色）+ `hudObjective()` 目标金菱形 + 金框）
- `bakeTerrainMap(g,S)`：按 `Terrain.raw()` 逐像素烘焙真实地形（类型色+高差增亮/压暗：台地 ×1.28、高山 ×0.52（原1.14/0.62，反馈"高低不明显"加强）+迷宫未探索压黑），大地图(480)/小地图(128) 共用
- 地图页点击即传送（Q13）；设置含音量/亮度/按键/语言（Q49/Q57）
- `renderMap()` 缩放视图（2026-10-14）：内部态 `mapV={x0,y0,z}`，**z∈[1,8] 跨面板开关持久**；
  滚轮锚点缩放、双指捏合（锚在两指中点）、`－/＋` 按钮（`#bm-out`/`#bm-in`，缩放标签 `#bm-zoom`，
  步进0.5）、指针捕获拖拽平移 + 触屏单指平移（拖拽/捏合超阈值置 `panned` 抑制点击传送）、
  点击传送按当前视图换算世界坐标、打开时玩家不在可见区自动对焦玩家、画布 `touch-action:none`
- 传送核心 `tryTeleport(sx,sy)`（画布显示坐标→世界坐标→`Path.nearestWalkable` 吸附，桌面 `onclick`
  与触屏共用）；**触屏轻点在 `touchend` 判定**（<350ms 且 `!panned`）——`touchstart.preventDefault()`
  吞掉合成 click，`cv.onclick` 在触屏永不触发（2026-10-14 阶段十七修复"地图无法传送"）
- 动态层（每次 `redraw`）：区域名 + **本体红点** + **联机队友青点 `#6cf`+名字**（阶段十八反馈"玩家容易走散"，
  大地图/小地图都能看到彼此位置）+ 缩放标签
- 画布尺寸归 CSS（`#bigmap`，`width:min(480px,100%)`）；**短视口**（`@media (max-height:560px)`，
  横屏手机≈390 高）面板放宽至 96vh、画布按 `calc(96vh-140px)` 收敛——此前 86vh+`overflow:hidden`
  把地图底部裁掉，裁剪区外触点命中的是底层游戏画布（阶段十七一并修复）

## 8. 联机模块

### 8.1 LG.Net（js/net/net.js）
- `isHost` `connected` `difficulty` `roomId` `peers{}`
- `createRoom()` → `Promise<{roomId, code}>`；`join(码或房间号)` → `Promise<应答码>`；
  `acceptAnswer(code)`；`send(obj)`（客户端→房主）；`broadcast(obj)`
- 同浏览器：BroadcastChannel 自动信令；跨设备：完整码复制粘贴；局域网可选 `node tools/lan-signal.js`

### 8.2 LG.Lobby（js/net/lobby.js）
- `show()` 大厅面板（Q52 在线列表+房间+角色形象） `players[]`
- `startSolo()` 单人直开：主菜单「开始游戏」→ 直接建 1 人房开局（不经大厅；反馈⑦"开始游戏与联机大厅在一起"的拆分入口）
- 确认开局 emit `start_game {players, host}`；单人=1人房（Q1）

## 9. LG.Engine（js/core/engine.js）— 装配层

- `start()` 主菜单；`openMenu()` 回主菜单（UI 设置返回键/关闭回弹调用）；`scene` `fps`；`bindNet()`（main.js 调用）；`applyBrightness(v)` 亮度滤镜
- 主菜单（阶段十二）：`.menu-panel` 标题画面结构（金属 LEGEND 立体字/lore/全宽按钮/署名）；
  menu/lobby 场景每帧 `renderAmbience(dt)` 氛围背景（深渊渐变+金晕+70 粒飘升金尘），替代旧纯黑死屏
- 主菜单入口分离（阶段十三·反馈⑦）：「开始游戏」→ `Lobby.startSolo()` 直开单人；「联机大厅」为独立入口；
  keymap.menu=Escape → `UI.escMenu()`（游戏内开关设置）
- 存档入口（阶段十五）：`showMenu` 查 `Save.hasSave(1)`——有档时 `#mm-start` 文案变「继续游戏」
  并追加 `#mm-new`「新游戏」（无档保持原「开始游戏」，按钮 id 不变兼容旧测试）；
  `beginGame(ev)` 单人且 `Save.consumeContinue()` 置位 → `bootWorld(saved)` 读档续玩：
  按档种子生成、跳过营地出生与角色创建、`buildChests()` 后 `Save.apply(saved)` 整表恢复、
  `_lastRegion=null` 由首帧区域检测刷敌/切 BGM；`openChest()` 发 `chest_open` 促发自动存档
- 内部职责：主循环、渲染裁剪、区域BGM切换、BOSS触发、宝箱布置、联机快照10Hz
- 交互链路（handleHotkeys，每帧）：
  1. 点按队列 `takePress` → 键盘动作（E=交互、J=手动攻击、Q/F/空格、B/M/L、Tab、Esc=设置）
  2. `padAction` → 手柄同名动作
  3. 触屏按钮 `hitButton`（仅 `isTouchUI()` 即 pointer:coarse 设备）→ `doTouchButton`
  4. 点击命中 `UI.hudHit(c)` → mode 切模式 / settings 设置 / tracker 任务 / **minimap 大地图**（阶段十三）
  5. 点击命中 NPC/宝箱（1.5格内）→ 范围内直接交互，否则 `moveTo` + `Engine._pending`
  6. 其余 → 移动寻路
- `resolvePending()`（主循环每帧）：走到 `INTERACT_RANGE=2.6`（NPC）/ `CHEST_RANGE=2.2`（宝箱）内自动交互；
  玩家手动移动（WASD/摇杆）即取消；寻路失败（path 空且超距）提示 `unreachable`
- 渲染辅助：`playerLook()` 本机外观+当前武器、`npcLook(n)` NPC 稳定差异化外观、
  悬停金环/红环高亮、`[E] 交互` 头顶提示、虚拟摇杆与触屏按钮绘制
- P0 渲染打磨（阶段十三）：
  - **落点菱形**：地形循环后画 `Player.path` 末项脉冲金菱形（"正要走到哪"）
  - **伪光照 `drawLighting()`**：特效层后以玩家为中心铺径向暗角（maze 0.60 / void 0.66 / castle 0.50 / 其它 0.34）
  - **主题粒子**：`loop()` 每帧 `updateParticles(dt)`，特效层后 `drawParticles()`；42 粒屏幕空间池，
    按 `region.biome` 换主题（plain/farm/coast/maze/rock/snow/castle/void/default → PARTICLE_THEME 色速表）

### 事件总线表（跨模块契约）

| 事件 | 触发方 → 订阅方 | 数据 |
|---|---|---|
| `enemy_melee/enemy_shoot/enemy_skill` | enemy → combat | enemy 实例 |
| `enemy_hit/enemy_dead/enemy_killed` | combat/enemy → loot/quest/ui | `{e,n,flags?}`（flags=`{crit,tri}`）或 enemy |
| `damage/dodge` | player → combat/ui | `{target,amount}` |
| `player_down` | player → ui | player |
| `levelup` | player → ui | lv |
| `quest_ready/quest_done` | quest → ui | quest |
| `open_shop/open_enhance/open_dialog/open_quests` | npc → ui | npc |
| `toast` | 任意 → ui | msg |
| `enter_region` | engine → 外部 | region |
| `chest_open` | engine → save | chest（阶段十五·开宝箱触发自动存档） |
| `start_game` | lobby → engine | `{players,host}` |
| `net_state/net_msg/peer_input` | net → lobby/engine | 协议消息 |
| `lang` | i18n → main | 'zh'\|'en' |

---

### 9.1 LG.Updater（js/core/updater.js）— 网页版自动更新（阶段十九）

- `current()` → 当前版本号（= `LG.CHANGELOG[0].v`，生成文件缺失回退 `'dev'`）
- `check()`：无缓存 `fetch('version.json')`（构建产物，`{v,date}`）；与当前版本一致或
  `file://`/断网/未部署时静默跳过。发现新版：**主菜单场景自动重载**（`?vup=` 冲刷 index.html
  自身缓存，其内资源带构建时内容哈希 `?v=` 必然拉新）；`sessionStorage` 键 `legend_up_at_<ver>`
  单次防循环（坏部署只重载一次，再发现走 `confirm` 手动确认）；游戏进行中不打断，下次进菜单自动生效
- 调用点：`main.js` 启动后 1.5s 检测一次 + 每 10 分钟复检（仅 `scene==='menu'` 生效）
- 部署形态：APK 内置 www 与 version.json 恒同版 → 永不触发（APK 更新仍为重装包）；
  网页部署（任意静态托管 www/）时自动更新生效；开发根目录经 build-www 同步写入的 version.json 与
  部署行为一致（避免 fetch 404 控制台噪音）

## 10. 打包与运行

- **本地运行**：任意静态服务器（`python -m http.server 8080`）或直接双击 `index.html`（file:// 亦可，无 ES-module 依赖）
- **构建链**：`npm run sync`（= `node tools/build-www.mjs` 重建 `www/` + `npx cap sync android`）
  → `cd android && ./gradlew.bat assembleDebug|assembleRelease`（Linux 用 `./gradlew`）
  - `tools/build-www.mjs`（阶段十九扩展）：① 解析仓库根 `CHANGELOG.md`（**版本号唯一来源，
    每次开发会话至少一条**）→ 生成 `js/generated/changelog.js`（游戏内 `LG.CHANGELOG`）；
    ② 写 `www/version.json`（+ 仓库根同名文件，gitignore，供自动更新检测）；
    ③ `www/index.html` 全部资源 URL 追加 `?v=<www 内容哈希>`（部署新版后浏览器必然拉新资源）
  - 产物 `android/app/build/outputs/apk/{debug,release}/`；归档 `dist/LEGEND-v1.2-{release,debug}.apk`
  - **minSdk 23（Android 6+）**以 `android/variables.gradle` 为准（Capacitor 7 底线，Android 5 放弃）；
    `capacitor.config.json` android 块与之对齐
  - **签名**：`android/keystore/legend-release.jks`（alias `legend`/密码 `legend2026`）挂
    `app/build.gradle → signingConfigs.release`，`assembleRelease` 直接出签名包
- **构建环境三件套（缺一即败，详见 README「📦 打包发布」）**：
  1. **JDK 21**：`android/gradle.properties → org.gradle.java.home` 指向本地解压的 Temurin 21
     （`C:/Users/L1896/tools/jdk21/...`，TUNA Adoptium 镜像 zip）。系统 JDK 26 撞 AGP 8.x 已知 bug
     「JdkImageTransform failure with JDK 26」（Google Issue #486844145，AGP 9.2.0 才修复）
  2. **阿里云镜像**：`~/.gradle/init.d/mirror.gradle` 注入 google/central/gradle-plugin/public 四镜像；
     普通仓库须「快照既有→清空→镜像前置→还原既有」（根工程 `allprojects{google()}` 在 root 脚本期
     先于子项目执行，追加会让 google() 抢第一、超时即中止）
  3. **`local.properties` 正斜杠**：`sdk.dir=C:/Users/.../Sdk`（反斜杠被 Properties 转义吞掉 → Win32 123）
- **局域网联机**（可选）：`node tools/lan-signal.js`
