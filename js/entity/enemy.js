/* =============================================================================
 * 文件：js/entity/enemy.js
 * 职责：敌人实体与 AI（普通/精英怪/BOSS 三档）。按要求实现：
 *       普通  生命 = 难度系数 × 基础生命
 *       精英  生命 = 难度系数 × 基础生命 × 250%-400%，伤害 (+10%-30%) × 难度系数
 *       BOSS  生命 = 基础生命 × 500%-1000%，伤害 (+15%-40%) × 难度系数
 *       敌人武器装备属性为玩家的 30%（这里体现为伤害/攻速按 30% 折算）。
 * 依赖：js/data/config.js、js/core/utils.js、js/world/terrain.js
 * 对外接口（Legend.Enemy 构造函数）：
 *   - new Enemy(tplId, x, y, lv, rank, diff, rng)
 *   - update(dt, player, game)     AI：追击/攻击/远程弹道/回归
 *   - takeDamage(n, game, byPlayer) 受伤返回是否死亡
 *   - stats                        {hp,maxHp,dmg,aspd,speed,rank,lv}
 *   - lootRoll                     击杀后交给 Loot 的参数
 * 被引用：game.js / combat.js / renderer.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils, Terrain = L.Terrain;

  function Enemy(tplId, x, y, lv, rank, diff, rng) {
    var tpl = Config.ENEMY_TEMPLATES[tplId] || Config.ENEMY_TEMPLATES.slime;
    rng = rng || Math.random;
    rank = rank || 'normal';
    lv = Math.max(1, Math.min(Config.PLAYER_MAX_LEVEL, lv | 0));
    diff = (diff == null) ? Config.DEFAULT_DIFFICULTY : diff;

    this.tpl = tpl;
    this.id = Enemy._uid++;
    this.x = x; this.y = y;
    this.spawnX = x; this.spawnY = y;
    this.lv = lv;
    this.rank = rank;                       // normal | elite | boss
    this.radius = tpl.size * (rank === 'boss' ? 1.6 : rank === 'elite' ? 1.2 : 1) * 0.45;
    this.dir = 0;
    this.atkCd = 0; this.atkAnim = 0;
    this.hurtFlash = 0;
    this.knockX = 0; this.knockY = 0;
    this.state = 'wander';                  // wander | chase | attack
    this.wanderT = 0; this.wx = x; this.wy = y;
    this.dead = false;

    var lvScale = Config.levelScale(lv);
    /* 生命（按要求公式） */
    var baseHp = tpl.hp * lvScale;
    var hpMul, dmgMul;
    if (rank === 'elite') {
      hpMul = diff * rng.range(2.5, 4.0);                    // ×250%-400%
      dmgMul = diff * rng.range(1.10, 1.30);                 // (+10%-30%)×难度系数
    } else if (rank === 'boss') {
      hpMul = diff * rng.range(5.0, 10.0);                   // ×500%-1000%
      dmgMul = diff * rng.range(1.15, 1.40);                 // (+15%-40%)×难度系数
    } else {
      hpMul = diff;                                          // 难度系数×基础生命
      dmgMul = diff;
    }
    this.maxHp = Math.round(baseHp * hpMul);
    this.hp = this.maxHp;
    /* 敌人武器属性 = 玩家的 30%：基础伤害再按玩家同级武器 30% 折算 */
    var playerWeaponDmg = 10 * lvScale;
    this.dmg = playerWeaponDmg * 0.30 * tpl.dmg * dmgMul / 10;
    this.dmg = Math.max(1, this.dmg);
    this.aspd = tpl.ranged ? 0.8 : 1.0;
    this.speed = tpl.speed * (rank === 'boss' ? 0.95 : 1);
    this.range = tpl.ranged ? (tpl.range || 5) : 1.1;
    this.ranged = !!tpl.ranged;
    this.aggroRange = rank === 'boss' ? 14 : 8;
  }
  Enemy._uid = 1;

  Enemy.prototype.takeDamage = function (n, game, byPlayer) {
    if (this.dead) return false;
    this.hp -= n;
    this.hurtFlash = 0.12;
    /* 击退 */
    var a = Math.atan2(this.y - byPlayer.y, this.x - byPlayer.x);
    var kb = this.rank === 'boss' ? 0.4 : this.rank === 'elite' ? 1.2 : 2.0;
    this.knockX += Math.cos(a) * kb; this.knockY += Math.sin(a) * kb;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  };

  Enemy.prototype.update = function (dt, player, game) {
    if (this.dead) return;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.atkAnim > 0) this.atkAnim -= dt;

    /* 击退衰减 */
    if (this.knockX || this.knockY) {
      var kx = this.knockX * dt * 6, ky = this.knockY * dt * 6;
      if (Terrain.walkable(Math.floor(this.x + kx), Math.floor(this.y))) this.x += kx;
      if (Terrain.walkable(Math.floor(this.x), Math.floor(this.y + ky))) this.y += ky;
      this.knockX -= kx; this.knockY -= ky;
    }

    var d = Utils.dist(this.x, this.y, player.x, player.y);
    this.dir = Math.atan2(player.y - this.y, player.x - this.x);

    if (d < this.aggroRange) this.state = 'chase';
    else if (d > this.aggroRange * 1.6) this.state = 'wander';

    if (this.state === 'chase') {
      var wantRange = this.ranged ? this.range * 0.8 : 0.9;
      if (d > wantRange) {
        var spd = this.speed * dt;
        var mx = Math.cos(this.dir) * spd, my = Math.sin(this.dir) * spd;
        if (Terrain.walkable(Math.floor(this.x + mx), Math.floor(this.y))) this.x += mx;
        if (Terrain.walkable(Math.floor(this.x), Math.floor(this.y + my))) this.y += my;
      }
      if (d <= this.range && this.atkCd <= 0) {
        this.atkCd = 1 / this.aspd;
        this.atkAnim = 0.2;
        if (this.ranged && game) game.enemyShoot(this, player);
        else if (game) game.enemyMelee(this, player);
      }
    } else {
      /* 漫游：在出生点附近随机晃悠 */
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = Utils.lerp(1.5, 3.5, Math.random());
        var ang = Math.random() * Math.PI * 2;
        this.wx = this.spawnX + Math.cos(ang) * 3;
        this.wy = this.spawnY + Math.sin(ang) * 3;
      }
      var wd = Utils.dist(this.x, this.y, this.wx, this.wy);
      if (wd > 0.5) {
        var wa = Math.atan2(this.wy - this.y, this.wx - this.x);
        var wspd = this.speed * 0.4 * dt;
        var wx = Math.cos(wa) * wspd, wy = Math.sin(wa) * wspd;
        if (Terrain.walkable(Math.floor(this.x + wx), Math.floor(this.y))) this.x += wx;
        if (Terrain.walkable(Math.floor(this.x), Math.floor(this.y + wy))) this.y += wy;
      }
    }
  };

  L.Enemy = Enemy;
})(window);
