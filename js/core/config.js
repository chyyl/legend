/* ============================================================================
   js/core/config.js —— LEGEND 全局配置与数值表（单一可信源）
   ----------------------------------------------------------------------------
   职责：集中存放所有数值、公式、区域坐标、品质/羁绊/难度表。
         其它模块只读取 LG.Config，不得各自硬编码数值。

   对外接口（window.LG.Config）：
     .TILE .WORLD .REGIONS .WEAPONS .ARMOR_SLOTS .QUALITY_W .QUALITY_A
     .BONDS .DIFFICULTY .ENEMY_TYPES .EXP公式 .dropQuality() .enemyStat()
     .silverExp() .regionAt()

   设计决策来源：本文件所有数值均由「76问需求确认」确定，改数值请同步 TODO.md。
   依赖：无（需在 utils.js 之前加载）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const Config = {
    /* ---------- 基础规格 ---------- */
    TILE: 32,          // 瓦片像素（高清像素风，Q45=32px角色/瓦片）
    WORLD: 2000,       // 大地图 2000×2000 格（文档要求）
    SIZE: 2000,        // WORLD 别名（engine/ui 渲染引用统一用 SIZE）
    REGION_SIZE: 300,  // 单区域约 300×300 连续场景（Q16：每区域数百格）
    SEED: 20261013,    // 默认世界种子（Q9：手工框架+局部随机）

    /* ---------- 难度系统（Q33 连续滑块 0-2，默认 0.9） ---------- */
    DIFFICULTY: {
      min: 0, max: 2, default: 0.9,
      // 敌人生命/伤害倍率 = 0.5 + 0.75×难度（难度0 → 0.5倍，难度2 → 2倍）
      scale: (d) => 0.5 + 0.75 * d,
      // 怪物密度倍率（Q63：密度随难度线性变化）
      density: (d) => 0.4 + 0.8 * d,
      // 掉落加成（Q34：高难度高掉落 ×(1+0.3×难度)）
      drop: (d) => 1 + 0.3 * d,
      // 银币/经验难度系数（Q32：与银币同公式）
      currency: (d) => Math.max(0.1, d),
    },

    /* ---------- 武器品质（文档表 + Q28修正SSR第4项=暴击） ---------- */
    QUALITY_W: [
      // id: 品质, mul: 伤害倍率, aspd/range/crit: [min,max]区间随机(Q27), bonds: 羁绊数, p: 概率
      { id: 'N',   mul: 1.00, aspd: null,        range: null,        crit: null,        bonds: [0, 0], p: 0.80 },
      { id: 'R',   mul: 1.30, aspd: null,        range: null,        crit: null,        bonds: [1, 2], p: 0.15 },
      { id: 'SR',  mul: 1.50, aspd: [0.10, 0.30], range: [0.20, 0.20], crit: null,        bonds: [2, 3], p: 0.035 },
      { id: 'SSR', mul: 1.65, aspd: [0.20, 0.50], range: [0.20, 0.35], crit: [0.25, 0.50], bonds: [2, 4], p: 0.015 },
    ],

    /* ---------- 装备品质（文档表，D~SS 六档） ---------- */
    QUALITY_A: [
      { id: 'D',  def: [0, 0],     spd: null,        dmg: null,        dodge: null,       bonds: [0, 0], p: 0.50 },
      { id: 'C',  def: [0.10, 0.20], spd: null,      dmg: null,        dodge: null,       bonds: [0, 0], p: 0.25 },
      { id: 'B',  def: [0.20, 0.30], spd: [0.10, 0.20], dmg: null,     dodge: null,       bonds: [1, 1], p: 0.15 },
      { id: 'A',  def: [0.20, 0.35], spd: [0.10, 0.25], dmg: [0.10, 0.25], dodge: null,  bonds: [1, 2], p: 0.06 },
      { id: 'S',  def: [0.30, 0.40], spd: [0.10, 0.30], dmg: [0.20, 0.30], dodge: [0.20, 0.30], bonds: [2, 3], p: 0.03 },
      { id: 'SS', def: [0.35, 0.50], spd: [0.10, 0.40], dmg: [0.30, 0.55], dodge: [0.25, 0.40], bonds: [2, 4], p: 0.01 },
    ],

    /* ---------- 武器列表（文档表）：kind=melee/ranged/magic/shield ---------- */
    WEAPONS: [
      { id: 'iron_sword', kind: 'melee',  zh: '铁刃',   en: 'Iron Blade',   base: 10, range: 1.6, aspd: 1.0, arc: 100, color: '#c9d1d9' },
      { id: 'knight_sword', kind: 'melee', zh: '骑士剑', en: 'Knight Sword', base: 14, range: 1.7, aspd: 0.85, arc: 90, color: '#e3c567' },
      { id: 'scythe',    kind: 'melee',  zh: '镰刀',   en: 'Scythe',       base: 12, range: 2.2, aspd: 0.9, arc: 150, color: '#8fbf9f' },
      { id: 'bow',       kind: 'ranged', zh: '弓',     en: 'Bow',          base: 11, range: 7.0, aspd: 1.0, proj: 11, color: '#b5895a' },
      { id: 'crossbow',  kind: 'ranged', zh: '弩',     en: 'Crossbow',     base: 15, range: 8.0, aspd: 0.7, proj: 13, color: '#7f8c9a' },
      { id: 'staff',     kind: 'magic',  zh: '法杖',   en: 'Staff',        base: 13, range: 6.0, aspd: 0.8, aoe: 1.8, color: '#9b7fd4' },
      { id: 'shield',    kind: 'shield', zh: '盾',     en: 'Shield',       base: 0,  range: 0,   aspd: 1.0, color: '#6b7280' },
    ],

    /* ---------- 装备槽位（文档：头盔/护甲/护腿/鞋） ---------- */
    ARMOR_SLOTS: [
      { id: 'helm', zh: '头盔', en: 'Helm' },
      { id: 'chest', zh: '护甲', en: 'Chest' },
      { id: 'legs', zh: '护腿', en: 'Legs' },
      { id: 'boots', zh: '鞋',  en: 'Boots' },
    ],

    /* ---------- 羁绊（文档表 8 种，等概率随机 Q30，同类不叠加 Q29） ---------- */
    BONDS: [
      { id: 'sharp',   zh: '锋利',     en: 'Sharp',      desc_zh: '伤害+30%',        desc_en: 'DMG +30%',        apply: (s) => s.dmgMul *= 1.30 },
      { id: 'sweep',   zh: '横扫之刃', en: 'Sweeping',   desc_zh: '攻击范围+40%',    desc_en: 'Range +40%',      apply: (s) => s.rangeMul *= 1.40 },
      { id: 'exp',     zh: '经验获取', en: 'Experience', desc_zh: '经验获取+50%',    desc_en: 'EXP +50%',        apply: (s) => s.expMul *= 1.50 },
      { id: 'power',   zh: '力量',     en: 'Power',      desc_zh: '伤害+15%，攻速+15%', desc_en: 'DMG+15%, AS+15%', apply: (s) => { s.dmgMul *= 1.15; s.aspdMul *= 1.15; } },
      { id: 'tri_crit',zh: '三倍暴击', en: 'Tri-Crit',   desc_zh: '三倍暴击概率+8%',  desc_en: '3x Crit +8%',     apply: (s) => s.triCrit += 0.08 },
      { id: 'guard',   zh: '保护',     en: 'Guard',      desc_zh: '防御力+30%',      desc_en: 'DEF +30%',        apply: (s) => s.defMul *= 1.30 },
      { id: 'lifesteal',zh: '吸血',    en: 'Lifesteal',  desc_zh: '攻击吸收5%血量',  desc_en: 'Leech 5% HP',      apply: (s) => s.lifesteal += 0.05 },
      { id: 'phoenix', zh: '不死金牌', en: 'Phoenix',    desc_zh: '致命伤→无敌5秒，冷却60秒', desc_en: 'Lethal→5s invuln, 60s CD', apply: (s) => s.phoenix = true },
    ],

    /* ---------- 敌人（Q71=军队人类，非怪物） ----------
       type: fixed 固定型（不移动，远程弹幕+范围预警）/ slow 缓慢型（警戒5格追击）
       属性=玩家30%，无羁绊（Q36）；难度不改移速（Q75） */
    ENEMY_TYPES: [
      { id: 'soldier',  zh: '军团士兵', en: 'Legion Soldier', move: 'slow',  hp: 60,  dmg: 8,  range: 1.8, aspd: 0.8, speed: 0.9, aggro: 5,  color: '#8a4b3c', elite: false },
      { id: 'archer',   zh: '军团弩手', en: 'Legion Archer',  move: 'fixed', hp: 45,  dmg: 10, range: 8.0, aspd: 0.7, speed: 0,   aggro: 8,  color: '#6b6b3c', elite: false, proj: 10 },
      { id: 'mage',     zh: '军团术士', en: 'Legion Mage',    move: 'fixed', hp: 50,  dmg: 14, range: 7.0, aspd: 0.5, speed: 0,   aggro: 7,  color: '#4b3c6b', elite: false, aoe: 1.6, proj: 9 },
      { id: 'captain',  zh: '军团队长', en: 'Legion Captain', move: 'slow',  hp: 150, dmg: 16, range: 2.2, aspd: 1.0, speed: 1.1, aggro: 6,  color: '#b3452e', elite: true },
      { id: 'war_mage', zh: '战争法师', en: 'War Mage',       move: 'fixed', hp: 130, dmg: 20, range: 9.0, aspd: 0.6, speed: 0,   aggro: 9,  color: '#7a2f5c', elite: true, aoe: 2.2, proj: 11 },
    ],

    /* ---------- 区域（文档表10区域 + Q16数百格） ----------
       cx/cy 为 2000×2000 世界中的中心格；dir 仅作方位注释 */
    REGIONS: [
      { id: 'camp',      zh: '营地',     en: 'Camp',        cx: 1500, cy: 1500, dir: '东南', biome: 'plain',  lv: 1, boss: null,
        zh_desc: '东南方最后的避难所，第一次需要解放，众多NPC聚集于此。' },
      { id: 'wall',      zh: '边境长城', en: 'Border Wall', cx: 1620, cy: 1250, dir: '东南-东', biome: 'plain',  lv: 2, boss: 'wall_warden',
        zh_desc: '抵御黑暗军团的古老长城，如今已被渗透。' },
      { id: 'bay',       zh: '海湾小镇', en: 'Bay Town',    cx: 1750, cy: 1500, dir: '东', biome: 'coast',  lv: 3, boss: 'bay_captain',
        zh_desc: '靠海的贸易小镇，港口被军团占领。' },
      { id: 'farm',      zh: '彬祥农业园', en: 'Farmland',   cx: 1500, cy: 1050, dir: '东北', biome: 'farm',   lv: 4, boss: 'harvest_warden',
        zh_desc: '供养群岛的粮仓，田野间潜伏着敌人。' },
      { id: 'maze',      zh: '黑暗迷宫', en: 'Dark Maze',   cx: 1300, cy: 800,  dir: '东北-北', biome: 'maze',   lv: 5, boss: 'maze_lord',
        zh_desc: '终年黑暗的地下迷宫，唯有火光可照前路。' },
      { id: 'armory',    zh: '西北兵工厂', en: 'Armory',    cx: 700,  cy: 700,  dir: '西北', biome: 'rock',   lv: 6, boss: 'forge_guardian',
        zh_desc: '军团锻造兵器之地，熔炉仍未熄灭。' },
      { id: 'snow',      zh: '绝壁雪山', en: 'Snow Peak',   cx: 500,  cy: 1200, dir: '中西-西', biome: 'snow',   lv: 7, boss: 'frost_general',
        zh_desc: '风雪封锁的绝壁，山巅驻扎着军团精锐。' },
      { id: 'bridge',    zh: '跨海大桥', en: 'Sea Bridge',  cx: 350,  cy: 1500, dir: '西', biome: 'coast',  lv: 8, boss: 'bridge_tyrant',
        zh_desc: '连接东西的宏伟石桥，桥头堡重兵把守。' },
      { id: 'isle',      zh: '骷髅岛',   en: 'Skeleton Isle', cx: 1000, cy: 1100, dir: '中', biome: 'rock',  lv: 9, boss: 'isle_bones',
        zh_desc: '岛屿中央的不祥之地，白骨堆砌成山。' },
      { id: 'castle',    zh: '黑暗城堡', en: 'Dark Castle', cx: 650,  cy: 1700, dir: '西南', biome: 'castle', lv: 10, boss: 'dark_lord',
        zh_desc: '黑暗势力的巢穴，城墙之后即是深渊。' },
      { id: 'final',     zh: '终末之战', en: 'Final War',   cx: 1150, cy: 1800, dir: '南', biome: 'void',   lv: 10, boss: 'rift_lord',
        zh_desc: '裂隙洞开之处，一切的终点与新的开始。' },
    ],

    /* ---------- 世界观背景（Q61：采用起草背景，融入任务对话） ---------- */
    LORE: {
      zh: '群岛曾由七个古老国度共享和平。某日，黑暗裂隙在群岛南方洞开，一支受黑暗驱使的人类军团自裂隙涌出——它们行动迟缓却如军阵般推进，用重甲与攻城器械碾碎了南部诸国。幸存者退守东南方最后的营地。你是营地中新登记的冒险者，从解放营地开始，逐一击破军团据点，最终在南端终末之战关闭裂隙。',
      en: 'The isles once knew peace across seven ancient kingdoms. Then a dark rift tore open in the south, and a human legion driven by darkness poured forth — slow yet relentless, grinding the southern realms beneath iron and siege engines. Survivors fell back to the last camp in the southeast. You are its newest registered adventurer: liberate the camp, break the legion hold by hold, and close the rift at the Final War.',
    },

    /* ---------- 其它系统常量 ---------- */
    MAX_LEVEL: 10,          // Q31：人物/武器/装备/敌人 全部1-10封顶
    SILVER_DROP_PENALTY: 0.10, // Q66：死亡掉10%银币
    DOWN_RESCUE_SEC: 15,    // Q66：倒地15秒可救
    REGEN_HP_PER_S: 0.02,   // Q41补充：自动回血（每秒回复最大生命2%）
    POTION_MAX: 3,          // Q62：限量药水3瓶，精英补充
    POTION_HEAL: 0.35,      // 药水回复35%生命
    BLOCK_REDUCE: 0.5, BLOCK_SEC: 2, BLOCK_CD: 3, // Q23：格挡减伤50%/持续2s/冷却3s
    ENEMY_DMG_MULT: 0.1,   // 数值调整：敌人伤害为原来的10%（近战/弹道/范围技统一入口 takeDamage 应用；格挡/闪避在其之后结算）
    PLAYER_RANGE_MULT: 2,  // 数值调整：玩家攻击范围扩大1倍（calcStats 归一化时乘算，近战/远程/魔法一致生效）
    BAG_SIZE: 40,           // Q56：40格背包，无负重
    ENHANCE_PER_LV: 0.05,   // Q35：银币强化每级+5%基础
    AGGRO_RANGE: 5,         // Q74：缓慢型警戒5格
    RESPAWN_REGION: 'camp', // 死亡回营地

    /* ---------- 掉落品质抽取（Q34：难度加成作用于概率权重） ----------
       返回对应品质表中的一项；extra为任务/宝箱等场景可传入提升系数 */
    dropQuality(table, difficulty, bonusP) {
      const dropMul = this.DIFFICULTY.drop(difficulty);
      let r = Math.random(), acc = 0, picked = table[0];
      for (const q of table) {
        // 高品质概率按难度加成放大（放大后再归一化由累积逻辑自然处理）
        acc += q.p * (q.id === table[0].id ? 1 : dropMul) * (bonusP || 1);
        if (r <= acc) { picked = q; break; }
      }
      return picked;
    },

    /* ---------- 敌人属性（文档：敌人武器装备=玩家30%，Q36无羁绊） ----------
       base 为该类型基础值，乘以难度倍率（Q75：难度不改移速） */
    enemyStat(type, difficulty, regionLv) {
      const scale = this.DIFFICULTY.scale(difficulty);
      const lvMul = 1 + 0.15 * (regionLv - 1); // 区域等级成长
      return {
        hp: Math.round(type.hp * scale * lvMul),
        dmg: Math.round(type.dmg * scale * lvMul),
        speed: type.speed,          // 难度不影响移速
        range: type.range, aspd: type.aspd, aggro: type.aggro,
      };
    },

    /* ---------- 银币/经验（文档公式：敌等级×10×r×难度系数，Q32经验同式） ----------
       r: 普通30% / 精英200% / BOSS400% */
    silverExp(enemyLv, kind, difficulty, expMul) {
      const r = kind === 'boss' ? 4 : kind === 'elite' ? 2 : 0.3;
      const base = enemyLv * 10 * r * this.DIFFICULTY.currency(difficulty);
      return { silver: Math.round(base), exp: Math.round(base * (expMul || 1)) };
    },

    /* ---------- 坐标->区域（用于区域归属与传送判定） ---------- */
    regionAt(x, y) {
      let best = null, bd = Infinity;
      for (const rg of this.REGIONS) {
        const d = (x - rg.cx) ** 2 + (y - rg.cy) ** 2;
        if (d < bd) { bd = d; best = rg; }
      }
      return best;
    },
  };

  LG.Config = Config;
})();
