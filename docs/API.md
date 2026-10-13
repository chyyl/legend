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
| `ARMOR_SLOTS` | `['helm','chest','legs','boots']` 对象化 | 四装备槽 |
| `BONDS` | 羁绊8种 | `{id, zh, en, desc_zh, desc_en, apply(stats)}`，等概率随机、同类不叠加 |
| `ENEMY_TYPES` | 敌人类型 | 人类军队：`{id, zh, move:'fixed'\|'slow', hp, dmg, range, aspd, speed, aggro, elite, proj?, aoe?}` |
| `LORE` | 世界观 | `{zh, en}` 长文，用于开场与占卜师对话 |
| `dropQuality(table, difficulty, bonusP)` | → 品质项 | Q34 难度加成放大高品质概率 |
| `enemyStat(type, difficulty, regionLv)` | → `{hp,dmg,speed,...}` | Q75 难度不改移速 |
| `silverExp(enemyLv, kind, difficulty, expMul)` | → `{silver, exp}` | 文档公式：敌等级×10×r×难度；r=0.3/2/4 |
| `regionAt(x, y)` | → Region | 就近区域查询 |

## 2. LG.U（js/core/utils.js）

| 接口 | 说明 |
|---|---|
| `rng(seed)` | mulberry32 种子随机（世界生成可复现，Q59） |
| `randInt(a,b)` / `pick(arr)` / `range([a,b])` / `clamp` / `lerp` / `dist` | 数学工具 |
| `LS.get(k,def)` / `LS.set(k,v)` / `LS.del(k)` | 存储封装（无 localStorage 时降级内存） |
| `bus.on/off/emit` | 事件总线 |

## 3. LG.Assets（js/core/assets.js）— 程序化像素图

`tile(name)` `hero({skin,hair,hairColor,gender})` `enemy(type)` `boss(id,color)`
`weaponIcon(id)` `armorIcon(slot,color)` `bondIcon(id)` `chest()` —— 均返回缓存的离屏 canvas（32×32，BOSS 64×64）。

## 4. LG.Input（js/core/input.js）

| 接口 | 说明 |
|---|---|
| `init(canvas)` | 绑定鼠标/触屏/键盘；左半屏触摸=虚拟摇杆，右半=点击 |
| `state` | `{click, moveVec, keys, joy, pinch, wheel}`（engine 每帧读取） |
| `consumeClick()/consumePinch()/consumeWheel()` | 消费一次性输入 |
| `down(action)` / `keyFor(a)` / `setKey(a,code)` | Q57 按键自定义（存 LS `keymap`） |

## 5. LG.Terrain（js/world/terrain.js）

| 接口 | 说明 |
|---|---|
| `generate(seed)` | 手工框架+局部随机；含岛屿海岸线、区域基底、道路连通、迷宫、栅栏 |
| `tileAt(x,y)` | `{type, height, water, walk, jump, wall}` |
| `walkable(x,y)` / `jumpable(x,y)` / `isWater(x,y)` | 通行判定（水与墙阻挡，height=1 可跳） |
| `regionOf(x,y)` | 区域归属 |
| `fog.reveal(x,y)` / `fog.visible(x,y)` | Q17 迷宫战争迷雾 |
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
- `dropFromEnemy(kind,difficulty,regionLv)` → `{silver, exp, items[]}`（普通12%/精英45%/BOSS必掉+保底高品质）
- `openChest(difficulty,regionLv)` → 同上（品质加成 ×1.5）

### 7.2 LG.Inv（js/game/inventory.js）
- `bag`（40格数组） `equip`（weapon+四槽） `silver`
- `add(item)` → bool；`equipItem(i)` / `unequip(slot)` / `enhance(itemOrId)`（Q35 银币强化，每级+5%，上限10）
- `sell(i)` → 银币；`activeBonds()` → 去重羁绊（Q29）；`calcStats()` → 综合属性（基础+装备+羁绊归一化）

### 7.3 LG.Player（js/game/player.js）
- 只读属性：`x,y,level,exp,expTo,hp,maxHp,potions,mode,down,facing,jumping,blockUntil`
- `spawn(x,y)` `update(dt)` `moveTo(x,y)`（A*寻路） `setMode('on'|'off'|'half')`（Q19 half=原地打不追击）
- `gainExp(n)`（Q31 满级溢出转银币20%） `takeDamage(n)`（格挡/闪避/不死金牌判定）
- `heal(n)` `usePotion()`（Q62） `block()`（Q23 减伤50%/2s/CD3s） `jump()`（Q21 伪跳跃）
- `rescue()` / `revive()`（Q26/Q66 掉10%银币回营地）；`_raw` 供存档访问内部状态

