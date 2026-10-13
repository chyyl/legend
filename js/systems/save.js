/* =============================================================================
 * 文件：js/systems/save.js
 * 职责：存档/读档。把玩家、世界状态（区域解锁/宝箱/解放进度）、任务、
 *       难度系数打包写入 localStorage，键为 'legend_save_v1'。
 * 依赖：js/core/utils.js（store 封装）
 * 对外接口（Legend.Save）：
 *   - save(game)         保存整局
 *   - load()             读取 -> 存档对象或 null
 *   - clear()            删除存档
 *   - exists()           是否存在存档
 * 被引用：game.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Utils = L.Utils;

  var KEY = 'legend_save_v1';
  var Save = {};

  Save.save = function (game) {
    if (!game || !game.player) return false;
    var data = {
      ver: 1,
      time: Date.now(),
      seed: game.worldSeed,
      difficulty: game.difficulty,
      player: game.player.serialize(),
      world: {
        explored: L.World.explored,
        liberated: L.World.liberated,
        chestsOpened: L.World.chests.map(function (c) { return c.opened ? 1 : 0; }),
        regionKill: L.World.regionKill,
        teleports: L.World.teleports.map(function (t) { return t.unlocked ? 1 : 0; })
      },
      quest: L.Quest.serialize(),
      kills: game.totalKills
    };
    Utils.store.save(KEY, data);
    return true;
  };

  Save.load = function () { return Utils.store.load(KEY, null); };
  Save.clear = function () { Utils.store.del(KEY); };
  Save.exists = function () { return Save.load() != null; };

  L.Save = Save;
})(window);
