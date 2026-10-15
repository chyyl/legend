async (page) => {
  /* t6.js —— 阶段十八：地图寻路与观感优化回归
     ① 主干道（阶段二十三改开口环）：REGIONS 相邻 10 段（末段终末之战→营地不修，清单"不闭合的圈"）
        中点必须是道路或水面；内陆锚点段必须是道路（主干道真实存在，非星型放射）
     ② 高低对比：同型瓦片 12×12 均匀区块在大地图烘焙后的亮度——
        台地(h1) > 平地(h0)×1.10、高山(h2) < 平地(h0)×0.75（反馈"高低不明显"的量化验收）
     ③ 队友标点：注入假队友 → 开大地图 → 画布指定处出现 #6cf 青点（反馈"玩家容易走散"）
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t6.js' }) */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [] };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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

  /* ===== ① 主干道：10 段开口环（不回接营地）中点为路或水面；内陆锚点段必须为路 ===== */
  out.ring = await p.evaluate(() => {
    const R = LG.Config.REGIONS, res = [];
    for (let i = 0; i < R.length - 1; i++) { // 阶段二十三：末段不修 → length-1
      const a = R[i], b = R[i + 1];
      const mx = Math.round((a.cx + b.cx) / 2), my = Math.round((a.cy + b.cy) / 2);
      res.push({ seg: a.id + '>' + b.id, t: (LG.Terrain.tileAt(mx, my) || {}).type, water: LG.Terrain.isWater(mx, my) });
    }
    return res;
  });
  const anchors = ['camp>wall', 'wall>bay', 'farm>maze', 'maze>armory', 'bridge>castle', 'castle>final'];
  out.ringStats = {
    road: out.ring.filter((s) => s.t === 6).length,
    water: out.ring.filter((s) => s.t !== 6 && s.water).length,
    total: out.ring.length,
    anchorBad: out.ring.filter((s) => anchors.includes(s.seg) && s.t !== 6).map((s) => s.seg),
  };
  out.pass = {};
  out.pass.ring = out.ringStats.road + out.ringStats.water === out.ringStats.total
    && out.ringStats.anchorBad.length === 0;

  /* ===== ② 高低对比：先找同型均匀区块，再开图采样烘焙像素 ===== */
  out.blocks = await p.evaluate(() => {
    const raw = LG.Terrain.raw(), N = LG.Config.SIZE, ts = raw.tiles, hs = raw.height;
    const REG = LG.Config.REGIONS;
    const nearRegion = (x, y) => REG.some((r) => Math.abs(x - r.cx) < 130 && Math.abs(y - r.cy) < 60);
    function findBlock(hv, type) {
      for (let y = 6; y < N - 18; y += 7)
        for (let x = 6; x < N - 18; x += 7) {
          if (nearRegion(x, y)) continue;
          let ok = true;
          for (let dy = 0; dy < 12 && ok; dy++)
            for (let dx = 0; dx < 12 && ok; dx++) {
              const i = (y + dy) * N + (x + dx);
              if (ts[i] !== type || hs[i] !== hv) ok = false;
            }
          if (ok) return { x, y, type };
        }
      return null;
    }
    // h1 对：优先草地；h2 对：任选同时存在 h0/h2 的同型（草/雪/岩）
    const g1 = findBlock(1, 0), g0 = g1 ? findBlock(0, 0) : null;
    let h2pair = null;
    for (const t of [0, 3, 4]) {
      const b2 = findBlock(2, t), b0 = findBlock(0, t);
      if (b2 && b0) { h2pair = { base: b0, test: b2 }; break; }
    }
    return { h1pair: g1 && g0 ? { base: g0, test: g1 } : null, h2pair };
  });

  // 开大地图（烘焙底图就绪）→ 采样
  // 阶段二十（字体默认3倍）：区域名标签 33px 覆盖大片图面，采样像素会命中字形
  // （实测 617=#e8d9a8 字色）。对比度量的是烘焙地形本身 → 采样期临时切 1×（t8 另有字体专项），完事还原
  const fsPrev = await p.evaluate(() => { const v = LG.UI.fontScale; LG.UI.applyFontScale(1); return v; }); // 取当前实际值以便精确还原
  await p.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await p.waitForSelector('#bigmap', { timeout: 5000 });
  out.bake = await p.evaluate((bl) => {
    const cv = document.querySelector('#bigmap'), g = cv.getContext('2d');
    const N = LG.Config.SIZE, SZ = 480;
    /* ceil 保证取样单元(4.17格宽)整体落在 12×12 区块内；
       阶段二十一起烘焙叠加了山体阴影（区块边缘像素按邻块高差亮/暗）——
       对比度量的是"高度分层底色"本身 → 采样退到区块内部(+9格)，让西/上邻仍同块同高，避开边缘明暗 */
    const luma = (b) => {
      const px = Math.min(SZ - 1, Math.ceil((b.x + 9) * SZ / N + 1e-6));
      const py = Math.min(SZ - 1, Math.ceil((b.y + 9) * SZ / N + 1e-6));
      const d = g.getImageData(px, py, 1, 1).data;
      return d[0] + d[1] + d[2];
    };
    return {
      h1: bl.h1pair ? { base: luma(bl.h1pair.base), test: luma(bl.h1pair.test) } : null,
      h2: bl.h2pair ? { base: luma(bl.h2pair.base), test: luma(bl.h2pair.test) } : null,
    };
  }, out.blocks);
  await p.evaluate((v) => LG.UI.applyFontScale(v), fsPrev); // 还原字体设置
  out.pass.contrastH1 = !!out.bake.h1 && out.bake.h1.test > out.bake.h1.base * 1.10;
  out.pass.contrastH2 = !!out.bake.h2 && out.bake.h2.test < out.bake.h2.base * 0.75;
  await p.screenshot({ path: S + 't6-map-contrast.png' });
  // 关图
  await p.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await p.waitForFunction(() => !document.querySelector('#bigmap'), null, { timeout: 3000 });

  /* ===== ③ 队友标点：注入假队友 → 重开图 → 指定处出现 #6cf 青点 ===== */
  await p.evaluate(() => { LG.Net.peers = LG.Net.peers || {}; LG.Net.peers['p9'] = { x: 1900, y: 100, name: '测试队友' }; });
  await p.evaluate(() => LG.UI.togglePage('map', LG.UI.renderMap));
  await p.waitForSelector('#bigmap', { timeout: 5000 });
  out.peer = await p.evaluate(() => {
    const cv = document.querySelector('#bigmap'), g = cv.getContext('2d');
    const N = LG.Config.SIZE, SZ = 480;
    const fx = Math.round(1900 * SZ / N), fy = Math.round(100 * SZ / N); // = (456,24)@z1
    const d = g.getImageData(fx - 8, fy - 8, 17, 17).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] === 102 && d[i + 1] === 204 && d[i + 2] === 255) hit++;
    delete LG.Net.peers['p9'];
    return { fx, fy, hit };
  });
  out.pass.peerDot = out.peer.hit > 0;
  await p.screenshot({ path: S + 't6-map-peer.png' });

  out.pass.noErrors = out.errors.length === 0;
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  await ctx.close();
  return out;
}
