/* =============================================================================
 * 文件：js/systems/quest.js
 * 职责：任务系统（要求：NPC 接取查看任务与奖励，完成任务可能有概率武器装备）。
 *       任务类型：kill（击杀N只）/ chest（开N个宝箱）/ explore（探索N个区域）
 *       / boss（击杀区域BOSS）。任务有前置链（主线感），奖励银币+经验+概率装备。
 * 依赖：js/core/utils.js、js/data/config.js、js/systems/loot.js
 * 对外接口（Legend.Quest）：
 *   - init()                       初始化任务表
 *   - list                         全部任务定义
 *   - active                       进行中任务 [{id,progress}]
 *   - done                         已完成任务 id 集合
 *   - available()                  可接取的任务定义列表
 *   - accept(id)                   接取
 *   - onEvent(type, data)          事件上报（kill/chest/explore/boss）
 *   - turnIn(id, player, game)     交付任务，返回奖励文本
 *   - serialize() / loadData(obj)
 * 被引用：npc.js / ui.js / game.js / save.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Utils = L.Utils, Config = L.Config, Loot = L.Loot;

  var Quest = {
    /* 任务定义表：need 需求数量，req 前置任务 id 数组 */
    list: [
      { id: 'q1', name: '解放营地', type: 'kill', need: 8, target: 'camp',
        desc: '营地被怪物占据了，消灭 8 只怪物解放营地！',
        reward: { silver: 120, exp: 100, item: 0.6 } },
      { id: 'q2', name: '镇守长城', type: 'kill', need: 12, target: 'wall',
        desc: '前往边境长城，消灭 12 只怪物。',
        req: ['q1'], reward: { silver: 200, exp: 180, item: 0.5 } },
      { id: 'q3', name: '海湾清剿', type: 'kill', need: 15, target: 'bay',
        desc: '海湾小镇告急，消灭 15 只怪物。',
        req: ['q1'], reward: { silver: 220, exp: 200, item: 0.5 } },
      { id: 'q4', name: '荒废田园', type: 'kill', need: 18, target: 'farm',
        desc: '彬祥农业园已荒废，清理 18 只怪物。',
        req: ['q2'], reward: { silver: 260, exp: 240, item: 0.5 } },
      { id: 'q5', name: '寻宝猎人', type: 'chest', need: 5, target: '*',
        desc: '大陆上散落着许多宝箱，开启 5 个宝箱。',
        req: ['q1'], reward: { silver: 180, exp: 150, item: 0.7 } },
      { id: 'q6', name: '跨海之途', type: 'explore', need: 4, target: '*',
        desc: '探索 4 个不同的区域，揭开大陆的迷雾。',
        req: ['q1'], reward: { silver: 300, exp: 300, item: 0.5 } },
      { id: 'q7', name: '迷宫之影', type: 'boss', need: 1, target: 'maze',
        desc: '击败黑暗迷宫中的 BOSS！',
        req: ['q4', 'q6'], reward: { silver: 600, exp: 600, item: 0.9 } },
      { id: 'q8', name: '兵工厂之心', type: 'kill', need: 24, target: 'armory',
        desc: '在西北兵工厂消灭 24 只怪物。',
        req: ['q6'], reward: { silver: 400, exp: 380, item: 0.5 } },
      { id: 'q9', name: '城堡之主', type: 'boss', need: 1, target: 'castle',
        desc: '击败黑暗城堡的城堡领主！',
        req: ['q7', 'q8'], reward: { silver: 1000, exp: 1000, item: 1.0 } },
      { id: 'q10', name: '终末之战', type: 'boss', need: 1, target: 'final',
        desc: '前往终末之战，击败终末之王，结束这一切！',
        req: ['q9'], reward: { silver: 3000, exp: 3000, item: 1.0 } }
    ],
    active: [],        // [{id, progress}]
    done: {}
  };

  Quest.init = function () { Quest.active = []; Quest.done = {}; };

  Quest.byId = function (id) {
    for (var i = 0; i < Quest.list.length; i++) if (Quest.list[i].id === id) return Quest.list[i];
    return null;
  };

  Quest.available = function () {
    return Quest.list.filter(function (q) {
      if (Quest.done[q.id]) return false;
      for (var i = 0; i < Quest.active.length; i++) if (Quest.active[i].id === q.id) return false;
      if (!q.req) return true;
      for (var j = 0; j < q.req.length; j++) if (!Quest.done[q.req[j]]) return false;
      return true;
    });
  };

  Quest.accept = function (id) {
    var q = Quest.byId(id);
    if (!q) return false;
    if (Quest.done[id]) return false;
    for (var i = 0; i < Quest.active.length; i++) if (Quest.active[i].id === id) return false;
    Quest.active.push({ id: id, progress: 0 });
    Utils.bus.emit('quest_accept', q);
    return true;
  };

  /* 事件上报：type 为 kill/chest/explore/boss，region 为发生区域 */
  Quest.onEvent = function (type, region) {
    for (var i = Quest.active.length - 1; i >= 0; i--) {
      var a = Quest.active[i], q = Quest.byId(a.id);
      if (!q || q.type !== type) continue;
      if (q.target !== '*' && q.target !== region) continue;
      a.progress++;
      Utils.bus.emit('quest_progress', q);
      if (a.progress >= q.need) Utils.bus.emit('quest_ready', q);
    }
  };

  /* 交付：返回奖励描述文本（含概率装备） */
  Quest.turnIn = function (id, player, game) {
    var idx = -1;
    for (var i = 0; i < Quest.active.length; i++) if (Quest.active[i].id === id) idx = i;
    if (idx < 0) return null;
    var a = Quest.active[idx], q = Quest.byId(id);
    if (a.progress < q.need) return null;
    Quest.active.splice(idx, 1);
    Quest.done[id] = true;

    var rng = Utils.makeRng((Date.now() & 0xffff) ^ (id.length * 7919));
    var texts = [];
    if (q.reward.silver) { player.gainSilver(q.reward.silver); texts.push('银币 +' + q.reward.silver); }
    if (q.reward.exp) { var e = player.gainExp(q.reward.exp); texts.push('经验 +' + e); }
    if (q.reward.item && rng.chance(q.reward.item)) {
      var it = rng.chance(0.5) ? Loot.makeWeapon(rng, {}) : Loot.makeArmor(rng, {});
      player.pick(it);
      texts.push('获得装备：' + Loot.itemName(it));
    }
    Utils.bus.emit('quest_done', q);
    return { quest: q, texts: texts };
  };

  Quest.serialize = function () {
    return { active: Quest.active, done: Quest.done };
  };
  Quest.loadData = function (obj) {
    if (!obj) return;
    Quest.active = obj.active || [];
    Quest.done = obj.done || {};
  };

  L.Quest = Quest;
})(window);
