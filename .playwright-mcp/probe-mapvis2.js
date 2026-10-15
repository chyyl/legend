async (page) => {
  /* probe-mapvis2.js —— 精确复现 t3 A2→A3：传送到迷宫中心后开大地图，取现场 */
  const out = { errors: [] };
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
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
  // A2 同款：传送到迷宫中心附近
  out.tp = await p.evaluate(() => {
    const mz = LG.Config.REGIONS.find((r) => r.id === 'maze');
    const near = LG.Path.nearestWalkable(mz.cx, mz.cy, 14);
    if (near) { LG.Player.x = near.x; LG.Player.y = near.y; }
    return { at: near ? [near.x, near.y] : null };
  });
  await p.waitForTimeout(700);
  // A3 同款：开大地图
  out.open = await p.evaluate(() => {
    try { LG.UI.togglePage('map', LG.UI.renderMap); return 'ok'; }
    catch (e) { return 'throw: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
  });
  await p.waitForTimeout(600);
  out.state = await p.evaluate(() => {
    const cv = document.querySelector('#bigmap');
    const panel = document.querySelector('.panel');
    const r = cv && cv.getBoundingClientRect();
    return { cvExists: !!cv, panelPage: panel && panel.dataset.page,
             cvBox: r && { w: Math.round(r.width), h: Math.round(r.height) },
             visible: !!r && r.width > 0 && r.height > 0 };
  });
  out.errors = out.errors.slice(0, 8);
  await ctx.close();
  return out;
}
