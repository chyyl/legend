/* ============================================================================
   js/game/inventory.js —— 背包/装备/强化（Q56 格子无负重，Q35 银币强化）
   ----------------------------------------------------------------------------
   职责：管理 40 格背包、武器/四件装备槽、羁绊聚合（Q29 同类不叠加）、
         银币强化（每级+5%基础，上限随 MAX_LEVEL=99）、出售/一键出售。

   对外接口（window.LG.Inv）：
     .bag[] .equip{weapon,helm,chest,legs,boots} .silver
     .add(item) -> bool      .removeAt(i) .moveTo(i)
     .equipItem(i) .unequip(slot)
     .enhance(itOrRef) -> bool  强化（首选物品对象，兼容下标/编号）
     .enhanceCost(it) -> n      强化费用（50×当前等级）
     .sell(i) -> silver  .dismantleAll() -> {count, silver}(一键出售行囊)
     .defPts(v) -> n      防御词条归一（旧分数档→百分点）
     .calcStats() -> {dmg,aspd,range,crit,def,spd,dodge,dmgMul,defMul,expMul,...}
     .activeBonds() -> [bondId...]   聚合当前所有已装备羁绊（去重 Q29）

   依赖：core/config.js（羁绊表）、core/utils.js、game/loot.js（实例来源）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const state = {
    bag: new Array(LG.Config.BAG_SIZE).fill(null),
    equip: { weapon: null, helm: null, chest: null, legs: null, boots: null },
    silver: 0,
  };

  function add(item) {
    for (let i = 0; i < state.bag.length; i++)
      if (!state.bag[i]) { state.bag[i] = item; return true; }
    return false; // 背包满
  }
  function removeAt(i) { const it = state.bag[i]; state.bag[i] = null; return it; }

  /* 装备到对应槽（返回被替换的旧装备） */
  function equipItem(i) {
    const it = state.bag[i];
    if (!it) return null;
    let slot;
    if (it.slot === 'weapon') slot = 'weapon';
    else slot = it.armorSlot; // helm/chest/legs/boots
    const old = state.equip[slot];
    state.equip[slot] = it;
    state.bag[i] = old || null;
    return old;
  }
  function unequip(slot) {
    const it = state.equip[slot];
    if (!it) return false;
    for (let i = 0; i < state.bag.length; i++)
      if (!state.bag[i]) { state.bag[i] = it; state.equip[slot] = null; return true; }
    return false; // 背包满
  }

  /* 强化（Q35）：消耗银币，等级+1（上限 MAX_LEVEL，阶段二十三=99），每级+5%基础属性
     阶段二十：首选参数改为物品对象本身——旧版传 _id 会与背包下标撞号
     （行囊 i 位为空时会误强化 _id===i 的已装备物品）；数字参数仍按下标/编号兼容。
     阶段二十二（反馈"无法强化无效"）：费用抽出 enhanceCost 供详情卡按钮标价显示。 */
  function enhanceCost(it) { return 50 * it.lv; } // 越高级越贵
  function enhance(ref) {
    const it = (ref && typeof ref === 'object') ? ref
      : (typeof ref === 'number' && state.bag[ref]) ||
        (typeof ref === 'number' && Object.values(state.equip).find((e) => e && e._id === ref));
    if (!it) return false;
    if (it.lv >= LG.Config.MAX_LEVEL) return false;
    const cost = enhanceCost(it);
    if (state.silver < cost) return false;
    state.silver -= cost;
    it.lv += 1;
    return true;
  }

  /* 品质售价表（出售/一键分解共用，阶段二十抽出） */
  const PRICE = { N: 10, R: 30, SR: 80, SSR: 200, D: 5, C: 15, B: 40, A: 100, S: 250, SS: 600 };
  function priceOf(it) { return (PRICE[it.quality] || 10) * it.lv; }

  function sell(i) {
    const it = removeAt(i);
    if (!it) return 0;
    const gain = priceOf(it);
    state.silver += gain;
    return gain;
  }

  /* 一键分解（阶段二十反馈"添加一键分解功能"）：分解行囊内全部物品
     （已装备槽不受影响），按售价表折算银币。返回 {count, silver} 供 UI 提示。 */
  function dismantleAll() {
    let count = 0, silver = 0;
    for (let i = 0; i < state.bag.length; i++) {
      const it = state.bag[i];
      if (!it) continue;
      silver += priceOf(it); count++;
      state.bag[i] = null;
    }
    state.silver += silver;
    return { count, silver };
  }

  /* 聚合当前所有已装备羁绊：Q29 同类不叠加，只保留唯一一份 */
  function activeBonds() {
    const set = new Set();
    Object.values(state.equip).forEach((it) => { if (it) it.bonds.forEach((b) => set.add(b)); });
    return [...set];
  }

  /* 综合角色属性：基础 + 装备 + 强化 + 羁绊 */
  /* 防御词条归一：旧档分数制（0.05-0.5）→ 百分点（5-50）。旧分数取整后恒为 0，
     是反馈"装备数值有0"的根源；新掉落直接存百分点（rollArmor ×100） */
  function defPts(v) { const n = +v || 0; return n > 0 && n < 1 ? n * 100 : n; }

  function calcStats() {
    const lv = (LG.Player && LG.Player.level) || 1;
    // 基础成长（Q64 仅等级+装备）
    const s = {
      maxHp: 100 + (lv - 1) * 20,
      dmg: 10 + (lv - 1) * 2,
      def: 0, aspd: 1, range: 2, crit: 0.05, spd: 3, dodge: 0,
      dmgMul: 1, defMul: 1, aspdMul: 1, rangeMul: 1, expMul: 1,
      triCrit: 0, lifesteal: 0, phoenix: false,
    };
    // 装备加成（含强化 +5%/级）
    Object.values(state.equip).forEach((it) => {
      if (!it) return;
      const enh = 1 + LG.Config.ENHANCE_PER_LV * (it.lv - 1);
      if (it.slot === 'weapon') {
        s.dmg += it.stats.dmg * enh;
        // 阶段二十二（反馈"强化无效"）：攻速也纳入强化加成（每级+5%），强化收益从单一攻击词条变全面可感
        s.aspd += it.stats.aspd * enh; s.crit += it.stats.crit;
        // 射程由主手武器直接决定（覆盖基础值，不做叠加——物品 range 已含武器基础值+品质词条；
        // 盾/异常的0保留空手基础2）。阶段十七接入；阶段二十三空手基准 1→2（清单104"玩家攻击范围扩大1倍"）
        if (it.stats.range) s.range = it.stats.range;
      } else {
        // 阶段二十三：防御走百分点（defPts）；伤害词条=总伤百分比加成（旧分数值 0.1=+10% 天然兼容）
        s.def += defPts(it.stats.def) * enh;
        s.spd += it.stats.spd || 0; s.dmgMul *= 1 + (it.stats.dmg || 0); s.dodge += it.stats.dodge || 0;
      }
    });
    // 羁绊（去重后逐个应用）
    activeBonds().forEach((bid) => {
      const b = LG.Config.BONDS.find((x) => x.id === bid);
      if (b) b.apply(s);
    });
    // 归一化
    s.dmg = Math.round(s.dmg * s.dmgMul);
    s.def = Math.round(s.def * s.defMul);
    s.aspd *= s.aspdMul;
    // 射程乘羁绊（主手武器基准已在装备环写入：弓7.0/弩8.0/杖6.0/近战1.6~2.2，空手=1）
    s.range *= s.rangeMul;
    return s;
  }

  LG.Inv = {
    state, add, removeAt, equipItem, unequip, enhance, enhanceCost, sell, dismantleAll, priceOf, activeBonds, calcStats, defPts,
    get bag() { return state.bag; },
    get equip() { return state.equip; },
    get silver() { return state.silver; },
    set silver(v) { state.silver = v; },
  };
})();
