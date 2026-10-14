/* ============================================================================
   js/world/terrain.js —— 世界地形生成与查询（Q9 手工框架+局部随机）
   ----------------------------------------------------------------------------
   职责：生成 2000×2000 岛屿世界，含 10 个区域（手工坐标框架）、水域、
         高差与可跳跃地形、黑暗迷宫（程序生成+战争迷雾）。提供通行查询。

   对外接口（window.LG.Terrain）：
     .generate(seed) -> 生成全图（内部缓存）
     .tileAt(x,y) -> {type, walk, jump, water, height}
     .walkable(x,y) -> bool          玩家/敌人可走（单点查询）
     .passableBox(x,y) -> bool       精灵脚印盒（1×1格四角）整体可走（碰撞用）
     .boxPenalty(x,y) -> int         脚印盒受阻角数（0=合法；脱困容错用）
     .jumpable(x,y) -> bool          需跳跃翻越的矮障碍（Q21伪跳跃）
     .isWater(x,y) -> bool
     .regionOf(x,y) -> regionObj
     .fog.reveal(x,y) .fog.visible(x,y)   迷宫战争迷雾
     .SIZE

   设计守则：采用"区域框架 + 值噪声局部随机"。全局以 TypedArray 存储瓦片类型
             以控制内存（2000×2000≈4MB Uint8），水域/高差分层存储。
   依赖：core/config.js（区域坐标）、core/utils.js（种子随机）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const W = 2000;

  // 瓦片类型枚举
  const T_GRASS = 0, T_DIRT = 1, T_SAND = 2, T_SNOW = 3, T_ROCK = 4,
        T_WATER = 5, T_ROAD = 6, T_WALL = 7, T_CASTLE = 8, T_VOID = 9,
        T_FENCE = 10; // FENCE = 可跳跃矮障碍

  let tiles = null, height = null, regionMap = null;
  let fog = null; // 迷宫迷雾：Uint8 0=未探索 1=可见
  let mazeIdx = -1; // 黑暗迷宫区域下标（渲染时 O(1) 判定，避免每瓦片扫描11个区域）
  let ready = false; // 地形是否已生成（引擎在生成前跳过世界逻辑）

  /* 值噪声：用种子随机网格做平滑插值，得到连续地形起伏 */
  function makeNoise(seed, grid) {
    const r = LG.U.rng(seed);
    const g = new Float32Array(grid * grid);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return function (x, y) {
      const gx = (x / W) * grid, gy = (y / W) * grid;
      const x0 = Math.floor(gx) % grid, y0 = Math.floor(gy) % grid;
      const x1 = (x0 + 1) % grid, y1 = (y0 + 1) % grid;
      const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = g[y0 * grid + x0], b = g[y0 * grid + x1];
      const c = g[y1 * grid + x0], d = g[y1 * grid + x1];
      return LG.U.lerp(LG.U.lerp(a, b, sx), LG.U.lerp(c, d, sx), sy);
    };
  }

  /* ---------- 全图生成 ---------- */
  function generate(seed) {
    seed = seed || LG.Config.SEED;
    tiles = new Uint8Array(W * W);
    height = new Uint8Array(W * W);
    regionMap = new Uint8Array(W * W);
    fog = new Uint8Array(W * W);

    const nElev = makeNoise(seed, 64);      // 地势起伏（兼海岸扰动）
    const nHill = makeNoise(seed + 3, 40);  // 台地高差（低频 -> 成片台阶，非碎点）
    const nMoist = makeNoise(seed + 7, 48); // 干湿（区分草地/沙漠/雪地）
    const rnd = LG.U.rng(seed + 99);

    // 岛屿掩码：中心为陆地，边缘为海（半径约 950 的圆 + 噪声扰动）
    const cx = W / 2, cy = W / 2;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) / 950;
        const island = d + (nElev(x, y) - 0.5) * 0.25; // 噪声扰动海岸线

        if (island > 1.0) { tiles[i] = T_WATER; continue; } // 海

        // 区域归属：距离最近区域中心 < 区域半径
        let best = -1, bd = 1e9;
        LG.Config.REGIONS.forEach((rg, ri) => {
          const rd = Math.hypot(x - rg.cx, y - rg.cy);
          if (rd < bd) { bd = rd; best = ri; }
        });
        regionMap[i] = best;
        const rg = LG.Config.REGIONS[best];

        // 地势高度（2.5D 挤出渲染的数据源）：0=平地 1=一级台地(可走，边缘可跳) 2=二级高山(不可走)
        const e = nHill(x, y);
        let h = 0;
        if (island > 0.86) h = 0;                 // 近海岸沙地保持平
        else if (e > 0.73) h = 2;                 // 高山（不可走，渲染为两倍崖壁=隐形空气墙可视化）
        else if (e > 0.63) h = 1;                 // 一级台地（阈值放低：h1 过稀则层级感不足）

        // 区域基底类型
        let type;
        switch (rg.biome) {
          case 'coast': type = island > 0.86 ? T_SAND : T_GRASS; break;
          case 'snow': type = T_SNOW; break;
          case 'rock': type = T_ROCK; break;
          case 'farm': type = T_DIRT; break;
          case 'castle': type = T_CASTLE; break;
          case 'void': type = T_VOID; break;
          case 'maze': type = T_ROCK; break;
          default: type = nMoist(x, y) > 0.6 ? T_DIRT : T_GRASS;
        }
        // 近海岸强制沙地
        if (island > 0.86 && type !== T_WATER) type = T_SAND;

        tiles[i] = type;
        height[i] = h;
      }
    }

    // 区域中心清平（防 NPC/宝箱/传送落点困在山地上，半径8格）
    clearRegionCenters();

    // 黑暗迷宫区域：程序生成迷宫墙 + 挖空重铺。
    // 顺序必须在铺路之前：迷宫会把整块区域刷成墙，若先铺路，营地→迷宫的
    // 道路会被覆盖成"密封盒"（进不去也出不去，BOSS 中心落点也会变墙，
    // 反馈"迷宫走不出去"）；后铺路会把道路打进迷宫，贯通出入口并清平中心
    buildMaze(seed);

    // 区域间铺路（ROAD 连通），保证可达性（含迷宫出入口与 BOSS 中心）
    buildRoads();

    // 部分草地撒栅栏（可跳跃矮障碍），丰富跳跃玩法
    sprinkleFences(rnd);
    // 记录迷宫区域下标并标记就绪（渲染 O(1) 判定 + 引擎防崩守卫）
    mazeIdx = LG.Config.REGIONS.findIndex((r) => r.biome === 'maze');
    ready = true;
    return true;
  }

  /* 用 BFS 从营地向各区域中心铺一条路，确保全程可达 */
  function buildRoads() {
    const camp = LG.Config.REGIONS.find((r) => r.id === 'camp');
    LG.Config.REGIONS.forEach((rg) => {
      if (rg === camp) return;
      let x = camp.cx, y = camp.cy;
      const tx = rg.cx, ty = rg.cy;
      const steps = Math.ceil(Math.hypot(tx - x, ty - y));
      for (let s = 0; s < steps; s++) {
        const nx = Math.round(LG.U.lerp(x, tx, s / steps));
        const ny = Math.round(LG.U.lerp(y, ty, s / steps));
        // 铺 3 宽的道路并清空高度，保证可通行
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const px = nx + ox, py = ny + oy;
            if (px < 0 || py < 0 || px >= W || py >= W) continue;
            const i = py * W + px;
            if (tiles[i] !== T_WATER) { tiles[i] = T_ROAD; height[i] = 0; }
          }
      }
    });
  }

  /* 黑暗迷宫：在 maze 区域用递归回溯生成迷宫，墙=T_WALL，通路=T_ROAD */
  function buildMaze(seed) {
    const rg = LG.Config.REGIONS.find((r) => r.id === 'maze');
    if (!rg) return;
    const CELL = 10; // 迷宫单元格大小
    const R = 120;   // 迷宫半径
    const r = LG.U.rng(seed + 555);
    // 先把区域清为墙（墙=2级高块，渲染为挤出城墙 + 不可走）
    for (let y = rg.cy - R; y < rg.cy + R; y++)
      for (let x = rg.cx - R; x < rg.cx + R; x++) {
        const i = y * W + x;
        if (tiles[i] !== T_WATER) { tiles[i] = T_WALL; height[i] = 2; }
      }
    // 回溯法挖通路
    const cols = Math.floor((2 * R) / CELL), rows = cols;
    const visited = new Uint8Array(cols * rows);
    const stack = [[0, 0]];
    visited[0] = 1;
    carveAt(0, 0);
    function carveAt(gx, gy) {
      const x = rg.cx - R + gx * CELL + 1, y = rg.cy - R + gy * CELL + 1;
      for (let oy = 0; oy < CELL - 1; oy++)
        for (let ox = 0; ox < CELL - 1; ox++) {
          const i = (y + oy) * W + (x + ox);
          tiles[i] = T_ROAD;
          height[i] = 0; // 通路清平（墙改2级后必须同步，否则迷宫内部不可走）
        }
    }
    while (stack.length) {
      const [gx, gy] = stack[stack.length - 1];
      const nb = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !visited[ny * cols + nx]) nb.push([nx, ny, dx, dy]);
      });
      if (nb.length) {
        const [nx, ny, dx, dy] = nb[(r() * nb.length) | 0];
        visited[ny * cols + nx] = 1;
        // 打通当前格与目标格之间的墙
        const wx = rg.cx - R + gx * CELL + 1 + (dx > 0 ? CELL - 2 : 0);
        const wy = rg.cy - R + gy * CELL + 1 + (dy > 0 ? CELL - 2 : 0);
        for (let k = 0; k < 2; k++) {
          const i = (wy + (dy ? k : 0)) * W + (wx + (dx ? k : 0));
          tiles[i] = T_ROAD;
          height[i] = 0; // 打通的墙缝同样清平
        }
        carveAt(nx, ny);
        stack.push([nx, ny]);
      } else stack.pop();
    }
    // 入口/出口打通
    carveAt(0, 0);
    carveAt(cols - 1, rows - 1);
  }

  /* 各区域中心半径8格清平：NPC/宝箱/BOSS/传送落点周围保证是平地 */
  function clearRegionCenters() {
    LG.Config.REGIONS.forEach((rg) => {
      for (let oy = -8; oy <= 8; oy++)
        for (let ox = -8; ox <= 8; ox++) {
          if (ox * ox + oy * oy > 64) continue;
          const px = (rg.cx + ox) | 0, py = (rg.cy + oy) | 0;
          if (inb(px, py)) height[py * W + px] = 0;
        }
    });
  }

  /* 草地撒成段矮台（3~6格连续，可跳跃翻越；遇路/水/硬地即断，不破坏道路） */
  function sprinkleFences(rnd) {
    for (let k = 0; k < 3000; k++) {
      const x = (rnd() * (W - 8)) | 0, y = (rnd() * (W - 8)) | 0;
      const len = 3 + ((rnd() * 4) | 0);
      const horiz = rnd() < 0.5;
      for (let s = 0; s < len; s++) {
        const px = horiz ? x + s : x, py = horiz ? y : y + s;
        const i = py * W + px;
        if (tiles[i] === T_GRASS && height[i] === 0) height[i] = 1;
        else break;
      }
    }
  }

  /* ---------- 查询接口 ---------- */
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < W; }
  /* O(1) 迷宫判定（渲染热路径专用，避免 regionOf 扫描） */
  function isMazeAt(x, y) {
    if (!ready || mazeIdx < 0) return false;
    x = x | 0; y = y | 0;
    return inb(x, y) && regionMap[y * W + x] === mazeIdx;
  }
  function tileAt(x, y) {
    x = x | 0; y = y | 0;
    if (!inb(x, y)) return { type: T_WATER, walk: false, jump: false, water: true, height: 2 };
    const i = y * W + x, t = tiles[i], h = height[i];
    const water = t === T_WATER;
    const wall = t === T_WALL;
    return { type: t, height: h, water, walk: !water && !wall && h !== 2, jump: h === 1, wall };
  }
  /* 渲染热路径专用：原始高度查询（不建对象，O(1)）；出界按0（世界边缘不画崖） */
  function heightAt(x, y) {
    if (!ready || !inb(x, y)) return 0;
    return height[(y | 0) * W + (x | 0)];
  }
  function walkable(x, y) { return tileAt(x, y).walk; }
  function jumpable(x, y) { return tileAt(x, y).jump; }
  function isWater(x, y) { const t = tileAt(x, y); return t.water; }

  /* 零分配可走判定（与 tileAt().walk 同语义；脚印盒碰撞热路径每帧多次调用，
     走 tileAt 会每调一次建一个对象，GC 压力大） */
  function freeTile(x, y) {
    if (!ready) return false;
    x = x | 0; y = y | 0;
    if (!inb(x, y)) return false;
    const i = y * W + x;
    return tiles[i] !== T_WATER && tiles[i] !== T_WALL && height[i] !== 2;
  }

  /* 脚印盒碰撞（修复"人物可以穿过墙与海一部分"）：
     精灵以左上角 (x,y) 占据 [x,x+1)×[y,y+1) 一整格。旧逻辑只检测左上角单点，
     身体可向右/下侵入相邻墙或海接近 1 格才被拦停。现检测脚印四角
     （内缩 0.02 防止恰好压线时误判到相邻格）所辖瓦片，四角全可走才允许落位；
     逐轴（axis 分离）调用即可保留"贴墙滑动"手感。 */
  function boxPenalty(x, y) {
    if (!ready) return 0;
    const e = 0.02;
    let bad = 0;
    if (!freeTile(x + e, y + e)) bad++;
    if (!freeTile(x + 1 - e, y + e)) bad++;
    if (!freeTile(x + e, y + 1 - e)) bad++;
    if (!freeTile(x + 1 - e, y + 1 - e)) bad++;
    return bad;
  }
  function passableBox(x, y) { return boxPenalty(x, y) === 0; }
  function regionOf(x, y) {
    if (!ready || !inb(x, y)) return null; // 未生成时安全返回 null（防崩）
    return LG.Config.REGIONS[regionMap[(y | 0) * W + (x | 0)]] || null;
  }

  /* 迷雾：仅 maze 区域启用 */
  function reveal(x, y) {
    const rg = regionOf(x, y);
    if (!rg || rg.biome !== 'maze') return;
    const rad = 6;
    for (let oy = -rad; oy <= rad; oy++)
      for (let ox = -rad; ox <= rad; ox++) {
        const px = (x | 0) + ox, py = (y | 0) + oy;
        if (inb(px, py) && ox * ox + oy * oy <= rad * rad) fog[py * W + px] = 1;
      }
  }
  function fogVisible(x, y) {
    if (!ready || !inb(x, y)) return false;
    return !!fog[(y | 0) * W + (x | 0)];
  }

  LG.Terrain = {
    SIZE: W, generate, tileAt, heightAt, walkable, jumpable, isWater, regionOf, isMazeAt,
    boxPenalty, passableBox,
    get ready() { return ready; },
    fog: { reveal, visible: fogVisible },
    TYPE: { GRASS: T_GRASS, DIRT: T_DIRT, SAND: T_SAND, SNOW: T_SNOW, ROCK: T_ROCK,
            WATER: T_WATER, ROAD: T_ROAD, WALL: T_WALL, CASTLE: T_CASTLE, VOID: T_VOID, FENCE: T_FENCE },
    // 供 save.js 读取种子+增量策略（Q59）
    raw: () => ({ tiles, height }),
  };
})();
