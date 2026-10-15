/* t12.js —— 阶段二十五：节假日活动系统（8 节日 / 全套活动包 / 联机房主日期）
   ① 年表判定（_now 注入：农历 4 节查表 + 公历 4 节直判 + 窗口边界 + 无表年份回退 + 平日空）
   ② 数值接入（merged 精确乘数；dropFromEnemy 经验/银币 ×1.5 精确值、掉率边界 0.12×难度；
      openChest 同随机序列经验/银币精确值）
   ③ 限定武器前缀（活动期=「春节·」覆盖随机词、非活动期∈随机词池、实例结构不变）
   ④ 主菜单横幅（无活动无 #mm-event / 活动期含节名与三档加成 / 中英双语 / 零 emoji）+ 截图
   ⑤ 进世界问候 toast（春节快乐+经验+50%+掉率+30%）+ 主题粒子覆盖 + 截图
   ⑥ 联机同步（真实 lobby join→broadcast 拦包 {id,remain} → 客户端 'start' 分支 applyRemote
      跟随房主；旧版本缺字段忽略；房主无活动则本地也停用）+ 平日 greeting/banner 为空
   ⑦ 全程零报错
   运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t12.js' })
   注意：结尾必须是裸 }（带分号会 SyntaxError: Unexpected token ';'） */
