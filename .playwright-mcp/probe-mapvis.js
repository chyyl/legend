async (page) => {
  /* probe-mapvis.js —— 复现 t3 waitForSelector('#bigmap') 超时：取面板/画布/报错现场 */
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
  // 开大地图（同 t3 line107）
  out.open = await p.evaluate(() => {
    try { LG.UI.togglePage('map', LG.UI.renderMap); return 'ok'; }
    catch (e) { return 'throw: ' + e.message; }
  });
  await p.waitForTimeout(600);
  out.state = await p.evaluate(() => {
    const cv = document.querySelector('#bigmap');
    const panel = document.querySelector('.panel');
    const r = cv && cv.getBoundingClientRect();
    const pr = panel && panel.getBoundingClientRect();
    return {
      cvExists: !!cv, panelExists: !!panel,
      panelPage: panel && panel.dataset.page,
      cvBox: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      panelBox: pr && { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) },
      csWidth: cv && getComputedStyle(cv).width, csHeight: cv && getComputedStyle(cv).height,
      iw: innerWidth, ih: innerHeight,
    };
  });
  out.errors = out.errors.slice(0, 8);
  await ctx.close();
  return out;
}
