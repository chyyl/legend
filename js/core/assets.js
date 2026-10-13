/* ============================================================================
   js/core/assets.js —— 程序化像素图生成器（Q46：零外部素材）
   ----------------------------------------------------------------------------
   职责：用 Canvas 代码绘制所有像素图（角色/敌人/地形/武器/图标），
         生成到离屏 canvas 并缓存，避免外部图片依赖，保证 APK 离线自包含。

   对外接口（window.LG.Assets）：
     .sprite(kind, opts) -> canvas   生成/缓存一张像素图
     .tile(type) -> canvas           地形瓦片
     .weaponIcon(id) -> canvas       武器图标
     .armorIcon(slot, color) -> canvas
     .hero(opts) -> canvas           玩家角色（外观自定义 Q51）
     .enemy(type) -> canvas          敌人（人类军队 Q71）
     .boss(id) -> canvas             BOSS
     .bondIcon(id) -> canvas         羁绊图标

   设计守则：所有图基于 32×32 网格绘制（Q45），缓存以 key 复用，性能友好。
   依赖：core/config.js（取颜色/类型）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const T = 32; // 基础像素格

  const cache = {};
  function mk(key, w, h, draw) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = w || T; c.height = h || T;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    draw(g, c.width, c.height);
    cache[key] = c;
    return c;
  }
  // 填充一个像素方块
  function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

  /* ---------- 地形瓦片 ---------- */
  const TILE_COLORS = {
    grass: ['#3f6b3a', '#4f7d47'],
    dirt: ['#6b4a2f', '#7a5636'],
    sand: ['#c2b280', '#cdbd8c'],
    snow: ['#dfe6ee', '#eef2f6'],
    rock: ['#5a5f6b', '#4a4e59'],
    water: ['#2a5f8a', '#316b99'],
    road: ['#8a7a5a', '#96865f'],
    castle: ['#3a3a4a', '#444456'],
    void: ['#241b2e', '#2e2239'],
    farm: ['#5a7a3a', '#66863f'],
  };
  function tile(type) {
    return mk('tile:' + type, T, T, (g) => {
      const cols = TILE_COLORS[type] || TILE_COLORS.grass;
      px(g, 0, 0, T, T, cols[0]);
      // 噪点纹理，增加细节
      const r = LG.U.rng(type.length * 977);
      for (let i = 0; i < 26; i++) {
        px(g, (r() * T) | 0, (r() * T) | 0, 2, 2, r() > 0.5 ? cols[1] : cols[0]);
      }
    });
  }

  /* ---------- 玩家英雄（Q51 外观自定义） ----------
     opts: {skin, hair, hairColor, eye, gender, weapon} */
  function hero(opts) {
    opts = opts || {};
    const skin = opts.skin || '#e0b090';
    const hairCol = opts.hairColor || '#3a2a1a';
    const key = 'hero:' + [opts.skin, opts.hairColor, opts.hair, opts.gender].join('|');
    return mk(key, T, T, (g) => {
      px(g, 11, 4, 10, 8, skin);                 // 头
      px(g, 11, 2, 10, 3, hairCol);              // 头发
      if (opts.hair === 'long') px(g, 10, 4, 2, 6, hairCol), px(g, 20, 4, 2, 6, hairCol);
      px(g, 13, 6, 2, 2, '#1a1a2a'); px(g, 17, 6, 2, 2, '#1a1a2a'); // 眼睛
      px(g, 10, 12, 12, 12, opts.gender === 'F' ? '#7a3a5a' : '#3a5a7a'); // 身体
      px(g, 11, 24, 4, 5, '#2a2a3a'); px(g, 17, 24, 4, 5, '#2a2a3a');   // 腿
    });
  }

  /* ---------- 敌人（Q71：人类军队，非怪物） ----------
     采用人形轮廓 + 军团配色，固定型/缓慢型仅在武器/姿态上区分 */
  function enemy(type) {
    const key = 'enemy:' + type.id;
    return mk(key, T, T, (g) => {
      const c = type.color;
      px(g, 11, 4, 10, 8, '#c9a58a');            // 头（人类）
      px(g, 10, 2, 12, 3, c);                     // 军盔
      px(g, 13, 6, 2, 2, '#2a1a1a'); px(g, 17, 6, 2, 2, '#2a1a1a');
      px(g, 10, 12, 12, 12, c);                   // 军甲
      if (type.elite) px(g, 10, 12, 12, 2, '#f0d060'); // 精英描边
      px(g, 11, 24, 4, 5, '#2a2a30'); px(g, 17, 24, 4, 5, '#2a2a30');
      // 固定型（弩手/术士）手持远程器械，缓慢型（士兵）持近战
      if (type.move === 'fixed') px(g, 22, 14, 6, 3, '#5a4a2a');
      else px(g, 22, 12, 2, 10, '#8a8a9a');
    });
  }

  /* ---------- BOSS：在精英基础上放大 + 特效描边 ---------- */
  function boss(id, baseColor) {
    const key = 'boss:' + id;
    const S = T * 2; // BOSS 更大
    return mk(key, S, S, (g) => {
      const c = baseColor || '#7a2f3c';
      px(g, 20, 6, 24, 16, '#c9a58a');            // 头
      px(g, 18, 2, 28, 6, c);                     // 冠
      px(g, 26, 12, 4, 4, '#ff5030'); px(g, 36, 12, 4, 4, '#ff5030'); // 发光眼
      px(g, 16, 22, 32, 26, c);                   // 躯干
      px(g, 14, 22, 36, 3, '#f0d060');
      px(g, 20, 48, 10, 12, '#1a1a22'); px(g, 34, 48, 10, 12, '#1a1a22');
      // 暗能量光晕
      g.fillStyle = 'rgba(120,40,160,0.25)';
      g.fillRect(8, 4, 48, 56);
    });
  }

  /* ---------- 武器图标 ---------- */
  function weaponIcon(id) {
    const w = LG.Config.WEAPONS.find((x) => x.id === id) || { color: '#ccc' };
    return mk('wicon:' + id, T, T, (g) => {
      const c = w.color;
      if (w.kind === 'melee') {
        px(g, 20, 4, 4, 18, c); px(g, 18, 20, 8, 3, '#5a4a2a'); px(g, 21, 23, 2, 6, '#3a2a1a');
      } else if (w.kind === 'ranged') {
        g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.arc(16, 16, 11, -1.2, 1.2); g.stroke();
        px(g, 8, 15, 16, 2, c);
      } else if (w.kind === 'magic') {
        px(g, 21, 6, 2, 20, '#5a3a2a'); px(g, 18, 3, 8, 8, c);
        px(g, 20, 5, 4, 4, '#fff');
      } else if (w.kind === 'shield') {
        px(g, 9, 7, 14, 16, c); px(g, 11, 9, 10, 12, '#8a92a0'); px(g, 14, 12, 4, 6, '#d8b45a');
      }
    });
  }

  /* ---------- 装备图标（四槽位 Q 文档：头/甲/腿/鞋） ---------- */
  function armorIcon(slot, color) {
    color = color || '#7a8290';
    return mk('aicon:' + slot + color, T, T, (g) => {
      if (slot === 'helm') { px(g, 9, 8, 14, 12, color); px(g, 11, 14, 10, 4, '#2a2a3a'); }
      else if (slot === 'chest') { px(g, 8, 8, 16, 16, color); px(g, 13, 8, 6, 16, '#2a2a3a'); }
      else if (slot === 'legs') { px(g, 9, 8, 6, 16, color); px(g, 17, 8, 6, 16, color); }
      else if (slot === 'boots') { px(g, 9, 16, 6, 9, color); px(g, 17, 16, 6, 9, color); }
    });
  }

  /* ---------- 羁绊图标：8种用不同符号色块 ---------- */
  const BOND_COL = { sharp: '#e05050', sweep: '#50a0e0', exp: '#50c060', power: '#e08030',
    tri_crit: '#e0d040', guard: '#5080e0', lifesteal: '#a03060', phoenix: '#e0b040' };
  function bondIcon(id) {
    return mk('bond:' + id, T, T, (g) => {
      const c = BOND_COL[id] || '#aaa';
      px(g, 12, 12, 8, 8, c);
      px(g, 14, 6, 4, 6, c); px(g, 14, 20, 4, 6, c); px(g, 6, 14, 6, 4, c); px(g, 20, 14, 6, 4, c);
    });
  }

  /* ---------- 宝箱 ---------- */
  function chest() {
    return mk('chest', T, T, (g) => {
      px(g, 6, 12, 20, 14, '#7a5a2a'); px(g, 6, 12, 20, 5, '#8a6a3a');
      px(g, 14, 15, 4, 6, '#d8b45a'); px(g, 6, 20, 20, 1, '#4a3a1a');
    });
  }

  LG.Assets = { tile, hero, enemy, boss, weaponIcon, armorIcon, bondIcon, chest, _cache: cache };
})();
