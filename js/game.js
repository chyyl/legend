/* =============================================================================
 * 文件：js/game.js
 * 职责：游戏总控——状态机（menu/play/dead）、主循环、实体生成与刷新、
 *       玩家/敌人攻击结算、掉落拾取、区域探索与解放、宝箱、传送、
 *       存档读档、联机同步。它是唯一同时认识所有模块的“胶水层”。
 * 依赖：全部下层模块（Config/Utils/Input/Terrain/World/Renderer/
 *       Player/Enemy/NPC/Projectile/Loot/Combat/Quest/Save/Net/UI）
 * 对外接口（Legend.Game 实例，全局唯一 game）：
 *   - start()                       启动主循环
 *   - state                         'menu' | 'play' | 'dead'
 *   - playerAttack(player)          玩家攻击结算（近战/远程）
 *   - enemyMelee(e, p) / enemyShoot(e, p)  敌人攻击
 *   - projectileHit(pj)             弹道命中检测 -> 命中实体或 null
 *   - areaDamage(x,y,r,dmg,side)    范围伤害
 *   - respawn()                     复活
 *   - onPlayerDeath()
 * 被引用：index.html（最后加载）、ui.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils, Input = L.Input,
      Terrain = L.Terrain, World = L.World, Renderer = L.Renderer,
      Loot = L.Loot, Combat = L.Combat, Quest = L.Quest, Net = L.Net, Fx = L.Fx;

  function Game() {
    this.state = 'menu';
    this.player = null;
    this.enemies = [];
    this.npcs = [];
    this.difficulty = Config.DEFAULT_DIFFICULTY;
    this.worldSeed = 20261013;
    this.totalKills = 0;
    this.spawnTimer = 0;
    this.saveTimer = 0;
    this.netTimer = 0;
    this.remoteEnemies = [];      // 客户端渲染用的远程敌人快照
    this._last = 0;
    this._raf = null;
  }

  /* ---- 初始化世界与玩家 ---- */
  Game.prototype.setup = function (opts) {
    opts = opts || {};
    this.worldSeed = opts.seed || this.worldSeed;
    Terrain.init(this.worldSeed);
    World.generate(this.worldSeed);
    Quest.init();

    this.player = opts.player || new L.Player(Config.START_POS.x + 0.5, Config.START_POS.y + 0.5, opts.name || '勇者');
    /* 开局送一把武器，否则空手打不动 */
    if (!this.player.slots.weapon) {
      var rng = Utils.makeRng(this.worldSeed ^ 0x5f5f);
      this.player.equip(Loot.makeWeapon(rng, { base: Config.WEAPONS[0], quality: Config.WEAPON_QUALITIES[0], lv: 1, bonds: [] }));
      this.player.pick(Loot.makeArmor(rng, { base: Config.ARMORS[1], quality: Config.ARMOR_QUALITIES[0], lv: 1, bonds: [] }));
    }
    this.enemies = [];
    this.remoteEnemies = [];
    this.buildNPCs();
    L.Projectile.clear();
    Fx.init();                 // 重置天气粒子与屏幕状态
    Renderer.camera.x = this.player.x; Renderer.camera.y = this.player.y;
  };

  /* ---- 营地 NPC（营地解放后出现） ---- */
  Game.prototype.buildNPCs = function () {
    this.npcs = [];
    if (!World.liberated['camp']) return;   // 营地未解放，NPC 不出现
    var cx = Config.REGIONS[0].cx, cy = Config.REGIONS[0].cy;
    this.npcs.push(new L.NPC('村长·顾言', cx - 3, cy - 2, 'quest', '冒险者，解放营地的重任就交给你了。'));
    this.npcs.push(new L.NPC('商人·铜板', cx + 3, cy - 1, 'shop', '来看看货，药水只卖 50 银币！'));
    this.npcs.push(new L.NPC('斥候·风吟', cx, cy + 3, 'quest', '北方迷宫与南方终末之地都有强敌，小心。'));
  };

  /* ---- 开始一局 ---- */
  Game.prototype.begin = function (loadData) {
    var self = this;
    if (loadData) {
      this.worldSeed = loadData.seed || this.worldSeed;
      Terrain.init(this.worldSeed);
      World.generate(this.worldSeed);
      Quest.init();
      /* 恢复世界状态 */
      var w = loadData.world || {};
      if (w.explored) World.explored = w.explored;
      if (w.liberated) World.liberated = w.liberated;
      if (w.regionKill) World.regionKill = w.regionKill;
      if (w.chestsOpened) for (var i = 0; i < World.chests.length && i < w.chestsOpened.length; i++) World.chests[i].opened = !!w.chestsOpened[i];
      if (w.teleports) for (var j = 0; j < World.teleports.length && j < w.teleports.length; j++) World.teleports[j].unlocked = !!w.teleports[j];
      Quest.loadData(loadData.quest);
      this.difficulty = loadData.difficulty != null ? loadData.difficulty : Config.DEFAULT_DIFFICULTY;
      this.totalKills = loadData.kills || 0;
      this.player = L.Player.load(loadData.player);
      this.enemies = [];
      this.buildNPCs();
      L.Projectile.clear();
      Renderer.camera.x = this.player.x; Renderer.camera.y = this.player.y;
    }
    this.state = 'play';
    Input.enabled = true;
    L.UI.closeAll();
    /* 立即显示 HUD 并刷新数值（不等主循环首帧，避免开局闪一下空白） */
    var hud = document.getElementById('hud');
    if (hud) hud.style.display = 'block';
    L.UI.refreshHud();
    /* 初始刷一轮怪 */
    for (var k = 0; k < 12; k++) this.spawnEnemy(true);
  };

  /* ---- 敌人生成：围绕玩家所在区域，按难度系数控制数量 ---- */
  Game.prototype.spawnEnemy = function (instant) {
    var p = this.player;
    var rg = Config.getRegionAt(Math.floor(p.x), Math.floor(p.y));
    var pool = Config.REGION_ENEMIES[rg.id] || [];
    if (!pool.length) return;                       // 安全区不刷怪
    var rng = Math.random;
    /* 难度系数影响怪物数量：0.9 基准，2.0 时约两倍 */
    var cap = Math.round((6 + rg.tier) * (0.5 + this.difficulty * 0.6));
    var alive = 0;
    for (var i = 0; i < this.enemies.length; i++) if (!this.enemies[i].dead) alive++;
    if (alive >= cap) return;

    /* 找一个刷怪点：优先在固定点里挑一个"玩家视野外"的（12-34 格），
     * 固定点都不合适时，围绕玩家动态生成一个（保证各处都能持续刷怪，
     * 不会出现"站在区域中心却四周空荡"的情况）。 */
    var pt = null;
    var pts = World.spawnCache[rg.id] || [];
    if (instant) {
      if (pts.length) {
        var rp = pts[Math.floor(Math.random() * pts.length)];
        pt = { x: rp.x, y: rp.y };
      }
    } else {
      for (var t = 0; t < 6 && !pt; t++) {
        var cand = pts[Math.floor(Math.random() * pts.length)];
        if (!cand) break;
        var cd = Utils.dist(cand.x, cand.y, p.x, p.y);
        if (cd >= 12 && cd <= 34) pt = { x: cand.x, y: cand.y };
      }
      if (!pt) {
        /* 动态刷怪点：在玩家周围 13-26 格环带上找可走位置 */
        for (var k = 0; k < 8 && !pt; k++) {
          var ang = Math.random() * Math.PI * 2;
          var rad = 13 + Math.random() * 13;
          var wx = Math.floor(p.x + Math.cos(ang) * rad);
          var wy = Math.floor(p.y + Math.sin(ang) * rad);
          if (Terrain.walkable(wx, wy)) pt = { x: wx + 0.5, y: wy + 0.5 };
        }
      }
    }
    if (!pt) return;

    var tplId = pool[Math.floor(Math.random() * pool.length)];
    var lv = Math.max(1, Math.min(Config.PLAYER_MAX_LEVEL, rg.tier + Math.floor(Math.random() * 3)));
    var rank = 'normal';
    var roll = Math.random();
    /* 精英怪概率约 8%，BOSS 需要区域未解放时首刷触发 */
    if (roll < 0.08) rank = 'elite';
    var e = new L.Enemy(tplId, pt.x, pt.y, lv, rank, this.difficulty, Math.random);
    this.enemies.push(e);
  };

  /* ---- 区域 BOSS：进入未解放区域时生成 ---- */
  Game.prototype.maybeSpawnBoss = function (rg) {
    if (!rg || rg.id === 'wild' || rg.id === 'camp') return;
    if (World.liberated[rg.id]) return;
    if (World.bossSpawned[rg.id]) return;
    var bossTpl = Config.REGION_BOSS[rg.id];
    if (!bossTpl) return;
    World.bossSpawned[rg.id] = true;
    var p = this.player;
    var ang = Math.random() * Math.PI * 2;
    var bx = rg.cx + Math.cos(ang) * rg.r * 0.4;
    var by = rg.cy + Math.sin(ang) * rg.r * 0.4;
    var w = Terrain.randomWalkable(Math.random, Math.floor(bx), Math.floor(by), 20);
    var e = new L.Enemy(bossTpl, w.x + 0.5, w.y + 0.5, Math.min(10, rg.tier + 2), 'boss', this.difficulty, Math.random);
    this.enemies.push(e);
    /* BOSS 登场演出：红闪 + 强震 + 大量火花 */
    Fx.flash('#3a0a0a', 0.5, 0.6);
    Fx.shake(9, 0.6);
    Renderer.addSparks(e.x, e.y, '#ff5050', 30);
    L.UI.toast('☠ ' + e.tpl.name + ' 出现了！击败它解放' + rg.name + '！', '#ff5050');
  };

  /* ---- 玩家攻击 ---- */
  Game.prototype.playerAttack = function (p) {
    var st = p.stats;
    if (st.kind === 'melee' || st.kind === 'shield') {
      /* 近战：扇形命中 */
      var hits = Combat.meleeHits(p.x, p.y, p.atkDir, st.range, this.enemies);
      Renderer.addSlash(p.x, p.y, p.atkDir, st.range, '#ffe9a0');
      for (var i = 0; i < hits.length; i++) {
        var e = hits[i];
        var roll = Combat.rollDamage(st.dmg, st.crit3);
        var died = e.takeDamage(roll.dmg, this, p);
        /* 打击感：命中轻微震动，三倍暴击时更大幅度 + 金色火花 */
        Fx.shake(roll.crit3 ? 3.2 : 1.1, roll.crit3 ? 0.22 : 0.12);
        Renderer.floatText(e.x, e.y - 0.6, Math.round(roll.dmg) + (roll.crit3 ? '!' : ''),
          roll.crit3 ? '#ffd750' : '#fff', roll.crit3);
        Renderer.addSparks(e.x, e.y, roll.crit3 ? '#ffd750' : e.tpl.color, roll.crit3 ? 12 : 5);
        Combat.applyLifesteal(p, roll.dmg);
        if (died) { Fx.shake(2.4, 0.2); Renderer.addSparks(e.x, e.y, '#ffffff', 10); }
        if (died) this.onEnemyDead(e);
      }
    } else {
      /* 远程/法杖：发射弹道 */
      var kind = st.kind === 'magic' ? 'magic' : 'arrow';
      L.Projectile.spawn({
        x: p.x, y: p.y, angle: p.atkDir,
        speed: st.kind === 'magic' ? 9 : 14,
        dmg: st.dmg, range: st.range + 2,
        side: 'player', kind: kind,
        pierce: st.pierce, aoe: st.aoe ? 1.2 : 0,
        color: st.kind === 'magic' ? '#a88cff' : '#e8d8a0'
      });
    }
  };

  /* ---- 敌人攻击 ---- */
  Game.prototype.enemyMelee = function (e, p) {
    var roll = Combat.rollDamage(e.dmg, 0);
    var real = p.takeDamage(roll.dmg, this);
    if (real > 0) {
      Fx.hurt(p, real);
      Fx.shake(2.6, 0.22);
      Renderer.floatText(p.x, p.y - 0.7, '-' + Math.round(real), '#ff6b6b');
      Renderer.addSparks(p.x, p.y, '#ff5050', 6);
    } else {
      Renderer.floatText(p.x, p.y - 0.7, '闪避', '#9fe8ff');
    }
  };
  Game.prototype.enemyShoot = function (e, p) {
    var ang = Math.atan2(p.y - e.y, p.x - e.x);
    L.Projectile.spawn({
      x: e.x, y: e.y, angle: ang, speed: 8,
      dmg: e.dmg, range: e.range + 3, side: 'enemy', kind: 'arrow', color: '#ff9a6a'
    });
  };

  /* ---- 弹道命中检测 ---- */
  Game.prototype.projectileHit = function (pj) {
    if (pj.side === 'player') {
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead || pj.hitIds[e.id]) continue;
        if (Utils.dist2(pj.x, pj.y, e.x, e.y) < (e.radius + pj.radius) * (e.radius + pj.radius)) {
          var roll = Combat.rollDamage(pj.dmg, this.player.stats.crit3);
          var died = e.takeDamage(roll.dmg, this, this.player);
          pj.hitIds[e.id] = true;
          Fx.shake(roll.crit3 ? 3.0 : 0.9, roll.crit3 ? 0.2 : 0.1);
          Renderer.floatText(e.x, e.y - 0.6, Math.round(roll.dmg) + (roll.crit3 ? '!' : ''),
            roll.crit3 ? '#ffd750' : '#fff', roll.crit3);
          Renderer.addSparks(e.x, e.y, roll.crit3 ? '#ffd750' : e.tpl.color, roll.crit3 ? 10 : 4);
          Combat.applyLifesteal(this.player, roll.dmg);
          if (died) this.onEnemyDead(e);
          return e;
        }
      }
    } else {
      var p = this.player;
      if (Utils.dist2(pj.x, pj.y, p.x, p.y) < 0.36) {
        var real = p.takeDamage(pj.dmg, this);
        if (real > 0) Renderer.floatText(p.x, p.y - 0.7, '-' + Math.round(real), '#ff6b6b');
        return p;
      }
    }
    return null;
  };

  /* ---- 范围伤害（法杖 AOE） ---- */
  Game.prototype.areaDamage = function (x, y, r, dmg, side) {
    if (side === 'player') {
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead) continue;
        if (Utils.dist(x, y, e.x, e.y) <= r + e.radius) {
          var roll = Combat.rollDamage(dmg * 0.7, this.player.stats.crit3);
          var died = e.takeDamage(roll.dmg, this, this.player);
          Renderer.floatText(e.x, e.y - 0.6, Math.round(roll.dmg), '#c9a0ff');
          if (died) this.onEnemyDead(e);
        }
      }
    } else {
      var p = this.player;
      if (Utils.dist(x, y, p.x, p.y) <= r) {
        var real = p.takeDamage(dmg * 0.7, this);
        if (real > 0) Renderer.floatText(p.x, p.y - 0.7, '-' + Math.round(real), '#ff6b6b');
      }
    }
  };
  Game.prototype.fxExplosion = function (x, y, r, color) {
    Renderer.addSparks(x, y, color || '#a88cff', 22);
    Renderer.addSlash(x, y, Math.random() * 6.28, r, color || '#c9a0ff');
    Fx.shake(4.0, 0.3);
    Renderer.floatText(x, y - 0.4, 'BOOM', color || '#a88cff');
  };

  /* ---- 敌人死亡：掉落、经验银币、任务、解放进度 ---- */
  Game.prototype.onEnemyDead = function (e) {
    this.totalKills++;
    /* 奖励：敌人等级×10×r×难度系数 */
    var rew = Combat.killReward(e, this.difficulty);
    var gotS = this.player.gainSilver(rew.silver);
    var gotE = this.player.gainExp(rew.exp);
    Renderer.floatText(e.x, e.y - 0.9, '+' + gotS + '银币', '#ffd750');
    Renderer.floatText(e.x, e.y - 1.3, '+' + gotE + '经验', '#9fe8ff');
    /* 掉落物 */
    var drops = Loot.rollEnemyLoot(Math.random, e, this.difficulty);
    for (var i = 0; i < drops.length; i++) {
      this.player.pick(drops[i]);
      Renderer.floatText(e.x + (Math.random() - 0.5), e.y - 0.4 - i * 0.4, '获得 ' + Loot.itemName(drops[i]), '#c9a0ff');
    }
    /* 任务与解放进度 */
    var rg = Config.getRegionAt(Math.floor(e.x), Math.floor(e.y));
    Quest.onEvent('kill', rg.id);
    if (e.rank === 'boss') {
      Quest.onEvent('boss', rg.id);
      if (World.addKill(rg.id, true)) this.onRegionLiberated(rg);
      L.UI.toast('BOSS 被击败！' + rg.name + ' 解放！', '#ffd750');
    } else {
      if (World.addKill(rg.id, false)) this.onRegionLiberated(rg);
    }
    L.UI.refreshHud();
  };

  Game.prototype.onRegionLiberated = function (rg) {
    if (rg.id === 'camp') this.buildNPCs();   // 营地解放后 NPC 出现
    Fx.flash('#ffd750', 0.35, 0.7);           // 解放金光
    Fx.shake(5, 0.4);
    L.UI.refreshHud();
  };

  /* ---- 玩家死亡 ---- */
  Game.prototype.onPlayerDeath = function () {
    if (this.state !== 'play') return;
    this.state = 'dead';
    Input.enabled = false;
    L.UI.showDeath();
  };

  Game.prototype.respawn = function () {
    /* 复活：回营地传送点，掉 10% 银币 */
    var camp = World.teleports[0];
    this.player.x = camp.x; this.player.y = camp.y;
    this.player.hp = this.player.maxHp;
    this.player.silver = Math.floor(this.player.silver * 0.9);
    /* 清掉周围敌人 */
    for (var i = 0; i < this.enemies.length; i++) this.enemies[i].dead = true;
    this.enemies = [];
    this.state = 'play';
    Input.enabled = true;
    document.getElementById('death-panel').style.display = 'none';
    L.UI.refreshHud();
  };

  /* ---- 交互提示与交互执行 ---- */
  Game.prototype.interactHint = function () {
    if (this.state !== 'play') return '';
    var p = this.player;
    var chest = World.nearestChest(p.x, p.y, 1.8);
    if (chest) return '[E] 打开' + (chest.rare ? '华丽宝箱' : '宝箱');
    var tp = World.nearestTeleport(p.x, p.y);
    if (tp && Utils.dist(p.x, p.y, tp.x, tp.y) < 1.8) return '[E] 传送点：' + tp.name + '（按 M 打开地图传送）';
    for (var i = 0; i < this.npcs.length; i++) {
      if (this.npcs[i].near(p, 1.8)) return '[E] 与 ' + this.npcs[i].name + ' 交谈';
    }
    return '';
  };

  Game.prototype.interact = function () {
    var p = this.player;
    var chest = World.nearestChest(p.x, p.y, 1.8);
    if (chest) {
      chest.opened = true;
      var rng = Math.random;
      var lv = Math.max(1, Math.min(10, Config.getRegionAt(Math.floor(chest.x), Math.floor(chest.y)).tier + 1));
      var drops = Loot.rollChestLoot(rng, chest.rare, lv, this.difficulty);
      for (var i = 0; i < drops.length; i++) {
        this.player.pick(drops[i]);
        Renderer.floatText(chest.x, chest.y - 1 - i * 0.4, '获得 ' + Loot.itemName(drops[i]), '#ffd750');
      }
      Renderer.addSparks(chest.x, chest.y, '#ffd750', 10);
      Quest.onEvent('chest', chest.region);
      L.UI.refreshHud();
      return;
    }
    for (var j = 0; j < this.npcs.length; j++) {
      if (this.npcs[j].near(p, 1.8)) { this.npcs[j].interact(this); return; }
    }
    var tp = World.nearestTeleport(p.x, p.y);
    if (tp && Utils.dist(p.x, p.y, tp.x, tp.y) < 1.8) L.UI.togglePanel('map');
  };

  /* ---- 每帧更新 ---- */
  Game.prototype.update = function (dt) {
    if (this.state !== 'play') return;
    var p = this.player;

    /* 输入方向与瞄准：玩家屏幕位置 = 视口逻辑中心（CSS 像素），
     * 与鼠标/触摸坐标同一空间——修复了旧版缓冲/CSS 混用导致的瞄准偏移 */
    var cvw = Renderer.vw() / 2;
    var cvh = Renderer.vh() / 2;
    Input.update(cvw, cvh);

    /* UI 面板开关快捷键 */
    if (Input.consumePress('inv')) L.UI.togglePanel('inv');
    if (Input.consumePress('map')) L.UI.togglePanel('map');
    if (Input.consumePress('esc')) L.UI.closeAll();
    if (Input.consumePress('interact')) this.interact();

    /* 面板打开时暂停世界模拟（仅保留输入状态刷新） */
    if (L.UI.panel) { Input.update(cvw, cvh); return; }

    p.update(dt, Input, this);

    /* 氛围层推进：昼夜循环、屏幕震动衰减、天气粒子生成 */
    Fx.update(dt, this);

    /* 区域探索检测 */
    var rg = World.unlockRegionAt(p.x, p.y);
    if (rg) { Quest.onEvent('explore', rg.id); this.maybeSpawnBoss(rg); L.UI.refreshHud(); }
    /* 进入新区域时也检查 BOSS（已探索但未解放） */
    this._bossCheckT = (this._bossCheckT || 0) - dt;
    if (this._bossCheckT <= 0) {
      this._bossCheckT = 2;
      this.maybeSpawnBoss(Config.getRegionAt(Math.floor(p.x), Math.floor(p.y)));
    }

    /* 敌人刷新与更新 */
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      this.spawnEnemy(false);
    }
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }

      /* 远距离回收：防止玩家走遍全图后敌人无限累积（性能与逻辑双重保障）。
       * 普通/精英怪直接移除，由刷怪系统在玩家附近重新生成；
       * BOSS 移除时重置 bossSpawned 标记，保证玩家折返后仍能再次遇到并解放该区域。 */
      var farDist = Utils.dist2(e.x, e.y, p.x, p.y);
      if (farDist > 55 * 55) {
        if (e.rank === 'boss') {
          var erg = Config.getRegionAt(Math.floor(e.x), Math.floor(e.y));
          if (erg && World.bossSpawned[erg.id]) World.bossSpawned[erg.id] = false;
        }
        this.enemies.splice(i, 1);
        continue;
      }

      e.update(dt, p, this);
    }

    /* NPC */
    for (var n = 0; n < this.npcs.length; n++) this.npcs[n].update(dt);

    /* 弹道 */
    L.Projectile.updateAll(dt, this);

    /* 自动存档 + 联机同步 */
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 20; L.Save.save(this); }
    this.netTimer -= dt;
    if (this.netTimer <= 0) {
      this.netTimer = 0.05;
      Net.syncSelf(p);
      if (Net.isHost) Net.syncEnemies(this.enemies);
    }
  };

  /* ---- 主循环 ---- */
  Game.prototype.loop = function (ts) {
    var self = this;
    var dt = Math.min(0.05, (ts - self._last) / 1000 || 0.016);
    self._last = ts;

    if (self.state === 'play' || self.state === 'dead') {
      self.update(dt);
      Renderer.draw(self, dt);
      L.UI.refreshHud();
      self._mmT = (self._mmT || 0) - dt;
      if (self._mmT <= 0) { self._mmT = 0.25; L.UI.drawHudMinimap(); }
      /* HUD 显示/隐藏 */
      document.getElementById('hud').style.display = self.state === 'play' ? 'block' : 'none';
    }
    self._raf = requestAnimationFrame(function (t) { self.loop(t); });
  };

  Game.prototype.start = function () {
    var cv = document.getElementById('game-canvas');
    Renderer.attach(cv);
    Input.attach(cv);
    Fx.init();                 // 氛围层（天气/昼夜/震动）初始化
    L.UI.init(this);
    var self = this;
    self._last = Utils.now();
    self._raf = requestAnimationFrame(function (t) { self.loop(t); });
  };

  /* ---- 新游戏 / 读档入口（由开始界面调用） ---- */
  Game.prototype.newGame = function (name, seed) {
    this.setup({ name: name, seed: seed || ((Math.random() * 1e9) | 0) });
    this.begin(null);
    L.UI.toast('欢迎来到 legend 世界！先解放东南方的营地吧', '#7ee0ff');
  };
  Game.prototype.continueGame = function () {
    var data = L.Save.load();
    if (data) { this.begin(data); L.UI.toast('读档成功', '#9dff70'); }
    else this.newGame('勇者');
  };

  L.Game = Game;
  /* 全局单例，供 UI/各模块引用 */
  L.game = new Game();
})(window);
