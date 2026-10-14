async (page) => {
  const SHOT = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const m = await ctx.newPage();
  const out = { errors: [] };
  const cdp = await ctx.newCDPSession(m);
  await cdp.send('Network.enable').catch(() => {});
  await cdp.send('Network.clearBrowserCache');
  m.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  m.on('console', (c) => { if (c.type() === 'error') out.errors.push('console: ' + c.text()); });
  await m.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await m.bringToFront();
  await m.waitForSelector('#mm-start', { timeout: 20000 });

  // ① 主菜单在 iPhone12 视口内完整可见（此前 max-height:none 会裁掉按钮且无法滚动）
  out.menuFit = await m.$$eval('.menu-btns .btn', (els) => els.every((e) => {
    const r = e.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0;
  }));
  await m.screenshot({ path: SHOT + 'b1-menu.png' });

  // 进入游戏（单人直开）
  await m.click('#mm-start');
  await m.waitForSelector('#cc-ok', { timeout: 10000 });
  await m.screenshot({ path: SHOT + 'b2-charcreate.png' });
  await m.click('#cc-ok');
  await m.waitForTimeout(900);
  const skip = await m.$('.dialog .opts .btn');
  if (skip) await skip.click();
  await m.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 10000 });

  // ① HUD 缩放（U=0.5）：热区坐标应为缩小后的物理像素
  await m.waitForTimeout(400);
  out.hud = await m.evaluate(() => {
    const probe = (x, y) => LG.UI.hudHit({ x, y });
    return {
      mode: probe(378, 13),        // 徽章 7..20px
      settings: probe(375, 30),    // 设置按钮 23..37px
      tracker: probe(60, 60),      // 追踪条 49..73px
      plateOut: probe(140, 100),   // 铭牌外
    };
  });

  // ② 左半屏轻点 = 点击寻路（此前按下即摇杆，无法点击移动）
  const before = await m.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  await m.touchscreen.tap(120, 550);
  out.tapPath = await m.waitForFunction(() => LG.Player.path.length > 0, null, { timeout: 2000 }).then(() => true).catch(() => false);
  await m.waitForTimeout(1200);
  const after = await m.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  out.tapMoved = Math.hypot(after.x - before.x, after.y - before.y) > 0.5;

  // ② 左半屏拖动 = 摇杆（位移>死区才激活，松手即停）
  out.drag = await m.evaluate(async () => {
    const cv = document.getElementById('game');
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 7, target: cv, clientX: x, clientY: y });
      cv.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles: true, cancelable: true,
      }));
    };
    mk('touchstart', 120, 500);
    await new Promise((r) => setTimeout(r, 80));
    const joyAfterStart = LG.Input.state.joy; // 未拖动前不应有摇杆
    mk('touchmove', 120, 430);
    await new Promise((r) => setTimeout(r, 150));
    const joyDuring = LG.Input.state.joy;
    const mv = { x: LG.Input.state.moveVec.x, y: LG.Input.state.moveVec.y };
    mk('touchend', 120, 430);
    await new Promise((r) => setTimeout(r, 120));
    const joyAfterEnd = LG.Input.state.joy;
    return { joyAfterStart: !!joyAfterStart, joyDuring: !!joyDuring, mv, joyAfterEnd: !!joyAfterEnd };
  });

  // ⑥ 触屏点设置按钮 -> 面板 -> ESC 关闭
  await m.touchscreen.tap(375, 30);
  out.settingsOpen = await m.waitForSelector('.panel[data-page="settings"]', { timeout: 3000 }).then(() => true).catch(() => false);
  await m.screenshot({ path: SHOT + 'b3-settings.png' });
  await m.keyboard.press('Escape');
  out.settingsClose = await m.waitForFunction(() => !document.querySelector('.panel'), null, { timeout: 3000 }).then(() => true).catch(() => false);

  await m.waitForTimeout(300);
  await m.screenshot({ path: SHOT + 'b4-game.png' });
  out.errors = out.errors.slice(0, 10);
  await ctx.close();
  return out;
}
