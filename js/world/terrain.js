/* =============================================================================
 * 文件：js/world/terrain.js
 * 职责：程序化地形生成（要求：程序化生成，不同区域略有不同，处理地面/水/山）。
 *       基于种子 value-noise 多倍频高度图，按区域主题挑选地表类型，
 *       山脉用高度阈值生成不可通行的 rock_high（山），低洼处生成 water（水），
 *       跨海大桥区域强制在水面铺设 bridge（桥），保证“水上有路可走”。
 * 依赖：js/core/utils.js（makeRng）、js/data/config.js（区域/可通行表）
 * 对外接口（window.Legend.Terrain）：
 *   - init(seed)                             生成噪声场
 *   - tileAt(tx, ty)                         -> 'water'|'grass'|...（含越界兜底为 water）
 *   - walkable(tx, ty)                       是否可通行（查 Config.WALKABLE + 桥修正）
 *   - themeAt(tx, ty)                        所属区域主题（用于刷怪/取色）
 *   - randomWalkable(rng, tx, ty, tries)     附近找一个可走的格子（刷怪/宝箱用）
 * 被引用：worldmap.js / renderer.js / game.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils;

  var TILE = Config.TILE, SIZE = Config.MAP_SIZE;
  var SEED = 20261013;
  var perm = new Uint8Array(512);
  var tileCache = new Map();   // "x,y" -> tile，缓存已访问格子，避免重复计算

  /* ---- 值噪声 ---- */
  function hash2(x, y) {
    var h = x * 374761393 + y * 668265263 + SEED * 1442695041;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = smooth(x - xi), yf = smooth(y - yi);
    var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  function fbm(x, y, oct) {   // 分形叠加噪声 -> [0,1]
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      v += valueNoise(x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  }

  /* ---- 区域半径衰减：离区域中心越近，主题越强 ---- */
  function regionWeight(rg, tx, ty) {
    var d = Utils.dist(tx, ty, rg.cx, rg.cy);
    if (d >= rg.r) return 0;
    return 1 - d / rg.r;
  }

  /* 计算单个格子的地形类型（带缓存） */
  function computeTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return 'water'; // 大陆之外是海
    var s = 1 / 48;                             // 噪声采样尺度
    var h = fbm(tx * s, ty * s, 4);             // 高度
    var m = fbm(tx * s + 100, ty * s + 100, 3); // 湿度

    var rg = Config.getRegionAt(tx, ty);
    var w = regionWeight(rg, tx, ty);

    var tile;
    /* 1) 基础气候带（距离大陆中心远近决定海陆） */
    var dc = Utils.dist(tx, ty, SIZE / 2, SIZE / 2) / (SIZE / 2); // 0 中心 ~ 1 边缘
    if (dc > 0.965) tile = 'water';                     // 大陆边缘环海
    else if (h < 0.30 + dc * 0.06) tile = 'water';      // 低洼湖泊
    else if (h < 0.34 + dc * 0.06) tile = 'sand';       // 湖岸/海岸沙滩
    else if (h > 0.74) tile = 'rock_high';              // 高海拔山体（不可通行）
    else if (h > 0.66) tile = 'rock';                   // 山脚岩石
    else if (m > 0.62) tile = 'grass';
    else tile = 'dirt';

    /* 2) 区域主题覆盖：权重越高越偏向该区域的首选地表 */
    if (w > 0) {
      var th = rg.theme;
      var primary = th[0];
      if (rg.id === 'bridge') {
        /* 跨海大桥：水面铺一条桥，其余保持水/沙 */
        var laneY = rg.cy;
        if (Math.abs(ty - laneY) < 3 && tile === 'water') tile = 'bridge';
        else if (w > 0.5 && tile === 'water') tile = 'water';
        else if (w > 0.5 && tile === 'rock_high') tile = 'sand';
      } else if (rg.id === 'island') {
        /* 骷髅岛：中心隆起的骨地小岛 */
        if (w > 0.35) tile = (h > 0.62) ? 'rock' : 'bone';
        else if (tile === 'dirt') tile = 'sand';
      } else if (rg.id === 'final') {
        /* 终末之战：熔岩裂隙 */
        if (w > 0.3 && tile !== 'water') tile = (m > 0.58) ? 'lava' : 'darkstone';
      } else {
        /* 通用：按权重把主题列表里的类型“染”上去 */
        var idx = Math.min(th.length - 1, Math.floor((1 - w) * th.length));
        var want = th[idx];
        if (want === 'rock') {           // 山区主题：保留高低差的立体感
          if (tile === 'rock_high' && w < 0.6) tile = 'rock';
          else if (tile !== 'water' && tile !== 'rock_high' && w > 0.4) tile = 'rock';
        } else if (want === 'flower') {
          if (tile === 'grass' && m > 0.5) tile = 'flower';
        } else if (want === 'wall') {
          if (tile === 'grass' || tile === 'dirt') tile = 'rock';
        } else if (want !== 'water' && want !== 'rock_high') {
          /* 其余主题不允许覆盖水/山，避免出现“雪地里的湖”之类的怪异边界 */
          if (tile !== 'water' && tile !== 'rock_high' && tile !== 'sand') tile = want;
        }
      }
    }

    /* 3) 人工修正：区域核心圈一律平整为可行走地表（营地/城镇需要可建筑、可站立）。
     *    注意必须覆盖 water/lava/rock_high —— 否则区域中心可能整片成湖或山，
     *    导致 NPC/传送点/玩家出生点卡死。跨海大桥区域除外（它本就是水+桥）。 */
    if (w > 0.75 && rg.id !== 'bridge') {
      tile = (rg.id === 'farm') ? 'farmland'
           : (rg.id === 'snow') ? 'snow'
           : (rg.theme[0] === 'darkstone') ? 'darkstone'
           : (rg.id === 'bay' || rg.id === 'island') ? 'sand'
           : 'grass';
    }

    /* 4) 营地与各区域之间铺土路，跨水自动变桥（保证全图连通） */
    if (tile === 'water' || tile === 'rock_high') {
      if (nearRoad(tx, ty)) tile = (tile === 'water') ? 'bridge' : 'rock';
    }

    return tile;
  }

  /* ---- 道路网络：营地 -> 各区域中心的折线 ---- */
  var roads = [];
  function buildRoads() {
    roads = [];
    var camp = Config.REGIONS[0];
    for (var i = 1; i < Config.REGIONS.length; i++) {
      var rg = Config.REGIONS[i];
      if (rg.id === 'wild') continue;
      roads.push([camp.cx, camp.cy, rg.cx, rg.cy]);
    }
  }
  function nearRoad(tx, ty) {
    for (var i = 0; i < roads.length; i++) {
      var r = roads[i];
      if (segDist(tx, ty, r[0], r[1], r[2], r[3]) <= 1.6) return true;
    }
    return false;
  }
  function segDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var t = Utils.clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
    return Utils.dist(px, py, x1 + dx * t, y1 + dy * t);
  }

  var Terrain = {
    init: function (seed) {
      SEED = seed | 0;
      tileCache.clear();
      buildRoads();
    },
    tileAt: function (tx, ty) {
      var k = tx + ',' + ty;
      var v = tileCache.get(k);
      if (v === undefined) {
        v = computeTile(tx, ty);
        if (tileCache.size > 60000) tileCache.clear();  // 防内存膨胀
        tileCache.set(k, v);
      }
      return v;
    },
    walkable: function (tx, ty) {
      var t = Terrain.tileAt(tx, ty);
      var ok = Config.WALKABLE[t];
      if (ok === undefined) ok = true;
      /* 水域只有 bridge 可走；山体 rock_high 不可走 */
      return !!ok;
    },
    themeAt: function (tx, ty) { return Config.getRegionAt(tx, ty); },
    randomWalkable: function (rng, tx, ty, tries) {
      tries = tries || 20;
      rng = Utils.asRng(rng);          // 兼容直接传 Math.random
      for (var i = 0; i < tries; i++) {
        var x = tx + rng.int(-6, 6), y = ty + rng.int(-6, 6);
        if (Terrain.walkable(x, y)) return { x: x, y: y };
      }
      return { x: tx, y: ty };
    }
  };

  L.Terrain = Terrain;
})(window);
