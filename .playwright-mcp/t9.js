async (page) => {
  /* t9.js —— 阶段二十三（清单大版本）专项：等级1-99/世界最高等级/敌人10%推导/爆率/装备数值/小数3位/随机名/射程×1.5/存档迁移
     ① 随机角色名（清单114）：角色创建页姓名自动填随机名（在词池内）、点「随机」按钮可重掷
     ② 等级 1-99（清单43）：MAX_LEVEL=99、expNeed 公式、连升封顶、满级溢出转银币
     ③ 世界最高等级消费链（清单111/115）：手动档 worldLevel()、掉落物品等级随世界(70%-100%)、
        敌人奖励随敌等级、爆率世界加成（world99 的 R+ 出货率显著高于 world1）
     ④ 敌人 10% 推导 + 区域专属兵种（清单66/109）：普通 hp=玩家10%×难度、精英 250-400%、
        BOSS 500-1000%；迷宫只出术士系；营地不刷怪
     ⑤ 爆率表结构（清单27-30/36-41）：武器 50/25/15/10、装备 40/25/15/10/5/5、D 档防御 5%-15%
     ⑥ 装备数值非零（反馈"装备数值有0"）：四词条全给且 def 为百分点(5-50)；defPts 归一；
        装备伤害词条=总伤%（不再平加攻击）
     ⑦ 小数点保留 3 位（清单110）：属性面板攻速/范围 3 位；详情卡 +0.250 / 2.400
     ⑧ 武器射程×1.5 + 空手基准 2（清单75/104）：铁刃2.4/骑剑2.55/镰3.3/弓10.5/弩12/杖9；空手=2
     ⑨ 存档迁移：旧档分数制防御(0.15)→15 百分点、D 档 0→5
     ⑩ 全程零报错
     运行：browser_run_code_unsafe({ filename: '.playwright-mcp/t9.js' }) */
  const S = 'C:/Users/L1896/Desktop/legend/.playwright-mcp/';
  const out = { errors: [], pass: {} };
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.bringToFront();
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  // 清档重载 → #mm-start 直开单人（同 t1/t8 流程）
  await p.evaluate(() => {
    Object.keys(localStorage).forEach((k) => { if (k.indexOf('legend_save_') === 0) localStorage.removeItem(k); });
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.LG && document.querySelector('#mm-start')), null, { timeout: 20000 });
  await p.waitForTimeout(900);
  await p.$eval('#mm-start', (el) => el.click());
  await p.waitForSelector('#cc-ok', { timeout: 10000 });

  /* ===== ① 随机角色名（清单114：打开即随机名 + 「随机」按钮重掷） ===== */
  out.rand = await p.evaluate(() => {
    const pool = LG.Config.CHAR_NAMES[LG.I18n.lang === 'zh' ? 'zh' : 'en'];
    const inp = document.querySelector('#cc-name'), btn = document.querySelector('#cc-rand');
    const v0 = inp.value;
    const filled = v0.length > 0 && pool.indexOf(v0) >= 0;
    let changed = false;
    for (let i = 0; i < 5; i++) { btn.click(); if (inp.value !== v0) changed = true; }
    return { filled, changed, sample: v0 };
  });
  out.pass.rand = out.rand.filled && out.rand.changed;
  await p.screenshot({ path: S + 't9-cc.png' });

  await p.$eval('#cc-ok', (el) => el.click());
  const skip = await p.$('.dialog .opts .btn');
  if (skip) await skip.click().catch(() => {});
  await p.waitForFunction(() => window.LG && LG.Engine.scene === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(500);

  /* ===== ② 等级 1-99 ===== */
  out.lv99 = await p.evaluate(() => {
    const M = LG.Config.MAX_LEVEL;
    const f = LG.Player.expNeed;
    const formulaOk = f(1) === 100 && f(50) === 100 + 49 * 60 && f(99) === 100 + 98 * 60;
    // 连升：一次性喂到 99 级（ΣexpNeed(1..98)），封顶后溢出转银币（×0.2）
    let total = 0; for (let lv = 1; lv < 99; lv++) total += f(lv);
    const silver0 = LG.Inv.silver;
    LG.Player.gainExp(total); // 恰好升到 99
    const at99 = LG.Player.level === 99 && LG.Player.exp === 0 && LG.Player.expTo === 0;
    LG.Player.gainExp(100); // 满级溢出 → 银币 +20
    const overflow = LG.Inv.silver === silver0 + 20;
    // 复位等级 1（经 _raw 直改，下帧 update 重算属性）
    const P = LG.Player._raw;
    P.level = 1; P.exp = 0; P.expTo = LG.Player.expNeed(1); P.hp = LG.Inv.calcStats().maxHp;
    return { M, formulaOk, at99, overflow };
  });
  out.pass.lv99 = out.lv99.M === 99 && out.lv99.formulaOk && out.lv99.at99 && out.lv99.overflow;

  /* ===== ③ 世界最高等级消费链 ===== */
  out.wlv = await p.evaluate(() => {
    LG.Config.WORLD_LEVEL.auto = false; LG.Config.WORLD_LEVEL.val = 30;
    const wl = LG.Config.worldLevel();
    // 掉落物品等级随世界（约 70%-100% 浮动）：1 + round(29×[0.7,1]) → 21..30
    const lvOk = Array.from({ length: 8 }, () => LG.Loot.rollWeapon(0.9, LG.Config.worldLevel()).lv)
      .every((lv) => lv >= 21 && lv <= 30);
    // 奖励随敌等级：世界99 的 normal 银币应远高于世界1
    const hi = LG.Loot.dropFromEnemy('normal', LG.Config.DIFFICULTY.default, 99);
    const lo = LG.Loot.dropFromEnemy('normal', LG.Config.DIFFICULTY.default, 1);
    const rewardOk = hi.silver > lo.silver * 25;
    // 爆率世界加成（清单115）：world99 的非 N 率显著高于 world1（各 2500 抽）
    const sample = (wl2) => {
      LG.Config.WORLD_LEVEL.val = wl2;
      let r = 0;
      for (let i = 0; i < 2500; i++) {
        if (LG.Config.dropQuality(LG.Config.QUALITY_W, LG.Config.DIFFICULTY.default).id !== 'N') r++;
      }
      return r / 2500;
    };
    const s1 = sample(1), s99 = sample(99);
    LG.Config.WORLD_LEVEL.auto = true; LG.Config.WORLD_LEVEL.val = 1; // 还原自动
    return { wl, lvOk, rewardOk, s1: +s1.toFixed(3), s99: +s99.toFixed(3),
             boost: s99 - s1 > 0.08, autoBack: LG.Config.worldLevel() === LG.Player.level };
  });
  out.pass.wlv = out.wlv.wl === 30 && out.wlv.lvOk && out.wlv.rewardOk
    && out.wlv.boost && out.wlv.autoBack;

  /* ===== ④ 敌人 10% 推导 + 区域专属兵种 ===== */
  out.enemy = await p.evaluate(() => {
    const P = LG.Player.stats || LG.Inv.calcStats();
    const diff = LG.Config.DIFFICULTY.default, scale = LG.Config.DIFFICULTY.scale(diff);
    const type = LG.Config.ENEMY_TYPES.find((t) => !t.elite);
    const st = LG.Config.enemyStat(type, diff, 'normal', P);
    const expHp = Math.max(1, Math.round(P.maxHp * 0.1 * scale));
    const expDmg = Math.max(1, Math.round(P.dmg * scale)); // 入口前值；takeDamage ×0.1 → 玩家10%
    const hpOk = st.hp === expHp && st.dmg === expDmg;
    const elite = [], boss = [];
    for (let i = 0; i < 40; i++) elite.push(LG.Config.enemyStat(type, diff, 'elite', P).hp);
    for (let i = 0; i < 40; i++) boss.push(LG.Config.enemyStat(type, diff, 'boss', P).hp);
    const eOk = elite.every((h) => h >= expHp * 2.5 - 2 && h <= expHp * 4 + 2);
    const bOk = boss.every((h) => h >= expHp * 5 - 2 && h <= expHp * 10 + 2);
    // 区域专属兵种池（清单109）：迷宫只出术士系（含战争法师精英）；营地不刷怪
    LG.Enemy.list.length = 0;
    const maze = LG.Config.REGIONS.find((r) => r.id === 'maze');
    LG.Enemy.spawnRegion(maze);
    const poolOk = LG.Enemy.list.length > 0 && LG.Enemy.list.every((e) => maze.etypes.indexOf(e.type.id) >= 0);
    const kindOk = LG.Enemy.list.every((e) => e.kind === (e.type.elite ? 'elite' : 'normal'));
    const n0 = LG.Enemy.list.length;
    LG.Enemy.spawnRegion(LG.Config.REGIONS.find((r) => r.id === 'camp'));
    const campOk = LG.Enemy.list.length === n0;
    LG.Enemy.list.length = 0; // 清场
    return { hpOk, eOk, bOk, poolOk, kindOk, campOk, hp: st.hp, expHp };
  });
  out.pass.enemy = out.enemy.hpOk && out.enemy.eOk && out.enemy.bOk
    && out.enemy.poolOk && out.enemy.kindOk && out.enemy.campOk;

  /* ===== ⑤ 爆率表结构 ===== */
  out.rate = await p.evaluate(() => {
    const W = LG.Config.QUALITY_W.map((q) => q.p), A = LG.Config.QUALITY_A.map((q) => q.p);
    const wOk = Math.abs(W[0] - 0.5) < 1e-9 && Math.abs(W[1] - 0.25) < 1e-9
      && Math.abs(W[2] - 0.15) < 1e-9 && Math.abs(W[3] - 0.1) < 1e-9;
    const aOk = Math.abs(A[0] - 0.4) < 1e-9 && Math.abs(A[1] - 0.25) < 1e-9
      && Math.abs(A[2] - 0.15) < 1e-9 && Math.abs(A[3] - 0.1) < 1e-9
      && Math.abs(A[4] - 0.05) < 1e-9 && Math.abs(A[5] - 0.05) < 1e-9;
    const d = LG.Config.QUALITY_A[0];
    const dOk = d.id === 'D' && d.def[0] === 0.05 && d.def[1] === 0.15;
    return { wOk, aOk, dOk };
  });
  out.pass.rate = out.rate.wOk && out.rate.aOk && out.rate.dOk;

  /* ===== ⑥ 装备数值非零 + defPts + 伤害词条=总伤% ===== */
  out.armor = await p.evaluate(() => {
    let nonZero = true, defRangeOk = true;
    for (let i = 0; i < 80; i++) {
      const s = LG.Loot.rollArmor(LG.Config.DIFFICULTY.default, 1).stats;
      if (!(s.spd > 0 && s.dmg > 0 && s.dodge > 0)) nonZero = false;
      if (!(s.def >= 5 && s.def <= 70)) defRangeOk = false; // 5-50 × 槽位侧重≤1.25
    }
    const ptsOk = LG.Inv.defPts(0.15) === 15 && LG.Inv.defPts(0.35) === 35
      && LG.Inv.defPts(25) === 25 && LG.Inv.defPts(0) === 0;
    // 伤害词条=总伤百分比（×1.2）：dmgMul 精确 ×1.2，最终攻击=round(原攻击×1.2)（20→24）
    const prev = LG.Inv.equip.chest;
    LG.Inv.equip.chest = null;
    const base = LG.Inv.calcStats();
    LG.Inv.equip.chest = { slot: 'armor', armorSlot: 'chest', quality: 'A', lv: 1, bonds: [],
                           stats: { def: 10, spd: 0.1, dmg: 0.2, dodge: 0.05 } };
    const s2 = LG.Inv.calcStats();
    const mulOk = Math.abs(s2.dmgMul - base.dmgMul * 1.2) < 1e-6
      && Math.abs(s2.dmg - base.dmg * 1.2) <= 1;
    LG.Inv.equip.chest = prev;
    return { nonZero, defRangeOk, ptsOk, mulOk };
  });
  out.pass.armor = out.armor.nonZero && out.armor.defRangeOk && out.armor.ptsOk && out.armor.mulOk;

  /* ===== ⑦ 小数点保留 3 位 ===== */
  out.dec3 = await p.evaluate(() => {
    const s = LG.Inv.calcStats();
    LG.UI.togglePage('char', LG.UI.renderStats);
    const txt = (document.querySelector('.panel') || {}).textContent || '';
    const charOk = txt.indexOf(s.aspd.toFixed(3)) >= 0 && txt.indexOf(s.range.toFixed(3)) >= 0
      && /\d+\.\d{3}/.test(txt);
    document.querySelectorAll('.panel').forEach((x) => x.remove());
    // 详情卡：人造带攻速/射程武器 → +0.250 / 2.400（新角背包可能为空——初始武器在装备槽 → 先补一件）
    if (!LG.Inv.bag.some((x) => x && x.slot === 'weapon')) LG.Inv.add(LG.Loot.rollWeapon(LG.Config.DIFFICULTY.default, 1));
    const wi = LG.Inv.bag.findIndex((x) => x && x.slot === 'weapon');
    const it = wi >= 0 ? LG.Inv.bag[wi] : null;
    let cardOk = false;
    if (it) {
      it.stats = { dmg: 10, aspd: 0.25, range: 2.4, crit: 0 };
      LG.UI.togglePage('bag', LG.UI.renderBag);
      const el = document.querySelector('[data-bag="' + wi + '"]');
      if (el) el.click();
      const t = (document.getElementById('item-info') || {}).textContent || '';
      cardOk = t.indexOf('+0.250') >= 0 && t.indexOf('2.400') >= 0 && t.indexOf('+0%') < 0;
    }
    return { charOk, cardOk };
  });
  out.pass.dec3 = out.dec3.charOk && out.dec3.cardOk;

  /* ===== ⑧ 武器射程 ×1.5 + 空手基准 2 ===== */
  out.range = await p.evaluate(() => {
    const W = {};
    LG.Config.WEAPONS.forEach((w) => { W[w.id] = w.range; });
    const tableOk = W.iron_sword === 2.4 && W.knight_sword === 2.55 && W.scythe === 3.3
      && W.bow === 10.5 && W.crossbow === 12 && W.staff === 9 && W.shield === 0;
    const prev = LG.Inv.equip.weapon;
    LG.Inv.equip.weapon = null;
    const unarmed = LG.Inv.calcStats().range;
    LG.Inv.equip.weapon = prev;
    return { tableOk, unarmed, ok: tableOk && unarmed === 2 };
  });
  out.pass.range = out.range.ok;
  await p.evaluate(() => document.querySelectorAll('.panel').forEach((x) => x.remove())); // 清场

  /* ===== ⑨ 存档迁移：旧分数防御 → 百分点；D 档 0 → 5 ===== */
  out.migrate = await p.evaluate(() => {
    const a1 = LG.Loot.rollArmor(LG.Config.DIFFICULTY.default, 1), a1id = a1._id;
    const a2 = LG.Loot.rollArmor(LG.Config.DIFFICULTY.default, 1), a2id = a2._id;
    LG.Inv.add(a1); LG.Inv.add(a2);
    LG.Save.save(9);
    const d = LG.U.LS.get('legend_save_9');
    (d.inv.bag || []).forEach((x) => {
      if (!x || !x.stats) return;
      if (x._id === a1id) x.stats = { def: 0.15, spd: 0, dmg: 0, dodge: 0 }; // 旧 C 档分数防御
      if (x._id === a2id) x.stats = { def: 0, spd: 0, dmg: 0, dodge: 0 };    // 旧 D 档"无"
    });
    LG.U.LS.set('legend_save_9', d);
    LG.Save.load(9);
    const i1 = LG.Inv.bag.find((x) => x && x._id === a1id);
    const i2 = LG.Inv.bag.find((x) => x && x._id === a2id);
    return { ok: !!i1 && !!i2 && i1.stats.def === 15 && i2.stats.def === 5,
             d1: i1 && i1.stats.def, d2: i2 && i2.stats.def };
  });
  out.pass.migrate = out.migrate.ok;

  /* ===== ⑩ 零报错 ===== */
  out.pass.noErrors = out.errors.length === 0;
  out.allPass = Object.values(out.pass).every(Boolean);
  out.errors = out.errors.slice(0, 12);
  await ctx.close();
  return out;
}
