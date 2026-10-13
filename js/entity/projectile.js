/* =============================================================================
 * 文件：js/entity/projectile.js
 * 职责：远程弹道（弓/弩/法杖的箭矢与法球，以及敌人的远程攻击）。
 *       负责飞行、命中检测、穿透（弩 pierce）与范围爆炸（法杖 aoe）。
 * 依赖：js/core/utils.js、js/world/terrain.js
 * 对外接口（Legend.Projectile 构造函数 / Legend.Projectile.list）：
 *   - new Projectile(cfg)   cfg: {x,y,angle,speed,dmg,range,side,kind,pierce,aoe,color}
 *   - Projectile.list       当前弹道数组
 *   - Projectile.updateAll(dt, game)  统一更新与碰撞
 *   - Projectile.clear()
 * 被引用：game.js / renderer.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Utils = L.Utils, Terrain = L.Terrain;

  function Projectile(cfg) {
    this.x = cfg.x; this.y = cfg.y;
    this.angle = cfg.angle;
    this.speed = cfg.speed || 12;
    this.dmg = cfg.dmg;
    this.travel = 0;
    this.range = cfg.range || 7;
    this.side = cfg.side || 'player';   // player | enemy
    this.kind = cfg.kind || 'arrow';    // arrow | bolt | magic
    this.pierce = !!cfg.pierce;
    this.aoe = cfg.aoe || 0;            // 爆炸半径（格），0 = 无
    this.color = cfg.color || '#e8d8a0';
    this.dead = false;
    this.hitIds = {};                   // 穿透时记录已命中目标
    this.radius = 0.18;
  }

  Projectile.list = [];
  Projectile.clear = function () { Projectile.list.length = 0; };
  Projectile.spawn = function (cfg) {
    var p = new Projectile(cfg);
    Projectile.list.push(p);
    return p;
  };

  Projectile.updateAll = function (dt, game) {
    var list = Projectile.list;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      var step = p.speed * dt;
      p.x += Math.cos(p.angle) * step;
      p.y += Math.sin(p.angle) * step;
      p.travel += step;

      var tx = Math.floor(p.x), ty = Math.floor(p.y);
      var remove = false;

      /* 撞墙（水/山）消失 */
      if (!Terrain.walkable(tx, ty)) remove = true;
      if (p.travel >= p.range) remove = true;

      if (!remove && game) {
        /* 命中检测交给 game（它知道双方实体列表） */
        var hit = game.projectileHit(p);
        if (hit) {
          if (p.aoe > 0) game.areaDamage(p.x, p.y, p.aoe, p.dmg, p.side, p);
          if (!p.pierce) remove = true;
        }
      }
      if (remove) {
        list.splice(i, 1);
        if (p.aoe > 0 && game) game.fxExplosion(p.x, p.y, p.aoe, p.color);
      }
    }
  };

  L.Projectile = Projectile;
})(window);
