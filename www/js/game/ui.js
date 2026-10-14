/* ============================================================================
   js/game/ui.js —— 界面系统（Q50 HUD/五页菜单，Q49 亮度，Q51 角色创建）
   ----------------------------------------------------------------------------
   职责：Canvas 绘制 HUD（血条/快捷栏/攻击模式/设置按钮/任务追踪条+目标引导），
         DOM 实现五页菜单（背包/属性/任务/地图/设置）、NPC 对话框、商店、强化、角色创建、教程。

   对外接口（window.LG.UI）：
     .init(canvas) .drawHUD() .toast(msg)
     .openPanel(name) .closePanel()
     .renderBag() .renderStats() .renderQuests(npc?) .renderMap() .renderSettings()
     .charCreate() .dialog(npc, lines) .tutorial()
     .hudHit(c) -> 'mode'|'settings'|'tracker'|null   HUD 热区命中（engine 点击分发）
     .escMenu()                                       ESC 开关设置面板（keymap.menu）

   DOM 面板写入 #overlay；HUD 直接绘制到主 canvas。
   依赖：i18n（文案）、inv/quest/npc/save/camera/terrain（数据）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const T = () => LG.I18n.get;
  let overlay = null, canvas = null;

  function init(cv) {
    canvas = cv;
    overlay = document.getElementById('overlay');
    bindBus();
  }

  /* ---------- 事件订阅：让其它模块能触发 UI ---------- */
  function bindBus() {
    LG.U.bus.on('toast', toast);
    LG.U.bus.on('levelup', (lv) => toast(T()('level') + ' ' + lv + '!'));
    LG.U.bus.on('open_shop', openShop);
    LG.U.bus.on('open_enhance', openEnhance);
    LG.U.bus.on('open_quests', (npc) => renderQuests(npc)); // 任务 NPC（按其区域过滤可接任务）
    LG.U.bus.on('open_dialog', ({ npc, lines }) => dialog(npc, lines));
    LG.U.bus.on('open_tutorial', () => tutorial());   // 教官 NPC（npc.js 发的是单数形式）
    LG.U.bus.on('open_tutorials', () => tutorial());
    LG.U.bus.on('quest_ready', (q) => toast((LG.I18n.lang === 'zh' ? '任务可提交：' : 'Quest ready: ') + (q.zh || q.en)));
    LG.U.bus.on('player_down', () => {
      dialog({ zh: '你倒下了', en: 'You are down' },
        [LG.I18n.lang === 'zh' ? '等待队友救援，或即将返回营地…' : 'Awaiting rescue, or returning to camp…']);
    });
  }

  /* ---------- 轻提示 ---------- */
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  /* ---------- 通用面板 ---------- */
  let curPanel = null;
  let _opening = false; // panel() 内部开面板时置位：换面板不算"用户关闭"，不回弹菜单
  function panel(title, bodyHTML) {
    _opening = true; closePanel(); _opening = false;
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML = `<span class="close-x">✕</span><h2>${title}</h2><div class="pbody">${bodyHTML}</div>`;
    p.querySelector('.close-x').onclick = closePanel;
    overlay.appendChild(p);
    curPanel = p;
    return p;
  }
  function closePanel() {
    if (!curPanel) return;
    const wasMenuPanel = curPanel.classList.contains('menu-panel');
    curPanel.remove(); curPanel = null;
    if (_opening) return;
    // 菜单场景下最后一个面板被关闭（✕/语言切换等）→ 回弹主菜单，
    // 否则场景停在 menu 却没有任何可点入口（阶段十二修复"关掉设置后卡死"）
    if (!wasMenuPanel && !document.querySelector('.menu-panel')
        && LG.Engine && LG.Engine.scene === 'menu') LG.Engine.openMenu();
  }
  /* 按键开关面板：同页再按 = 关闭（B/M/L 快捷键与触屏按钮用；NPC 打开不受影响） */
  function togglePage(pageId, render) {
    if (curPanel && curPanel.dataset.page === pageId) { closePanel(); return; }
    const p = render();
    if (p) p.dataset.page = pageId;
  }

  /* ---------- 背包页（Q50 五页之一；阶段十二：装备列带标签 + 行囊网格 + 详情卡） ---------- */
  function renderBag() {
    const p = panel(T()('bag'), '');
    p.dataset.page = 'bag'; // 渲染器自标页面：行内重渲染（装备/出售）后 togglePage/ESC 仍能识别关闭
    p.classList.add('panel-bag'); // 显式宽度：grid auto-fill 在 shrink-to-fit 面板内会按 max-content 只算出 1 列
    const body = p.querySelector('.pbody');
    const zh = LG.I18n.lang === 'zh';
    // 左列：装备槽 + 槽位文字标签（此前 4+1 孤立排布、分不清槽位）
    let eq = '<div class="eq-col">';
    [{ id: 'weapon', zh: '武器', en: 'Weapon' }].concat(LG.Config.ARMOR_SLOTS).forEach((sl) => {
      const it = LG.Inv.equip[sl.id];
      const tag = zh ? sl.zh : (sl.en || sl.id);
      eq += `<div class="eq-row"><div class="slot" data-q="${it ? it.quality : ''}" title="${tag}" data-eqslot="${sl.id}">`;
      if (it) eq += `<canvas width="32" height="32"></canvas><span class="lv">${it.lv}</span>`;
      eq += `</div><span class="slot-tag">${tag}</span></div>`;
    });
    eq += '</div>';
    // 右区：行囊计数 + 40 格网格 + 物品详情卡（替代原先右下空白）
    const used = LG.Inv.bag.filter(Boolean).length;
    let bag = `<div class="bag-right"><div class="bag-cap">${T()('bag')} ${used}/40</div><div class="bag-grid">`;
    LG.Inv.bag.forEach((it, i) => {
      bag += `<div class="slot" data-q="${it ? it.quality : ''}" data-bag="${i}">`;
      if (it) bag += `<canvas width="32" height="32"></canvas><span class="lv">${it.lv}</span>`;
      bag += `</div>`;
    });
    bag += '</div><div id="item-info" class="item-card"></div></div>';
    body.innerHTML = `<div class="bag-wrap">${eq}${bag}</div>`;
    // 绘制物品图标
    body.querySelectorAll('[data-bag]').forEach((el) => {
      const it = LG.Inv.bag[+el.dataset.bag];
      if (it) drawItemIcon(el.querySelector('canvas'), it);
      el.onclick = () => itemMenu(+el.dataset.bag, it);
    });
    body.querySelectorAll('[data-eqslot]').forEach((el) => {
      const it = LG.Inv.equip[el.dataset.eqslot];
      if (it) drawItemIcon(el.querySelector('canvas'), it);
      el.onclick = () => { if (it && LG.Inv.unequip(el.dataset.eqslot)) { renderBag(); } };
    });
    return p; // 供 togglePage 识别页面（B键再按关闭）
  }
  function drawItemIcon(cv, it) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const img = it.slot === 'weapon' ? LG.Assets.weaponIcon(it.weaponId)
                                     : LG.Assets.armorIcon(it.armorSlot);
    g.drawImage(img, 0, 0, 32, 32);
  }
  function itemMenu(i, it) {
    if (!it) return;
    const info = document.getElementById('item-info');
    const bonds = it.bonds.map((b) => { const bd = LG.Config.BONDS.find(x => x.id === b); return bd ? (bd.zh || bd.en) : b; }).join(', ') || T()('no_bond');
    info.innerHTML = `<div><b class="q-${it.quality}">${it.quality}</b> Lv${it.lv} [${bonds}]</div>
      <button class="btn small" data-a="eq">${T()('equip')}</button>
      <button class="btn small" data-a="enh">${T()('enhance')}</button>
      <button class="btn small" data-a="sell">${T()('sell')}</button>`;
    info.querySelector('[data-a=eq]').onclick = () => { LG.Inv.equipItem(i); renderBag(); };
    info.querySelector('[data-a=enh]').onclick = () => {
      if (LG.Inv.enhance(it._id)) { toast('强化成功 Lv' + it.lv); renderBag(); }
      else toast('银币不足或已满级');
    };
    info.querySelector('[data-a=sell]').onclick = () => { const g = LG.Inv.sell(i); toast('+' + g + ' 银'); renderBag(); };
  }

  /* ---------- 属性页 ---------- */
  function renderStats() {
    const s = LG.Inv.calcStats();
    const P = LG.Player;
    const bonds = LG.Inv.activeBonds();
    const bl = bonds.map((b) => { const bd = LG.Config.BONDS.find(x => x.id === b); return bd ? (bd.zh || bd.en) : b; }).join(', ') || T()('no_bond');
    const p = panel(T()('char'), `<table class="tbl">
      <tr><td>${T()('level')}</td><td>${P.level}/${LG.Config.MAX_LEVEL}</td></tr>
      <tr><td>${T()('hp')}</td><td>${Math.round(P.hp)}/${s.maxHp}</td></tr>
      <tr><td>${T()('exp')}</td><td>${P.exp}/${P.expTo || 'MAX'}</td></tr>
      <tr><td>攻击</td><td>${s.dmg}</td></tr>
      <tr><td>${T()('def')}</td><td>${s.def}</td></tr>
      <tr><td>攻速</td><td>${s.aspd.toFixed(2)}</td></tr>
      <tr><td>范围</td><td>${s.range.toFixed(2)}</td></tr>
      <tr><td>暴击</td><td>${(s.crit * 100).toFixed(0)}%</td></tr>
      <tr><td>${T()('dodge')}</td><td>${(s.dodge * 100).toFixed(0)}%</td></tr>
      <tr><td>${T()('silver')}</td><td>${LG.Inv.silver}</td></tr>
      <tr><td>${T()('bonds')}</td><td style="text-align:left">${bl}</td></tr>
    </table>`);
    p.dataset.page = 'stat';
    return p;
  }

  /* ---------- 任务页（阶段十三：补"接取"入口——此前 Quest.accept 无任何调用方，
     任务系统实际不可用，是"不知道干什么"的根因之一） ----------
     npc 传入时按其区域过滤可接任务（营地首领=主线+营地支线，区域向导=本区域任务）；
     快捷键 L 打开时按玩家当前区域过滤。 */
  function renderQuests(npc) {
    const zh = LG.I18n.lang === 'zh';
    const act = LG.Quest.active;
    // 可接筛选：前置已完成 + 排除暂无进度来源的任务（营地不刷敌、护送无进度事件）
    const canAccept = (q) => {
      if (q.accepted || q.done) return false;
      if (q.prereq) { const pr = LG.Quest.all.find((x) => x.id === q.prereq); if (pr && !pr.done) return false; }
      if (q.type === 'escort') return false;
      if (q.type === 'kill' && q.region === 'camp') return false;
      if (q.main) return true;
      const region = npc ? npc.region : ((LG.Terrain.regionOf(LG.Player.x, LG.Player.y) || {}).id);
      return !region || q.region === region;
    };
    const avail = LG.Quest.all.filter(canAccept);
    let html = '';
    if (act.length) {
      act.forEach((q) => {
        html += `<div class="room-item"><div><b>${zh ? q.zh : q.en}</b>
          <div style="font-size:13px;color:#9a8f70">${T()('q_' + q.type)} ${q.got}/${q.need}</div></div>
          ${q.got >= q.need ? `<button class="btn small primary" data-sub="${q.id}">${T()('quest_submit')}</button>` : ''}</div>`;
      });
    }
    if (avail.length) {
      html += `<div style="margin:9px 0 3px;font-size:13px;letter-spacing:3px;color:#d8b45a;text-align:center">${T()('quest_available')}</div>`;
      avail.forEach((q) => {
        html += `<div class="room-item"><div><b>${zh ? q.zh : q.en}</b>
          <div style="font-size:13px;color:#9a8f70">${T()('q_' + q.type)} ${q.need}</div></div>
          <button class="btn small" data-acc="${q.id}">${T()('quest_accept')}</button></div>`;
      });
    }
    if (!act.length && !avail.length) html = `<p style="text-align:center;color:#999">${T()('quest_none')}</p>`;
    const p = panel(T()('quest'), html);
    p.dataset.page = 'quest'; // 重渲染（接取/提交）后仍可被 togglePage('quest')/ESC 识别
    p.querySelectorAll('[data-sub]').forEach((b) => {
      b.onclick = () => { LG.Quest.submit(b.dataset.sub); renderQuests(npc); };
    });
    p.querySelectorAll('[data-acc]').forEach((b) => {
      b.onclick = () => {
        if (LG.Quest.accept(b.dataset.acc)) { toast(zh ? '已接取任务' : 'Quest accepted'); renderQuests(npc); }
        else toast(zh ? '需先完成前置任务' : 'Prerequisite not met');
      };
    });
    return p;
  }

  /* ---------- 地图页（Q13 点击任意点传送；阶段十三：烘焙真实地形） ----------
     此前只画"区域 36×36 色块 + 底色"，与实景地形不符（反馈"地图显示与真实地图不一样"）。
     现按 Terrain.raw() 逐像素取真实瓦片类型着色：类型底色 + 高差增亮/压暗 +
     迷宫未探索压黑（与主视口一致），再叠区域名 / 玩家点 / 点击传送。 */
  // 与 terrain.js 瓦片类型枚举同序（0草 1土 2沙 3雪 4岩 5水 6路 7墙 8城 9虚空）
  const MAP_TYPES = ['grass', 'dirt', 'sand', 'snow', 'rock', 'water', 'road', 'wall', 'castle', 'void'];
  function bakeTerrainMap(g, S) {
    const raw = LG.Terrain.raw();
    if (!raw || !raw.tiles) return;
    const N = LG.Config.SIZE, ts = raw.tiles, hs = raw.height;
    const C = LG.Assets.TILE_COLORS;
    const rgb = MAP_TYPES.map((n) => { // hex -> [r,g,b]（打开地图时解析一次）
      const h = ((C[n] || C.grass)[0] || '#3f6b3a').replace('#', '');
      const v = parseInt(h, 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    });
    const img = g.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) {
      const wy = Math.min(N - 1, (py * N / S) | 0);
      for (let px = 0; px < S; px++) {
        const wx = Math.min(N - 1, (px * N / S) | 0);
        const i = wy * N + wx, o = (py * S + px) * 4;
        // 迷宫未探索：与主视口一致（不绘制 -> 深底色）
        if (LG.Terrain.isMazeAt(wx, wy) && !LG.Terrain.fog.visible(wx, wy)) {
          d[o] = 11; d[o + 1] = 13; d[o + 2] = 18; d[o + 3] = 255; continue;
        }
        const h = hs[i];
        const c = rgb[ts[i]] || rgb[0];
        // 高差对比（2026-10-14 反馈"高低不明显"：1.14→1.28 台地增亮、0.62→0.52 高山压暗）
        const k = h === 2 ? 0.52 : h === 1 ? 1.28 : 1;
        d[o] = Math.min(255, c[0] * k);
        d[o + 1] = Math.min(255, c[1] * k);
        d[o + 2] = Math.min(255, c[2] * k);
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  /* 大地图视图状态（跨开关面板持久：缩放倍率与可见区左上角，底图像素坐标） */
  let mapV = { x0: 0, y0: 0, z: 1 };

  function renderMap() {
    const p = panel(T()('map'), `<canvas id="bigmap" width="480" height="480" style="display:block;margin:0 auto;touch-action:none;cursor:grab"></canvas>
      <div style="text-align:center;margin-top:6px">
        <button class="btn small" id="bm-out">－</button><span id="bm-zoom" style="margin:0 12px;color:#9a8f70;display:inline-block;min-width:44px">1.0×</span><button class="btn small" id="bm-in">＋</button>
      </div>
      <div style="text-align:center;margin-top:4px;color:#9a8f70">${T()('teleport_hint')}</div>`);
    p.dataset.page = 'map';
    const cv = p.querySelector('#bigmap');
    const g = cv.getContext('2d');
    const S = 480 / LG.Config.SIZE;
    // 底图烘焙到离屏画布：地形是静态层，区域名/玩家点为动态层，缩放时按视图变换重画
    const base = document.createElement('canvas');
    base.width = 480; base.height = 480;
    bakeTerrainMap(base.getContext('2d'), 480); // 真实地形底图
    const ZMIN = 1, ZMAX = 8;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function clampView() { const span = 480 / mapV.z; mapV.x0 = clamp(mapV.x0, 0, 480 - span); mapV.y0 = clamp(mapV.y0, 0, 480 - span); }
    /* 以画布显示坐标 (sx,sy) 为锚缩放：锚点下的底图内容保持不动（滚轮/捏合跟手） */
    function zoomAt(nz, sx, sy) {
      nz = clamp(nz, ZMIN, ZMAX);
      const bx = mapV.x0 + sx / mapV.z, by = mapV.y0 + sy / mapV.z;
      mapV.z = nz; mapV.x0 = bx - sx / mapV.z; mapV.y0 = by - sy / mapV.z;
      clampView();
    }
    function redraw() {
      const span = 480 / mapV.z, z = mapV.z;
      g.clearRect(0, 0, 480, 480);
      g.imageSmoothingEnabled = false;
      g.drawImage(base, mapV.x0, mapV.y0, span, span, 0, 0, 480, 480);
      // 区域名标签（位置随视图变换，字号恒定保证放大后仍可读；描边保证任何底色上可读）
      LG.Config.REGIONS.forEach((rg) => {
        const sx = rg.cx * S - mapV.x0, sy = rg.cy * S - mapV.y0;
        if (sx < -30 || sx > 480 + 30 || sy < -30 || sy > 480 + 30) return;
        g.font = 'bold 11px "LegendKai", sans-serif'; g.textAlign = 'center';
        const name = LG.I18n.lang === 'zh' ? rg.zh : rg.en;
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.85)';
        g.strokeText(name, sx * z, sy * z);
        g.fillStyle = '#e8d9a8'; g.fillText(name, sx * z, sy * z);
      });
      // 玩家位置
      g.fillStyle = '#ff5050';
      g.fillRect((LG.Player.x * S - mapV.x0) * z - 3, (LG.Player.y * S - mapV.y0) * z - 3, 6, 6);
      // 联机队友青点+名字（2026-10-14 反馈"玩家容易走散"：大地图看到彼此，找得到人）
      g.textAlign = 'center';
      g.font = '10px "LegendKai", sans-serif';
      Object.keys(LG.Net.peers || {}).forEach((id) => {
        const pr = LG.Net.peers[id];
        if (!pr || pr.x == null) return;
        const fx = (pr.x * S - mapV.x0) * z, fy = (pr.y * S - mapV.y0) * z;
        if (fx < -20 || fx > 500 || fy < -20 || fy > 500) return;
        g.fillStyle = '#6cf';
        g.fillRect(fx - 3, fy - 3, 6, 6);
        g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.strokeText(pr.name || '队友', fx, fy + 14);
        g.fillStyle = '#aee6ff';
        g.fillText(pr.name || '队友', fx, fy + 14);
      });
      const zb = p.querySelector('#bm-zoom'); if (zb) zb.textContent = mapV.z.toFixed(1) + '×';
    }
    /* 打开时若玩家不在可见区内（上次放大后离场），自动对焦玩家 */
    clampView();
    if (mapV.z > 1) {
      const px = LG.Player.x * S, py = LG.Player.y * S, span = 480 / mapV.z;
      if (px < mapV.x0 || px > mapV.x0 + span || py < mapV.y0 || py > mapV.y0 + span) { mapV.x0 = px - span / 2; mapV.y0 = py - span / 2; clampView(); }
    }
    redraw();
    p.querySelector('#bm-in').onclick = () => { zoomAt(mapV.z * 1.5, 240, 240); redraw(); };
    p.querySelector('#bm-out').onclick = () => { zoomAt(mapV.z / 1.5, 240, 240); redraw(); };
    // 滚轮缩放（桌面，锚在指针）
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomAt(mapV.z * (e.deltaY > 0 ? 1 / 1.3 : 1.3),
        (e.clientX - r.left) / r.width * 480, (e.clientY - r.top) / r.height * 480);
      redraw();
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    /* 鼠标拖拽平移（指针捕获，移出画布不断流）；位移超阈值置 panned，点击不触发传送 */
    let pDrag = null, panned = false;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // 触屏走 touch 事件（单指平移/双指捏合）
      cv.setPointerCapture(e.pointerId); pDrag = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pDrag || e.pointerType === 'touch') return;
      const r = cv.getBoundingClientRect();
      const dx = (e.clientX - pDrag.x) / r.width * 480, dy = (e.clientY - pDrag.y) / r.height * 480;
      if (!panned && Math.hypot(e.clientX - pDrag.x, e.clientY - pDrag.y) > 4) panned = true;
      if (panned) { mapV.x0 -= dx / mapV.z; mapV.y0 -= dy / mapV.z; clampView(); redraw(); }
      pDrag = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointerup', () => { pDrag = null; });
    cv.addEventListener('pointercancel', () => { pDrag = null; });
    /* 触屏：双指捏合缩放（锚在两指中点）+ 单指拖拽平移 */
    let pinchD = 0, tDrag = null, tTap = null;
    const tpos = (t) => ({ x: t.clientX, y: t.clientY });
    cv.addEventListener('touchstart', (e) => {
      e.preventDefault(); panned = false;
      if (e.touches.length === 2) { const a = tpos(e.touches[0]), b = tpos(e.touches[1]); pinchD = Math.hypot(a.x - b.x, a.y - b.y); tDrag = null; tTap = null; }
      else if (e.touches.length === 1) { tDrag = tpos(e.touches[0]); tTap = { t0: performance.now(), x: e.touches[0].clientX, y: e.touches[0].clientY }; } // 单指轻点候选（记按下点兜底）
    }, { passive: false });
    cv.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      if (e.touches.length === 2 && pinchD > 0) {
        const a = tpos(e.touches[0]), b = tpos(e.touches[1]), d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0) zoomAt(mapV.z * (d / pinchD), ((a.x + b.x) / 2 - r.left) / r.width * 480, ((a.y + b.y) / 2 - r.top) / r.height * 480);
        pinchD = d; panned = true; redraw();
      } else if (e.touches.length === 1 && tDrag) {
        const t = tpos(e.touches[0]);
        const dx = (t.x - tDrag.x) / r.width * 480, dy = (t.y - tDrag.y) / r.height * 480;
        if (!panned && Math.hypot(t.x - tDrag.x, t.y - tDrag.y) > 8) panned = true;
        if (panned) { mapV.x0 -= dx / mapV.z; mapV.y0 -= dy / mapV.z; clampView(); redraw(); }
        tDrag = t;
      }
    }, { passive: false });
    cv.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinchD = 0;
      if (e.touches.length === 0) {
        // 单指轻点传送：touchstart 的 preventDefault 吞掉了合成 click，触屏传送只能在
        // touchend 判定（此前仅靠 cv.onclick → 手机上永不触发，即"地图无法传送"）；
        // 拖拽/捏合（panned=true）或超时长按不触发
        if (tTap && !panned && performance.now() - tTap.t0 < 350) {
          const t = e.changedTouches && e.changedTouches[0];
          const pt = t ? { x: t.clientX, y: t.clientY } : tTap; // 兜底用按下点（真机 changedTouches 必有）
          const r = cv.getBoundingClientRect();
          tryTeleport((pt.x - r.left) / r.width * 480, (pt.y - r.top) / r.height * 480);
        }
        tDrag = null; tTap = null;
      }
    });
    // 传送核心（Q13）：画布显示坐标(0..480)→世界坐标，吸附最近可走格；
    // 桌面 onclick 与触屏 touchend 轻点共用
    function tryTeleport(sx, sy) {
      const wx = (mapV.x0 + sx / mapV.z) / S;
      const wy = (mapV.y0 + sy / mapV.z) / S;
      const near = LG.Path.nearestWalkable(wx | 0, wy | 0, 12);
      if (near) { LG.Player.x = near.x; LG.Player.y = near.y; toast('已传送'); closePanel(); }
      else toast('该处无法到达');
    }
    // 点击传送：拖拽/捏合后本次不触发（触屏路径见上方 touchend 轻点判定）
    cv.onclick = (e) => {
      if (panned) { panned = false; return; }
      const r = cv.getBoundingClientRect();
      tryTeleport((e.clientX - r.left) / r.width * 480, (e.clientY - r.top) / r.height * 480);
    };
    return p;
  }

  /* ---------- 设置页（Q57：音量/亮度/按键/地图/语言） ---------- */
  function renderSettings() {
    const vol = LG.U.LS.get('vol', { music: 0.5, sfx: 0.7 });
    const bright = LG.U.LS.get('bright', 1);
    const p = panel(T()('settings'), `
      <div class="slider-row"><label>${T()('music')}</label><input type="range" id="s-music" min="0" max="1" step="0.05" value="${vol.music}"></div>
      <div class="slider-row"><label>${T()('sfx')}</label><input type="range" id="s-sfx" min="0" max="1" step="0.05" value="${vol.sfx}"></div>
      <div class="slider-row"><label>${T()('brightness')}</label><input type="range" id="s-bright" min="0.3" max="1.8" step="0.05" value="${bright}"></div>
      <div class="slider-row"><label>${T()('language')}</label>
        <button class="btn small" id="s-lang">中文 / EN</button></div>
      <div style="text-align:center;margin-top:8px">
        <button class="btn" id="s-map">${T()('minimap_view')}</button>
        <button class="btn" id="s-key">${T()('keybind')}</button>
        <button class="btn" id="s-save">${T()('save')}</button>
        <button class="btn" id="s-load">${T()('load')}</button>
      </div>`);
    const setB = (v) => { if (LG.Engine && LG.Engine.applyBrightness) LG.Engine.applyBrightness(v); LG.U.LS.set('bright', v); };
    setB(bright);
    p.querySelector('#s-music').oninput = (e) => LG.Sound.setVolume(+e.target.value, 'music');
    p.querySelector('#s-sfx').oninput = (e) => LG.Sound.setVolume(+e.target.value, 'sfx');
    p.querySelector('#s-bright').oninput = (e) => setB(+e.target.value);
    p.querySelector('#s-lang').onclick = () => { LG.I18n.set(LG.I18n.lang === 'zh' ? 'en' : 'zh'); closePanel(); LG.U.bus.emit('lang_changed'); };
    p.querySelector('#s-map').onclick = () => renderMap();
    p.querySelector('#s-key').onclick = () => renderKeybind();
    p.querySelector('#s-save').onclick = () => { LG.Save.save(1); toast('已保存'); };
    p.querySelector('#s-load').onclick = () => { LG.Save.load(1); toast('已读取'); closePanel(); };
    p.dataset.page = 'settings'; // 热区按钮/ESC（escMenu）据此识别页面类面板
    // 主菜单打开的设置：给一个明确的"返回"入口（小屏用户不依赖右上角 ✕）
    if (LG.Engine && LG.Engine.scene === 'menu') {
      const back = document.createElement('button');
      back.className = 'btn primary'; back.id = 's-back';
      back.textContent = LG.I18n.lang === 'zh' ? '返回' : 'Back';
      back.style.cssText = 'display:block;margin:12px auto 0;min-width:160px';
      back.onclick = () => LG.Engine.openMenu();
      p.querySelector('.pbody').appendChild(back);
    }
    return p;
  }
  function renderKeybind() {
    const acts = ['up', 'down', 'left', 'right', 'attack', 'block', 'jump', 'potion', 'bag', 'map', 'quest', 'menu'];
    let html = '';
    acts.forEach((a) => {
      html += `<div class="slider-row"><label>${a}</label><button class="btn small" data-kb="${a}">${LG.Input.keyFor(a)}</button></div>`;
    });
    const p = panel(T()('keybind'), html);
    p.dataset.page = 'settings'; // 按键设置是设置页的子页：ESC 归入设置页语义（关闭它）
    p.querySelectorAll('[data-kb]').forEach((b) => {
      b.onclick = () => {
        toast('按下新按键…');
        const h = (e) => { LG.Input.setKey(b.dataset.kb, e.code); b.textContent = e.code; window.removeEventListener('keydown', h); };
        window.addEventListener('keydown', h);
      };
    });
    return p;
  }

  /* ---------- 商店（Q41） ---------- */
  function openShop() {
    const p = panel(T()('npc_shop'), '');
    const body = p.querySelector('.pbody');
    body.innerHTML = `<div style="text-align:center;margin-bottom:8px">${T()('silver')}: <b id="shop-sil">${LG.Inv.silver}</b></div>
      <div id="shop-items" style="text-align:center"></div>
      <div style="text-align:center;margin-top:8px"><button class="btn" id="shop-refresh">刷新商品</button></div>`;
    let stock = [];
    function refresh() {
      stock = [LG.Loot.rollWeapon(LG.Config.DIFFICULTY.default, 3), LG.Loot.rollArmor(LG.Config.DIFFICULTY.default, 3),
               LG.Loot.rollWeapon(LG.Config.DIFFICULTY.default, 3, 2), LG.Loot.rollArmor(LG.Config.DIFFICULTY.default, 3, 2)];
      render();
    }
    function render() {
      const box = body.querySelector('#shop-items'); box.innerHTML = '';
      body.querySelector('#shop-sil').textContent = LG.Inv.silver;
      stock.forEach((it, i) => {
        if (!it) return;
        const price = ({ N: 50, R: 150, SR: 400, SSR: 1000, D: 25, C: 75, B: 200, A: 500, S: 1250, SS: 3000 })[it.quality] * 2;
        const d = document.createElement('div');
        d.className = 'slot'; d.dataset.q = it.quality;
        d.innerHTML = `<canvas width="32" height="32"></canvas><span class="lv">${price}</span>`;
        drawItemIcon(d.querySelector('canvas'), it);
        d.onclick = () => {
          if (LG.Inv.silver < price) { toast('银币不足'); return; }
          if (!LG.Inv.add(it)) { toast('背包已满'); return; }
          LG.Inv.silver -= price; stock[i] = null; render();
        };
        box.appendChild(d);
      });
    }
    body.querySelector('#shop-refresh').onclick = refresh;
    refresh();
  }

  /* ---------- 强化重铸（Q41） ---------- */
  function openEnhance() {
    renderBag(); // 复用背包交互中的强化按钮
  }

  /* ---------- NPC 对话框 ---------- */
  function dialog(npc, lines) {
    const d = document.createElement('div');
    d.className = 'dialog';
    const name = npc && (npc.zh || npc.name) || '';
    d.innerHTML = `<div class="speaker">${name}</div><div class="lines"></div>
      <div class="opts"><button class="btn small primary">${T()('close')}</button></div>`;
    const lineEl = d.querySelector('.lines');
    overlay.appendChild(d);
    // 逐字显示
    let li = 0, ci = 0;
    (lines || ['']).forEach(() => {});
    function type() {
      if (li >= lines.length) return;
      const full = lines[li];
      lineEl.textContent = full.slice(0, ++ci);
      if (ci < full.length) setTimeout(type, 30);
      else if (li < lines.length - 1) { setTimeout(() => { li++; ci = 0; type(); }, 400); }
    }
    type();
    d.querySelector('.opts .btn').onclick = () => d.remove();
  }

  /* ---------- 新手教程（Q67 可跳过） ---------- */
  function tutorial() {
    if (LG.U.LS.get('tut_done', false)) return;
    const steps = [
      '点击地面或按 WASD 移动（手机：左侧摇杆）',
      '靠近敌人自动攻击；攻击模式可切换 开/关/半自动',
      'F 格挡减伤，空格跳跃翻越矮障碍，Q 使用药水',
      '找营地 NPC 接任务、买装备、强化武器',
      '打开地图可点击传送；设置里可调节亮度与语言',
    ];
    let i = 0;
    function show() {
      const d = document.createElement('div');
      d.className = 'dialog';
      d.innerHTML = `<div class="speaker">教程 ${i + 1}/${steps.length}</div><div class="lines">${steps[i]}</div>
        <div class="opts"><button class="btn small">${T()('tutorial_skip')}</button>
        <button class="btn small primary">${T()('tutorial_next')}</button></div>`;
      overlay.appendChild(d);
      const [skip, next] = d.querySelectorAll('.opts .btn');
      skip.onclick = () => { LG.U.LS.set('tut_done', true); d.remove(); };
      next.onclick = () => { d.remove(); i++; if (i < steps.length) show(); else LG.U.LS.set('tut_done', true); };
    }
    show();
  }

  /* ---------- 角色创建（Q51） ---------- */
  function charCreate(cb) {
    const p = panel(T()('create_hero'), `
      <div style="text-align:center;margin-bottom:6px"><div class="cc-frame"><canvas id="cc-prev" width="64" height="64" style="image-rendering:pixelated;width:96px;height:96px"></canvas></div></div>
      <div class="slider-row"><label>${T()('name')}</label><input class="inp" id="cc-name" maxlength="8" value="冒险者"></div>
      <div class="slider-row"><label>${T()('gender')}</label>
        <button class="btn small" id="cc-m">${T()('male')}</button><button class="btn small" id="cc-f">${T()('female')}</button></div>
      <div class="slider-row"><label>发色</label><input type="color" id="cc-hair" value="#3a2a1a"></div>
      <div class="slider-row"><label>肤色</label><input type="color" id="cc-skin" value="#e0b090"></div>
      <div class="slider-row"><label>${T()('initial_weapon')}</label><select class="inp" id="cc-wpn">
        ${LG.Config.WEAPONS.filter(w => w.kind !== 'shield').map(w => `<option value="${w.id}">${LG.I18n.lang === 'zh' ? w.zh : w.en}</option>`).join('')}
      </select></div>
      <div style="text-align:center;margin-top:10px"><button class="btn primary" id="cc-ok">${T()('confirm')}</button></div>`);
    const look = { gender: 'M', hairColor: '#3a2a1a', skin: '#e0b090' };
    const wpnSel = p.querySelector('#cc-wpn');
    const prev = p.querySelector('#cc-prev');
    function redraw() {
      // 预览跟随所选武器（手持武器外观，Q22/Q51）
      look.weaponKind = (LG.Config.WEAPONS.find((w) => w.id === wpnSel.value) || {}).kind;
      const g = prev.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 64, 64);
      g.drawImage(LG.Assets.hero(look), 0, 0, 64, 64);
    }
    // 性别按钮带选中态（.btn.on 高亮当前选择；不用 .primary 以免语义混淆）
    function setG(v) {
      look.gender = v;
      p.querySelector('#cc-m').classList.toggle('on', v === 'M');
      p.querySelector('#cc-f').classList.toggle('on', v === 'F');
      redraw();
    }
    wpnSel.onchange = redraw;
    p.querySelector('#cc-m').onclick = () => setG('M');
    p.querySelector('#cc-f').onclick = () => setG('F');
    setG('M'); // 初始选中男（与 look 默认一致）
    p.querySelector('#cc-hair').oninput = (e) => { look.hairColor = e.target.value; redraw(); };
    p.querySelector('#cc-skin').oninput = (e) => { look.skin = e.target.value; redraw(); };
    p.querySelector('#cc-ok').onclick = () => {
      const name = p.querySelector('#cc-name').value || '冒险者';
      const wpnId = p.querySelector('#cc-wpn').value;
      // 发放初始武器（阶段十七：基础射程随武器入库，calcStats 据此得出弓7.0/杖6.0/近战1.6…）
      const it = LG.Loot.rollWeapon(LG.Config.DIFFICULTY.default, 1);
      const wdef = LG.Config.WEAPONS.find(w => w.id === wpnId);
      it.weaponId = wpnId; it.kind = wdef.kind;
      it.quality = 'N'; it.stats = { dmg: wdef.base, aspd: 0, range: wdef.range, crit: 0 };
      LG.Inv.add(it); LG.Inv.equipItem(LG.Inv.bag.indexOf(it));
      LG.Player._raw.name = name; LG.Player._raw.gender = look.gender; LG.Player._raw.look = look;
      closePanel();
      cb && cb({ name, look });
    };
  }

  /* ---------- HUD 绘制（Canvas；阶段十二重做为"雕纹铭牌"风格） ----------
     坐标一律使用 CSS 像素（window.innerWidth/Height）：引擎 render() 前已
     setTransform(DPR)，若用 canvas.width（物理像素）则 DPR≥2 时右侧/底部元素被推出屏幕。
     阶段十三：窄屏引入虚拟坐标 g.scale(U)（U=0.5@<760px）整体缩小，字号经 fs() 保底 10px。 */
  function hudDiamond(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillRect(-s / 2, -s / 2, s, s);
    g.restore();
  }

  /* ---------- HUD 热区（物理 CSS 像素；drawHUD 每帧缓存，engine 点击命中经 hudHit） ---------- */
  const hudRects = { mode: null, settings: null, tracker: null, minimap: null };
  function hudHit(c) {
    for (const k in hudRects) {
      const r = hudRects[k];
      if (r && c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h) return k;
    }
    return null;
  }

  /* ESC（keymap.menu）：开关设置面板。
     仅接管"无面板"与"页面类面板"（背包/地图/任务/设置，dataset.page 标记）；
     角色创建/商店/对话等模态面板不劫持，交还给各自的关闭按钮。 */
  function escMenu() {
    if (curPanel && curPanel.dataset.page) { closePanel(); return; }
    if (!curPanel) togglePage('settings', renderSettings);
  }

  /* ---------- 任务追踪条辅助数据 ---------- */
  function regionXY(id) {
    const rg = LG.Config.REGIONS.find((r) => r.id === id);
    return rg ? { x: rg.cx, y: rg.cy } : null;
  }
  function nearestQuestNpc() { // 就近的任务 NPC（role:'quest'，营地首领/区域向导）
    const P = LG.Player;
    let best = null, bd = 1e9;
    LG.NPC.list.forEach((n) => {
      if (n.role !== 'quest') return;
      const d = LG.U.dist(P.x, P.y, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    });
    return best ? { x: best.x, y: best.y } : null;
  }
  function clipText(g, txt, maxw) { // 追踪条宽度有限：超宽截断
    if (g.measureText(txt).width <= maxw) return txt;
    let t = txt;
    while (t.length > 1 && g.measureText(t + '…').width > maxw) t = t.slice(0, -1);
    return t + '…';
  }

  /* ---------- 任务追踪条（目标引导，反馈"不知道干什么"） ----------
     行1 = 任务名+进度（可提交优先显示）；无任务时提示找营地首领接取。
     行2 = 可提交提示 / 到目标点的方向三角+距离。
     空间引导：目标在屏内 -> 金菱形脉冲标记；在屏外 -> 视口边缘指向箭头。
     点击追踪条打开任务面板（engine 经 hudHit('tracker') 转发）。 */
  /* 当前追踪目标解析（P0：追踪条与右上小地图共用一份逻辑）。
     返回 { q, ready, tgt }：可提交任务优先 → 第一个任务；
     无任务时 tgt=最近任务 NPC（引导去找营地首领接取）。 */
  function hudObjective() {
    const act = LG.Quest.active;
    const q = act.find((a) => a.got >= a.need) || act[0] || null;
    const ready = !!(q && q.got >= q.need);
    let tgt = null;
    if (q) { if (!ready) tgt = q.target || regionXY(q.region); }
    else tgt = nearestQuestNpc();
    return { q, ready, tgt };
  }

  function drawQuestTracker(g, x, y, w, fs, U, vw, vh) {
    const zh = LG.I18n.lang === 'zh';
    const P = LG.Player;
    const obj = hudObjective();
    const q = obj.q, ready = obj.ready, tgt = obj.tgt;
    const line1 = q ? (zh ? q.zh : q.en) + '  ' + q.got + '/' + q.need : T()('guide_none');
    const th = 48;
    g.fillStyle = 'rgba(6,7,11,0.78)'; g.fillRect(x, y, w, th);
    g.lineWidth = 1; g.strokeStyle = 'rgba(216,180,90,0.9)'; g.strokeRect(x + 1, y + 1, w - 2, th - 2);
    g.textAlign = 'left';
    g.font = fs(12) + 'px "LegendKai", sans-serif';
    g.fillStyle = ready ? '#ffe9a8' : (q ? '#e8d9a8' : '#d8b45a');
    g.fillText(clipText(g, line1, w - 14), x + 7, y + 19);
    g.font = fs(10.5) + 'px "LegendKai", sans-serif';
    if (ready) {
      g.fillStyle = '#ffd777';
      g.fillText(clipText(g, T()('guide_ready'), w - 14), x + 7, y + 42);
    } else {
      const d = tgt ? Math.round(LG.U.dist(P.x, P.y, tgt.x, tgt.y)) : 0;
      if (tgt) { // 方向三角（世界系 x 东 y 南，与屏幕同向）
        const ang = Math.atan2(tgt.y - P.y, tgt.x - P.x);
        g.save(); g.translate(x + 13, y + 38); g.rotate(ang);
        g.fillStyle = '#d8b45a';
        g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, 4.5); g.lineTo(-4, -4.5); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.stroke();
        g.restore();
      }
      g.fillStyle = '#9fb7d9';
      g.fillText(T()('guide_dist', d), x + 24, y + 42);
    }
    // 空间标记：屏内金菱形脉冲 / 屏外边缘箭头（坐标 worldToScreen 为物理像素，/U 转虚拟）
    if (tgt) {
      const w2s = LG.Camera.worldToScreen(tgt.x, tgt.y);
      const sz = (LG.Config.TILE * LG.Camera.zoomVal) / U;
      const sx = w2s.x / U + sz / 2, sy = w2s.y / U + sz / 2;
      const margin = 34;
      const onScr = sx >= margin && sx <= vw - margin && sy >= margin && sy <= vh - margin;
      g.save();
      g.globalAlpha = onScr ? 0.55 + 0.45 * Math.sin(performance.now() / 240) : 0.95;
      if (onScr) {
        g.translate(sx, sy); g.rotate(Math.PI / 4);
        g.strokeStyle = '#ffd777'; g.lineWidth = 2;
        g.strokeRect(-8, -8, 16, 16);
      } else {
        const ang = Math.atan2(tgt.y - P.y, tgt.x - P.x);
        g.translate(Math.max(margin, Math.min(vw - margin, sx)),
                    Math.max(margin, Math.min(vh - margin, sy)));
        g.rotate(ang);
        g.fillStyle = '#ffd777';
        g.beginPath(); g.moveTo(13, 0); g.lineTo(-8, 8); g.lineTo(-8, -8); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1.5; g.stroke();
      }
      g.restore();
      g.globalAlpha = 1;
    }
    hudRects.tracker = { x: x * U, y: y * U, w: w * U, h: th * U };
  }

  /* ---------- 右上小地图（P0）：真实地形缩略（复用 bakeTerrainMap）+ 玩家白点 + 目标金菱形 ----------
     底图烘焙较贵（2000²→128² 采样），故每 1.2s 重烘焙一次（迷雾探索后会刷新）；
     每帧只做 drawImage + 两个标记，开销可忽略。点击小地图 -> 打开大地图（hudHit 转发）。 */
  const miniState = { cv: null, g: null, last: -1e9, S: 128 };
  function drawMinimap(g, x, y, size) {
    const m = miniState;
    if (!m.cv) {
      m.cv = document.createElement('canvas'); m.cv.width = m.S; m.cv.height = m.S;
      m.g = m.cv.getContext('2d');
    }
    const now = performance.now();
    if (now - m.last > 1200) { bakeTerrainMap(m.g, m.S); m.last = now; }
    g.fillStyle = '#06070b'; g.fillRect(x - 3, y - 3, size + 6, size + 6);
    g.drawImage(m.cv, x, y, size, size);
    const k = size / LG.Config.SIZE; // 世界坐标 -> 小地图
    // 玩家白点
    g.fillStyle = '#fff';
    g.fillRect(x + LG.Player.x * k - 2, y + LG.Player.y * k - 2, 4, 4);
    // 联机队友青点（2026-10-14 反馈"玩家容易走散"：小地图上看到彼此位置；色同世界内名字色）
    Object.keys(LG.Net.peers || {}).forEach((id) => {
      const pr = LG.Net.peers[id];
      if (!pr || pr.x == null) return;
      g.fillStyle = '#6cf';
      g.fillRect(x + pr.x * k - 2, y + pr.y * k - 2, 4, 4);
    });
    // 当前任务目标金菱形（与追踪条同源 hudObjective；可提交/无坐标时不画）
    const obj = hudObjective();
    if (obj.tgt) {
      g.save();
      g.translate(x + obj.tgt.x * k, y + obj.tgt.y * k);
      g.rotate(Math.PI / 4);
      g.strokeStyle = '#ffd777'; g.lineWidth = 1.5;
      g.strokeRect(-4, -4, 8, 8);
      g.restore();
    }
    // 金框
    g.lineWidth = 1; g.strokeStyle = 'rgba(216,180,90,0.9)';
    g.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }

  function drawHUD() {
    const g = canvas.getContext('2d');
    const W = window.innerWidth, H = window.innerHeight;
    const s = LG.Inv.calcStats();
    const P = LG.Player;
    /* 手机缩放（反馈"UI太大显示不全，建议缩小50%"）：以虚拟坐标绘制
       （g.scale(U) 后所有原尺寸按 U 缩放），窄屏 U=0.5 整体缩小一半；
       字号经 fs() 换算并保底 10 物理像素，保证小字仍可读。 */
    const U = W < 760 ? 0.5 : (W < 1100 ? 0.75 : 1);
    const vw = W / U, vh = H / U;
    const fs = (px) => (U >= 1 ? px : Math.max(10, px * U) / U);
    const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : ('ontouchstart' in window);
    g.save();
    g.imageSmoothingEnabled = false;
    g.scale(U, U);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';

    /* ===== 左上：状态铭牌（四角金铆钉 / 等级章 / 血条 / 经验条 / 资源行） ===== */
    const mx = 14, my = 14, mw = 252, mh = 78;
    g.fillStyle = 'rgba(6,7,11,0.78)'; g.fillRect(mx, my, mw, mh);
    g.lineWidth = 2; g.strokeStyle = '#000'; g.strokeRect(mx - 1, my - 1, mw + 2, mh + 2);
    g.lineWidth = 1; g.strokeStyle = 'rgba(216,180,90,0.9)'; g.strokeRect(mx + 2.5, my + 2.5, mw - 5, mh - 5);
    g.fillStyle = '#d8b45a';
    hudDiamond(g, mx + 3, my + 3, 5); hudDiamond(g, mx + mw - 3, my + 3, 5);
    hudDiamond(g, mx + 3, my + mh - 3, 5); hudDiamond(g, mx + mw - 3, my + mh - 3, 5);

    // 等级章
    const sx = mx + 12, sy = my + 15, sw = 50, sh = 48;
    g.fillStyle = '#10131b'; g.fillRect(sx, sy, sw, sh);
    g.lineWidth = 1; g.strokeStyle = '#000'; g.strokeRect(sx - .5, sy - .5, sw + 1, sh + 1);
    g.strokeStyle = '#8a6e20'; g.strokeRect(sx + 1.5, sy + 1.5, sw - 3, sh - 3);
    g.textAlign = 'center';
    g.fillStyle = '#9a8f70'; g.font = fs(9) + 'px "LegendKai", sans-serif';
    // 缩小模式下 LV 基线下移 4px：小字号仍会顶出等级章上沿
    g.fillText('LV', sx + sw / 2, sy + 14 + (U < 1 ? 4 : 0));
    g.fillStyle = '#ffe9a8'; g.font = 'bold ' + fs(22) + 'px "LegendKai", sans-serif';
    g.fillText(String(P.level), sx + sw / 2, sy + 41);

    // 血条：黑框 + 红渐变 + 顶部高光 + 十段刻度 + 金内线 + 双层描边数值
    const hbx = mx + 74, hbw = mw - 74 - 14, hby = my + 15, hbh = 20;
    g.fillStyle = '#000'; g.fillRect(hbx - 2, hby - 2, hbw + 4, hbh + 4);
    g.fillStyle = '#2a1216'; g.fillRect(hbx, hby, hbw, hbh);
    const ratio = Math.max(0, Math.min(1, P.hp / s.maxHp));
    if (ratio > 0) {
      const hgd = g.createLinearGradient(0, hby, 0, hby + hbh);
      hgd.addColorStop(0, '#e8564a'); hgd.addColorStop(0.45, '#c0392b'); hgd.addColorStop(1, '#7e1a16');
      g.fillStyle = hgd; g.fillRect(hbx, hby, hbw * ratio, hbh);
      g.fillStyle = 'rgba(255,255,255,0.26)'; g.fillRect(hbx, hby + 1, hbw * ratio, 3);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 10; i++) g.fillRect(hbx + Math.round(hbw / 10 * i), hby, 1, hbh);
    g.lineWidth = 1; g.strokeStyle = '#d8b45a'; g.strokeRect(hbx + .5, hby + .5, hbw - 1, hbh - 1);
    g.font = 'bold ' + fs(12.5) + 'px "LegendKai", sans-serif'; g.textAlign = 'center';
    const hpTxt = Math.ceil(P.hp) + '/' + s.maxHp;
    g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(hpTxt, hbx + hbw / 2 + 1, hby + 14 + 1);
    g.fillStyle = '#ffffff'; g.fillText(hpTxt, hbx + hbw / 2, hby + 14);

    // 经验条（鎏金渐变）
    const ey = my + 41, eh = 8;
    g.fillStyle = '#000'; g.fillRect(hbx - 1, ey - 1, hbw + 2, eh + 2);
    g.fillStyle = '#0e1119'; g.fillRect(hbx, ey, hbw, eh);
    const xr = P.expTo ? Math.max(0, Math.min(1, P.exp / P.expTo)) : 0;
    if (xr > 0) {
      const egd = g.createLinearGradient(0, ey, 0, ey + eh);
      egd.addColorStop(0, '#ffe9a8'); egd.addColorStop(1, '#8a6e20');
      g.fillStyle = egd; g.fillRect(hbx, ey, hbw * xr, eh);
    }
    g.lineWidth = 1; g.strokeStyle = 'rgba(216,180,90,0.55)';
    g.strokeRect(hbx + .5, ey + .5, hbw - 1, eh - 1);

    // 资源行：银币圆章 + 数字，药水瓶 + 数字（图标替代裸文本）
    const ry = my + 68;
    g.textAlign = 'left'; g.font = fs(13.5) + 'px "LegendKai", sans-serif';
    g.fillStyle = '#d8b45a'; g.beginPath(); g.arc(hbx + 7, ry - 4, 5.5, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1; g.strokeStyle = '#4a3a14'; g.stroke();
    g.fillStyle = '#6b5518'; g.beginPath(); g.arc(hbx + 7, ry - 4, 2.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8d9a8'; g.fillText(String(LG.Inv.silver), hbx + 18, ry);
    const ptx = hbx + 120; // 药水瓶：瓶颈 + 瓶身 + 高光
    g.fillStyle = '#8e2020'; g.fillRect(ptx + 3, ry - 15, 4, 4);
    g.fillStyle = '#c0392b'; g.fillRect(ptx, ry - 11, 10, 11);
    g.fillStyle = '#e2685e'; g.fillRect(ptx + 1.5, ry - 9.5, 3, 5);
    g.lineWidth = 1; g.strokeStyle = '#000'; g.strokeRect(ptx + .5, ry - 10.5, 9, 10);
    g.fillStyle = '#e8d9a8'; g.fillText(String(P.potions), ptx + 15, ry);

    /* ===== 右上：攻击模式徽章（左侧状态宝石随模式变色：绿=开 金=半 灰=关） ===== */
    const modeTxt = LG.I18n.get('attack_mode') + ':' + LG.I18n.get('mode_' + P.mode);
    g.font = fs(13.5) + 'px "LegendKai", sans-serif';
    const bw = Math.round(g.measureText(modeTxt).width) + 48, bh = 26;
    const bx = vw - 14 - bw, by = 14;
    g.fillStyle = 'rgba(6,7,11,0.78)'; g.fillRect(bx, by, bw, bh);
    g.lineWidth = 2; g.strokeStyle = '#000'; g.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    g.lineWidth = 1; g.strokeStyle = 'rgba(216,180,90,0.9)'; g.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
    g.fillStyle = P.mode === 'on' ? '#7ed957' : (P.mode === 'half' ? '#d8b45a' : '#8a8f9e');
    hudDiamond(g, bx + 17, by + bh / 2, 9);
    g.fillStyle = '#e8e2d0'; g.textAlign = 'left';
    g.fillText(modeTxt, bx + 32, by + 18);

    /* ===== 徽章下方：设置按钮（反馈"没有设置"：游戏内此前无设置入口，手机更无按键可用） ===== */
    const fsSet = fs(11);
    g.font = fsSet + 'px "LegendKai", sans-serif';
    const sbTxt = T()('settings');
    const sbw = Math.round(g.measureText(sbTxt).width) + 18, sbh = Math.max(22, fsSet + 8);
    const sbx = vw - 14 - sbw, sby = by + bh + 6;
    g.fillStyle = 'rgba(6,7,11,0.78)'; g.fillRect(sbx, sby, sbw, sbh);
    g.strokeStyle = 'rgba(216,180,90,0.9)'; g.lineWidth = 1;
    g.strokeRect(sbx + 0.5, sby + 0.5, sbw - 1, sbh - 1);
    g.fillStyle = '#e8d9a8'; g.textAlign = 'center';
    g.fillText(sbTxt, sbx + sbw / 2, sby + sbh / 2 + fsSet * 0.36); // 视觉居中（CJK 基线）

    /* ===== 徽章/设置按钮下方：右上小地图（P0：真实地形缩略 + 玩家点 + 目标菱形） ===== */
    const mms = (W < 760 ? 96 : 128) / U; // 物理 96px(手机)/128px(桌面)，/U 换回虚拟坐标
    const mmx = vw - 14 - mms, mmy = sby + sbh + 6;
    drawMinimap(g, mmx, mmy, mms);

    /* ===== 左上铭牌下方：任务追踪条（目标引导，反馈"不知道干什么"） ===== */
    drawQuestTracker(g, mx, my + mh + 6, mw, fs, U, vw, vh);

    // 热区缓存（物理 CSS 像素；engine.handleHotkeys 经 LG.UI.hudHit 命中）
    hudRects.mode = { x: bx * U, y: by * U, w: bw * U, h: bh * U };
    hudRects.settings = { x: sbx * U, y: sby * U, w: sbw * U, h: sbh * U };
    hudRects.minimap = { x: mmx * U, y: mmy * U, w: mms * U, h: mms * U };

    /* ===== BOSS 血条（黑台 + 暗红渐变 + 金框 + 两端菱形铆） =====
       桌面/竖屏：底部居中（粗指针上移 H-210 避开右下触屏按钮簇）；
       触屏横屏（W>H）：改置顶居中——固定 H-210 的定位在矮屏（390~440px 高）
       会落到屏幕中部，血条直接切过 BOSS 本体与战斗画面（反馈"BOSS血条竟然可以重叠"） */
    const boss = LG.Enemy.list.find((e) => e.isBoss && e.hp > 0);
    if (boss) {
      const topBar = coarse && W > H;
      // 物理宽=屏宽56%（横屏50%，顶部在两侧铭牌/徽章之间留空；/U 还原到虚拟坐标）
      const bbw = (topBar ? Math.min(W * 0.5, 540) : Math.min(W * 0.56, 540)) / U,
            bbx = Math.round((vw - bbw) / 2),
            bby = Math.round((topBar ? 34 : (coarse ? H - 210 : H - 62)) / U), bbh = 16;
      g.font = fs(15) + 'px "LegendKai", sans-serif'; g.textAlign = 'center';
      const bname = LG.I18n.lang === 'zh' ? (boss.type.zh || boss.type.en) : (boss.type.en || boss.type.zh);
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(bname, vw / 2 + 1, bby - 7 + 1);
      g.fillStyle = '#ffe9a8'; g.fillText(bname, vw / 2, bby - 7);
      g.fillStyle = '#000'; g.fillRect(bbx - 3, bby - 3, bbw + 6, bbh + 6);
      g.fillStyle = '#1c0d10'; g.fillRect(bbx, bby, bbw, bbh);
      const br = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
      if (br > 0) {
        const bgd = g.createLinearGradient(0, bby, 0, bby + bbh);
        bgd.addColorStop(0, '#d3433a'); bgd.addColorStop(1, '#6e1414');
        g.fillStyle = bgd; g.fillRect(bbx, bby, bbw * br, bbh);
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(bbx, bby + 1, bbw * br, 3);
      }
      g.lineWidth = 1; g.strokeStyle = '#d8b45a'; g.strokeRect(bbx + .5, bby + .5, bbw - 1, bbh - 1);
      g.fillStyle = '#d8b45a';
      hudDiamond(g, bbx - 4, bby + bbh / 2, 9);
      hudDiamond(g, bbx + bbw + 4, bby + bbh / 2, 9);
    }
    g.restore();
  }

  LG.UI = { init, drawHUD, toast, panel, closePanel, togglePage, renderBag, renderStats, renderQuests,
    renderMap, renderSettings, charCreate, dialog, tutorial, drawItemIcon, hudHit, escMenu };
})();
