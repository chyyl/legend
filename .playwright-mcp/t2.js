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

  // 页面内触点派发：与上面 el.click 同理，绕开 isMobile 模拟下 CDP 坐标 ×1.1 换算
  // （touchscreen.tap(375,30) 会落到 (412,33) 屏外，命中不到设置按钮）
  const tapJS = (x, y) => m.evaluate(([x, y]) => {
    const cv = document.getElementById('game');
    const mk = (type) => {
      const t = new Touch({ identifier: 9, target: cv, clientX: x, clientY: y });
      cv.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles: true, cancelable: true,
      }));
    };
    mk('touchstart');
    return new Promise((r) => setTimeout(() => { mk('touchend'); r(true); }, 60));
  }, [x, y]);

  // ① 主菜单按钮在面板内可达（阶段二十：字体默认3倍后菜单纵向放不下，由 pbody 滚动承接；
  //    旧断言"全部同时在视口内"不再成立，改为"按钮均在可滚动容器范围内 + 容器确实可滚 + 容器在视口内"）
  out.menuFit = await m.$$eval('.menu-btns .btn', (els) => {
    const body = document.querySelector('.menu-panel .pbody');
    if (!body) return false;
    const cs = getComputedStyle(body);
    const br = body.getBoundingClientRect();
    return cs.overflowY !== 'visible' && br.width > 0 &&
      els.every((e) => e.offsetWidth > 0 && e.offsetTop + e.offsetHeight <= body.scrollHeight + 1);
  });
  await m.screenshot({ path: SHOT + 'b1-menu.png' });

  // 进入游戏（单人直开）。
  // 注：宿主机显示缩放110%下，isMobile 模拟的 CDP 坐标会被换算 ×1.1，
  // page.click/touchscreen.tap 会命中偏移后的错误元素（曾误点联机大厅），
  // 故统一用页面内 JS 派发（el.click / TouchEvent），坐标1:1 不经输入管线
  await m.$eval('#mm-start', (el) => el.click());
  await m.waitForSelector('#cc-ok', { timeout: 10000 });
  await m.screenshot({ path: SHOT + 'b2-charcreate.png' });
  await m.$eval('#cc-ok', (el) => el.click());
  await m.waitForTimeout(900);
  const skip = await m.$('.dialog .opts .btn');
  if (skip) await skip.evaluate((el) => el.click());
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
  await tapJS(120, 550);
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
  await tapJS(375, 30);
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
