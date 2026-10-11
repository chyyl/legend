/**
 * Procedural Building Generation — Shape Grammar + Constraint Solving
 * Generates building geometry at runtime from seed, no prefabs
 */

import { globalPRNG } from '../prng.js';
import { fbm2D } from '../noise.js';

export const BUILDING_TYPES = {
  HOUSE: 0,
  SHOP: 1,
  STASH: 2,
  PORTAL: 3,
  BOSS_ARENA: 4,
  WALL: 5,
  DECOR: 6
};

export const BUILDING_SIZES = {
  SMALL: { w: 16, h: 16 },      // 1x1 tile
  MEDIUM: { w: 32, h: 24 },     // 2x1.5 tiles
  LARGE: { w: 48, h: 48 },      // 3x3 tiles
  HUGE: { w: 64, h: 64 }        // 4x4 tiles
};

// Shape grammar rules: each rule expands a symbol into geometry + child symbols
const GRAMMAR = {
  // Root symbols by building type
  HOUSE: ['FOUNDATION', 'WALLS', 'ROOF', 'DOOR', 'WINDOWS', 'DECOR'],
  SHOP: ['FOUNDATION', 'WALLS', 'ROOF', 'DOOR', 'WINDOWS', 'SIGN', 'DECOR'],
  STASH: ['FOUNDATION', 'WALLS', 'ROOF', 'DOOR', 'CHEST'],
  PORTAL: ['PLATFORM', 'ARCHWAY', 'PARTICLES'],
  BOSS_ARENA: ['FOUNDATION', 'WALLS', 'PILLARS', 'CENTER'],
  WALL: ['FOUNDATION', 'WALL_SEGMENT'],
  DECOR: ['PROP']
};

// Constraint types
const CONSTRAINTS = {
  NO_OVERLAP: 'no_overlap',
  CONNECTED: 'connected',
  ALIGN_GRID: 'align_grid',
  MIN_DISTANCE: 'min_distance',
  MAX_DISTANCE: 'max_distance',
  ON_EDGE: 'on_edge',
  INSIDE_BOUNDS: 'inside_bounds'
};

/**
 * Generate a building at world position
 * @param {Object} opts
 * @param {number} opts.seed - building seed
 * @param {number} opts.x - world X
 * @param {number} opts.y - world Y
 * @param {number} opts.type - BUILDING_TYPES
 * @param {string} opts.size - BUILDING_SIZES key
 * @param {number} opts.rotation - 0, 90, 180, 270
 * @param {Object} opts.constraints - constraint overrides
 * @returns {Object} { vertices, indices, uvs, type, bounds, interactionPoints }
 */
export function generateBuilding({
  seed = 0,
  x = 0,
  y = 0,
  type = BUILDING_TYPES.HOUSE,
  size = 'MEDIUM',
  rotation = 0,
  constraints = {}
} = {}) {
  const prng = createPRNG(seed);
  const { w, h } = BUILDING_SIZES[size];
  const halfW = w / 2, halfH = h / 2;

  // Base shape from grammar
  const symbols = GRAMMAR[Object.keys(BUILDING_TYPES)[type]] || GRAMMAR.HOUSE;
  const geometry = { vertices: [], indices: [], uvs: [], interactionPoints: [] };

  // Apply shape grammar rules
  for (const symbol of symbols) {
    expandSymbol(symbol, geometry, { x, y, w, h, rotation, prng, constraints });
  }

  // Solve constraints (relaxation iterations)
  solveConstraints(geometry, constraints, prng, 10);

  // Convert to typed arrays
  return {
    vertices: new Float32Array(geometry.vertices.flat()),
    indices: new Uint16Array(geometry.indices.flat()),
    uvs: new Float32Array(geometry.uvs.flat()),
    type,
    bounds: { x: x - halfW, y: y - halfH, w, h },
    interactionPoints: geometry.interactionPoints,
    seed
  };
}

