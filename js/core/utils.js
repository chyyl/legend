/* ============================================================================
   js/core/utils.js —— 通用工具库（种子随机/数学/存储/事件总线）
   ----------------------------------------------------------------------------
   职责：提供无副作用的纯工具函数，供所有模块调用。

   对外接口（window.LG.U）：
     .rng(seed) -> fn  种子随机数生成器（0~1）
     .randInt(a,b) .pick(arr) .clamp .lerp .dist2 .dist
     .fmt(n) .pct(n)
     .LS.get/.set/.del  localStorage 安全封装（APK离线可用）
     .bus.on/.emit       极简事件总线（模块间解耦通信）

   设计守则：任何模块不得直接访问 localStorage，一律经 .LS 以便统一迁移。
   依赖：core/config.js（仅类型引用，无强依赖）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  /* mulberry32：轻量可复现种子随机，保证同一种子生成同一世界（Q59 存档策略基础） */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const U = {
    rng,
    // [a,b] 闭区间整数随机
    randInt: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    // 区间随机：null 原样返回，[a,b] 返回 a~b 随机（Q27 固定值+区间随机）
    range: (r) => (r == null ? null : r[0] + Math.random() * (r[1] - r[0])),
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist2: (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2,
    dist: (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2),
    fmt: (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n))),
    pct: (n) => (n * 100).toFixed(0) + '%',

    /* localStorage 封装：JSON 序列化 + 容错（隐私模式/存储满时降级到内存） */
    LS: (() => {
      const mem = {};
      let ok = true;
      try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); }
      catch (e) { ok = false; } // 无 localStorage（如某些 WebView）则用内存
      return {
        get(k, def) {
          try {
            const s = ok ? localStorage.getItem(k) : mem[k];
            return s == null ? def : JSON.parse(s);
          } catch (e) { return def; }
        },
        set(k, v) {
          const s = JSON.stringify(v);
          if (ok) { try { localStorage.setItem(k, s); } catch (e) { ok = false; mem[k] = s; } }
          else mem[k] = s;
        },
        del(k) { if (ok) localStorage.removeItem(k); else delete mem[k]; },
      };
    })(),

    /* 事件总线：模块间通信的唯一推荐通道，避免直接相互引用 */
    bus: (() => {
      const map = {};
      return {
        on(evt, fn) { (map[evt] = map[evt] || []).push(fn); return () => U.bus.off(evt, fn); },
        off(evt, fn) { const a = map[evt]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
        emit(evt, data) { (map[evt] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } }); },
      };
    })(),
  };

  LG.U = U;
})();
