/* ============================================================================
   js/game/ui.js —— 界面系统（Q50 HUD/五页菜单，Q49 亮度，Q51 角色创建）
   ----------------------------------------------------------------------------
   职责：Canvas 绘制 HUD（血条/快捷栏/小地图入口/攻击模式），DOM 实现五页菜单
         （背包/属性/任务/地图/设置）、NPC 对话框、商店、强化、角色创建、教程。

   对外接口（window.LG.UI）：
     .init(canvas) .drawHUD() .toast(msg)
     .openPanel(name) .closePanel()
     .renderBag() .renderStats() .renderQuests() .renderMap() .renderSettings()
     .charCreate() .dialog(npc, lines) .tutorial()

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
    LG.U.bus.on('open_quests', () => renderQuests()); // 任务 NPC（此前事件未绑定，点击无反应）
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
    return p;
  }

  /* ---------- 任务页 ---------- */
  function renderQuests() {
    let html = '';
    const act = LG.Quest.active;
    if (!act.length) html = '<p style="text-align:center;color:#999">暂无进行中任务</p>';
    act.forEach((q) => {
      html += `<div class="room-item"><div><b>${LG.I18n.lang === 'zh' ? q.zh : q.en}</b>
        <div style="font-size:13px;color:#9a8f70">${T()('q_' + q.type)} ${q.got}/${q.need}</div></div>
        ${q.got >= q.need ? `<button class="btn small primary" data-sub="${q.id}">${T()('quest_submit')}</button>` : ''}</div>`;
    });
    const p = panel(T()('quest'), html);
    p.querySelectorAll('[data-sub]').forEach((b) => {
      b.onclick = () => { LG.Quest.submit(b.dataset.sub); renderQuests(); };
    });
    return p;
  }

  /* ---------- 地图页（Q13 点击任意点传送，Q15 仅设置菜单查看） ---------- */
  function renderMap() {
    const p = panel(T()('map'), `<canvas id="bigmap" width="480" height="480" style="width:100%;max-width:480px;display:block;margin:0 auto"></canvas>
      <div style="text-align:center;margin-top:6px;color:#9a8f70">${T()('teleport_hint')}</div>`);
    const cv = p.querySelector('#bigmap');
    const g = cv.getContext('2d');
    const S = 480 / LG.Config.SIZE;
    // 绘制区域色块
    g.fillStyle = '#12202e'; g.fillRect(0, 0, 480, 480);
    LG.Config.REGIONS.forEach((rg) => {
      g.fillStyle = '#2e4a3a';
      const sx = rg.cx * S - 18, sy = rg.cy * S - 18;
      g.fillRect(sx, sy, 36, 36);
      g.fillStyle = '#d8b45a'; g.font = '11px sans-serif'; g.textAlign = 'center';
      g.fillText(LG.I18n.lang === 'zh' ? rg.zh : rg.en, rg.cx * S, rg.cy * S - 22);
    });
    // 玩家位置
    g.fillStyle = '#ff5050';
    g.fillRect(LG.Player.x * S - 3, LG.Player.y * S - 3, 6, 6);
    // 点击传送（Q13）
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * LG.Config.SIZE;
      const wy = ((e.clientY - r.top) / r.height) * LG.Config.SIZE;
      const near = LG.Path.nearestWalkable(wx | 0, wy | 0, 12);
      if (near) { LG.Player.x = near.x; LG.Player.y = near.y; toast('已传送'); closePanel(); }
      else toast('该处无法到达');
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
    const acts = ['up', 'down', 'left', 'right', 'attack', 'block', 'jump', 'potion', 'bag', 'map', 'quest'];
    let html = '';
    acts.forEach((a) => {
      html += `<div class="slider-row"><label>${a}</label><button class="btn small" data-kb="${a}">${LG.Input.keyFor(a)}</button></div>`;
    });
    const p = panel(T()('keybind'), html);
    p.querySelectorAll('[data-kb]').forEach((b) => {
      b.onclick = () => {
        toast('按下新按键…');
        const h = (e) => { LG.Input.setKey(b.dataset.kb, e.code); b.textContent = e.code; window.removeEventListener('keydown', h); };
        window.addEventListener('keydown', h);
      };
    });
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
      // 发放初始武器
      const it = LG.Loot.rollWeapon(LG.Config.DIFFICULTY.default, 1);
      it.weaponId = wpnId; it.kind = LG.Config.WEAPONS.find(w => w.id === wpnId).kind;
      it.quality = 'N'; it.stats = { dmg: LG.Config.WEAPONS.find(w => w.id === wpnId).base, aspd: 0, range: 0, crit: 0 };
      LG.Inv.add(it); LG.Inv.equipItem(LG.Inv.bag.indexOf(it));
      LG.Player._raw.name = name; LG.Player._raw.gender = look.gender; LG.Player._raw.look = look;
      closePanel();
      cb && cb({ name, look });
    };
  }

  /* ---------- HUD 绘制（Canvas；阶段十二重做为"雕纹铭牌"风格） ----------
     坐标一律使用 CSS 像素（window.innerWidth/Height）：引擎 render() 前已
     setTransform(DPR)，若用 canvas.width（物理像素）则 DPR≥2 时右侧/底部元素被推出屏幕。 */
  function hudDiamond(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillRect(-s / 2, -s / 2, s, s);
    g.restore();
  }

  function drawHUD() {
    const g = canvas.getContext('2d');
    const W = window.innerWidth, H = window.innerHeight;
    const s = LG.Inv.calcStats();
    const P = LG.Player;
    g.save();
    g.imageSmoothingEnabled = false;
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
    g.fillStyle = '#9a8f70'; g.font = '9px "LegendKai", sans-serif';
    g.fillText('LV', sx + sw / 2, sy + 14);
    g.fillStyle = '#ffe9a8'; g.font = 'bold 22px "LegendKai", sans-serif';
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
    g.font = 'bold 12.5px "LegendKai", sans-serif'; g.textAlign = 'center';
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
    g.textAlign = 'left'; g.font = '13.5px "LegendKai", sans-serif';
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
    g.font = '13.5px "LegendKai", sans-serif';
    const bw = Math.round(g.measureText(modeTxt).width) + 48, bh = 26;
    const bx = W - 14 - bw, by = 14;
    g.fillStyle = 'rgba(6,7,11,0.78)'; g.fillRect(bx, by, bw, bh);
    g.lineWidth = 2; g.strokeStyle = '#000'; g.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    g.lineWidth = 1; g.strokeStyle = 'rgba(216,180,90,0.9)'; g.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
    g.fillStyle = P.mode === 'on' ? '#7ed957' : (P.mode === 'half' ? '#d8b45a' : '#8a8f9e');
    hudDiamond(g, bx + 17, by + bh / 2, 9);
    g.fillStyle = '#e8e2d0'; g.textAlign = 'left';
    g.fillText(modeTxt, bx + 32, by + 18);

    /* ===== 底部居中：BOSS 血条（黑台 + 暗红渐变 + 金框 + 两端菱形铆） ===== */
    const boss = LG.Enemy.list.find((e) => e.isBoss && e.hp > 0);
    if (boss) {
      const bbw = Math.min(W * 0.56, 540), bbx = Math.round(W / 2 - bbw / 2), bby = H - 62, bbh = 16;
      g.font = '15px "LegendKai", sans-serif'; g.textAlign = 'center';
      const bname = LG.I18n.lang === 'zh' ? (boss.type.zh || boss.type.en) : (boss.type.en || boss.type.zh);
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(bname, W / 2 + 1, bby - 7 + 1);
      g.fillStyle = '#ffe9a8'; g.fillText(bname, W / 2, bby - 7);
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
    renderMap, renderSettings, charCreate, dialog, tutorial, drawItemIcon };
})();
