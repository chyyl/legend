/* =============================================================================
 * 文件：js/entity/npc.js
 * 职责：营地 NPC：站在营地中，按 E 交互打开任务面板（接取/查看任务与奖励）。
 *       营地未解放前 NPC 不出现（要求：营地第一次需要解放，有NPC）。
 * 依赖：js/core/utils.js、js/systems/quest.js
 * 对外接口（Legend.NPC 构造函数）：
 *   - new NPC(name, x, y, role)   role: 'quest' 任务 | 'shop' 商店
 *   - interact(game)              打开对应面板
 *   - near(player)                距离检测（交互提示）
 * 被引用：game.js / renderer.js / ui.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};

  function NPC(name, x, y, role, greet) {
    this.name = name; this.x = x; this.y = y;
    this.role = role || 'quest';     // quest | shop
    this.greet = greet || '冒险者，需要帮助吗？';
    this.radius = 0.42;
    this.bob = Math.random() * 6.28;
  }
  NPC.prototype.near = function (player, dist) {
    return L.Utils.dist(this.x, this.y, player.x, player.y) < (dist || 1.6);
  };
  NPC.prototype.interact = function (game) {
    if (this.role === 'quest') L.UI.openQuestPanel(this);
    else if (this.role === 'shop') L.UI.openShopPanel(this);
  };
  NPC.prototype.update = function (dt) { this.bob += dt * 2; };

  L.NPC = NPC;
})(window);
