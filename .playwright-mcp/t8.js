async (page) => {
  /* t8.js —— 阶段二十（①②③⑥⑦⑫）+ 阶段二十二（④⑤⑧）+ 阶段二十三（⑤零值行/⑥改名出售/⑪UI大小+世界等级）：背包详情卡/强化感知/装备对比/武器前缀/一键出售/字体/地图/设置回归
     ① 武器前缀：rollWeapon 均带前缀（词池内）；初始武器带前缀；存读档后仍在
     ② 行囊详情卡：点击物品 → 卡内有「前缀·基础名」标题/数值行/装备强化出售三按钮；
        pbody 滚到底详情卡仍吸底可见（反馈"装备和强化按钮找不到（在背包界面底部）"）
     ③ 已装备详情：点击装备槽 → 显示详情（含卸下按钮）且不再"点一下直接卸下"
        （反馈"不能查看装备武器详情"）；点卸下 → 物品回背包
     ④ 强化感知（阶段二十二反馈"无法强化无效"）：强化后卡面数值必须变化、按钮标价、强化加成行
     ⑤ 装备对比列（反馈"无法对比装备武器"）：行囊 vs 当前装备 / 已装备 vs 行囊最佳，带差值箭头；
        阶段二十三：双侧零值词条行隐藏（反馈"装备数值有0"）
     ⑥ 一键出售两段式（清单107 改名，原"一键分解"）：首点变"确认出售？"不执行；再点出售折银 + toast
     ⑦ 字体大小：设置滑杆默认 1（反馈"默认字体大小1×"）；改 2 → 面板 zoom=2/--fs-inv=0.5 即时生效；
        再改 3 → 桌面面板横向仍在视口内（vw 补偿极限校验）
     ⑧ 地图字体+主干道烘焙连续性：fs3 下打开大地图，画布 font 走表捕获到 45px（15×3 区域名，基础字号 11→15 加大）
     ⑨ 全新触屏上下文默认字号：fs=1、--fs-inv=1、无用户标记（反馈"默认字体大小1×"）
     ⑩ 全程零报错
     ⑪ UI大小+世界最高等级（阶段二十三清单105/111）：UI 滑杆 0.7-1.3 默认1 → zoom=字体×UI、
        --fs-inv=1/(字体×UI) 同步；世界等级默认自动=玩家等级、手动档 50 生效且落库
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t8.js' }) */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [], pass: {} };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.bringToFront();
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  // 清档重载 → #mm-start 直开单人（同 t1 流程；$eval 派发避开宿主 110% 坐标换算）
  await p.evaluate(() => {
    Object.keys(localStorage).forEach((k) => { if (k.indexOf('legend_save_') === 0) localStorage.removeItem(k); });
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await p.waitForTimeout(900);
  await p.$eval('#mm-start', (el) => el.click());
  await p.waitForSelector('#cc-ok', { timeout: 10000 });
  await p.$eval('#cc-ok', (el) => el.click());
  await p.waitForTimeout(900);
  const skip = await p.$('.dialog .opts .btn');
  if (skip) await skip.click().catch(() => {});
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 10000 });

  /* ===== ① 武器前缀 ===== */
  out.prefix = await p.evaluate(() => {
    const pool = new Set(LG.Config.WEAPON_PREFIXES.map((x) => x.zh));
    const rolls = [];
    for (let i = 0; i < 6; i++) rolls.push(LG.Loot.rollWeapon(0.9, 3));
    const allHave = rolls.every((it) => it.prefix && pool.has(it.prefix.zh));
    const eqHas = !!(LG.Inv.equip.weapon && LG.Inv.equip.weapon.prefix);
    LG.Save.save(1); LG.Save.load(1);
    const afterSave = !!(LG.Inv.equip.weapon && LG.Inv.equip.weapon.prefix);
    return { allHave, eqHas, afterSave, sample: rolls[0].prefix.zh + '|' + rolls[0].weaponId };
  });
  out.pass.prefix = out.prefix.allHave && out.prefix.eqHas && out.prefix.afterSave;

  /* ===== ② 行囊详情卡（含吸底可见） ===== */
  out.bag = await p.evaluate(() => {
    for (let i = 0; i < 3; i++) LG.Inv.add(LG.Loot.rollWeapon(0.9, 3));
    LG.Inv.add(LG.Loot.rollArmor(0.9, 3));
    LG.UI.togglePage('bag', LG.UI.renderBag);
    const slot = document.querySelector('[data-bag]');
    const it = LG.Inv.bag[+slot.dataset.bag];
    slot.click();
    const info = document.getElementById('item-info');
    const txt = info.textContent;
    const has = (sel) => !!info.querySelector(sel);
    // 滚动 pbody 到底，详情卡应吸底仍在视口内
    const body = document.querySelector('.panel-bag .pbody');
    body.scrollTop = body.scrollHeight;
    const r = info.getBoundingClientRect();
    const stickyOk = r.height > 0 && r.bottom <= window.innerHeight + 2 && r.top >= 0;
    return { title: LG.UI.itemTitle(it), dot: LG.UI.itemTitle(it).indexOf('·') >= 0,
             statOk: txt.indexOf('攻击') >= 0 && txt.indexOf('射程') >= 0,
             btns: has('[data-a=eq]') && has('[data-a=enh]') && has('[data-a=sell]'),
             stickyOk };
  });
  out.pass.bag = out.bag.dot && out.bag.statOk && out.bag.btns && out.bag.stickyOk;
  await p.screenshot({ path: S + 't8-bag.png' });

  /* ===== ③ 已装备详情（查看 + 卸下） ===== */
  out.eqs = await p.evaluate(() => {
    const had = !!LG.Inv.equip.weapon;
    document.querySelector('[data-eqslot=weapon]').click();
    const info = document.getElementById('item-info');
    const txt = info.textContent;
    const stillEq = !!LG.Inv.equip.weapon; // 点槽不再直接卸下
    const viewOk = txt.indexOf('·') >= 0 && !!info.querySelector('[data-a=uneq]') && !!info.querySelector('[data-a=enh]');
    info.querySelector('[data-a=uneq]').click();
    const uneqOk = !LG.Inv.equip.weapon && LG.Inv.bag.some((x) => x && x.slot === 'weapon');
    return { had, stillEq, viewOk, uneqOk };
  });
  out.pass.eqs = out.eqs.had && out.eqs.stillEq && out.eqs.viewOk && out.eqs.uneqOk;

  /* ===== ④ 强化感知（阶段二十二反馈"无法强化无效"：卡面数值须随强化变化 + 按钮标价） ===== */
  out.enh22 = await p.evaluate(() => {
    LG.Inv.state.silver = 5000;
    const info = document.getElementById('item-info');
    // 行囊里应已有武器（组②③放入并卸回）；点第一个行囊武器 → 详情卡
    const slot = document.querySelector('[data-bag]');
    const it = LG.Inv.bag[+slot.dataset.bag];
    it.stats.dmg = 50; // 固定主词条：保证 round(50×1.05)=53 必可见（低伤词条强化后可能四舍五入不变）
    slot.click();
    const card0 = info.querySelector('.ic-stats').textContent;
    const btnTxt = info.querySelector('[data-a=enh]').textContent;
    const lv0 = it.lv, silver0 = LG.Inv.silver;
    info.querySelector('[data-a=enh]').click();
    // 强化回调里 renderBag() 会整体重建面板——旧 info 已游离，必须现取新节点
    const inf2 = document.getElementById('item-info');
    const card1 = inf2.querySelector('.ic-stats').textContent;
    const enhLine = (inf2.querySelector('.ic-enh') || {}).textContent || '';
    return {
      lvUp: it.lv === lv0 + 1, paid: silver0 - LG.Inv.silver === 50 * lv0,
      statChanged: card0 !== card1,          // 核心：强化后卡面数字必须变（旧版纹丝不动）
      btnPrice: /\d/.test(btnTxt),           // 按钮标价（反馈"无法强化"：费用可见）
      enhLine: enhLine.indexOf('强化加成') >= 0 && enhLine.indexOf('Lv' + it.lv) >= 0,
    };
  });
  out.pass.enh22 = out.enh22.lvUp && out.enh22.paid && out.enh22.statChanged
    && out.enh22.btnPrice && out.enh22.enhLine;

  /* ===== ⑤ 装备对比列（阶段二十二反馈"无法对比装备武器"；阶段二十三零值行规则） ===== */
  out.cmp22 = await p.evaluate(() => {
    const inf = () => document.getElementById('item-info'); // renderBag 会重建面板，一律现取
    // 行囊物品视图：有同槽装备则应有对比列（组②③后装备槽为空 → 先装一把再看别的）
    if (!LG.Inv.equip.weapon) {
      const wi = LG.Inv.bag.findIndex((x) => x && x.slot === 'weapon');
      LG.Inv.equipItem(wi);
      LG.UI.renderBag();
    }
    const slots = Array.from(document.querySelectorAll('[data-bag]'));
    const slot = slots.find((s) => {
      const v = LG.Inv.bag[+s.dataset.bag];
      return v && v.slot === 'weapon' && v !== LG.Inv.equip.weapon;
    });
    if (slot) {
      // 固定双侧非零词条 → 4 行齐全（阶段二十三：零值行会被隐藏，随机 N 档可能只剩2行）
      const v = LG.Inv.bag[+slot.dataset.bag];
      v.stats = { dmg: 50, aspd: 0.25, range: 5.5, crit: 0.1 };
      LG.Inv.equip.weapon.stats = { dmg: 40, aspd: 0.1, range: 3.5, crit: 0.05 };
      slot.click();
    }
    const v1 = {
      cmp: !!inf().querySelector('.ic-stats.cmp'),
      vs: /对比/.test(inf().textContent),
      rows: inf().querySelectorAll('.ic-row').length,
      marks: inf().querySelectorAll('.ic-row i.up, .ic-row i.dn, .ic-row i.eq').length,
    };
    // 已装备物品视图：对比行囊最佳（行囊还有其他武器）
    document.querySelector('[data-eqslot=weapon]').click();
    const v2 = { cmp: !!inf().querySelector('.ic-stats.cmp'), rows: inf().querySelectorAll('.ic-row').length };
    // 零值行隐藏（反馈"装备数值有0"）：双侧 aspd/crit 归零 → 仅剩攻击/射程 2 行，且卡面不出现 +0.000/+0%
    let zHide = { rows: -1, zero: true, cmp: false };
    const slot2 = Array.from(document.querySelectorAll('[data-bag]')).find((s) => {
      const v = LG.Inv.bag[+s.dataset.bag];
      return v && v.slot === 'weapon' && v !== LG.Inv.equip.weapon;
    });
    if (slot2) {
      const v = LG.Inv.bag[+slot2.dataset.bag];
      v.stats = { dmg: 50, aspd: 0, range: 5.5, crit: 0 };
      LG.Inv.equip.weapon.stats = { dmg: 40, aspd: 0, range: 3.5, crit: 0 };
      slot2.click();
      const t2 = inf().textContent;
      zHide = { rows: inf().querySelectorAll('.ic-row').length,
                zero: /\+0(\.0+)?%|\+0\.000/.test(t2),
                cmp: !!inf().querySelector('.ic-stats.cmp') };
    }
    return { bagView: v1, eqView: v2, zHide };
  });
  out.pass.cmp22 = out.cmp22.bagView.cmp && out.cmp22.bagView.vs
    && out.cmp22.bagView.rows >= 4 && out.cmp22.bagView.marks >= 4
    && out.cmp22.eqView.cmp && out.cmp22.eqView.rows >= 4
    && out.cmp22.zHide.cmp && out.cmp22.zHide.rows === 2 && !out.cmp22.zHide.zero;

  /* ===== ⑥ 一键出售（两段式；原"一键分解"，清单107 改名） ===== */
  out.dism = await p.evaluate(() => {
    document.querySelectorAll('.toast').forEach((t) => t.remove()); // 清掉组④强化残留 toast（防抢读旧文案）
    const before = { silver: LG.Inv.silver,
      expect: LG.Inv.bag.reduce((n, it) => n + (it ? LG.Inv.priceOf(it) : 0), 0),
      n: LG.Inv.bag.filter(Boolean).length };
    const db = document.querySelector('#bag-dismantle');
    db.click();
    const armed = db.textContent.indexOf('确认') >= 0 && LG.Inv.bag.filter(Boolean).length === before.n; // 首点只武装不执行
    db.click(); // 3 秒内再点 → 执行
    const toastTxt = (document.querySelector('.toast') || {}).textContent || '';
    const after = { silver: LG.Inv.silver, left: LG.Inv.bag.filter(Boolean).length };
    return { before, armed, toastOk: toastTxt.indexOf('售出') >= 0,
             ok: after.left === 0 && after.silver === before.silver + before.expect };
  });
  out.pass.dism = out.dism.armed && out.dism.toastOk && out.dism.ok;
  await p.evaluate(() => document.querySelectorAll('.panel').forEach((x) => x.remove())); // 清场

  /* ===== ⑦ 字体大小设置 ===== */
  out.font = await p.evaluate(() => {
    LG.UI.togglePage('settings', LG.UI.renderSettings);
    const sl = document.querySelector('#s-font');
    const defOk = !!sl && +sl.value === 1 && LG.UI.fontScale === 1;
    sl.value = '2'; sl.dispatchEvent(new Event('input'));
    const panel = document.querySelector('.panel');
    const zoom2 = getComputedStyle(panel).zoom === '2';
    const inv = document.documentElement.style.getPropertyValue('--fs-inv');
    const invOk = Math.abs(+inv - 0.5) < 1e-6;
    // fs3 复位后桌面面板横向贴合（vw 补偿：max-width 92vw/fs → 视觉 92vw）
    sl.value = '3'; sl.dispatchEvent(new Event('input'));
    const pr = panel.getBoundingClientRect();
    const fit = pr.left >= -2 && pr.right <= window.innerWidth + 2 && pr.width > 0;
    return { defOk, zoom2, invOk, fit, w: Math.round(pr.width) };
  });
  out.pass.font = out.font.defOk && out.font.zoom2 && out.font.invOk && out.font.fit;
  await p.screenshot({ path: S + 't8-settings.png' });

  /* ===== ⑧ 地图字体随缩放 + 环线道路烘焙连续性 ===== */
  out.map = await p.evaluate(() => {
    const seen = [];
    const proto = CanvasRenderingContext2D.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'font');
    Object.defineProperty(proto, 'font', {
      get() { return d.get.call(this); },
      set(v) { seen.push(String(v)); d.set.call(this, v); },
      configurable: true,
    });
    LG.UI.togglePage('map', LG.UI.renderMap);
    const panel = document.querySelector('.panel');
    const cv = document.querySelector('#bigmap');
    const r = cv.getBoundingClientRect();
    /* 主干道烘焙连续性（阶段二十二反馈"地图做的不够好"：路被 4.17 格步长单点采样漏成虚线
       → 覆盖扫描重绘后，10 段开口环中点在底图上应呈暖金路面色；迷宫未探索区设计上压黑不计；
       阶段二十三：末段终末之战→营地不修（清单"不闭合的圈"）→ 只扫 length-1 段） */
    const g2 = cv.getContext('2d');
    let roadHit = 0, tested = 0;
    for (let ri = 0; ri < LG.Config.REGIONS.length - 1; ri++) {
      const a = LG.Config.REGIONS[ri], b = LG.Config.REGIONS[ri + 1];
      const wmx = (a.cx + b.cx) / 2, wmy = (a.cy + b.cy) / 2;
      if (LG.Terrain.isMazeAt(wmx | 0, wmy | 0)) continue;
      tested++;
      const mx = Math.round(wmx * 0.24), my = Math.round(wmy * 0.24); // 首开 z=1 全图：2000→480
      let ok = false;
      for (let dy = -2; dy <= 2 && !ok; dy++) {
        for (let dx = -2; dx <= 2 && !ok; dx++) {
          const q = g2.getImageData(mx + dx, my + dy, 1, 1).data;
          if (q[0] > 150 && q[1] > 120 && q[0] > q[2] + 30) ok = true; // 暖金路面 (205,178,118)±明暗/界线
        }
      }
      if (ok) roadHit++;
    }
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
    Object.defineProperty(proto, 'font', d); // 还原
    const has45 = seen.some((f) => f.indexOf('45px') >= 0); // 15px × 3（基础字号 11→15 加大）
    const zoomOk = getComputedStyle(panel).zoom === '3';
    return { has45, zoomOk, roadOk: tested > 0 && roadHit === tested, roadHit, tested,
             sample: seen.filter((f) => f.indexOf('px') >= 0).slice(0, 3) };
  });
  out.pass.map = out.map.has45 && out.map.zoomOk && out.map.roadOk;
  await p.screenshot({ path: S + 't8-map.png' });

  /* ===== ⑨ 全新触屏上下文默认字号（应为 1×） ===== */
  out.mobile = await (async () => {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const mp = await c2.newPage();
    mp.on('pageerror', (e) => out.errors.push('m-pageerror: ' + e.message));
    mp.on('console', (x) => { if (x.type() === 'error') out.errors.push('m-console: ' + x.text()); });
    await mp.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
    await mp.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
    const r = await mp.evaluate(() => ({
      fs: LG.UI.fontScale,
      inv: +getComputedStyle(document.documentElement).getPropertyValue('--fs-inv'),
      flag: !!LG.U.LS.get('fontScaleUser', false),
    }));
    await c2.close();
    return r;
  })();
  out.pass.mobile = out.mobile.fs === 1 && out.mobile.inv === 1 && !out.mobile.flag;

  /* ===== ⑪ UI大小 + 世界最高等级（阶段二十三清单105/111） ===== */
  out.uiset = await p.evaluate(() => {
    LG.UI.applyFontScale(1); LG.UI.applyUIScale(1); // 归一化基线（组⑦⑧留下 fs=3）
    LG.UI.togglePage('settings', LG.UI.renderSettings);
    const sl = document.querySelector('#s-ui'), tag = document.querySelector('#s-ui-v');
    const defOk = !!sl && +sl.value === 1 && LG.UI.uiScale === 1 && +sl.min === 0.7 && +sl.max === 1.3;
    sl.value = '1.2'; sl.dispatchEvent(new Event('input'));
    const z = +getComputedStyle(document.querySelector('.panel')).zoom;
    const inv = +document.documentElement.style.getPropertyValue('--fs-inv');
    const uiOk = LG.UI.uiScale === 1.2 && Math.abs(z - 1.2) < 1e-6 && Math.abs(inv - 1 / 1.2) < 1e-6
      && !!tag && tag.textContent === '120%';
    // 世界最高等级：默认自动=玩家等级；手动滑杆 50 → worldLevel()=50；再切回自动
    const wlv = document.querySelector('#s-wlv'), wtag = document.querySelector('#s-wlv-tag'),
          wbtn = document.querySelector('#s-wlv-mode');
    const autoOk = !!wlv && LG.Config.WORLD_LEVEL.auto === true
      && LG.Config.worldLevel() === LG.Player.level && wtag.textContent === '自动';
    wbtn.click();
    wlv.value = '50'; wlv.dispatchEvent(new Event('input'));
    const manOk = LG.Config.WORLD_LEVEL.auto === false && LG.Config.worldLevel() === 50
      && (LG.U.LS.get('worldLv', {}) || {}).val === 50 && wtag.textContent === '手动';
    wbtn.click();
    const backOk = LG.Config.WORLD_LEVEL.auto === true && LG.Config.worldLevel() === LG.Player.level;
    // 复位（防污染后续断言与存档）
    LG.UI.applyUIScale(1); LG.UI.applyFontScale(1);
    LG.Config.WORLD_LEVEL.auto = true; LG.Config.WORLD_LEVEL.val = 1;
    LG.U.LS.set('worldLv', { auto: true, val: 1 });
    return { defOk, uiOk, autoOk, manOk, backOk };
  });
  out.pass.uiset = out.uiset.defOk && out.uiset.uiOk && out.uiset.autoOk
    && out.uiset.manOk && out.uiset.backOk;
  await p.screenshot({ path: S + 't8-uiset.png' });

  /* ===== ⑫ 零报错 ===== */
  out.pass.noErrors = out.errors.length === 0;
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  await ctx.close();
  return out;
}
