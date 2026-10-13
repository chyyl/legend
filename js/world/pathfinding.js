/* ============================================================================
   js/world/pathfinding.js —— A* 寻路（堆优化）
   ----------------------------------------------------------------------------
   职责：为点击寻路（Q18）提供网格最短路径，支持跳跃矮障碍通行。

   对外接口（window.LG.Path）：
     .find(sx, sy, tx, ty, maxSteps) -> [{x,y}, ...] | null

   设计守则：使用二叉堆优先队列加速；起点终点必须可通行，途经允许 jumpable。
             为控制性能，限制搜索节点上限，超限返回近似（直接朝目标）。
   依赖：world/terrain.js（通行查询）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  /* 极简二叉堆 */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  };
  Heap.prototype.size = function () { return this.a.length; };

  const MAX_NODES = 6000; // 搜索上限，防止长距离卡顿

  function find(sx, sy, tx, ty, maxSteps) {
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (!LG.Terrain.walkable(tx, ty)) {
      // 目标不可走时，找最近可走点
      const near = nearestWalkable(tx, ty, 8);
      if (!near) return null;
      tx = near.x; ty = near.y;
    }
    if (sx === tx && sy === ty) return [];

    const key = (x, y) => y * LG.Terrain.SIZE + x;
    const open = new Heap();
    const gScore = {}, came = {};
    const start = { x: sx, y: sy, g: 0, f: 0 };
    open.push(start); gScore[key(sx, sy)] = 0;
    let nodes = 0;
    const limit = maxSteps || MAX_NODES;

    while (open.size() && nodes < limit) {
      const cur = open.pop();
      nodes++;
      if (cur.x === tx && cur.y === ty) return rebuild(came, cur, key(sx, sy));
      // 八方向（四方向优先，路径更自然）
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const t = LG.Terrain.tileAt(nx, ny);
        // 通行规则：可走 或 可跳跃矮障（跳跃耗时略高）
        let cost = 1;
        if (t.walk) cost = 1;
        else if (t.jump) cost = 1.6;
        else continue;
        // 禁止斜穿墙角
        if (dx && dy) {
          if (!LG.Terrain.walkable(cur.x + dx, cur.y) && !LG.Terrain.jumpable(cur.x + dx, cur.y)) continue;
          if (!LG.Terrain.walkable(cur.x, cur.y + dy) && !LG.Terrain.jumpable(cur.x, cur.y + dy)) continue;
        }
        const ng = cur.g + cost;
        const k = key(nx, ny);
        if (gScore[k] == null || ng < gScore[k]) {
          gScore[k] = ng;
          const h = Math.abs(nx - tx) + Math.abs(ny - ty);
          came[k] = { x: cur.x, y: cur.y };
          open.push({ x: nx, y: ny, g: ng, f: ng + h });
        }
      }
    }
    // 搜不到（超限或孤岛）：返回直线引导的近似路径
    return [{ x: tx, y: ty }];
  }

  function rebuild(came, cur, startKey) {
    const path = [];
    let k = cur.y * LG.Terrain.SIZE + cur.x;
    let node = cur;
    while (k !== startKey && came[k]) {
      path.push({ x: node.x, y: node.y });
      node = came[k];
      k = node.y * LG.Terrain.SIZE + node.x;
    }
    path.reverse();
    return path;
  }

  /* 找最近可通行点（螺旋搜索） */
  function nearestWalkable(x, y, radius) {
    for (let r = 1; r <= radius; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (LG.Terrain.walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
    return null;
  }

  LG.Path = { find, nearestWalkable };
})();
