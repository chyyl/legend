/* ============================================================================
   js/world/decor.js —— 区域特色景物系统（阶段二十四：幸存者营地重建 + 各区域特色）
   ----------------------------------------------------------------------------
   职责：按区域配方确定性放置装饰景物（帐篷/篝火/木栅栏/房屋/风车/雪松/断刃……），
         提供分层渲染（矮物在实体下层；高物按与玩家的前后关系拆上下层）、
         实心景物占格碰撞（terrain 的 freeTile/walkable 查询）、
         跨海大桥桥面（木板/护栏/桥墩）的识别与绘制。

   对外接口（window.LG.Decor）：
     .generate(seed)            清空并按种子重建景物（幂等；Terrain.generate 之后调用）
     .solidAt(x, y)             实心景物占格判定（碰撞热路径；未就绪快速 false）
     .drawUnder(g, view, draw)  实体前：桥面 + 矮景物 + 玩家身后的高物
     .drawOver(g, view, draw)   玩家后：玩家身前的高物（引擎画完玩家精灵后调用）
     .setEnabled(bool) / .enabled  设置页「装饰景物」开关（只控视觉；碰撞恒生效）
     .count(regionId?) / ._list()  统计与测试取证
     ._ready

   设计守则：
     1) 确定性：位置来自种子 rng（同种子同世界 Q59，联机各端一致）；占位失败
        （地形不合/占格冲突）静默跳过，绝不回写地形，世界可走性不受景物影响。
     2) 碰撞与视觉解耦：solidAt 只读占格集合；开关只影响 draw*，寻路永远稳定。
     3) 实心景物只落"开阔平地"（占格外扩一圈须全部平坦可走，防堵山口水道），
        离任意区域中心 ≥10 格（NPC/宝箱/出生/BOSS 落点留白）、避开 NPC站位、不占路面；
        迷宫/桥面只放非实心景物（onRoad 标记），通路永不被堵。
     4) 桥不生成静态数据：terrain.buildRoads 把路压过水面时登记桥格（Set），
        本模块据此画木板/护栏/桥墩，大地图烘焙同源描色（跨海大桥/骷髅岛吊桥通用）。

   依赖：core/config.js、world/terrain.js（生成后查询）、core/utils.js（种子随机）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const W = 2000;
  const T_WATER = 5, T_ROAD = 6, T_WALL = 7; // 与 terrain.js 常量一致

  /* ---------- 景物类型表：w/h 占格；solid 参与碰撞；tall 参与玩家前后分层 ---------- */
  const TYPES = {
    tent:       { w: 2, h: 2, solid: true,  tall: true  },
    house:      { w: 3, h: 3, solid: true,  tall: true  },
    windmill:   { w: 2, h: 2, solid: true,  tall: true  },
    tower:      { w: 2, h: 2, solid: true,  tall: true  },
    pine:       { w: 2, h: 2, solid: true,  tall: true  },
    deadtree:   { w: 2, h: 2, solid: true,  tall: true  },
    furnace:    { w: 2, h: 2, solid: true,  tall: true  },
    palisade:   { w: 1, h: 1, solid: true,  tall: false },
    crate:      { w: 1, h: 1, solid: true,  tall: false },
    barrel:     { w: 1, h: 1, solid: true,  tall: false },
    anvil:      { w: 1, h: 1, solid: true,  tall: false },
    skullstone: { w: 1, h: 1, solid: true,  tall: false },
    banner:     { w: 1, h: 1, solid: true,  tall: false },
    campfire:   { w: 1, h: 1, solid: false, tall: false },
    brazier:    { w: 1, h: 1, solid: false, tall: false },
    torch:      { w: 1, h: 1, solid: false, tall: false },
    scarecrow:  { w: 1, h: 1, solid: false, tall: false },
    crop:       { w: 5, h: 4, solid: false, tall: false },
    rack:       { w: 1, h: 1, solid: false, tall: false },
    bonepile:   { w: 1, h: 1, solid: false, tall: false },
    wisp:       { w: 1, h: 1, solid: false, tall: false },
    crystal:    { w: 1, h: 1, solid: false, tall: false },
  };

  /* ---------- 区域配方（n 数量 / rMin~rMax 环半径 / arc 角度区间 / at 固定偏移 /
                  v 固定外观 / vv 外观档数 / onRoad 允许铺在路面（仅非实心）） ---------- */
  const RECIPE = {
    // 幸存者营地（反馈"这是幸存者营地，不是大草原"）：黄土广场 + 环形帐篷 + 木栅栏 + 篝火
    camp: [
      { t: 'campfire', at: [[-3, 10]] },
      { t: 'tent', n: 9, rMin: 13, rMax: 27, vv: 3 },
      { t: 'palisade', n: 26, rMin: 31, rMax: 33.5 },
      { t: 'crate', n: 8, rMin: 10, rMax: 29 },
      { t: 'barrel', n: 6, rMin: 10, rMax: 27 },
      { t: 'banner', n: 4, rMin: 11, rMax: 17, vv: 3 },
      { t: 'torch', n: 4, rMin: 9, rMax: 19, onRoad: true },
    ],
    // 边境长城：墙线箭塔/旌旗/火盆 + 南面木栅（路面自动留出关口缺口）
    wall: [
      { t: 'tower', n: 4, rMin: 62, rMax: 84, arc: [-Math.PI * 0.92, -Math.PI * 0.08], v: 0 },
      { t: 'banner', n: 6, rMin: 40, rMax: 90, arc: [-Math.PI * 0.95, -Math.PI * 0.05], vv: 3 },
      { t: 'brazier', n: 4, rMin: 30, rMax: 70, arc: [-Math.PI, 0] },
      { t: 'palisade', n: 10, rMin: 30, rMax: 46, arc: [0.15, Math.PI * 0.85] },
      { t: 'crate', n: 5, rMin: 12, rMax: 34 },
      { t: 'bonepile', n: 4, rMin: 25, rMax: 60 },
    ],
    // 海湾小镇：彩色房屋 + 码头箱桶 + 灯火
    bay: [
      { t: 'house', n: 6, rMin: 14, rMax: 30, vv: 4 },
      { t: 'crate', n: 6, rMin: 11, rMax: 32 },
      { t: 'barrel', n: 8, rMin: 11, rMax: 30 },
      { t: 'banner', n: 3, rMin: 12, rMax: 20, vv: 3 },
      { t: 'torch', n: 3, rMin: 10, rMax: 22, onRoad: true },
    ],
    // 彬祥农业园：谷仓 + 风车 + 麦田垄行 + 稻草人 + 田埂栅栏
    farm: [
      { t: 'house', n: 1, rMin: 13, rMax: 18, v: 0 },
      { t: 'windmill', n: 1, rMin: 16, rMax: 26 },
      { t: 'crop', n: 7, rMin: 15, rMax: 34 },
      { t: 'scarecrow', n: 4, rMin: 16, rMax: 33 },
      { t: 'palisade', n: 12, rMin: 30, rMax: 40 },
    ],
    // 黑暗迷宫：幽蓝魂火 + 骨堆（全部非实心且 onRoad，走廊通行永远不受影响）
    maze: [
      { t: 'wisp', n: 12, rMin: 11, rMax: 105, onRoad: true },
      { t: 'bonepile', n: 12, rMin: 11, rMax: 105, onRoad: true },
    ],
    // 西北兵工厂：锻炉 + 铁砧 + 断刃架 + 箱桶
    armory: [
      { t: 'furnace', n: 1, rMin: 14, rMax: 22 },
      { t: 'anvil', n: 4, rMin: 12, rMax: 26 },
      { t: 'rack', n: 10, rMin: 12, rMax: 34 },
      { t: 'crate', n: 8, rMin: 11, rMax: 30 },
      { t: 'barrel', n: 6, rMin: 11, rMax: 28 },
      { t: 'banner', n: 3, rMin: 12, rMax: 20, vv: 3 },
    ],
    // 绝壁雪山：雪松 + 冰晶 + 军帐篝火 + 断刃
    snow: [
      { t: 'pine', n: 14, rMin: 16, rMax: 42, vv: 2 },
      { t: 'crystal', n: 6, rMin: 14, rMax: 38 },
      { t: 'tent', n: 2, rMin: 15, rMax: 24, vv: 3 },
      { t: 'campfire', n: 1, rMin: 14, rMax: 20 },
      { t: 'rack', n: 5, rMin: 14, rMax: 30 },
    ],
    // 跨海大桥：桥本体由 drawBridge 运行时绘制；陆侧补箱桶与旗帜
    bridge: [
      { t: 'crate', n: 4, rMin: 12, rMax: 30 },
      { t: 'banner', n: 3, rMin: 14, rMax: 28, vv: 3 },
    ],
    // 骷髅岛：头骨石 + 枯木 + 白骨 + 幽绿火盆
    isle: [
      { t: 'skullstone', n: 8, rMin: 12, rMax: 40 },
      { t: 'deadtree', n: 10, rMin: 14, rMax: 44 },
      { t: 'bonepile', n: 12, rMin: 11, rMax: 42 },
      { t: 'brazier', n: 3, rMin: 14, rMax: 30, v: 1 },
    ],
    // 黑暗城堡：石塔 + 黑旗 + 铁火盆 + 断刃 + 头骨石
    castle: [
      { t: 'tower', n: 4, rMin: 33, rMax: 44, v: 1 },
      { t: 'tower', n: 2, rMin: 46, rMax: 56, v: 1 },
      { t: 'banner', n: 8, rMin: 14, rMax: 44, v: 3 },
      { t: 'brazier', n: 6, rMin: 13, rMax: 38 },
      { t: 'rack', n: 6, rMin: 14, rMax: 36 },
      { t: 'skullstone', n: 4, rMin: 16, rMax: 40 },
    ],
    // 终末之战：断刃之野 + 破旗 + 幽光裂晶 + 白骨 + 枯木
    final: [
      { t: 'rack', n: 16, rMin: 13, rMax: 46 },
      { t: 'banner', n: 6, rMin: 14, rMax: 40, v: 3 },
      { t: 'crystal', n: 8, rMin: 13, rMax: 42, v: 1 },
      { t: 'bonepile', n: 8, rMin: 14, rMax: 44 },
      { t: 'deadtree', n: 5, rMin: 18, rMax: 46 },
    ],
  };

  /* ---------- 运行态 ---------- */
  let props = [];              // [{t,x,y,v,r}] 按 y 升序（生成末尾排序）
  let solidSet = null;         // 实心占格索引集合（y*W+x）
  let taken = null;            // 全部景物占格（防重叠/防贴身）
  let tiles = null, heights = null, centers = null, npcs = [];
  let rng = null;
  let ready = false;
  let _en = null;              // 视觉开关（null=未读档缓存）

  function on() {
    if (_en === null) _en = LG.U.LS.get('decorFx', true);
    return _en;
  }

  /* ---------- 生成 ---------- */
  function generate(seed) {
    seed = seed || LG.Config.SEED;
    props = [];
    solidSet = new Set();
    taken = new Set();
    ready = false;
    if (!LG.Terrain || !LG.Terrain.ready) return false;
    const raw = LG.Terrain.raw();
    tiles = raw.tiles; heights = raw.height;
    centers = LG.Config.REGIONS.map((r) => [r.cx, r.cy]);
    npcs = (LG.NPC && LG.NPC.list) ? LG.NPC.list.slice() : [];
    rng = LG.U.rng(seed + 7777);
    LG.Config.REGIONS.forEach((rg) => {
      const spec = RECIPE[rg.id];
      if (spec) spec.forEach((s) => place(rg, s));
    });
    placeBridgeLamps();
    props.sort((a, b) => (a.y + TYPES[a.t].h) - (b.y + TYPES[b.t].h));
    ready = true;
    return true;
  }

  /* 环形/定点摆放：n 个沿 arc 均布（角向抖动 + 半径抖动），失败最多重试 40 次 */
  function place(rg, spec) {
    const T = TYPES[spec.t];
    if (spec.at) { spec.at.forEach(([dx, dy]) => tryPlace(spec.t, (rg.cx + dx) | 0, (rg.cy + dy) | 0, spec)); return; }
    const arc = spec.arc || [0, Math.PI * 2];
    const span = arc[1] - arc[0];
    for (let k = 0; k < spec.n; k++) {
      let done = false;
      for (let tr = 0; tr < 40 && !done; tr++) {
        const a = arc[0] + span * ((k + rng() * 0.85) / spec.n);
        const r = spec.rMin + rng() * (spec.rMax - spec.rMin);
        const x = Math.round(rg.cx + Math.cos(a) * r) - (T.w >> 1);
        const y = Math.round(rg.cy + Math.sin(a) * r) - (T.h >> 1);
        done = tryPlace(spec.t, x, y, spec);
      }
    }
  }

  /* 落位校验（全部通过才入表）：
     - 占格(+实心外扩一圈)不出界、不与已有景物重叠、非水/非墙/非高山；
     - 实心：不占路面、占格与外扩圈全部平坦(h0)——只落开阔平地，防堵山口水道；
     - 非实心：可走即可（onRoad 时允许路面，迷宫走廊/桥面专用）；
     - 离任意区域中心 ≥10 格；实心再加"距 NPC 2 格"避让。 */
  function tryPlace(t, x, y, spec) {
    const T = TYPES[t];
    if (!T) return false;
    x |= 0; y |= 0;
    const m = T.solid ? 1 : 0;
    for (let oy = -m; oy < T.h + m; oy++) {
      for (let ox = -m; ox < T.w + m; ox++) {
        const px = x + ox, py = y + oy;
        if (px < 1 || py < 1 || px >= W - 1 || py >= W - 1) return false;
        const i = py * W + px;
        if (taken.has(i)) return false;
        const tt = tiles[i], hh = heights[i];
        if (tt === T_WATER || tt === T_WALL || hh === 2) return false;
        const inner = ox >= 0 && oy >= 0 && ox < T.w && oy < T.h;
        if (T.solid) {
          if (tt === T_ROAD || hh !== 0) return false;
        } else if (inner && tt === T_ROAD && !spec.onRoad) return false;
        else if (!inner && hh !== 0) return false;
      }
    }
    // 区域中心留白（NPC/宝箱/出生/BOSS 落点）
    for (let c = 0; c < centers.length; c++) {
      const cx = centers[c][0], cy = centers[c][1];
      const dx = Math.max(x - cx, 0, cx - (x + T.w));
      const dy = Math.max(y - cy, 0, cy - (y + T.h));
      if (dx * dx + dy * dy < 100) return false;
    }
    // 实心景物避让 NPC 站位（2 格盒测）
    if (T.solid) {
      for (let n = 0; n < npcs.length; n++) {
        const np = npcs[n];
        if (np.x >= x - 2 && np.x <= x + T.w + 1 && np.y >= y - 2 && np.y <= y + T.h + 1) return false;
      }
    }
    const v = spec.v != null ? spec.v : (spec.vv ? (rng() * spec.vv) | 0 : 0);
    props.push({ t, x, y, v, r: (LG.Terrain.regionOf(x, y) || {}).id || '' });
    for (let oy = 0; oy < T.h; oy++) {
      for (let ox = 0; ox < T.w; ox++) {
        const i = (y + oy) * W + (x + ox);
        taken.add(i);
        if (T.solid) solidSet.add(i);
      }
    }
    return true;
  }

  /* 桥面灯柱：桥格中临水一侧每 ~10 格立一根（非实心 onRoad，不占通行） */
  function placeBridgeLamps() {
    const bl = LG.Terrain.bridgeTiles ? LG.Terrain.bridgeTiles() : null;
    if (!bl || !bl.size) return;
    const edge = [];
    bl.forEach((i) => {
      const x = i % W, y = (i / W) | 0;
      if (tiles[i - 1] === T_WATER || tiles[i + 1] === T_WATER || tiles[i - W] === T_WATER || tiles[i + W] === T_WATER) edge.push(i);
    });
    for (let k = 0; k < edge.length; k += 10) {
      const i = edge[k];
      tryPlace('torch', i % W, (i / W) | 0, { t: 'torch', onRoad: true });
    }
  }

  /* ---------- 查询 ---------- */
  function solidAt(x, y) {
    if (!ready || !solidSet) return false;
    return solidSet.has((y | 0) * W + (x | 0));
  }
  function count(regionId) {
    if (!regionId) return props.length;
    return props.filter((p) => p.r === regionId).length;
  }

  /* ---------- 对外接口（drawUnder/drawOver/drawBridge/DRAW 见文件下半部分） ---------- */
  LG.Decor = {
    generate, solidAt, count, drawUnder, drawOver,
    _list: () => props,
    setEnabled(v) { _en = !!v; LG.U.LS.set('decorFx', _en); },
    get enabled() { return on(); },
    get _ready() { return ready; },
  };
  // ---- 绘制实现（函数声明在本作用域自动提升；DRAW 表见文件末尾）----

  /* 高物分层判定：与玩家比 y 中点，靠屏幕下方者后画（在前）。
     矮物恒走实体下层——与本作"玩家永远盖在敌人身上"的固定绘制顺序保持同一口径。 */
  function behindPlayer(p) {
    const py = (LG.Player ? LG.Player.y : 0) + 0.5;
    return p.y + TYPES[p.t].h / 2 <= py;
  }
  function inView(p, view) {
    const T = TYPES[p.t];
    return !(p.x + T.w < view.x0 || p.x > view.x1 || p.y + T.h < view.y0 || p.y > view.y1);
  }

  function drawUnder(g, view, draw) {
    if (_en === null) _en = LG.U.LS.get('decorFx', true);
    if (!_en || !ready) return;
    drawBridge(g, view, draw);
    for (let k = 0; k < props.length; k++) {
      const p = props[k];
      if (TYPES[p.t].tall && !behindPlayer(p)) continue; // 身前高物留给上层
      if (inView(p, view)) drawProp(g, p, draw);
    }
  }
  function drawOver(g, view, draw) {
    if (_en === null) _en = LG.U.LS.get('decorFx', true);
    if (!_en || !ready) return;
    for (let k = 0; k < props.length; k++) {
      const p = props[k];
      if (!TYPES[p.t].tall || behindPlayer(p)) continue;
      if (inView(p, view)) drawProp(g, p, draw);
    }
  }
  function drawProp(g, p, draw) {
    if (LG.Terrain.isMazeAt(p.x, p.y) && !LG.Terrain.fog.visible(p.x, p.y)) return;
    const s = LG.Camera.worldToScreen(p.x, p.y);
    const fn = DRAW[p.t];
    if (fn) fn(g, p, s.x, s.y, draw, performance.now() / 1000);
  }

  /* 跨海大桥（terrain.buildRoads 登记的桥格）：桥墩 -> 桥面木板 -> 临水护栏 */
  function drawBridge(g, view, draw) {
    const bl = LG.Terrain.bridgeTiles ? LG.Terrain.bridgeTiles() : null;
    if (!bl || !bl.size) return;
    const x0 = Math.max(1, view.x0 | 0), x1 = Math.min(W - 2, view.x1 | 0);
    const y0 = Math.max(1, view.y0 | 0), y1 = Math.min(W - 2, view.y1 | 0);
    // 1) 桥墩：临桥的水格贴桥沿立石柱（先画，随后桥面板压住柱顶形成"柱托桥"）
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (tiles[i] !== T_WATER) continue;
        let from = -1;
        if (bl.has(i + W)) from = 0;       // 桥在本格南侧 -> 柱贴底沿
        else if (bl.has(i - W)) from = 1;  // 桥在北侧 -> 柱贴顶沿
        else if (bl.has(i + 1)) from = 2;  // 桥在东侧 -> 柱贴右沿
        else if (bl.has(i - 1)) from = 3;  // 桥在西侧 -> 柱贴左沿
        if (from < 0) continue;
        const s = LG.Camera.worldToScreen(x, y);
        pillar(g, s.x, s.y, draw, from);
      }
    }
    // 2) 桥面 + 护栏
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (!bl.has(i)) continue;
        const s = LG.Camera.worldToScreen(x, y);
        planks(g, s.x, s.y, draw,
          tiles[i - W] === T_WATER, tiles[i + W] === T_WATER,
          tiles[i - 1] === T_WATER, tiles[i + 1] === T_WATER);
      }
    }
  }
  function pillar(g, sx, sy, d, from) {
    const w = d * 0.34, L = d * 0.96;
    let x, y, ww, hh;
    if (from === 0) { x = sx + (d - w) / 2; y = sy + d - L; ww = w; hh = L; }
    else if (from === 1) { x = sx + (d - w) / 2; y = sy; ww = w; hh = L; }
    else if (from === 2) { x = sx + d - L; y = sy + (d - w) / 2; ww = L; hh = w; }
    else { x = sx; y = sy + (d - w) / 2; ww = L; hh = w; }
    R(g, x, y, ww, hh, '#6f6a60');
    R(g, x, y, ww, Math.max(1, hh * 0.06), '#8d877a');
    R(g, x + ww - Math.max(2, ww * 0.14), y, Math.max(2, ww * 0.14), hh, '#565149');
    R(g, x, y + hh - Math.max(2, hh * 0.1), ww, Math.max(2, hh * 0.1), '#565149');
  }
  function planks(g, sx, sy, d, wN, wS, wW, wE) {
    R(g, sx, sy, d, d, '#9d7b52');
    if (wN || wS) for (let k = 1; k < 4; k++) R(g, sx + (k * d) / 4, sy, Math.max(1, d * 0.04), d, 'rgba(70,48,26,0.85)');
    else for (let k = 1; k < 4; k++) R(g, sx, sy + (k * d) / 4, d, Math.max(1, d * 0.04), 'rgba(70,48,26,0.85)');
    R(g, sx, sy, d, Math.max(1, d * 0.05), 'rgba(255,235,200,0.18)');
    if (wN) rail(g, sx, sy, d, 'n');
    if (wS) rail(g, sx, sy, d, 's');
    if (wW) rail(g, sx, sy, d, 'w');
    if (wE) rail(g, sx, sy, d, 'e');
  }
  function rail(g, sx, sy, d, dir) {
    const c = '#6b4f33', c2 = '#54402a';
    const bw = Math.max(2, d * 0.07), pw = Math.max(2, d * 0.07);
    if (dir === 'n' || dir === 's') {
      const y = dir === 'n' ? sy + d * 0.07 : sy + d * 0.86;
      R(g, sx, y, d, bw, c);
      R(g, sx + d * 0.14, y - d * 0.08, pw, d * 0.26, c2);
      R(g, sx + d * 0.78, y - d * 0.08, pw, d * 0.26, c2);
    } else {
      const x = dir === 'w' ? sx + d * 0.07 : sx + d * 0.86;
      R(g, x, sy, bw, d, c);
      R(g, x - d * 0.08, sy + d * 0.14, d * 0.26, pw, c2);
      R(g, x - d * 0.08, sy + d * 0.78, d * 0.26, pw, c2);
    }
  }

  /* ---------- 通用绘制小工具 ---------- */
  function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function ell(g, x, y, rx, ry, c) {
    g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  function sh(hex, k) { // 亮度缩放 -> 'rgb()'（每帧少量调用，直接算）
    const v = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((v >> 16) & 255) * k) | 0;
    const gg = Math.min(255, ((v >> 8) & 255) * k) | 0;
    const b = Math.min(255, (v & 255) * k) | 0;
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }
  function poly(g, pts, c) {
    g.fillStyle = c; g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); g.fill();
  }
  const DRAW = {
    /* 帐篷（2×2 实心高物）：双色帆布三角 + 暗门帘 + 顶杆 */
    tent(g, p, sx, sy, d) {
      const cols = ['#c9b389', '#a8674c', '#7a89a8'];
      const c = cols[p.v % 3];
      const bw = d * 2, bh = d * 2, top = sy - d * 0.55;
      ell(g, sx + bw / 2, sy + bh - d * 0.06, bw * 0.46, d * 0.16, 'rgba(0,0,0,0.26)');
      poly(g, [sx + bw / 2, top, sx + bw, sy + bh, sx, sy + bh], c);
      poly(g, [sx + bw / 2, top, sx + bw, sy + bh, sx + bw / 2, sy + bh], sh(c, 1.12));
      poly(g, [sx + bw / 2, sy + bh - d * 1.0, sx + bw * 0.66, sy + bh, sx + bw * 0.34, sy + bh], '#463a28');
      R(g, sx + bw / 2 - d * 0.04, top - d * 0.16, d * 0.08, d * 0.3, '#5d4f36');
      R(g, sx, sy + bh - d * 0.14, bw, d * 0.14, sh(c, 0.72));
    },
    /* 房屋/谷仓（3×3 实心高物）：彩顶 + 墙体 + 门窗（v0 红顶=谷仓） */
    house(g, p, sx, sy, d) {
      const roofs = ['#b3544a', '#4f7fb8', '#5e9e6a', '#8a5fa8'];
      const roof = roofs[p.v % 4];
      const bw = d * 3, bodyTop = sy + d, bodyH = d * 2;
      ell(g, sx + bw / 2, sy + d * 3 - d * 0.05, bw * 0.45, d * 0.14, 'rgba(0,0,0,0.26)');
      R(g, sx + d * 0.2, bodyTop, bw - d * 0.4, bodyH, '#b3a691');
      R(g, sx + d * 0.2, bodyTop, bw - d * 0.4, d * 0.12, '#cbbda6');
      R(g, sx + d * 0.2, bodyTop + bodyH - d * 0.14, bw - d * 0.4, d * 0.14, '#8e8271');
      poly(g, [sx - d * 0.1, bodyTop + d * 0.05, sx + bw / 2, sy - d * 0.45, sx + bw + d * 0.1, bodyTop + d * 0.05], roof);
      poly(g, [sx + bw / 2, sy - d * 0.45, sx + bw + d * 0.1, bodyTop + d * 0.05, sx + bw / 2, bodyTop + d * 0.05], sh(roof, 0.82));
      R(g, sx + bw / 2 - d * 0.3, bodyTop + d * 0.55, d * 0.6, d * 1.45, '#6b5540');
      R(g, sx + bw / 2 - d * 0.2, bodyTop + d * 0.7, d * 0.4, d * 0.5, '#3f3226');
      R(g, sx + d * 0.55, bodyTop + d * 0.5, d * 0.5, d * 0.5, '#dfe8ee');
      R(g, sx + bw - d * 1.05, bodyTop + d * 0.5, d * 0.5, d * 0.5, '#dfe8ee');
    },
    /* 风车（2×2 实心高物）：锥塔 + 帽顶 + 四叶缓转 */
    windmill(g, p, sx, sy, d, t) {
      const bw = d * 2;
      ell(g, sx + bw / 2, sy + d * 2 - d * 0.05, bw * 0.45, d * 0.14, 'rgba(0,0,0,0.26)');
      poly(g, [sx + d * 0.35, sy + d * 2, sx + d * 0.62, sy - d * 0.1, sx + d * 1.38, sy - d * 0.1, sx + d * 1.65, sy + d * 2], '#9a948a');
      poly(g, [sx + d, sy - d * 0.1, sx + d * 1.38, sy - d * 0.1, sx + d * 1.65, sy + d * 2, sx + d * 1.1, sy + d * 2], '#7e786e');
      poly(g, [sx + d * 0.5, sy - d * 0.1, sx + d, sy - d * 0.62, sx + d * 1.5, sy - d * 0.1], '#7a5f3f');
      const hx = sx + d, hy = sy + d * 0.15, r = d * 1.25, a = p.x * 0.7 + t * 0.5;
      for (let k = 0; k < 4; k++) {
        const an = a + (k * Math.PI) / 2;
        g.save(); g.translate(hx, hy); g.rotate(an);
        poly(g, [-d * 0.07, 0, d * 0.07, 0, d * 0.05, -r, -d * 0.05, -r], '#c9bda4');
        g.restore();
      }
      ell(g, hx, hy, d * 0.1, d * 0.1, '#54402a');
    },
    /* 石塔（2×2 实心高物）：v0 浅石（长城）/ v1 暗石（城堡）+ 雉堞 + 旗 */
    tower(g, p, sx, sy, d) {
      const stone = p.v % 2 ? '#565462' : '#8a8577';
      const bw = d * 2;
      ell(g, sx + bw / 2, sy + d * 2 - d * 0.05, bw * 0.45, d * 0.14, 'rgba(0,0,0,0.26)');
      poly(g, [sx + d * 0.2, sy + d * 2, sx + d * 0.4, sy - d * 0.3, sx + d * 1.6, sy - d * 0.3, sx + d * 1.8, sy + d * 2], stone);
      poly(g, [sx + d, sy - d * 0.3, sx + d * 1.6, sy - d * 0.3, sx + d * 1.8, sy + d * 2, sx + d, sy + d * 2], sh(stone, 0.8));
      for (let k = 0; k < 3; k++) R(g, sx + d * (0.42 + k * 0.44), sy - d * 0.52, d * 0.26, d * 0.24, stone);
      R(g, sx + d * 0.4, sy - d * 0.3, d * 1.2, d * 0.1, sh(stone, 0.7));
      R(g, sx + d * 0.9, sy + d * 0.6, d * 0.2, d * 0.5, '#2f2d36');
      R(g, sx + d * 1.7, sy - d * 1.15, Math.max(1, d * 0.05), d * 0.9, '#4a3d2c');
      poly(g, [sx + d * 1.72, sy - d * 1.1, sx + d * 1.72, sy - d * 0.8, sx + d * 2.1, sy - d * 0.95], p.v % 2 ? '#8f3b34' : '#3f5f8f');
    },
    /* 松树（2×2 实心高物）：v1 雪冠 */
    pine(g, p, sx, sy, d) {
      const snow = p.v % 2 === 1;
      const bw = d * 2;
      ell(g, sx + bw / 2, sy + d * 2 - d * 0.05, bw * 0.4, d * 0.13, 'rgba(0,0,0,0.26)');
      R(g, sx + d * 0.88, sy + d * 1.3, d * 0.24, d * 0.7, '#6b4a2f');
      const gc = snow ? '#2f5a3f' : '#3f7a4a';
      poly(g, [sx + d, sy - d * 0.7, sx + d * 1.75, sy + d * 0.5, sx + d * 0.25, sy + d * 0.5], gc);
      poly(g, [sx + d, sy - d * 0.1, sx + d * 1.9, sy + d, sx + d * 0.1, sy + d], sh(gc, 0.85));
      poly(g, [sx + d, sy + d * 0.5, sx + d * 2, sy + d * 1.55, sx, sy + d * 1.55], sh(gc, 0.72));
      if (snow) {
        poly(g, [sx + d, sy - d * 0.7, sx + d * 1.3, sy - d * 0.05, sx + d * 0.7, sy - d * 0.05], '#dfe8ee');
        R(g, sx + d * 0.35, sy + d * 0.42, d * 1.3, d * 0.1, '#e8eff4');
      }
    },
    /* 枯木（2×2 实心高物）：秃枝三叉 */
    deadtree(g, p, sx, sy, d) {
      ell(g, sx + d, sy + d * 2 - d * 0.05, d * 0.7, d * 0.12, 'rgba(0,0,0,0.26)');
      R(g, sx + d * 0.92, sy + d * 0.2, d * 0.18, d * 1.8, '#4a3d33');
      g.strokeStyle = '#4a3d33'; g.lineWidth = Math.max(2, d * 0.1); g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sx + d, sy + d * 0.7); g.lineTo(sx + d * 0.3, sy - d * 0.1);
      g.moveTo(sx + d, sy + d * 0.5); g.lineTo(sx + d * 1.7, sy - d * 0.3);
      g.moveTo(sx + d, sy + d * 1.1); g.lineTo(sx + d * 1.8, sy + d * 0.6);
      g.stroke(); g.lineCap = 'butt';
    },
    /* 锻炉（2×2 实心高物）：砖体 + 烟囱 + 炉口火光闪动 */
    furnace(g, p, sx, sy, d, t) {
      ell(g, sx + d, sy + d * 2 - d * 0.05, d * 0.9, d * 0.14, 'rgba(0,0,0,0.26)');
      R(g, sx + d * 0.15, sy + d * 0.45, d * 1.7, d * 1.55, '#7a5a4a');
      R(g, sx + d * 0.15, sy + d * 0.45, d * 1.7, d * 0.14, '#93705c');
      for (let r = 0; r < 4; r++) R(g, sx + d * 0.15, sy + d * (0.8 + r * 0.35), d * 1.7, Math.max(1, d * 0.03), 'rgba(40,25,18,0.6)');
      R(g, sx + d * 1.2, sy - d * 0.35, d * 0.4, d * 0.85, '#6a4c3e');
      const glow = (0.55 + 0.35 * Math.sin(t * 6 + p.x)).toFixed(2);
      ell(g, sx + d * 0.75, sy + d * 1.5, d * 0.42, d * 0.34, 'rgba(30,18,12,0.9)');
      ell(g, sx + d * 0.75, sy + d * 1.5, d * 0.34, d * 0.26, 'rgba(255,' + Math.round(120 * glow + 60) + ',40,' + glow + ')');
    },
    /* 木栅栏（1×1 实心矮物）：三根尖桩 + 横梁 */
    palisade(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.96, d * 0.42, d * 0.1, 'rgba(0,0,0,0.24)');
      for (let k = 0; k < 3; k++) {
        const x = sx + d * (0.1 + k * 0.3), h = d * (0.72 + (k === 1 ? 0.14 : 0));
        R(g, x, sy + d - h, d * 0.16, h, '#8a6a45');
        poly(g, [x, sy + d - h, x + d * 0.16, sy + d - h, x + d * 0.08, sy + d - h - d * 0.14], '#6b4f33');
        R(g, x + d * 0.1, sy + d - h, d * 0.06, h, sh('#8a6a45', 1.18));
      }
      R(g, sx + d * 0.05, sy + d * 0.5, d * 0.9, d * 0.09, '#75563a');
    },
    /* 木箱（1×1 实心矮物）：箱体 + X 纹 */
    crate(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.97, d * 0.4, d * 0.1, 'rgba(0,0,0,0.24)');
      R(g, sx + d * 0.12, sy + d * 0.2, d * 0.76, d * 0.72, '#9a7444');
      R(g, sx + d * 0.12, sy + d * 0.2, d * 0.76, d * 0.1, '#b58a55');
      g.strokeStyle = '#6b4c2a'; g.lineWidth = Math.max(1, d * 0.06);
      g.strokeRect(sx + d * 0.14, sy + d * 0.22, d * 0.72, d * 0.68);
      g.beginPath();
      g.moveTo(sx + d * 0.16, sy + d * 0.24); g.lineTo(sx + d * 0.84, sy + d * 0.88);
      g.moveTo(sx + d * 0.84, sy + d * 0.24); g.lineTo(sx + d * 0.16, sy + d * 0.88);
      g.stroke();
    },
    /* 木桶（1×1 实心矮物）：桶身 + 铁箍 */
    barrel(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.97, d * 0.36, d * 0.1, 'rgba(0,0,0,0.24)');
      R(g, sx + d * 0.2, sy + d * 0.22, d * 0.6, d * 0.7, '#8a6238');
      ell(g, sx + d * 0.5, sy + d * 0.24, d * 0.3, d * 0.1, '#a0764a');
      R(g, sx + d * 0.2, sy + d * 0.4, d * 0.6, d * 0.08, '#5d4327');
      R(g, sx + d * 0.2, sy + d * 0.72, d * 0.6, d * 0.08, '#5d4327');
      R(g, sx + d * 0.26, sy + d * 0.24, d * 0.1, d * 0.66, 'rgba(255,230,180,0.18)');
    },
    /* 铁砧（1×1 实心矮物） */
    anvil(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.95, d * 0.36, d * 0.1, 'rgba(0,0,0,0.24)');
      R(g, sx + d * 0.3, sy + d * 0.66, d * 0.4, d * 0.24, '#3c3c44');
      R(g, sx + d * 0.14, sy + d * 0.38, d * 0.72, d * 0.3, '#4a4a52');
      poly(g, [sx + d * 0.86, sy + d * 0.38, sx + d * 0.98, sy + d * 0.5, sx + d * 0.86, sy + d * 0.56], '#4a4a52');
      R(g, sx + d * 0.16, sy + d * 0.4, d * 0.6, d * 0.07, '#63636e');
      R(g, sx + d * 0.14, sy + d * 0.88, d * 0.72, d * 0.08, '#2e2e36');
    },
    /* 头骨石（1×1 实心矮物）：骷髅造型岩 */
    skullstone(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.95, d * 0.4, d * 0.12, 'rgba(0,0,0,0.24)');
      ell(g, sx + d * 0.5, sy + d * 0.5, d * 0.36, d * 0.32, '#c9c4b8');
      R(g, sx + d * 0.3, sy + d * 0.66, d * 0.4, d * 0.2, '#c9c4b8');
      R(g, sx + d * 0.2, sy + d * 0.28, d * 0.6, d * 0.1, '#ddd8cb');
      ell(g, sx + d * 0.38, sy + d * 0.5, d * 0.08, d * 0.09, '#26241f');
      ell(g, sx + d * 0.62, sy + d * 0.5, d * 0.08, d * 0.09, '#26241f');
      R(g, sx + d * 0.44, sy + d * 0.62, d * 0.12, d * 0.07, '#26241f');
      for (let k = 0; k < 3; k++) R(g, sx + d * (0.33 + k * 0.12), sy + d * 0.74, Math.max(1, d * 0.04), d * 0.1, '#8f8a7e');
    },
    /* 旌旗（1×1 实心矮物）：旗杆 + 三段摆动旗幅（v0 红/v1 蓝/v2 金/v3 黑） */
    banner(g, p, sx, sy, d, t) {
      const cols = ['#b0453c', '#3f5f8f', '#c9a445', '#33313c'];
      const c = cols[p.v % 4];
      ell(g, sx + d * 0.5, sy + d * 0.97, d * 0.3, d * 0.09, 'rgba(0,0,0,0.24)');
      R(g, sx + d * 0.44, sy - d * 0.85, Math.max(2, d * 0.08), d * 1.8, '#6b5a3f');
      for (let k = 0; k < 3; k++) {
        const wob = Math.sin(t * 2.4 + k * 1.1 + p.x * 0.5) * d * 0.09;
        R(g, sx + d * 0.52 + wob, sy - d * 0.8 + k * d * 0.26, d * 0.5, d * 0.24, k === 1 ? sh(c, 0.85) : c);
      }
      ell(g, sx + d * 0.48, sy - d * 0.88, d * 0.08, d * 0.08, '#d8b45a');
    },
    /* 篝火（1×1 非实心）：石圈 + 交叉柴 + 三瓣火焰闪动 */
    campfire(g, p, sx, sy, d, t) {
      ell(g, sx + d * 0.5, sy + d * 0.78, d * 0.42, d * 0.2, 'rgba(0,0,0,0.3)');
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + 0.4;
        ell(g, sx + d * 0.5 + Math.cos(a) * d * 0.34, sy + d * 0.72 + Math.sin(a) * d * 0.16, d * 0.09, d * 0.07, '#7a746a');
      }
      g.strokeStyle = '#6b4a2f'; g.lineWidth = Math.max(2, d * 0.1); g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sx + d * 0.22, sy + d * 0.82); g.lineTo(sx + d * 0.78, sy + d * 0.6);
      g.moveTo(sx + d * 0.22, sy + d * 0.6); g.lineTo(sx + d * 0.78, sy + d * 0.82);
      g.stroke(); g.lineCap = 'butt';
      const f = 0.8 + 0.25 * Math.sin(t * 8 + p.x * 2) + 0.1 * Math.sin(t * 13 + p.y);
      const h = d * 0.75 * f;
      poly(g, [sx + d * 0.5, sy + d * 0.6 - h, sx + d * 0.72, sy + d * 0.78, sx + d * 0.28, sy + d * 0.78], '#ff8a2c');
      poly(g, [sx + d * 0.5, sy + d * 0.6 - h * 0.6, sx + d * 0.64, sy + d * 0.76, sx + d * 0.36, sy + d * 0.76], '#ffc84a');
      poly(g, [sx + d * 0.5, sy + d * 0.62 - h * 0.3, sx + d * 0.58, sy + d * 0.74, sx + d * 0.42, sy + d * 0.74], '#fff2c0');
    },
    /* 铁火盆（1×1 非实心）：三脚盆 + 火舌（v1 幽绿） */
    brazier(g, p, sx, sy, d, t) {
      const fc = p.v % 2 ? '#7fffa0' : '#ffb347';
      ell(g, sx + d * 0.5, sy + d * 0.96, d * 0.34, d * 0.1, 'rgba(0,0,0,0.24)');
      g.strokeStyle = '#3a3a42'; g.lineWidth = Math.max(2, d * 0.07);
      g.beginPath();
      g.moveTo(sx + d * 0.5, sy + d * 0.5); g.lineTo(sx + d * 0.26, sy + d * 0.92);
      g.moveTo(sx + d * 0.5, sy + d * 0.5); g.lineTo(sx + d * 0.74, sy + d * 0.92);
      g.stroke();
      R(g, sx + d * 0.2, sy + d * 0.36, d * 0.6, d * 0.2, '#3a3a42');
      R(g, sx + d * 0.2, sy + d * 0.36, d * 0.6, d * 0.05, '#565661');
      const f = 0.75 + 0.3 * Math.sin(t * 7 + p.x * 3);
      poly(g, [sx + d * 0.5, sy + d * 0.34 - d * 0.5 * f, sx + d * 0.7, sy + d * 0.4, sx + d * 0.3, sy + d * 0.4], fc);
      poly(g, [sx + d * 0.5, sy + d * 0.36 - d * 0.28 * f, sx + d * 0.62, sy + d * 0.4, sx + d * 0.38, sy + d * 0.4], p.v % 2 ? '#d8ffe6' : '#fff2c0');
    },
    /* 火把（1×1 非实心）：杆 + 小焰（桥面/营地照明） */
    torch(g, p, sx, sy, d, t) {
      ell(g, sx + d * 0.5, sy + d * 0.97, d * 0.26, d * 0.08, 'rgba(0,0,0,0.24)');
      R(g, sx + d * 0.44, sy + d * 0.1, Math.max(2, d * 0.1), d * 0.85, '#6b5a3f');
      R(g, sx + d * 0.36, sy + d * 0.5, d * 0.28, d * 0.08, '#54463a');
      const f = 0.8 + 0.3 * Math.sin(t * 9 + p.x * 5);
      poly(g, [sx + d * 0.5, sy - d * 0.18 * f, sx + d * 0.66, sy + d * 0.16, sx + d * 0.34, sy + d * 0.16], '#ff9a3c');
      poly(g, [sx + d * 0.5, sy - d * 0.04, sx + d * 0.59, sy + d * 0.14, sx + d * 0.41, sy + d * 0.14], '#ffe08a');
    },
    /* 稻草人（1×1 非实心）：十字架 + 草人头 + 草袖 */
    scarecrow(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.97, d * 0.3, d * 0.09, 'rgba(0,0,0,0.24)');
      R(g, sx + d * 0.46, sy - d * 0.1, Math.max(2, d * 0.08), d * 1.05, '#6b5540');
      R(g, sx + d * 0.14, sy + d * 0.18, d * 0.72, Math.max(2, d * 0.08), '#6b5540');
      ell(g, sx + d * 0.5, sy + d * 0.06, d * 0.16, d * 0.16, '#d8c489');
      poly(g, [sx + d * 0.28, 0 + sy + d * 0.0, sx + d * 0.72, sy + d * 0.0, sx + d * 0.5, sy - d * 0.24], '#8a5f3a');
      R(g, sx + d * 0.2, sy + d * 0.26, d * 0.16, d * 0.3, '#a8915c');
      R(g, sx + d * 0.64, sy + d * 0.26, d * 0.16, d * 0.3, '#a8915c');
    },
    /* 麦田（5×4 非实心）：垄沟 + 四行作物（抖动按坐标取定，确定性） */
    crop(g, p, sx, sy, d) {
      const bw = d * 5, bh = d * 4;
      R(g, sx, sy, bw, bh, '#6e5236');
      for (let r = 0; r < 4; r++) {
        R(g, sx, sy + d * (0.4 + r), bw, d * 0.5, '#5a412b');
        for (let c = 0; c < 6; c++) {
          const j = ((p.x * 7 + p.y * 13 + r * 31 + c * 17) % 7) / 7;
          const x = sx + d * (0.3 + c * 0.8 + j * 0.14), y = sy + d * (0.35 + r);
          R(g, x, y - d * 0.26, Math.max(1, d * 0.07), d * 0.3, '#5f8a3f');
          R(g, x - d * 0.07, y - d * 0.3, Math.max(1, d * 0.09), d * 0.1, '#7fae55');
        }
      }
      R(g, sx, sy, bw, Math.max(1, d * 0.06), 'rgba(255,235,190,0.12)');
    },
    /* 断刃架（1×1 非实心）：土堆 + 三把斜插断剑（兵工厂/终末之野） */
    rack(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.9, d * 0.38, d * 0.12, 'rgba(0,0,0,0.26)');
      ell(g, sx + d * 0.5, sy + d * 0.84, d * 0.3, d * 0.1, '#57503f');
      const blades = [[0.3, -0.25], [0.55, 0.15], [0.75, 0.4]];
      for (let k = 0; k < blades.length; k++) {
        g.save();
        g.translate(sx + d * blades[k][0], sy + d * 0.8);
        g.rotate(blades[k][1]);
        R(g, -d * 0.05, -d * 0.9, Math.max(2, d * 0.1), d * 0.9, k === 1 ? '#9aa2ad' : '#7f8794');
        R(g, -d * 0.14, -d * 0.9, Math.max(2, d * 0.28), d * 0.08, '#5a4a2a');
        R(g, -d * 0.04, -d * 0.9, Math.max(1, d * 0.03), d * 0.9, '#c2c9d2');
        g.restore();
      }
    },
    /* 白骨堆（1×1 非实心）：肋骨弧 + 骨棒 */
    bonepile(g, p, sx, sy, d) {
      ell(g, sx + d * 0.5, sy + d * 0.88, d * 0.4, d * 0.12, 'rgba(0,0,0,0.24)');
      g.strokeStyle = '#d5d0c2'; g.lineWidth = Math.max(2, d * 0.07);
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(sx + d * (0.3 + k * 0.14), sy + d * 0.74, d * (0.3 - k * 0.03), Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
      R(g, sx + d * 0.16, sy + d * 0.8, d * 0.5, Math.max(2, d * 0.09), '#c9c4b4');
      ell(g, sx + d * 0.76, sy + d * 0.82, d * 0.1, d * 0.08, '#e2ddd0');
    },
    /* 魂火（1×1 非实心）：径向光晕 + 光核（黑暗迷宫引路） */
    wisp(g, p, sx, sy, d, t) {
      const cx = sx + d * 0.5, cy = sy + d * 0.45 + Math.sin(t * 1.7 + p.x) * d * 0.08;
      const r = d * (0.34 + 0.08 * Math.sin(t * 3 + p.y));
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      grd.addColorStop(0, 'rgba(150,230,255,0.95)');
      grd.addColorStop(0.45, 'rgba(90,190,255,0.45)');
      grd.addColorStop(1, 'rgba(60,150,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(cx, cy, r * 2.2, 0, Math.PI * 2); g.fill();
      ell(g, cx, cy, r * 0.5, r * 0.5, '#eaffff');
    },
    /* 晶簇（1×1 非实心）：三棱晶 + 脉动光（v0 冰青 / v1 幽紫） */
    crystal(g, p, sx, sy, d, t) {
      const c = p.v % 2 ? '#b07fe0' : '#7fe8e0';
      const pulse = (0.6 + 0.4 * Math.sin(t * 2.5 + p.x * 2 + p.y)).toFixed(2);
      ell(g, sx + d * 0.5, sy + d * 0.9, d * 0.34, d * 0.11, 'rgba(0,0,0,0.24)');
      g.globalAlpha = 0.35 * pulse;
      ell(g, sx + d * 0.5, sy + d * 0.5, d * 0.44, d * 0.44, c);
      g.globalAlpha = 1;
      poly(g, [sx + d * 0.5, sy - d * 0.1, sx + d * 0.7, sy + d * 0.8, sx + d * 0.3, sy + d * 0.8], c);
      poly(g, [sx + d * 0.5, sy - d * 0.1, sx + d * 0.7, sy + d * 0.8, sx + d * 0.5, sy + d * 0.8], sh(c, 1.35));
      poly(g, [sx + d * 0.24, sy + d * 0.3, sx + d * 0.36, sy + d * 0.8, sx + d * 0.12, sy + d * 0.8], sh(c, 0.8));
      poly(g, [sx + d * 0.76, sy + d * 0.35, sx + d * 0.9, sy + d * 0.8, sx + d * 0.64, sy + d * 0.8], sh(c, 0.85));
    },
  };
})();
