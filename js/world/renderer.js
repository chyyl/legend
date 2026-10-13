/* =============================================================================
 * 文件：js/world/renderer.js
 * 职责：像素风 2D 渲染（要求：像素风格、2D、火柴人）。负责：
 *       地形分块绘制（含水面波纹/山体阴影/桥/熔岩）、玩家与敌人火柴人绘制、
 *       NPC、宝箱、传送门、弹道、伤害飘字、攻击挥砍弧、小地图与探索迷雾。
 * 依赖：js/data/config.js、js/world/terrain.js、js/core/utils.js
 * 对外接口（Legend.Renderer）：
 *   - attach(canvas)                 绑定画布
 *   - setViewport(w, h)              设置视口逻辑尺寸（CSS 像素，index.html 的 resize 调用）
 *   - fitZoom()                      按视口宽度自动适配缩放（手机约 12 格宽、宽屏 10 格宽）
 *   - vw() / vh()                    视口逻辑宽高（CSS 像素；未初始化时退化为画布一半）
 *   - camera                         {x, y, zoom}（世界坐标为中心；zoom 单位 = CSS 像素/格 ÷ TILE）
 *   - worldToScreen(wx, wy)          世界格坐标 -> 视口 CSS 像素（与鼠标坐标同空间，瞄准所见即所得）
 *   - draw(game, dt)                 每帧绘制入口
 *   - drawMinimap(ctx2, game, x, y, size)  在指定位置画小地图
 *   - floatText(x, y, text, color)   飘字（伤害数字/提示）
 * 坐标空间说明：所有绘制在“CSS 像素”逻辑空间完成，draw() 开头用
 *   setTransform(backing/logical) 一次性放大到设备缓冲分辨率，因此：
 *   ①清晰度只由缓冲分辨率决定（index.html 按 DPR 计算），与视野解耦；
 *   ②输入（鼠标/触摸为 CSS px）与渲染天然同空间。
 * 被引用：game.js / ui.js / fx.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils, Terrain = L.Terrain;
  var World = L.World;   // worldmap.js 先于本文件加载（见 index.html 顺序注释）
  var Input = L.Input;   // core/input.js 先于本文件加载
  var Fx = L.Fx;         // world/fx.js 先于本文件加载（氛围/震动/光照）

  var Renderer = {
    canvas: null, ctx: null,
    cssW: 0, cssH: 0,  // 视口逻辑尺寸（CSS 像素），由 index.html 的 resize -> setViewport 写入
    camera: { x: 1400, y: 1400, zoom: 4.0 },   // zoom 单位：CSS 像素/格 ÷ TILE（4.0 = 桌面端原观感 128 CSS px/格）
    floats: [],        // 飘字
    slashes: [],       // 挥砍弧
    sparks: [],        // 粒子
    time: 0
  };

  /* ---- 视口与缩放适配（手机/桌面同一套逻辑：始终显示约 10 格宽） ---- */
  Renderer.setViewport = function (w, h) {
    var prevW = Renderer.cssW;
    Renderer.cssW = w; Renderer.cssH = h;
    /* 仅视口宽度变化时重新适配（旋转/分屏）；高度变化（手机地址栏收起）保留用户手动缩放 */
    if (w && (prevW !== w || !Renderer._zoomInited)) {
      Renderer.fitZoom();
      Renderer._zoomInited = true;
    }
  };
  Renderer.fitZoom = function () {
    var w = Renderer.vw();
    if (!w) return;
    /* 10 格宽 = 桌面端旧观感；手机由此从 3 格视野提升到 10 格 */
    Renderer.camera.zoom = Utils.clamp(w / (10 * Config.TILE), 0.5, 8);
  };
  Renderer.vw = function () { return Renderer.cssW || (Renderer.canvas ? Renderer.canvas.width / 2 : 640); };
  Renderer.vh = function () { return Renderer.cssH || (Renderer.canvas ? Renderer.canvas.height / 2 : 360); };

  /* 地形配色（像素风 4 色阶） */
  var PAL = {
    water:      ['#1c3f8f', '#2450ab', '#2a5cc0', '#1c3f8f'],
    sand:       ['#d9c98a', '#e2d49b', '#cdbd7f', '#d9c98a'],
    grass:      ['#3f8f34', '#4d9e3f', '#57ab49', '#3f8f34'],
    dirt:       ['#7a5c38', '#8a6b43', '#96764d', '#7a5c38'],
    rock:       ['#6f6f6f', '#7d7d7d', '#8a8a8a', '#6f6f6f'],
    rock_high:  ['#3f3f3f', '#4a4a4a', '#565656', '#3f3f3f'],
    snow:       ['#dfeaf5', '#e8f0f8', '#f2f8ff', '#dfeaf5'],
    farmland:   ['#8a7a33', '#9c8a3d', '#a89545', '#8a7a33'],
    bone:       ['#c8c8b8', '#d8d8c8', '#e2e2d2', '#c8c8b8'],
    darkstone:  ['#2e2838', '#3a3046', '#453a54', '#2e2838'],
    lava:       ['#c93d12', '#d94f1e', '#e8622c', '#c93d12'],
    bridge:     ['#8a5f33', '#a5763f', '#b5854a', '#8a5f33'],
    flower:     ['#4d9e3f', '#5cb14e', '#66bd57', '#4d9e3f'],
    wall:       ['#5a5a5a', '#666666', '#727272', '#5a5a5a']
  };

  Renderer.attach = function (canvas) {
    Renderer.canvas = canvas;
    Renderer.ctx = canvas.getContext('2d');
    Renderer.ctx.imageSmoothingEnabled = false;
  };

  Renderer.worldToScreen = function (wx, wy) {
    var c = Renderer.camera, t = Config.TILE, z = c.zoom;
    return {
      x: (wx - c.x) * t * z + Renderer.vw() / 2 + (Fx ? Fx.shakeX : 0),
      y: (wy - c.y) * t * z + Renderer.vh() / 2 + (Fx ? Fx.shakeY : 0)
    };
  };
  Renderer.screenToWorld = function (sx, sy) {
    var c = Renderer.camera, t = Config.TILE, z = c.zoom;
    return {
      x: (sx - Renderer.vw() / 2) / (t * z) + c.x,
      y: (sy - Renderer.vh() / 2) / (t * z) + c.y
    };
  };

  Renderer.floatText = function (x, y, text, color, crit) {
    Renderer.floats.push({ x: x, y: y, text: text, color: color || '#fff', t: 1.0, crit: !!crit });
    if (Renderer.floats.length > 90) Renderer.floats.shift();
  };
  Renderer.addSlash = function (x, y, angle, range, color) {
    Renderer.slashes.push({ x: x, y: y, angle: angle, range: range, t: 0.22, color: color || '#fff' });
  };
  Renderer.addSparks = function (x, y, color, n) {
    for (var i = 0; i < (n || 6); i++) {
      var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      Renderer.sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.5, color: color });
    }
    if (Renderer.sparks.length > 300) Renderer.sparks.splice(0, Renderer.sparks.length - 300);
  };

  /* 该格是否为陆地（用于海岸线泡沫判断） */
  function isLandTile(t) {
    return t !== 'water' && t !== 'lava' && t !== undefined;
  }

  /* ---- 地形绘制：只画视口内的格子，格子内再画 4×4 像素纹理 ---- */
  function drawTerrain(ctx, game) {
    var c = Renderer.camera, t = Config.TILE, z = c.zoom;
    var W = Renderer.vw(), H = Renderer.vh();
    var halfW = W / (2 * t * z), halfH = H / (2 * t * z);
    var x0 = Math.floor(c.x - halfW) - 1, x1 = Math.ceil(c.x + halfW) + 1;
    var y0 = Math.floor(c.y - halfH) - 1, y1 = Math.ceil(c.y + halfH) + 1;
    var px = t * z;   // 每格屏幕像素

    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var tile = Terrain.tileAt(tx, ty);
        var pal = PAL[tile] || PAL.grass;
        var sx = Math.round((tx - c.x) * px + W / 2);
        var sy = Math.round((ty - c.y) * px + H / 2);

        ctx.fillStyle = pal[0];
        ctx.fillRect(sx, sy, Math.ceil(px) + 1, Math.ceil(px) + 1);

        /* 像素纹理：用坐标哈希稳定地撒 2×2 色块，近处再叠细节 */
        if (px >= 10) {
          var h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
          for (var i = 0; i < 3; i++) {
            var hh = (h >>> (i * 5)) & 15;
            var ox = (hh & 3) * (px / 4), oy = ((hh >> 2) & 3) * (px / 4);
            ctx.fillStyle = pal[1 + (i % 3)];
            ctx.fillRect(sx + ox, sy + oy, Math.max(2, px / 4), Math.max(2, px / 4));
          }
        }

        /* 水面波纹动画 */
        if (tile === 'water' && px >= 8) {
          var wv = Math.sin(Renderer.time * 2 + tx * 0.9 + ty * 1.3);
          if (wv > 0.55) {
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(sx + px * 0.2, sy + px * (0.3 + 0.3 * (wv - 0.55) * 2), px * 0.5, Math.max(1, px / 8));
          }
        }
        /* 山体阴影（rock_high 左上高光） */
        if (tile === 'rock_high') {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(sx, sy, px, Math.max(2, px / 6));
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(sx, sy + px - Math.max(2, px / 6), px, Math.max(2, px / 6));
        }
        /* 熔岩呼吸 */
        if (tile === 'lava') {
          var lv = (Math.sin(Renderer.time * 3 + tx + ty * 0.7) + 1) / 2;
          ctx.fillStyle = 'rgba(255,200,60,' + (0.10 + lv * 0.22) + ')';
          ctx.fillRect(sx, sy, px, px);
        }
        /* 水面与陆地交界：画一圈浪花泡沫，让海岸线更自然 */
        if (tile === 'water' && px >= 8) {
          var foamA = 0.20 + 0.14 * Math.sin(Renderer.time * 2.2 + tx * 0.7 + ty * 1.1);
          ctx.fillStyle = 'rgba(230,245,255,' + foamA.toFixed(3) + ')';
          if (isLandTile(Terrain.tileAt(tx, ty - 1))) ctx.fillRect(sx, sy, px, Math.max(1, px / 7));
          if (isLandTile(Terrain.tileAt(tx, ty + 1))) ctx.fillRect(sx, sy + px - Math.max(1, px / 7), px, Math.max(1, px / 7));
          if (isLandTile(Terrain.tileAt(tx - 1, ty))) ctx.fillRect(sx, sy, Math.max(1, px / 7), px);
          if (isLandTile(Terrain.tileAt(tx + 1, ty))) ctx.fillRect(sx + px - Math.max(1, px / 7), sy, Math.max(1, px / 7), px);
        }

        /* 草地/农田植被装饰：按坐标哈希稳定生成草簇与野花（近景才画） */
        if (px >= 12 && (tile === 'grass' || tile === 'flower' || tile === 'farmland')) {
          var vh = ((tx * 92837111) ^ (ty * 689287499)) >>> 0;
          if ((vh & 7) === 0) {                       // 1/8 概率长草
            var gx = sx + ((vh >> 3) & 3) * (px / 4) + px * 0.12;
            var gy = sy + ((vh >> 5) & 3) * (px / 4) + px * 0.12;
            var gh = Math.max(2, px * 0.22);
            var sway = Math.sin(Renderer.time * 1.6 + tx + ty) * (px * 0.03);
            ctx.fillStyle = tile === 'farmland' ? '#6f6224' : '#2f7a28';
            ctx.fillRect(gx + sway, gy - gh, Math.max(1, px * 0.07), gh);
            ctx.fillRect(gx + sway * 1.6 + px * 0.06, gy - gh * 0.8, Math.max(1, px * 0.07), gh * 0.8);
          }
          if (tile !== 'farmland' && (vh & 31) === 3) {   // 1/32 概率野花
            var fx2 = sx + ((vh >> 8) & 3) * (px / 4) + px * 0.2;
            var fy2 = sy + ((vh >> 10) & 3) * (px / 4) + px * 0.2;
            var petal = ['#ff9ec4', '#ffe27a', '#c9a0ff', '#ffffff'][(vh >> 12) & 3];
            ctx.fillStyle = '#2f7a28';
            ctx.fillRect(fx2, fy2, Math.max(1, px * 0.05), Math.max(2, px * 0.14));
            ctx.fillStyle = petal;
            ctx.fillRect(fx2 - Math.max(1, px * 0.05), fy2 - Math.max(1, px * 0.1), Math.max(2, px * 0.15), Math.max(2, px * 0.1));
          }
        }

        /* 格线（放大时才显示，强化像素网格感） */
        if (px >= 24) {
          ctx.fillStyle = 'rgba(0,0,0,0.05)';
          ctx.fillRect(sx, sy, px, 1);
          ctx.fillRect(sx, sy, 1, px);
        }
      }
    }
  }

  /* ---- 地面投影：所有站立实体脚下画椭圆软阴影，强化空间层次 ---- */
  function drawShadow(ctx, sx, sy, scale, k) {
    k = k || 1;
    var rx = scale * 0.30 * k, ry = scale * 0.12 * k;
    var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.29); ctx.fill();
    ctx.restore();
  }

  /* ---- 火柴人绘制：极简线条小人 + 手持武器 ---- */
  function drawStickman(ctx, sx, sy, scale, opt) {
    /* opt: {color, dir, weapon, atkAnim, hp, maxHp, name, rank, roll} */
    var s = scale;                       // 身高像素
    var lw = Math.max(2, s / 9);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.strokeStyle = opt.color || '#222';

    var bob = opt.roll ? 0 : Math.sin(Renderer.time * 6 + sx * 0.1) * (s * 0.02);
    var cx = sx, cy = sy - s * 0.5 + bob;

    /* 头 */
    ctx.fillStyle = opt.headColor || '#f0c8a0';
    var hr = s * 0.16;
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.32, hr, 0, 6.29); ctx.fill();
    ctx.stroke();
    /* 眼睛（朝向） */
    ctx.fillStyle = '#222';
    var ex = Math.cos(opt.dir || 0) * hr * 0.45, ey = Math.sin(opt.dir || 0) * hr * 0.3;
    ctx.fillRect(cx + ex - 1, cy - s * 0.33 + ey, 2, 2);

    /* 身体 */
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.16); ctx.lineTo(cx, cy + s * 0.14); ctx.stroke();

    /* 腿（走路摆动） */
    var legA = opt.moving ? Math.sin(Renderer.time * 10) * 0.5 : 0.12;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.14); ctx.lineTo(cx - Math.sin(legA) * s * 0.22, cy + s * 0.42);
    ctx.moveTo(cx, cy + s * 0.14); ctx.lineTo(cx + Math.sin(legA) * s * 0.22, cy + s * 0.42);
    ctx.stroke();

    /* 手臂 + 武器：攻击时向前挥 */
    var swing = opt.atkAnim > 0 ? (0.22 - opt.atkAnim) / 0.22 : 0;   // 0->1 挥砍进度
    var armAng = (opt.dir || 0) + (opt.atkAnim > 0 ? (-0.9 + swing * 1.8) : 0.35);
    var ax = cx + Math.cos(armAng) * s * 0.30, ay = cy - s * 0.02 + Math.sin(armAng) * s * 0.30;
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.08); ctx.lineTo(ax, ay); ctx.stroke();

    if (opt.weapon) drawWeapon(ctx, ax, ay, armAng, s, opt.weapon);
  }

  function drawWeapon(ctx, x, y, ang, s, kind) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    var len = s * 0.42;
    if (kind === 'iron_sword' || kind === 'knight_sword') {
      ctx.strokeStyle = kind === 'knight_sword' ? '#dfe8f5' : '#c8ccd4';
      ctx.lineWidth = Math.max(2, s / 12);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.strokeStyle = '#7a5c38';
      ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.05); ctx.lineTo(-s * 0.06, s * 0.05); ctx.stroke();
    } else if (kind === 'scythe') {
      ctx.strokeStyle = '#9aa5b0'; ctx.lineWidth = Math.max(2, s / 12);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.8, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(len * 0.8, 0, len * 0.4, -1.4, 0.6); ctx.stroke();
    } else if (kind === 'bow') {
      ctx.strokeStyle = '#8a5f33'; ctx.lineWidth = Math.max(2, s / 14);
      ctx.beginPath(); ctx.arc(0, 0, len * 0.6, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#e8e8d8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.cos(-1.2) * len * 0.6, Math.sin(-1.2) * len * 0.6);
      ctx.lineTo(Math.cos(1.2) * len * 0.6, Math.sin(1.2) * len * 0.6); ctx.stroke();
    } else if (kind === 'crossbow') {
      ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = Math.max(2, s / 12);
      ctx.beginPath(); ctx.moveTo(-s * 0.08, 0); ctx.lineTo(len * 0.7, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(len * 0.5, -len * 0.35); ctx.lineTo(len * 0.5, len * 0.35); ctx.stroke();
    } else if (kind === 'staff') {
      ctx.strokeStyle = '#7a5c9c'; ctx.lineWidth = Math.max(2, s / 12);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
      ctx.fillStyle = '#a88cff';
      ctx.beginPath(); ctx.arc(len * 0.95, 0, s * 0.08, 0, 6.29); ctx.fill();
    } else if (kind === 'shield') {
      ctx.fillStyle = '#b0b8c4'; ctx.strokeStyle = '#6a7280'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(len * 0.5, -s * 0.16); ctx.lineTo(len * 0.85, 0);
      ctx.lineTo(len * 0.5, s * 0.16); ctx.lineTo(len * 0.2, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- 敌人：按模板颜色画异形小怪（精英/BOSS 加光环与体型） ---- */
  function drawEnemy(ctx, e, sx, sy, scale) {
    var s = scale * (e.rank === 'boss' ? 1.5 : e.rank === 'elite' ? 1.15 : 1);
    /* 精英/BOSS 光环 */
    if (e.rank !== 'normal') {
      ctx.fillStyle = e.rank === 'boss' ? 'rgba(255,60,60,0.20)' : 'rgba(120,160,255,0.18)';
      ctx.beginPath(); ctx.arc(sx, sy, s * 0.7, 0, 6.29); ctx.fill();
    }
    var col = e.hurtFlash > 0 ? '#ff5050' : e.tpl.color;
    var isBoss = e.rank === 'boss';
    drawShadow(ctx, sx, sy + s * 0.32, s, 1);
    /* 精英/BOSS：旋转虚线光环，比静态填充更有存在感 */
    if (e.rank !== 'normal') {
      var ringR = s * 0.62;
      var ringColor = isBoss ? 'rgba(255,80,80,0.75)' : 'rgba(120,180,255,0.7)';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.setLineDash([s * 0.16, s * 0.12]);
      ctx.lineDashOffset = Renderer.time * (isBoss ? -22 : 14);
      ctx.beginPath();
      ctx.ellipse(sx, sy + s * 0.30, ringR, ringR * 0.42, 0, 0, 6.29);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.translate(sx, sy);
    /* 身体（用模板色画个小方块躯干 + 火柴四肢） */
    ctx.fillStyle = col;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(2, s / 10);
    ctx.fillRect(-s * 0.18, -s * 0.42, s * 0.36, s * 0.40);
    ctx.strokeRect(-s * 0.18, -s * 0.42, s * 0.36, s * 0.40);
    /* 眼睛 */
    var ex = Math.cos(e.dir) * s * 0.06;
    ctx.fillStyle = isBoss ? '#ffee66' : '#ffffff';
    ctx.fillRect(-s * 0.10 + ex, -s * 0.34, s * 0.07, s * 0.07);
    ctx.fillRect(s * 0.04 + ex, -s * 0.34, s * 0.07, s * 0.07);
    /* 腿 */
    var legA = Math.sin(Renderer.time * 8 + e.id) * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.02);
    ctx.lineTo(-s * 0.14 - legA * s * 0.08, s * 0.30);
    ctx.moveTo(0, -s * 0.02);
    ctx.lineTo(s * 0.14 + legA * s * 0.08, s * 0.30);
    ctx.stroke();
    /* 手臂（攻击时前挥） */
    var swing = e.atkAnim > 0 ? (0.2 - e.atkAnim) / 0.2 : 0;
    var aA = e.dir + (e.atkAnim > 0 ? (-0.7 + swing * 1.5) : 0.4);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.30);
    ctx.lineTo(Math.cos(aA) * s * 0.34, -s * 0.30 + Math.sin(aA) * s * 0.34);
    ctx.stroke();
    ctx.restore();

    /* 血条（受伤才显示，BOSS 常显） */
    if (e.hp < e.maxHp || e.rank === 'boss') {
      var bw = s * 1.1, bh = Math.max(3, s * 0.09);
      var bx = sx - bw / 2, by = sy - s * 0.75;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = e.rank === 'boss' ? '#ff3b3b' : e.rank === 'elite' ? '#ffb03b' : '#5fd35f';
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
    }
    if (e.rank !== 'normal') {
      ctx.fillStyle = e.rank === 'boss' ? '#ff8080' : '#9fc6ff';
      ctx.font = 'bold ' + Math.max(10, s * 0.30) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText((e.rank === 'boss' ? '☠ ' : '★ ') + e.tpl.name + ' Lv' + e.lv, sx, sy - s * 0.85);
    }
  }

  /* ---- 宝箱 ---- */
  function drawChest(ctx, c, sx, sy, scale) {
    var s = scale * 0.8;
    drawShadow(ctx, sx, sy + s * 0.24, s, 0.95);
    if (c.opened) {
      ctx.fillStyle = '#5a4326';
      ctx.fillRect(sx - s * 0.35, sy - s * 0.18, s * 0.7, s * 0.30);
      return;
    }
    /* 未开宝箱呼吸金光 */
    var glow = (Math.sin(Renderer.time * 3 + c.x) + 1) / 2;
    ctx.fillStyle = 'rgba(255,215,80,' + (0.10 + glow * 0.18) + ')';
    ctx.beginPath(); ctx.arc(sx, sy, s * 0.75, 0, 6.29); ctx.fill();
    ctx.fillStyle = c.rare ? '#8a4fd0' : '#a5763f';
    ctx.fillRect(sx - s * 0.35, sy - s * 0.30, s * 0.7, s * 0.50);
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2;
    ctx.strokeRect(sx - s * 0.35, sy - s * 0.30, s * 0.7, s * 0.50);
    ctx.fillStyle = '#ffd750';
    ctx.fillRect(sx - s * 0.08, sy - s * 0.10, s * 0.16, s * 0.16);
  }

  /* ---- 传送门 ---- */
  function drawTeleport(ctx, tp, sx, sy, scale) {
    var s = scale;
    var pulse = (Math.sin(Renderer.time * 2.5 + tp.x) + 1) / 2;
    ctx.strokeStyle = tp.unlocked ? 'rgba(90,200,255,' + (0.5 + pulse * 0.5) + ')' : 'rgba(120,120,120,0.5)';
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath(); ctx.arc(sx, sy, s * 0.42, 0, 6.29); ctx.stroke();
    ctx.fillStyle = tp.unlocked ? 'rgba(90,200,255,' + (0.12 + pulse * 0.15) + ')' : 'rgba(80,80,80,0.15)';
    ctx.beginPath(); ctx.arc(sx, sy, s * 0.40, 0, 6.29); ctx.fill();
    ctx.fillStyle = tp.unlocked ? '#9fe8ff' : '#888';
    ctx.font = 'bold ' + Math.max(10, s * 0.26) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◇ ' + tp.name, sx, sy - s * 0.55);
  }

  /* ---- NPC ---- */
  function drawNPC(ctx, npc, sx, sy, scale) {
    var s = scale * 0.95;
    drawShadow(ctx, sx, sy + s * 0.40, s, 1);
    var bob = Math.sin(npc.bob) * s * 0.02;
    var cy = sy - s * 0.5 + bob;
    ctx.strokeStyle = '#1a3a5a'; ctx.lineWidth = Math.max(2, s / 10); ctx.lineCap = 'round';
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(sx, cy - s * 0.32, s * 0.16, 0, 6.29); ctx.fill(); ctx.stroke();
    ctx.fillStyle = npc.role === 'shop' ? '#c0392b' : '#2980b9';
    ctx.fillRect(sx - s * 0.16, cy - s * 0.17, s * 0.32, s * 0.30);
    ctx.beginPath(); ctx.moveTo(sx, cy + s * 0.13); ctx.lineTo(sx, cy + s * 0.40); ctx.stroke();
    /* 头顶标识 */
    ctx.fillStyle = npc.role === 'shop' ? '#ffd750' : '#7ee0ff';
    ctx.font = 'bold ' + Math.max(11, s * 0.34) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(npc.role === 'shop' ? '🛒' : '❗', sx, cy - s * 0.52);
    ctx.fillStyle = '#dff2ff';
    ctx.font = Math.max(10, s * 0.24) + 'px monospace';
    ctx.fillText(npc.name, sx, cy - s * 0.68);
  }

  /* ---- 主绘制入口 ---- */
  Renderer.draw = function (game, dt) {
    var ctx = Renderer.ctx, cv = Renderer.canvas;
    Renderer.time += dt;

    /* 摄像机跟随玩家（平滑） */
    var p = game.player;
    Renderer.camera.x += (p.x - Renderer.camera.x) * Math.min(1, dt * 8);
    Renderer.camera.y += (p.y - Renderer.camera.y) * Math.min(1, dt * 8);

    /* 基础变换：全部绘制在“CSS 像素”逻辑空间完成，一次性放大到缓冲分辨率。
     * s = 缓冲宽/逻辑宽 = DPR/2（1 游戏像素恒等于 2 物理像素，清晰且有像素感） */
    var VW = Renderer.vw(), VH = Renderer.vh();
    ctx.setTransform(cv.width / VW, 0, 0, cv.height / VH, 0, 0);
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(0, 0, VW, VH);

    drawTerrain(ctx, game);

    var t = Config.TILE, z = Renderer.camera.zoom, scale = t * z;   // 一格的屏幕像素 = 火柴人身高基准

    /* 宝箱 */
    for (var i = 0; i < World.chests.length; i++) {
      var c = World.chests[i];
      var sp = Renderer.worldToScreen(c.x, c.y);
      if (sp.x < -50 || sp.y < -50 || sp.x > VW + 50 || sp.y > VH + 50) continue;
      drawChest(ctx, c, sp.x, sp.y, scale);
    }
    /* 传送门 */
    for (var j = 0; j < World.teleports.length; j++) {
      var tp = World.teleports[j];
      var st = Renderer.worldToScreen(tp.x, tp.y);
      if (st.x < -60 || st.y < -60 || st.x > VW + 60 || st.y > VH + 60) continue;
      drawTeleport(ctx, tp, st.x, st.y, scale);
    }
    /* NPC */
    for (var k = 0; k < game.npcs.length; k++) {
      var npc = game.npcs[k];
      var sn = Renderer.worldToScreen(npc.x, npc.y);
      if (sn.x < -60 || sn.y < -60 || sn.x > VW + 60 || sn.y > VH + 60) continue;
      drawNPC(ctx, npc, sn.x, sn.y, scale);
    }
    /* 敌人（按 y 排序实现遮挡关系） */
    var es = game.enemies.slice().sort(function (a, b) { return a.y - b.y; });
    for (var m = 0; m < es.length; m++) {
      var e = es[m];
      if (e.dead) continue;
      var se = Renderer.worldToScreen(e.x, e.y);
      if (se.x < -80 || se.y < -80 || se.x > VW + 80 || se.y > VH + 80) continue;
      drawEnemy(ctx, e, se.x, se.y, scale);
    }
    /* 队友（联机） */
    if (L.Net) {
      for (var id in L.Net.peers) {
        var mate = L.Net.peers[id];
        if (!mate.x) continue;
        var sm = Renderer.worldToScreen(mate.x, mate.y);
        if (sm.x < -80 || sm.y < -80 || sm.x > VW + 80 || sm.y > VH + 80) continue;
        drawStickman(ctx, sm.x, sm.y, scale * 0.95, {
          color: '#1f6f4f', dir: mate.dir, weapon: 'iron_sword',
          atkAnim: mate.atk ? 0.1 : 0, moving: true
        });
        ctx.fillStyle = '#9fe8b8';
        ctx.font = Math.max(10, scale * 0.22) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(mate.name + ' Lv' + (mate.lv || 1), sm.x, sm.y - scale * 1.1);
      }
    }

    /* 攻击挥砍弧 */
    for (var q = Renderer.slashes.length - 1; q >= 0; q--) {
      var sl = Renderer.slashes[q];
      sl.t -= dt;
      if (sl.t <= 0) { Renderer.slashes.splice(q, 1); continue; }
      var ss = Renderer.worldToScreen(sl.x, sl.y);
      var pr = 1 - sl.t / 0.22;
      ctx.save();
      ctx.translate(ss.x, ss.y);
      ctx.rotate(sl.angle);
      ctx.strokeStyle = Utils.hexA(sl.color || '#ffffff', 0.75 * (1 - pr));
      ctx.lineWidth = Math.max(3, scale * 0.10 * (1 - pr * 0.5));
      ctx.beginPath();
      ctx.arc(0, 0, sl.range * scale * (0.5 + pr * 0.5), -0.9 + pr * 1.2, 0.9 + pr * 1.2);
      ctx.stroke();
      ctx.restore();
    }

    /* 玩家（本人） */
    var ssp = Renderer.worldToScreen(p.x, p.y);
    drawShadow(ctx, ssp.x, ssp.y + scale * 0.42, scale, p.rollTime > 0 ? 0.7 : 1);
    var blink = p.invuln > 0 && p.rollTime <= 0 && Math.floor(Renderer.time * 12) % 2 === 0;
    if (!blink) {
      drawStickman(ctx, ssp.x, ssp.y, scale, {
        color: (p._hurtT > 0) ? '#c0392b' : '#2c3e50',
        headColor: (p._hurtT > 0) ? '#f4a89a' : '#f0c8a0',
        dir: p.dir,
        weapon: p.slots.weapon ? p.slots.weapon.type : null,
        atkAnim: p.atkAnim, moving: !!(Input.dirX || Input.dirY),
        roll: p.rollTime > 0
      });
    }
    /* 玩家名与血条 */
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(11, scale * 0.24) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.name + ' Lv' + p.lv, ssp.x, ssp.y - scale * 1.05);

    /* 弹道 */
    var pl = L.Projectile.list;
    for (var r = 0; r < pl.length; r++) {
      var pj = pl[r];
      var spp = Renderer.worldToScreen(pj.x, pj.y);
      ctx.save();
      ctx.translate(spp.x, spp.y);
      ctx.rotate(pj.angle);
      if (pj.kind === 'magic') {
        ctx.fillStyle = pj.color;
        ctx.beginPath(); ctx.arc(0, 0, scale * 0.09, 0, 6.29); ctx.fill();
        ctx.fillStyle = Utils.hexA(pj.color || '#a88cff', 0.35);
        ctx.beginPath(); ctx.arc(0, 0, scale * 0.16, 0, 6.29); ctx.fill();
      } else {
        ctx.strokeStyle = pj.color; ctx.lineWidth = Math.max(2, scale * 0.04);
        ctx.beginPath(); ctx.moveTo(-scale * 0.18, 0); ctx.lineTo(scale * 0.14, 0); ctx.stroke();
      }
      ctx.restore();
    }

    /* 粒子 */
    for (var s2 = Renderer.sparks.length - 1; s2 >= 0; s2--) {
      var sp2 = Renderer.sparks[s2];
      sp2.t -= dt;
      if (sp2.t <= 0) { Renderer.sparks.splice(s2, 1); continue; }
      sp2.x += sp2.vx * dt; sp2.y += sp2.vy * dt;
      var sps = Renderer.worldToScreen(sp2.x, sp2.y);
      ctx.fillStyle = Utils.hexA(sp2.color || '#fff', Math.max(0, sp2.t * 2));
      ctx.fillRect(sps.x - 2, spps_y(sps), 4, 4);
    }
    function spps_y(v) { return v.y - 2; }

    /* 飘字 */
    for (var f = Renderer.floats.length - 1; f >= 0; f--) {
      var ft = Renderer.floats[f];
      ft.t -= dt;
      if (ft.t <= 0) { Renderer.floats.splice(f, 1); continue; }
      ft.y -= dt * (ft.crit ? 1.5 : 0.8);        // 暴击飘得更高更快
      var sft = Renderer.worldToScreen(ft.x, ft.y);
      ctx.globalAlpha = Math.min(1, ft.t * 2);
      var fs = Math.max(12, scale * 0.26) * (ft.crit ? 1.55 : 1);
      ctx.font = 'bold ' + fs.toFixed(0) + 'px monospace';
      ctx.textAlign = 'center';
      /* 深色描边保证任何地表上都清晰可读 */
      ctx.lineWidth = Math.max(3, fs * 0.22);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(ft.text, sft.x, sft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, sft.x, sft.y);
      ctx.globalAlpha = 1;
    }

    /* 探索迷雾：未探索区域压暗（大地图隐藏感） */
    drawFog(ctx, game);

    /* 光照层：区域环境色 + 昼夜 + 暗角 + 玩家柔光 + 低血红晕 */
    Fx.applyLighting(ctx, game);

    /* 天气粒子（雪/雨/火星/落叶/尘埃/暗影/薄雾）画在光照之上，才有空气感 */
    Fx.draw(ctx, game);

    /* 虚拟摇杆可视化：触屏按住左半屏时显示（ox/oy 为 CSS 像素，与本空间一致） */
    if (Input && Input._touch && Input._touch.active) {
      var tox = Input._touch.ox, toy = Input._touch.oy;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tox, toy, 46, 0, 6.29); ctx.stroke();
      ctx.fillStyle = 'rgba(90,208,255,0.55)';
      ctx.beginPath();
      ctx.arc(tox + Input._touch.dx * 34, toy + Input._touch.dy * 34, 18, 0, 6.29);
      ctx.fill();
    }

    /* 交互提示（字号随缩放自适应，手机上保底 13px 可读） */
    var hint = game.interactHint();
    if (hint) {
      ctx.font = 'bold ' + Math.max(13, scale * 0.14) + 'px monospace';
      ctx.textAlign = 'center';
      var hw = ctx.measureText(hint).width + 40;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(VW / 2 - hw / 2, VH - 130, hw, 30);
      ctx.fillStyle = '#ffe9a0';
      ctx.fillText(hint, VW / 2, VH - 109);
    }
  };

  /* ---- 探索迷雾：把屏外未探索区域的格子涂黑 ---- */
  function drawFog(ctx, game) {
    var c = Renderer.camera, t = Config.TILE, z = c.zoom;
    var W = Renderer.vw(), H = Renderer.vh();
    var halfW = W / (2 * t * z), halfH = H / (2 * t * z);
    var step = 2;   // 每 2 格采样一次，控制开销
    var x0 = Math.floor(c.x - halfW), y0 = Math.floor(c.y - halfH);
    var x1 = Math.ceil(c.x + halfW), y1 = Math.ceil(c.y + halfH);
    var px = t * z * step;
    for (var ty = y0; ty <= y1; ty += step) {
      for (var tx = x0; tx <= x1; tx += step) {
        var rg = L.Config.getRegionAt(tx, ty);
        if (rg.id !== 'wild') continue;
        /* 只在道路附近保留可见，其余压暗（大陆其余部分等待探索） */
        var vis = false;
        for (var i = 0; i < game.npcs.length; i++) { }
        /* 简化：离任一已探索区域较近时可见 */
        for (var id in World.explored) {
          var rr = null;
          for (var q = 0; q < Config.REGIONS.length; q++) if (Config.REGIONS[q].id === id) rr = Config.REGIONS[q];
          if (rr && Utils.dist(tx, ty, rr.cx, rr.cy) < rr.r * 1.4) { vis = true; break; }
        }
        if (vis) continue;
                var scr = Renderer.worldToScreen(tx, ty);
        ctx.fillStyle = 'rgba(5,8,14,0.55)';
        ctx.fillRect(scr.x, scr.y, px + 1, px + 1);
      }
    }
  }

  /* ---- 小地图 ---- */
  var mmCache = null, mmCacheKey = '';
  Renderer.drawMinimap = function (ctx, game, x, y, size) {
    var key = game.worldSeed + '';
    if (!mmCache || mmCacheKey !== key) { mmCache = L.World.minimapData(96); mmCacheKey = key; }
    var cells = mmCache.cells, n = mmCache.size;
    var cellPx = size / n;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
    ctx.fillStyle = '#0a0f18'; ctx.fillRect(x, y, size, size);
    for (var i = 0; i < cells.length; i++) {
      ctx.fillStyle = cells[i];
      ctx.fillRect(x + (i % n) * cellPx, y + Math.floor(i / n) * cellPx, cellPx + 1, cellPx + 1);
    }
    /* 传送点 */
    var scale = size / Config.MAP_SIZE;
    for (var j = 0; j < World.teleports.length; j++) {
      var tp = World.teleports[j];
      ctx.fillStyle = tp.unlocked ? '#5ad0ff' : '#667';
      ctx.fillRect(x + tp.x * scale - 1.5, y + tp.y * scale - 1.5, 3, 3);
    }
    /* 任务 NPC 位置 */
    for (var k = 0; k < game.npcs.length; k++) {
      var npc = game.npcs[k];
      ctx.fillStyle = '#ffd750';
      ctx.fillRect(x + npc.x * scale - 2, y + npc.y * scale - 2, 4, 4);
    }
    /* 玩家 */
    var p = game.player;
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(x + p.x * scale - 2, y + p.y * scale - 2, 5, 5);
    ctx.strokeStyle = '#39465c'; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    ctx.restore();
  };

  L.Renderer = Renderer;
})(window);