async (page) => {
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [] };
  page.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable').catch(() => {});
  await cdp.send('Network.clearBrowserCache');
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { try { LG.U.LS.set('tut_done', true); } catch (e) {} });

  /* ===== ① 年表判定（2026 年 8 节 + 边界 + 回退） ===== */
  out.cal = await page.evaluate(() => {
    const H = LG.Holiday;
    const id = (s) => { H._now = new Date(s); const f = H.today(); return f ? f.id : null; };
    const r = {};
    r.spring = id('2026-02-17T12:00:00');           // 农历春节（表内）
    r.lantern = id('2026-03-03T12:00:00');           // 元宵 = 春节+14 天
    r.dragon = id('2026-06-19T12:00:00');
    r.midautumn = id('2026-09-25T12:00:00');
    r.newyear = id('2026-01-02T12:00:00');           // 公历直判
    r.national = id('2026-10-03T12:00:00');
    r.halloween = id('2026-10-31T12:00:00');
    r.christmas = id('2026-12-25T12:00:00');
    r.christmas25 = id('2025-12-24T12:00:00');       // 公历节日不依赖年表年份
    r.springLate = id('2026-02-23T23:30:00') === 'spring';   // dur7 半开窗口左含
    r.springEnd = id('2026-02-24T00:00:00') === null;        // 右边界不含
    r.newyearOut = id('2026-01-04T12:00:00') === null;
    r.nationalOut = id('2026-10-08T12:00:00') === null;
    r.halloweenOut = id('2026-11-02T12:00:00') === null;
    r.plain = id('2026-07-01T12:00:00') === null;            // 平日无活动
    try { r.y2036 = id('2036-02-17T12:00:00') === null; }    // 表外年份回退不报错
    catch (e) { r.y2036 = 'ERR:' + e.message; }
    H._now = new Date('2026-07-01T12:00:00');
    const m0 = H.merged();
    r.plainMerge = m0.exp === 1 && m0.silver === 1 && m0.drop === 1;
    r.plainList = H.activeList().length === 0;
    H._now = new Date('2026-02-17T12:00:00');
    const m1 = H.merged();
    r.springMerge = m1.exp === 1.5 && m1.silver === 1.5 && m1.drop === 1.3;
    r.springRemain = H.remaining() > 6 * 86400;              // 首日中午 → 剩余 >6 天
    H._now = null;
    r.pass = r.spring === 'spring' && r.lantern === 'lantern' && r.dragon === 'dragon'
      && r.midautumn === 'midautumn' && r.newyear === 'newyear' && r.national === 'national'
      && r.halloween === 'halloween' && r.christmas === 'christmas' && r.christmas25 === 'christmas'
      && r.springLate && r.springEnd && r.newyearOut && r.nationalOut && r.halloweenOut
      && r.plain && r.y2036 === true && r.plainMerge && r.plainList && r.springMerge && r.springRemain;
    return r;
  });

  /* ===== ② 数值接入（loot 单一出口，combat.enemy_dead 经掉落结构自动生效） ===== */
  out.num = await page.evaluate(() => {
    const H = LG.Holiday, C = LG.Config;
    const diff = (LG.Net && LG.Net.difficulty) || C.DIFFICULTY.default;
    const wlv = C.worldLevel();
    const se = C.silverExp(wlv, 'normal', diff);
    const orig = Math.random;
    const r = {};
    H._remote = undefined;
    // 春节（exp×1.5 silver×1.5 drop×1.3）：不掉物品时返回值 = 精确公式值
    H._now = new Date('2026-02-17T12:00:00');
    Math.random = () => 0.999999;
    const fest = LG.Loot.dropFromEnemy('normal', diff, wlv);
    Math.random = orig;
    r.silverOk = fest.silver === Math.round(se.silver * 1.5);
    r.expOk = fest.exp === Math.round(se.exp * 1.5);
    // 掉率边界：stub 恰等于平日阈值（0.12×难度）→ 平日 false / 节日 ×1.3 后 true
    const r0 = 0.12 * C.DIFFICULTY.drop(diff);
    H._now = new Date('2026-07-01T12:00:00');
    Math.random = () => r0;
    const plain = LG.Loot.dropFromEnemy('normal', diff, wlv);
    H._now = new Date('2026-02-17T12:00:00');
    Math.random = () => r0;
    const fest2 = LG.Loot.dropFromEnemy('normal', diff, wlv);
    Math.random = orig;
    r.dropEdge = plain.items.length === 0 && fest2.items.length === 1;
    // 平日掉落结构回归（silver/exp 与基准一致）
    H._now = new Date('2026-07-01T12:00:00');
    Math.random = () => 0.999999;
    const p0 = LG.Loot.dropFromEnemy('normal', diff, wlv);
    Math.random = orig;
    r.plainOk = p0.silver === se.silver && p0.exp === se.exp;
    // 宝箱同随机序列：银/经验为精确公式值（首随机 0.42 决定银币）
    const k = 1 + 0.42;
    const seq = [0.42, 0.17, 0.63, 0.88, 0.29, 0.55, 0.07, 0.91, 0.34, 0.72, 0.13, 0.61];
    const run = (fn) => {
      let i = 0;
      Math.random = () => seq[i++ % seq.length];
      try { return fn(); } finally { Math.random = orig; }
    };
    H._now = new Date('2026-07-01T12:00:00');
    const cp = run(() => LG.Loot.openChest(diff, wlv));
    H._now = new Date('2026-02-17T12:00:00');
    const cf = run(() => LG.Loot.openChest(diff, wlv));
    r.chestSilver = cp.silver === Math.round(se.silver * k)
      && cf.silver === Math.round(se.silver * k * 1.5);
    r.chestExp = cp.exp === Math.round(se.exp * 0.5)
      && cf.exp === Math.round(se.exp * 0.5 * 1.5);
    r.chestNoFestItems = cp.items.length >= 1; // 平日 1-2 件（结构不变）
    H._now = null;
    r.pass = r.silverOk && r.expOk && r.dropEdge && r.plainOk
      && r.chestSilver && r.chestExp && r.chestNoFestItems;
    return r;
  });

  /* ===== ③ 限定武器前缀 ===== */
  out.pre = await page.evaluate(() => {
    const H = LG.Holiday;
    const diff = (LG.Net && LG.Net.difficulty) || LG.Config.DIFFICULTY.default;
    const wlv = LG.Config.worldLevel();
    const r = {};
    H._remote = undefined;
    H._now = new Date('2026-02-17T12:00:00');
    const w = LG.Loot.rollWeapon(diff, wlv);
    r.fest = !!w.prefix && w.prefix.zh === '春节' && w.prefix.en === 'Spring Festival';
    r.struct = !!w.quality && !!w.stats && w.stats.dmg > 0 && Array.isArray(w.bonds);
    H._now = new Date('2026-07-01T12:00:00');
    const w2 = LG.Loot.rollWeapon(diff, wlv);
    r.plain = LG.Config.WEAPON_PREFIXES.some((p) => p.zh === w2.prefix.zh && p.en === w2.prefix.en);
    r.plainNotFest = w2.prefix.zh !== '春节';
    H._now = null;
    r.pass = r.fest && r.struct && r.plain && r.plainNotFest;
    return r;
  });

  /* ===== ④ 主菜单横幅（zh/en、零 emoji） ===== */
  out.banner = await page.evaluate(() => {
    const H = LG.Holiday;
    const emoji = (s) => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(s);
    const r = {};
    H._remote = undefined;
    H._now = new Date('2026-07-01T12:00:00');
    LG.Engine.openMenu();
    r.noBanner = !document.querySelector('#mm-event');
    H._now = new Date('2026-02-17T12:00:00');
    LG.Engine.openMenu();
    const el = document.querySelector('#mm-event');
    r.txt = el ? el.textContent : '';
    r.hasBanner = !!el;
    r.zh = r.txt.indexOf('春节') >= 0 && r.txt.indexOf('经验+50%') >= 0
      && r.txt.indexOf('银币+50%') >= 0 && r.txt.indexOf('掉率+30%') >= 0;
    r.noEmoji = !emoji(r.txt);
    LG.I18n.set('en');
    LG.Engine.openMenu();
    const el2 = document.querySelector('#mm-event');
    r.enTxt = el2 ? el2.textContent : '';
    r.en = /Spring Festival/.test(r.enTxt) && /EXP\+50%/.test(r.enTxt) && /Silver\+50%/.test(r.enTxt);
    r.enNoEmoji = !emoji(r.enTxt);
    LG.I18n.set('zh'); // 恢复中文（⑤ 问候断言依赖当前语言）
    LG.Engine.openMenu();
    r.pass = r.noBanner && r.hasBanner && r.zh && r.noEmoji && r.en && r.enNoEmoji;
    return r;
  });
  await page.screenshot({ path: S + 't12-banner.png' });

  /* ===== ⑤ 进世界问候 + 主题粒子（截图须在 toast 1800ms 生命周期内） ===== */
  await page.evaluate(() => {
    LG.Holiday._remote = undefined;
    LG.Holiday._now = new Date('2026-02-17T12:00:00'); // 春节当日：须在开局前注入
  });
  await page.$eval('#mm-start', (el) => el.click());
  // 两条开局路径：共享上下文可能有存档（直进世界）/ 无存档走角色创建（#cc-ok）
  await page.waitForFunction(
    () => (window.LG && LG.Engine.scene === 'game') || !!document.querySelector('#cc-ok'),
    null, { timeout: 15000 });
  if (await page.$('#cc-ok')) {
    await page.$eval('#cc-ok', (el) => el.click());
  }
  await page.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  out.greet = await page.evaluate(() => {
    const H = LG.Holiday;
    const ts = Array.from(document.querySelectorAll('.toast')).map((e) => e.textContent);
    const emoji = (s) => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(s);
    const pt = H.particleTheme();
    return {
      toasts: ts,
      hasGreet: ts.some((t) => t.indexOf('春节快乐') >= 0 && t.indexOf('经验+50%') >= 0
        && t.indexOf('掉率+30%') >= 0),
      noEmoji: ts.every((t) => !emoji(t)),
      ptOk: !!pt && pt.c === '255,110,95' && pt.shape === 'sq' && pt.vy > 0,
    };
  });
  await page.screenshot({ path: S + 't12-greet.png' });

  /* ===== ⑥ 联机同步：真实 lobby join→broadcast 拦包 + 客户端 start 分支接收 ===== */
  out.net = await page.evaluate(() => {
    const H = LG.Holiday;
    const r = {};
    // 平日：greeting/banner 为空
    H._remote = undefined;
    H._now = new Date('2026-07-01T12:00:00');
    r.quiet = H.greeting() === null && H.banner() === '';
    // 房主本地春节 → 走真实 lobby join 广播路径，拦截 {t:'start'} 包
    H._now = new Date('2026-02-17T12:00:00');
    const origB = LG.Net.broadcast;
    let sent = null;
    LG.Net.broadcast = (o) => { sent = o; };
    LG.Net.isHost = true;
    if (!document.getElementById('lobby-players')) LG.Lobby.show();
    LG.U.bus.emit('net_msg', { t: 'join', name: 'Tester', look: { gender: 'M' } });
    LG.Net.broadcast = origB;
    r.hostPkt = !!(sent && sent.t === 'start' && sent.holiday
      && sent.holiday.id === 'spring' && sent.holiday.remain > 5 * 86400);
    // 客户端本地 7 月无活动 → applyRemote 后跟随房主春节
    H._now = new Date('2026-07-01T12:00:00');
    H._remote = undefined;
    const before = H.activeList().length;
    const applied = H.applyRemote(sent ? sent.holiday : null);
    const after = H.activeList();
    r.clientFollow = before === 0 && applied && after.length === 1 && after[0].id === 'spring';
    r.remainOk = H.remaining() > 0;
    // 旧版本缺字段：忽略并保持现状（仍为春节）
    const kept = H.applyRemote(undefined);
    r.oldVer = kept === false && H.activeList().length === 1;
    // 房主无活动：即使本地正处春节也停用
    H.applyRemote({ id: null, remain: 0 });
    r.hostNone = H.activeList().length === 0;
    // 接收端真实链路：lobby 'start' 分支 → applyRemote → startGame（随后清场 charCreate 面板）
    H._remote = undefined;
    H._now = new Date('2026-07-01T12:00:00');
    LG.U.bus.emit('net_msg', sent);
    r.recvFollow = H.activeList().length === 1 && H.activeList()[0].id === 'spring';
    LG.UI.closePanel();
    // 复位
    H._remote = undefined;
    H._now = null;
    r.pass = r.quiet && r.hostPkt && r.clientFollow && r.remainOk && r.oldVer
      && r.hostNone && r.recvFollow;
    return r;
  });

  /* ===== ⑦ 汇总 ===== */
  out.all = out.cal.pass && out.num.pass && out.pre.pass && out.banner.pass
    && out.greet.hasGreet && out.greet.noEmoji && out.greet.ptOk
    && out.net.pass && out.errors.length === 0;
  return out;
}
