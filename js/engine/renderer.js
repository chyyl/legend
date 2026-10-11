/**
 * Canvas2D Batch Renderer with Splat Map Compositing
 * Single drawImage per frame via pre-baked chunk OffscreenCanvases
 */

import { CHUNK_SIZE, GRID_SPACING } from './terrain.js';

export const LAYERS = {
  TERRAIN: 0,
  TERRAIN_DETAIL: 1,
  BUILDINGS: 2,
  ENTITIES: 3,
  EFFECTS: 4,
  UI: 5
};

export const SPLAT_LAYERS = [
  'grass',    // 0
  'dirt',     // 1
  'stone',    // 2
  'snow',     // 3
  'water',    // 4
  'road',     // 5
  'custom1',  // 6
  'custom2'   // 7
];

/**
 * Renderer initialization
 * @param {HTMLCanvasElement} canvas - Main canvas
 * @param {Object} opts
 */
export function createRenderer(canvas, opts = {}) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const dpr = opts.dpr || Math.min(window.devicePixelRatio || 1, 2);

  // Offscreen canvases for chunk baking
  const chunkCanvases = new Map(); // key: `${cx},${cy}` -> OffscreenCanvas
  const chunkDirty = new Set(); // chunks needing rebake

  // Camera
  const camera = {
    x: 0, y: 0,
    zoom: 1,
    targetZoom: 1,
    shake: { x: 0, y: 0, time: 0, duration: 0, intensity: 0 }
  };

  // Batch buffers
  const batches = new Map(); // layer -> { vertices, indices, textures, drawCalls }

  // Splat textures (loaded on demand)
  const splatTextures = new Map(); // name -> ImageBitmap/HTMLImageElement
  const splatWeightMaps = new Map(); // chunkKey -> OffscreenCanvas (8-channel weights)

  // Stats
  const stats = { drawCalls: 0, triangles: 0, chunksVisible: 0, frameTime: 0 };

  function resize(width, height) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setCamera(x, y, zoom) {
    camera.x = x;
    camera.y = y;
    if (zoom !== undefined) camera.targetZoom = Math.max(0.25, Math.min(4, zoom));
  }

  function worldToScreen(wx, wy) {
    const zoom = camera.zoom;
    return {
      x: (wx - camera.x) * zoom + canvas.width / dpr / 2,
      y: (wy - camera.y) * zoom + canvas.height / dpr / 2
    };
  }

  function screenToWorld(sx, sy) {
    const zoom = camera.zoom;
    return {
      x: (sx - canvas.width / dpr / 2) / zoom + camera.x,
      y: (sy - canvas.height / dpr / 2) / zoom + camera.y
    };
  }

  function getVisibleChunks(terrainChunks) {
    const { cols, rows, chunks, chunkSize } = terrainChunks;
    const viewW = canvas.width / dpr / camera.zoom;
    const viewH = canvas.height / dpr / camera.zoom;
    const minCX = Math.max(0, Math.floor((camera.x - viewW / 2) / chunkSize));
    const maxCX = Math.min(cols - 1, Math.floor((camera.x + viewW / 2) / chunkSize));
    const minCY = Math.max(0, Math.floor((camera.y - viewH / 2) / chunkSize));
    const maxCY = Math.min(rows - 1, Math.floor((camera.y + viewH / 2) / chunkSize));

    const visible = [];
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const chunk = chunks[cy * cols + cx];
        if (chunk && chunk.triangles.length > 0) {
          visible.push({ cx, cy, chunk });
        }
      }
    }
    return visible;
  }

  /**
   * Bake a terrain chunk to OffscreenCanvas using splat map weights
   * This runs once per chunk at generation time or when dirty
   */
  async function bakeChunk(cx, cy, chunk, terrain, splatWeights) {
    const key = `${cx},${cy}`;
    const { bounds } = chunk;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;

    // Create offscreen canvas at render resolution (scaled down for performance)
    const bakeScale = 0.5; // bake at half resolution, upscale at render
    const oc = new OffscreenCanvas(w * bakeScale, h * bakeScale);
    const octx = oc.getContext('2d');

    // Draw splat layers based on weight maps
    for (let layer = 0; layer < SPLAT_LAYERS.length; layer++) {
      const weightMap = splatWeights.get(`${cx},${cy},${layer}`);
      if (!weightMap) continue;

      const tex = await getSplatTexture(SPLAT_LAYERS[layer]);
      if (!tex) continue;

      // tmp = texture masked by the weight map (alpha channel = weight)
      const tmp = new OffscreenCanvas(w * bakeScale, h * bakeScale);
      const tctx = tmp.getContext('2d');
      tctx.drawImage(tex, 0, 0, w * bakeScale, h * bakeScale);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(weightMap, 0, 0, w * bakeScale, h * bakeScale);

      // First layer paints, remaining layers add on top
      octx.globalCompositeOperation = layer === 0 ? 'source-over' : 'lighter';
      octx.drawImage(tmp, 0, 0);
    }

    chunkCanvases.set(key, oc);
    chunkDirty.delete(key);
    return oc;
  }

  async function getSplatTexture(name) {
    if (splatTextures.has(name)) return splatTextures.get(name);

    // Generate procedural texture if not loaded
    const tex = await generateProceduralSplat(name);
    splatTextures.set(name, tex);
    return tex;
  }

  async function generateProceduralSplat(name) {
    // Create small procedural texture (64x64) for each splat layer
    const size = 64;
    const oc = new OffscreenCanvas(size, size);
    const octx = oc.getContext('2d');
    const prng = createPRNG(hashString(name));

    const colors = {
      grass: ['#3a5a2a', '#4a6a3a', '#2a4a1a'],
      dirt: ['#5a4a3a', '#6a5a4a', '#4a3a2a'],
      stone: ['#5a5a5a', '#6a6a6a', '#4a4a4a'],
      snow: ['#ffffff', '#e0e0f0', '#d0d0e0'],
      water: ['#2a4a6a', '#3a5a7a', '#1a3a5a'],
      road: ['#3a3a3a', '#4a4a4a', '#2a2a2a'],
      custom1: ['#6a4a2a', '#7a5a3a', '#5a3a1a'],
      custom2: ['#4a6a5a', '#5a7a6a', '#3a5a4a']
    };

    const palette = colors[name] || colors.dirt;

    // Base color
    octx.fillStyle = palette[0];
    octx.fillRect(0, 0, size, size);

    // Noise detail
    const imgData = octx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (prng.next() - 0.5) * 30;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    octx.putImageData(imgData, 0, 0);

    // Convert to ImageBitmap for faster drawing
    return await createImageBitmap(oc);
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
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
      }
    };
  }

  /**
   * Generate weight maps for a chunk based on biome data
   */
  function generateSplatWeights(chunk, terrain) {
    const { bounds, vertexIndices } = chunk;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const resolution = 64; // weight map resolution

    const weights = new Map();

    for (let layer = 0; layer < SPLAT_LAYERS.length; layer++) {
      const oc = new OffscreenCanvas(resolution, resolution);
      const octx = oc.getContext('2d');
      const imgData = octx.createImageData(resolution, resolution);
      const data = imgData.data;

      for (let py = 0; py < resolution; py++) {
        for (let px = 0; px < resolution; px++) {
          const wx = bounds.minX + (px / resolution) * w;
          const wy = bounds.minY + (py / resolution) * h;
          const biome = getBiomeAtPoint(terrain, wx, wy);
          const weight = biomeToWeight(biome, layer);

          const idx = (py * resolution + px) * 4;
          // Weight lives in the ALPHA channel — bakeChunk masks textures with it
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = Math.round(weight * 255);
        }
      }
      octx.putImageData(imgData, 0, 0);
      weights.set(`${chunk.cx},${chunk.cy},${layer}`, oc);
    }

    return weights;
  }

  function getBiomeAtPoint(terrain, x, y) {
    // Nearest-vertex lookup on the regular grid (stride = GRID_SPACING)
    const { vertices, bounds } = terrain;
    const cols = Math.ceil((bounds.maxX - bounds.minX) / GRID_SPACING) + 1;
    const rows = Math.ceil((bounds.maxY - bounds.minY) / GRID_SPACING) + 1;
    const gridX = Math.min(cols - 1, Math.max(0, Math.floor(x / GRID_SPACING)));
    const gridY = Math.min(rows - 1, Math.max(0, Math.floor(y / GRID_SPACING)));
    const idx = Math.min(vertices.length / 7 - 1, gridY * cols + gridX);
    return vertices[idx * 7 + 3];
  }

  function biomeToWeight(biome, layer) {
    // biome: 0=grass, 1=forest, 2=wasteland, 3=highland, 4=town
    const weights = {
      0: [1, 0.2, 0, 0, 0, 0.1, 0, 0],      // grassland
      1: [0.7, 0.3, 0, 0, 0, 0, 0.1, 0],    // forest
      2: [0.1, 0.6, 0.3, 0, 0, 0, 0, 0],    // wasteland
      3: [0, 0, 0.4, 0.6, 0, 0, 0, 0],      // highland
      4: [0.3, 0.2, 0.1, 0, 0, 0.4, 0, 0]   // town
    };
    return (weights[biome] || weights[0])[layer] || 0;
  }

  /**
   * Main render loop
   */
  function render(terrain, buildings, entities, dt) {
    const start = performance.now();
    stats.drawCalls = 0;
    stats.triangles = 0;

    // Update camera zoom interpolation
    camera.zoom += (camera.targetZoom - camera.zoom) * 0.1;

    // Camera shake
    if (camera.shake.time > 0) {
      camera.shake.time -= dt;
      const progress = 1 - camera.shake.time / camera.shake.duration;
      const intensity = camera.shake.intensity * (1 - progress);
      camera.shake.x = (Math.random() - 0.5) * intensity;
      camera.shake.y = (Math.random() - 0.5) * intensity;
    } else {
      camera.shake.x = camera.shake.y = 0;
    }

    // Clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Apply camera transform
    const zoom = camera.zoom;
    ctx.translate(
      canvas.width / dpr / 2 + camera.shake.x,
      canvas.height / dpr / 2 + camera.shake.y
    );
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);

    // 1. Render terrain chunks (pre-baked)
    const visibleChunks = getVisibleChunks(terrain.chunks);
    stats.chunksVisible = visibleChunks.length;

    for (const { cx, cy, chunk } of visibleChunks) {
      const key = `${cx},${cy}`;
      let oc = chunkCanvases.get(key);

      if (!oc && !chunkDirty.has(key)) {
        // Generate weight maps and schedule bake
        const weights = generateSplatWeights(chunk, terrain);
        chunkDirty.add(key);
        bakeChunk(cx, cy, chunk, terrain, weights).catch(err => {
          console.error('Chunk bake failed:', key, err);
          chunkDirty.delete(key); // allow retry
        });
      } else if (oc) {
        // Draw pre-baked chunk (1px overlap hides bilinear seams between chunks)
        const { bounds } = chunk;
        ctx.drawImage(oc,
          bounds.minX - 1, bounds.minY - 1,
          (bounds.maxX - bounds.minX) + 2,
          (bounds.maxY - bounds.minY) + 2);
        stats.drawCalls++;
      }
    }

    // 2. Render buildings (batched by texture)
    renderBuildings(buildings);

    // 3. Render entities
    renderEntities(entities);

    // 4. Render effects
    // renderEffects(effects);

    // Reset transform for UI
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    stats.frameTime = performance.now() - start;
    return stats;
  }

  function renderBuildings(buildings) {
    // Batch by texture atlas (simplified: single draw per building for now)
    for (const building of buildings) {
      if (!isBuildingVisible(building)) continue;

      ctx.save();
      ctx.translate(building.bounds.x + building.bounds.w / 2, building.bounds.y + building.bounds.h / 2);
      ctx.rotate(building.rotation * Math.PI / 180);

      // Draw building geometry (simplified rect for now)
      ctx.fillStyle = getBuildingColor(building.type);
      ctx.fillRect(-building.bounds.w / 2, -building.bounds.h / 2, building.bounds.w, building.bounds.h);

      // Draw interaction points (debug)
      if (window.DEBUG_SHOW_INTERACTIONS) {
        ctx.strokeStyle = '#ffff00';
        for (const ip of building.interactionPoints) {
          ctx.strokeRect(ip.x - ip.w/2, ip.y - ip.h/2, ip.w, ip.h);
        }
      }

      ctx.restore();
      stats.drawCalls++;
    }
  }

  function isBuildingVisible(building) {
    const viewW = canvas.width / dpr / camera.zoom;
    const viewH = canvas.height / dpr / camera.zoom;
    return !(building.bounds.x + building.bounds.w < camera.x - viewW / 2 ||
             building.bounds.x > camera.x + viewW / 2 ||
             building.bounds.y + building.bounds.h < camera.y - viewH / 2 ||
             building.bounds.y > camera.y + viewH / 2);
  }

  function getBuildingColor(type) {
    const colors = {
      0: '#8b7355', // house
      1: '#a08050', // shop
      2: '#607080', // stash
      3: '#406080', // portal
      4: '#804040', // boss arena
      5: '#505050', // wall
      6: '#706050'  // decor
    };
    return colors[type] || '#888888';
  }

  function renderEntities(entities) {
    for (const entity of entities) {
      if (!entity.visible) continue;
      const { x, y, w = 16, h = 24, color = '#ff0000', rotation = 0 } = entity;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
      stats.drawCalls++;
    }
  }

  function shake(intensity, duration) {
    camera.shake.intensity = intensity;
    camera.shake.duration = duration;
    camera.shake.time = duration;
  }

  function getStats() { return { ...stats }; }

  return {
    canvas,
    ctx,
    resize,
    setCamera,
    worldToScreen,
    screenToWorld,
    render,
    shake,
    getStats,
    get camera() { return camera; },
    LAYERS,
    SPLAT_LAYERS
  };
}