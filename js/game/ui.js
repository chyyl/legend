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
    LG.U.bus.on('open_dialog', ({ npc, lines }) => dialog(npc, lines));
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
  function panel(title, bodyHTML) {
    closePanel();
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML = `<span class="close-x">✕</span><h2>${title}</h2><div class="pbody">${bodyHTML}</div>`;
    p.querySelector('.close-x').onclick = closePanel;
    overlay.appendChild(p);
    curPanel = p;
    return p;
  }
  function closePanel() { if (curPanel) { curPanel.remove(); curPanel = null; } }

  /* ---------- 背包页（Q50 五页之一） ---------- */
  function renderBag() {
    const p = panel(T()('bag'), '');
    const body = p.querySelector('.pbody');
    // 装备槽展示
    let eq = '<div style="text-align:center">';
    LG.Config.ARMOR_SLOTS.concat([{ id: 'weapon', zh: '武器', en: 'Weapon' }]).forEach((sl) => {
      const it = LG.Inv.equip[sl.id];
      eq += `<div class="slot" data-q="${it ? it.quality : ''}" title="${sl.zh}" data-eqslot="${sl.id}">`;
      if (it) eq += `<canvas width="32" height="32"></canvas><span class="lv">${it.lv}</span>`;
      eq += `</div>`;
    });
    eq += '</div>';
    // 背包格子
    let bag = '<div style="margin-top:8px">';
    LG.Inv.bag.forEach((it, i) => {
      bag += `<div class="slot" data-q="${it ? it.quality : ''}" data-bag="${i}">`;
      if (it) bag += `<canvas width="32" height="32"></canvas><span class="lv">${it.lv}</span>`;
      bag += `</div>`;
    });
    bag += '</div><div id="item-info" style="margin-top:8px;min-height:40px"></div>';
    body.innerHTML = eq + bag;
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
      <div style="text-align:center;margin-bottom:8px"><canvas id="cc-prev" width="64" height="64" style="image-rendering:pixelated;width:96px;height:96px"></canvas></div>
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
    const prev = p.querySelector('#cc-prev');
    function redraw() {
      const g = prev.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 64, 64);
      g.drawImage(LG.Assets.hero(look), 0, 0, 64, 64);
    }
    redraw();
    p.querySelector('#cc-m').onclick = () => { look.gender = 'M'; redraw(); };
    p.querySelector('#cc-f').onclick = () => { look.gender = 'F'; redraw(); };
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

  /* ---------- HUD 绘制（Canvas） ---------- */
  function drawHUD() {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const s = LG.Inv.calcStats();
    const scale = window.devicePixelRatio > 1 ? 1 : 1;
    g.save();
    // 血条（左上）
    const bw = 180, bh = 14, bx = 12, by = 12;
    g.fillStyle = '#222'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#c0392b';
    g.fillRect(bx, by, bw * Math.max(0, LG.Player.hp / s.maxHp), bh);
    g.strokeStyle = '#000'; g.strokeRect(bx, by, bw, bh);
    g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.textAlign = 'left';
    g.fillText(`${Math.round(LG.Player.hp)}/${s.maxHp}`, bx + 4, by + 11);
    // 经验条（血条下）
    g.fillStyle = '#222'; g.fillRect(bx, by + bh + 2, bw, 6);
    g.fillStyle = '#2ecc71';
    g.fillRect(bx, by + bh + 2, bw * (LG.Player.expTo ? LG.Player.exp / LG.Player.expTo : 1), 6);
    // 等级/银币/药水
    g.fillStyle = '#d8b45a';
    g.fillText(`Lv${LG.Player.level}  ${LG.Inv.silver}银  药${LG.Player.potions}`, bx, by + bh + 26);
    // 攻击模式（右上）
    g.fillStyle = '#000a'; g.fillRect(W - 130, 10, 120, 28);
    g.fillStyle = '#e8e2d0'; g.textAlign = 'center';
    g.fillText('模式:' + LG.Player.mode, W - 70, 28);
    // BOSS 血条（底部居中）
    const boss = LG.Enemy.list.find((e) => e.isBoss && e.hp > 0);
    if (boss) {
      const bbw = W * 0.5, bbx = W / 2 - bbw / 2, bby = H - 40;
      g.fillStyle = '#222'; g.fillRect(bbx, bby, bbw, 16);
      g.fillStyle = '#8e44ad'; g.fillRect(bbx, bby, bbw * (boss.hp / boss.maxHp), 16);
      g.strokeStyle = '#000'; g.strokeRect(bbx, bby, bbw, 16);
      g.fillStyle = '#fff'; g.fillText(boss.type.zh || boss.type.en, W / 2, bby + 12);
    }
    g.restore();
  }

  LG.UI = { init, drawHUD, toast, panel, closePanel, renderBag, renderStats, renderQuests,
    renderMap, renderSettings, charCreate, dialog, tutorial, drawItemIcon };
})();
