/* ============================================================================
   js/core/engine.js —— 主引擎（主循环/场景/渲染/交互/联机同步）
   ----------------------------------------------------------------------------
   职责：装配所有模块并驱动游戏：
     1) 场景：mainmenu -> lobby -> game（含暂停/菜单覆盖）
     2) 渲染：地形视口裁剪 / 实体 / 弹道 / 特效 / 迷雾 / HUD
     3) 交互：点击移动与交互、快捷键、移动HUD按钮、区域检测、宝箱、BOSS触发
     4) 联机：房主世界快照广播、客户端输入上报、远端玩家渲染

   对外接口（window.LG.Engine）：
     .start() 进入主菜单；.running

   依赖：所有模块（唯一允许直接引用各模块的装配层）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const Engine = { running: false, scene: 'menu', fps: 60, _lastRegion: null, _chests: [], _bossSpawned: {} };

  let canvas, g, DPR = 1;
  let lastT = 0, acc = 0, frames = 0, fpsT = 0;

  /* ================= 启动 ================= */
  /* 亮度应用（Q49）：仅≠1时注入 CSS filter，避免低端机每帧合成开销 */
  function applyBrightness(v) {
    const c = document.getElementById('game');
    if (c) c.style.filter = (v && v !== 1) ? 'brightness(' + v + ')' : 'none';
  }

  function start() {
    canvas = document.getElementById('game');
    LG.Input.init(canvas);
    LG.Camera.init(canvas);
    LG.UI.init(canvas);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    // 应用已存亮度（仅≠1时注入 filter，避免低端机每帧合成开销）
    applyBrightness(LG.U.LS.get('bright', 1));
    showMenu();
    requestAnimationFrame(loop);
  }

  /* ================= 主菜单 ================= */
  function showMenu() {
    Engine.scene = 'menu';
    const p = LG.UI.panel(LG.I18n.get('title'), `
      <div style="text-align:center;color:#9a8f70;font-size:14px;margin-bottom:10px">${LG.Config.LORE[LG.I18n.lang].slice(0, 90)}…</div>
      <div style="text-align:center">
        <button class="btn primary" id="mm-lobby">${LG.I18n.get('lobby')}</button>
        <button class="btn" id="mm-set">${LG.I18n.get('settings')}</button>
        <button class="btn" id="mm-lang">中文 / EN</button>
      </div>`);
    p.querySelector('#mm-lobby').onclick = () => { LG.Sound.init(); LG.Lobby.show(); };
    p.querySelector('#mm-set').onclick = () => LG.UI.renderSettings();
    p.querySelector('#mm-lang').onclick = () => { LG.I18n.set(LG.I18n.lang === 'zh' ? 'en' : 'zh'); showMenu(); };
  }

  /* ================= 开局（由 lobby 'start_game' 触发） ================= */
  function beginGame() {
    LG.UI.closePanel();
    // 角色创建（Q51）；场景在 bootWorld（地形生成后）才切换，避免渲染空世界崩溃
    LG.UI.charCreate(() => bootWorld());
  }

  function bootWorld() {
    // 世界生成（Q9 种子框架）
    LG.Terrain.generate(LG.Config.SEED);
    Engine.scene = 'game'; // 地形就绪后才进入游戏场景
    LG.Quest.init();
    LG.Combat.init();
    LG.NPC.spawnAll();
    LG.Enemy.clear();
    LG.Enemy.setDifficulty(LG.Net.difficulty);
    // 出生于营地（Q12 完全开放）
    const camp = LG.Config.REGIONS.find((r) => r.id === 'camp');
    LG.Player.spawn(camp.cx + 2, camp.cy + 2);
    LG.Camera.follow(LG.Player.x, LG.Player.y);
    spawnRegionOnce(camp);
    buildChests();
    LG.Save.autosave();
    LG.Sound.bgm(camp.id);
    // 教程（Q67 可跳过）
    setTimeout(() => LG.UI.tutorial(), 600);
    // 客户端开始上报（Q55 角色本地、世界随房主）
    if (!LG.Net.isHost) {
      setInterval(() => {
        LG.Net.send({ t: 'in', x: LG.Player.x, y: LG.Player.y, mode: LG.Player.mode,
          name: LG.Player._raw.name, look: LG.Player._raw.look, hp: LG.Player.hp, down: LG.Player.down });
      }, 100); // 10Hz 上报
    }
  }

  /* 区域首次进入时生成敌人（Q63 密度随难度） */
  function spawnRegionOnce(rg) {
    if (!rg || Engine._bossSpawned['vis_' + rg.id]) return;
    Engine._bossSpawned['vis_' + rg.id] = true;
    LG.Enemy.spawnRegion(rg);
  }

  /* 宝箱布置（Q44 随处都有）：每区域8个 */
  function buildChests() {
    Engine._chests.length = 0;
    LG.Config.REGIONS.forEach((rg) => {
      for (let i = 0; i < 8; i++) {
        let x, y, tries = 0;
        do { x = rg.cx + LG.U.randInt(-80, 80); y = rg.cy + LG.U.randInt(-80, 80); tries++; }
        while (!LG.Terrain.walkable(x, y) && tries < 25);
        if (LG.Terrain.walkable(x, y)) Engine._chests.push({ x, y, region: rg.id, opened: false });
      }
    });
  }

  /* ================= 主循环 ================= */
  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000; lastT = t;
    if (dt > 0.1) dt = 0.1; // 掉帧保护
    frames++; fpsT += dt;
    if (fpsT >= 1) { Engine.fps = frames; frames = 0; fpsT = 0; }

    if (Engine.scene !== 'game') return;

    handleHotkeys();
    LG.Input.updateMoveVec();
    LG.Camera.update();
    // 相机跟随玩家（每帧，传送/移动后立即生效）
    LG.Camera.follow(LG.Player.x, LG.Player.y);

    // 只更新玩家附近实体（Q60 性能：30帧保底/同屏100怪）
    const px = LG.Player.x, py = LG.Player.y;
    LG.Player.update(dt);
    const far = [];
    for (let i = LG.Enemy.list.length - 1; i >= 0; i--) {
      const e = LG.Enemy.list[i];
      if (LG.U.dist(e.x, e.y, px, py) > 45) far.push(e); // 远处冻结
    }
    // 冻结远处：临时剔除后更新再放回
    const frozen = [];
    for (let i = LG.Enemy.list.length - 1; i >= 0; i--) {
      if (LG.U.dist(LG.Enemy.list[i].x, LG.Enemy.list[i].y, px, py) > 45) frozen.push(LG.Enemy.list.splice(i, 1)[0]);
    }
    LG.Enemy.update(dt);
    frozen.forEach((e) => LG.Enemy.list.push(e));
    LG.Combat.update(dt);
    LG.NPC.update(dt);

    // 区域检测：切换BGM/生成敌人/BOSS
    const rg = LG.Terrain.regionOf(px, py);
    if (rg && rg !== Engine._lastRegion) {
      Engine._lastRegion = rg;
      spawnRegionOnce(rg);
      LG.Sound.bgm(rg.id);
      LG.U.bus.emit('enter_region', rg);
    }
    // BOSS 触发：接近区域中心（可重复刷 Q65）
    if (rg && rg.boss) {
      const alive = LG.Enemy.list.some((e) => e.isBoss && e.region === rg && e.hp > 0);
      if (!alive && LG.U.dist(px, py, rg.cx, rg.cy) < 25 && !Engine._coolBoss) {
        LG.Enemy.spawnBoss(rg);
        Engine._coolBoss = true; setTimeout(() => (Engine._coolBoss = false), 10000); // 10秒重复CD
      }
    }
    // 探索任务判定
    LG.Quest.checkExplore(px, py);

    render();
    LG.UI.drawHUD();
    sendSnapshot();
  }

  /* ================= 快捷键（一次性动作） ================= */
  function handleHotkeys() {
    const K = LG.Input.keymap, ks = LG.Input.state.keys;
    const once = (action, fn) => {
      const code = K[action];
      if (ks[code] && !Engine['_k_' + action]) { Engine['_k_' + action] = true; fn(); }
      else if (!ks[code]) Engine['_k_' + action] = false;
    };
    once('potion', () => LG.Player.usePotion());
    once('block', () => LG.Player.block());
    once('jump', () => LG.Player.jump());
    once('bag', () => LG.UI.renderBag());
    once('map', () => LG.UI.renderMap());
    once('quest', () => lgQuestPanel());
    once('mode', () => toggleMode());
    // 鼠标点击：交互优先，否则移动
    const c = LG.Input.consumeClick();
    if (c) {
      const w = LG.Camera.screenToWorld(c.x, c.y);
      const npc = LG.NPC.nearby(w.x, w.y);
      if (npc && LG.U.dist(LG.Player.x, LG.Player.y, npc.x, npc.y) < 3) { LG.NPC.interact(npc); return; }
      const chest = Engine._chests.find((ch) => !ch.opened && LG.U.dist(w.x, w.y, ch.x, ch.y) < 1.2);
      if (chest && LG.U.dist(LG.Player.x, LG.Player.y, chest.x, chest.y) < 3) { openChest(chest); return; }
      // 攻击模式按钮区（右上角）点击切换
      const W = window.innerWidth;
      if (c.x > W - 130 && c.y < 40) { toggleMode(); return; }
      LG.Player.moveTo(w.x, w.y);
    }
  }
  function toggleMode() {
    const order = ['on', 'half', 'off'];
    const next = order[(order.indexOf(LG.Player.mode) + 1) % 3];
    LG.Player.setMode(next);
    LG.UI.toast(LG.I18n.get('attack_mode') + ': ' + LG.I18n.get('mode_' + (next === 'on' ? 'on' : next === 'off' ? 'off' : 'half')));
  }
  function lgQuestPanel() { LG.UI.renderQuests(); }

  function openChest(ch) {
    ch.opened = true;
    const d = LG.Loot.openChest(LG.Net.difficulty, 2);
    LG.Inv.silver += d.silver;
    LG.Player.gainExp(d.exp);
    d.items.forEach((it) => LG.Inv.add(it));
    LG.Sound.play('pickup');
    LG.UI.toast('宝箱: +' + d.silver + '银' + (d.items.length ? ' ×' + d.items.length + '物品' : ''));
  }

  /* ================= 渲染 ================= */
  function render() {
    const W = canvas.width, H = canvas.height;
    g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = '#0b0d12'; g.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const view = LG.Camera.view();
    const Tsz = LG.Config.TILE, zoom = LG.Camera.zoomVal;
    const TILE_IMG = {};
    const typeNames = { 0: 'grass', 1: 'dirt', 2: 'sand', 3: 'snow', 4: 'rock', 5: 'water', 6: 'road', 7: 'rock', 8: 'castle', 9: 'void' };

    // 地形（视口裁剪）
    const x0 = Math.max(0, view.x0 | 0), y0 = Math.max(0, view.y0 | 0);
    const x1 = Math.min(LG.Config.SIZE - 1, view.x1 | 0), y1 = Math.min(LG.Config.SIZE - 1, view.y1 | 0);
    const draw = Tsz * zoom;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = LG.Terrain.tileAt(x, y);
        // 迷宫迷雾（Q17）：O(1) 区域判定，避免每瓦片扫描
        if (LG.Terrain.isMazeAt(x, y) && !LG.Terrain.fog.visible(x, y)) continue;
        const name = typeNames[t.type] || 'grass';
        const img = LG.Assets.tile(name);
        const s = LG.Camera.worldToScreen(x, y);
        g.drawImage(img, s.x, s.y, draw + 1, draw + 1);
        // 高差/矮障：画阴影（Q10 高差）
        if (t.height === 1) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(s.x, s.y + draw * 0.7, draw, draw * 0.3); }
        if (t.wall) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(s.x, s.y, draw, draw); }
        if (t.water) { g.fillStyle = 'rgba(120,180,255,0.15)'; g.fillRect(s.x, s.y, draw, draw); }
      }
    }

    // 宝箱
    Engine._chests.forEach((ch) => {
      if (ch.opened) return;
      if (ch.x < view.x0 || ch.x > view.x1 || ch.y < view.y0 || ch.y > view.y1) return;
      if (LG.Terrain.isMazeAt(ch.x, ch.y) && !LG.Terrain.fog.visible(ch.x, ch.y)) return;
      const s = LG.Camera.worldToScreen(ch.x, ch.y);
      g.drawImage(LG.Assets.chest(), s.x, s.y, draw, draw);
    });

    // NPC
    LG.NPC.list.forEach((n) => {
      if (n.x < view.x0 || n.x > view.x1 || n.y < view.y0 || n.y > view.y1) return;
      const s = LG.Camera.worldToScreen(n.x, n.y);
      g.drawImage(LG.Assets.hero({ gender: 'M', hairColor: '#888', skin: '#d8c0a0' }), s.x, s.y, draw, draw);
      g.fillStyle = '#d8b45a'; g.font = Math.max(10, 11 * zoom) + 'px sans-serif'; g.textAlign = 'center';
      g.fillText(n.zh || n.en, s.x + draw / 2, s.y - 4);
    });

    // 敌人（人类军队）
    LG.Enemy.list.forEach((e) => {
      if (e.x < view.x0 || e.x > view.x1 || e.y < view.y0 || e.y > view.y1) return;
      if (LG.Terrain.isMazeAt(e.x, e.y) && !LG.Terrain.fog.visible(e.x, e.y)) return;
      const s = LG.Camera.worldToScreen(e.x, e.y);
      const size = e.isBoss ? draw * 2 : draw;
      const img = e.isBoss ? LG.Assets.boss(e.type.id, e.type.color) : LG.Assets.enemy(e.type);
      g.drawImage(img, s.x - (e.isBoss ? draw / 2 : 0), s.y - (e.isBoss ? draw : 0), size, size);
      // 血条
      if (e.hp < e.maxHp && !e.isBoss) {
        g.fillStyle = '#222'; g.fillRect(s.x + 2, s.y - 8, draw - 4, 4);
        g.fillStyle = e.kind === 'normal' ? '#c0392b' : '#f39c12';
        g.fillRect(s.x + 2, s.y - 8, (draw - 4) * (e.hp / e.maxHp), 4);
      }
    });

    // 远端玩家（联机可见 Q52）
    Object.keys(LG.Net.peers || {}).forEach((id) => {
      const pr = LG.Net.peers[id];
      if (pr.x == null) return;
      const s = LG.Camera.worldToScreen(pr.x, pr.y);
      g.drawImage(LG.Assets.hero(pr.look || {}), s.x, s.y, draw, draw);
      g.fillStyle = '#6cf'; g.font = '11px sans-serif'; g.textAlign = 'center';
      g.fillText(pr.name || '玩家', s.x + draw / 2, s.y - 4);
    });

    // 本体玩家（跳跃时上浮，Q21 伪跳跃）
    const ps = LG.Camera.worldToScreen(LG.Player.x, LG.Player.y);
    const jumpOffset = LG.Player.jumping ? -10 * zoom : 0;
    g.save();
    if (LG.Player.down) g.globalAlpha = 0.5;
    if (LG.Player.blockUntil > performance.now() / 1000) {
      g.strokeStyle = '#7fb3ff'; g.lineWidth = 2;
      g.beginPath(); g.arc(ps.x + draw / 2, ps.y + draw / 2, draw * 0.7, 0, Math.PI * 2); g.stroke();
    }
    const look = LG.Player._raw.look || {};
    const hero = LG.Assets.hero(LG.Player._raw.gender === 'F' ? { ...look, gender: 'F' } : look);
    if (LG.Player.facing < 0) { g.translate(ps.x + draw, 0); g.scale(-1, 1); g.drawImage(hero, 0, ps.y + jumpOffset, draw, draw); }
    else g.drawImage(hero, ps.x, ps.y + jumpOffset, draw, draw);
    g.restore();

    // 弹道
    LG.Combat.projectiles.forEach((p) => {
      const s = LG.Camera.worldToScreen(p.x, p.y);
      g.fillStyle = p.from === 'player' ? '#ffe08a' : '#ff7a7a';
      g.beginPath(); g.arc(s.x + draw / 2, s.y + draw / 2, Math.max(2, 3 * zoom), 0, Math.PI * 2); g.fill();
    });

    // 特效（飘字/斩击/预警/AOE，Q25 轻量）
    LG.Combat.effects.forEach((f) => {
      const s = LG.Camera.worldToScreen(f.x, f.y);
      const k = f.t / f.life;
      if (f.type === 'text') {
        g.globalAlpha = 1 - k; g.fillStyle = f.color;
        g.font = 'bold ' + Math.max(12, 14 * zoom) + 'px sans-serif'; g.textAlign = 'center';
        g.fillText(f.text, s.x + draw / 2, s.y - k * 24);
        g.globalAlpha = 1;
      } else if (f.type === 'slash') {
        g.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; g.lineWidth = 3;
        g.beginPath(); g.arc(s.x + draw / 2, s.y + draw / 2, f.r * Tsz * zoom, f.ang - 0.6, f.ang + 0.6); g.stroke();
      } else if (f.type === 'warn') {
        g.strokeStyle = 'rgba(255,80,80,' + (0.3 + 0.5 * k) + ')'; g.lineWidth = 2;
        g.beginPath(); g.arc(s.x + draw / 2, s.y + draw / 2, f.r * Tsz * zoom, 0, Math.PI * 2); g.stroke();
      } else if (f.type === 'aoe') {
        g.fillStyle = 'rgba(155,127,212,' + (0.5 * (1 - k)) + ')';
        g.beginPath(); g.arc(s.x + draw / 2, s.y + draw / 2, f.r * Tsz * zoom, 0, Math.PI * 2); g.fill();
      }
    });

    // 倒地救援提示（Q26）
    if (LG.Player.down) {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, window.innerWidth, window.innerHeight);
      g.fillStyle = '#ff6060'; g.font = '24px sans-serif'; g.textAlign = 'center';
      g.fillText(LG.I18n.get('down_rescue') + ' ' + Math.ceil(LG.Player._raw.downTimer), window.innerWidth / 2, window.innerHeight / 2);
      g.fillStyle = '#ccc'; g.font = '16px sans-serif';
      g.fillText(LG.I18n.get('back_camp') + ' (' + LG.Config.SILVER_DROP_PENALTY * 100 + '% 银币)', window.innerWidth / 2, window.innerHeight / 2 + 30);
    }

    // 移动端操作按钮（触屏 Q18）
    if ('ontouchstart' in window) drawTouchButtons();
  }

  function drawTouchButtons() {
    const W = window.innerWidth, H = window.innerHeight;
    const btn = (x, y, r, label, hot) => {
      g.fillStyle = hot ? 'rgba(216,180,90,0.5)' : 'rgba(0,0,0,0.4)';
      g.strokeStyle = '#4a5064';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.textAlign = 'center';
      g.fillText(label, x, y + 5);
      return { x, y, r };
    };
    Engine._tbtns = [
      btn(W - 60, H - 70, 30, LG.I18n.get('jump'), false),
      btn(W - 130, H - 110, 28, LG.I18n.get('block'), LG.Player.blockUntil > performance.now() / 1000),
      btn(W - 60, H - 150, 26, LG.I18n.get('potion') + LG.Player.potions, LG.Player.potions > 0),
      btn(W - 200, H - 70, 24, LG.I18n.get('bag'), false),
    ];
    // 触屏按钮点击判定
    const c = LG.Input.state.click;
    if (c) {
      for (const b of Engine._tbtns) {
        if (LG.U.dist(c.x, c.y, b.x, b.y) <= b.r) {
          if (b === Engine._tbtns[0]) LG.Player.jump();
          else if (b === Engine._tbtns[1]) LG.Player.block();
          else if (b === Engine._tbtns[2]) LG.Player.usePotion();
          else if (b === Engine._tbtns[3]) LG.UI.renderBag();
        }
      }
    }
  }

  /* ================= 联机同步 ================= */
  function sendSnapshot() {
    if (!LG.Net.isHost || !LG.Net.connected) return;
    // 房主10Hz快照：敌人+宝箱+难度（Q55 世界随房主）
    if (!Engine._snapAcc) Engine._snapAcc = 0;
    Engine._snapAcc += 1;
    if (Engine._snapAcc % 6 !== 0) return; // ~10Hz（60fps/6）
    const enemies = LG.Enemy.list.map((e, i) => ({
      i, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10,
      hp: e.hp, max: e.maxHp, kind: e.kind, boss: !!e.isBoss, tid: e.type.id,
    }));
    LG.Net.broadcast({ t: 'snap', enemies, difficulty: LG.Net.difficulty });
  }

  /* 客户端收到消息的处理（订阅） */
  function bindNet() {
    LG.U.bus.on('start_game', beginGame);
    LG.U.bus.on('net_msg', (m) => {
      if (m.t === 'snap' && !LG.Net.isHost) {
        // 客户端按快照渲染远端敌人（简化：位置+血量覆盖）
        applySnapshot(m);
      }
      if (m.t === 'peer_state' && LG.Net.isHost) { /* 预留 */ }
    });
    // 客户端输入 -> 房主应用远端玩家
    LG.U.bus.on('peer_input', (m) => {
      LG.Net.peers['p1'] = LG.Net.peers['p1'] || {};
      Object.assign(LG.Net.peers['p1'], m);
    });
    LG.U.bus.on('net_msg', (m) => {
      if (m.t === 'in' && LG.Net.isHost) {
        LG.Net.peers['p1'] = LG.Net.peers['p1'] || {};
        Object.assign(LG.Net.peers['p1'], m);
      }
    });
  }

  function applySnapshot(m) {
    // 客户端：用主机数据填充敌人表（保持本地已有数量，位置血量以主机为准）
    m.enemies.forEach((se) => {
      let e = LG.Enemy.list[se.i];
      if (!e) {
        // 按类型重建
        const type = LG.Config.ENEMY_TYPES.find((t) => t.id === se.tid) || LG.Config.ENEMY_TYPES[0];
        e = { type, x: se.x, y: se.y, hp: se.hp, maxHp: se.max, dmg: type.dmg, speed: type.speed,
              range: type.range, aspd: type.aspd, aggro: type.aggro, state: 'idle', atkCd: 0,
              skillCd: 0, kind: se.kind, isBoss: se.boss, facing: -1, phase: 0,
              region: Engine._lastRegion };
        LG.Enemy.list[se.i] = e;
      } else { e.x = se.x; e.y = se.y; e.hp = se.hp; e.maxHp = se.max; }
    });
  }

  LG.Engine = Engine;
  Engine.start = start;
  Engine.applyBrightness = applyBrightness;
  Engine.bindNet = bindNet; // main.js 调用
})();
