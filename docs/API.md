# LEGEND 接口文档（模块间契约）

> 本游戏采用「分层 + 事件总线」架构，模块之间**只通过本文档列出的接口通信**。
> 修改任意文件的内部实现，只要保持接口不变，就不会影响其他文件。

## 分层与依赖（自底向上，`index.html` 按此顺序加载）

```
data/config  ──► 纯数据层（无依赖）
core/utils   ──► 基础工具层（无依赖）
core/input   ──► 输入层
world/terrain ─► 地形生成（依赖 config/utils）
world/worldmap► 世界状态（依赖 config/terrain/utils）
systems/*     ► 玩法系统（loot/combat/quest/save）
entity/*      ► 实体（player/enemy/npc/projectile）
net/multiplayer► 联机（依赖 PeerJS）
world/renderer► 渲染（依赖 config/terrain/worldmap/input）
ui/ui         ► 界面（依赖以上全部）
game          ► 主控（唯一同时认识所有模块的胶水层）
```

---

## 1. `Legend.Config` — `js/data/config.js`

| 成员 | 类型 | 说明 |
|---|---|---|
| `MAP_SIZE` | `2000` | 大陆尺寸（格） |
| `TILE` | `32` | 每格像素 |
| `PLAYER_MAX_LEVEL` | `10` | 人物/敌人/装备/武器等级上限 |
| `DEFAULT_DIFFICULTY` | `0.9` | 默认难度系数 |
| `MAX_PARTY` | `4` | 联机人数上限 |
| `REGIONS` | `Region[]` | 11 个区域 + `wild` 过渡区 |
| `getRegionAt(x,y)` | `→ Region` | 坐标所属区域（不含 wild 时返回 wild） |
| `WEAPONS` / `getWeapon(id)` | `Weapon[]` | 7 种武器：铁刃/骑士剑/镰刀/弓/弩/法杖/盾 |
| `ARMORS` / `getArmor(id)` | `Armor[]` | 4 部位：头盔/护甲/护腿/鞋 |
| `WEAPON_QUALITIES` | `Q[]` | N/R/SR/SSR 概率表（0.80/0.15/0.035/0.015） |
| `ARMOR_QUALITIES` | `Q[]` | D/C/B/A/S/SS 概率表（0.50/0.25/0.15/0.06/0.03/0.01） |
| `BONDS` / `getBond(id)` | `Bond[]` | 8 种羁绊，含 `apply(stats)` 累加函数 |
| `ENEMY_TEMPLATES` | `Obj` | 敌人模板（hp/dmg/speed/size/color/ranged） |
| `REGION_ENEMIES` | `Obj` | 各区域敌人池 |
| `REGION_BOSS` | `Obj` | 各区域 BOSS 模板 id |
| `KILL_R` | `{normal:0.3, elite:2.0, boss:4.0}` | 击杀奖励倍率 r |
| `DIFFICULTY` | `{MIN:0, MAX:2, DEFAULT:0.9, PRESETS[]}` | 难度系数 |
| `levelScale(lv)` | `→ number` | 等级属性倍率（10 级 ≈ 3.0×） |
| `expForLevel(lv)` | `→ number` | 升到下一级所需经验 |
| `WALKABLE` | `Obj` | 地形可通行表 |

**Region 结构**：`{id, name, dir, cx, cy, r, tier, theme[], liberated?, safe?, desc}`

---

## 2. `Legend.Utils` — `js/core/utils.js`

| 成员 | 说明 |
|---|---|
| `makeRng(seed)` | 种子随机函数，附加 `.range(a,b)` `.int(a,b)` `.pick(arr)` `.chance(p)` |
| `clamp/lerp/dist/dist2/angleLerp` | 数学工具 |
| `bus.on(ev,fn)` / `bus.off` / `bus.emit(ev,data)` | 事件总线 |
| `store.save(key,obj)` / `load(key,dflt)` / `del(key)` | localStorage 封装（失败静默） |
| `hexA(hex, a)` | 十六进制颜色转 `rgba()` |

**事件总线事件名**（`bus.on` 可监听）：
`region_found` `region_liberated` `levelup` `loot` `equip` `heal` `dodge` `undead` `potion` `quest_accept` `quest_progress` `quest_ready` `quest_done` `difficulty`

---

## 3. `Legend.Input` — `js/core/input.js`

| 成员 | 说明 |
|---|---|
| `attach(canvas)` | 绑定键鼠 + 触屏 |
| `update(playerScreenX, playerScreenY)` | 每帧刷新方向与瞄准角（由 game 调用） |
| `dirX` / `dirY` | 移动方向分量（-1~1，已归一化） |
| `aimAngle` | 瞄准弧度 |
| `mouseDown` | 鼠标左键按住（连发依据） |
| `consumePress(key)` | 读取并清除一次性按键 |
| `enabled` | 全局开关（打开 UI 面板时置 false） |

**`consumePress` 可用 key**：`attack` `interact`(E/F) `inv`(I/B) `map`(M) `roll`(空格) `potion`(Q) `esc`

---

## 4. `Legend.Terrain` — `js/world/terrain.js`

