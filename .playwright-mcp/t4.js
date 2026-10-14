async (page) => {
  /* t4.js —— 自动保存与读取存档回归（阶段十五）
     覆盖：无档菜单 / 新游戏→角色创建 / 关键事件存档(levelup) / 生命周期存档(pagehide) /
           设置页手动读档 / 刷新后"继续游戏"跳过角色创建且状态一致 / "新游戏"分支重走创建并覆盖存档
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t4.js' })
     注：用独立全新上下文（存储隔离），元素交互用页面内 JS 派发（×1.1 陷阱见 README）。 */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [] };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable').catch(() => {});
  await cdp.send('Network.clearBrowserCache');
  const waitMenu = async () => {
    await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
    await p.waitForTimeout(900); // 菜单入场动画
  };
  const click = (sel) => p.$eval(sel, (el) => el.click());

  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.bringToFront();

  // ① 无档菜单：单一"开始游戏"，无 #mm-new
  await waitMenu();
  out.freshMenu = await p.evaluate(() => ({
    startText: document.getElementById('mm-start').textContent.trim(),
    hasNew: !!document.getElementById('mm-new'),
    hasSave: LG.Save.hasSave(1),
  }));

  // ② 新游戏 → 角色创建 → 进世界（tut 预设跳教程）
  await p.evaluate(() => { try { LG.U.LS.set('tut_done', true); } catch (e) {} });
  await click('#mm-start');
  await p.waitForSelector('#cc-ok', { timeout: 10000 });
  out.newGameCC = true;
  await click('#cc-ok');
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(400);

  // ③ 制造进度 → 触发"关键事件"自动存档（levelup → flush）
  out.before = await p.evaluate(() => {
    const P = LG.Player._raw;
    P.level = 3; P.exp = 55; P.expTo = LG.Player.expNeed(3);
    LG.Inv.silver = 777;
    P.x = 1503.2; P.y = 1504.7; // 营地清平区（半径8内）
    if (LG.Engine._chests[0]) LG.Engine._chests[0].opened = true;
    LG.U.bus.emit('levelup', 3); // 关键事件钩子（save.autosave 订阅）
    const d = LG.Save.raw(1);
    return { ok: !!d && d.player.level === 3 && d.inv.silver === 777 && d.player.x === 1503.2,
             chestSaved: !!(d && d.chests && d.chests[0] && d.chests[0].opened) };
  });
  out.eventSave = out.before.ok === true && out.before.chestSaved === true;

  // ④ 生命周期存档：改值 → 派发 pagehide（手机切后台/关页同路径）→ 档更新
  await p.evaluate(() => { LG.Inv.silver = 888; window.dispatchEvent(new Event('pagehide')); });
  await p.waitForTimeout(150);
  out.pagehideSilver = await p.evaluate(() => { const d = LG.Save.raw(1); return d && d.inv.silver; });

  // ⑤ 设置页手动读档：改值999 → #s-load → 还原为档内888，面板关闭
  await p.evaluate(() => { LG.Inv.silver = 999; LG.UI.renderSettings(); });
  await p.waitForSelector('#s-load', { timeout: 5000 });
  await click('#s-load');
  await p.waitForTimeout(350);
  out.manualLoad = await p.evaluate(() => ({ silver: LG.Inv.silver, panelClosed: !document.getElementById('s-load') }));

  // ⑥ 刷新 → 有档菜单："继续游戏" + #mm-new
  await p.reload({ waitUntil: 'load' });
  await waitMenu();
  out.continueMenu = await p.evaluate(() => ({
    startText: document.getElementById('mm-start').textContent.trim(),
    hasNew: !!document.getElementById('mm-new'),
    hasSave: LG.Save.hasSave(1),
  }));

  // ⑦ 继续游戏 → 跳过角色创建直接进世界，状态与档一致
  await click('#mm-start');
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(500);
  out.noCC = !(await p.$('#cc-ok'));
  out.restored = await p.evaluate(() => {
    const P = LG.Player._raw;
    return {
      level: P.level, exp: P.exp, silver: LG.Inv.silver, expTo: P.expTo,
      posMatch: Math.abs(P.x - 1503.2) < 0.6 && Math.abs(P.y - 1504.7) < 0.6,
      chest0: !!(LG.Engine._chests[0] && LG.Engine._chests[0].opened),
      hasEquip: Object.keys(LG.Inv.equip).some((k) => LG.Inv.equip[k]),
      name: P.name,
    };
  });
  await p.screenshot({ path: S + 't4-continue.png' });

  // ⑧ 新游戏分支：刷新 → #mm-new → 角色创建重现 → 全新角色并覆盖存档
  await p.reload({ waitUntil: 'load' });
  await waitMenu();
  await click('#mm-new');
  await p.waitForSelector('#cc-ok', { timeout: 10000 });
  out.newGamePath = true;
  await click('#cc-ok');
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(400);
  out.afterNew = await p.evaluate(() => {
    const d = LG.Save.raw(1); // 进世界即自动存档 → 槽1应已被新角色覆盖
    return { level: LG.Player.level, silver: LG.Inv.silver, slotLevel: d && d.player.level };
  });

  /* ================= 汇总断言 ================= */
  out.pass = {
    freshMenu: out.freshMenu.startText === '开始游戏' && !out.freshMenu.hasNew && out.freshMenu.hasSave === false,
    newGameCC: out.newGameCC === true,
    eventSave: out.eventSave === true,
    pagehide: out.pagehideSilver === 888,
    manualLoad: out.manualLoad.silver === 888 && out.manualLoad.panelClosed === true,
    continueMenu: out.continueMenu.startText === '继续游戏' && out.continueMenu.hasNew === true && out.continueMenu.hasSave === true,
    restore: out.noCC === true && out.restored.level === 3 && out.restored.exp === 55
             && out.restored.silver === 888 && out.restored.posMatch === true
             && out.restored.expTo === 220 && out.restored.chest0 === true
             && out.restored.hasEquip === true && out.restored.name === '冒险者',
    newPath: out.newGamePath === true && out.afterNew.level === 1 && out.afterNew.silver === 0
             && out.afterNew.slotLevel === 1,
    noErrors: out.errors.length === 0,
  };
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  await ctx.close();
  return out;
}
