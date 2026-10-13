/* =============================================================================
 * 文件：js/core/utils.js
 * 职责：与游戏逻辑无关的基础工具：种子随机数、数学函数、事件总线、本地存储、
 *       像素风配色。任何文件都可以使用它，它不依赖任何游戏模块。
 * 依赖：无（最底层工具文件）
 * 对外接口（window.Legend.Utils）：
 *   - makeRng(seed)            生成种子随机函数 rng() -> [0,1)，含 rng.range/a/pick
 *   - clamp / lerp / dist2 / dist / angleLerp
 *   - EventBus                 on/off/emit 轻量事件总线
 *   - store.save(key,obj) / store.load(key,dflt)  localStorage 封装（失败静默）
 *   - hexA(hex, a)             十六进制颜色加透明度
 * 被引用：terrain.js / worldmap.js / loot.js / enemy.js / save.js / game.js 等
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Utils = {};

  /* 种子随机数（xorshift32），保证同一 seed 生成同一片大陆 */
  Utils.makeRng = function (seed) {
    var s = (seed | 0) || 0x9e3779b9;
    function next() {
      s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 16777216) / 16777216;
    }
    next.range = function (a, b) { return a + next() * (b - a); };
    next.int = function (a, b) { return Math.floor(next.range(a, b + 1)); };
    next.pick = function (arr) { return arr[Math.floor(next() * arr.length) % arr.length]; };
    next.chance = function (p) { return next() < p; };
    return next;
  };

  /* 随机源兼容包装：允许调用方直接传 Math.random（裸函数），
   * 自动补齐 range/int/pick/chance，避免 "rng.int is not a function" 这类崩溃。
   * 放在最底层，terrain/loot 等模块共用同一实现。 */
  Utils.asRng = function (rng) {
    if (rng && typeof rng.range === 'function' && typeof rng.int === 'function') return rng;
    var fn = (typeof rng === 'function') ? rng : Math.random;
    fn.range = fn.range || function (a, b) { return a + fn() * (b - a); };
    fn.int = fn.int || function (a, b) { return Math.floor(a + fn() * (b - a + 1)); };
    fn.pick = fn.pick || function (arr) { return arr[Math.floor(fn() * arr.length) % arr.length]; };
    fn.chance = fn.chance || function (p) { return fn() < p; };
    return fn;
  };

  /* 数学工具 */
  Utils.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  Utils.lerp = function (a, b, t) { return a + (b - a) * t; };
  Utils.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  Utils.dist = function (ax, ay, bx, by) { return Math.sqrt(Utils.dist2(ax, ay, bx, by)); };
  Utils.angleLerp = function (a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  Utils.now = function () { return (global.performance && performance.now) ? performance.now() : Date.now(); };

  /* 事件总线：解耦模块通信（如 ui 监听 'kill' 'levelup' 'loot'） */
  var bus = { _m: {} };
  bus.on = function (ev, fn) { (bus._m[ev] = bus._m[ev] || []).push(fn); return fn; };
  bus.off = function (ev, fn) {
    var a = bus._m[ev]; if (!a) return;
    var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  };
  bus.emit = function (ev, data) {
    var a = bus._m[ev]; if (!a) return;
    for (var i = 0; i < a.length; i++) a[i](data);
  };
  Utils.bus = bus;

  /* localStorage 封装：隐私模式/文件协议下可能抛错，静默兜底到内存 */
  var mem = {};
  Utils.store = {
    save: function (key, obj) {
      var s = JSON.stringify(obj);
      try { localStorage.setItem(key, s); } catch (e) { mem[key] = s; }
    },
    load: function (key, dflt) {
      var s = null;
      try { s = localStorage.getItem(key); } catch (e) { s = mem[key] || null; }
      if (s == null) return dflt;
      try { return JSON.parse(s); } catch (e) { return dflt; }
    },
    del: function (key) {
      try { localStorage.removeItem(key); } catch (e) { delete mem[key]; }
    }
  };

  /* 颜色工具：#rrggbb + 透明度 -> rgba() */
  Utils.hexA = function (hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  L.Utils = Utils;
})(window);