| 成员 | 说明 |
|---|---|
| `init(seed)` | 生成噪声场与道路网络 |
| `tileAt(tx,ty)` | → `'water'/'grass'/'rock_high'/...`（带 6 万格缓存） |
| `walkable(tx,ty)` | 是否可通行（水/熔岩/高山 false，桥 true） |
| `themeAt(tx,ty)` | 所属区域对象 |
| `randomWalkable(rng,tx,ty,tries)` | 附近找可走格（刷怪/宝箱用） |

---

## 5. `Legend.World` — `js/world/worldmap.js`

| 成员 | 说明 |
|---|---|
| `generate(seed)` | 生成传送点/宝箱/刷怪点 |
| `explored` / `liberated` | `{regionId: true}` 已探索/已解放 |
| `teleports[]` | `[{id,name,x,y,region,unlocked}]` |
| `chests[]` | `[{x,y,opened,rare,region}]` |
| `unlockRegionAt(x,y)` | 进入新区时解锁，返回 Region 或 null |
| `nearestTeleport(x,y)` / `nearestChest(x,y,maxDist)` | 最近对象 |
| `addKill(regionId, isBoss)` | 解放进度，返回是否刚解放 |
| `liberateRegion(regionId)` | 直接解放 |
| `minimapData(cells)` | → `{size, cells[]}` 小地图色块 |

---

## 6. `Legend.Loot` — `js/systems/loot.js`

| 成员 | 说明 |
|---|---|
| `rollWeaponQuality(rng)` / `rollArmorQuality(rng)` | 按概率表抽品质 |
| `rollBonds(rng, q)` | 按品质区间抽羁绊 id（去重） |
| `makeWeapon(rng, opts)` / `makeArmor(rng, opts)` | 生成物品实例 |
| `weaponStats(item)` | → `{dmg,aspd,range,block,kind,pierce,aoe,crit3,lifesteal,undead}` |
| `armorStats(item)` | → `{def,hp,move,dmg,dodge,crit3,lifesteal,undead,exp}` |
| `itemName(item)` / `itemDesc(item)` / `itemNameColor(item)` | 中文名/描述/品质色 |
| `rollEnemyLoot(rng, enemy, diff)` | 敌人掉落列表 |
| `rollChestLoot(rng, rare, lv, diff)` | 宝箱掉落列表 |
| `hydrate(item)` | 读档后重建 `_base/_q` |
| `asRng(rng)` | 兼容包装：允许直接传 `Math.random` |

**物品实例结构**：`{uid, slot, type, lv, quality, bonds[], _base, _q}`
`slot` 取值：`weapon` `helmet` `chest` `legging` `boots`

---

## 7. `Legend.Combat` — `js/systems/combat.js`

| 成员 | 说明 |
|---|---|
| `rollDamage(base, crit3)` | → `{dmg, crit3}` 三倍暴击判定 |
| `killReward(enemy, diff)` | → `{silver, exp}` = `lv×10×r×难度系数` |
| `meleeHits(px,py,angle,range,enemies,halfAngle?)` | 近战扇形命中列表 |
| `applyLifesteal(player, dealt)` | 吸血结算 |

---

## 8. `Legend.Quest` — `js/systems/quest.js`

| 成员 | 说明 |
|---|---|
| `list` | 10 个任务定义（含 `req` 前置链） |
| `active` / `done` | 进行中 `[{id,progress}]` / 已完成集合 |
| `available()` | 可接取任务列表 |
| `accept(id)` | 接取 |
| `onEvent(type, region)` | 事件上报：`kill` `chest` `explore` `boss` |
| `turnIn(id, player, game)` | 交付 → `{quest, texts[]}` |
| `serialize()` / `loadData(obj)` | 存档 |

---

## 9. `Legend.Save` — `js/systems/save.js`

`save(game)` / `load()` / `clear()` / `exists()`，存储键 `legend_save_v1`。

---

## 10. 实体

### `Legend.Player(x, y, name)`
| 成员 | 说明 |
|---|---|
| `update(dt, input, game)` | 移动/翻滚/攻击/药水 |
| `stats` | `{dmg,aspd,range,def,dodge,move,crit3,lifesteal,exp,undead,block,kind,pierce,aoe}` |
| `equip(item)` / `unequip(slot)` / `pick(item)` | 装备管理 |
| `takeDamage(amount, game)` | 结算：闪避→防御减伤→盾减伤→不死金牌 |
| `heal(n)` / `gainExp(n)` / `gainSilver(n)` | 数值增长 |
| `serialize()` / `Player.load(data)` | 存档 |

### `Legend.Enemy(tplId, x, y, lv, rank, diff, rng)`
`rank`: `'normal'|'elite'|'boss'`。`update(dt, player, game)` 驱动 AI，`takeDamage(n, game, byPlayer)` 返回是否死亡。

### `Legend.NPC(name, x, y, role, greet)`
`role`: `'quest'|'shop'`。`near(player)` 距离检测，`interact(game)` 打开面板。

### `Legend.Projectile`
`spawn(cfg)` 生成，`list` 存放，`updateAll(dt, game)` 统一飞行与碰撞（命中回调交给 game）。
`cfg`: `{x,y,angle,speed,dmg,range,side,kind,pierce,aoe,color}`

