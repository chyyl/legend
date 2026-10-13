/* =============================================================================
 * 文件：js/data/config.js
 * 职责：全局数值配置中心。存放 11 个地图区域、武器/装备品质、羁绊类型、
 *       7 种武器、4 类装备部位、敌人模板、难度系数等所有“数据表”。
 *       本文件是纯数据 + 少量查询函数，不依赖任何其他文件。
 * 依赖：无（最底层数据文件）
 * 对外接口（window.Legend.Config）：
 *   - MAP_SIZE / TILE            地图尺寸（格）与每格像素
 *   - REGIONS                    区域定义数组
 *   - WEAPONS / ARMORS           武器与装备基础表
 *   - WEAPON_QUALITIES / ARMOR_QUALITIES  品质概率表
 *   - BONDS                      羁绊类型表
 *   - ENEMY_TEMPLATES            敌人模板
 *   - DIFFICULTY                 难度系数预设
 *   - getRegionAt(x, y)          根据坐标取所属区域
 *   - levelScale(lv)             等级(1-10)属性倍率
 * 被引用：terrain.js / worldmap.js / loot.js / combat.js / enemy.js / game.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};

  /* ---------------- 基础常量 ---------------- */
  var Config = {
    // 大陆总尺寸：2000×2000 格（要求：地图其实是一个大陆，2000×2000）
    MAP_SIZE: 2000,
    TILE: 32,               // 每格像素（渲染时按缩放倍率放大，形成像素风）
    PLAYER_MAX_LEVEL: 10,   // 人物/敌人/装备/武器等级上限 1-10
    DEFAULT_DIFFICULTY: 0.9,// 默认难度系数 0.9
    MAX_PARTY: 4,           // 联机大厅人数上限 1-4 人
    START_POS: { x: 1400, y: 1400 } // 出生点：营地（东南）
  };

  /* ---------------- 地图区域（要求：11 个区域 + 方位） ----------------
   * theme 决定该区域可生成的地形类型；tier 决定敌人强度梯度。
   * liberated: 营地首次需要解放（要求：这个地方第一次需要解放，有NPC）
   * ------------------------------------------------------------------ */
  Config.REGIONS = [
    {
      id: 'camp', name: '营地', dir: '东南', cx: 1400, cy: 1400, r: 130, tier: 0,
      theme: ['grass', 'dirt', 'flower'], liberated: false, safe: true,
      desc: '东南方的初始营地，需要先解放它。这里有 NPC 可以接取任务。'
    },
    {
      id: 'wall', name: '边境长城', dir: '东南-东', cx: 1560, cy: 1150, r: 115, tier: 3,
      theme: ['grass', 'rock', 'dirt'], desc: '横亘东南与东方之间的雄伟长城。'
    },
    {
      id: 'bay', name: '海湾小镇', dir: '东', cx: 1720, cy: 1000, r: 130, tier: 1,
      theme: ['sand', 'grass', 'water'], desc: '东方的海滨小镇，海风咸涩。'
    },
    {
      id: 'farm', name: '彬祥农业园', dir: '东北', cx: 1500, cy: 620, r: 130, tier: 2,
      theme: ['farmland', 'grass', 'dirt'], desc: '东北方的广袤农田，如今荒废。'
    },
    {
      id: 'maze', name: '黑暗迷宫', dir: '东北-北', cx: 1250, cy: 360, r: 130, tier: 8,
      theme: ['darkstone', 'rock'], desc: '北方终年不散的黑暗迷宫。'
    },
    {
      id: 'armory', name: '西北兵工厂', dir: '西北', cx: 520, cy: 520, r: 145, tier: 6,
      theme: ['rock', 'dirt', 'darkstone'], desc: '西北方的兵工厂，机关与守卫密布。'
    },
    {
      id: 'snow', name: '绝壁雪山', dir: '中西-西', cx: 700, cy: 1000, r: 160, tier: 5,
      theme: ['snow', 'rock'], desc: '中西部的绝壁雪山，寒风刺骨。'
    },
    {
      id: 'bridge', name: '跨海大桥', dir: '西', cx: 300, cy: 1000, r: 140, tier: 4,
      theme: ['water', 'bridge', 'sand'], desc: '横跨西面大海的长桥。'
    },
    {
      id: 'island', name: '骷髅岛', dir: '中', cx: 1000, cy: 1000, r: 135, tier: 7,
      theme: ['bone', 'sand', 'water'], desc: '大陆中央的死亡之岛。'
    },
    {
      id: 'castle', name: '黑暗城堡', dir: '西南', cx: 520, cy: 1500, r: 140, tier: 9,
      theme: ['darkstone', 'rock'], desc: '西南方的黑暗城堡，阴影盘踞。'
    },
    {
      id: 'final', name: '终末之战', dir: '南', cx: 1000, cy: 1660, r: 160, tier: 10,
      theme: ['lava', 'darkstone', 'rock'], desc: '南方的终末之地，决战之所。'
    },
    {
      // 中央与缝隙区域（未指定区域时的过渡地形，保证大陆连贯）
      id: 'wild', name: '中央荒野', dir: '中', cx: 1000, cy: 1000, r: 0, tier: 2,
      theme: ['grass', 'dirt', 'rock', 'sand'], desc: '连接各区域的中央荒野。'
    }
  ];

  /** 根据世界坐标返回所属区域（不含 wild，用于地表主题与刷怪） */
  Config.getRegionAt = function (x, y) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < Config.REGIONS.length; i++) {
      var rg = Config.REGIONS[i];
      if (rg.id === 'wild') continue;
      var dx = x - rg.cx, dy = y - rg.cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= rg.r && d < bestD) { best = rg; bestD = d; }
    }
    return best || Config.REGIONS[Config.REGIONS.length - 1];
  };

  /* ---------------- 等级倍率（1-10） ---------------- */
  Config.levelScale = function (lv) {
    lv = Math.max(1, Math.min(Config.PLAYER_MAX_LEVEL, lv | 0));
    return 1 + (lv - 1) * 0.22; // 10 级时约为 3.0 倍
  };

  /* ---------------- 武器品质（要求表：N/R/SR/SSR） ----------------
   * prob 为刷新概率；dmg/aspd/range 为加成；bonds 为羁绊个数区间。
   * SSR 行原文出现两次攻速，这里合并为 aspd + extraAspd 叠加生效。
   * ------------------------------------------------------------------ */
  Config.WEAPON_QUALITIES = [
    { id: 'N',   name: '普通', prob: 0.800, dmg: 0.00, aspd: [0, 0],     range: [0, 0],     extraAspd: [0, 0],     bonds: [0, 0], color: '#c8c8c8' },
    { id: 'R',   name: '稀有', prob: 0.150, dmg: 0.30, aspd: [0, 0],     range: [0, 0],     extraAspd: [0, 0],     bonds: [1, 2], color: '#4da6ff' },
    { id: 'SR',  name: '史诗', prob: 0.035, dmg: 0.50, aspd: [0.10, 0.30], range: [0.20, 0.20], extraAspd: [0, 0],  bonds: [2, 3], color: '#b266ff' },
    { id: 'SSR', name: '传说', prob: 0.015, dmg: 0.65, aspd: [0.20, 0.50], range: [0.20, 0.35], extraAspd: [0.25, 0.50], bonds: [2, 4], color: '#ff9a3d' }
  ];

  /* ---------------- 装备品质（要求表：D/C/B/A/S/SS） ----------------
   * def 为防御倍率（以“减伤百分比”形式生效），move 移速，dmg 伤害，dodge 闪避。
   * ------------------------------------------------------------------ */
  Config.ARMOR_QUALITIES = [
    { id: 'D',  name: '普通', prob: 0.500, def: [0, 0],         move: [0, 0],        dmg: [0, 0],        dodge: [0, 0],        bonds: [0, 0], color: '#c8c8c8' },
    { id: 'C',  name: '精良', prob: 0.250, def: [0.10, 0.20],   move: [0, 0],        dmg: [0, 0],        dodge: [0, 0],        bonds: [0, 0], color: '#66cc66' },
    { id: 'B',  name: '稀有', prob: 0.150, def: [0.20, 0.30],   move: [0.10, 0.20],  dmg: [0, 0],        dodge: [0, 0],        bonds: [1, 1], color: '#4da6ff' },
    { id: 'A',  name: '史诗', prob: 0.060, def: [0.20, 0.35],   move: [0.10, 0.25],  dmg: [0.10, 0.25],  dodge: [0, 0],        bonds: [1, 2], color: '#b266ff' },
    { id: 'S',  name: '传说', prob: 0.030, def: [0.30, 0.40],   move: [0.10, 0.30],  dmg: [0.20, 0.30],  dodge: [0.20, 0.30],  bonds: [2, 3], color: '#ff9a3d' },
    { id: 'SS', name: '神话', prob: 0.010, def: [0.35, 0.50],   move: [0.10, 0.40],  dmg: [0.30, 0.55],  dodge: [0.25, 0.40],  bonds: [2, 4], color: '#ff4d4d' }
  ];

  /* ---------------- 羁绊（要求：天生自带的技能属性，类似附魔） ----------------
   * apply(ctx) 由 combat.js 调用；ctx 至少包含 stats（累加器）与 chance（几率类）。
   * ------------------------------------------------------------------ */
  Config.BONDS = [
    { id: 'sharp',   name: '锋利',     desc: '伤害+30%',            kind: 'stat', apply: function (s) { s.dmg += 0.30; } },
    { id: 'sweep',   name: '横扫之刃', desc: '攻击范围+40%',        kind: 'stat', apply: function (s) { s.range += 0.40; } },
    { id: 'exp',     name: '经验获取', desc: '经验获取+50%',        kind: 'stat', apply: function (s) { s.exp += 0.50; } },
    { id: 'power',   name: '力量',     desc: '伤害+15%，攻速+15%',  kind: 'stat', apply: function (s) { s.dmg += 0.15; s.aspd += 0.15; } },
    { id: 'crit3',   name: '三倍暴击', desc: '三倍暴击概率+8%',     kind: 'chance', apply: function (s) { s.crit3 += 0.08; } },
    { id: 'guard',   name: '保护',     desc: '防御力+30%',          kind: 'stat', apply: function (s) { s.def += 0.30; } },
    { id: 'leech',   name: '吸血',     desc: '攻击敌人时，可以吸收5%血量', kind: 'chance', apply: function (s) { s.lifesteal += 0.05; } },
    { id: 'undead',  name: '不死金牌', desc: '遇到必亡伤害进入无敌模式，持续5秒，冷却60秒', kind: 'passive', apply: function (s) { s.undead = true; } }
  ];

  Config.getBond = function (id) {
    for (var i = 0; i < Config.BONDS.length; i++) if (Config.BONDS[i].id === id) return Config.BONDS[i];
    return null;
  };

  /* ---------------- 武器（要求：铁刃/骑士剑/镰刀/弓/弩/法杖/盾） ----------------
   * kind: melee 近战 | ranged 远程 | magic 法术 | shield 盾（可降低伤害）
   * dmg 基础伤害，aspd 每秒攻击次数，range 攻击距离（格），block 盾的减伤
   * ------------------------------------------------------------------ */
  Config.WEAPONS = [
    { id: 'iron_sword', name: '铁刃',   kind: 'melee',  dmg: 11, aspd: 1.05, range: 1.25, block: 0,    pierce: false, aoe: false },
    { id: 'knight_sword', name: '骑士剑', kind: 'melee', dmg: 15, aspd: 0.85, range: 1.35, block: 0,   pierce: false, aoe: false },
    { id: 'scythe',     name: '镰刀',   kind: 'melee',  dmg: 9,  aspd: 1.25, range: 1.70, block: 0,    pierce: false, aoe: true },
    { id: 'bow',        name: '弓',     kind: 'ranged', dmg: 12, aspd: 0.95, range: 6.5,  block: 0,    pierce: false, aoe: false },
    { id: 'crossbow',   name: '弩',     kind: 'ranged', dmg: 19, aspd: 0.60, range: 7.5,  block: 0,    pierce: true,  aoe: false },
    { id: 'staff',      name: '法杖',   kind: 'magic',  dmg: 15, aspd: 0.80, range: 5.5,  block: 0,    pierce: false, aoe: true },
    { id: 'shield',     name: '盾',     kind: 'shield', dmg: 6,  aspd: 0.70, range: 1.05, block: 0.30, pierce: false, aoe: false }
  ];
  Config.getWeapon = function (id) {
    for (var i = 0; i < Config.WEAPONS.length; i++) if (Config.WEAPONS[i].id === id) return Config.WEAPONS[i];
    return Config.WEAPONS[0];
  };

  /* ---------------- 装备部位（要求：头盔、护甲、护腿、鞋） ---------------- */
  Config.ARMORS = [
    { id: 'helmet',  name: '头盔', def: 6,  hp: 10,  move: 0 },
    { id: 'chest',   name: '护甲', def: 12, hp: 25,  move: 0 },
    { id: 'legging', name: '护腿', def: 8,  hp: 12,  move: 0.02 },
    { id: 'boots',   name: '鞋',   def: 5,  hp: 5,   move: 0.08 }
  ];
  Config.getArmor = function (id) {
    for (var i = 0; i < Config.ARMORS.length; i++) if (Config.ARMORS[i].id === id) return Config.ARMORS[i];
    return Config.ARMORS[0];
  };

  /* ---------------- 难度系数（要求：0-2，默认 0.9） ----------------
   * 直接作为敌人生命/伤害以及经验银币掉落的乘数。
   * ------------------------------------------------------------------ */
  Config.DIFFICULTY = {
    MIN: 0, MAX: 2, DEFAULT: 0.9,
    PRESETS: [
      { name: '休闲', value: 0.4 },
      { name: '普通', value: 0.9 },
      { name: '困难', value: 1.4 },
      { name: '地狱', value: 2.0 }
    ]
  };

  /* ---------------- 敌人模板 ----------------
   * hp/dmg 为基准值（再乘难度系数与区域 tier 倍率）
   * elite/boss 的生命与伤害浮动按要求表实现于 enemy.js
   * ------------------------------------------------------------------ */
  Config.ENEMY_TEMPLATES = {
    slime:   { id: 'slime',   name: '史莱姆',   hp: 24,  dmg: 5,  speed: 1.5, size: 0.8, color: '#5fd35f', ranged: false },
    zombie:  { id: 'zombie',  name: '腐尸',     hp: 30,  dmg: 7,  speed: 1.6, size: 0.9, color: '#6f8f5f', ranged: false },
    skeleton:{ id: 'skeleton',name: '骷髅兵',   hp: 26,  dmg: 8,  speed: 1.9, size: 0.9, color: '#e8e8d8', ranged: false },
    archer:  { id: 'archer',  name: '弓箭手',   hp: 22,  dmg: 9,  speed: 1.7, size: 0.9, color: '#d8b46a', ranged: true,  range: 5.5 },
    spider:  { id: 'spider',  name: '巨蛛',     hp: 28,  dmg: 9,  speed: 2.4, size: 0.85, color: '#4a3b57', ranged: false },
    golem:   { id: 'golem',   name: '石傀儡',   hp: 55,  dmg: 12, speed: 1.1, size: 1.15, color: '#8a8a8a', ranged: false },
    yeti:    { id: 'yeti',    name: '雪人',     hp: 50,  dmg: 11, speed: 1.5, size: 1.1, color: '#dfeaf5', ranged: false },
    illusion:{ id: 'illusion',name: '幻影',     hp: 34,  dmg: 12, speed: 2.2, size: 0.9, color: '#7a5fb0', ranged: true,  range: 6.0 },
    knight:  { id: 'knight',  name: '黑暗骑士', hp: 46,  dmg: 13, speed: 1.8, size: 1.0, color: '#3a3a4a', ranged: false },
    boss_castle: { id: 'boss_castle', name: '城堡领主', hp: 90, dmg: 16, speed: 1.6, size: 1.4, color: '#6a2f8f', ranged: false },
    boss_final:  { id: 'boss_final',  name: '终末之王', hp: 120, dmg: 20, speed: 1.9, size: 1.6, color: '#c03030', ranged: true, range: 6.5 }
  };

  /* ---------------- 各区域敌人池 ---------------- */
  Config.REGION_ENEMIES = {
    camp:    [],                                  // 营地安全区
    bay:     ['slime', 'zombie'],
    farm:    ['zombie', 'spider'],
    wall:    ['skeleton', 'archer'],
    bridge:  ['spider', 'archer'],
    snow:    ['yeti', 'skeleton'],
    armory:  ['golem', 'knight'],
    island:  ['skeleton', 'spider', 'archer'],
    maze:    ['illusion', 'spider'],
    castle:  ['knight', 'illusion', 'golem'],
    final:   ['knight', 'illusion', 'golem'],
    wild:    ['slime', 'zombie', 'spider']
  };

  /* ---------------- 各区域 BOSS（区域被解放前的守关者） ---------------- */
  Config.REGION_BOSS = {
    maze: 'illusion', castle: 'boss_castle', final: 'boss_final',
    island: 'skeleton', armory: 'golem', snow: 'yeti', wall: 'skeleton'
  };

  /* ---------------- 经济（要求：击杀获得 敌人等级×10×r×难度系数） ----------------
   * r：普通敌人 30%，精英怪 200%，BOSS 400%
   * ------------------------------------------------------------------ */
  Config.KILL_R = { normal: 0.30, elite: 2.00, boss: 4.00 };
  Config.expForLevel = function (lv) { return Math.round(60 * Math.pow(1.55, lv - 1)); }; // 升到下一级所需经验

  /* ---------------- 宝箱（要求：随处都有，可以开出好东西） ---------------- */
  Config.CHEST = {
    COMMON_CHANCE: 0.55,   // 普通宝箱出现概率（相对密度）
    RARE_CHANCE: 0.12,     // 华丽宝箱出现概率
    BASE_ITEMS: 1, RARE_ITEMS: 2
  };

  /* ---------------- 地形可通行性表 ---------------- */
  Config.WALKABLE = {
    water: false, lava: false, rock: true,      // rock 视为山体表面装饰，但 rock_high 不可走
    grass: true, dirt: true, sand: true, snow: true, farmland: true,
    bone: true, darkstone: true, bridge: true, flower: true, rock_high: false, wall: false
  };

  L.Config = Config;
})(window);
