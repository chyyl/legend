async (page) => {
  /* probe-mapvis4.js —— 复刻 t3 A3 全链（开图/按钮/滚轮/拖拽/点击传送/重开），定位哪一步破坏状态 */
  const out = { errors: [] };
  const hook = (pg) => {
    pg.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
    pg.on('console', (c) => { if (c.type() === 'error') out.errors.push('console: ' + c.text()); });
  };
  hook(page);
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
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
  await page.evaluate(() => {
    const mz = LG.Config.REGIONS.find((r) => r.id === 'maze');
    const near = LG.Path.nearestWalkable(mz.cx, mz.cy, 14);
    if (near) { LG.Player.x = near.x; LG.Player.y = near.y; }
  });
  await page.waitForTimeout(700);
  const exists = () => page.evaluate(() => !!document.querySelector('#bigmap'));
  out.step = {};
  // ① 开图
  await page.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await page.waitForSelector('#bigmap', { timeout: 5000 }).then(() => { out.step.open1 = 'ok'; }).catch((e) => { out.step.open1 = 'TIMEOUT'; });
  out.step.z0 = await page.$eval('#bm-zoom', (e) => e.textContent).catch(() => null);
  // ② 按钮放大
  await page.$eval('#bm-in', (el) => el.click());
  await page.waitForTimeout(120);
  out.step.zIn = await page.$eval('#bm-zoom', (e) => e.textContent).catch(() => null);
  // ③ 滚轮
  const mbox = await page.locator('#bigmap').boundingBox();
  const mcx = mbox.x + mbox.width / 2, mcy = mbox.y + mbox.height / 2;
  out.step.box = { x: Math.round(mbox.x), y: Math.round(mbox.y), w: Math.round(mbox.width) };
  await page.mouse.move(mcx, mcy);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(150);
  out.step.zWheel = await page.$eval('#bm-zoom', (e) => e.textContent).catch(() => null);
  // ④ 拖拽不传送
  const p0 = await page.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  await page.mouse.move(mcx, mcy);
  await page.mouse.down();
  await page.mouse.move(mcx - 80, mcy - 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const p1 = await page.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  out.step.dragDist = +Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(3);
  out.step.dragPanelOpen = await exists();
  // ⑤ 点击传送（期望关闭面板+位移）
  await page.mouse.click(mcx + 40, mcy + 20);
  await page.waitForTimeout(450);
  const p2 = await page.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  out.step.tpMoved = +Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2);
  out.step.tpPanelStillOpen = await exists();
  // ⑥ 重开（若⑤没关面板，这里 toggle 会变成"关闭"→ 失败点）
  await page.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  out.step.reopenAfter = await exists();
  await page.waitForSelector('#bigmap', { timeout: 3000 }).then(() => { out.step.reopen = 'ok'; }).catch(() => { out.step.reopen = 'TIMEOUT'; });
  out.errors = out.errors.slice(0, 10);
  return out;
}
