/* =============================================================================
 * 文件：js/world/worldmap.js
 * 职责：大世界状态管理——区域解锁（探索迷雾）、传送点、宝箱分布、
 *       敌人刷新点、营地解放进度。它持有世界级数据，但不直接渲染。
 * 依赖：js/data/config.js、js/world/terrain.js、js/core/utils.js
 * 对外接口（window.Legend.World）：
 *   - generate(seed)                          初始化世界（区域/传送点/宝箱）
 *   - explored                                {regionId: true} 已探索区域
 *   - teleports                               传送点数组 [{id,name,x,y,region}]
 *   - unlockRegionAt(x,y)                     坐标进入某区域时解锁并弹提示
 *   - chests                                  宝箱数组 [{x,y,opened,rare}]
 *   - openChest(chest, rng)                   开启宝箱 -> 返回掉落提示文本
 *   - spawnPointsFor(region)                  该区域刷怪点（含精英/BOSS 点）
 *   - liberated                               已解放区域集合
 *   - liberateRegion(regionId)                解放区域（杀光/杀BOSS后调用）
 *   - minimapData()                           小地图像素数据 {size,cells,colors}
 * 被引用：game.js / ui.js / quest.js / save.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils, Terrain = L.Terrain;

  var World = {
    seed: 20261013,
    explored: {},          // regionId -> true
    liberated: {},         // regionId -> true
    teleports: [],         // [{id,name,x,y,region,unlocked}]
    chests: [],            // [{x,y,opened,rare}]
    spawnCache: {},        // regionId -> [{x,y,type}]
    regionKill: {},        // regionId -> 已击杀数（解放进度）
    regionNeed: {},        // regionId -> 解放所需击杀数
    bossSpawned: {}        // regionId -> true
  };

  /* ---- 生成世界 ---- */
  World.generate = function (seed) {
    World.seed = seed | 0;
    var rng = Utils.makeRng(seed);
    World.explored = {}; World.liberated = {}; World.teleports = [];
    World.chests = []; World.spawnCache = {}; World.regionKill = {}; World.regionNeed = {};
    World.bossSpawned = {};

    for (var i = 0; i < Config.REGIONS.length; i++) {
      var rg = Config.REGIONS[i];
      if (rg.id === 'wild') continue;
      /* 每个区域一个传送点（要求：一般每一个区域都会传送点） */
      var p = Terrain.randomWalkable(rng, rg.cx, rg.cy, 30);
      World.teleports.push({
        id: rg.id, name: rg.name, x: p.x + 0.5, y: p.y + 0.5,
        region: rg.id, unlocked: (rg.id === 'camp')   // 营地默认解锁
      });
      /* 解放条件：击杀一定数量敌人（BOSS 区需击杀 BOSS） */
      World.regionNeed[rg.id] = 6 + rg.tier * 3;
      World.regionKill[rg.id] = 0;
      /* 宝箱：区域内散布（要求：随处都有） */
      var chestN = Math.round(rg.r * 0.10) + 2;
      for (var c = 0; c < chestN; c++) {
        var cp = Terrain.randomWalkable(rng, rg.cx + rng.int(-rg.r, rg.r), rg.cy + rng.int(-rg.r, rg.r), 25);
        if (!Terrain.walkable(cp.x, cp.y)) continue;
        World.chests.push({
          x: cp.x + 0.5, y: cp.y + 0.5,
          opened: false,
          rare: rng.chance(Config.CHEST.RARE_CHANCE),
          region: rg.id
        });
      }
      /* 刷怪点：区域边缘一圈 */
      var pts = [];
      var n = 5 + rg.tier;
      for (var s = 0; s < n; s++) {
        var ang = (s / n) * Math.PI * 2 + rng() * 0.5;
        var rad = rg.r * rng.range(0.35, 0.85);
        var sx = Math.round(rg.cx + Math.cos(ang) * rad);
        var sy = Math.round(rg.cy + Math.sin(ang) * rad);
        var w = Terrain.randomWalkable(rng, sx, sy, 20);
        pts.push({ x: w.x + 0.5, y: w.y + 0.5 });
      }
      World.spawnCache[rg.id] = pts;
    }
    World.explored['camp'] = true;
  };

  /* ---- 区域探索/解锁 ---- */
  World.unlockRegionAt = function (x, y) {
    var rg = Config.getRegionAt(x, y);
    if (rg.id === 'wild') return null;
    if (!World.explored[rg.id]) {
      World.explored[rg.id] = true;
      Utils.bus.emit('region_found', rg);
      /* 靠近传送点自动解锁 */
      for (var i = 0; i < World.teleports.length; i++) {
        var t = World.teleports[i];
        if (t.region === rg.id) t.unlocked = true;
      }
      return rg;
    }
    /* 即使已探索，靠近传送点也解锁 */
    for (var j = 0; j < World.teleports.length; j++) {
      var tp = World.teleports[j];
      if (tp.region === rg.id && !tp.unlocked && Utils.dist(x, y, tp.x, tp.y) < 8) tp.unlocked = true;
    }
    return null;
  };

  World.nearestTeleport = function (x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < World.teleports.length; i++) {
      var t = World.teleports[i];
      var d = Utils.dist2(x, y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  /* ---- 宝箱 ---- */
  World.nearestChest = function (x, y, maxDist) {
    maxDist = maxDist || 1.8;
    var best = null, bd = maxDist * maxDist;
    for (var i = 0; i < World.chests.length; i++) {
      var c = World.chests[i];
      if (c.opened) continue;
      var d = Utils.dist2(x, y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  /* ---- 解放进度 ---- */
  World.addKill = function (regionId, isBoss) {
    if (!World.regionNeed[regionId]) return false;
    World.regionKill[regionId]++;
    if (isBoss) {
      /* 击杀 BOSS 直接解放该区域 */
      return World.liberateRegion(regionId);
    }
    if (World.regionKill[regionId] >= World.regionNeed[regionId]) {
      return World.liberateRegion(regionId);
    }
    return false;
  };
  World.liberateRegion = function (regionId) {
    if (World.liberated[regionId]) return false;
    World.liberated[regionId] = true;
    var rg = null;
    for (var i = 0; i < Config.REGIONS.length; i++) if (Config.REGIONS[i].id === regionId) rg = Config.REGIONS[i];
    Utils.bus.emit('region_liberated', rg);
    return true;
  };

  /* ---- 小地图：把 2000x2000 大陆压缩成 128x128 像素色块 ---- */
  var mmColors = {
    water: '#2244aa', sand: '#d9c98a', grass: '#4d9e3f', dirt: '#8a6b43',
    rock: '#7d7d7d', rock_high: '#4a4a4a', snow: '#e8f0f8', farmland: '#9c8a3d',
    bone: '#d8d8c8', darkstone: '#3a3046', lava: '#d94f1e', bridge: '#a5763f',
    flower: '#5cb14e', wall: '#5a5a5a'
  };
  World.minimapData = function (cells) {
    cells = cells || 128;
    var out = new Array(cells * cells);
    var step = Config.MAP_SIZE / cells;
    for (var y = 0; y < cells; y++) {
      for (var x = 0; x < cells; x++) {
        var t = Terrain.tileAt(Math.floor(x * step + step / 2), Math.floor(y * step + step / 2));
        out[y * cells + x] = mmColors[t] || '#000';
      }
    }
    return { size: cells, cells: out };
  };

  L.World = World;
})(window);
