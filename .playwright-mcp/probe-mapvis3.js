async (page) => {
  /* probe-mapvis3.js —— 直接在共享 harness page 上复刻 t3 A 段，取开图失败现场 */
  const out = { errors: [] };
  const hook = (pg) => {
    pg.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
    pg.on('console', (c) => { if (c.type() === 'error') out.errors.push('console: ' + c.text()); });
  };
  hook(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable').catch(() => {});
  await cdp.send('Network.clearBrowserCache');
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  // t3.startGame 同款
  await page.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await page.evaluate(() => {
    Object.keys(localStorage).forEach((k) => { if (k.indexOf('legend_save_') === 0) localStorage.removeItem(k); });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { LG.U.LS.set('tut_done', true); } catch (e) {} });
  await page.$eval('#mm-start', (el) => el.click());
  await page.waitForSelector('#cc-ok', { timeout: 10000 });
  await page.$eval('#cc-ok', (el) => el.click());
  await page.waitForFunction(() => window.LG && LG.Engine && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  // A2 同款：迷宫传送 + 700ms
  await page.evaluate(() => {
    const mz = LG.Config.REGIONS.find((r) => r.id === 'maze');
    const near = LG.Path.nearestWalkable(mz.cx, mz.cy, 14);
    if (near) { LG.Player.x = near.x; LG.Player.y = near.y; }
  });
  await page.waitForTimeout(700);
  // A3 同款：开图 + 立即取现场（不等 waitForSelector，避免超时掩盖真相）
  out.open = await page.evaluate(() => {
    try { LG.UI.togglePage('map', LG.UI.renderMap); return 'ok'; }
    catch (e) { return 'throw: ' + e.message; }
  });
  await page.waitForTimeout(800);
  out.state = await page.evaluate(() => {
    const cv = document.querySelector('#bigmap');
    const panel = document.querySelector('.panel');
    const r = cv && cv.getBoundingClientRect();
    const pr = panel && panel.getBoundingClientRect();
    return {
      cvExists: !!cv, panelExists: !!panel, panelPage: panel && panel.dataset.page,
      panels: document.querySelectorAll('.panel').length,
      cvBox: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      panelBox: pr && { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) },
      csW: cv && getComputedStyle(cv).width,
      iw: innerWidth, ih: innerHeight,
      mediaShort: matchMedia('(max-height: 560px)').matches,
      fsInv: getComputedStyle(document.documentElement).getPropertyValue('--fs-inv'),
      panelZoom: panel && getComputedStyle(panel).zoom,
      fsScaleLS: LG.U.LS.get('fontScale', 3),
    };
  });
  out.errors = out.errors.slice(0, 10);
  return out;
}
