/**
 * Terrain Generation — Delaunay mesh + multi-octave noise heightmap
 * Produces: vertices (Float32Array), triangles (Uint32Array), biomes (Uint8Array)
 * LOD: pre-computed simplified meshes per chunk
 */
import { globalPRNG, setGlobalSeed } from '../prng.js';
import { fbm2D, ridged2D, domainWarp, setNoiseSeed } from '../noise.js';
import { delaunayTriangulate, generateGridPoints, computeTriangleNormals } from '../delaunay.js';

export const BIOMES = {
  GRASSLAND: 0,
  FOREST: 1,
  WASTELAND: 2,
  HIGHLAND: 3,
  TOWN: 4
};

export const CHUNK_SIZE = 256; // world units per chunk
export const GRID_SPACING = 32; // base vertex spacing (32 → ~1000 points, triangulation stays <1s)
export const JITTER = 4; // grid perturbation

/**
 * Generate terrain for a region
 * @param {Object} opts
 * @param {number} opts.seed - world seed
 * @param {number} opts.width - world width
 * @param {number} opts.height - world height
 * @param {number} opts.chunkSize - chunk size in world units
 * @returns {Object} { vertices, triangles, biomes, chunks, bounds }
 */
export function generateTerrain({
  seed = 0,
  width = 1000,
  height = 1000,
  chunkSize = CHUNK_SIZE
} = {}) {
  setGlobalSeed(seed);
  setNoiseSeed(seed ^ 0x9E3779B9);

  // 1. Generate base grid points with noise perturbation
  const points = generateGridPoints(width, height, GRID_SPACING, JITTER, seed ^ 0x12345678);

  // 2. Compute height and biome for each point
  const heights = new Float32Array(points.length);
  const biomes = new Uint8Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // Domain warp for organic biome boundaries
    const warped = domainWarp(p.x * 0.01, p.y * 0.01, 0.5);
    const continentalness = fbm2D(warped.x, warped.y, 4, 0.5, 2.0);
    const erosion = fbm2D(warped.x * 2, warped.y * 2, 3, 0.5, 2.0);
    const peaks = ridged2D(warped.x * 4, warped.y * 4, 3);

    // Height composition
    let h = continentalness * 0.6 + erosion * 0.3 + peaks * 0.1;
    h = Math.max(0, Math.min(1, h * 1.2 - 0.1));
    heights[i] = h;

    // Biome assignment based on height + noise
    const biomeNoise = fbm2D(p.x * 0.02, p.y * 0.02, 2);
    if (h < 0.15) biomes[i] = BIOMES.GRASSLAND;
    else if (h < 0.35) biomes[i] = biomeNoise > 0 ? BIOMES.FOREST : BIOMES.GRASSLAND;
    else if (h < 0.6) biomes[i] = BIOMES.WASTELAND;
    else biomes[i] = BIOMES.HIGHLAND;
  }

  // 3. Town center override (center of map)
  const townCenterX = width * 0.5;
  const townCenterY = height * 0.5;
  const townRadius = 80;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dx = p.x - townCenterX;
    const dy = p.y - townCenterY;
    if (dx * dx + dy * dy < townRadius * townRadius) {
      biomes[i] = BIOMES.TOWN;
      heights[i] = 0.1; // flat town
    }
  }

  // 4. Delaunay triangulation
  const triangles = delaunayTriangulate(points);

  // 5. Build vertex buffers (interleaved: x, y, z, biome, normalX, normalY, normalZ)
  const vertexCount = points.length;
  const vertices = new Float32Array(vertexCount * 7);
  for (let i = 0; i < vertexCount; i++) {
    const p = points[i];
    vertices[i * 7] = p.x;
    vertices[i * 7 + 1] = p.y;
    vertices[i * 7 + 2] = heights[i] * 100; // scale height
    vertices[i * 7 + 3] = biomes[i];
    // normals computed later
  }

  // 6. Compute per-vertex normals (average of adjacent triangles)
  const normals = new Float32Array(vertexCount * 3);
  const normalCount = new Uint16Array(vertexCount);
  for (const tri of triangles) {
    const [a, b, c] = tri;
    const p0 = points[a], p1 = points[b], p2 = points[c];
    const h0 = heights[a], h1 = heights[b], h2 = heights[c];
    // 3D cross product
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = (h1 - h0) * 100;
    const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = (h2 - h0) * 100;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    for (const idx of [a, b, c]) {
      normals[idx * 3] += nx / len;
      normals[idx * 3 + 1] += ny / len;
      normals[idx * 3 + 2] += nz / len;
      normalCount[idx]++;
    }
  }
  for (let i = 0; i < vertexCount; i++) {
    const cnt = normalCount[i] || 1;
    const len = Math.sqrt(
      normals[i * 3] ** 2 + normals[i * 3 + 1] ** 2 + normals[i * 3 + 2] ** 2
    ) || 1;
    vertices[i * 7 + 4] = normals[i * 3] / cnt / len;
    vertices[i * 7 + 5] = normals[i * 3 + 1] / cnt / len;
    vertices[i * 7 + 6] = normals[i * 3 + 2] / cnt / len;
  }

  // 7. Chunking for LOD and frustum culling
  const chunks = buildChunks(points, triangles, vertices, width, height, chunkSize);

  // 8. Build index buffer
  const indices = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    indices[i * 3] = triangles[i][0];
    indices[i * 3 + 1] = triangles[i][1];
    indices[i * 3 + 2] = triangles[i][2];
  }

  return {
    vertices,
    indices,
    biomes,
    chunks,
    bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    pointCount: vertexCount,
    triangleCount: triangles.length
  };
}

