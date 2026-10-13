/* ============================================================================
   js/game/save.js —— 存档系统（Q59 种子+增量，Q54 自动+手动多槽）
   ----------------------------------------------------------------------------
   职责：世界以种子+增量存储（非全量瓦片），玩家数据/背包/任务/设置本地保存。
         联机时角色存自己设备、世界随房主（Q55，经 Net 层区分）。

   对外接口（window.LG.Save）：
     .save(slot) .load(slot) .listSlots() .remove(slot)
     .exportSlot(slot) -> json字符串 .importSlot(str)
     .autosave()  定时/事件触发

   存储结构：{ seed, player{...}, inv{...}, quest{...}, region, ts }
   依赖：config/utils（LS）、terrain（种子）、player/inv/quest（状态）。
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
      inv: { silver: LG.Inv.silver, bag: LG.Inv.bag, equip: LG.Inv.equip },
      quest: LG.Quest.all.map((q) => ({ id: q.id, accepted: q.accepted, got: q.got, done: q.done })),
    };
  }

  function save(slot) {
    LG.U.LS.set(KEY + slot, snapshot());
    return true;
  }
  function load(slot) {
    const d = LG.U.LS.get(KEY + slot);
    if (!d) return false;
    // 恢复世界（同种子重建，Q59）
    LG.Terrain.generate(d.seed);
    // 恢复玩家
    const P = LG.Player._raw;
    Object.assign(P, d.player);
    P.spawnedHpInit = true;
    // 恢复背包/银币
    LG.Inv.silver = d.inv.silver;
    d.inv.bag.forEach((it, i) => (LG.Inv.bag[i] = it));
    Object.keys(d.inv.equip).forEach((k) => (LG.Inv.equip[k] = d.inv.equip[k]));
    // 恢复任务
    (d.quest || []).forEach((sq) => {
      const q = LG.Quest.all.find((x) => x.id === sq.id);
      if (q) Object.assign(q, sq);
    });
    // 恢复难度
    if (LG.Net) LG.Net.difficulty = d.difficulty;
    LG.Enemy.clear();
    LG.NPC.spawnAll();
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

  /* 自动存档：每60秒 + 关键事件 */
  let timer = null;
  function autosave() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => save(1), 60000); // 默认1号槽
    window.addEventListener('beforeunload', () => save(1));
  }

  LG.Save = { save, load, listSlots, remove, exportSlot, importSlot, autosave, snapshot };
})();
