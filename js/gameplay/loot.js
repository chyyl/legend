/**
 * Loot System — Quality + Main Stat + Fixed Affixes Only
 * 4 tiers, boss exclusive pool, compare tooltip, smith +10 table
 */

export const ITEM_QUALITY = {
  COMMON: 0,      // White - 1 affix
  MAGIC: 1,       // Blue - 2 affixes
  RARE: 2,        // Yellow - 3 affixes
  LEGENDARY: 3    // Orange - 3 affixes + unique effect
};

export const ITEM_SLOTS = {
  WEAPON: 'weapon',
  HELMET: 'helmet',
  CHEST: 'chest',
  GLOVES: 'gloves',
  BOOTS: 'boots',
  AMULET: 'amulet',
  RING: 'ring',
  RING2: 'ring2'
};

export const MAIN_STATS = {
  WEAPON: 'damage',
  HELMET: 'armor',
  CHEST: 'armor',
  GLOVES: 'attack_speed',
  BOOTS: 'move_speed',
  AMULET: 'health',
  RING: 'crit_chance',
  RING2: 'crit_damage'
};

const BASE_STAT_RANGES = {
  weapon: { damage: [8, 12] },
  helmet: { armor: [5, 8] },
  chest: { armor: [10, 15] },
  gloves: { attack_speed: [0.05, 0.1] },
  boots: { move_speed: [0.05, 0.1] },
  amulet: { health: [20, 35] },
  ring: { crit_chance: [0.02, 0.04] },
  ring2: { crit_damage: [0.15, 0.25] }
};

const AFFIX_POOLS = {
  // Offensive
  offensive: [
    { id: 'dmg_pct', stat: 'damage_pct', name: '伤害提升', format: '+%d%% 伤害', weight: 10, range: [5, 15] },
    { id: 'atk_spd', stat: 'attack_speed', name: '攻速', format: '+%d%% 攻速', weight: 8, range: [3, 10] },
    { id: 'crit_chance', stat: 'crit_chance', name: '暴击率', format: '+%d%% 暴击率', weight: 6, range: [2, 6] },
    { id: 'crit_dmg', stat: 'crit_damage', name: '暴伤', format: '+%d%% 暴击伤害', weight: 6, range: [10, 25] },
    { id: 'penetration', stat: 'penetration', name: '穿透', format: '+%d 穿透', weight: 4, range: [3, 8] },
    { id: 'ele_dmg', stat: 'elemental_damage', name: '元素伤害', format: '+%d%% 元素伤害', weight: 5, range: [5, 12] }
  ],
  // Defensive
  defensive: [
    { id: 'health_pct', stat: 'health_pct', name: '生命提升', format: '+%d%% 最大生命', weight: 10, range: [5, 15] },
    { id: 'armor_flat', stat: 'armor', name: '护甲', format: '+%d 护甲', weight: 8, range: [5, 15] },
    { id: 'res_all', stat: 'resistance_all', name: '全抗', format: '+%d 全元素抗性', weight: 6, range: [5, 12] },
    { id: 'res_fire', stat: 'resistance_fire', name: '火抗', format: '+%d 火焰抗性', weight: 4, range: [8, 18] },
    { id: 'res_cold', stat: 'resistance_cold', name: '冰抗', format: '+%d 冰霜抗性', weight: 4, range: [8, 18] },
    { id: 'res_light', stat: 'resistance_lightning', name: '电抗', format: '+%d 闪电抗性', weight: 4, range: [8, 18] },
    { id: 'dmg_red', stat: 'damage_reduction', name: '减伤', format: '+%d%% 伤害减免', weight: 3, range: [2, 5] },
    { id: 'life_regen', stat: 'life_regen', name: '回血', format: '+%d/秒 生命回复', weight: 5, range: [2, 6] }
  ],
  // Utility
  utility: [
    { id: 'move_spd', stat: 'move_speed', name: '移速', format: '+%d%% 移动速度', weight: 8, range: [5, 12] },
    { id: 'gold_find', stat: 'gold_find', name: '拾金', format: '+%d%% 金币获取', weight: 5, range: [10, 25] },
    { id: 'item_find', stat: 'item_find', name: '拾取', format: '+%d%% 掉落率', weight: 4, range: [5, 15] },
    { id: 'exp_bonus', stat: 'exp_bonus', name: '经验', format: '+%d%% 经验获取', weight: 4, range: [5, 12] },
    { id: 'cooldown_red', stat: 'cooldown_reduction', name: '冷却', format: '-%d%% 技能冷却', weight: 3, range: [5, 10] },
    { id: 'dash_charges', stat: 'dash_charges', name: '冲刺', format: '+%d 冲刺次数', weight: 2, range: [1, 1] }
  ],
  // Boss exclusive (legendary only)
  boss_exclusive: [
    { id: 'execute', stat: 'execute', name: '斩杀', format: '低于 20%% 生命时伤害 +50%%', weight: 1, unique: true },
    { id: 'thorns', stat: 'thorns', name: '反刺', format: '受到近战攻击反弹 100%% 伤害', weight: 1, unique: true },
    { id: 'lifesteal', stat: 'lifesteal', name: '吸血', format: '伤害的 15%% 转化为生命', weight: 1, unique: true },
    { id: 'cleave', stat: 'cleave', name: '顺劈', format: '攻击击中额外 2 个目标', weight: 1, unique: true },
    { id: 'shield_on_kill', stat: 'shield_on_kill', name: '护盾', format: '击杀获得护盾 (最大生命 10%%)', weight: 1, unique: true }
  ]
};

