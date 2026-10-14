/* ============================================================================
   js/game/npc.js —— NPC 系统（Q42 营地5-6人+各区1人，Q41 功能）
   ----------------------------------------------------------------------------
   职责：定义并管理 NPC（任务发布/商店/强化重铸/剧情对话/治疗复活）。
         营地为主要聚集地，各区域散布一名向导 NPC。承载世界观剧情（Q61）。

   对外接口（window.LG.NPC）：
     .list[] .spawnAll() .update(dt)
     .interact(npc) -> 打开对应功能面板（经 bus 通知 ui）
     .nearby(x,y) -> 最近可交互 NPC

   依赖：config（区域）、quest（任务）、inv（商店/强化）、ui（面板经bus）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const list = [];

  /* 营地功能 NPC（Q41 全功能：任务/商店/强化/对话/治疗） */
  const CAMP_NPCS = [
    { id: 'chief', zh: '营地首领', en: 'Chief', role: 'quest', dx: -6, dy: -4, lore: true },
    { id: 'merchant', zh: '军需商人', en: 'Merchant', role: 'shop', dx: 6, dy: -4 },
    { id: 'smith', zh: '铁匠', en: 'Smith', role: 'enhance', dx: -6, dy: 4 },
    { id: 'healer', zh: '医师', en: 'Healer', role: 'heal', dx: 6, dy: 4 },
    { id: 'sage', zh: '占卜师', en: 'Sage', role: 'lore', dx: 0, dy: -7 },
    { id: 'trainer', zh: '教官', en: 'Trainer', role: 'tutorial', dx: 0, dy: 7 },
  ];

  function spawnAll() {
    list.length = 0;
    const camp = LG.Config.REGIONS.find((r) => r.id === 'camp');
    CAMP_NPCS.forEach((n) => {
      list.push({ ...n, x: camp.cx + n.dx, y: camp.cy + n.dy, region: camp.id, kind: 'camp' });
    });
    // 各区域一名向导 NPC（Q42）
    // 迷宫等区域中心/偏移点可能落在墙上（墙=2级不可走），吸附到最近可走格防"站墙上不可达"
    LG.Config.REGIONS.forEach((rg) => {
      if (rg.id === 'camp') return;
      const near = LG.Path.nearestWalkable((rg.cx + 5) | 0, (rg.cy + 5) | 0, 14);
      list.push({ id: 'guide_' + rg.id, zh: rg.zh + '向导', en: rg.en + ' Guide',
        role: 'quest', x: near ? near.x : rg.cx + 5, y: near ? near.y : rg.cy + 5,
        region: rg.id, kind: 'region', lore: true });
    });
  }

  function update(dt) { /* NPC 静立，预留动画钩子 */ }

  /* 就近交互（距离<2格） */
  function nearby(x, y) {
    let best = null, bd = 4;
    list.forEach((n) => {
      const d = LG.U.dist(x, y, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }

  /* 交互分发：通知 UI 打开对应面板 */
  function interact(npc) {
    if (!npc) return;
    LG.Sound.play('ui');
    switch (npc.role) {
      case 'quest': LG.U.bus.emit('open_quests', npc); break;
      case 'shop': LG.U.bus.emit('open_shop', npc); break;
      case 'enhance': LG.U.bus.emit('open_enhance', npc); break;
      case 'heal': LG.Player.heal(LG.Player.maxHp); LG.U.bus.emit('toast',
        LG.I18n.lang === 'zh' ? '生命已完全恢复' : 'HP fully restored'); break;
      case 'lore': LG.U.bus.emit('open_dialog', { npc, lines: [LG.Config.LORE[LG.I18n.lang]] }); break;
      case 'tutorial': LG.U.bus.emit('open_tutorial', npc); break;
    }
  }

  LG.NPC = { list, spawnAll, update, nearby, interact };
})();
