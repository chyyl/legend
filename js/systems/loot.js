/* =============================================================================
 * 文件：js/systems/loot.js
 * 职责：物品生成与品质/羁绊随机（要求：武器品质 N/R/SR/SSR 按概率刷新，
 *       装备品质 D/C/B/A/S/SS 按概率掉落，武器装备等级 1-10，
 *       羁绊按品质给 0-4 个）。同时负责物品的最终属性计算。
 * 依赖：js/data/config.js、js/core/utils.js
 * 对外接口（window.Legend.Loot）：
 *   - rollWeaponQuality(rng)        -> 品质对象
 *   - rollArmorQuality(rng)         -> 品质对象
 *   - makeWeapon(rng, opts)         -> 武器实例 {uid,type,lv,quality,bonds,base,...}
 *   - makeArmor(rng, opts)          -> 装备实例（含 slot: helmet/chest/legging/boots）
 *   - weaponStats(item)             -> {dmg,aspd,range,block,kind}
 *   - armorStats(item)              -> {def,hp,move,dmg,dodge}
 *   - rollBonds(rng, q)             -> 羁绊 id 数组（去重）
 *   - rollEnemyLoot(rng, enemy, diff)  -> 掉落列表（敌人掉落入口）
 *   - rollChestLoot(rng, rare, lv, diff) -> 宝箱掉落列表
 *   - itemName(item) / itemDesc(item)    -> 中文名与描述文本
 * 被引用：combat.js / player.js / ui.js / game.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config;

  var Loot = {};
  var uidSeq = 1;

  /* ---- 按概率表抽取 ---- */
  function rollByProb(rng, table) {
    var r = rng(), acc = 0;
    for (var i = 0; i < table.length; i++) {
      acc += table[i].prob;
      if (r < acc) return table[i];
    }
    return table[table.length - 1];
  }
  Loot.rollWeaponQuality = function (rng) { return rollByProb(rng, Config.WEAPON_QUALITIES); };
  Loot.rollArmorQuality = function (rng) { return rollByProb(rng, Config.ARMOR_QUALITIES); };

  /* ---- 羁绊抽取：按品质给区间数量，随机不重复 ---- */
  Loot.rollBonds = function (rng, q) {
    var min = q.bonds[0], max = q.bonds[1];
    if (max <= 0) return [];
    var n = rng.int(min, max);
    var pool = Config.BONDS.slice(), out = [];
    for (var i = 0; i < n && pool.length; i++) {
      out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0].id);
    }
    return out;
  };

  /* ---- 武器实例 ---- */
  Loot.makeWeapon = function (rng, opts) {
    opts = opts || {};
    var tpl = opts.base || rng.pick(Config.WEAPONS);
    var q = opts.quality || Loot.rollWeaponQuality(rng);
    var lv = opts.lv || rng.int(1, Config.PLAYER_MAX_LEVEL);
    var bonds = opts.bonds || Loot.rollBonds(rng, q);
    return {
      uid: uidSeq++,
      slot: 'weapon',
      type: tpl.id,
      lv: lv,
      quality: q.id,
      bonds: bonds,
      _base: tpl,
      _q: q
    };
  };

  /* ---- 装备实例 ---- */
  Loot.makeArmor = function (rng, opts) {
    opts = opts || {};
    var tpl = opts.base || rng.pick(Config.ARMORS);
    var q = opts.quality || Loot.rollArmorQuality(rng);
    var lv = opts.lv || rng.int(1, Config.PLAYER_MAX_LEVEL);
    var bonds = opts.bonds || Loot.rollBonds(rng, q);
    return {
      uid: uidSeq++,
      slot: tpl.id,
      type: tpl.id,
      lv: lv,
      quality: q.id,
      bonds: bonds,
      _base: tpl,
      _q: q
    };
  };

  function rngRange(rng, r) { return rng.range(r[0], r[1]); }

  /* ---- 武器最终属性：基础 × 等级倍率 × 品质加成 + 羁绊加成 ---- */
  Loot.weaponStats = function (item) {
    var b = item._base, q = item._q, s = Config.levelScale(item.lv);
    var acc = { dmg: 0, aspd: 0, range: 0, def: 0, dodge: 0, crit3: 0, lifesteal: 0, exp: 0, undead: false, dmgMul: 0, aspdMul: 0, rangeMul: 0 };
    /* 品质加成 */
    acc.dmgMul += q.dmg;
    acc.aspdMul += rngRangeAvg(q.aspd) + rngRangeAvg(q.extraAspd);
    acc.rangeMul += rngRangeAvg(q.range);
    /* 羁绊加成 */
    for (var i = 0; i < item.bonds.length; i++) {
      var bd = Config.getBond(item.bonds[i]);
      if (bd) bd.apply(acc);
    }
    var dmg = b.dmg * s * (1 + acc.dmg + acc.dmgMul);
    var aspd = b.aspd * (1 + acc.aspd + acc.aspdMul);
    var range = b.range * (1 + acc.range + acc.rangeMul);
    return {
      dmg: dmg, aspd: Math.min(aspd, 4.0), range: range,
      block: b.block, kind: b.kind, pierce: b.pierce, aoe: b.aoe,
      crit3: acc.crit3, lifesteal: acc.lifesteal, undead: acc.undead
    };
  };
  /* 品质加成区间在生成时应固化，这里用中位值兜底（序列化后 _q 仍在，稳定可复现） */
  function rngRangeAvg(r) { return (r[0] + r[1]) / 2; }

  /* ---- 装备最终属性 ---- */
  Loot.armorStats = function (item) {
    var b = item._base, q = item._q, s = Config.levelScale(item.lv);
    var acc = { dmg: 0, aspd: 0, range: 0, def: 0, dodge: 0, crit3: 0, lifesteal: 0, exp: 0, undead: false, dmgMul: 0, aspdMul: 0, rangeMul: 0 };
    for (var i = 0; i < item.bonds.length; i++) {
      var bd = Config.getBond(item.bonds[i]);
      if (bd) bd.apply(acc);
    }
    return {
      def: b.def * s * (1 + rngRangeAvg(q.def) + acc.def),   // 防御值（非百分比）
      hp: b.hp * s,
      move: b.move + rngRangeAvg(q.move),
      dmg: rngRangeAvg(q.dmg) + acc.dmg,                     // 额外伤害百分比
      dodge: rngRangeAvg(q.dodge) + acc.dodge,               // 闪避概率
      crit3: acc.crit3, lifesteal: acc.lifesteal, undead: acc.undead, exp: acc.exp
    };
  };

  /* ---- 名称与描述 ---- */
  Loot.itemName = function (item) {
    var qn = item._q.name;
    return '[' + qn + ']' + item._base.name + ' Lv' + item.lv;
  };
  Loot.itemDesc = function (item) {
    var lines = [];
    if (item.slot === 'weapon') {
      var st = Loot.weaponStats(item);
      lines.push('伤害 ' + st.dmg.toFixed(1) + '  攻速 ' + st.aspd.toFixed(2) + '/s');
      lines.push('范围 ' + st.range.toFixed(2) + ' 格' + (st.block ? '  减伤 ' + Math.round(st.block * 100) + '%' : ''));
    } else {
      var as = Loot.armorStats(item);
      lines.push('防御 ' + as.def.toFixed(1) + '  生命 +' + Math.round(as.hp));
      if (as.move > 0) lines.push('移速 +' + Math.round(as.move * 100) + '%');
      if (as.dmg > 0) lines.push('伤害 +' + Math.round(as.dmg * 100) + '%');
      if (as.dodge > 0) lines.push('闪避 +' + Math.round(as.dodge * 100) + '%');
    }
    if (item.bonds.length) {
      var bn = item.bonds.map(function (id) { var b = Config.getBond(id); return b ? b.name : id; });
      lines.push('羁绊：' + bn.join('、'));
    } else {
      lines.push('羁绊：无');
    }
    return lines.join('\n');
  };

  /* ---- 敌人掉落（要求：敌人武器装备属性为玩家的30%，此处直接掉落玩家可用物品，
   *       并按难度系数提升品质权重） ---- */
  Loot.rollEnemyLoot = function (rng, enemy, diff) {
    var out = [];
    var lv = enemy.lv;
    var boss = enemy.rank === 'boss', elite = enemy.rank === 'elite';
    /* 难度系数越高，越容易出好货：小幅提升稀有品质权重 */
    var qBoost = 1 + Math.max(0, diff - Config.DEFAULT_DIFFICULTY) * 0.5;
    if (rng.chance((boss ? 1.0 : elite ? 0.55 : 0.16) * qBoost)) {
      out.push(Loot.makeWeapon(rng, { lv: lv }));
    }
    if (rng.chance((boss ? 0.9 : elite ? 0.5 : 0.14) * qBoost)) {
      out.push(Loot.makeArmor(rng, { lv: lv }));
    }
    return out;
  };

  /* ---- 宝箱掉落（要求：可以开出好东西） ---- */
  Loot.rollChestLoot = function (rng, rare, lv, diff) {
    var out = [];
    var n = rare ? Config.CHEST.RARE_ITEMS : Config.CHEST.BASE_ITEMS;
    var qBoost = 1 + Math.max(0, diff - Config.DEFAULT_DIFFICULTY) * 0.6;
    for (var i = 0; i < n; i++) {
      if (rng.chance(0.5)) out.push(Loot.makeWeapon(rng, { lv: lv }));
      else out.push(Loot.makeArmor(rng, { lv: lv }));
    }
    /* 华丽宝箱：额外固定一件不低于 SR/A 的物品 */
    if (rare) {
      var q = rng.chance(0.25) ? Config.WEAPON_QUALITIES[3] : Config.WEAPON_QUALITIES[2];
      out.push(Loot.makeWeapon(rng, { lv: lv, quality: q }));
    }
    return out;
  };

  /* ---- 序列化兼容：读档后重新挂载 _base/_q ---- */
  Loot.hydrate = function (item) {
    if (item.slot === 'weapon') item._base = Config.getWeapon(item.type);
    else item._base = Config.getArmor(item.type);
    var table = item.slot === 'weapon' ? Config.WEAPON_QUALITIES : Config.ARMOR_QUALITIES;
    for (var i = 0; i < table.length; i++) if (table[i].id === item.quality) item._q = table[i];
    if (!item._q) item._q = table[0];
    return item;
  };

  L.Loot = Loot;
})(window);
