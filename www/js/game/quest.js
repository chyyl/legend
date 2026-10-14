/* ============================================================================
   js/game/quest.js —— 任务系统（Q39 五类，Q40 主线+支线）
   ----------------------------------------------------------------------------
   职责：主线剧情链 + 区域支线，任务类型：击杀/收集/探索/讨伐/护送（Q39）。
         进度追踪、奖励发放（Q43 固定+概率装备）。

   对外接口（window.LG.Quest）：
     .all[] .active[] .accept(id) .submit(id)
     .progress(type, key, n)   事件驱动进度（如击杀/探索时调用）
     .checkExplore(x,y)        到达探索点判定

   依赖：config（区域）、loot（奖励装备）、inventory（发银币）、bus（事件）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  // 任务定义：type=kill/collect/explore/boss/escort；region 关联区域
  const ALL = [];
  function build() {
    ALL.length = 0;
    const R = LG.Config.REGIONS;
    // 主线：按区域顺序讨伐各区域 BOSS（Q40 主线链）
    R.forEach((rg, i) => {
      if (!rg.boss) return;
      ALL.push({
        id: 'main_' + rg.id, main: true, type: 'boss', region: rg.id,
        zh: `讨伐 ${rg.zh} 的首领`, en: `Defeat the boss of ${rg.en}`,
        need: 1, got: 0, reward: { silver: 200 * (i + 1), exp: 150 * (i + 1), itemP: 0.5 },
        prereq: i > 0 ? 'main_' + R[i - 1].id : null, done: false, accepted: false,
      });
    });
    // 支线：各区域击杀/探索/收集（Q39）
    R.forEach((rg) => {
      ALL.push({ id: 'side_kill_' + rg.id, type: 'kill', region: rg.id,
        zh: `清剿 ${rg.zh} 的敌人`, en: `Slay enemies at ${rg.en}`,
        need: 10, got: 0, reward: { silver: 80, exp: 60, itemP: 0.2 }, done: false, accepted: false });
      ALL.push({ id: 'side_explore_' + rg.id, type: 'explore', region: rg.id,
        zh: `探索 ${rg.zh}`, en: `Explore ${rg.en}`,
        need: 1, got: 0, reward: { silver: 60, exp: 50, itemP: 0.15 }, done: false, accepted: false,
        target: { x: rg.cx + 40, y: rg.cy - 40 } });
    });
    // 收集类（Q39）：收集军团军牌
    ALL.push({ id: 'side_collect_1', type: 'collect', region: 'wall',
      zh: '收集 5 枚军团军牌', en: 'Collect 5 Legion Tags',
      need: 5, got: 0, item: 'tag', reward: { silver: 120, exp: 100, itemP: 0.3 }, done: false, accepted: false });
    // 护送类（Q39）：护送难民回营地
    ALL.push({ id: 'side_escort_1', type: 'escort', region: 'bay',
      zh: '护送难民返回营地', en: 'Escort refugees to camp',
      need: 1, got: 0, reward: { silver: 150, exp: 120, itemP: 0.3 }, done: false, accepted: false });
  }

  function accept(id) {
    const q = ALL.find((x) => x.id === id);
    if (!q || q.accepted) return false;
    // 主线需前置完成
    if (q.prereq) { const p = ALL.find((x) => x.id === q.prereq); if (p && !p.done) return false; }
    q.accepted = true; q.got = 0; q.done = false;
    return true;
  }

  /* 进度推进（击杀/收集等事件驱动） */
  function progress(type, key, n) {
    n = n || 1;
    ALL.forEach((q) => {
      if (!q.accepted || q.done) return;
      if (q.type !== type) return;
      if (type === 'kill' && key && q.region && LG.Config.regionAt(key.x, key.y).id !== q.region) return;
      q.got = Math.min(q.need, q.got + n);
      if (q.got >= q.need) LG.U.bus.emit('quest_ready', q);
    });
  }

  /* 探索判定（到达目标点） */
  function checkExplore(x, y) {
    ALL.forEach((q) => {
      if (!q.accepted || q.done || q.type !== 'explore' || !q.target) return;
      if (LG.U.dist(x, y, q.target.x, q.target.y) < 8) {
        q.got = 1; LG.U.bus.emit('quest_ready', q);
      }
    });
  }

  /* 提交领取奖励（Q43：固定+概率装备） */
  function submit(id) {
    const q = ALL.find((x) => x.id === id);
    if (!q || !q.accepted || q.got < q.need) return false;
    q.done = true;
    LG.Inv.silver += q.reward.silver;
    LG.Player.gainExp(q.reward.exp);
    if (Math.random() < q.reward.itemP) {
      const it = Math.random() < 0.5 ? LG.Loot.rollWeapon(LG.Config.DIFFICULTY.default, 3, 1.5)
                                     : LG.Loot.rollArmor(LG.Config.DIFFICULTY.default, 3, 1.5);
      LG.Inv.add(it);
      LG.U.bus.emit('toast', (LG.I18n.lang === 'zh' ? '获得任务奖励装备：' : 'Reward item: ') + it.quality);
    }
    LG.U.bus.emit('quest_done', q);
    return true;
  }

  // 监听敌人死亡以推进击杀/讨伐任务
  function init() {
    build();
    LG.U.bus.on('enemy_killed', (e) => {
      if (e.isBoss) progress('boss', e.region ? { x: e.x, y: e.y } : null);
      progress('kill', { x: e.x, y: e.y });
      // 军团军牌收集（普通敌人概率掉落）
      if (Math.random() < 0.3) progress('collect', 'tag');
    });
  }

  LG.Quest = { init, all: ALL, accept, submit, progress, checkExplore, rebuild: build,
    get active() { return ALL.filter((q) => q.accepted && !q.done); } };
})();
