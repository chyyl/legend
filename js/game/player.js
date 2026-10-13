/* ============================================================================
   js/game/player.js —— 玩家角色（Q41 自动回血，Q62 限量药水，Q23 格挡，Q21 伪跳跃）
   ----------------------------------------------------------------------------
   职责：玩家位置/移动（点击寻路+WASD/摇杆）、生命/经验/等级（1-10封顶 Q31）、
         自动回血、药水、格挡、伪跳跃、攻击模式 on/off/half（Q19/Q24）。

   对外接口（window.LG.Player）：
     .spawn(x,y) .update(dt) .pos .level .exp .hp .maxHp
     .gainExp(n) .takeDamage(n) .heal(n) .usePotion() .block() .jump()
     .setMode(m) 'on'|'off'|'half'   .mode
     .moveTo(x,y)  设置点击寻路目标
     .down .revive()

   依赖：config/utils/terrain/pathfinding/inventory/combat（经 bus 通信）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const P = {
    x: 1500, y: 1500,        // 起点=营地（Q12 完全开放，仍以营地为出生点）
    level: 1, exp: 0, expTo: 100,
    hp: 100, potions: LG.Config.POTION_MAX,
    mode: 'on',              // Q24：纯自动攻击开关
    down: false, downTimer: 0,
    blockUntil: 0, blockCdUntil: 0,
    jumpUntil: 0, jumping: false,
    path: [], moveTarget: null,
    speed: 3,                // 格/秒，基础移速
    facing: 1,
    stats: null,
  };

  function spawn(x, y) { P.x = x; P.y = y; P.hp = P.stats ? P.stats.maxHp : 100; P.down = false; P.path = []; }

  function expNeed(lv) { return 100 + (lv - 1) * 60; }

  /* 经验获取（Q31：满级溢出转银币） */
  function gainExp(n) {
    if (P.level >= LG.Config.MAX_LEVEL) { LG.Inv.silver += Math.round(n * 0.2); return; }
    P.exp += n;
    while (P.exp >= P.expTo && P.level < LG.Config.MAX_LEVEL) {
      P.exp -= P.expTo; P.level++; P.expTo = expNeed(P.level);
      P.hp = P.stats.maxHp; // 升级满血
      LG.Sound.play('levelup');
      LG.U.bus.emit('levelup', P.level);
    }
    if (P.level >= LG.Config.MAX_LEVEL) { P.exp = 0; P.expTo = 0; } // 封顶
  }

  function takeDamage(n) {
    if (P.down) return;
    const now = performance.now() / 1000;
    if (now < P.blockUntil) n *= (1 - LG.Config.BLOCK_REDUCE); // 格挡减伤50%
    // 闪避判定
    if (P.stats && Math.random() < P.stats.dodge) { LG.U.bus.emit('dodge', P); return; }
    n = Math.max(1, Math.round(n - (P.stats ? P.stats.def * 0.1 : 0)));
    P.hp -= n;
    LG.U.bus.emit('damage', { target: P, amount: n });
    if (P.hp <= 0) {
      // Q：不死金牌羁绊 → 致命伤免死
      if (P.stats && P.stats.phoenix && !P._phoenixUsed) {
        P._phoenixUsed = true; P.hp = 1; P.blockUntil = now + 5;
        setTimeout(() => (P._phoenixUsed = false), 60000);
        return;
      }
      P.hp = 0; P.down = true; P.downTimer = LG.Config.DOWN_RESCUE_SEC;
      LG.Sound.play('death');
      LG.U.bus.emit('player_down', P);
    }
  }
  function heal(n) { P.hp = Math.min(P.stats.maxHp, P.hp + n); }

  function usePotion() {
    if (P.potions <= 0 || P.down) return;
    P.potions--;
    heal(P.stats.maxHp * LG.Config.POTION_HEAL);
    LG.Sound.play('pickup');
  }

  /* 格挡（Q23）：减伤50%，持续2s，冷却3s */
  function block() {
    const now = performance.now() / 1000;
    if (now < P.blockCdUntil || P.down) return;
    P.blockUntil = now + LG.Config.BLOCK_SEC;
    P.blockCdUntil = now + LG.Config.BLOCK_CD;
    LG.Sound.play('block');
  }

  /* 伪跳跃（Q21）：翻越1格矮障碍，视觉位移+短暂无敌，不改平面坐标 */
  function jump() {
    if (P.jumping || P.down) return;
    P.jumping = true; P.jumpUntil = performance.now() / 1000 + 0.35;
  }

  function setMode(m) { P.mode = m; }
  function moveTo(x, y) {
    P.path = LG.Path.find(P.x, P.y, x, y) || [];
    P.moveTarget = { x, y };
  }

  /* 每帧更新：移动/回血/倒计时 */
  function update(dt) {
    P.stats = LG.Inv.calcStats();
    if (!P.spawnedHpInit) { P.hp = P.stats.maxHp; P.spawnedHpInit = true; }

    if (P.down) {
      P.downTimer -= dt;
      if (P.downTimer <= 0) revive(false); // 超时回营地
      return;
    }

    const now = performance.now() / 1000;
    if (P.jumping && now > P.jumpUntil) P.jumping = false;

    // 自动回血（Q41：每秒2%最大生命）
    if (P.hp < P.stats.maxHp) heal(P.stats.maxHp * LG.Config.REGEN_HP_PER_S * dt);

    // 移动：键盘/摇杆向量优先，否则点击寻路
    const mv = LG.Input.state.moveVec;
    let dx = 0, dy = 0;
    if (mv.x || mv.y) { dx = mv.x; dy = mv.y; P.path = []; }
    else if (P.path.length) {
      const nxt = P.path[0];
      const d = LG.U.dist(P.x, P.y, nxt.x, nxt.y);
      if (d < 0.15) P.path.shift();
      else { dx = (nxt.x - P.x) / d; dy = (nxt.y - P.y) / d; }
    }
    if (dx || dy) {
      const sp = (P.speed + P.stats.spd) * dt;
      const nx = P.x + dx * sp, ny = P.y + dy * sp;
      // 碰撞：可走或可跳（跳跃状态可越过矮障）
      if (LG.Terrain.walkable(nx, P.y)) P.x = nx;
      else if (P.jumping && LG.Terrain.jumpable(nx, P.y)) P.x = nx;
      if (LG.Terrain.walkable(P.x, ny)) P.y = ny;
      else if (P.jumping && LG.Terrain.jumpable(P.x, ny)) P.y = ny;
      if (dx !== 0) P.facing = dx > 0 ? 1 : -1;
      LG.Terrain.fog.reveal(P.x, P.y); // 迷宫迷雾揭示
    }
  }

  /* 倒地救援/超时复活（Q26/Q66） */
  function rescue() { if (P.down) { P.hp = P.stats.maxHp * 0.5; P.down = false; } }
  function revive(backToCamp) {
    // Q66：回营地掉10%银币
    LG.Inv.silver = Math.max(0, Math.round(LG.Inv.silver * (1 - LG.Config.SILVER_DROP_PENALTY)));
    P.down = false; P.hp = P.stats.maxHp;
    const camp = LG.Config.REGIONS.find((r) => r.id === LG.Config.RESPAWN_REGION);
    spawn(camp.cx, camp.cy);
  }

  LG.Player = {
    get x() { return P.x; }, get y() { return P.y; },
    set x(v) { P.x = v; }, set y(v) { P.y = v; },
    get level() { return P.level; }, get exp() { return P.exp; }, get expTo() { return P.expTo; },
    get hp() { return P.hp; }, get maxHp() { return P.stats ? P.stats.maxHp : 100; },
    get potions() { return P.potions; }, set potions(v) { P.potions = v; },
    get mode() { return P.mode; }, get down() { return P.down; },
    get facing() { return P.facing; }, get jumping() { return P.jumping; },
    get blockUntil() { return P.blockUntil; },
    get stats() { return P.stats || null },
    get path() { return P.path; },
    _raw: P,
    spawn, update, gainExp, takeDamage, heal, usePotion, block, jump, setMode, moveTo,
    rescue, revive,
  };
})();
