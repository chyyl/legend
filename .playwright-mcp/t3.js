async (page) => {
  /* t3.js —— 本轮三 Bug 修复回归（迷宫贯通 / 大地图缩放 / BOSS血条横屏置顶）
     + 连带修复（迷宫雾每帧跟随揭示、enemy_dead region 空指针、双指捏合缩放）
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t3.js' })
     注意：宿主机显示缩放 110% 下 isMobile 模拟的 CDP 坐标有 ×1.1 换算，
     脚本内元素交互一律用页面内 JS 派发（$eval→el.click），坐标点击仅用于桌面页。 */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [] };
  const hook = (pg) => {
    pg.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
    pg.on('console', (c) => { if (c.type() === 'error') out.errors.push('console: ' + c.text()); });
  };
  const startGame = async (p) => {
    await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
    // 清档重载：进世界即自动存档，跨跑残留会让菜单变"继续游戏"跳过角色创建（#cc-ok 超时）
    await p.evaluate(() => {
      Object.keys(localStorage).forEach((k) => { if (k.indexOf('legend_save_') === 0) localStorage.removeItem(k); });
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
    await p.waitForTimeout(900); // 菜单入场动画
    await p.evaluate(() => { try { LG.U.LS.set('tut_done', true); } catch (e) {} });
    await p.$eval('#mm-start', (el) => el.click());
    await p.waitForSelector('#cc-ok', { timeout: 10000 });
    await p.$eval('#cc-ok', (el) => el.click());
    await p.waitForFunction(() => window.LG && LG.Engine && LG.Engine.scene === 'game', null, { timeout: 15000 });
    await p.waitForTimeout(400);
  };
  const redScan = (p, halfTop, halfBot) => p.evaluate(([halfTop, halfBot]) => {
    // BOSS 血条物理高 = 16×U（横屏12px/竖屏8px，bbh 未除 U），单行取样会踩到
    // 黑色边框/底色，故对目标区逐行扫描取红像素最大值（红=渐变 #d3433a→#6e1414）
    const cv = document.getElementById('game');
    const g = cv.getContext('2d');
    const dpr = cv.width / window.innerWidth;
    const W = window.innerWidth, H = window.innerHeight;
    const red = (yCss, halfCss) => {
      const x0 = Math.round((W / 2 - halfCss) * dpr), x1 = Math.round((W / 2 + halfCss) * dpr);
      let best = 0;
      for (let dy = 0; dy < 16; dy++) {
        const y = Math.round((yCss + dy) * dpr);
        const d = g.getImageData(x0, y, Math.max(1, x1 - x0), 1).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          if (r > 110 && r - gg > 40 && r - b > 40) n++;
        }
        if (n > best) best = n;
      }
      return best;
    };
    return {
      W, H, dpr: +dpr.toFixed(2),
      top: red(34, halfTop),            // 置顶定位（横屏修复位）
      bottom: red(H - 210, halfBot),    // 旧定位（竖屏保留位）
      bossAlive: LG.Enemy.list.some((e) => e.isBoss && e.hp > 0),
    };
  }, [halfTop, halfBot]);

  /* ================= A) 桌面：迷宫贯通 / 雾跟随 / 地图缩放 / region空指针 ================= */
  hook(page);
  await page.bringToFront();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable').catch(() => {});
  await cdp.send('Network.clearBrowserCache');
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await startGame(page);

  // A1 迷宫贯通（阶段十八：主干道改环形，旧"营地→迷宫直线全可走"依赖星型放射路，语义失效）
  // 现断言：farm→maze 环线段 184 采样全可走（水面除外）＝路打进了迷宫 + 营地→迷宫 A* 可达
  out.maze = await page.evaluate(() => {
    const R = LG.Config.REGIONS;
    const camp = R.find((r) => r.id === 'camp');
    const farm = R.find((r) => r.id === 'farm');
    const mz = R.find((r) => r.id === 'maze');
    let bad = 0; const N = 183;
    for (let i = 0; i <= N; i++) {
      const x = farm.cx + (mz.cx - farm.cx) * i / N;
      const y = farm.cy + (mz.cy - farm.cy) * i / N;
      if (!LG.Terrain.passableBox(x, y) && !LG.Terrain.isWater(x | 0, y | 0)) bad++;
    }
    const path = LG.Path.find(camp.cx, camp.cy, mz.cx, mz.cy, 4000);
    return { badCount: bad, centerWalkable: LG.Terrain.passableBox(mz.cx, mz.cy),
             reachable: !!path && path.length > 0 };
  });

  // A2 迷宫雾每帧跟随：传送到中心后静止不动，落点即揭示（radius6 内可见、6 格外未揭示）
  out.fogTp = await page.evaluate(() => {
    const mz = LG.Config.REGIONS.find((r) => r.id === 'maze');
    const near = LG.Path.nearestWalkable(mz.cx, mz.cy, 14);
    if (near) { LG.Player.x = near.x; LG.Player.y = near.y; }
    return { at: near ? [near.x, near.y] : null };
  });
  await page.waitForTimeout(700);
  out.fog = await page.evaluate(() => {
    const P = LG.Player;
    return {
      stationary: true,
      center: LG.Terrain.fog.visible(P.x | 0, P.y | 0),
      r5: LG.Terrain.fog.visible((P.x + 5) | 0, P.y | 0),
      r7: LG.Terrain.fog.visible((P.x + 7) | 0, P.y | 0),
      pos: [Math.round(P.x), Math.round(P.y)],
    };
  });
  await page.screenshot({ path: S + 't3-maze.png' });

  // A3 大地图缩放：按钮 → 滚轮 → 拖拽不传送 → 点击传送 → 重开面板缩放持久
  await page.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await page.waitForSelector('#bigmap', { timeout: 5000 });
  out.map = {};
  out.map.z0 = await page.$eval('#bm-zoom', (e) => e.textContent);
  await page.$eval('#bm-in', (el) => el.click());
  await page.waitForTimeout(120);
  out.map.zIn = await page.$eval('#bm-zoom', (e) => e.textContent);

  const mbox = await page.locator('#bigmap').boundingBox();
  const mcx = mbox.x + mbox.width / 2, mcy = mbox.y + mbox.height / 2;
  await page.mouse.move(mcx, mcy);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(150);
  out.map.zWheel = await page.$eval('#bm-zoom', (e) => e.textContent);

  // 拖拽平移：不得触发传送
  const p0 = await page.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y }));
  await page.mouse.move(mcx, mcy);
  await page.mouse.down();
  await page.mouse.move(mcx - 80, mcy - 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const p1 = await page.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y, panel: !!document.querySelector('#bigmap') }));
  out.map.dragDist = +Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(3);
  out.map.dragPanelOpen = p1.panel;

  // 点击传送：面板关闭 + 玩家位移（屏幕→世界换算随视图缩放平移）
  await page.mouse.click(mcx + 40, mcy + 20);
  await page.waitForTimeout(450);
  const p2 = await page.evaluate(() => ({ x: LG.Player.x, y: LG.Player.y, panel: !!document.querySelector('#bigmap') }));
  out.map.tpMoved = +Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2);
  out.map.tpClosed = !p2.panel;

  // 重开面板：跨面板开关的缩放状态持久
  await page.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await page.waitForSelector('#bigmap', { timeout: 5000 });
  out.map.zPersist = await page.$eval('#bm-zoom', (e) => e.textContent);
  await page.evaluate(() => LG.UI.closePanel());

  // A4 region 空指针：敌人死亡结算在 region=null 时不崩溃
  // （spawn 为内部函数未导出，用导出的 spawnBoss 取实例；push 在音效播放之前，
  //   即便 Sound 抛错也能从 list 里兜底拿到）
  out.regionNull = await page.evaluate(async () => {
    let killErr = null;
    try {
      const rg = LG.Config.REGIONS.find((r) => r.boss);
      let e = null;
      try { e = LG.Enemy.spawnBoss(rg); } catch (ex) {}
      if (!e) e = LG.Enemy.list.find((x) => x.isBoss && x.hp > 0);
      if (!e) throw new Error('no boss available');
      e.region = null;
      LG.Enemy.damage(e, 1e9);
      await new Promise((r) => setTimeout(r, 300));
    } catch (ex) { killErr = String(ex); }
    return { killErr };
  });

  /* ================= B) 手机横屏 844×390：BOSS 血条置顶居中 ================= */
  {
    const browser = page.context().browser();
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); hook(p);
    await p.bringToFront();
    const c2 = await ctx.newCDPSession(p);
    await c2.send('Network.enable').catch(() => {});
    await c2.send('Network.clearBrowserCache');
    await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
    await startGame(p);
    out.bossSpawn = await p.evaluate(() => {
      let err = null;
      try { LG.Enemy.spawnBoss(LG.Config.REGIONS.find((r) => r.boss)); } catch (e) { err = String(e); }
      return { err, alive: LG.Enemy.list.some((e) => e.isBoss && e.hp > 0) };
    });
    await p.waitForTimeout(600);
    out.bossLandscape = await redScan(p, 180, 180); // 顶部窗口±180 / 旧位(H-210)窗口±180
    await p.screenshot({ path: S + 't3-boss-landscape.png' });
    await ctx.close();
  }

  /* ================= C) 手机竖屏 390×844：血条保持底部 + 双指捏合缩放 ================= */
  {
    const browser = page.context().browser();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); hook(p);
    await p.bringToFront();
    const c2 = await ctx.newCDPSession(p);
    await c2.send('Network.enable').catch(() => {});
    await c2.send('Network.clearBrowserCache');
    await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
    await startGame(p);
    await p.evaluate(() => {
      try { LG.Enemy.spawnBoss(LG.Config.REGIONS.find((r) => r.boss)); } catch (e) {}
    });
    await p.waitForTimeout(600);
    out.bossPortrait = await redScan(p, 50, 80); // 顶部窗口±50（避开左铭牌）/ 底部窗口±80
    await p.screenshot({ path: S + 't3-boss-portrait.png' });

    // C2 双指捏合：CDP 触点相对坐标，×1.1 偏移不影响「相对张合」语义
    await p.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
    await p.waitForSelector('#bigmap', { timeout: 5000 });
    const z0 = await p.$eval('#bm-zoom', (e) => e.textContent);
    const box = await p.locator('#bigmap').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const t = (id, x, y) => ({ x, y, id });
    const send = (type, pts) => c2.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await send('touchStart', [t(1, cx - 30, cy), t(2, cx + 30, cy)]);
    for (let i = 1; i <= 6; i++) {
      await send('touchMove', [t(1, cx - 30 - i * 15, cy), t(2, cx + 30 + i * 15, cy)]);
      await p.waitForTimeout(30);
    }
    await send('touchEnd', []);
    await p.waitForTimeout(200);
    const z1 = await p.$eval('#bm-zoom', (e) => e.textContent);
    const panelOpen = await p.evaluate(() => !!document.querySelector('#bigmap'));
    out.pinch = { z0, z1, panelOpen };
    await ctx.close();
  }

  /* ================= 汇总断言 ================= */
  const num = (s) => parseFloat(s) || 0;
  out.pass = {
    maze: out.maze.badCount === 0 && out.maze.centerWalkable === true && out.maze.reachable === true,
    fog: out.fog.center === true && out.fog.r5 === true && out.fog.r7 === false && !!out.fogTp.at,
    mapZoom: num(out.map.zIn) > num(out.map.z0) && num(out.map.zWheel) > num(out.map.zIn),
    mapDragNoTp: out.map.dragDist < 0.5 && out.map.dragPanelOpen === true,
    mapTeleport: out.map.tpClosed === true && out.map.tpMoved > 0.5,
    mapPersist: out.map.zPersist === out.map.zWheel,
    regionNull: out.regionNull.killErr === null,
    bossTop: out.bossSpawn.alive === true && out.bossLandscape.top > 250 && out.bossLandscape.bottom < 150,
    bossBottom: out.bossPortrait.bossAlive === true && out.bossPortrait.bottom > 120 && out.bossPortrait.top < 80,
    pinch: num(out.pinch.z1) > num(out.pinch.z0) && out.pinch.panelOpen === true,
    noErrors: out.errors.length === 0,
  };
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  return out;
}