---

## 11. `Legend.Net` — `js/net/multiplayer.js`

| 成员 | 说明 |
|---|---|
| `available()` | PeerJS 是否加载 |
| `createRoom(name, cb)` | 建房 → `cb({ok, code})`（6 位房间码） |
| `joinRoom(code, name, cb)` | 加入 → `cb({ok, code})` |
| `leave()` | 离开 |
| `syncSelf(player)` / `syncEnemies(list)` | 每帧同步（host 权威） |
| `send(obj)` / `onMessage(fn)` | 消息收发 |
| `status` / `isHost` / `code` / `peers{}` / `count()` | 状态查询 |

**消息类型**：`hello` `welcome` `pos` `enemy` `chat` `leave`

---

## 11.5 `Legend.Fx` — `js/world/fx.js`

纯表现层（不参与游戏逻辑），负责画面氛围与打击感。

| 成员 | 说明 |
|---|---|
| `init()` | 重置粒子池与震动状态（新档/换世界时调用） |
| `update(dt, game)` | 每帧推进：昼夜循环、震动衰减、天气粒子生成与移动 |
| `draw(ctx, game)` | 绘制天气粒子 + 全屏闪光（画在光照层之上） |
| `applyLighting(ctx, game)` | 区域环境色 + 昼夜暗调 + 暗角 + 玩家柔光 + 低血红晕 + 受击红闪 |
| `shake(mag, dur)` | 屏幕震动（`shakeX/shakeY` 会被 `worldToScreen` 自动叠加） |
| `flash(color, alpha, dur)` | 全屏闪光（升级/解放/BOSS 登场） |
| `hurt(player, amount)` | 玩家受击红闪计时 |
| `dayPhase` | 昼夜相位 0~1（约 5 分钟一循环） |

**区域氛围表**：每个区域有独立的 `tint`（环境色）、`weather`（雪/雨/火星/落叶/尘埃/暗影/薄雾）、
`light`（玩家柔光色），集中在 `fx.js` 顶部 `MOOD` 表，改氛围只需改这张表。

**接入点**：`game.js` 在近战/弹道/受伤/爆炸时调用 `shake`；升级、区域解放、BOSS 登场调用 `flash`；
`renderer.js` 在 `draw()` 末尾依次调用 `applyLighting` 与 `draw`。

---

## 12. `Legend.Renderer` — `js/world/renderer.js`

| 成员 | 说明 |
|---|---|
| `attach(canvas)` | 绑定画布 |
| `camera` | `{x, y, zoom}` |
| `worldToScreen(wx,wy)` / `screenToWorld(sx,sy)` | 坐标换算 |
| `draw(game, dt)` | 每帧绘制入口 |
| `drawMinimap(ctx, game, x, y, size)` | 在指定位置画小地图 |
| `floatText(x,y,text,color)` / `addSlash` / `addSparks` | 飘字/挥砍弧/粒子 |

---

## 13. `Legend.UI` — `js/ui/ui.js`

| 成员 | 说明 |
|---|---|
| `init(game)` | 绑定 DOM 与事件 |
| `toast(text, color)` | 右上角提示 |
| `togglePanel(name)` / `closeAll()` | 面板：`inv` `quest` `map` `lobby` `settings` |
| `openQuestPanel(npc)` / `openShopPanel(npc)` | NPC 交互面板 |
| `refreshHud()` / `drawHudMinimap()` | HUD 刷新 |
| `showDeath()` | 死亡结算 |

---

## 14. `Legend.Game` — `js/game.js`（全局单例 `Legend.game`）

| 成员 | 说明 |
|---|---|
| `start()` | 启动主循环（内部完成 Renderer/Input/UI 初始化） |
| `newGame(name, seed)` / `continueGame()` | 开局/读档 |
| `state` | `'menu' \| 'play' \| 'dead'` |
| `player` / `enemies[]` / `npcs[]` / `difficulty` / `totalKills` | 运行时状态 |
| `playerAttack(p)` / `enemyMelee(e,p)` / `enemyShoot(e,p)` | 攻击结算 |
| `projectileHit(pj)` / `areaDamage(x,y,r,dmg,side)` | 命中与 AOE |
| `interact()` / `interactHint()` | E 键交互 |
| `respawn()` / `onPlayerDeath()` | 死亡与复活 |
| `spawnEnemy(instant)` / `maybeSpawnBoss(rg)` | 刷怪与 BOSS |

---

## 扩展指南

- **加一种武器**：只需在 `Config.WEAPONS` 加一条；`renderer.js` 的 `drawWeapon` 加一个绘制分支（可选）。
- **加一种羁绊**：在 `Config.BONDS` 加一条（写 `apply(stats)`），无需改其他文件。
- **加一个区域**：在 `Config.REGIONS` 加条目 + `Config.REGION_ENEMIES` 加敌人池，地形/传送点/宝箱自动生成。
- **加一个任务**：在 `Quest.list` 加定义（`type/target/need/req/reward`）。
- **改数值**：全部集中在 `config.js` 与 `combat.js`，不动实体代码。
