/**
 * Delaunay Triangulation — Bowyer-Watson algorithm
 * Returns triangle indices for a set of 2D points
 * Deterministic given same point order
 */
import { globalPRNG, createPRNG } from './prng.js';

export function delaunayTriangulate(points) {
  const n = points.length;
  if (n < 3) return [];

  // Super-triangle encompassing all points
  const INF = 1e9;
  const superTri = [
    { x: -INF, y: -INF, idx: n },
    { x: INF, y: -INF, idx: n + 1 },
    { x: 0, y: INF, idx: n + 2 }
  ];

  const allPoints = [...points, ...superTri];
  let triangles = [[n, n + 1, n + 2]];

  function circumcircleContains(tri, p) {
    // Direct indexing (no allocation) — this runs O(n²) times
    const a = allPoints[tri[0]], b = allPoints[tri[1]], c = allPoints[tri[2]];
    const dx = a.x - p.x, dy = a.y - p.y;
    const ex = b.x - p.x, ey = b.y - p.y;
    const fx = c.x - p.x, fy = c.y - p.y;

    const det = (dx * dx + dy * dy) * (ex * fy - fx * ey)
              - (ex * ex + ey * ey) * (dx * fy - fx * dy)
              + (fx * fx + fy * fy) * (dx * ey - ex * dy);
    return det > 0;
  }

  // Insert points in shuffled order for better numerical stability
  const order = [...Array(n).keys()];
  globalPRNG.shuffle(order);

  for (const pid of order) {
    const p = points[pid];
    const badTriangles = [];
    const kept = [];

    // Single partition pass — avoids O(n) splice per bad triangle
    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      if (circumcircleContains(tri, p)) badTriangles.push(tri);
      else kept.push(tri);
    }
    triangles = kept;

    // Find boundary edges (edges shared by only one bad triangle)
    // Preserve original edge DIRECTION — orientation must stay counter-clockwise
    const edgeMap = new Map();
    for (const tri of badTriangles) {
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const key = a < b ? a + ',' + b : b + ',' + a;
        const rec = edgeMap.get(key);
        if (rec) rec.count++;
        else edgeMap.set(key, { a, b, count: 1 });
      }
    }

    const polygon = [];
    for (const rec of edgeMap.values()) {
      if (rec.count === 1) polygon.push([rec.a, rec.b]);
    }

    // Re-triangulate polygon
    for (const [a, b] of polygon) {
      triangles.push([a, b, pid]);
    }
  }

  // Remove triangles using super-triangle vertices
  triangles = triangles.filter(tri =>
    tri[0] < n && tri[1] < n && tri[2] < n
  );

  return triangles;
}

/**
 * Generate Poisson-disc distributed points for terrain vertices
 * @param width - world width
 * @param height - world height
 * @param minDist - minimum distance between points
 * @param seed - PRNG seed
 */
export function generatePoissonPoints(width, height, minDist, seed = 0) {
  const prng = createPRNG(seed);
  const cellSize = minDist / Math.sqrt(2);
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const grid = new Array(cols * rows).fill(-1);

  const points = [];
  const active = [];

  function addPoint(x, y) {
    const idx = points.length;
    points.push({ x, y });
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    grid[gy * cols + gx] = idx;
    active.push(idx);
    return idx;
  }

  function getGridIdx(x, y) {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return -1;
    return grid[gy * cols + gx];
  }

  function isValid(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const idx = getGridIdx(x + dx * cellSize, y + dy * cellSize);
        if (idx !== -1) {
          const p = points[idx];
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < minDist ** 2) return false;
        }
      }
    }
    return true;
  }

  // Initial point
  addPoint(prng.nextFloat(0, width), prng.nextFloat(0, height));

  while (active.length > 0) {
    const randIdx = prng.nextInt(active.length);
    const baseIdx = active[randIdx];
    const base = points[baseIdx];
    let found = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = prng.next() * Math.PI * 2;
      const dist = prng.nextFloat(minDist, 2 * minDist);
      const x = base.x + Math.cos(angle) * dist;
      const y = base.y + Math.sin(angle) * dist;

      if (isValid(x, y)) {
        addPoint(x, y);
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(randIdx, 1);
    }
  }

  return points;
}

/**
 * Generate structured grid points with noise perturbation
 * More predictable for terrain, better for LOD
 */
export function generateGridPoints(width, height, spacing, jitter, seed = 0) {
  const prng = createPRNG(seed);
  const points = [];

  for (let y = 0; y <= height; y += spacing) {
    for (let x = 0; x <= width; x += spacing) {
      const nx = x + prng.nextFloat(-jitter, jitter);
      const ny = y + prng.nextFloat(-jitter, jitter);
      points.push({ x: nx, y: ny });
    }
  }

  return points;
}

/**
 * Compute triangle normals for terrain shading
 */
export function computeTriangleNormals(points, triangles) {
  const normals = new Float32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    const [a, b, c] = triangles[i];
    const p0 = points[a], p1 = points[b], p2 = points[c];
    // 2D cross product for Z normal
    const nx = (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y);
    const len = Math.sqrt(nx * nx + 1); // approximate
    normals[i * 3] = 0;
    normals[i * 3 + 1] = 0;
    normals[i * 3 + 2] = nx > 0 ? 1 : -1;
  }
  return normals;
}