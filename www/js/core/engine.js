/* ============================================================================
   js/core/engine.js —— 主引擎（主循环/场景/渲染/交互/联机同步）
   ----------------------------------------------------------------------------
   职责：装配所有模块并驱动游戏：
     1) 场景：mainmenu -> lobby -> game（含暂停/菜单覆盖）
     2) 渲染：地形视口裁剪 / 实体 / 弹道 / 特效 / 迷雾 / HUD
     3) 交互：点击移动与交互（点远处 NPC/宝箱自动走过去）、键盘/手柄/触屏按钮、
        悬停高亮与交互提示、区域检测、宝箱、BOSS触发
     4) 联机：房主世界快照广播、客户端输入上报、远端玩家渲染

   对外接口（window.LG.Engine）：
     .start() 进入主菜单；.running
     .applyBrightness(v) 亮度滤镜；.bindNet() 绑定联机事件（main.js 调用）

   依赖：所有模块（唯一允许直接引用各模块的装配层）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const Engine = { running: false, scene: 'menu', fps: 60, _lastRegion: null, _chests: [], _bossSpawned: {}, _pending: null };

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

  /* ================= 主菜单（阶段十二：标题画面化） ================= */
  function showMenu() {
    Engine.scene = 'menu';
    const zh = LG.I18n.lang === 'zh';
    const lore = LG.Config.LORE[LG.I18n.lang] || '';
    // 阶段十五：有存档时主按钮变"继续游戏"，另加"新游戏"（清意向直开=重走角色创建）
    const hasSave = LG.Save.hasSave(1);
    const p = LG.UI.panel('', `
      <div class="menu-logo">
        <div class="logo-main">LEGEND</div>
        <div class="logo-sub">${zh ? '· 传 奇 ·' : '· CHRONICLES ·'}</div>
      </div>
      <div class="menu-lore">${lore.length > 110 ? lore.slice(0, 110) + '…' : lore}</div>
      <div class="menu-btns">
        <button class="btn primary" id="mm-start">${LG.I18n.get(hasSave ? 'continue_game' : 'start_game')}</button>
        ${hasSave ? `<button class="btn" id="mm-new">${LG.I18n.get('new_game')}</button>` : ''}
        <button class="btn" id="mm-lobby">${LG.I18n.get('lobby')}</button>
        <button class="btn" id="mm-set">${LG.I18n.get('settings')}</button>
        <button class="btn" id="mm-lang">中文 / EN</button>
      </div>
      <div class="menu-foot">${zh ? 'HTML5 Canvas · 离线可玩 · 1-4 人联机' : 'HTML5 Canvas · Offline · 1-4 Co-op'}</div>`);
    p.classList.add('menu-panel');
    // 开始游戏 = 单人直开（不经联机大厅）；联机大厅为独立入口（拆分"开始游戏与联机大厅在一起"）
    p.querySelector('#mm-start').onclick = () => { LG.Sound.init(); LG.Save.setContinue(true); LG.Lobby.startSolo(); };
    const mmNew = p.querySelector('#mm-new');
    if (mmNew) mmNew.onclick = () => { LG.Sound.init(); LG.Save.setContinue(false); LG.Lobby.startSolo(); };
    p.querySelector('#mm-lobby').onclick = () => { LG.Sound.init(); LG.Save.setContinue(false); LG.Lobby.show(); };
    p.querySelector('#mm-set').onclick = () => LG.UI.renderSettings();
    p.querySelector('#mm-lang').onclick = () => { LG.I18n.set(LG.I18n.lang === 'zh' ? 'en' : 'zh'); showMenu(); };
  }

  /* ================= 菜单/大厅场景氛围背景 =================
     阶段十二：主菜单不再是纯黑死屏 —— 深渊渐变 + 顶部金晕 + 金色尘埃缓升。
     仅 scene ≠ game 时每帧调用（粒子量小，桌面/手机均无压力）。 */
  const amb = { ps: null };
  function renderAmbience(dt) {
    if (!canvas) return;
    g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const W = window.innerWidth, H = window.innerHeight;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#131726'); grad.addColorStop(0.55, '#0c0f18'); grad.addColorStop(1, '#07080d');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const rg = g.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, Math.max(W, H) * 0.75);
    rg.addColorStop(0, 'rgba(216,180,90,0.10)'); rg.addColorStop(1, 'rgba(216,180,90,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    if (!amb.ps) {
      amb.ps = [];
      for (let i = 0; i < 70; i++) amb.ps.push({
        x: Math.random() * W, y: Math.random() * H,
        s: 1 + Math.random() * 2, v: 6 + Math.random() * 16, p: Math.random() * 6.28,
      });
    }
    for (let i = 0; i < amb.ps.length; i++) {
      const pt = amb.ps[i];
      pt.y -= pt.v * dt; pt.p += dt * 2;
      if (pt.y < -6) { pt.y = H + 6; pt.x = Math.random() * W; }
      if (pt.x > W + 6) pt.x = -6;
      g.fillStyle = 'rgba(230,196,120,' + (0.18 + 0.35 * (0.5 + 0.5 * Math.sin(pt.p))).toFixed(2) + ')';
      g.fillRect(pt.x, pt.y, pt.s, pt.s);
    }
  }

  /* ================= P0：游戏内主题氛围粒子 + 伪光照 =================
     屏幕空间粒子池（42 粒，零分配复用）：loop 每帧调 updateParticles(dt)，
     render 世界层画完后依次 drawLighting()（径向暗角）+ drawParticles()。
     换区域即换主题（biome → PARTICLE_THEME）：草原飞絮/农场谷壳/海岸盐雾/
     迷宫磷光/岩岭尘灰/雪原飘雪/城堡火星/虚空幽光/其它金色萤光。 */
  const P_N = 42;
  const PRTC = { ps: [], th: null };
  const PARTICLE_THEME = {
    plain:   { c: '167,209,112', vx: -16, vy: 22,  a: 0.45, sz: 2.2 }, // 草原：草籽斜落
    farm:    { c: '214,196,120', vx: -10, vy: 28,  a: 0.50, sz: 2.4 }, // 农场：谷壳飘落
    coast:   { c: '175,225,255', vx: 14,  vy: -6,  a: 0.50, sz: 2.0 }, // 海岸：盐雾光点上浮
    maze:    { c: '110,240,200', vx: -5,  vy: -12, a: 0.55, sz: 2.0 }, // 迷宫：幽绿磷光
    rock:    { c: '195,175,155', vx: -8,  vy: 30,  a: 0.35, sz: 2.0 }, // 兵工厂/骷髅岛：尘灰
    snow:    { c: '235,245,255', vx: -20, vy: 36,  a: 0.65, sz: 2.4 }, // 雪原：飘雪
    castle:  { c: '255,170,90',  vx: -6,  vy: -16, a: 0.50, sz: 2.2 }, // 城堡：火星上浮
    void:    { c: '175,145,255', vx: -6,  vy: -14, a: 0.55, sz: 2.2 }, // 终末之战：虚空幽光
    default: { c: '230,196,120', vx: -6,  vy: -10, a: 0.40, sz: 1.8 }, // 其它：金色萤光
  };

  function updateParticles(dt) {
    if (Engine.scene !== 'game') return;
    const W = window.innerWidth, H = window.innerHeight;
    const rg = LG.Terrain.regionOf(LG.Player.x, LG.Player.y);
    const th = PARTICLE_THEME[(rg && rg.biome)] || PARTICLE_THEME.default;
    if (PRTC.th !== th) { PRTC.th = th; PRTC.ps.length = 0; } // 换区域重铺粒子（取新主题的速度/颜色）
    const ps = PRTC.ps;
    while (ps.length < P_N) ps.push({
      x: Math.random() * W, y: Math.random() * H,
      ph: Math.random() * 6.28, k: 0.7 + Math.random() * 0.6,
    });
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.ph += dt * 2;
      p.x += (th.vx + Math.sin(p.ph) * 9) * dt; // 横向基础风速 + 正弦摆动
      p.y += th.vy * dt;
      if (p.x < -8) p.x = W + 8; else if (p.x > W + 8) p.x = -8;
      if (p.y < -8) p.y = H + 8; else if (p.y > H + 8) p.y = -8;
    }
  }

  function drawParticles() {
    const th = PRTC.th;
    if (!th) return;
    for (let i = 0; i < PRTC.ps.length; i++) {
      const p = PRTC.ps[i];
      const a = th.a * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(p.ph))); // 呼吸透明度
      g.fillStyle = 'rgba(' + th.c + ',' + a.toFixed(3) + ')';
      const s = th.sz * p.k;
      g.fillRect(p.x, p.y, s, s);
    }
  }

  /* P0 伪光照：以玩家为中心铺径向暗角（世界层之上、HUD 之下）。
     洞穴/虚空/城堡生物群落更暗更深，平原保持轻微暗角提升氛围与可读性。 */
  function drawLighting() {
    const W = window.innerWidth, H = window.innerHeight;
    const rg = LG.Terrain.regionOf(LG.Player.x, LG.Player.y);
    const biome = (rg && rg.biome) || '';
    const dark = biome === 'void' ? 0.66 : biome === 'maze' ? 0.60
      : biome === 'castle' ? 0.50 : 0.34;
    const draw = LG.Config.TILE * LG.Camera.zoomVal;
    const ps = LG.Camera.worldToScreen(LG.Player.x, LG.Player.y);
    const cx = ps.x + draw / 2, cy = ps.y + draw / 2;
    const rad = Math.max(W, H) * (biome === 'maze' ? 0.45 : 0.58);
    const gd = g.createRadialGradient(cx, cy, rad * 0.30, cx, cy, rad);
    gd.addColorStop(0, 'rgba(4,6,12,0)');
    gd.addColorStop(1, 'rgba(4,6,12,' + dark + ')');
    g.fillStyle = gd;
    g.fillRect(0, 0, W, H);
  }

  /* ================= 开局（由 lobby 'start_game' 触发） ================= */
  function beginGame(ev) {
    LG.UI.closePanel();
    // 阶段十五：单人且主菜单"继续游戏"置位 → 读档续玩
    // （意向单次消费：联机大厅等其它入口即使残留意向也只清不带档）
    const solo = !ev || !ev.players || ev.players.length <= 1;
    if (LG.Save.consumeContinue() && solo) {
      const d = LG.Save.raw(1);
      if (d) { bootWorld(d); return; }
    }
    // 角色创建（Q51）；场景在 bootWorld（地形生成后）才切换，避免渲染空世界崩溃
    LG.UI.charCreate(() => bootWorld());
  }

  /* saved 传入=读档续玩（阶段十五）：按存档种子重建世界并恢复全部状态 */
  function bootWorld(saved) {
    LG.UI.closePanel(); // 角色创建关闭时可能回弹了主菜单面板（menu 场景），此处清掉再进世界
    // 世界生成（Q9 种子框架；读档按存档种子重建 → 同种子同世界 Q59）
    LG.Terrain.generate(saved ? saved.seed : LG.Config.SEED);
    Engine.scene = 'game'; // 地形就绪后才进入游戏场景
    Engine._lastRegion = null; // 清区域追踪：读档/重开后首帧重新触发区域生成与 BGM
    LG.Quest.init();
    LG.Combat.init();
    LG.NPC.spawnAll();
    LG.Enemy.clear();
    LG.Enemy.setDifficulty(saved ? saved.difficulty : LG.Net.difficulty);
    const camp = LG.Config.REGIONS.find((r) => r.id === 'camp');
    if (!saved) LG.Player.spawn(camp.cx + 2, camp.cy + 2); // 出生于营地（Q12 完全开放）
    buildChests();
    // 读档恢复（须在 buildChests 之后：宝箱整表替换；新档走 camp 出生）
    if (saved) LG.Save.apply(saved);
    LG.Camera.follow(LG.Player.x, LG.Player.y);
    if (!saved) spawnRegionOnce(camp); // 读档者由首帧区域检测生成所在区域敌人
    LG.Save.autosave();
    LG.Sound.bgm(saved ? ((LG.Terrain.regionOf(LG.Player.x, LG.Player.y) || {}).id || camp.id) : camp.id);
    // 教程（Q67 可跳过）
    setTimeout(() => LG.UI.tutorial(), 600);
    // 客户端开始上报（Q55 角色本地、世界随房主）
    if (!LG.Net.isHost) {
      setInterval(() => {
        LG.Net.send({ t: 'in', x: LG.Player.x, y: LG.Player.y, mode: LG.Player.mode,
          name: LG.Player._raw.name, look: playerLook(), hp: LG.Player.hp, down: LG.Player.down });
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

    if (Engine.scene !== 'game') { renderAmbience(dt); return; }

    handleHotkeys();
    LG.Input.updateMoveVec();
    LG.Camera.update();
    // 相机跟随玩家（每帧，传送/移动后立即生效）
    LG.Camera.follow(LG.Player.x, LG.Player.y);

    // 只更新玩家附近实体（Q60 性能：30帧保底/同屏100怪）
    const px = LG.Player.x, py = LG.Player.y;
    LG.Player.update(dt);
    resolvePending(); // 寻路到达 NPC/宝箱后自动交互（点击远处目标的闭环）
    // 冻结远处敌人：临时剔除 -> 更新 -> 放回（45格外不更新 AI/移动）
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

    updateParticles(dt); // 主题氛围粒子（P0）：按当前区域生态更新（落叶/飘雪/火星/幽光…）
    render();
    LG.UI.drawHUD();
    sendSnapshot();
  }

  /* ================= 快捷键 / 手柄 / 点击交互 ================= */
  const INTERACT_RANGE = 2.6, CHEST_RANGE = 2.2;

  function handleHotkeys() {
    const K = LG.Input.keymap;
    // 一次性动作：消费点按队列（事件驱动，短点按不丢失）
    const once = (action, fn) => { if (LG.Input.takePress(K[action])) fn(); };
    once('potion', () => LG.Player.usePotion());
    once('block', () => LG.Player.block());
    once('jump', () => LG.Player.jump());
    once('bag', () => LG.UI.togglePage('bag', LG.UI.renderBag));
    once('map', () => LG.UI.togglePage('map', LG.UI.renderMap));
    once('quest', () => LG.UI.togglePage('quest', lgQuestPanel));
    once('mode', () => toggleMode());
    once('menu', () => LG.UI.escMenu()); // ESC：游戏内开关设置面板（修复"没有设置"入口）
    once('interact', () => interactNearest());
    once('attack', () => LG.Combat.forceSwing());

    // 手柄一次性按键（映射见 input.js PAD：A交互 B格挡 X跳跃 Y药水 LB模式 RT攻击）
    if (LG.Input.padAction('interact')) interactNearest();
    if (LG.Input.padAction('block')) LG.Player.block();
    if (LG.Input.padAction('jump')) LG.Player.jump();
    if (LG.Input.padAction('potion')) LG.Player.usePotion();
    if (LG.Input.padAction('mode')) toggleMode();
    if (LG.Input.padAction('attack')) LG.Combat.forceSwing();
    if (LG.Input.padAction('bag')) LG.UI.togglePage('bag', LG.UI.renderBag);
    if (LG.Input.padAction('map')) LG.UI.togglePage('map', LG.UI.renderMap);

    // 鼠标/触屏点击：HUD按钮 > 攻击模式 > 交互(NPC/宝箱，远了自动走过去) > 移动
    const c = LG.Input.consumeClick();
    if (!c) return;
    Engine._pending = null; // 新指令作废旧的“走到后交互”
    // 1) 触屏 HUD 按钮优先（修复：此前点击被 handleHotkeys 提前消费导致按钮失效）
    if (isTouchUI()) {
      const btn = LG.Input.hitButton(c);
      if (btn) { doTouchButton(btn.id); return; }
    }
    // 2) HUD 右上热区（攻击模式徽章 / 设置按钮 / 任务追踪条；rect 由 drawHUD 每帧缓存）
    const hud = LG.UI.hudHit(c);
    if (hud === 'mode') { toggleMode(); return; }
    if (hud === 'settings') { LG.UI.togglePage('settings', LG.UI.renderSettings); return; }
    if (hud === 'tracker') { LG.UI.togglePage('quest', lgQuestPanel); return; }
    if (hud === 'minimap') { LG.UI.togglePage('map', LG.UI.renderMap); return; } // 小地图 -> 大地图（P0）
    const w = LG.Camera.screenToWorld(c.x, c.y);
    // 3) NPC：点中则范围内直接交互，否则寻路过去自动交互（修复“点击NPC没反应”）
    const npc = LG.NPC.nearby(w.x, w.y);
    if (npc && LG.U.dist(w.x, w.y, npc.x, npc.y) < 1.5) {
      if (LG.U.dist(LG.Player.x, LG.Player.y, npc.x, npc.y) <= INTERACT_RANGE) LG.NPC.interact(npc);
      else { LG.Player.moveTo(npc.x, npc.y); Engine._pending = { type: 'npc', obj: npc }; }
      return;
    }
    // 4) 宝箱同理（点击开箱 -> 走过去自动开）
    const chest = nearestChest(w.x, w.y, 1.5);
    if (chest) {
      if (LG.U.dist(LG.Player.x, LG.Player.y, chest.x, chest.y) <= CHEST_RANGE) openChest(chest);
      else { LG.Player.moveTo(chest.x, chest.y); Engine._pending = { type: 'chest', obj: chest }; }
      return;
    }
    // 5) 空地：移动
    LG.Player.moveTo(w.x, w.y);
  }

  /* E键 / 手柄A / 触屏“交”按钮：就近交互（NPC 优先，其次宝箱） */
  function interactNearest() {
    const P = LG.Player;
    const npc = LG.NPC.nearby(P.x, P.y);
    if (npc) {
      if (LG.U.dist(P.x, P.y, npc.x, npc.y) <= INTERACT_RANGE) { LG.NPC.interact(npc); return; }
      LG.UI.toast(LG.I18n.get('come_closer')); return;
    }
    const chest = nearestChest(P.x, P.y, CHEST_RANGE);
    if (chest) { openChest(chest); return; }
    LG.UI.toast(LG.I18n.get('nothing_near'));
  }

  function nearestChest(x, y, r) {
    return Engine._chests.find((ch) => !ch.opened && LG.U.dist(x, y, ch.x, ch.y) < r) || null;
  }

  /* 寻路到达后的自动交互闭环；玩家手动接管（WASD/摇杆）或走不到则取消 */
  function resolvePending() {
    const p = Engine._pending; if (!p) return;
    const P = LG.Player, mv = LG.Input.state.moveVec;
    if (mv.x || mv.y) { Engine._pending = null; return; } // 摇杆/WASD 接管
    const o = p.obj, range = p.type === 'npc' ? INTERACT_RANGE : CHEST_RANGE;
    const d = LG.U.dist(P.x, P.y, o.x, o.y);
    if (d <= range) { Engine._pending = null; if (p.type === 'npc') LG.NPC.interact(o); else openChest(o); return; }
    if (!P.path.length && d > range + 0.5) { Engine._pending = null; LG.UI.toast(LG.I18n.get('unreachable')); }
  }

  function doTouchButton(id) {
    if (id === 'jump') LG.Player.jump();
    else if (id === 'block') LG.Player.block();
    else if (id === 'potion') LG.Player.usePotion();
    else if (id === 'bag') LG.UI.togglePage('bag', LG.UI.renderBag);
    else if (id === 'interact') interactNearest();
  }

  function toggleMode() {
    const order = ['on', 'half', 'off'];
    const next = order[(order.indexOf(LG.Player.mode) + 1) % 3];
    LG.Player.setMode(next);
    LG.UI.toast(LG.I18n.get('attack_mode') + ': ' + LG.I18n.get('mode_' + next));
  }
  function lgQuestPanel() { return LG.UI.renderQuests(); }

  /* 触屏 UI 判定：主指针为触摸才画虚拟按钮（触屏笔记本不遮挡画面） */
  function isTouchUI() {
    return window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : ('ontouchstart' in window);
  }

  /* 本机外观（含手持武器种类）：本体渲染与联机同步共用，换武器即换外观 */
  function playerLook() {
    return Object.assign({}, LG.Player._raw.look, {
      gender: LG.Player._raw.gender || (LG.Player._raw.look || {}).gender,
      weaponKind: (LG.Inv.equip.weapon || {}).kind,
    });
  }

  /* NPC 差异化外观：由 id 哈希稳定生成（性别/发型/发色/肤色/手持），避免“千人一面” */
  const HAIRS = ['short', 'long', 'ponytail', 'spiky'];
  const NPC_HAIR_COLORS = ['#2a2a35', '#6a4a2a', '#8a8a92', '#4a2f1a', '#7a3a2a', '#3a3a4a'];
  const NPC_SKINS = ['#e0b090', '#d8c0a0', '#c9a583'];
  function npcLook(n) {
    if (!n._look) {
      let h = 0; for (const ch of n.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const held = { quest: 'melee', tutorial: 'melee', enhance: 'melee', heal: 'magic', lore: 'magic', shop: null };
      n._look = { gender: h % 2 ? 'F' : 'M', hair: HAIRS[(h >> 2) % 4],
        hairColor: NPC_HAIR_COLORS[(h >> 4) % 6], skin: NPC_SKINS[(h >> 7) % 3],
        weaponKind: held[n.role] };
    }
    return n._look;
  }

  function openChest(ch) {
    ch.opened = true;
    const d = LG.Loot.openChest(LG.Net.difficulty, 2);
    LG.Inv.silver += d.silver;
    LG.Player.gainExp(d.exp);
    d.items.forEach((it) => LG.Inv.add(it));
    LG.Sound.play('pickup');
    LG.U.bus.emit('chest_open', ch); // 阶段十五：开宝箱触发自动存档（save.autosave 订阅）
    LG.UI.toast((LG.I18n.lang === 'zh' ? '宝箱' : 'Chest') + ': +' + d.silver + ' ' + LG.I18n.get('silver_s') +
      (d.items.length ? ' ×' + d.items.length + (LG.I18n.lang === 'zh' ? '物品' : ' items') : ''));
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
    const typeNames = { 0: 'grass', 1: 'dirt', 2: 'sand', 3: 'snow', 4: 'rock', 5: 'water', 6: 'road', 7: 'wall', 8: 'castle', 9: 'void' };

    // 鼠标悬停目标（桌面端高亮可交互物 + 指针反馈）
    let hNpc = null, hChest = null, hEnemy = null;
    const hv = LG.Input.state.hover;
    if (hv) {
      const hw = LG.Camera.screenToWorld(hv.x, hv.y);
      hNpc = LG.NPC.nearby(hw.x, hw.y);
      if (hNpc && LG.U.dist(hw.x, hw.y, hNpc.x, hNpc.y) > 1.5) hNpc = null;
      hChest = nearestChest(hw.x, hw.y, 1.5);
      hEnemy = LG.Enemy.list.find((e) => e.hp > 0 && !e.isBoss && LG.U.dist(hw.x, hw.y, e.x, e.y) < 1.1) || null;
    }
    const cur = (hNpc || hChest) ? 'pointer' : 'default';
    if (canvas._cur !== cur) { canvas.style.cursor = cur; canvas._cur = cur; }

    // 地形（视口裁剪）
    const x0 = Math.max(0, view.x0 | 0), y0 = Math.max(0, view.y0 | 0);
    const x1 = Math.min(LG.Config.SIZE - 1, view.x1 | 0), y1 = Math.min(LG.Config.SIZE - 1, view.y1 | 0);
    const draw = Tsz * zoom;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // 迷宫迷雾（Q17）：O(1) 区域判定，避免每瓦片扫描
        if (LG.Terrain.isMazeAt(x, y) && !LG.Terrain.fog.visible(x, y)) continue;
        const t = LG.Terrain.tileAt(x, y);
        const name = typeNames[t.type] || 'grass';
        // 2.5D 高差挤出：邻层差决定崖壁/落影/亮棱（heightAt 原始查询零分配，烘焙图一次drawImage）
        const h = t.height;
        const img = LG.Assets.groundTile(name, h,
          h - LG.Terrain.heightAt(x, y + 1),      // 南邻更低 -> 本片底边崖壁
          LG.Terrain.heightAt(x, y - 1) - h);     // 北邻更高 -> 本片顶边落影（负数=亮棱）
        const s = LG.Camera.worldToScreen(x, y);
        g.drawImage(img, s.x, s.y, draw + 1, draw + 1);
      }
    }

    // 点击寻路落点菱形（P0）：脉冲金框标示"正要走到哪"（path 消费制，末项=剩余终点）
    if (LG.Player.path && LG.Player.path.length) {
      const nd = LG.Player.path[LG.Player.path.length - 1];
      const nds = LG.Camera.worldToScreen(nd.x, nd.y);
      g.save();
      g.translate(nds.x + draw / 2, nds.y + draw / 2);
      g.rotate(Math.PI / 4);
      g.globalAlpha = 0.45 + 0.45 * Math.sin(performance.now() / 180);
      const q = draw * 0.26;
      g.strokeStyle = '#ffd777'; g.lineWidth = 2;
      g.strokeRect(-q, -q, q * 2, q * 2);
      g.fillStyle = 'rgba(255,215,119,0.2)';
      g.fillRect(-q, -q, q * 2, q * 2);
      g.restore();
      g.globalAlpha = 1;
    }

    // 宝箱（悬停金环提示可开启）
    Engine._chests.forEach((ch) => {
      if (ch.opened) return;
      if (ch.x < view.x0 || ch.x > view.x1 || ch.y < view.y0 || ch.y > view.y1) return;
      if (LG.Terrain.isMazeAt(ch.x, ch.y) && !LG.Terrain.fog.visible(ch.x, ch.y)) return;
      const s = LG.Camera.worldToScreen(ch.x, ch.y);
      if (ch === hChest) highlightRing(s, draw, '#e6c05a');
      blobShadow(s.x, s.y, draw);
      g.drawImage(LG.Assets.chest(), s.x, s.y, draw, draw);
    });

    // NPC：按 id 稳定生成差异化外观（Q42），金色名字 + 悬停高亮
    LG.NPC.list.forEach((n) => {
      if (n.x < view.x0 || n.x > view.x1 || n.y < view.y0 || n.y > view.y1) return;
      const s = LG.Camera.worldToScreen(n.x, n.y);
      if (n === hNpc) highlightRing(s, draw, '#d8b45a');
      blobShadow(s.x, s.y, draw);
      g.drawImage(LG.Assets.hero(npcLook(n)), s.x, s.y, draw, draw);
      g.fillStyle = '#d8b45a'; g.font = 'bold ' + Math.max(10, 11 * zoom) + 'px "LegendKai", sans-serif'; g.textAlign = 'center';
      g.fillText(LG.I18n.lang === 'zh' ? (n.zh || n.en) : (n.en || n.zh), s.x + draw / 2, s.y - 4);
    });

    // 敌人（人类军队）
    LG.Enemy.list.forEach((e) => {
      if (e.x < view.x0 || e.x > view.x1 || e.y < view.y0 || e.y > view.y1) return;
      if (LG.Terrain.isMazeAt(e.x, e.y) && !LG.Terrain.fog.visible(e.x, e.y)) return;
      const s = LG.Camera.worldToScreen(e.x, e.y);
      if (e === hEnemy) highlightRing(s, draw, '#ff6a6a');
      // 4朝向精灵：'w' 用 'e' 变体水平翻转；BOSS 保持正面（王冠造型对称）
      if (e.isBoss) {
        g.drawImage(LG.Assets.boss(e.type.id, e.type.color), s.x - draw / 2, s.y - draw, draw * 2, draw * 2);
      } else {
        blobShadow(s.x, s.y, draw);
        const ed = e.dir || 's';
        const edv = ed === 'n' ? 'n' : ed === 's' ? 's' : 'e';
        const img = LG.Assets.enemy(e.type, edv);
        if (ed === 'w') { g.save(); g.translate(s.x + draw, 0); g.scale(-1, 1); g.drawImage(img, 0, s.y, draw, draw); g.restore(); }
        else g.drawImage(img, s.x, s.y, draw, draw);
      }
      // 血条
      if (e.hp < e.maxHp && !e.isBoss) {
        g.fillStyle = '#222'; g.fillRect(s.x + 2, s.y - 8, draw - 4, 4);
        g.fillStyle = e.kind === 'normal' ? '#c0392b' : '#f39c12';
        g.fillRect(s.x + 2, s.y - 8, (draw - 4) * (e.hp / e.maxHp), 4);
      }
    });

    // 远端玩家（联机可见 Q52）：由位置增量推断朝向，无需改联机协议
    Object.keys(LG.Net.peers || {}).forEach((id) => {
      const pr = LG.Net.peers[id];
      if (pr.x == null) return;
      const ddx = pr.x - (pr._px == null ? pr.x : pr._px);
      const ddy = pr.y - (pr._py == null ? pr.y : pr._py);
      if (Math.abs(ddx) + Math.abs(ddy) > 0.003)
        pr.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'e' : 'w') : (ddy > 0 ? 's' : 'n');
      pr._px = pr.x; pr._py = pr.y;
      const s = LG.Camera.worldToScreen(pr.x, pr.y);
      const pd = pr.dir || 's';
      const pv = pd === 'n' ? 'n' : pd === 's' ? 's' : 'e';
      const him = LG.Assets.hero(pr.look || {}, pv);
      blobShadow(s.x, s.y, draw);
      if (pd === 'w') { g.save(); g.translate(s.x + draw, 0); g.scale(-1, 1); g.drawImage(him, 0, s.y, draw, draw); g.restore(); }
      else g.drawImage(him, s.x, s.y, draw, draw);
      g.fillStyle = '#6cf'; g.font = '11px "LegendKai", sans-serif'; g.textAlign = 'center';
      g.fillText(pr.name || 'Player', s.x + draw / 2, s.y - 4);
    });

    // 本体玩家（跳跃时上浮，Q21 伪跳跃；手持武器跟随当前装备）
    const ps = LG.Camera.worldToScreen(LG.Player.x, LG.Player.y);
    const jumpOffset = LG.Player.jumping ? -10 * zoom : 0;
    const pdir = LG.Player.dir || 's';
    const pvar = pdir === 'n' ? 'n' : pdir === 's' ? 's' : 'e'; // 'w' 由翻转 'e' 生成
    g.save();
    if (LG.Player.down) g.globalAlpha = 0.5;
    if (LG.Player.blockUntil > performance.now() / 1000) {
      g.strokeStyle = '#7fb3ff'; g.lineWidth = 2;
      g.beginPath(); g.arc(ps.x + draw / 2, ps.y + draw / 2, draw * 0.7, 0, Math.PI * 2); g.stroke();
    }
    blobShadow(ps.x, ps.y, draw); // 跳跃时投影留在地面
    const hero = LG.Assets.hero(playerLook(), pvar);
    if (pdir === 'w') { g.translate(ps.x + draw, 0); g.scale(-1, 1); g.drawImage(hero, 0, ps.y + jumpOffset, draw, draw); }
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
        // P0 飘字分级：字号随 flags 变化（普通14/暴击18/三倍24），随镜头缩放
        g.font = 'bold ' + Math.max(12, (f.size || 14) * zoom) + 'px "LegendKai", sans-serif'; g.textAlign = 'center';
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

    // P0：伪光照（玩家中心径向暗角，maze/void/castle 加深）→ 主题粒子（屏幕空间，最上层）
    drawLighting();
    drawParticles();

    // 倒地救援提示（Q26）
    if (LG.Player.down) {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, window.innerWidth, window.innerHeight);
      g.fillStyle = '#ff6060'; g.font = '24px "LegendKai", sans-serif'; g.textAlign = 'center';
      g.fillText(LG.I18n.get('down_rescue') + ' ' + Math.ceil(LG.Player._raw.downTimer), window.innerWidth / 2, window.innerHeight / 2);
      g.fillStyle = '#ccc'; g.font = '16px "LegendKai", sans-serif';
      g.fillText(LG.I18n.get('back_camp') + ' (' + LG.Config.SILVER_DROP_PENALTY * 100 + '% ' + LG.I18n.get('silver') + ')', window.innerWidth / 2, window.innerHeight / 2 + 30);
    }

    // 交互提示：靠近 NPC/宝箱时头顶显示按键提示（Q41 易用性）
    if (!LG.Player.down) drawInteractPrompt(draw, zoom);

    // 触屏：虚拟摇杆（按下左半屏才显示）+ HUD 按钮（粗指针设备，触屏笔记本不遮挡）
    drawJoystick();
    if (isTouchUI()) drawTouchButtons();
  }

  /* 实体脚下椭圆投影（贴地感，消除"漂浮"）。
     半径须大于精灵躯干宽（~0.62*size），下缘越过双脚，否则整只藏在精灵后面等于没画 */
  function blobShadow(x, y, size) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x + size / 2, y + size * 0.95, size * 0.4, size * 0.13, 0, 0, Math.PI * 2);
    g.fill();
  }

  /* 可交互目标悬停高亮（呼吸圆环） */
  function highlightRing(s, draw, color) {
    g.strokeStyle = color; g.lineWidth = 2;
    g.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 220);
    g.beginPath(); g.ellipse(s.x + draw / 2, s.y + draw * 0.92, draw * 0.45, draw * 0.2, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }

  /* 靠近 NPC/宝箱时的交互提示（桌面 [E] 交互 / 触屏直接点按钮） */
  function drawInteractPrompt(draw, zoom) {
    const P = LG.Player;
    const target = LG.NPC.list.find((n) => LG.U.dist(P.x, P.y, n.x, n.y) <= INTERACT_RANGE)
      || nearestChest(P.x, P.y, CHEST_RANGE);
    if (!target) return;
    const s = LG.Camera.worldToScreen(target.x, target.y);
    const label = (isTouchUI() ? '' : '[E] ') + LG.I18n.get('interact');
    g.font = Math.max(11, 12 * zoom) + 'px "LegendKai", sans-serif'; g.textAlign = 'center';
    const tw = g.measureText(label).width, tx = s.x + draw / 2, ty = s.y - 18 * zoom;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(tx - tw / 2 - 6, ty - 12, tw + 12, 16);
    g.fillStyle = '#ffe08a'; g.fillText(label, tx, ty + 1);
  }

  /* 虚拟摇杆可视化（触屏 Q18）：底座圈 + 摇杆头，玩家能看到手按在哪 */
  function drawJoystick() {
    const j = LG.Input.state.joy; if (!j) return;
    g.lineWidth = 2;
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.arc(j.base.x, j.base.y, 54, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath(); g.arc(j.cur.x, j.cur.y, 24, 0, Math.PI * 2); g.fill();
  }

  /* 触屏 HUD 按钮：几何来自 LG.Input.touchButtons()（与命中检测共用，保证所见即所点） */
  function drawTouchButtons() {
    const zh = LG.I18n.lang === 'zh';
    const short = zh ? { jump: '跳', block: '挡', potion: '药', bag: '包', interact: '交' }
                     : { jump: 'Jmp', block: 'Blk', potion: 'Pot', bag: 'Bag', interact: 'Act' };
    const P = LG.Player;
    const ready = LG.NPC.list.some((n) => LG.U.dist(P.x, P.y, n.x, n.y) <= INTERACT_RANGE)
      || !!nearestChest(P.x, P.y, CHEST_RANGE);
    for (const b of LG.Input.touchButtons()) {
      const hot = b.id === 'block' ? P.blockUntil > performance.now() / 1000
        : b.id === 'potion' ? P.potions > 0
        : b.id === 'interact' ? ready : false;
      g.fillStyle = hot ? 'rgba(216,180,90,0.5)' : 'rgba(0,0,0,0.4)';
      g.strokeStyle = '#4a5064'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center';
      g.font = (b.r > 26 ? 15 : 13) + 'px "LegendKai", sans-serif';
      g.fillText(b.id === 'potion' ? short[b.id] + P.potions : (short[b.id] || b.id), b.x, b.y + 5);
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
              skillCd: 0, kind: se.kind, isBoss: se.boss, facing: -1, phase: 0, dir: 's',
              region: Engine._lastRegion };
        LG.Enemy.list[se.i] = e;
      } else {
        // 位置增量推断朝向（快照不含 dir，零协议改动）
        const ddx = se.x - e.x, ddy = se.y - e.y;
        if (Math.abs(ddx) + Math.abs(ddy) > 0.01)
          e.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'e' : 'w') : (ddy > 0 ? 's' : 'n');
        e.x = se.x; e.y = se.y; e.hp = se.hp; e.maxHp = se.max;
      }
    });
  }

  Engine.openMenu = showMenu; // 供 UI（设置页返回按钮）回到主菜单
  LG.Engine = Engine;
  Engine.start = start;
  Engine.applyBrightness = applyBrightness;
  Engine.bindNet = bindNet; // main.js 调用
})();
