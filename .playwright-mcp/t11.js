async (page) => {
  /* t11.js —— 阶段二十四：区域特色景物系统（幸存者营地重建 + 各区域特色）
     ① 生成与配方达标：11 区域景物数量下限 + 同种子两次生成位置一致（联机确定性）
     ② 占位纪律：实心景物零占路面/水/墙、离区域中心≥10、避 NPC、footprint 无重叠
     ③ 碰撞与寻路：帐篷实心挡人（passableBox false）、桥格 100% 可走、
        A* 营地→长城 / 海湾→农业园 仍可达、营地中心为黄土（不是大草原）
     ④ 装饰开关：关闭时 draw* 零调用（Proxy 陷阱）、开关不改变碰撞与寻路
     ⑤ 实地截图（营地/跨海大桥/黑暗迷宫）+ 设置页装饰行 + 全程零报错
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t11.js' }) */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [], pass: {} };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p.reload({ waitUntil: 'load' });
  await p.bringToFront();
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => { try { LG.U.LS.set('tut_done', true); } catch (e) {} });
  await p.$eval('#mm-start', (el) => el.click());
  await p.waitForSelector('#cc-ok', { timeout: 10000 });
  await p.$eval('#cc-ok', (el) => el.click());
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(500);

  /* ===== ① 配方达标 + 确定性 ===== */
  out.counts = await p.evaluate(() => {
    const L = LG.Decor._list();
    const by = (r, t) => L.filter((q) => q.r === r && (!t || q.t === t)).length;
    const bl = LG.Terrain.bridgeTiles() || new Set();
    let lampsOnDeck = 0;
    L.forEach((q) => { if (q.t === 'torch' && bl.has(q.y * 2000 + q.x)) lampsOnDeck++; });
    return {
      total: L.length,
      camp_tent: by('camp', 'tent'), camp_fire: by('camp', 'campfire'),
      camp_palisade: by('camp', 'palisade'), camp_crate: by('camp', 'crate'),
      wall_tower: by('wall', 'tower'), bay_house: by('bay', 'house'),
      farm_crop: by('farm', 'crop'), farm_mill: by('farm', 'windmill') + by('farm', 'house'),
      maze_wisp: by('maze', 'wisp'), maze_bone: by('maze', 'bonepile'),
      armory_furnace: by('armory', 'furnace'), armory_rack: by('armory', 'rack'),
      snow_pine: by('snow', 'pine'), isle_skull: by('isle', 'skullstone'),
      isle_tree: by('isle', 'deadtree'), castle_tower: by('castle', 'tower'),
      final_rack: by('final', 'rack'), bridge_tiles: bl.size, deck_lamps: lampsOnDeck,
    };
  });
  const c = out.counts;
  out.pass.counts = c.total >= 150
    && c.camp_tent >= 5 && c.camp_fire >= 1 && c.camp_palisade >= 10 && c.camp_crate >= 4
    && c.wall_tower >= 2 && c.bay_house >= 3
    && c.farm_crop >= 3 && c.farm_mill >= 1
    && c.maze_wisp >= 5 && c.maze_bone >= 5
    && c.armory_furnace >= 1 && c.armory_rack >= 5
    && c.snow_pine >= 8 && c.isle_skull >= 3 && c.isle_tree >= 5
    && c.castle_tower >= 4 && c.final_rack >= 8
    && c.bridge_tiles >= 20 && c.deck_lamps >= 1;

  out.determinism = await p.evaluate(() => {
    const snap = () => JSON.stringify(LG.Decor._list().map((q) => q.t + q.x + ',' + q.y + q.v));
    LG.Decor.generate(LG.Config.SEED);
    const a = snap();
    LG.Decor.generate(LG.Config.SEED);
    const b = snap();
    return a === b && LG.Decor._ready;
  });
  out.pass.determinism = !!out.determinism;

  /* ===== ② 占位纪律（全量扫描） ===== */
  out.rules = await p.evaluate(() => {
    const L = LG.Decor._list(), N = 2000;
    const raw = LG.Terrain.raw(), ts = raw.tiles, hs = raw.height;
    const REG = LG.Config.REGIONS;
    let badTiles = 0, badCenter = 0, badNpc = 0;
    const seen = new Set();
    let overlap = 0, footprints = 0;
    const npc = (LG.NPC && LG.NPC.list) || [];
    L.forEach((q) => {
      const solid = ['tent', 'house', 'windmill', 'tower', 'pine', 'deadtree', 'furnace',
        'palisade', 'crate', 'barrel', 'anvil', 'skullstone', 'banner'].includes(q.t);
      const w = { tent: 2, house: 3, windmill: 2, tower: 2, pine: 2, deadtree: 2, furnace: 2 }[q.t] || 1;
      const h = w;
      for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) {
        const x = q.x + ox, y = q.y + oy, i = y * N + x;
        footprints++;
        if (seen.has(i)) overlap++;
        seen.add(i);
        if (solid && (ts[i] === 5 || ts[i] === 6 || ts[i] === 7 || hs[i] !== 0)) badTiles++;
      }
      if (solid) {
        REG.forEach((r) => {
          const dx = Math.max(q.x - r.cx, 0, r.cx - (q.x + w));
          const dy = Math.max(q.y - r.cy, 0, r.cy - (q.y + h));
          if (dx * dx + dy * dy < 100) badCenter++;
        });
        npc.forEach((n) => {
          if (n.x >= q.x - 2 && n.x <= q.x + w + 1 && n.y >= q.y - 2 && n.y <= q.y + h + 1) badNpc++;
        });
      }
    });
    return { badTiles, badCenter, badNpc, overlap, footprints, seen: seen.size };
  });
  out.pass.rules = out.rules.badTiles === 0 && out.rules.badCenter === 0
    && out.rules.badNpc === 0 && out.rules.overlap === 0;

  /* ===== ③ 碰撞/寻路/营地黄土 ===== */
  out.path = await p.evaluate(() => {
    const L = LG.Decor._list();
    const t = L.find((q) => q.t === 'tent');
    const h3 = L.find((q) => q.t === 'house');
    const solidTent = LG.Decor.solidAt(t.x, t.y);
    const boxTent = LG.Terrain.passableBox(t.x + 0.1, t.y + 0.1);
    // 桥格 100% 可走（桥面被装饰/灯柱意外堵死的回归闸）
    const bl = LG.Terrain.bridgeTiles() || new Set();
    let bridgeBad = 0;
    bl.forEach((i) => { const x = i % 2000, y = (i / 2000) | 0; if (!LG.Terrain.walkable(x, y)) bridgeBad++; });
    // A*：营地->长城（穿木栅栏环找门）、海湾->农业园（原路线回归）
    const R = LG.Config.REGIONS;
    const get = (id) => R.find((r) => r.id === id);
    const camp = get('camp'), wall = get('wall'), bay = get('bay'), farm = get('farm');
    const p1 = LG.Path.find(camp.cx + 2, camp.cy + 2, wall.cx, wall.cy, 6000);
    const p2 = LG.Path.find(bay.cx, bay.cy, farm.cx, farm.cy, 6000);
    // 营地中心脚下=黄土（"不是大草原"），南侧无路处采样
    const south = LG.Terrain.tileAt(camp.cx, camp.cy + 11);
    return {
      solidTent, boxTent, houseBox: h3 ? LG.Terrain.passableBox(h3.x + 0.1, h3.y + 0.1) : null,
      bridgeBad, bridgeN: bl.size,
      path1: Array.isArray(p1) ? p1.length : (p1 ? 1 : 0),
      path2: Array.isArray(p2) ? p2.length : (p2 ? 1 : 0),
      campSouth: south.type, hasPath: !!(p1 && p1.length !== 0) && !!(p2 && p2.length !== 0),
    };
  });
  out.pass.path = out.path.solidTent === true && out.path.boxTent === false
    && out.path.houseBox === false && out.path.bridgeBad === 0 && out.path.bridgeN >= 20
    && out.path.hasPath && out.path.campSouth === 1; // 1=DIRT 黄土

  /* ===== ④ 装饰开关（只控视觉，不改碰撞） ===== */
  out.toggle = await p.evaluate(() => {
    const t = LG.Decor._list().find((q) => q.t === 'tent');
    const s1 = LG.Decor.solidAt(t.x, t.y);
    const w1 = LG.Terrain.passableBox(t.x + 0.1, t.y + 0.1);
    LG.Decor.setEnabled(false);
    const trap = new Proxy({}, { get() { throw new Error('DRAW_WHILE_OFF'); } });
    const view = { x0: 0, x1: 2000, y0: 0, y1: 2000 };
    let drew = false;
    try { LG.Decor.drawUnder(trap, view, 32); LG.Decor.drawOver(trap, view, 32); }
    catch (e) { drew = e.message; }
    const s2 = LG.Decor.solidAt(t.x, t.y);
    const w2 = LG.Terrain.passableBox(t.x + 0.1, t.y + 0.1);
    LG.Decor.setEnabled(true);
    const en = LG.Decor.enabled;
    // 设置页有装饰行，且可点击切换
    let rowOk = false, clickOk = false;
    try {
      const el = LG.UI.renderSettings();
      rowOk = !!el && el.outerHTML.includes('s-decor');
      if (rowOk && el.isConnected) {
        const b = el.querySelector('#s-decor');
        const before = b.textContent;
        b.click();
        clickOk = b.textContent !== before;
        b.click();
        el.remove();
      } else clickOk = rowOk; // 面板未挂载时仅验行存在
    } catch (e) { out.errors.push('settings: ' + e.message); }
    return { s1, s2, drew, w1, w2, en, rowOk, clickOk };
  });
  out.pass.toggle = out.toggle.drew === false && out.toggle.s1 === true && out.toggle.s2 === true
    && out.toggle.w1 === false && out.toggle.w2 === false && out.toggle.en === true
    && out.toggle.rowOk === true && out.toggle.clickOk === true;

  /* ===== ⑤ 实地截图：玩家站进景物之中（1.5× 视野窄，站区域中心看不到环上景物） ===== */
  const goTo = async (expr, dx, dy, name) => {
    await p.evaluate(({ expr, dx, dy }) => {
      const src = new Function('L', 'R', 'return (' + expr + ')(L, R)')(LG.Decor._list(), LG.Config.REGIONS);
      LG.Player.x = src.x + dx; LG.Player.y = src.y + dy;
      LG.Camera.follow(LG.Player.x, LG.Player.y);
      if (LG.Enemy && LG.Enemy.clear) LG.Enemy.clear();
    }, { expr, dx, dy });
    await p.waitForTimeout(400);
    await p.evaluate(() => { if (LG.Enemy && LG.Enemy.clear) LG.Enemy.clear(); });
    await p.waitForTimeout(200);
    await p.screenshot({ path: S + name });
  };
  // 营地：篝火 + 帐篷环 + 木栅栏 + 黄土地
  await goTo("L => L.find(q => q.r === 'camp' && q.t === 'campfire')", 2, 6, 't11-camp.png');
  // 跨海大桥：站桥面中央（木板/护栏/桥墩/水面）
  await p.evaluate(() => {
    const bl = Array.from(LG.Terrain.bridgeTiles());
    const mid = bl[(bl.length / 2) | 0];
    LG.Player.x = (mid % 2000) + 0.5; LG.Player.y = ((mid / 2000) | 0) + 0.5;
    LG.Camera.follow(LG.Player.x, LG.Player.y);
    if (LG.Enemy && LG.Enemy.clear) LG.Enemy.clear();
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => { if (LG.Enemy && LG.Enemy.clear) LG.Enemy.clear(); });
  await p.waitForTimeout(200);
  await p.screenshot({ path: S + 't11-bridge.png' });

  /* 黑暗迷宫：暗化地面 + 魂火（中心走廊已揭示） */
  await p.evaluate(() => {
    const m = LG.Config.REGIONS.find((r) => r.id === 'maze');
    LG.Player.x = m.cx; LG.Player.y = m.cy;
    LG.Camera.follow(m.cx, m.cy);
    LG.Terrain.fog.reveal(m.cx, m.cy);
    LG.Terrain.fog.reveal(m.cx + 8, m.cy);
    LG.Terrain.fog.reveal(m.cx - 8, m.cy);
    LG.Terrain.fog.reveal(m.cx, m.cy + 8);
    LG.Terrain.fog.reveal(m.cx, m.cy - 8);
    if (LG.Enemy && LG.Enemy.clear) LG.Enemy.clear();
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => { if (LG.Enemy && LG.Enemy.clear) LG.Enemy.clear(); });
  await p.waitForTimeout(200);
  await p.screenshot({ path: S + 't11-maze.png' });

  /* 长城箭塔 / 黑暗城堡塔群（塔/旗在场，目测素材） */
  await goTo("L => L.find(q => q.r === 'wall' && q.t === 'tower')", 1, 5, 't11-wall.png');
  await goTo("L => L.find(q => q.r === 'castle' && q.t === 'tower')", 1, 6, 't11-castle.png');

  /* ===== 零报错收口 ===== */
  await p.waitForTimeout(300);
  out.pass.noErrors = out.errors.length === 0;
  out.pass.all = Object.values(out.pass).every(Boolean);
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
  return out;
}
