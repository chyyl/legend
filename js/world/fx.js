/* =============================================================================
 * 文件：js/world/fx.js
 * 职责：画面氛围与打击感特效（不参与游戏逻辑，纯表现层）。包含：
 *       1) 屏幕震动 shake   2) 全屏闪光 flash
 *       3) 区域天气粒子（雪/火星/薄雾/雨/落叶/尘埃/暗影粒子）
 *       4) 区域环境色 + 昼夜循环（让大陆"活"起来）
 *       5) 暗角 vignette 与玩家身边柔光
 * 依赖：js/core/utils.js、js/data/config.js（区域表）
 * 对外接口（Legend.Fx）：
 *   - init()                        重置粒子池
 *   - update(dt, game)              每帧推进（震动衰减、粒子生成与移动）
 *   - draw(ctx, game)               绘制天气粒子（在光照之上）
 *   - applyLighting(ctx, game)      绘制环境色/昼夜/暗角/玩家光/低血红晕
 *   - shake(mag, dur)               屏幕震动（mag 按旧 1/2 分辨率标定，内部 ×2 输出 CSS 像素）
 *   - flash(color, alpha, dur)      全屏闪光（升级/BOSS登场）
 *   - shakeX / shakeY               当前震动偏移（CSS 像素，renderer 的 worldToScreen 会叠加）
 *   - dayPhase                      昼夜相位 0~1（0=清晨 0.25=正午 0.5=黄昏 0.75=深夜）
 * 被引用：renderer.js（draw 中调用）、game.js（受击/爆炸时调用 shake/flash）
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils;

  /* ---- 各区域氛围配置 ----
   * tint: 环境色（叠加），weather: 天气类型，rate: 每秒生成粒子数
   * light: 玩家柔光颜色（暗区更明显）
   * ------------------------------------------------------------------ */
  var MOOD = {
    camp:    { tint: 'rgba(255,215,150,0.05)', weather: 'leaf',  rate: 3,  light: '255,225,170' },
    bay:     { tint: 'rgba(120,190,255,0.07)', weather: 'rain',  rate: 26, light: '190,225,255' },
    farm:    { tint: 'rgba(255,235,140,0.06)', weather: 'leaf',  rate: 6,  light: '255,240,190' },
    maze:    { tint: 'rgba(38,18,66,0.30)',    weather: 'void',  rate: 8,  light: '150,110,220' },
    armory:  { tint: 'rgba(150,162,182,0.07)', weather: 'dust',  rate: 5,  light: '210,220,235' },
    snow:    { tint: 'rgba(200,232,255,0.10)', weather: 'snow',  rate: 22, light: '230,245,255' },
    bridge:  { tint: 'rgba(140,200,255,0.08)', weather: 'mist',  rate: 4,  light: '200,230,255' },
    island:  { tint: 'rgba(232,226,200,0.07)', weather: 'dust',  rate: 5,  light: '240,236,215' },
    castle:  { tint: 'rgba(26,8,46,0.34)',     weather: 'void',  rate: 10, light: '140,90,210' },
    final:   { tint: 'rgba(118,20,10,0.22)',   weather: 'ember', rate: 20, light: '255,150,80' },
    wild:    { tint: 'rgba(0,0,0,0.0)',        weather: 'dust',  rate: 3,  light: '235,235,225' }
  };
  var MOOD_FALLBACK = MOOD.wild;

  var Fx = {
    shakeX: 0, shakeY: 0,
    dayPhase: 0.22,          // 开局正午偏早，画面明亮
    _shakeT: 0, _shakeDur: 0, _shakeMag: 0,
    _flashT: 0, _flashDur: 0, _flashA: 0, _flashColor: '#fff',
    _parts: [],              // 天气粒子池
    _rateCarry: 0,
    _t: 0
  };

  var MAX_PARTS = 200;
  /* 单位换算：天气粒子/震动的数值按旧“1/2 分辨率画布”标定（1 旧单位 = 2 CSS 像素），
   * 渲染切换到 CSS 像素空间后统一 ×PX，保证观感与旧版完全一致 */
  var PX = 2;

  Fx.init = function () {
    Fx._parts.length = 0;
    Fx.shakeX = Fx.shakeY = 0;
    Fx._shakeT = Fx._flashT = 0;
    Fx._rateCarry = 0;
  };

  /* ---- 屏幕震动 ---- */
  Fx.shake = function (mag, dur) {
    if (mag > Fx._shakeMag || Fx._shakeT <= 0) {
      Fx._shakeMag = Math.max(Fx._shakeMag * (Fx._shakeT > 0 ? Fx._shakeT / Fx._shakeDur : 0), mag);
      Fx._shakeDur = dur || 0.25;
      Fx._shakeT = Fx._shakeDur;
    }
  };

  /* ---- 全屏闪光 ---- */
  Fx.flash = function (color, alpha, dur) {
    Fx._flashColor = color || '#ffffff';
    Fx._flashA = alpha || 0.35;
    Fx._flashDur = dur || 0.3;
    Fx._flashT = Fx._flashDur;
  };

  /* ---- 依据玩家所在区域取氛围 ---- */
  function moodOf(game) {
    var p = game.player;
    if (!p) return MOOD_FALLBACK;
    var rg = Config.getRegionAt(Math.floor(p.x), Math.floor(p.y));
    return MOOD[rg.id] || MOOD_FALLBACK;
  }

  /* ---- 生成一个天气粒子（屏幕空间；内部沿用旧 1/2 分辨率单位，绘制时 ×PX） ---- */
  function spawnPart(kind, W, H) {
    var p = { kind: kind, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, ph: Math.random() * 6.28 };
    switch (kind) {
      case 'snow':
        p.x = Math.random() * W; p.y = -4;
        p.vx = Utils.lerp(-6, 6, Math.random()); p.vy = Utils.lerp(14, 30, Math.random());
        p.size = Math.random() < 0.3 ? 2 : 1; p.max = 12; break;
      case 'rain':
        p.x = Math.random() * (W + 60) - 30; p.y = -6;
        p.vx = -18; p.vy = Utils.lerp(150, 210, Math.random());
        p.size = 1; p.max = 2.2; break;
      case 'ember':
        p.x = Math.random() * W; p.y = H + 4;
        p.vx = Utils.lerp(-10, 10, Math.random()); p.vy = Utils.lerp(-26, -52, Math.random());
        p.size = Math.random() < 0.35 ? 2 : 1; p.max = 4.5; break;
      case 'leaf':
        p.x = Math.random() * W; p.y = -4;
        p.vx = Utils.lerp(-12, 20, Math.random()); p.vy = Utils.lerp(8, 20, Math.random());
        p.size = Math.random() < 0.4 ? 2 : 1; p.max = 9; break;
      case 'dust':
        p.x = Math.random() * W; p.y = Math.random() * H;
        p.vx = Utils.lerp(-5, 5, Math.random()); p.vy = Utils.lerp(-4, 4, Math.random());
        p.size = 1; p.max = Utils.lerp(4, 9, Math.random()); break;
      case 'void':
        p.x = Math.random() * W; p.y = H + 4;
        p.vx = Utils.lerp(-6, 6, Math.random()); p.vy = Utils.lerp(-12, -30, Math.random());
        p.size = Math.random() < 0.25 ? 2 : 1; p.max = 5; break;
      case 'mist':
        p.x = Math.random() * W; p.y = H * Utils.lerp(0.45, 1, Math.random());
        p.vx = Utils.lerp(6, 18, Math.random()); p.vy = Utils.lerp(-2, 2, Math.random());
        p.size = Utils.lerp(10, 26, Math.random()); p.max = Utils.lerp(6, 12, Math.random()); break;
      default:
        return null;
    }
    p.life = p.max;
    return p;
  }

  /* ---- 每帧更新：震动衰减 + 昼夜推进 + 粒子生成与移动 ---- */
  Fx.update = function (dt, game) {
    Fx._t += dt;

    /* 昼夜循环：约 5 分钟一整天，画面缓慢从清晨->正午->黄昏->深夜 */
    Fx.dayPhase = (Fx.dayPhase + dt / 300) % 1;

    /* 震动衰减（带轻微随机抖动）；mag 为旧单位，×PX 换算成 CSS 像素偏移 */
    if (Fx._shakeT > 0) {
      Fx._shakeT -= dt;
      var k = Math.max(0, Fx._shakeT / Fx._shakeDur);
      var mag = Fx._shakeMag * k * k * PX;             // 二次衰减，收尾干净
      var a = Math.random() * Math.PI * 2;
      Fx.shakeX = Math.cos(a) * mag;
      Fx.shakeY = Math.sin(a) * mag;
    } else {
      Fx.shakeX = Fx.shakeY = 0;
      Fx._shakeMag = 0;
    }
    if (Fx._flashT > 0) Fx._flashT -= dt;

    /* 天气粒子：按区域速率生成，粒子池有上限 */
    if (!game || !game.player) return;
    var cv = L.Renderer && L.Renderer.canvas;
    if (!cv) return;
    /* 粒子活动范围用旧单位（vw/PX），与 spawnPart 数值标定一致 */
    var W = L.Renderer.vw() / PX, H = L.Renderer.vh() / PX;
    var mood = moodOf(game);
    Fx._rateCarry += mood.rate * dt;
    while (Fx._rateCarry >= 1 && Fx._parts.length < MAX_PARTS) {
      Fx._rateCarry -= 1;
      var np = spawnPart(mood.weather, W, H);
      if (np) Fx._parts.push(np);
    }
    if (Fx._rateCarry > 4) Fx._rateCarry = 4;

    /* 移除越界/过期粒子 */
    for (var i = Fx._parts.length - 1; i >= 0; i--) {
      var p = Fx._parts[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'snow' || p.kind === 'leaf') p.x += Math.sin(Fx._t * 2 + p.ph) * 0.35;  // 飘摆
      if (p.life <= 0 || p.y > H + 30 || p.y < -30 || p.x < -60 || p.x > W + 60) {
        Fx._parts.splice(i, 1);
      }
    }
  };

  /* ---- 绘制天气粒子（应在光照层之上，才有"空气中"的层次感） ---- */
  Fx.draw = function (ctx, game) {
    /* 基础变换位于 CSS 空间，此处 ×PX 把旧单位粒子换算成 CSS 像素 */
    var R = L.Renderer;
    var W = R && R.vw ? R.vw() / PX : 640, H = R && R.vh ? R.vh() / PX : 360;
    ctx.save();
    ctx.scale(PX, PX);
    for (var i = 0; i < Fx._parts.length; i++) {
      var p = Fx._parts[i];
      var a = Utils.clamp(Math.min(1, p.life / 0.8), 0, 1);   // 淡入淡出
      switch (p.kind) {
        case 'snow':
          ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * a) + ')';
          ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
          break;
        case 'rain':
          ctx.strokeStyle = 'rgba(175,215,255,' + (0.5 * a) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x | 0, p.y | 0);
          ctx.lineTo((p.x - p.vx * 0.02) | 0, (p.y - p.vy * 0.02) | 0);
          ctx.stroke();
          break;
        case 'ember':
          ctx.fillStyle = 'rgba(255,' + (140 + (80 * ((p.ph + Fx._t) % 1)) | 0) + ',60,' + (0.8 * a) + ')';
          ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
          break;
        case 'leaf':
          ctx.fillStyle = 'rgba(214,232,150,' + (0.5 * a) + ')';
          ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
          break;
        case 'dust':
          ctx.fillStyle = 'rgba(235,228,190,' + (0.28 * a) + ')';
          ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
          break;
        case 'void':
          ctx.fillStyle = 'rgba(150,90,230,' + (0.45 * a) + ')';
          ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
          break;
        case 'mist':
          var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, 'rgba(215,235,255,' + (0.10 * a) + ')');
          g.addColorStop(1, 'rgba(215,235,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.29); ctx.fill();
          break;
      }
    }
    /* 全屏闪光（升级/BOSS登场） */
    if (Fx._flashT > 0) {
      ctx.globalAlpha = Utils.clamp(Fx._flashA * (Fx._flashT / Fx._flashDur), 0, 1);
      ctx.fillStyle = Fx._flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  /* ---- 光照层：区域环境色 + 昼夜 + 暗角 + 玩家柔光 + 低血红晕 ---- */
  Fx.applyLighting = function (ctx, game) {
    /* 全部为 W/H 比例运算，直接用 CSS 逻辑尺寸即可与视口自适应 */
    var R = L.Renderer;
    var W = R && R.vw ? R.vw() : ctx.canvas.width, H = R && R.vh ? R.vh() : ctx.canvas.height;
    var p = game.player;
    if (!p) return;
    var cx = W / 2, cy = H / 2;
    var mood = moodOf(game);

    ctx.save();

    /* 1) 区域环境色（整体氛围） */
    if (mood.tint && mood.tint.indexOf(',0.0)') < 0) {
      ctx.fillStyle = mood.tint;
      ctx.fillRect(0, 0, W, H);
    }

    /* 2) 昼夜：深夜/黄昏时叠加冷色暗调（正午几乎无感） */
    var dp = Fx.dayPhase;
    var night = 0;
    if (dp > 0.55 && dp < 0.95) {                       // 黄昏->深夜->清晨
      var t = (dp - 0.55) / 0.40;
      night = Math.sin(t * Math.PI) * 0.34;             // 中段最暗
    }
    if (night > 0.001) {
      ctx.fillStyle = 'rgba(14,22,58,' + night.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    /* 3) 暗角 vignette：四周压暗，聚焦玩家 */
    var vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.28, cx, cy, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,' + (0.34 + night * 0.5).toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    /* 4) 玩家柔光：暗区（迷宫/城堡/夜晚）时给玩家一圈光，营造火把感 */
    var darkness = night + (mood.tint.indexOf('rgba(3') === 0 || mood.tint.indexOf('rgba(2') === 0 ? 0.18 : 0);
    if (darkness > 0.06) {
      var lr = Math.min(W, H) * 0.34;
      var lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, lr);
      lg.addColorStop(0, 'rgba(' + mood.light + ',' + (0.16 * Math.min(1, darkness * 2.4)).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(' + mood.light + ',0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(cx, cy, lr, 0, 6.29); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* 5) 低血红晕：血量低于 30% 时屏幕边缘呼吸红光 */
    var lowHp = 1 - Utils.clamp(p.hp / (p.maxHp * 0.3), 0, 1);
    if (lowHp > 0) {
      var pulse = 0.5 + 0.5 * Math.sin(Fx._t * 5);
      var rg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.30, cx, cy, Math.max(W, H) * 0.70);
      rg.addColorStop(0, 'rgba(180,20,20,0)');
      rg.addColorStop(1, 'rgba(180,20,20,' + (0.42 * lowHp * (0.55 + 0.45 * pulse)).toFixed(3) + ')');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    /* 6) 受击红闪（由 game 在玩家受伤时调用 Fx.hitFlash 更精确，此处用 hurtT 兜底） */
    if (p._hurtT > 0) {
      ctx.fillStyle = 'rgba(200,30,30,' + (0.28 * p._hurtT).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  };

  /* 玩家受伤红闪计时（由 game.js 调用） */
  Fx.hurt = function (player, amount) {
    if (amount > 0) player._hurtT = 0.35;
  };

  L.Fx = Fx;
})(window);
