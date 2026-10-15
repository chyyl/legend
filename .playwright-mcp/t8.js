async (page) => {
  /* t8.js —— 阶段二十：背包详情卡/武器前缀/一键分解/字体大小/地图字体回归
     ① 武器前缀：rollWeapon 均带前缀（词池内）；初始武器带前缀；存读档后仍在
     ② 行囊详情卡：点击物品 → 卡内有「前缀·基础名」标题/数值行/装备强化出售三按钮；
        pbody 滚到底详情卡仍吸底可见（反馈"装备和强化按钮找不到（在背包界面底部）"）
     ③ 已装备详情：点击装备槽 → 显示详情（含卸下按钮）且不再"点一下直接卸下"
        （反馈"不能查看装备武器详情"）；点卸下 → 物品回背包
     ④ 一键分解两段式：首点变"确认分解？"不执行；再点分解行囊折银 + toast
     ⑤ 字体大小：设置滑杆默认 3；改 2 → 面板 zoom=2/--fs-inv=0.5 即时生效；
        fs3 下桌面面板横向仍在视口内（vw 补偿生效）
     ⑥ 地图字体：fs3 下打开大地图，画布 font 走表捕获到 33px（11×3 区域名）
     ⑦ 全程零报错
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

  /* ===== ④ 一键分解（两段式） ===== */
  out.dism = await p.evaluate(() => {
    const before = { silver: LG.Inv.silver,
      expect: LG.Inv.bag.reduce((n, it) => n + (it ? LG.Inv.priceOf(it) : 0), 0),
      n: LG.Inv.bag.filter(Boolean).length };
    const db = document.querySelector('#bag-dismantle');
    db.click();
    const armed = db.textContent.indexOf('确认') >= 0 && LG.Inv.bag.filter(Boolean).length === before.n; // 首点只武装不执行
    db.click(); // 3 秒内再点 → 执行
    const toastTxt = (document.querySelector('.toast') || {}).textContent || '';
    const after = { silver: LG.Inv.silver, left: LG.Inv.bag.filter(Boolean).length };
    return { before, armed, toastOk: toastTxt.indexOf('分解') >= 0,
             ok: after.left === 0 && after.silver === before.silver + before.expect };
  });
  out.pass.dism = out.dism.armed && out.dism.toastOk && out.dism.ok;
  await p.evaluate(() => document.querySelectorAll('.panel').forEach((x) => x.remove())); // 清场

  /* ===== ⑤ 字体大小设置 ===== */
  out.font = await p.evaluate(() => {
    LG.UI.togglePage('settings', LG.UI.renderSettings);
    const sl = document.querySelector('#s-font');
    const defOk = !!sl && +sl.value === 3 && LG.UI.fontScale === 3;
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

  /* ===== ⑥ 地图字体随缩放 ===== */
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
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
    Object.defineProperty(proto, 'font', d); // 还原
    const has33 = seen.some((f) => f.indexOf('33px') >= 0); // 11px × 3
    const zoomOk = getComputedStyle(panel).zoom === '3';
    return { has33, zoomOk, sample: seen.filter((f) => f.indexOf('px') >= 0).slice(0, 3) };
  });
  out.pass.map = out.map.has33 && out.map.zoomOk;
  await p.screenshot({ path: S + 't8-map.png' });

  /* ===== ⑦ 零报错 ===== */
  out.pass.noErrors = out.errors.length === 0;
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  await ctx.close();
  return out;
}