function expandSymbol(symbol, geom, ctx) {
  const { x, y, w, h, rotation, prng, constraints } = ctx;
  const hw = w / 2, hh = h / 2;

  switch (symbol) {
    case 'FOUNDATION': {
      // Rectangular base with slight noise perturbation
      const corners = [
        [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]
      ].map(([vx, vy]) => rotatePoint(vx, vy, rotation));
      const baseIdx = geom.vertices.length / 2;
      for (const { x: vx, y: vy } of corners) {
        geom.vertices.push([x + vx + prng.nextFloat(-0.5, 0.5), y + vy + prng.nextFloat(-0.5, 0.5)]);
        geom.uvs.push([(vx + hw) / w, (vy + hh) / h]);
      }
      geom.indices.push([baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3]);
      break;
    }

    case 'WALLS': {
      // Four walls with window/door openings
      const wallCount = 4;
      for (let i = 0; i < wallCount; i++) {
        const angle = (i * Math.PI / 2) + rotation * Math.PI / 180;
        const isFront = i === 0;
        const wallW = isFront ? w * 0.6 : w;
        const wallH = h * 0.8;
        const offsetX = Math.cos(angle) * (hw * 0.9);
        const offsetY = Math.sin(angle) * (hh * 0.9);

        // Wall quads with openings
        const openings = isFront ? 2 : (prng.next() < 0.3 ? 1 : 0); // door + maybe window
        generateWall(geom, x + offsetX, y + offsetY, wallW, wallH, angle, openings, prng);
      }
      break;
    }

    case 'ROOF': {
      // Gabled roof
      const ridgeH = h * 0.4;
      const roofVerts = [
        [-hw, -hh, 0], [hw, -hh, 0], [0, 0, ridgeH],
        [hw, hh, 0], [-hw, hh, 0], [0, 0, ridgeH]
      ].map(([vx, vy, vz]) => rotatePoint3D(vx, vy, vz, rotation));
      const baseIdx = geom.vertices.length / 2;
      for (const { x: vx, y: vy } of roofVerts) {
        geom.vertices.push([x + vx, y + vy]);
        geom.uvs.push([(vx + hw) / (w * 2), (vy + hh) / (h * 2)]);
      }
      geom.indices.push([baseIdx, baseIdx + 1, baseIdx + 2, baseIdx + 3, baseIdx + 4, baseIdx + 5]);
      break;
    }

    case 'DOOR': {
      // Main entrance on front face
      const doorW = w * 0.25, doorH = h * 0.5;
      const doorX = x, doorY = y - hh + doorH / 2;
      const rotated = rotatePoint(0, -hh + doorH / 2, rotation);
      geom.interactionPoints.push({
        type: 'door',
        x: x + rotated.x,
        y: y + rotated.y,
        w: doorW,
        h: doorH,
        rotation
      });
      break;
    }

    case 'WINDOWS': {
      // Side windows
      for (let i = 1; i < 4; i++) {
        if (prng.next() < 0.6) {
          const angle = i * Math.PI / 2 + rotation * Math.PI / 180;
          const wx = Math.cos(angle) * (hw * 0.7);
          const wy = Math.sin(angle) * (hh * 0.7);
          geom.interactionPoints.push({
            type: 'window',
            x: x + wx,
            y: y + wy,
            w: w * 0.15,
            h: h * 0.2,
            rotation: angle
          });
        }
      }
      break;
    }

    case 'SIGN': {
      // Shop sign
      geom.interactionPoints.push({
        type: 'sign',
        x: x,
        y: y - hh - 4,
        w: w * 0.5,
        h: 8,
        rotation
      });
      break;
    }

    case 'CHEST': {
      // Stash chest inside
      geom.interactionPoints.push({
        type: 'stash',
        x: x + prng.nextFloat(-hw * 0.3, hw * 0.3),
        y: y + prng.nextFloat(-hh * 0.3, hh * 0.3),
        w: 12, h: 12,
        rotation
      });
      break;
    }

    case 'PLATFORM': {
      // Portal platform
      const pts = [
        [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]
      ].map(([vx, vy]) => rotatePoint(vx, vy, rotation));
      const baseIdx = geom.vertices.length / 2;
      for (const [vx, vy] of pts) {
        geom.vertices.push([x + vx, y + vy]);
        geom.uvs.push([0.5 + vx / w, 0.5 + vy / h]);
      }
      geom.indices.push([baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3]);
      break;
    }

    case 'ARCHWAY': {
      // Portal arch
      geom.interactionPoints.push({
        type: 'portal',
        x, y,
        w: w * 0.6,
        h: h * 0.8,
        rotation
      });
      break;
    }

    case 'PARTICLES': {
      // Particle emitter point
      geom.interactionPoints.push({
        type: 'particle_emitter',
        x, y,
        w: 4, h: 4,
        rotation: 0
      });
      break;
    }

    case 'PILLARS': {
      // Arena pillars
      for (let i = 0; i < 4; i++) {
        const angle = (i + 0.5) * Math.PI / 2 + rotation * Math.PI / 180;
        const px = Math.cos(angle) * hw * 0.7;
        const py = Math.sin(angle) * hh * 0.7;
        geom.interactionPoints.push({
          type: 'pillar',
          x: x + px,
          y: y + py,
          w: 8, h: 8,
          rotation
        });
      }
      break;
    }

    case 'CENTER': {
      // Boss spawn point
      geom.interactionPoints.push({
        type: 'boss_spawn',
        x, y,
        w: 20, h: 20,
        rotation: 0
      });
      break;
    }

    case 'WALL_SEGMENT': {
      // Wall segment for perimeter walls
      const segW = w, segH = h;
      const pts = [
        [-segW/2, -segH/2], [segW/2, -segH/2], [segW/2, segH/2], [-segW/2, segH/2]
      ].map(([vx, vy]) => rotatePoint(vx, vy, rotation));
      const baseIdx = geom.vertices.length / 2;
      for (const [vx, vy] of pts) {
        geom.vertices.push([x + vx, y + vy]);
        geom.uvs.push([0.5 + vx / segW, 0.5 + vy / segH]);
      }
      geom.indices.push([baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3]);
      break;
    }

    case 'PROP': {
      // Decorative prop
      geom.interactionPoints.push({
        type: 'prop',
        x: x + prng.nextFloat(-hw, hw),
        y: y + prng.nextFloat(-hh, hh),
        w: 8, h: 8,
        rotation: prng.next() * Math.PI * 2
      });
      break;
    }
  }
}

