async (page) => {
  const SHOT = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [] };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable').catch(() => {});
  await cdp.send('Network.clearBrowserCache');
  page.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await page.bringToFront();
  await page.waitForSelector('#mm-start', { timeout: 20000 });
  // 阶段十五：进世界即自动存档（legend_save_1），默认上下文跨跑会残留 →
  // 菜单变"继续游戏"跳过角色创建使 #mm-start→#cc-ok 断言失效；开跑先清档重载
  await page.evaluate(() => {
    Object.keys(localStorage).forEach((k) => { if (k.indexOf('legend_save_') === 0) localStorage.removeItem(k); });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#mm-start', { timeout: 20000 });
  out.menuBtns = await page.$$eval('.menu-btns .btn', (els) => els.map((e) => e.id + ':' + e.textContent.trim()));
  await page.screenshot({ path: SHOT + 'a1-menu.png' });
  // ⑦ 主菜单：开始游戏直开单人（不经联机大厅）
  await page.click('#mm-start');
  await page.waitForSelector('#cc-ok', { timeout: 10000 });
  out.soloDirect = true;
  await page.click('#cc-ok');
  await page.waitForTimeout(900);
  const skip = await page.$('.dialog .opts .btn');
  if (skip) await skip.click();
  await page.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 10000 });
  out.scene = 'game';

  // ===== ④ 右墙用例 =====
  const setup = await page.evaluate(() => {
    const P = LG.Player, T = LG.Terrain, raw = T.raw();
    const x0 = Math.floor(P.x), y0 = Math.floor(P.y);
    const wx = x0 + 1, i = y0 * T.SIZE + wx;
    const bak = { t: raw.tiles[i], h: raw.height[i] };
    raw.tiles[i] = 7; raw.height[i] = 2;
    P.x = x0; P.y = y0; P.path.length = 0;
    return { x0, y0, wx, bak };
  });
  await page.keyboard.down('d');
  await page.waitForTimeout(1200);
  await page.keyboard.up('d');
  out.wallX = await page.evaluate(() => +LG.Player.x.toFixed(3));
  out.wallPass = out.wallX < setup.wx - 0.96;
  await page.evaluate((s) => {
    const raw = LG.Terrain.raw();
    raw.tiles[s.y0 * LG.Terrain.SIZE + s.wx] = s.bak.t;
    raw.height[s.y0 * LG.Terrain.SIZE + s.wx] = s.bak.h;
  }, setup);

  // ===== ④ 右海用例 =====
  const sw = await page.evaluate(() => {
    const P = LG.Player, T = LG.Terrain, raw = T.raw();
    const x0 = Math.floor(P.x), y0 = Math.floor(P.y);
    const wx = x0 + 1, i = y0 * T.SIZE + wx;
    const bak = { t: raw.tiles[i], h: raw.height[i] };
    raw.tiles[i] = 5; raw.height[i] = 0;
    P.x = x0; P.y = y0; P.path.length = 0;
    return { x0, y0, wx, bak };
  });
  await page.keyboard.down('d');
  await page.waitForTimeout(900);
  await page.keyboard.up('d');
  out.waterX = await page.evaluate(() => +LG.Player.x.toFixed(3));
  out.waterPass = out.waterX < sw.wx - 0.96;
  await page.evaluate((s) => {
    const raw = LG.Terrain.raw();
    raw.tiles[s.y0 * LG.Terrain.SIZE + s.wx] = s.bak.t;
    raw.height[s.y0 * LG.Terrain.SIZE + s.wx] = s.bak.h;
  }, sw);

  // ===== ④ 敌人回家穿墙用例（10格外造墙，敌人回家必须被拦停） =====
  const es = await page.evaluate(() => {
    const P = LG.Player, T = LG.Terrain, raw = T.raw();
    const x0 = Math.floor(P.x), y0 = Math.floor(P.y);
    const wx = x0 + 2, i = y0 * T.SIZE + wx;
    const bak = { t: raw.tiles[i], h: raw.height[i] };
    raw.tiles[i] = 7; raw.height[i] = 2;
    const e = { type: { move: 'slow', id: 'test', color: '#7a4a3a', zh: '兵', en: 'Soldier' }, kind: 'normal', speed: 8,
                x: x0 - 10, y: y0, home: { x: x0 + 5, y: y0 }, aggro: 0,
                hp: 9999, maxHp: 9999, state: 'return', atkCd: 0, skillCd: 0, dir: 's', range: 1.5, aspd: 1 };
    LG.Enemy.list.push(e);
    return { x0, y0, wx, bak };
  });
  await page.waitForTimeout(1800);
  const eX = await page.evaluate((hx) => {
    const e = LG.Enemy.list.find((x) => x.home && x.home.x === hx && x.kind === 'normal');
    if (!e) return null;
    const x = +e.x.toFixed(3);
    const idx = LG.Enemy.list.indexOf(e);
    if (idx >= 0) LG.Enemy.list.splice(idx, 1);
    return x;
  }, es.x0 + 5);
  out.enemyX = eX;
  // 从 x0-10 出发（旧逻辑无碰撞会一路走到 home=x0+5）：新逻辑应移动≥1格且被墙拦停在 wx 前
  out.enemyPass = eX !== null && eX < es.wx - 0.9 && eX > es.x0 - 9;
  await page.evaluate((s) => {
    const raw = LG.Terrain.raw();
    raw.tiles[s.y0 * LG.Terrain.SIZE + s.wx] = s.bak.t;
    raw.height[s.y0 * LG.Terrain.SIZE + s.wx] = s.bak.h;
  }, es);

  // ===== ③⑥ HUD 热区 =====
  out.hud = await page.evaluate(() => {
    const probe = (x, y) => LG.UI.hudHit({ x, y });
    const W = window.innerWidth;
    return { tracker: probe(140, 120), mode: probe(W - 30, 25), settings: probe(W - 30, 55), out: probe(640, 400) };
  });

  // ===== ⑥ ESC 开/关设置 =====
  await page.keyboard.press('Escape');
  await page.waitForSelector('.panel[data-page="settings"]', { timeout: 3000 });
  out.escOpen = true;
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.panel'), null, { timeout: 3000 });
  out.escClose = true;

  // ===== ③ 任务接取（此前 accept 无调用方=任务系统死路） =====
  await page.keyboard.press('l');
  await page.waitForSelector('.panel[data-page="quest"]', { timeout: 3000 });
  const accBtn = await page.$('[data-acc]');
  out.hasAccept = !!accBtn;
  if (accBtn) {
    await accBtn.click();
    await page.waitForTimeout(250);
    out.questActive = await page.evaluate(() => LG.Quest.active.length);
  }
  await page.keyboard.press('l'); // 重渲染后 dataset.page 必须仍在，L 才能关闭
  await page.waitForFunction(() => !document.querySelector('.panel'), null, { timeout: 3000 });
  out.questToggleClose = true;

  // ===== ⑤ 地图真实地形（大色块数量） =====
  await page.keyboard.press('m');
  await page.waitForSelector('#bigmap', { timeout: 3000 });
  out.map = await page.evaluate(() => {
    const cv = document.getElementById('bigmap');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, 480, 480).data;
    const cnt = {};
    for (let i = 0; i < d.length; i += 16) {
      const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4);
      cnt[k] = (cnt[k] || 0) + 1;
    }
    return { big: Object.keys(cnt).filter((k) => cnt[k] >= 300).length };
  });
  out.mapPass = out.map.big >= 8;
  await page.screenshot({ path: SHOT + 'a2-map.png' });
  await page.keyboard.press('m');
  await page.waitForFunction(() => !document.querySelector('.panel'), null, { timeout: 3000 });

  // ===== ③ 追踪条点击打开任务面板 =====
  await page.mouse.click(140, 120);
  await page.waitForSelector('.panel[data-page="quest"]', { timeout: 3000 });
  out.trackerClick = true;
  await page.keyboard.press('l');
  await page.waitForTimeout(300);

  // ===== 数值调整：敌人伤害=10% / 玩家攻击范围×2 =====
  out.balance = await page.evaluate(() => {
    const s = LG.Inv.calcStats();
    const P = LG.Player;
    const full = s.maxHp;
    P.hp = full; P.down = false; P.blockUntil = 0;
    if (P.stats) P.stats.dodge = 0;
    P.takeDamage(100); // 100×0.1=10，再扣 def×0.1（下限1点磨血）
    const expect = Math.max(1, Math.round(100 * (LG.Config.ENEMY_DMG_MULT || 0) - (s.def || 0) * 0.1));
    const took = Math.round(full - P.hp);
    P.hp = full;
    return { mult: LG.Config.ENEMY_DMG_MULT, rangeMult: LG.Config.PLAYER_RANGE_MULT,
             took, expect, range: +s.range.toFixed(3), dead: P.down };
  });
  out.balancePass = out.balance.mult === 0.1 && out.balance.rangeMult === 2 &&
    out.balance.took === out.balance.expect && !out.balance.dead &&
    Math.abs(out.balance.range - 2) < 0.01;

  // ===== P0：落点菱形（寻路 path 非空 -> render 绘制脉冲金菱形，无 pageerror 即通过） =====
  await page.evaluate(() => LG.Player.moveTo(LG.Player.x + 5, LG.Player.y + 3));
  await page.waitForTimeout(300);
  out.pathLen = await page.evaluate(() => LG.Player.path.length);
  out.pathPass = out.pathLen > 0;

  // ===== P0：右上小地图（热区扫描 + 点击转大地图） =====
  out.minimap = await page.evaluate(() => {
    const W = window.innerWidth;
    for (let y = 10; y < 280; y += 4)
      for (let x = W - 6; x > W - 320; x -= 4)
        if (LG.UI.hudHit({ x, y }) === 'minimap') return { x, y };
    return null;
  });
  out.minimapHit = !!out.minimap;
  if (out.minimap) {
    await page.mouse.click(out.minimap.x, out.minimap.y);
    out.minimapClick = await page.waitForSelector('.panel[data-page="map"]', { timeout: 3000 })
      .then(() => true).catch(() => false);
    if (out.minimapClick) {
      await page.keyboard.press('m');
      await page.waitForFunction(() => !document.querySelector('.panel'), null, { timeout: 3000 });
    }
  }

  // ===== P0：飘字分级（enemy_hit flags -> size/color；普通14 暴击18 三倍24） =====
  out.grade = await page.evaluate(() => {
    const E = LG.Combat.effects;
    const mk = () => ({ x: LG.Player.x, y: LG.Player.y - 3, hp: 999, maxHp: 999, kind: 'normal',
                        type: { id: 'probe', color: '#888' } });
    const one = (flags) => {
      E.length = 0;
      LG.U.bus.emit('enemy_hit', flags ? { e: mk(), n: 17, flags } : { e: mk(), n: 17 });
      const t = E.find((f) => f.type === 'text');
      const r = t ? { size: t.size, color: t.color } : null;
      E.length = 0;
      return r;
    };
    return { normal: one(), crit: one({ crit: true }), tri: one({ tri: true }) };
  });
  out.gradePass = !!out.grade.normal && out.grade.normal.size === 14 &&
    !!out.grade.crit && out.grade.crit.size === 18 && out.grade.crit.color === '#ffd777' &&
    !!out.grade.tri && out.grade.tri.size === 24 && out.grade.tri.color === '#ff7a3c';

  await page.screenshot({ path: SHOT + 'a3-game.png' });
  out.errors = out.errors.slice(0, 12);
  return out;
}
