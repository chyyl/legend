/* ============================================================================
   js/game/combat.js —— 战斗结算/弹道/反馈（Q22 武器形态，Q25 轻量反馈）
   ----------------------------------------------------------------------------
   职责：监听各类战斗事件（玩家攻击/敌人攻击/技能），处理：
     - 近战扇形 / 远程弹道 / 法杖AOE（Q22）
     - 自动攻击模式 on/off/half（Q19：half=只原地打不追击）
     - 伤害飘字/命中特效（Q25 轻量）
     - 掉落结算、经验银币入账

   对外接口（window.LG.Combat）：
     .init() .update(dt) .projectiles[] .effects[]
     .playerAttack()   由主循环按攻速调用

   依赖：bus 事件驱动，player/enemy/loot/inventory 均经事件解耦。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const projectiles = []; // {x,y,vx,vy,dmg,from,r,life}
  const effects = [];     // 轻量特效 {x,y,t,life,type,text,color}

  function init() {
    // 敌人近战 -> 玩家
    LG.U.bus.on('enemy_melee', (e) => {
      if (LG.Player.down) return;
      LG.Player.takeDamage(e.dmg);
      LG.Sound.play('hit');
    });
    // 敌人远程（固定型）-> 弹道
    LG.U.bus.on('enemy_shoot', (e) => {
      const px = LG.Player.x, py = LG.Player.y;
      const d = LG.U.dist(e.x, e.y, px, py) || 1;
      const speed = 7;
      projectiles.push({ x: e.x, y: e.y, vx: ((px - e.x) / d) * speed, vy: ((py - e.y) / d) * speed,
        dmg: e.dmg, from: 'enemy', r: 0.3, life: 3 });
      LG.Sound.play('shoot');
    });
    // 精英/BOSS 范围技（Q37）：地面预警圈后爆发
    LG.U.bus.on('enemy_skill', (e) => {
      effects.push({ x: LG.Player.x, y: LG.Player.y, t: 0, life: 1.2, type: 'warn', r: 2.2,
        onEnd: () => {
          const d = LG.U.dist(e.x, e.y, LG.Player.x, LG.Player.y);
          if (d < 2.2) LG.Player.takeDamage(e.dmg * 1.5); // 圈内受伤
        } });
    });
    // 敌人受击（P0 飘字分级：普通白字 14 / 暴击金字 18 / 三倍暴击橙红大字 24）
    LG.U.bus.on('enemy_hit', ({ e, n, flags }) => {
      const grade = flags && flags.tri ? { color: '#ff7a3c', size: 24, life: 0.95 }
        : flags && flags.crit ? { color: '#ffd777', size: 18, life: 0.75 }
        : { color: '#fff', size: 14, life: 0.6 };
      effects.push({ x: e.x, y: e.y - 1, t: 0, life: grade.life, type: 'text',
        text: '-' + Math.round(n), color: grade.color, size: grade.size });
      LG.Sound.play('hit');
      // 吸血羁绊（Q：攻击回血5%）
      const s = LG.Inv.calcStats();
      if (s.lifesteal > 0) LG.Player.heal(n * s.lifesteal);
    });
    // 敌人死亡：掉落结算
    LG.U.bus.on('enemy_dead', (e) => {
      // region 可能缺失（联机同步重建的敌人、测试注入对象），按当前位置解析兜底
      const erg = e.region || LG.Terrain.regionOf(e.x, e.y);
      const drop = LG.Loot.dropFromEnemy(e.kind, currentDifficulty(), erg && erg.lv ? erg.lv : 1);
      LG.Inv.silver += drop.silver;
      LG.Player.gainExp(drop.exp * LG.Inv.calcStats().expMul);
      drop.items.forEach((it) => LG.Inv.add(it));
      effects.push({ x: e.x, y: e.y - 1, t: 0, life: 0.8, type: 'text', text: '+' + drop.silver + '银', color: '#ffd700' });
      LG.Sound.play('pickup');
      LG.U.bus.emit('enemy_killed', e);
      // 药水补充（Q62：精英补充）
      if (e.kind !== 'normal' && LG.Player.potions < LG.Config.POTION_MAX) LG.Player.potions++;
    });
    // 玩家受击飘字
    LG.U.bus.on('damage', ({ target, amount }) => {
      if (target === LG.Player)
        effects.push({ x: LG.Player.x, y: LG.Player.y - 1, t: 0, life: 0.6, type: 'text', text: '-' + Math.round(amount), color: '#ff6060' });
    });
    LG.U.bus.on('dodge', () => {
      effects.push({ x: LG.Player.x, y: LG.Player.y - 1, t: 0, life: 0.5, type: 'text', text: '闪避', color: '#60ff90' });
    });
  }

  function currentDifficulty() {
    return (LG.Net && LG.Net.difficulty) || LG.Config.DIFFICULTY.default;
  }

  /* 玩家攻击：按武器形态（Q22）+ 攻击模式（Q19/Q24）
     manual：手动攻击（J键/手柄RT）置位后无视“模式关”，空挥或朝最近敌靠近 */
  let atkCd = 0, manual = false;
  function forceSwing() { manual = true; atkCd = 0; }
  function playerAttack(dt) {
    const P = LG.Player;
    if (P.down || (P.mode === 'off' && !manual)) return;
    const s = P.stats;
    if (!s) return; // 首帧防御：stats 未初始化时跳过
    const wpn = LG.Inv.equip.weapon;
    const kind = wpn ? wpn.kind : 'melee';
    const range = s.range;

    // 自动索敌：on=主动索敌并朝最近敌人，half=只打原地射程内不追击（Q19）
    let target = null, td = Infinity;
    for (const e of LG.Enemy.list) {
      if (e.hp <= 0) continue;
      const d = LG.U.dist(P.x, P.y, e.x, e.y);
      if (d < td && d <= range) { td = d; target = e; }
    }
    if (!target) {
      // 手动攻击（J键/手柄RT）：9格内有敌则走过去，否则朝面向方向空挥
      if (manual) {
        manual = false;
        let near = null, nd = 9;
        for (const e of LG.Enemy.list) {
          if (e.hp <= 0) continue;
          const d = LG.U.dist(P.x, P.y, e.x, e.y);
          if (d < nd) { nd = d; near = e; }
        }
        if (near && P.mode !== 'off') P.moveTo(near.x, near.y);
        else {
          // 空挥：斩击弧朝当前朝向（4方向）
          const sang = P.dir === 'n' ? -Math.PI / 2 : P.dir === 's' ? Math.PI / 2 : P.dir === 'e' ? 0 : Math.PI;
          effects.push({ x: P.x, y: P.y, t: 0, life: 0.15, type: 'slash', ang: sang, r: range });
          atkCd = 1 / (s.aspd || 1);
        }
      }
      return;
    }
    // half 模式不追击（已在原地射程内才打）；on 模式可朝目标微移
    if (P.mode === 'on' && td > range * 0.9 && !P.path.length) P.moveTo(target.x, target.y);

    atkCd -= dt;
    if (atkCd > 0) return;
    atkCd = 1 / (s.aspd || 1);
    manual = false; // 本次出手由自动索敌完成

    // 伤害（含暴击/三倍暴击）
    let dmg = s.dmg;
    let crit = false, tri = false;
    if (Math.random() < s.crit) { crit = true; dmg *= 2; }
    if (Math.random() < s.triCrit) { tri = true; dmg *= 3; }

    if (kind === 'melee') {
      // 近战扇形（Q22 arc）
      const arc = (wpn && LG.Config.WEAPONS.find(w => w.id === wpn.weaponId)?.arc) || 100;
      const half = (arc * Math.PI) / 180 / 2;
      const ang = Math.atan2(target.y - P.y, target.x - P.x);
      LG.Enemy.list.forEach((e) => {
        const d = LG.U.dist(P.x, P.y, e.x, e.y);
        if (d > range) return;
        const ea = Math.atan2(e.y - P.y, e.x - P.x);
        let da = Math.abs(((ea - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da <= half) LG.Enemy.damage(e, dmg, { crit, tri }); // flags 透传供飘字分级
      });
      effects.push({ x: P.x, y: P.y, t: 0, life: 0.15, type: 'slash', ang, r: range });
    } else if (kind === 'ranged') {
      const d = LG.U.dist(P.x, P.y, target.x, target.y) || 1;
      const sp = 11;
      projectiles.push({ x: P.x, y: P.y, vx: ((target.x - P.x) / d) * sp, vy: ((target.y - P.y) / d) * sp,
        dmg, from: 'player', r: 0.3, life: 2, crit, tri });
      LG.Sound.play('shoot');
    } else if (kind === 'magic') {
      // 法杖 AOE（Q22）
      const aoe = s.range * 0.3;
      LG.Enemy.list.forEach((e) => {
        if (LG.U.dist(target.x, target.y, e.x, e.y) <= aoe) LG.Enemy.damage(e, dmg, { crit, tri });
      });
      effects.push({ x: target.x, y: target.y, t: 0, life: 0.3, type: 'aoe', r: aoe });
    }
    if (crit || tri) LG.Sound.play('crit');
  }

  function update(dt) {
    playerAttack(dt);
    // 弹道推进与碰撞
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      let hit = false;
      if (p.from === 'player') {
        for (const e of LG.Enemy.list) {
          // 弹道命中：整颗 p 透传（含创建时记录的 crit/tri）供飘字分级
          if (e.hp > 0 && LG.U.dist(p.x, p.y, e.x, e.y) < 0.6) { LG.Enemy.damage(e, p.dmg, p); hit = true; break; }
        }
      } else {
        if (LG.U.dist(p.x, p.y, LG.Player.x, LG.Player.y) < 0.6) { LG.Player.takeDamage(p.dmg); hit = true; }
      }
      if (hit || p.life <= 0 || !LG.Terrain.walkable(p.x, p.y)) projectiles.splice(i, 1);
    }
    // 特效计时
    for (let i = effects.length - 1; i >= 0; i--) {
      const f = effects[i];
      f.t += dt;
      if (f.t >= f.life) { if (f.onEnd) f.onEnd(); effects.splice(i, 1); }
    }
  }

  LG.Combat = { init, update, projectiles, effects, forceSwing };
})();