function generateWall(geom, cx, cy, w, h, angle, openings, prng) {
  const hw = w / 2, hh = h / 2;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);

  // Wall segments between openings
  const openingWidth = w * 0.2;
  const totalOpeningSpace = openings * openingWidth;
  const wallSpace = w - totalOpeningSpace;
  const segmentCount = openings + 1;
  const segmentW = wallSpace / segmentCount;

  let offset = -hw;
  for (let s = 0; s < segmentCount; s++) {
    const segLeft = offset;
    const segRight = offset + segmentW;

    // World coords for segment corners
    const corners = [
      [segLeft, -hh], [segRight, -hh], [segRight, hh], [segLeft, hh]
    ].map(([vx, vy]) => [
      cx + vx * cosA - vy * sinA,
      cy + vx * sinA + vy * cosA
    ]);

    const baseIdx = geom.vertices.length / 2;
    for (const [vx, vy] of corners) {
      geom.vertices.push([vx, vy]);
      geom.uvs.push([(vx - cx + hw) / w, (vy - cy + hh) / h]);
    }
    geom.indices.push([baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3]);

    offset = segRight + openingWidth;
  }
}

function rotatePoint(x, y, degrees) {
  const rad = degrees * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function rotatePoint3D(x, y, z, degrees) {
  const rad = degrees * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos, z };
}

function solveConstraints(geometry, constraints, prng, iterations = 10) {
  // Simple constraint relaxation for interaction points
  const points = geometry.interactionPoints;
  if (points.length < 2) return;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (a.w + b.w) / 2 + 2; // minimum separation

        if (dist < minDist && dist > 0) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }

    // Keep inside building bounds
    for (const p of points) {
      const hw = constraints.boundsW / 2 || 24;
      const hh = constraints.boundsH / 2 || 24;
      p.x = Math.max(-hw + p.w/2, Math.min(hw - p.w/2, p.x));
      p.y = Math.max(-hh + p.h/2, Math.min(hh - p.h/2, p.y));
    }
  }
}

/**
 * Generate a cluster of buildings (town, camp, ruins)
 */
export function generateBuildingCluster({
  seed = 0,
  centerX = 0,
  centerY = 0,
  radius = 100,
  buildingCount = 20,
  typeWeights = { [BUILDING_TYPES.HOUSE]: 0.6, [BUILDING_TYPES.SHOP]: 0.1, [BUILDING_TYPES.STASH]: 0.05, [BUILDING_TYPES.DECOR]: 0.25 }
} = {}) {
  const prng = createPRNG(seed);
  const buildings = [];

  // Generate candidate positions using Poisson disc
  const candidates = [];
  const cellSize = 20;
  const cols = Math.ceil(radius * 2 / cellSize);
  const rows = Math.ceil(radius * 2 / cellSize);
  const grid = new Array(cols * rows).fill(-1);

  function addCandidate(x, y) {
    candidates.push({ x, y });
    const gx = Math.floor((x + radius) / cellSize);
    const gy = Math.floor((y + radius) / cellSize);
    if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
      grid[gy * cols + gx] = candidates.length - 1;
    }
  }

  // Initial candidate
  addCandidate(centerX + prng.nextFloat(-radius * 0.3, radius * 0.3),
               centerY + prng.nextFloat(-radius * 0.3, radius * 0.3));

  while (candidates.length > 0 && buildings.length < buildingCount) {
    const idx = prng.nextInt(candidates.length);
    const cand = candidates[idx];
    candidates.splice(idx, 1);

    // Check distance to existing buildings
    let valid = true;
    for (const b of buildings) {
      const dx = b.x - cand.x, dy = b.y - cand.y;
      if (dx * dx + dy * dy < 400) { valid = false; break; }
    }

    if (!valid) continue;

    // Pick building type by weights
    const types = Object.keys(typeWeights).map(Number);
    const weights = types.map(t => typeWeights[t]);
    let r = prng.next();
    let type = types[0];
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { type = types[i]; break; }
    }

    const size = prng.next() < 0.7 ? 'SMALL' : (prng.next() < 0.9 ? 'MEDIUM' : 'LARGE');
    const rotation = prng.nextInt(4) * 90;

    buildings.push(generateBuilding({
      seed: seed + buildings.length,
      x: cand.x, y: cand.y,
      type, size, rotation
    }));
  }

  return buildings;
}

function createPRNG(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 15), 1 | z);
      z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    },
    nextInt(max) { return Math.floor(this.next() * max); },
    nextFloat(min, max) { return min + this.next() * (max - min); }
  };
}