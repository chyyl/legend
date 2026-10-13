/* =============================================================================
 * 文件：js/systems/combat.js
 * 职责：战斗数值结算：伤害计算（含三倍暴击）、玩家近战/远程命中判定、
 *       吸血结算、击杀奖励（要求：敌人等级×10×r×难度系数，r=普通30%/精英200%/BOSS400%）。
 *       把“怎么算”从 game.js 里拆出来，方便调数值时只改这一个文件。
 * 依赖：js/data/config.js、js/core/utils.js
 * 对外接口（Legend.Combat）：
 *   - rollDamage(base, crit3)            -> {dmg, crit3} 带三倍暴击判定的伤害
 *   - killReward(enemy, diff)            -> {silver, exp}  击杀银币与经验
 *   - meleeHits(px, py, angle, range, enemies)  近战扇形命中列表
 *   - applyLifesteal(player, dealt)      吸血
 * 被引用：game.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils;

  var Combat = {};

  /* 三倍暴击：暴击概率由羁绊累加，触发时伤害 ×3 */
  Combat.rollDamage = function (base, crit3) {
    var c3 = crit3 > 0 && Math.random() < crit3;
    return { dmg: base * (c3 ? 3 : 1), crit3: c3 };
  };

  /* 击杀奖励：敌人等级 × 10 × r × 难度系数 */
  Combat.killReward = function (enemy, diff) {
    var r = Config.KILL_R[enemy.rank] || Config.KILL_R.normal;
    diff = (diff == null) ? Config.DEFAULT_DIFFICULTY : diff;
    var base = enemy.lv * 10 * r * diff;
    /* 经验与银币同源，经验略高便于升级曲线平滑 */
    return { silver: Math.round(base), exp: Math.round(base * 1.2) };
  };

  /* 近战扇形命中：返回范围（格）内、夹角 < 100° 的敌人 */
  Combat.meleeHits = function (px, py, angle, range, enemies, halfAngle) {
    halfAngle = halfAngle || (100 * Math.PI / 180 / 2);
    var out = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var d = Utils.dist(px, py, e.x, e.y);
      if (d > range + e.radius) continue;
      var a = Math.atan2(e.y - py, e.x - px);
      var diff = Math.abs(Utils.angleLerp(angle, a, 1) - angle);
      if (diff <= halfAngle || d < 0.9) out.push(e);
    }
    return out;
  };

  /* 吸血：按造成伤害的百分比回血 */
  Combat.applyLifesteal = function (player, dealt) {
    if (!player.stats.lifesteal || dealt <= 0) return 0;
    var heal = dealt * player.stats.lifesteal;
    player.heal(heal);
    return heal;
  };

  L.Combat = Combat;
})(window);
