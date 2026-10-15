/* ============================================================================
   js/core/config.js —— LEGEND 全局配置与数值表（单一可信源）
   ----------------------------------------------------------------------------
   职责：集中存放所有数值、公式、区域坐标、品质/羁绊/难度表。
         其它模块只读取 LG.Config，不得各自硬编码数值。

   对外接口（window.LG.Config）：
     .TILE .WORLD .REGIONS .WEAPONS .ARMOR_SLOTS .QUALITY_W .QUALITY_A
     .BONDS .DIFFICULTY .WORLD_LEVEL .worldLevel() .ENEMY_TYPES .CHAR_NAMES .EXP公式 .dropQuality() .enemyStat()
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

    /* ---------- 世界最高等级（清单111：默认自动=玩家等级，可在设置更新；115：爆率与难度+世界等级有关） ----------
       运行时状态：auto=true 时跟随玩家等级；手动档由设置页读写（LS 'worldLv' 持久化，ui.init 载入）。
       消费方：敌人/宝箱奖励等级（combat/engine）、掉落物品等级（loot）、爆率加成（dropQuality） */
    WORLD_LEVEL: { auto: true, val: 1 },
    worldLevel() {
      const w = this.WORLD_LEVEL;
      if (w.auto) return Math.min(this.MAX_LEVEL, Math.max(1, (LG.Player && LG.Player.level) || 1));
      return Math.min(this.MAX_LEVEL, Math.max(1, Math.round(w.val) || 1));
    },

    /* ---------- 武器品质（文档表 + Q28修正SSR第4项=暴击） ---------- */
    QUALITY_W: [
      // id: 品质, mul: 伤害倍率, aspd/range/crit: [min,max]区间随机(Q27), bonds: 羁绊数, p: 概率
      // 阶段二十三清单概率上调：N50% / R25% / SR15% / SSR10%（旧 80/15/3.5/1.5）
      { id: 'N',   mul: 1.00, aspd: null,        range: null,        crit: null,        bonds: [0, 0], p: 0.50 },
      { id: 'R',   mul: 1.30, aspd: null,        range: null,        crit: null,        bonds: [1, 2], p: 0.25 },
      { id: 'SR',  mul: 1.50, aspd: [0.10, 0.30], range: [0.20, 0.20], crit: null,        bonds: [2, 3], p: 0.15 },
      { id: 'SSR', mul: 1.65, aspd: [0.20, 0.50], range: [0.20, 0.35], crit: [0.25, 0.50], bonds: [2, 4], p: 0.10 },
    ],

    /* ---------- 装备品质（文档表，D~SS 六档；阶段二十三清单：D 档防御+5%-15%、概率 40/25/15/10/5/5） ---------- */
    QUALITY_A: [
      { id: 'D',  def: [0.05, 0.15], spd: null,      dmg: null,        dodge: null,       bonds: [0, 0], p: 0.40 },
      { id: 'C',  def: [0.10, 0.20], spd: null,      dmg: null,        dodge: null,       bonds: [0, 0], p: 0.25 },
      { id: 'B',  def: [0.20, 0.30], spd: [0.10, 0.20], dmg: null,     dodge: null,       bonds: [1, 1], p: 0.15 },
      { id: 'A',  def: [0.20, 0.35], spd: [0.10, 0.25], dmg: [0.10, 0.25], dodge: null,  bonds: [1, 2], p: 0.10 },
      { id: 'S',  def: [0.30, 0.40], spd: [0.10, 0.30], dmg: [0.20, 0.30], dodge: [0.20, 0.30], bonds: [2, 3], p: 0.05 },
      { id: 'SS', def: [0.35, 0.50], spd: [0.10, 0.40], dmg: [0.30, 0.55], dodge: [0.25, 0.40], bonds: [2, 4], p: 0.05 },
    ],

    /* ---------- 武器列表（文档表）：kind=melee/ranged/magic/shield ----------
       阶段二十三清单"武器（攻击范围大一点50%）"：全部基础射程 ×1.5（1.6→2.4 / 2.55 / 3.3，弓7→10.5，弩8→12，杖6→9） */
    WEAPONS: [
      { id: 'iron_sword', kind: 'melee',  zh: '铁刃',   en: 'Iron Blade',   base: 10, range: 2.4, aspd: 1.0, arc: 100, color: '#c9d1d9' },
      { id: 'knight_sword', kind: 'melee', zh: '骑士剑', en: 'Knight Sword', base: 14, range: 2.55, aspd: 0.85, arc: 90, color: '#e3c567' },
      { id: 'scythe',    kind: 'melee',  zh: '镰刀',   en: 'Scythe',       base: 12, range: 3.3, aspd: 0.9, arc: 150, color: '#8fbf9f' },
      { id: 'bow',       kind: 'ranged', zh: '弓',     en: 'Bow',          base: 11, range: 10.5, aspd: 1.0, proj: 11, color: '#b5895a' },
      { id: 'crossbow',  kind: 'ranged', zh: '弩',     en: 'Crossbow',     base: 15, range: 12, aspd: 0.7, proj: 13, color: '#7f8c9a' },
      { id: 'staff',     kind: 'magic',  zh: '法杖',   en: 'Staff',        base: 13, range: 9, aspd: 0.8, aoe: 1.8, color: '#9b7fd4' },
      { id: 'shield',    kind: 'shield', zh: '盾',     en: 'Shield',       base: 0,  range: 0,   aspd: 1.0, color: '#6b7280' },
    ],

    /* ---------- 武器前缀词池（阶段二十反馈"每个武器都有前缀名字"）----------
       loot.rollWeapon 生成武器时随机抽一个，展示为「前缀·基础名」（如：血噬·骑士剑）。
       纯原创中文词 + 对应英文；存档序列化安全（纯数据对象）。 */
    WEAPON_PREFIXES: [
      { zh: '残暴', en: 'Savage' },    { zh: '苍狼', en: 'Grey Wolf' },
      { zh: '血噬', en: 'Bloodrend' }, { zh: '黯影', en: 'Dusk' },
      { zh: '雷霆', en: 'Thunder' },   { zh: '冰棘', en: 'Frostbarb' },
      { zh: '焚日', en: 'Sunbrand' },  { zh: '荆棘', en: 'Bramble' },
      { zh: '破晓', en: 'Daybreak' },  { zh: '流浪', en: 'Wandering' },
      { zh: '王国', en: 'Royal' },     { zh: '禁断', en: 'Forbidden' },
      { zh: '碎星', en: 'Starfall' },  { zh: '古墓', en: 'Ancient' },
      { zh: '铁壁', en: 'Ironwall' },  { zh: '猎风', en: 'Windhunt' },
    ],

    /* ---------- 角色随机名池（清单114"支持自定义角色（自动随机名称）"）----------
       charCreate 打开时自动填入随机名，「随机」按钮可重掷；纯数据、存档安全 */
    CHAR_NAMES: {
      zh: ['艾伦', '凯恩', '莉娅', '希尔', '罗兰', '薇拉', '加雷斯', '塞西尔', '奥利弗', '玛琳',
           '兰斯', '伊索德', '鲍里斯', '艾薇拉', '德里克', '露娜', '霍克', '赛琳', '格温', '奥斯汀'],
      en: ['Alden', 'Kane', 'Lia', 'Sylar', 'Rowan', 'Vera', 'Gareth', 'Cecil', 'Oliver', 'Marlen',
           'Lance', 'Isolde', 'Boris', 'Ivella', 'Derek', 'Luna', 'Hawk', 'Celine', 'Gwen', 'Austin'],
    },

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
       难度不改移速（Q75）。阶段二十三起 hp/dmg 不再参与出生推导（生命/伤害=
       玩家10% 基数 ×难度×精英档，见 enemyStat）——本表 hp/dmg 仅作联机快照
       客户端重建的回退值；专属兵种池见 REGIONS.etypes（清单109） */
    ENEMY_TYPES: [
      { id: 'soldier',  zh: '军团士兵', en: 'Legion Soldier', move: 'slow',  hp: 60,  dmg: 8,  range: 1.8, aspd: 0.8, speed: 0.9, aggro: 5,  color: '#8a4b3c', elite: false },
      { id: 'archer',   zh: '军团弩手', en: 'Legion Archer',  move: 'fixed', hp: 45,  dmg: 10, range: 8.0, aspd: 0.7, speed: 0,   aggro: 8,  color: '#6b6b3c', elite: false, proj: 10 },
      { id: 'mage',     zh: '军团术士', en: 'Legion Mage',    move: 'fixed', hp: 50,  dmg: 14, range: 7.0, aspd: 0.5, speed: 0,   aggro: 7,  color: '#4b3c6b', elite: false, aoe: 1.6, proj: 9 },
      { id: 'captain',  zh: '军团队长', en: 'Legion Captain', move: 'slow',  hp: 150, dmg: 16, range: 2.2, aspd: 1.0, speed: 1.1, aggro: 6,  color: '#b3452e', elite: true },
      { id: 'war_mage', zh: '战争法师', en: 'War Mage',       move: 'fixed', hp: 130, dmg: 20, range: 9.0, aspd: 0.6, speed: 0,   aggro: 9,  color: '#7a2f5c', elite: true, aoe: 2.2, proj: 11 },
    ],

    /* ---------- 区域（文档表10区域 + Q16数百格） ----------
       cx/cy 为 2000×2000 世界中的中心格；dir 仅作方位注释 */
    // 数组顺序 = 等级推进顺序；terrain.buildRoads 按此把相邻区域串成主干道
    // （阶段二十三清单"路线类似一个不闭合的圈"：末段终末之战→营地不修，留开口）
    // etypes = 区域专属兵种池（清单109，用户确认映射）；缺省/空 = 全兵种混编
    REGIONS: [
      { id: 'camp',      zh: '营地',     en: 'Camp',        cx: 1500, cy: 1500, dir: '东南', biome: 'plain',  lv: 1, boss: null,
        zh_desc: '东南方最后的避难所，第一次需要解放，众多NPC聚集于此。' },
      { id: 'wall',      zh: '边境长城', en: 'Border Wall', cx: 1620, cy: 1250, dir: '东南-东', biome: 'plain',  lv: 2, boss: 'wall_warden',
        etypes: ['soldier', 'archer', 'captain'],
        zh_desc: '抵御黑暗军团的古老长城，如今已被渗透。' },
      { id: 'bay',       zh: '海湾小镇', en: 'Bay Town',    cx: 1750, cy: 1500, dir: '东', biome: 'coast',  lv: 3, boss: 'bay_captain',
        etypes: ['soldier', 'archer'],
        zh_desc: '靠海的贸易小镇，港口被军团占领。' },
      { id: 'farm',      zh: '彬祥农业园', en: 'Farmland',   cx: 1500, cy: 1050, dir: '东北', biome: 'farm',   lv: 4, boss: 'harvest_warden',
        etypes: ['soldier', 'archer'],
        zh_desc: '供养群岛的粮仓，田野间潜伏着敌人。' },
      { id: 'maze',      zh: '黑暗迷宫', en: 'Dark Maze',   cx: 1300, cy: 800,  dir: '东北-北', biome: 'maze',   lv: 5, boss: 'maze_lord',
        etypes: ['mage', 'war_mage'],
        zh_desc: '终年黑暗的地下迷宫，唯有火光可照前路。' },
      { id: 'armory',    zh: '西北兵工厂', en: 'Armory',    cx: 700,  cy: 700,  dir: '西北', biome: 'rock',   lv: 6, boss: 'forge_guardian',
        etypes: ['archer', 'mage', 'war_mage'],
        zh_desc: '军团锻造兵器之地，熔炉仍未熄灭。' },
      { id: 'snow',      zh: '绝壁雪山', en: 'Snow Peak',   cx: 500,  cy: 1200, dir: '中西-西', biome: 'snow',   lv: 7, boss: 'frost_general',
        etypes: ['soldier', 'captain'],
        zh_desc: '风雪封锁的绝壁，山巅驻扎着军团精锐。' },
      { id: 'bridge',    zh: '跨海大桥', en: 'Sea Bridge',  cx: 350,  cy: 1500, dir: '西', biome: 'coast',  lv: 8, boss: 'bridge_tyrant',
        etypes: ['archer', 'captain'],
        zh_desc: '连接东西的宏伟石桥，桥头堡重兵把守。' },
      { id: 'isle',      zh: '骷髅岛',   en: 'Skeleton Isle', cx: 1000, cy: 1100, dir: '中', biome: 'rock',  lv: 9, boss: 'isle_bones',
        etypes: ['soldier', 'mage', 'captain'],
        zh_desc: '岛屿中央的不祥之地，白骨堆砌成山。' },
      { id: 'castle',    zh: '黑暗城堡', en: 'Dark Castle', cx: 650,  cy: 1700, dir: '西南', biome: 'castle', lv: 10, boss: 'dark_lord',
        etypes: ['captain', 'war_mage'],
        zh_desc: '黑暗势力的巢穴，城墙之后即是深渊。' },
      { id: 'final',     zh: '终末之战', en: 'Final War',   cx: 1150, cy: 1800, dir: '南', biome: 'void',   lv: 10, boss: 'rift_lord',
        etypes: ['soldier', 'archer', 'mage', 'captain', 'war_mage'],
        zh_desc: '裂隙洞开之处，一切的终点与新的开始。' },
    ],

    /* ---------- 世界观背景（Q61：采用起草背景，融入任务对话） ---------- */
    LORE: {
      zh: '群岛曾由七个古老国度共享和平。某日，黑暗裂隙在群岛南方洞开，一支受黑暗驱使的人类军团自裂隙涌出——它们行动迟缓却如军阵般推进，用重甲与攻城器械碾碎了南部诸国。幸存者退守东南方最后的营地。你是营地中新登记的冒险者，从解放营地开始，逐一击破军团据点，最终在南端终末之战关闭裂隙。',
      en: 'The isles once knew peace across seven ancient kingdoms. Then a dark rift tore open in the south, and a human legion driven by darkness poured forth — slow yet relentless, grinding the southern realms beneath iron and siege engines. Survivors fell back to the last camp in the southeast. You are its newest registered adventurer: liberate the camp, break the legion hold by hold, and close the rift at the Final War.',
    },

    /* ---------- 其它系统常量 ---------- */
    MAX_LEVEL: 99,          // 清单阶段二十三：人物/武器/装备/敌人 全部1-99（Q31 旧值1-10）
    SILVER_DROP_PENALTY: 0.10, // Q66：死亡掉10%银币
    DOWN_RESCUE_SEC: 15,    // Q66：倒地15秒可救
    REGEN_HP_PER_S: 0.02,   // Q41补充：自动回血（每秒回复最大生命2%）
    POTION_MAX: 3,          // Q62：限量药水3瓶，精英补充
    POTION_HEAL: 0.35,      // 药水回复35%生命
    BLOCK_REDUCE: 0.5, BLOCK_SEC: 2, BLOCK_CD: 3, // Q23：格挡减伤50%/持续2s/冷却3s
    ENEMY_DMG_MULT: 0.1,   // 数值调整：敌人伤害为原来的10%（近战/弹道/范围技统一入口 takeDamage 应用；格挡/闪避在其之后结算）
    // PLAYER_RANGE_MULT 已退役（阶段十七）：射程改为武器基础值接入——
    // Config.WEAPONS.range（弓7.0/弩8.0/杖6.0/近战1.6~2.2）→ 物品 stats.range → calcStats
    BAG_SIZE: 40,           // Q56：40格背包，无负重
    ENHANCE_PER_LV: 0.05,   // Q35：银币强化每级+5%基础
    AGGRO_RANGE: 5,         // Q74：缓慢型警戒5格
    RESPAWN_REGION: 'camp', // 死亡回营地

    /* ---------- 掉落品质抽取（Q34：难度加成作用于概率权重） ----------
       返回对应品质表中的一项；extra为任务/宝箱等场景可传入提升系数
       阶段二十三清单115：爆率提高与难度系数（dropMul）和世界最高等级（wMul）都有关 */
    dropQuality(table, difficulty, bonusP) {
      const dropMul = this.DIFFICULTY.drop(difficulty);
      const wMul = 1 + 0.015 * (this.worldLevel() - 1); // 世界99级时 R+ 权重≈2.47×
      // 阶段二十三修复（真 Bug）：旧实现"累加 q.p×系数、r≤acc 即取"不做权重归一——
      // 品质表 p 和=1 时第 2 项（R×系数）就会把 acc 推过 1.0，SR/SSR 永不可达，
      // 且难度 dropMul/世界 wMul/宝箱 bonusP 对出货率完全无效（只在 R/SR 内部挪概率）。
      // 改为先算总权重再按比例采样：加成真实生效，boss/宝箱 bonusP 也恢复设计语义。
      let total = 0;
      const w = table.map((q) => {
        const x = q.p * (q.id === table[0].id ? 1 : dropMul * wMul) * (bonusP || 1);
        total += x;
        return x;
      });
      let r = Math.random() * total, acc = 0, picked = table[table.length - 1];
      for (let i = 0; i < table.length; i++) {
        acc += w[i];
        if (r <= acc) { picked = table[i]; break; }
      }
      return picked;
    },

    /* ---------- 敌人属性（阶段二十三清单：基础生命=玩家10%、基础伤害=玩家10%） ----------
       签名 enemyStat(type, difficulty, kind, p)：kind='normal'|'elite'|'boss'，
       p={maxHp,dmg} 由调用方传入玩家当前属性（config 不反向依赖 player，接口解耦）。
       公式（清单表）：普通 生命=难度×基础(玩家10%)、伤害=难度×基础(玩家10%)；
       精英 生命×250-400%、伤害+10-30%；BOSS 生命×500-1000%、伤害+15-40%。
       注意：此处 dmg 为 takeDamage 统一入口前值——入口再乘 ENEMY_DMG_MULT=0.1，
       即最终伤害=玩家伤害10%×难度×精英加成（旧"数值调整10%"入口保留，避免双计） */
    enemyStat(type, difficulty, kind, p) {
      const scale = this.DIFFICULTY.scale(difficulty);
      const base = p || { maxHp: 100, dmg: 10 };
      const bHp = base.maxHp * 0.10; // 基础生命 = 玩家最大生命 10%
      let hpMul = 1, dmgAdd = 0;
      if (kind === 'elite') { hpMul = 2.5 + Math.random() * 1.5; dmgAdd = 0.10 + Math.random() * 0.20; }
      else if (kind === 'boss') { hpMul = 5 + Math.random() * 5; dmgAdd = 0.15 + Math.random() * 0.25; }
      return {
        hp: Math.max(1, Math.round(bHp * hpMul * scale)),
        dmg: Math.max(1, Math.round(base.dmg * (1 + dmgAdd) * scale)),
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
