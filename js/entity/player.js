/* =============================================================================
 * 文件：js/entity/player.js
 * 职责：玩家实体：移动、翻滚闪避、攻击冷却、生命/经验/银币、
 *       装备槽（武器+4件装备）、属性聚合、羁绊被动（吸血/三倍暴击/不死金牌）。
 * 依赖：js/core/utils.js、js/data/config.js、js/systems/loot.js
 * 对外接口（Legend.Player 构造函数）：
 *   - new Player(x, y, name)               创建玩家
 *   - update(dt, input, game)              帧更新（移动/翻滚/攻击触发）
 *   - stats                                聚合后的属性 {dmg,aspd,range,def,...}
 *   - equip(item) / unequip(slot)          穿戴/卸下（slot: weapon/helmet/chest/legging/boots）
 *   - inventory                            背包数组
 *   - takeDamage(amount, game)             受伤（防御减伤/闪避/盾减伤/不死金牌）
 *   - heal(amount) / gainExp(n) / gainSilver(n)
 *   - serialize() / Player.load(data)      存档
 * 被引用：game.js / ui.js / save.js / multiplayer.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils, Loot = L.Loot;

  var SPEED = 4.2;              // 基础移动速度（格/秒）
  var ROLL_TIME = 0.28, ROLL_CD = 0.9, ROLL_DIST = 3.2;

  function Player(x, y, name) {
    this.x = x; this.y = y;
    this.name = name || '勇者';
    this.radius = 0.42;
    this.dir = 0;                    // 朝向弧度
    this.lv = 1;
    this.exp = 0;
    this.silver = 0;
    this.maxHp = 100;                // 基础生命
    this.hp = this.maxHp;
    this.potions = 3;                // 药水数量（Q 使用）
    this.potionCd = 0;

    this.slots = { weapon: null, helmet: null, chest: null, legging: null, boots: null };
    this.inventory = [];             // 背包（未装备的武器/装备）

    /* 攻击状态 */
    this.atkCd = 0;
    this.atkAnim = 0;                // 挥砍动画剩余时间
    this.atkDir = 0;

    /* 翻滚闪避 */
    this.rollTime = 0; this.rollCd = 0; this.rollVX = 0; this.rollVY = 0;
    this.invuln = 0;                 // 无敌帧

    /* 不死金牌 */
    this.undeadCd = 0;

    this.stats = { dmg: 0, aspd: 1, range: 1, def: 0, dodge: 0, move: 0,
                   crit3: 0, lifesteal: 0, exp: 0, undead: false, block: 0 };
    this.recalc();
  }

  /* ---- 属性聚合：武器 + 四件装备 + 羁绊 ---- */
  Player.prototype.recalc = function () {
    var s = { def: 0, dodge: 0, move: 0, crit3: 0, lifesteal: 0, exp: 0,
              undead: false, extraDmg: 0, extraHp: 0 };
    var w = this.slots.weapon;
    var base = { dmg: 10, aspd: 1.0, range: 1.2, kind: 'melee', block: 0, pierce: false, aoe: false };
    if (w) {
      var ws = Loot.weaponStats(w);
      base = { dmg: ws.dmg, aspd: ws.aspd, range: ws.range, kind: ws.kind,
               block: ws.block, pierce: ws.pierce, aoe: ws.aoe };
      s.crit3 += ws.crit3; s.lifesteal += ws.lifesteal;
      if (ws.undead) s.undead = true;
    }
    var slotKeys = ['helmet', 'chest', 'legging', 'boots'];
    for (var i = 0; i < slotKeys.length; i++) {
      var it = this.slots[slotKeys[i]];
      if (!it) continue;
      var as = Loot.armorStats(it);
      s.def += as.def; s.dodge += as.dodge; s.move += as.move;
      s.extraDmg += as.dmg; s.extraHp += as.hp;
      s.crit3 += as.crit3; s.lifesteal += as.lifesteal;
      if (as.undead) s.undead = true;
    }
    this.stats = {
      dmg: base.dmg * (1 + s.extraDmg),
      aspd: Math.min(base.aspd, 4.0),
      range: base.range,
      def: s.def,
      dodge: Math.min(s.dodge, 0.6),
      move: s.move,
      crit3: Math.min(s.crit3, 0.5),
      lifesteal: Math.min(s.lifesteal, 0.3),
      exp: s.exp,
      undead: s.undead,
      block: base.block || 0,
      kind: base.kind,
      pierce: !!base.pierce, aoe: !!base.aoe
    };
    var newMax = Math.round(this.maxHp * (1 + s.extraHp / 100) * (1 + (this.lv - 1) * 0.10));
    if (this.hp > newMax) this.hp = newMax;
    this.maxHp = newMax;
  };

  /* ---- 装备操作 ---- */
  Player.prototype.equip = function (item) {
    var slot = item.slot;
    var old = this.slots[slot];
    this.slots[slot] = item;
    var idx = this.inventory.indexOf(item);
    if (idx >= 0) this.inventory.splice(idx, 1);
    if (old) this.inventory.push(old);   // 旧装备进背包
    this.recalc();
    Utils.bus.emit('equip', item);
  };
  Player.prototype.unequip = function (slot) {
    var it = this.slots[slot];
    if (!it) return null;
    this.slots[slot] = null;
    this.inventory.push(it);
    this.recalc();
    return it;
  };
  Player.prototype.pick = function (item) {
    this.inventory.push(item);
    Utils.bus.emit('loot', item);
  };

  /* ---- 伤害结算：防御减伤 + 闪避 + 盾减伤 + 不死金牌 ---- */
  Player.prototype.takeDamage = function (amount, game) {
    if (this.invuln > 0 || this.rollTime > 0) return 0;
    if (this.stats.dodge > 0 && Math.random() < this.stats.dodge) {
      Utils.bus.emit('dodge', this);
      return 0;
    }
    var def = this.stats.def;
    var reduce = def / (def + 50);          // 防御减伤公式
    var final = amount * (1 - reduce) * (1 - this.stats.block);
    final = Math.max(1, final);
    this.hp -= final;
    if (this.hp <= 0) {
      if (this.stats.undead && this.undeadCd <= 0) {
        this.hp = 1;
        this.invuln = 5;                    // 不死金牌：无敌 5 秒
        this.undeadCd = 60;                 // 冷却 60 秒
        Utils.bus.emit('undead', this);
        return final;
      }
      this.hp = 0;
      if (game) game.onPlayerDeath();
    }
    return final;
  };

  Player.prototype.heal = function (n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    Utils.bus.emit('heal', n);
  };

  Player.prototype.gainExp = function (n) {
    n = Math.max(1, Math.round(n * (1 + this.stats.exp)));
    this.exp += n;
    while (this.lv < Config.PLAYER_MAX_LEVEL && this.exp >= Config.expForLevel(this.lv)) {
      this.exp -= Config.expForLevel(this.lv);
      this.lv++;
      this.recalc();
      this.heal(this.maxHp * 0.3);
      Utils.bus.emit('levelup', this.lv);
    }
    if (this.lv >= Config.PLAYER_MAX_LEVEL) this.exp = Math.min(this.exp, Config.expForLevel(this.lv));
    return n;
  };

  Player.prototype.gainSilver = function (n) {
    n = Math.max(0, Math.round(n));
    this.silver += n;
    return n;
  };

  /* ---- 每帧更新 ---- */
  Player.prototype.update = function (dt, input, game) {
    var st = this.stats;
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.atkAnim > 0) this.atkAnim -= dt;
    if (this.rollCd > 0) this.rollCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.undeadCd > 0) this.undeadCd -= dt;
    if (this.potionCd > 0) this.potionCd -= dt;

    /* 翻滚移动 */
    if (this.rollTime > 0) {
      this.rollTime -= dt;
      var nx = this.x + this.rollVX * dt, ny = this.y + this.rollVY * dt;
      if (L.Terrain.walkable(Math.floor(nx), Math.floor(this.y))) this.x = nx;
      if (L.Terrain.walkable(Math.floor(this.x), Math.floor(ny))) this.y = ny;
      return;
    }

    /* 常规移动 */
    var spd = SPEED * (1 + st.move);
    var mx = input.dirX * spd * dt, my = input.dirY * spd * dt;
    if (mx || my) {
      if (L.Terrain.walkable(Math.floor(this.x + mx), Math.floor(this.y))) this.x += mx;
      if (L.Terrain.walkable(Math.floor(this.x), Math.floor(this.y + my))) this.y += my;
      this.x = Utils.clamp(this.x, 0.5, Config.MAP_SIZE - 0.5);
      this.y = Utils.clamp(this.y, 0.5, Config.MAP_SIZE - 0.5);
    }

    this.dir = input.aimAngle;

    /* 翻滚闪避（空格） */
    if (input.consumePress('roll') && this.rollCd <= 0) {
      var dx = input.dirX, dy = input.dirY;
      if (!dx && !dy) { dx = Math.cos(this.dir); dy = Math.sin(this.dir); }
      var m = Math.hypot(dx, dy) || 1;
      this.rollVX = (dx / m) * (ROLL_DIST / ROLL_TIME);
      this.rollVY = (dy / m) * (ROLL_DIST / ROLL_TIME);
      this.rollTime = ROLL_TIME; this.rollCd = ROLL_CD; this.invuln = ROLL_TIME + 0.05;
    }

    /* 攻击（鼠标左键；连发跟随 mouseDown） */
    var wantAtk = input.mouseDown || input.consumePress('attack');
    if (wantAtk && this.atkCd <= 0) {
      this.atkCd = 1 / st.aspd;
      this.atkAnim = 0.18;
      this.atkDir = this.dir;
      if (game) game.playerAttack(this);
    }

    /* 药水（Q） */
    if (input.consumePress('potion') && this.potions > 0 && this.potionCd <= 0 && this.hp < this.maxHp) {
      this.potions--; this.potionCd = 1.2;
      this.heal(this.maxHp * 0.35);
      Utils.bus.emit('potion', this);
    }
  };

  Player.prototype.serialize = function () {
    return {
      name: this.name, lv: this.lv, exp: this.exp, silver: this.silver,
      hp: this.hp, potions: this.potions,
      slots: this.slots, inventory: this.inventory,
      x: this.x, y: this.y
    };
  };

  Player.load = function (data) {
    var p = new Player(data.x || 1400.5, data.y || 1400.5, data.name);
    p.lv = data.lv || 1; p.exp = data.exp || 0; p.silver = data.silver || 0;
    p.potions = data.potions != null ? data.potions : 3;
    var slotKeys = ['weapon', 'helmet', 'chest', 'legging', 'boots'];
    for (var i = 0; i < slotKeys.length; i++) {
      var it = data.slots && data.slots[slotKeys[i]];
      if (it) p.slots[slotKeys[i]] = Loot.hydrate(it);
    }
    if (data.inventory) for (var j = 0; j < data.inventory.length; j++) p.inventory.push(Loot.hydrate(data.inventory[j]));
    p.recalc();
    p.hp = Math.min(data.hp || p.maxHp, p.maxHp);
    return p;
  };

  L.Player = Player;
})(window);
