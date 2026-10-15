async (page) => {
  /* probe-mapvis5.js —— t5 手机横屏(844×390 isMobile dsf2)上下文开大地图失败现场 */
  const out = { errors: [] };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.bringToFront();
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => { try { LG.U.LS.set('tut_done', true); } catch (e) {} });
  await p.$eval('#mm-start', (el) => el.click());
  await p.waitForSelector('#cc-ok', { timeout: 10000 });
  await p.$eval('#cc-ok', (el) => el.click());
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(400);
  out.open = await p.evaluate(() => {
    try { LG.UI.togglePage('map', LG.UI.renderMap); return 'ok'; }
    catch (e) { return 'throw: ' + e.message + ' | ' + String(e.stack || '').split('\n').slice(1, 3).join(' <- '); }
  });
  await p.waitForTimeout(700);
  out.state = await p.evaluate(() => {
    const cv = document.querySelector('#bigmap');
    const panel = document.querySelector('.panel');
    const cs = cv && getComputedStyle(cv);
    const pcs = panel && getComputedStyle(panel);
    const r = cv && cv.getBoundingClientRect();
    const pr = panel && panel.getBoundingClientRect();
    return {
      cvExists: !!cv, panelExists: !!panel,
      cvDisplay: cs && cs.display, cvVisibility: cs && cs.visibility,
      cvW: cs && cs.width, cvH: cs && cs.height,
      cvBox: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      panelBox: pr && { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) },
      panelOverflow: pcs && pcs.overflow, panelMaxH: pcs && pcs.maxHeight,
      mediaShort: matchMedia('(max-height: 560px)').matches,
      iw: innerWidth, ih: innerHeight,
    };
  });
  out.errors = out.errors.slice(0, 8);
  await ctx.close();
  return out;
}
