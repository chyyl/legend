/* ============================================================================
   js/data/holiday.js —— 节假日活动系统（阶段二十五）
   ----------------------------------------------------------------------------
   职责：离线判定 8 个中外主流节日（公历直判 + 农历 2026-2035 年表内置查表），
         作为全套活动包的唯一数据源：
           ① 数值加成（经验/银币/爆率）—— merged() 单一出口，loot.js 接入
           ② 限定武器前缀（「春节·铁刃」式，只加名不改数值平衡）
           ③ 主题粒子（8 节日不同色形，活动期覆盖区域生态粒子）
           ④ 主菜单节日横幅 + 进世界问候（中英双语，禁用 emoji）
           ⑤ 联机同步（房主日期为准：开局广播 {id,remain}，客户端跟随）

   对外接口（window.LG.Holiday）：
     .today(now?)        当日节日 {id, name:{zh,en}, start, end, bonus:{exp,silver,drop}}
                          或 null —— 纯日历判定（不受联机覆盖影响）；now 可注入（Date/ms）
     .activeList(now?)   当前生效节日数组（联机覆盖优先：房主日期 > 本地日历）
     .merged(now?)       合并加成 {exp, silver, drop}（乘法叠加；无活动时全 1）
                          —— 数值接入唯一出口（loot.dropFromEnemy/openChest 调用）
     .prefix(weapon)     活动期为武器写入限定前缀 {zh,en}（覆盖随机词），返回 weapon
     .remaining(now?)    主活动距结束秒数（无活动 0）
     .greeting(now?)     进世界问候文本（按 LG.I18n.lang 取 zh/en；无活动 null）
     .banner(now?)       主菜单横幅纯文本（无活动 ''）
     .particleTheme()    主题粒子 {c,vx,vy,a,sz,shape} 或 null（活动期覆盖区域生态）
     .syncPacket()       联机同步包 {id, remain}（房主广播用）
     .applyRemote(pkt)   应用房主包：undefined/null=旧版本缺字段保持本地；
                          {id,remain}=覆盖生效；{id:null}=房主无活动（本地也停用）
     ._now               测试注入时刻（Date/ms/null=系统时钟）
     ._remote            联机覆盖 {id,endMs} | {id:null} | undefined（undefined=无覆盖）

   实现要点：
     - 农历节日查 LUNAR 年表得公历 [月,日]；无表年份（<2026 / >2035）回退不报错
     - 活动窗口 = 节日起 [00:00, +dur 天) 按本地时区比较，无跨年窗口
     - 文案内联 {zh,en} 双语（同 Config.WEAPON_PREFIXES 惯例），禁用 emoji
     - 依赖：data/i18n（仅运行时读 lang）。被 loot/lobby/engine 运行时调用，无初始化步骤。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const DAY = 86400000; // 一天毫秒

  /* 农历节日 2026-2035 公历日期表 [月, 日]（春节/元宵/端午/中秋）——
     离线查表免内置万年历算法；表外年份按“无活动”回退，不抛错 */
  const LUNAR = {
    2026: { spring: [2, 17], lantern: [3, 3],  dragon: [6, 19], midautumn: [9, 25] },
    2027: { spring: [2, 6],  lantern: [2, 20], dragon: [6, 9],  midautumn: [9, 15] },
    2028: { spring: [1, 26], lantern: [2, 9],  dragon: [5, 28], midautumn: [10, 3] },
    2029: { spring: [2, 13], lantern: [2, 27], dragon: [6, 16], midautumn: [9, 21] },
    2030: { spring: [2, 3],  lantern: [2, 17], dragon: [6, 5],  midautumn: [9, 10] },
    2031: { spring: [1, 23], lantern: [2, 6],  dragon: [5, 25], midautumn: [9, 30] },
    2032: { spring: [2, 11], lantern: [2, 25], dragon: [6, 12], midautumn: [9, 18] },
    2033: { spring: [1, 31], lantern: [2, 14], dragon: [6, 2],  midautumn: [9, 7]  },
    2034: { spring: [2, 19], lantern: [3, 5],  dragon: [6, 21], midautumn: [9, 26] },
    2035: { spring: [2, 8],  lantern: [2, 22], dragon: [6, 10], midautumn: [9, 15] },
  };

  /* 节日表：m/d = 公历（当年直判）；lunar = 上表键（按年查表）；
     dur = 活动天数（首日起算、含当天）；bonus = 活动加成乘数
     （exp/silver 为乘法倍数，drop 为掉率概率倍数） */
  const FESTIVALS = [
    { id: 'newyear',   m: 1,  d: 1,  dur: 3, bonus: { exp: 1.3, silver: 1.3, drop: 1.2 } },
    { id: 'spring',    lunar: 'spring',    dur: 7, bonus: { exp: 1.5, silver: 1.5, drop: 1.3 } },
    { id: 'lantern',   lunar: 'lantern',   dur: 1, bonus: { exp: 1.3, silver: 1.4, drop: 1.2 } },
    { id: 'dragon',    lunar: 'dragon',    dur: 3, bonus: { exp: 1.3, silver: 1.2, drop: 1.3 } },
    { id: 'midautumn', lunar: 'midautumn', dur: 3, bonus: { exp: 1.4, silver: 1.3, drop: 1.2 } },
    { id: 'national',  m: 10, d: 1,  dur: 7, bonus: { exp: 1.5, silver: 1.4, drop: 1.3 } },
    { id: 'halloween', m: 10, d: 31, dur: 2, bonus: { exp: 1.3, silver: 1.3, drop: 1.5 } },
    { id: 'christmas', m: 12, d: 24, dur: 2, bonus: { exp: 1.4, silver: 1.5, drop: 1.4 } },
  ];

  /* 节日名（限定前缀/横幅/问候共用）：{zh,en} 内联双语，禁用 emoji */
  const TEXT = {
    newyear:   { zh: '元旦',   en: 'New Year' },
    spring:    { zh: '春节',   en: 'Spring Festival' },
    lantern:   { zh: '元宵',   en: 'Lantern Festival' },
    dragon:    { zh: '端午',   en: 'Dragon Boat' },
    midautumn: { zh: '中秋',   en: 'Mid-Autumn Festival' },
    national:  { zh: '国庆',   en: 'National Day' },
    halloween: { zh: '万圣节', en: 'Halloween' },
    christmas: { zh: '圣诞',   en: 'Christmas' },
  };

  /* 主题粒子（engine.updateParticles 活动期覆盖区域生态；sq=方块 confetti / dot=圆光点） */
  const PARTICLE = {
    newyear:   { c: '255,214,110', vx: -4,  vy: -18, a: 0.55, sz: 2.4, shape: 'sq'  }, // 金火花上升
    spring:    { c: '255,110,95',  vx: -8,  vy: 26,  a: 0.55, sz: 2.4, shape: 'sq'  }, // 红金纸屑飘落
    lantern:   { c: '255,186,92',  vx: -4,  vy: -14, a: 0.60, sz: 2.2, shape: 'dot' }, // 暖灯笼光点上浮
    dragon:    { c: '140,215,140', vx: -10, vy: 24,  a: 0.50, sz: 2.2, shape: 'sq'  }, // 青箬叶飘落
    midautumn: { c: '245,236,196', vx: -5,  vy: -8,  a: 0.50, sz: 2.4, shape: 'dot' }, // 月华光点
    national:  { c: '255,140,80',  vx: -6,  vy: -20, a: 0.55, sz: 2.4, shape: 'sq'  }, // 红金焰火上升
    halloween: { c: '255,146,52',  vx: -7,  vy: -16, a: 0.55, sz: 2.2, shape: 'sq'  }, // 南瓜橙焰上升
    christmas: { c: '240,248,255', vx: -14, vy: 32,  a: 0.70, sz: 2.6, shape: 'sq'  }, // 白雪飘落
  };

  function byId(id) {
    return FESTIVALS.find((f) => f.id === id) || null;
  }

  /* 当前时刻（ms）：显式 now 参数 > 测试注入 _now > 系统时钟 */
  function at(now) {
    if (now !== undefined && now !== null) return now instanceof Date ? now.getTime() : +now;
    const inj = LG.Holiday && LG.Holiday._now;
    if (inj) return inj instanceof Date ? inj.getTime() : +inj;
    return Date.now();
  }

  /* 节日起点（当地 00:00 的 ms）：公历按当年 m/d；农历查 LUNAR；
     表外年份返回 0（视为不活动，回退不报错） */
  function startOf(f, t) {
    const y = new Date(t).getFullYear();
    let m, d;
    if (f.lunar) {
      const row = LUNAR[y];
      if (!row || !row[f.lunar]) return 0;
      m = row[f.lunar][0];
      d = row[f.lunar][1];
    } else {
      m = f.m;
      d = f.d;
    }
    return new Date(y, m - 1, d).getTime();
  }

  /* 是否处于活动窗口 [start, start+dur 天)（半开区间：末日 24:00 停用） */
  function inWindow(f, t) {
    const s = startOf(f, t);
    return s !== 0 && t >= s && t < s + f.dur * DAY;
  }

  /* 装配对外节日对象（每次生成新对象，避免调用方改动共享数据） */
  function decorate(f, start, end) {
    return { id: f.id, name: TEXT[f.id], start, end, bonus: f.bonus };
  }

  /* 当日节日（纯日历：不受联机覆盖影响；测试可注入 now/_now） */
  function today(now) {
    const t = at(now);
    for (let i = 0; i < FESTIVALS.length; i++) {
      const f = FESTIVALS[i];
      if (inWindow(f, t)) {
        const s = startOf(f, t);
        return decorate(f, s, s + f.dur * DAY);
      }
    }
    return null;
  }

  /* 当前生效列表：联机覆盖（房主日期）优先；无覆盖走本地日历窗口 */
  function activeList(now) {
    const t = at(now);
    const rm = LG.Holiday && LG.Holiday._remote;
    if (rm !== undefined && rm !== null) {
      // 房主日期为准：remain 到期自动停用（endMs 在 applyRemote 时固化）
      if (!rm.id || t >= rm.endMs) return [];
      const f = byId(rm.id);
      return f ? [decorate(f, rm.endMs - f.dur * DAY, rm.endMs)] : [];
    }
    const out = [];
    for (let i = 0; i < FESTIVALS.length; i++) {
      const f = FESTIVALS[i];
      if (inWindow(f, t)) {
        const s = startOf(f, t);
        out.push(decorate(f, s, s + f.dur * DAY));
      }
    }
    return out;
  }

  /* 合并加成（乘法叠加；窗口互不重叠时即单活动值）——数值接入唯一出口 */
  function merged(now) {
    const out = { exp: 1, silver: 1, drop: 1 };
    const list = activeList(now);
    for (let i = 0; i < list.length; i++) {
      out.exp *= list[i].bonus.exp;
      out.silver *= list[i].bonus.silver;
      out.drop *= list[i].bonus.drop;
    }
    return out;
  }

  /* 限定武器前缀：活动期覆盖随机词（ui.js 渲染「前缀·基础名」直接可读），
     只加名不改数值平衡；非活动期原样返回 */
  function prefix(w) {
    const list = activeList();
    if (list.length) w.prefix = list[0].name;
    return w;
  }

  /* 主活动距结束秒数（联机包 remain 用；无活动 0） */
  function remaining(now) {
    const t = at(now);
    const list = activeList(now);
    if (!list.length) return 0;
    return Math.max(0, Math.round((list[0].end - t) / 1000));
  }

  /* 加成文案行（整百分比；zh 经验/银币/掉率 · en EXP/Silver/Drop） */
  function bonusLine(b) {
    const e = Math.round((b.exp - 1) * 100);
    const s = Math.round((b.silver - 1) * 100);
    const d = Math.round((b.drop - 1) * 100);
    return LG.I18n.lang === 'zh'
      ? '经验+' + e + '% · 银币+' + s + '% · 掉率+' + d + '%'
      : 'EXP+' + e + '% · Silver+' + s + '% · Drop+' + d + '%';
  }

  /* 进世界问候（engine.bootWorld 调用；无活动 null） */
  function greeting(now) {
    const list = activeList(now);
    if (!list.length) return null;
    const name = LG.I18n.lang === 'zh' ? list[0].name.zh : list[0].name.en;
    const line = bonusLine(merged(now));
    return LG.I18n.lang === 'zh'
      ? name + '快乐！庆典加成生效：' + line
      : 'Happy ' + name + '! Bonuses active: ' + line;
  }

  /* 主菜单横幅文本（engine.showMenu 注入 #mm-event；无活动 ''） */
  function banner(now) {
    const list = activeList(now);
    if (!list.length) return '';
    const name = LG.I18n.lang === 'zh' ? list[0].name.zh : list[0].name.en;
    return name + ' · ' + bonusLine(merged(now));
  }

  /* 主题粒子（活动期覆盖区域生态主题；engine.updateParticles 每帧取） */
  function particleTheme() {
    const list = activeList();
    return list.length ? PARTICLE[list[0].id] : null;
  }

  /* 联机同步包（房主在 {t:'start'} 中广播） */
  function syncPacket() {
    const list = activeList();
    return list.length ? { id: list[0].id, remain: remaining() } : { id: null, remain: 0 };
  }

  /* 客户端应用房主包：undefined/null = 旧版本缺字段，保持本地判定 */
  function applyRemote(p) {
    if (p === undefined || p === null) return false;
    const f = p.id ? byId(p.id) : null;
    LG.Holiday._remote = f && p.remain > 0
      ? { id: f.id, endMs: Date.now() + p.remain * 1000 }
      : { id: null }; // 房主无此节/已过期：即使本地正处活动期也停用
    return true;
  }

  LG.Holiday = {
    today, activeList, merged, prefix, remaining,
    greeting, banner, particleTheme, syncPacket, applyRemote,
    _now: null,       // 测试注入时刻（null = 系统时钟）
    _remote: undefined, // 联机覆盖（undefined = 无覆盖，走本地日历）
  };
})();
