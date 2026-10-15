/* ============================================================================
   js/game/enemy.js —— 敌人系统（Q71 军队人类，Q72 固定型+缓慢型混合）
   ----------------------------------------------------------------------------
   职责：生成/更新敌人 AI。敌人是"人类军队"，非幻想怪物。两类行为：
     - fixed 固定型（弩手/术士）：不移动，远程弹幕+范围预警（Q73）
     - slow  缓慢型（士兵/队长）：仅在玩家进入警戒5格后慢速逼近（Q74），离开即停
     精英/BOSS 用技能循环（Q37 三层AI）。难度不改移速（Q75）。

   对外接口（window.LG.Enemy）：
     .spawnRegion(region)  按区域生成敌人（密度随难度 Q63）
     .update(dt) .list[]
     .spawnBoss(region)
     .damage(e, n)  由 combat 调用

   依赖：config（类型/难度）、terrain、player（目标）、combat（伤害经bus）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const list = [];
  let diff = LG.Config.DIFFICULTY.default;

  function setDifficulty(d) { diff = d; }

  /* 在区域内生成敌人（数量=密度×难度，Q63 线性）
     阶段二十三清单109（用户确认映射）：区域专属兵种池 etypes——精英只从本区
     精英兵种里出，本区无精英兵种则不刷精英；etypes 缺省时回退全兵种混编 */
  function spawnRegion(region) {
    if (region.id === 'camp') return; // 营地是安全枢纽（NPC 聚落，Q42），不刷敌人
    const base = 18; // 每区域基础敌人数
    const n = Math.round(base * LG.Config.DIFFICULTY.density(diff) * (1 + region.lv * 0.1));
    const all = LG.Config.ENEMY_TYPES;
    const pool = (region.etypes && region.etypes.length)
      ? all.filter((t) => region.etypes.indexOf(t.id) >= 0) : all;
    for (let i = 0; i < n; i++) {
      // 随机找可走点
      let x, y, tries = 0;
      do {
        x = region.cx + LG.U.randInt(-100, 100);
        y = region.cy + LG.U.randInt(-100, 100);
        tries++;
      } while (!LG.Terrain.walkable(x, y) && tries < 20);
      if (!LG.Terrain.walkable(x, y)) continue;
      // 20% 精英（Q37）：限定本区精英兵种；无精英兵种的区域跳过
      const isElite = Math.random() < 0.2;
      const sub = pool.filter((t) => !!t.elite === isElite);
      if (!sub.length) continue;
      spawn(LG.U.pick(sub), x, y, region);
    }
  }

  function spawn(type, x, y, region) {
    const kind = type.elite ? 'elite' : 'normal';
    // 阶段二十三：生命/伤害=玩家10%基数×难度×精英档（清单表；玩家属性传入，见 Config.enemyStat）
    const st = LG.Config.enemyStat(type, diff, kind, LG.Player && LG.Player.stats);
    const e = {
      type, x, y, region,
      hp: st.hp, maxHp: st.hp, dmg: st.dmg,
      speed: st.speed, range: st.range, aspd: st.aspd, aggro: st.aggro,
      state: 'idle',            // idle | chase | attack
      atkCd: 0, skillCd: 0,
      kind,
      facing: -1, phase: 0, dir: 's',
    };
    list.push(e);
    return e;
  }

  function spawnBoss(region) {
    if (!region.boss) return null;
    // BOSS 用区域主题色放大绘制；属性=敌Stat(boss)档：基础生命×500-1000%、伤害+15-40%（清单表）
    const base = LG.Config.ENEMY_TYPES.find((t) => t.elite) || LG.Config.ENEMY_TYPES[0];
    const st = LG.Config.enemyStat(base, diff, 'boss', LG.Player && LG.Player.stats);
    const e = {
      type: { id: region.boss, zh: region.zh + '首领', en: region.en + ' Boss', move: 'slow',
              color: '#7a2f3c', elite: true },
      x: region.cx, y: region.cy, region,
      hp: st.hp, maxHp: st.hp, dmg: st.dmg,
      speed: 0.8, range: 3, aspd: 1.2, aggro: 12,
      state: 'idle', atkCd: 0, skillCd: 3, kind: 'boss',
      facing: -1, phase: 0, isBoss: true, dir: 's',
    };
    list.push(e);
    LG.Sound.play('boss');
    return e;
  }

  /* 脚印盒逐轴移动（与 player.js 同规则）：修复敌人追击/回家时身体侵入墙海，
     尤其"回家路径"此前完全没有碰撞检查（直接穿墙）。当前位形非法时放行以便脱困。 */
  function stepTo(e, nx, ny) {
    if (LG.Terrain.boxPenalty(e.x, e.y) === 0) {
      if (LG.Terrain.passableBox(nx, e.y)) e.x = nx;
      if (LG.Terrain.passableBox(e.x, ny)) e.y = ny;
    } else { e.x = nx; e.y = ny; }
  }

  /* 每帧 AI */
  function update(dt) {
    const px = LG.Player.x, py = LG.Player.y;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.hp <= 0) { list.splice(i, 1); continue; }
      const d = LG.U.dist(e.x, e.y, px, py);

      // 固定型：不移动，仅在射程内攻击（Q73 远程弹幕+范围预警）
      if (e.type.move === 'fixed') {
        if (d <= e.range && !LG.Player.down) {
          // 朝向玩家（4朝向精灵用）
          e.dir = Math.abs(px - e.x) > Math.abs(py - e.y) ? (px > e.x ? 'e' : 'w') : (py > e.y ? 's' : 'n');
          e.atkCd -= dt;
          if (e.atkCd <= 0) {
            e.atkCd = 1 / e.aspd;
            LG.U.bus.emit('enemy_shoot', e); // combat 处理弹道/预警
          }
        }
        continue;
      }

      // 缓慢型：警戒范围内才追击，离开则返回原地（Q74）
      const leash = e.home ? LG.U.dist(e.x, e.y, e.home.x, e.home.y) : 0;
      if (d <= e.aggro && !LG.Player.down) {
        if (!e.home) e.home = { x: e.x, y: e.y };
        e.state = 'chase';
        // 缓慢移动（速度固定，难度不改移速 Q75）；脚印盒碰撞防穿墙海
        const sp = e.speed * dt;
        const nx = e.x + ((px - e.x) / d) * sp, ny = e.y + ((py - e.y) / d) * sp;
        stepTo(e, nx, ny);
        e.facing = px > e.x ? 1 : -1;
        e.dir = Math.abs(px - e.x) > Math.abs(py - e.y) ? (px > e.x ? 'e' : 'w') : (py > e.y ? 's' : 'n');
        // 近身攻击
        if (d <= e.range) {
          e.atkCd -= dt;
          if (e.atkCd <= 0) {
            e.atkCd = 1 / e.aspd;
            LG.U.bus.emit('enemy_melee', e);
          }
        }
        // 精英/BOSS 技能循环（Q37）
        if (e.kind !== 'normal') {
          e.skillCd -= dt;
          if (e.skillCd <= 0) {
            e.skillCd = e.isBoss ? 4 : 6;
            e.phase = (e.phase + 1) % 3;
            LG.U.bus.emit('enemy_skill', e); // combat 处理范围技
          }
        }
      } else if (e.home && leash > 1) {
        // 脱战回家（补上碰撞检查：此前该路径完全不查地形，可直接穿墙回家）
        const hd = LG.U.dist(e.x, e.y, e.home.x, e.home.y);
        const sp = e.speed * dt;
        stepTo(e, e.x + ((e.home.x - e.x) / hd) * sp, e.y + ((e.home.y - e.y) / hd) * sp);
        e.dir = Math.abs(e.home.x - e.x) > Math.abs(e.home.y - e.y) ? (e.home.x > e.x ? 'e' : 'w') : (e.home.y > e.y ? 's' : 'n');
        e.state = 'idle';
      }
    }
  }

  /* 对敌人造成伤害；flags={crit,tri} 透传给 enemy_hit，供 P0 飘字分级（字号/颜色） */
  function damage(e, n, flags) {
    e.hp -= n;
    LG.U.bus.emit('enemy_hit', { e, n, flags });
    if (e.hp <= 0) LG.U.bus.emit('enemy_dead', e);
  }

  LG.Enemy = { list, update, spawnRegion, spawnBoss, damage, setDifficulty,
    clear() { list.length = 0; } };
})();