### 7.4 LG.Enemy（js/game/enemy.js）
- `setDifficulty(d)` `spawnRegion(region)`（Q63 密度×难度） `spawnBoss(region)`（可重复 Q65）
- `update(dt)`（fixed=弹幕、slow=警戒5格追击/脱战回家 Q74、精英/BOSS技能循环）
- `damage(e,n)` `list[]` `clear()`

### 7.5 LG.Combat（js/game/combat.js）
- `init()` 订阅战斗事件；`update(dt)` 推进弹道+特效+玩家自动攻击
- `projectiles[]` `effects[]`（text/slash/warn/aoe，Q25 轻量反馈）

### 7.6 LG.Quest（js/game/quest.js）
- `init()` 构建主线（各区域BOSS讨伐链）+支线（击杀/探索/收集/护送 Q39/Q40）
- `accept(id)` `submit(id)`（Q43 固定+概率装备） `progress(type,key,n)` `checkExplore(x,y)`
- `all[]` `active[]` `rebuild()`

### 7.7 LG.NPC（js/game/npc.js）
- `spawnAll()` 营地6功能NPC+各区1向导（Q42）；`nearby(x,y)` `interact(npc)`（经bus通知ui开面板）
- `list[]` `update(dt)`

### 7.8 LG.Save（js/game/save.js）
- `save(slot)` `load(slot)` `listSlots()` `remove(slot)` `exportSlot/importSlot`
- `autosave()`（60s+卸载前） `snapshot()`；存 `{seed, player, inv, quest, difficulty}`（Q59 种子+增量）

### 7.9 LG.UI（js/game/ui.js）
- `init(canvas)` `drawHUD()` `toast(msg)` `panel(title,html)` `closePanel()`
- 五页：`renderBag() renderStats() renderQuests() renderMap() renderSettings()`（Q50）
- `charCreate(cb)`（Q51） `dialog(npc,lines)` `tutorial()`（Q67 可跳过）
- 地图页点击即传送（Q13）；设置含音量/亮度/按键/语言（Q49/Q57）

## 8. 联机模块

### 8.1 LG.Net（js/net/net.js）
- `isHost` `connected` `difficulty` `roomId` `peers{}`
- `createRoom()` → `Promise<{roomId, code}>`；`join(码或房间号)` → `Promise<应答码>`；
  `acceptAnswer(code)`；`send(obj)`（客户端→房主）；`broadcast(obj)`
- 同浏览器：BroadcastChannel 自动信令；跨设备：完整码复制粘贴；局域网可选 `node tools/lan-signal.js`

### 8.2 LG.Lobby（js/net/lobby.js）
- `show()` 大厅面板（Q52 在线列表+房间+角色形象） `players[]`
- 确认开局 emit `start_game {players, host}`；单人=1人房（Q1）

## 9. LG.Engine（js/core/engine.js）— 装配层

- `start()` 主菜单；`scene` `fps`；`bindNet()`（main.js 调用）
- 内部职责：主循环、渲染裁剪、区域BGM切换、BOSS触发、宝箱布置、联机快照10Hz

### 事件总线表（跨模块契约）

| 事件 | 触发方 → 订阅方 | 数据 |
|---|---|---|
| `enemy_melee/enemy_shoot/enemy_skill` | enemy → combat | enemy 实例 |
| `enemy_hit/enemy_dead/enemy_killed` | combat/enemy → loot/quest/ui | `{e,n}` 或 enemy |
| `damage/dodge` | player → combat/ui | `{target,amount}` |
| `player_down` | player → ui | player |
| `levelup` | player → ui | lv |
| `quest_ready/quest_done` | quest → ui | quest |
| `open_shop/open_enhance/open_dialog/open_quests` | npc → ui | npc |
| `toast` | 任意 → ui | msg |
| `enter_region` | engine → 外部 | region |
| `start_game` | lobby → engine | `{players,host}` |
| `net_state/net_msg/peer_input` | net → lobby/engine | 协议消息 |
| `lang` | i18n → main | 'zh'\|'en' |

---

## 10. 打包与运行

- **本地运行**：任意静态服务器（`python -m http.server 8080`）或直接双击 `index.html`（file:// 亦可，无 ES-module 依赖）
- **Android APK**：`npm i @capacitor/core @capacitor/cli @capacitor/android && npx cap add android && npx cap sync && npx cap open android`（见 README）
- **局域网联机**（可选）：`node tools/lan-signal.js`
