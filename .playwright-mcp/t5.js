async (page) => {
  /* t5.js —— 触屏摇杆与地图传送回归（阶段十七·手机实测反馈）
     覆盖：
     ① 摇杆进行中第二指点右上角 HUD 徽章 → 摇杆不被掐死、人物继续走
        （旧 bug：input touchstart 见 touches==2 无条件清 joy+pending 且本手势内无法重建）
     ② 大地图单指轻点传送（旧 bug：touchstart preventDefault 吞掉合成 click，cv.onclick
        在触屏永不触发 → "地图无法传送"）；拖拽与长按不得触发传送
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t5.js' })
     多点触控走 CDP Input.dispatchTouchEvent（全量触点集模型，与 t3 捏合同源）。 */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [] };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(p);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const T = (id, x, y) => ({ x: Math.round(x), y: Math.round(y), id });

  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.bringToFront();
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await p.waitForTimeout(900); // 菜单入场动画
  await p.evaluate(() => { try { LG.U.LS.set('tut_done', true); } catch (e) {} });
  await p.$eval('#mm-start', (el) => el.click());
  await p.waitForSelector('#cc-ok', { timeout: 10000 });
  await p.$eval('#cc-ok', (el) => el.click());
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(400);

  /* ===== ① 摇杆进行中点按钮：摇杆存活、人物继续移动 =====
     多指序列用页面内合成 TouchEvent（changedTouches 精确可控 = 真机事件形状；
     CDP dispatchTouchEvent 对"部分抬指"语义有歧义，仅用于下面单指地图段） */
  out.joyTap = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const cv = document.querySelector('#game');
    const r = cv.getBoundingClientRect();
    const mk = (id, x, y) => new Touch({ identifier: id, target: cv, clientX: r.left + x, clientY: r.top + y });
    const fire = (type, list, changed) => cv.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: changed,
    }));
    // 扫描定位右上角 mode 徽章（hudHit 为纯命中检测）
    const W = window.innerWidth, hits = [];
    for (let y = 8; y < 80; y += 4)
      for (let x = W - 320; x < W - 6; x += 4) {
        const h = LG.UI.hudHit({ x, y });
        if (h && !hits.some((o) => o.id === h)) hits.push({ id: h, x, y });
      }
    const mode = hits.find((h) => h.id === 'mode') || null;
    window.__hudIds = hits.map((h) => h.id);

    const P = LG.Player, x0 = P.x, y0 = P.y;
    const A1 = mk(1, 150, 300);
    fire('touchstart', [A1], [A1]);
    await sleep(50);
    const A2 = mk(1, 150, 240); // 下拖60px > 死区8 → 摇杆激活
    fire('touchmove', [A2], [A2]);
    await sleep(350);
    const joyBefore = !!LG.Input.state.joy;
    const movedBefore = Math.hypot(P.x - x0, P.y - y0);
    // 第二指按 mode 徽章（真机形状：changed=[B]、touches=[A,B]）
    if (mode) {
      const B = mk(2, mode.x, mode.y);
      fire('touchstart', [A2, B], [B]);
      await sleep(80);
    }
    const joyDuring = !!LG.Input.state.joy;
    // 抬按钮指（touches=[A]，changed=[B]）→ 摇杆指必须存活
    if (mode) fire('touchend', [A2], [mk(2, mode.x, mode.y)]);
    const A3 = mk(1, 150, 180);
    fire('touchmove', [A3], [A3]);
    await sleep(500);
    const joyAfter = !!LG.Input.state.joy;
    const movedAfter = Math.hypot(P.x - x0, P.y - y0);
    fire('touchend', [], [A3]);
    return {
      modeFound: !!mode, joyBefore, joyDuring, joyAfter,
      moved: +(movedAfter - movedBefore).toFixed(2),
      movedTotal: +movedAfter.toFixed(2),
    };
  });
  out.hudButtons = await p.evaluate(() => window.__hudIds || []);
  await p.screenshot({ path: S + 't5-joy-tap.png' });

  /* ===== ② 大地图单指轻点传送 ===== */
  // 阶段二十（字体默认3倍）：横屏 fs3 下画布 540 视觉高、屏仅 390，中点已出屏；
  // 叠加宿主显示缩放 110% 的 CDP 坐标 ×1.1 换算，仅画布顶部 ~17% 带内触点仍落屏。
  // 目标改为在该安全带内搜索「原始点与×1.1落点均可走、且距玩家>60格」的世界点（语义不变：点地图传送）
  await p.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await p.waitForSelector('#bigmap', { timeout: 5000 });
  const target = await p.evaluate(() => {
    const P = LG.Player, N = LG.Config.SIZE;
    const r = document.querySelector('#bigmap').getBoundingClientRect();
    let best = null;
    for (let fy = 0.06; fy <= 0.17 && !best; fy += 0.01) {
      for (let fx = 0.1; fx <= 0.85; fx += 0.05) {
        const landY = fy * 1.1 + (r.y * 0.1) / r.height, landX = fx * 1.1 + (r.x * 0.1) / r.width;
        const ok = [[fx * N, fy * N], [landX * N, landY * N]].every(([wx, wy]) =>
          LG.Terrain.passableBox(wx | 0, wy | 0) && !LG.Terrain.isWater(wx | 0, wy | 0));
        if (ok && Math.hypot(fx * N - P.x, fy * N - P.y) > 60) { best = { fx, fy }; break; }
      }
    }
    return best || { fx: 0.5, fy: 0.1 };
  });
  const box = await p.locator('#bigmap').boundingBox();
  const pre = await p.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  await send('touchStart', [T(9, box.x + box.width * target.fx, box.y + box.height * target.fy)]);
  await p.waitForTimeout(60);
  await send('touchEnd', []);
  await p.waitForTimeout(300);
  out.mapTap = await p.evaluate((q) => ({
    moved: +Math.hypot(LG.Player.x - q.x, LG.Player.y - q.y).toFixed(1),
    panelClosed: !document.querySelector('#bigmap'),
  }), pre);
  out.mapTap.target = { fx: +target.fx.toFixed(2), fy: +target.fy.toFixed(2) };

  /* ===== ③ 拖拽平移不传送 + 长按不传送 ===== */
  await p.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await p.waitForSelector('#bigmap', { timeout: 5000 });
  // 拖拽/长按交互点同取顶部安全带（×1.1 后仍落屏落画布；中点出屏会让断言空过失去意义）
  const cx = box.x + box.width * 0.3, cy = box.y + box.height * 0.1;
  const pre2 = await p.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  await send('touchStart', [T(8, cx, cy)]);
  for (let i = 1; i <= 5; i++) { await send('touchMove', [T(8, cx + i * 18, cy)]); await p.waitForTimeout(20); }
  await send('touchEnd', []);
  await p.waitForTimeout(250);
  out.mapDrag = await p.evaluate((q) => ({
    moved: +Math.hypot(LG.Player.x - q.x, LG.Player.y - q.y).toFixed(2),
    panelOpen: !!document.querySelector('#bigmap'),
  }), pre2);
  await send('touchStart', [T(7, cx - 40, cy - 30)]);
  await p.waitForTimeout(520); // >350ms 长按
  await send('touchEnd', []);
  await p.waitForTimeout(250);
  out.mapLongPress = await p.evaluate((q) => ({
    moved: +Math.hypot(LG.Player.x - q.x, LG.Player.y - q.y).toFixed(2),
    panelOpen: !!document.querySelector('#bigmap'),
  }), pre2);
  await p.screenshot({ path: S + 't5-map.png' });

  /* ================= 汇总断言 ================= */
  out.pass = {
    joySurvives: out.joyTap.modeFound === true && out.joyTap.joyBefore === true
                 && out.joyTap.joyDuring === true && out.joyTap.joyAfter === true,
    keepsMoving: out.joyTap.moved > 0.4,
    tapTeleport: out.mapTap.moved > 50 && out.mapTap.panelClosed === true,
    dragNoTp: out.mapDrag.moved < 0.5 && out.mapDrag.panelOpen === true,
    longPressNoTp: out.mapLongPress.moved < 0.5 && out.mapLongPress.panelOpen === true,
    noErrors: out.errors.length === 0,
  };
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  await ctx.close();
  return out;
}