const QUALITY_AFFIX_COUNTS = {
  [ITEM_QUALITY.COMMON]: 1,
  [ITEM_QUALITY.MAGIC]: 2,
  [ITEM_QUALITY.RARE]: 3,
  [ITEM_QUALITY.LEGENDARY]: 3 // + unique from boss_exclusive
};

const QUALITY_STAT_MULTIPLIERS = {
  [ITEM_QUALITY.COMMON]: 1.0,
  [ITEM_QUALITY.MAGIC]: 1.25,
  [ITEM_QUALITY.RARE]: 1.5,
  [ITEM_QUALITY.LEGENDARY]: 2.0
};

const QUALITY_NAMES = {
  [ITEM_QUALITY.COMMON]: '普通',
  [ITEM_QUALITY.MAGIC]: '魔法',
  [ITEM_QUALITY.RARE]: '稀有',
  [ITEM_QUALITY.LEGENDARY]: '传奇'
};

const QUALITY_COLORS = {
  [ITEM_QUALITY.COMMON]: '#ffffff',
  [ITEM_QUALITY.MAGIC]: '#4488ff',
  [ITEM_QUALITY.RARE]: '#ffff44',
  [ITEM_QUALITY.LEGENDARY]: '#ff8800'
};

export function createLootSystem(opts = {}) {
  const { rng = createDefaultRNG() } = opts;

  // Smith enhancement table (+1 to +10)
  const SMITH_TABLE = generateSmithTable();

  function createDefaultRNG() {
    let seed = Date.now();
    return {
      next() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      },
      nextInt(max) { return Math.floor(this.next() * max); },
      nextFloat(min, max) { return min + this.next() * (max - min); }
    };
  }

  function generateSmithTable() {
    const table = {};
    for (let level = 1; level <= 10; level++) {
      // Exponential cost curve
      const baseCost = 100;
      const cost = Math.floor(baseCost * Math.pow(1.8, level - 1));
      const statBonus = level * 0.08; // 8% per level
      const failChance = level >= 7 ? (level - 6) * 0.1 : 0; // 10%/20%/30%/40% at +7/+8/+9/+10
      const destroyChance = level >= 9 ? (level - 8) * 0.05 : 0; // 5%/10% at +9/+10
      table[level] = { cost, statBonus, failChance, destroyChance };
    }
    return table;
  }

  /**
   * Generate a random item
   */
  function generateItem(slot, level = 1, forcedQuality = null, isBossDrop = false) {
    const quality = forcedQuality !== null && forcedQuality !== undefined ? forcedQuality : rollQuality(level, isBossDrop);
    const baseStats = { ...BASE_STAT_RANGES[slot] };
    const mainStatKey = Object.keys(baseStats)[0];
    const [min, max] = baseStats[mainStatKey];

    // Scale by level and quality
    const levelMult = 1 + (level - 1) * 0.08;
    const qualityMult = QUALITY_STAT_MULTIPLIERS[quality];

    const mainStatValue = Math.floor(rng.nextFloat(min, max) * levelMult * qualityMult);

    // Generate affixes
    const affixCount = QUALITY_AFFIX_COUNTS[quality];
    const affixes = generateAffixes(slot, affixCount, level, quality, isBossDrop);

    // Legendary gets unique boss affix
    let uniqueEffect = null;
    if (quality === ITEM_QUALITY.LEGENDARY && isBossDrop) {
      uniqueEffect = rollBossAffix();
      uniqueEffect.isUnique = true;
      affixes.push({ ...uniqueEffect });
    }

    return {
      id: generateItemId(),
      slot,
      quality,
      level,
      name: generateItemName(slot, quality),
      mainStat: { key: mainStatKey, value: mainStatValue },
      affixes,
      uniqueEffect,
      enhanced: 0, // smith level 0-10
      seed: rng.getState ? rng.getState() : Date.now()
    };
  }

  function rollQuality(level, isBossDrop) {
    // Base weights by level
    let weights = [60, 25, 12, 3]; // common, magic, rare, legendary

    // Level increases higher quality chances
    const levelBonus = Math.min(20, (level - 1) * 2);
    weights[1] += levelBonus;
    weights[2] += levelBonus * 0.5;
    weights[3] += levelBonus * 0.2;

    // Boss drops: guaranteed at least magic, higher legendary
    if (isBossDrop) {
      weights[0] = 0;
      weights[1] = 30;
      weights[2] = 50;
      weights[3] = 20;
    }

    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return ITEM_QUALITY.COMMON;
  }

  function generateAffixes(slot, count, level, quality, isBossDrop) {
    const affixes = [];
    const usedStats = new Set([MAIN_STATS[slot.toUpperCase()]]); // Don't duplicate main stat

    // Determine pool weights by slot
    let poolWeights = { offensive: 1, defensive: 1, utility: 1 };
    if (slot === 'weapon') poolWeights.offensive = 2;
    else if (slot === 'chest' || slot === 'helmet') poolWeights.defensive = 2;
    else if (slot === 'boots') poolWeights.utility = 2;

    for (let i = 0; i < count; i++) {
      // Pick pool
      const pools = Object.keys(poolWeights);
      const totalWeight = pools.reduce((s, p) => s + poolWeights[p], 0);
      let r = rng.next() * totalWeight;
      let chosenPool = pools[0];
      for (const p of pools) {
        r -= poolWeights[p];
        if (r <= 0) { chosenPool = p; break; }
      }

      // Pick affix from pool
      const pool = AFFIX_POOLS[chosenPool];
      const available = pool.filter(a => !usedStats.has(a.stat));
      if (available.length === 0) break;

      const weightSum = available.reduce((s, a) => s + a.weight, 0);
      r = rng.next() * weightSum;
      let chosen = available[0];
      for (const a of available) {
        r -= a.weight;
        if (r <= 0) { chosen = a; break; }
      }

      // Roll value
      const [min, max] = chosen.range;
      const value = Math.floor(rng.nextFloat(min, max) * QUALITY_STAT_MULTIPLIERS[quality]);

      affixes.push({
        id: chosen.id,
        stat: chosen.stat,
        name: chosen.name,
        value,
        format: chosen.format.replace('%d', value),
        tier: quality
      });

      usedStats.add(chosen.stat);
    }

    return affixes;
  }

  function rollBossAffix() {
    const pool = AFFIX_POOLS.boss_exclusive;
    const total = pool.reduce((s, a) => s + a.weight, 0);
    let r = rng.next() * total;
    for (const a of pool) {
      r -= a.weight;
      if (r <= 0) return { ...a };
    }
    return pool[0];
  }

  function generateItemName(slot, quality) {
    const prefixes = {
      [ITEM_QUALITY.COMMON]: ['', '粗糙的', '磨损的', '普通的'],
      [ITEM_QUALITY.MAGIC]: ['神秘的', '闪烁的', '符文的', '附魔的'],
      [ITEM_QUALITY.RARE]: ['卓越的', '古老的', '英雄的', '传说的'],
      [ITEM_QUALITY.LEGENDARY]: ['永恒的', '神话的', '创世的', '毁灭的']
    };
    const bases = {
      weapon: ['剑', '斧', '锤', '刀', '枪'],
      helmet: ['头盔', '面甲', '头冠', '兜帽'],
      chest: ['胸甲', '铠甲', '长袍', '战甲'],
      gloves: ['护手', '手套', '护腕', '重拳'],
      boots: ['战靴', '便鞋', '护腿', '轻靴'],
      amulet: ['护符', '项链', '吊坠', '勋章'],
      ring: ['指环', '戒指', '印记', '徽章'],
      ring2: ['指环', '戒指', '印记', '徽章']
    };
    const prefix = rng.next() < 0.7 ? rng.next() < 0.5 ? '' : rng.choose(prefixes[quality]) : '';
    const base = rng.choose(bases[slot]);
    return (prefix ? prefix + ' ' : '') + base;
  }

  function rngChoose(arr) {
    return arr[rng.nextInt(arr.length)];
  }
  rng.choose = rngChoose;

  /**
   * Compare two items for tooltip
   */
  function compareItems(equipped, candidate) {
    if (!equipped) return { better: true, deltas: {} };
    if (!candidate) return { better: false, deltas: {} };

    const deltas = {};
    let better = false;
    let worse = false;

    // Main stat
    const eqMain = equipped.mainStat?.value || 0;
    const candMain = candidate.mainStat?.value || 0;
    deltas.mainStat = candMain - eqMain;
    if (deltas.mainStat > 0) better = true;
    else if (deltas.mainStat < 0) worse = true;

    // Affixes - compare by stat (only stats present in BOTH items)
    const eqAffixes = Object.fromEntries(equipped.affixes?.map(a => [a.stat, a.value]) || []);
    const candAffixes = Object.fromEntries(candidate.affixes?.map(a => [a.stat, a.value]) || []);

    for (const stat of new Set([...Object.keys(eqAffixes), ...Object.keys(candAffixes)])) {
      const eq = eqAffixes[stat] || 0;
      const cand = candAffixes[stat] || 0;
      const delta = cand - eq;
      if (delta !== 0) {
        deltas[stat] = delta;
        // Only mark as worse if BOTH items have the stat and candidate is lower
        if (eq > 0 && cand > 0 && delta < 0) {
          worse = true;
        } else if (delta > 0) {
          better = true;
        }
      }
    }

    // Unique effect
    if (candidate.uniqueEffect && !equipped.uniqueEffect) {
      deltas.unique = true;
      better = true;
    }

    return { better: better && !worse, deltas, summary: better ? '升级' : (worse ? '降级' : '平级') };
  }

  /**
   * Smith enhancement
   */
  function enhanceItem(item) {
    if (!item || item.enhanced >= 10) return { success: false, reason: 'max_level' };
    if (item.quality === ITEM_QUALITY.COMMON) return { success: false, reason: 'cannot_enhance_common' };

    const nextLevel = item.enhanced + 1;
    const table = SMITH_TABLE[nextLevel];
    if (!table) return { success: false, reason: 'invalid_level' };

    const roll = rng.next();
    if (roll < table.destroyChance) {
      return { success: false, destroyed: true, reason: 'destroyed' };
    }
    if (roll < table.failChance + table.destroyChance) {
      return { success: false, reason: 'failed' };
    }

    // Success
    item.enhanced = nextLevel;
    // Increase main stat
    item.mainStat.value = Math.floor(item.mainStat.value * (1 + table.statBonus));
    // Increase affix values
    for (const affix of item.affixes) {
      affix.value = Math.floor(affix.value * (1 + table.statBonus * 0.5));
      affix.format = affix.format.replace(/\d+/, affix.value);
    }

    return { success: true, level: nextLevel, cost: table.cost };
  }

  function getSmithInfo(level) {
    return SMITH_TABLE[level] || null;
  }

  function getSmithCost(level) {
    return SMITH_TABLE[level]?.cost || 0;
  }

  function canAffordEnhance(item, gold) {
    if (!item || item.enhanced >= 10) return false;
    return gold >= getSmithCost(item.enhanced + 1);
  }

  /**
   * Generate loot drop for enemy
   */
  function generateLootDrop(enemyType, level, isBoss = false) {
    const drops = [];
    const dropCount = isBoss ? rng.nextInt(3) + 2 : (rng.next() < 0.3 ? 1 : 0);

    for (let i = 0; i < dropCount; i++) {
      const slots = Object.keys(ITEM_SLOTS).map(k => ITEM_SLOTS[k]);
      const slot = rng.choose(slots);
      const quality = isBoss ? (rng.next() < 0.3 ? ITEM_QUALITY.LEGENDARY : ITEM_QUALITY.RARE) : undefined;
      drops.push(generateItem(slot, level, quality, isBoss));
    }

    // Gold drop
    const baseGold = isBoss ? 500 : 50;
    const gold = Math.floor(baseGold * (0.8 + rng.next() * 0.4) * (1 + level * 0.1));
    if (gold > 0) drops.push({ type: 'gold', amount: gold });

    return drops;
  }

  function generateItemId() {
    return 'item_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function getQualityName(quality) { return QUALITY_NAMES[quality]; }
  function getQualityColor(quality) { return QUALITY_COLORS[quality]; }

  return {
    generateItem,
    generateLootDrop,
    compareItems,
    enhanceItem,
    getSmithInfo,
    getSmithCost,
    canAffordEnhance,
    getQualityName,
    getQualityColor,
    ITEM_QUALITY,
    ITEM_SLOTS,
    MAIN_STATS,
    BASE_STAT_RANGES,
    AFFIX_POOLS,
    SMITH_TABLE,
    QUALITY_AFFIX_COUNTS,
    QUALITY_STAT_MULTIPLIERS,
    QUALITY_NAMES,
    QUALITY_COLORS
  };
}