/**
 * Build spatial chunks for frustum culling and LOD
 */
function buildChunks(points, triangles, vertices, width, height, chunkSize) {
  const cols = Math.ceil(width / chunkSize);
  const rows = Math.ceil(height / chunkSize);
  const chunks = new Array(rows * cols).fill(null).map(() => ({
    triangles: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    vertexIndices: new Set()
  }));

  // Assign triangles to chunks by centroid
  for (let i = 0; i < triangles.length; i++) {
    const [a, b, c] = triangles[i];
    const cx = (points[a].x + points[b].x + points[c].x) / 3;
    const cy = (points[a].y + points[b].y + points[c].y) / 3;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(cx / chunkSize)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(cy / chunkSize)));
    const chunk = chunks[row * cols + col];
    chunk.triangles.push(i);
    chunk.vertexIndices.add(a);
    chunk.vertexIndices.add(b);
    chunk.vertexIndices.add(c);
  }

  // Compute chunk bounds
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const chunk = chunks[row * cols + col];
      chunk.bounds = {
        minX: col * chunkSize,
        minY: row * chunkSize,
        maxX: Math.min(width, (col + 1) * chunkSize),
        maxY: Math.min(height, (row + 1) * chunkSize)
      };
      chunk.vertexIndices = Array.from(chunk.vertexIndices);
    }
  }

  return { chunks, cols, rows, chunkSize };
}

/**
 * LOD: Generate simplified index buffer for distance rendering
 * Returns array of index buffers per LOD level (0 = full, 1 = 50%, 2 = 25%)
 */
export function generateLODIndices(indices, reductionLevels = [1.0, 0.5, 0.25]) {
  const lodBuffers = [];
  for (const ratio of reductionLevels) {
    const targetCount = Math.floor(indices.length * ratio / 3);
    // Simple: take every Nth triangle (deterministic)
    const step = Math.max(1, Math.round(1 / ratio));
    const lod = new Uint32Array(targetCount * 3);
    let j = 0;
    for (let i = 0; i < indices.length && j < targetCount; i += step * 3) {
      lod[j * 3] = indices[i];
      lod[j * 3 + 1] = indices[i + 1];
      lod[j * 3 + 2] = indices[i + 2];
      j++;
    }
    lodBuffers.push(lod);
  }
  return lodBuffers;
}

/**
 * Query biome at world position
 */
export function getBiomeAt(terrain, x, y) {
  const { bounds, vertices } = terrain;
  if (x < bounds.minX || x >= bounds.maxX || y < bounds.minY || y >= bounds.maxY) {
    return BIOMES.GRASSLAND;
  }
  // Simple nearest vertex lookup (could use spatial index)
  const gridX = Math.floor(x / GRID_SPACING);
  const gridY = Math.floor(y / GRID_SPACING);
  const cols = Math.ceil((bounds.maxX - bounds.minX) / GRID_SPACING) + 1;
  const idx = Math.min(vertices.length / 7 - 1, gridY * cols + gridX);
  return vertices[idx * 7 + 3];
}

/**
 * Get height at world position (bilinear interpolation)
 */
export function getHeightAt(terrain, x, y) {
  const { bounds, vertices } = terrain;
  if (x < bounds.minX || x >= bounds.maxX || y < bounds.minY || y >= bounds.maxY) {
    return 0;
  }
  const gridX = x / GRID_SPACING;
  const gridY = y / GRID_SPACING;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / GRID_SPACING) + 1;

  const x0 = Math.floor(gridX);
  const y0 = Math.floor(gridY);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(Math.ceil((bounds.maxY - bounds.minY) / GRID_SPACING), y0 + 1);

  const fx = gridX - x0;
  const fy = gridY - y0;

  const h00 = vertices[(y0 * cols + x0) * 7 + 2];
  const h10 = vertices[(y0 * cols + x1) * 7 + 2];
  const h01 = vertices[(y1 * cols + x0) * 7 + 2];
  const h11 = vertices[(y1 * cols + x1) * 7 + 2];

  return h00 * (1 - fx) * (1 - fy) +
         h10 * fx * (1 - fy) +
         h01 * (1 - fx) * fy +
         h11 * fx * fy;
}