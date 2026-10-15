/* ============================================================================
   js/game/save.js —— 存档系统（Q59 种子+增量，Q54 自动+手动多槽）
   ----------------------------------------------------------------------------
   职责：世界以种子+增量存储（非全量瓦片），玩家数据/背包/任务/宝箱本地保存。
         联机时角色存自己设备、世界随房主（Q55，经 Net 层区分）。

   对外接口（window.LG.Save）：
     .save(slot) .load(slot) .raw(slot) .listSlots() .remove(slot)
     .exportSlot(slot) -> json字符串 .importSlot(str)
     .autosave()  自动存档总入口（进世界时调用一次，触发器见下）
     .hasSave(slot) 是否存在存档（主菜单"继续游戏"入口判定）
     .apply(d)  状态恢复（假定世界已按 d.seed 生成且 Quest.init/NPC/Enemy 就位）
     .setContinue(v) / .consumeContinue() 主菜单"继续游戏"意向（单次消费，
       防止联机大厅等其它入口误带读档）
     .snapshot() 当前状态快照（测试/调试用）

   自动保存三类触发器（阶段十五）：
     ① 进世界立即落一档 + 每 60 秒定时；
     ② 关键事件：升级 / 任务完成 / 进入新区域 / 击杀 BOSS / 开启宝箱（稀疏，非逐击）；
     ③ 页面生命周期：visibilitychange→后台、pagehide、beforeunload——
        Android WebView 从最近任务划掉不保证触发 beforeunload，
        visibilitychange（切后台瞬间）才是手机端落档主力。
   自动读取：主菜单"继续游戏"→ beginGame（单人且意向置位）→ bootWorld(saved)。

   存储结构：{ seed, ts, difficulty, player{...}, mode, inv{...}, quest[], chests[] }
   依赖：config/utils（LS）、terrain（种子）、player/inv/quest（状态）。
   说明：迷宫战争迷雾不入档（重进重探，成本高收益低）；旧存档缺 mode/chests
         字段时 apply() 有缺省兜底，可直接续玩。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const KEY = 'legend_save_';

  function snapshot() {
    const P = LG.Player._raw;
    return {
      seed: LG.Config.SEED,
      ts: Date.now(),
      difficulty: (LG.Net && LG.Net.difficulty) || LG.Config.DIFFICULTY.default,
      player: { x: P.x, y: P.y, level: P.level, exp: P.exp, hp: P.hp, potions: P.potions,
                name: P.name, gender: P.gender, look: P.look },
      mode: P.mode, // 攻击模式 on/half/off
      inv: { silver: LG.Inv.silver, bag: LG.Inv.bag, equip: LG.Inv.equip },
      quest: LG.Quest.all.map((q) => ({ id: q.id, accepted: q.accepted, got: q.got, done: q.done })),
      // 宝箱全量（含已开标记）：buildChests 每次进世界随机重掷，
      // 不入档会导致"关掉重开无限开箱"刷物品
      chests: (LG.Engine && LG.Engine._chests) || null,
    };
  }

  function save(slot) {
    LG.U.LS.set(KEY + slot, snapshot());
    return true;
  }
  function raw(slot) { return LG.U.LS.get(KEY + slot); }

  /* 状态恢复（世界已就位时调用）：位置/等级/背包/任务/难度/宝箱 */
  function apply(d) {
    const P = LG.Player._raw;
    Object.assign(P, d.player);
    /* 阶段二十一地形重排（跨海大桥水道/骷髅岛护城河/边境长城城墙）后，
       旧档坐标可能落在新水域或城墙上——吸附到最近可走格，防读档卡死 */
    if (!LG.Terrain.walkable(P.x, P.y)) {
      const near = LG.Path && LG.Path.nearestWalkable ? LG.Path.nearestWalkable(P.x | 0, P.y | 0, 24) : null;
      if (near) { P.x = near.x; P.y = near.y; }
    }
    // expTo 不入档：按玩家等级公式重算（player.expNeed），封顶置 0（与 gainExp 一致）
    P.expTo = P.level >= LG.Config.MAX_LEVEL ? 0 : LG.Player.expNeed(P.level);
    P.mode = d.mode || 'on';
    P.down = false; P.downTimer = 0; P.path = []; P.moveTarget = null; // 清倒地/寻路残留
    P.stats = LG.Inv.calcStats();
    P.hp = Math.min(P.hp || P.stats.maxHp, P.stats.maxHp);
    P.spawnedHpInit = true; // 防 update 首帧把读档血量覆盖成满血（见 player.js）
    // 背包定长覆写（顺带清掉本次会话多拾取的物品）；装备槽按档全量对齐
    LG.Inv.silver = d.inv.silver;
    /* 阶段二十三数值迁移（反馈"装备数值有0"）：旧档防具 def 为分数制（≤0.5，取整后≈0）
       → 统一转百分点；旧 D 档 def=0（旧品质表"无"）补下限 5 点。伤害/移速/闪避
       旧分数值语义即"百分比"，新口径不变，无需迁移 */
    const normArmor = (it) => {
      if (!it || it.slot !== 'armor' || !it.stats) return;
      it.stats.def = LG.Inv.defPts(it.stats.def) || 5;
    };
    (d.inv.bag || []).forEach(normArmor);
    Object.values(d.inv.equip || {}).forEach(normArmor);
    for (let i = 0; i < LG.Inv.bag.length; i++) {
      LG.Inv.bag[i] = d.inv.bag && i < d.inv.bag.length ? d.inv.bag[i] : null;
    }
    Object.keys(LG.Inv.equip).forEach((k) => {
      LG.Inv.equip[k] = d.inv.equip && k in d.inv.equip ? d.inv.equip[k] : null;
    });
    // 任务状态（Quest.init 已建好对象，此处只覆盖进度字段）
    (d.quest || []).forEach((sq) => {
      const q = LG.Quest.all.find((x) => x.id === sq.id);
      if (q) Object.assign(q, sq);
    });
    if (LG.Net) LG.Net.difficulty = d.difficulty;
    if (LG.Enemy && LG.Enemy.setDifficulty) LG.Enemy.setDifficulty(d.difficulty);
    // 宝箱：整表替换（同种子地形一致，存档坐标仍然可走）
    if (d.chests && d.chests.length && LG.Engine && LG.Engine._chests) {
      LG.Engine._chests.length = 0;
      d.chests.forEach((c) => LG.Engine._chests.push(c));
    }
  }

  /* 中途读档（设置页 #s-load）：重建世界 + 恢复状态 + 刷新敌人/NPC */
  function load(slot) {
    const d = raw(slot);
    if (!d) return false;
    LG.Terrain.generate(d.seed);
    if (LG.Decor) LG.Decor.generate(d.seed); // 阶段二十四：同种子同步重建景物（幂等）
    apply(d);
    LG.Enemy.clear();
    LG.NPC.spawnAll();
    if (LG.Engine) LG.Engine._lastRegion = null; // 下帧重新触发区域生成/BGM
    LG.Camera.follow(LG.Player.x, LG.Player.y);
    return true;
  }

  function listSlots() {
    const out = [];
    for (let i = 1; i <= 3; i++) {
      const d = LG.U.LS.get(KEY + i);
      out.push({ slot: i, data: d ? { ts: d.ts, level: d.player.level, x: d.player.x, y: d.player.y } : null });
    }
    return out;
  }
  function remove(slot) { LG.U.LS.del(KEY + slot); }

  function exportSlot(slot) { return JSON.stringify(LG.U.LS.get(KEY + slot)); }
  function importSlot(str) {
    try { const d = JSON.parse(str); LG.U.LS.set(KEY + (d.__slot || 1), d); return true; }
    catch (e) { return false; }
  }

  function hasSave(slot) { return !!LG.U.LS.get(KEY + (slot || 1)); }

  /* "继续游戏"意向：主菜单置位、beginGame 单次消费（联机入口先清零防误带档） */
  let wantContinue = false;
  function setContinue(v) { wantContinue = !!v; }
  function consumeContinue() { const v = wantContinue; wantContinue = false; return v; }

  /* 自动存档（进世界调用一次）：三类触发器见文件头 */
  let timer = null, bound = false;
  function flush() {
    if (!LG.Engine || LG.Engine.scene !== 'game') return; // 仅对局内落档
    save(1);
  }
  function autosave() {
    if (timer) clearInterval(timer);
    save(1); // 进世界立即落一档（防开局几分钟内退出丢角色）
    timer = setInterval(flush, 60000);
    if (bound) return; // 事件/生命周期监听只绑一次（bootWorld 可多次进）
    bound = true;
    LG.U.bus.on('levelup', flush);          // 升级
    LG.U.bus.on('quest_done', flush);       // 任务完成
    LG.U.bus.on('enter_region', flush);     // 进入新区域（换 BGM/刷敌的节点）
    LG.U.bus.on('chest_open', flush);       // 开宝箱（engine.openChest 发出）
    LG.U.bus.on('enemy_killed', (e) => { if (e && e.isBoss) flush(); }); // BOSS 击杀
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  LG.Save = { save, load, raw, apply, listSlots, remove, exportSlot, importSlot,
              autosave, snapshot, hasSave, setContinue, consumeContinue };
})();
