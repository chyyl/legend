async (page) => {
  /* t7.js —— 阶段十九：更新日志 + 网页自动更新回归
     ① 数据链闭环：LG.CHANGELOG 非空且条目完整；Updater.current() === 首条版本；
        仓库根 version.json（部署端点）与之一致
     ② 设置页入口：版本行显示当前版本；「更新日志」按钮打开页面、条目数与数据一致
     ③ 自动更新：mock version.json=v99.0.0 → 检测触发自动重载（URL 带 ?vup=、防循环标记落库）；
        重载后第二次检测走 confirm 分支（弹窗被拒绝）且不再重载（无死循环）
     ④ 全程零报错
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t7.js' }) */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [], pass: {} };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  let dialogs = 0;
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  p.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); }); // headless：confirm 一律拒绝
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.bringToFront();
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await p.waitForTimeout(900);

  /* ===== ① 数据链闭环 ===== */
  out.data = await p.evaluate(async () => {
    const cur = LG.Updater && LG.Updater.current();
    let ver = null;
    try { ver = await (await fetch('version.json')).json(); } catch (e) { /* 忽略 */ }
    const list = LG.CHANGELOG || [];
    return { n: list.length, first: (list[0] || {}).v, cur, ver,
             itemsOk: list.every((e) => /^v[\d.]+$/.test(e.v) && e.date && e.items.length > 0) };
  });
  out.pass.data = out.data.n >= 3 && out.data.itemsOk
    && /^v\d+\.\d+\.\d+$/.test(out.data.first || '')
    && out.data.cur === out.data.first
    && !!out.data.ver && out.data.ver.v === out.data.first;

  /* ===== ② 设置页入口 ===== */
  out.ui = await p.evaluate(() => {
    LG.UI.togglePage('settings', LG.UI.renderSettings);
    const ver = document.querySelector('#s-ver');
    const verOk = !!ver && ver.textContent.indexOf(LG.Updater.current()) >= 0;
    const btn = document.querySelector('#s-log');
    if (btn) btn.click();
    const cl = document.querySelector('.cl-wrap');
    const vers = document.querySelectorAll('.cl-ver');
    const items = document.querySelectorAll('.cl-items li');
    const curTxt = !!cl && cl.textContent.indexOf(LG.Updater.current()) >= 0;
    const n = vers.length, ni = items.length;
    document.querySelectorAll('.panel').forEach((x) => x.remove()); // 清场
    return { verOk, opened: !!cl, n, ni, curTxt, expect: LG.CHANGELOG.length };
  });
  out.pass.ui = out.ui.verOk && out.ui.opened && out.ui.n === out.ui.expect && out.ui.ni >= 6 && out.ui.curTxt;
  await p.screenshot({ path: S + 't7-changelog.png' });

  /* ===== ③ 自动更新模拟 ===== */
  await p.route('**/version.json*', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ v: 'v99.0.0', date: '2099-01-01' }),
  }));
  // 触发检测（与启动 1500ms 自动检测等价幂等）；导航销毁执行上下文属预期，忽略
  await p.evaluate(() => { LG.Updater.check(); }).catch(() => {});
  await p.waitForFunction(() => /[?&]vup=/.test(location.search), null, { timeout: 8000 }).catch(() => {});
  out.upd1 = { reloaded: /[?&]vup=/.test(p.url()),
               flag: await p.evaluate((k) => sessionStorage.getItem(k), 'legend_up_at_v99.0.0') };
  // 重载后：版本仍 v99（mock 未撤）→ 启动二次检测走 confirm 分支，被拒绝后不得再重载
  const urlAfter = p.url();
  await p.waitForTimeout(2600); // 覆盖启动 1500ms 检测
  out.upd2 = { stable: p.url() === urlAfter, dialogs };
  out.pass.update = out.upd1.reloaded && !!out.upd1.flag && out.upd2.stable && out.upd2.dialogs >= 1;
  await p.unroute('**/version.json*');

  /* ===== ④ 零报错 ===== */
  out.pass.noErrors = out.errors.length === 0;
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  await ctx.close();
  return out;
}
