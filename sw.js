/* =============================================================================
 * 文件：sw.js
 * 职责：Service Worker——缓存全部静态资源，实现完全离线可玩（PWA/TV/WVGA壳APK的基础）。
 * 依赖：无
 * 对外接口：浏览器 SW 生命周期（install/activate/fetch）
 * 被引用：index.html（manifest 声明）、game.js（无需直接引用）
 * 版本号变更 v1 -> v2 即触发更新
 * =============================================================================
 */
var CACHE = 'legend-v2';   // 每次改动静态资源后递增版本号，强制客户端更新缓存
var ASSETS = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/data/config.js', './js/core/utils.js', './js/core/input.js',
  './js/world/terrain.js', './js/world/worldmap.js', './js/world/renderer.js',
  './js/systems/loot.js', './js/systems/combat.js', './js/systems/quest.js', './js/systems/save.js',
  './js/entity/player.js', './js/entity/enemy.js', './js/entity/npc.js', './js/entity/projectile.js',
  './js/net/multiplayer.js', './js/world/fx.js', './js/ui/ui.js', './js/game.js'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  /* 网络优先、失败回退缓存：既保证更新又保证离线 */
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); }); })
  );
});
