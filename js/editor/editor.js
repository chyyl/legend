/**
 * Map Editor — Procedural Presets, Vector Tools, Object Placement, Playtest
 * Reskinned for Project Emancipate theme
 */

export const EDITOR_TOOLS = {
  SELECT: 'select',
  TERRAIN: 'terrain',
  BIOME: 'biome',
  BUILDING: 'building',
  NPC: 'npc',
  SPAWNER: 'spawner',
  WAYPOINT: 'waypoint',
  REGION: 'region',
  ERASER: 'eraser'
};

export const EDITOR_MODES = {
  EDIT: 'edit',
  PLAYTEST: 'playtest'
};

export function createEditor(opts = {}) {
  const { canvas, renderer, terrainSystem, buildingSystem, liberationSystem, onPlaytest } = opts;

  let mode = EDITOR_MODES.EDIT;
  let currentTool = EDITOR_TOOLS.SELECT;
  let brushSize = 32;
  let brushStrength = 1.0;

  // Selection
  let selectedObjects = new Set();
  let selectionBox = null; // { x1, y1, x2, y2 }
  let isSelecting = false;

  // Camera (editor has its own camera)
  let camera = { x: 500, y: 500, zoom: 1 };

  // Grid
  let showGrid = true;
  let gridSize = 32;
  let snapToGrid = true;

  // History for undo/redo
  const history = [];
  const historyIndex = -1;
  const MAX_HISTORY = 50;

  // Procedural presets
  const presets = {
    terrain: [
      { name: '平原', generator: 'grassland', params: { height: 0.2, variation: 0.1 } },
      { name: '森林', generator: 'forest', params: { height: 0.3, density: 0.7 } },
      { name: '荒原', generator: 'wasteland', params: { height: 0.5, roughness: 0.6 } },
      { name: '高地', generator: 'highland', params: { height: 0.8, peaks: 0.4 } },
      { name: '城镇', generator: 'town', params: { height: 0.1, flat: true } }
    ],
    building: [
      { name: '民房', type: 'house', size: 'SMALL' },
      { name: '商店', type: 'shop', size: 'MEDIUM' },
      { name: '仓库', type: 'stash', size: 'MEDIUM' },
      { name: '传送门', type: 'portal', size: 'LARGE' },
      { name: '首领竞技场', type: 'boss_arena', size: 'HUGE' },
      { name: '围墙', type: 'wall', size: 'LARGE' },
      { name: '装饰', type: 'decor', size: 'SMALL' }
    ],
    npc: [
      { name: '武器商', type: 'shop', category: 'weapons' },
      { name: '防具商', type: 'shop', category: 'armor' },
      { name: '杂货商', type: 'shop', category: 'consumables' },
      { name: '储物箱', type: 'stash' },
      { name: '传送门', type: 'portal' },
      { name: '治疗师', type: 'healer' },
      { name: '铁匠', type: 'smith' },
      { name: '任务向导', type: 'quest_giver' }
    ]
  };

  // Editor state
  let buildings = [];
  let npcs = [];
  let spawners = [];
  let waypoints = [];
  let regions = [];

  function handleMouseDown(e) {
    const pos = getCanvasPos(e);

    if (mode === EDITOR_MODES.PLAYTEST) return;

    switch (currentTool) {
      case EDITOR_TOOLS.SELECT:
        startSelection(pos);
        break;
      case EDITOR_TOOLS.TERRAIN:
      case EDITOR_TOOLS.BIOME:
        applyTerrainBrush(pos);
        break;
      case EDITOR_TOOLS.BUILDING:
        placeBuilding(pos);
        break;
      case EDITOR_TOOLS.NPC:
        placeNPC(pos);
        break;
      case EDITOR_TOOLS.SPAWNER:
        placeSpawner(pos);
        break;
      case EDITOR_TOOLS.WAYPOINT:
        placeWaypoint(pos);
        break;
      case EDITOR_TOOLS.REGION:
        startRegion(pos);
        break;
      case EDITOR_TOOLS.ERASER:
        eraseAt(pos);
        break;
    }
  }

  function handleMouseMove(e) {
    const pos = getCanvasPos(e);

    if (isSelecting) {
      selectionBox.x2 = pos.x;
      selectionBox.y2 = pos.y;
      updateSelection();
    }
  }

  function handleMouseUp(e) {
    if (isSelecting) {
      isSelecting = false;
      finalizeSelection();
    }
    selectionBox = null;
  }

  function handleKeyDown(e) {
    // Tool shortcuts
    const toolKeys = {
      'KeyV': EDITOR_TOOLS.SELECT,
      'KeyT': EDITOR_TOOLS.TERRAIN,
      'KeyB': EDITOR_TOOLS.BIOME,
      'KeyH': EDITOR_TOOLS.BUILDING,
      'KeyN': EDITOR_TOOLS.NPC,
      'KeyS': EDITOR_TOOLS.SPAWNER,
      'KeyW': EDITOR_TOOLS.WAYPOINT,
      'KeyR': EDITOR_TOOLS.REGION,
      'KeyE': EDITOR_TOOLS.ERASER
    };

    if (toolKeys[e.code]) {
      setTool(toolKeys[e.code]);
      return;
    }

    // Shortcuts
    switch (e.code) {
      case 'KeyZ':
        if (e.ctrlKey || e.metaKey) {
          e.shiftKey ? redo() : undo();
        }
        break;
      case 'KeyY':
        if (e.ctrlKey || e.metaKey) redo();
        break;
      case 'Delete':
        deleteSelected();
        break;
      case 'KeyD':
        if (e.ctrlKey || e.metaKey) duplicateSelected();
        break;
      case 'KeyG':
        showGrid = !showGrid;
        break;
      case 'KeyP':
        togglePlaytest();
        break;
      case 'Escape':
        if (mode === EDITOR_MODES.PLAYTEST) togglePlaytest();
        else clearSelection();
        break;
      case 'BracketLeft':
        brushSize = Math.max(8, brushSize - 8);
        break;
      case 'BracketRight':
        brushSize = Math.min(256, brushSize + 8);
        break;
    }
  }

  function handleWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      camera.zoom = Math.max(0.25, Math.min(4, camera.zoom - e.deltaY * 0.001));
    } else if (e.shiftKey) {
      camera.x -= e.deltaY / camera.zoom;
    } else {
      camera.y -= e.deltaY / camera.zoom;
    }
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / camera.zoom + camera.x - canvas.width / 2 / camera.zoom,
      y: (e.clientY - rect.top) / camera.zoom + camera.y - canvas.height / 2 / camera.zoom
    };
  }

  function setTool(tool) {
    currentTool = tool;
    clearSelection();
  }

  function setMode(newMode) {
    mode = newMode;
    if (mode === EDITOR_MODES.PLAYTEST) {
      clearSelection();
      currentTool = EDITOR_TOOLS.SELECT;
    }
  }

  function togglePlaytest() {
    if (mode === EDITOR_MODES.EDIT) {
      // Save current state for playtest
      const playtestData = serialize();
      localStorage.setItem('legendeditor.playtest', JSON.stringify(playtestData));
      setMode(EDITOR_MODES.PLAYTEST);
      if (onPlaytest) onPlaytest(playtestData);
    } else {
      setMode(EDITOR_MODES.EDIT);
    }
  }

  // --- Tool Actions ---

  function startSelection(pos) {
    isSelecting = true;
    selectionBox = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
  }

  function updateSelection() {
    if (!selectionBox) return;
    const x1 = Math.min(selectionBox.x1, selectionBox.x2);
    const y1 = Math.min(selectionBox.y1, selectionBox.y2);
    const x2 = Math.max(selectionBox.x1, selectionBox.x2);
    const y2 = Math.max(selectionBox.y1, selectionBox.y2);

    selectedObjects.clear();
    // Check buildings
    buildings.forEach((b, i) => {
      if (b.x >= x1 && b.x <= x2 && b.y >= y1 && b.y <= y2) {
        selectedObjects.add(`building:${i}`);
      }
    });
    // Check NPCs
    npcs.forEach((n, i) => {
      if (n.x >= x1 && n.x <= x2 && n.y >= y1 && n.y <= y2) {
        selectedObjects.add(`npc:${i}`);
      }
    });
  }

  function finalizeSelection() {
    // Selection complete
  }

  function clearSelection() {
    selectedObjects.clear();
  }

  function applyTerrainBrush(pos) {
    // Apply terrain modification at position
    if (terrainSystem && terrainSystem.modifyTerrain) {
      saveHistory('terrain');
      terrainSystem.modifyTerrain(pos.x, pos.y, brushSize, brushStrength, currentTool === EDITOR_TOOLS.BIOME);
    }
  }

  function placeBuilding(pos) {
    const preset = presets.building.find(p => p.name === currentBuildingPreset) || presets.building[0];
    const x = snapToGrid ? Math.round(pos.x / gridSize) * gridSize : pos.x;
    const y = snapToGrid ? Math.round(pos.y / gridSize) * gridSize : pos.y;

    saveHistory('buildings');
    buildings.push({
      id: `building_${Date.now()}`,
      ...preset,
      x, y,
      rotation: 0
    });
  }

  function placeNPC(pos) {
    const preset = presets.npc.find(p => p.name === currentNPCPreset) || presets.npc[0];
    const x = snapToGrid ? Math.round(pos.x / gridSize) * gridSize : pos.x;
    const y = snapToGrid ? Math.round(pos.y / gridSize) * gridSize : pos.y;

    saveHistory('npcs');
    npcs.push({
      id: `npc_${Date.now()}`,
      ...preset,
      x, y
    });
  }

  function placeSpawner(pos) {
    const x = snapToGrid ? Math.round(pos.x / gridSize) * gridSize : pos.x;
    const y = snapToGrid ? Math.round(pos.y / gridSize) * gridSize : pos.y;

    saveHistory('spawners');
    spawners.push({
      id: `spawner_${Date.now()}`,
      x, y,
      enemyType: 'basic',
      spawnRate: 30,
      maxCount: 5,
      radius: 50
    });
  }

  function placeWaypoint(pos) {
    const x = snapToGrid ? Math.round(pos.x / gridSize) * gridSize : pos.x;
    const y = snapToGrid ? Math.round(pos.y / gridSize) * gridSize : pos.y;

    saveHistory('waypoints');
    waypoints.push({
      id: `wp_${Date.now()}`,
      x, y,
      connections: []
    });
  }

  function startRegion(pos) {
    // Start drawing region polygon
  }

  function eraseAt(pos) {
    saveHistory('all');
    const radius = brushSize;
    buildings = buildings.filter(b => distance(b, pos) > radius);
    npcs = npcs.filter(n => distance(n, pos) > radius);
    spawners = spawners.filter(s => distance(s, pos) > radius);
    waypoints = waypoints.filter(w => distance(w, pos) > radius);
  }

  function distance(obj, pos) {
    const dx = obj.x - pos.x;
    const dy = obj.y - pos.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // --- History ---

  function saveHistory(type) {
    const state = {
      buildings: [...buildings],
      npcs: [...npcs],
      spawners: [...spawners],
      waypoints: [...waypoints],
      regions: [...regions],
      type
    };
    history.splice(historyIndex + 1);
    history.push(state);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function undo() {
    if (historyIndex > 0) {
      const state = history[historyIndex - 1];
      restoreState(state);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      const state = history[historyIndex + 1];
      restoreState(state);
    }
  }

  function restoreState(state) {
    buildings = state.buildings;
    npcs = state.npcs;
    spawners = state.spawners;
    waypoints = state.waypoints;
    regions = state.regions;
  }

  function deleteSelected() {
    saveHistory('selection');
    for (const sel of selectedObjects) {
      const [type, idx] = sel.split(':');
      const i = parseInt(idx);
      if (type === 'building') buildings.splice(i, 1);
      else if (type === 'npc') npcs.splice(i, 1);
      else if (type === 'spawner') spawners.splice(i, 1);
      else if (type === 'waypoint') waypoints.splice(i, 1);
    }
    clearSelection();
  }

  function duplicateSelected() {
    saveHistory('duplicate');
    const newBuildings = [], newNpcs = [];
    for (const sel of selectedObjects) {
      const [type, idx] = sel.split(':');
      const i = parseInt(idx);
      if (type === 'building') {
        const b = { ...buildings[i], id: `building_${Date.now()}_${Math.random()}`, x: buildings[i].x + 32 };
        newBuildings.push(b);
      } else if (type === 'npc') {
        const n = { ...npcs[i], id: `npc_${Date.now()}_${Math.random()}`, x: npcs[i].x + 32 };
        newNpcs.push(n);
      }
    }
    buildings.push(...newBuildings);
    npcs.push(...newNpcs);
    clearSelection();
    for (let i = 0; i < newBuildings.length; i++) {
      selectedObjects.add(`building:${buildings.length - newBuildings.length + i}`);
    }
    for (let i = 0; i < newNpcs.length; i++) {
      selectedObjects.add(`npc:${npcs.length - newNpcs.length + i}`);
    }
  }

  // --- Serialization ---

  function serialize() {
    return {
      version: 1,
      timestamp: Date.now(),
      camera: { ...camera },
      grid: { showGrid, gridSize, snapToGrid },
      terrain: terrainSystem?.serialize?.() || {},
      buildings,
      npcs,
      spawners,
      waypoints,
      regions,
      liberation: liberationSystem?.serialize?.()
    };
  }

  function deserialize(data) {
    if (!data) return;
    camera = { ...camera, ...data.camera };
    if (data.grid) { showGrid = data.grid.showGrid; gridSize = data.grid.gridSize; snapToGrid = data.grid.snapToGrid; }
    if (data.terrain) terrainSystem?.deserialize?.(data.terrain);
    buildings = data.buildings || [];
    npcs = data.npcs || [];
    spawners = data.spawners || [];
    waypoints = data.waypoints || [];
    regions = data.regions || [];
    if (data.liberation) liberationSystem?.deserialize?.(data.liberation);
  }

  function exportToFile() {
    const data = serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emancipate_map_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          deserialize(data);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }

  // --- Rendering ---

  function render(ctx) {
    ctx.save();

    // Camera transform
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Grid
    if (showGrid) renderGrid(ctx);

    // Terrain
    if (renderer && renderer.renderTerrain) {
      renderer.renderTerrain(ctx, camera);
    }

    // Buildings
    renderBuildings(ctx);

    // NPCs
    renderNPCs(ctx);

    // Spawners
    renderSpawners(ctx);

    // Waypoints
    renderWaypoints(ctx);

    // Regions
    renderRegions(ctx);

    // Selection box
    if (selectionBox) renderSelectionBox(ctx);

    // Selected highlights
    renderSelectionHighlights(ctx);

    // Brush preview
    if (currentTool === EDITOR_TOOLS.TERRAIN || currentTool === EDITOR_TOOLS.BIOME || currentTool === EDITOR_TOOLS.ERASER) {
      renderBrushPreview(ctx);
    }

    ctx.restore();

    // UI overlay (tool palette, info panel)
    renderUI(ctx);
  }

  function renderGrid(ctx) {
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.2)';
    ctx.lineWidth = 1 / camera.zoom;

    const left = Math.floor((camera.x - canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
    const top = Math.floor((camera.y - canvas.height / 2 / camera.zoom) / gridSize) * gridSize;
    const right = left + canvas.width / camera.zoom + gridSize;
    const bottom = top + canvas.height / camera.zoom + gridSize;

    for (let x = left; x <= right; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    for (let y = top; y <= bottom; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
  }

  function renderBuildings(ctx) {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const selected = selectedObjects.has(`building:${i}`);

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation * Math.PI / 180);

      ctx.fillStyle = selected ? 'rgba(201, 169, 98, 0.5)' : getBuildingColor(b.type);
      ctx.strokeStyle = selected ? '#ffd700' : '#c9a962';
      ctx.lineWidth = selected ? 3 : 1;

      const w = getBuildingWidth(b.size), h = getBuildingHeight(b.size);
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "Microsoft YaHei"';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, 0, -h/2 - 4);

      ctx.restore();
    }
  }

  function renderNPCs(ctx) {
    const colors = {
      shop: '#4488ff', stash: '#66aa66', portal: '#8844ff',
      healer: '#ff4488', smith: '#ff8844', quest_giver: '#ffdd44'
    };

    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      const selected = selectedObjects.has(`npc:${i}`);

      ctx.fillStyle = selected ? 'rgba(201, 169, 98, 0.5)' : (colors[n.type] || '#888888');
      ctx.strokeStyle = selected ? '#ffd700' : '#ffffff';
      ctx.lineWidth = selected ? 3 : 2;

      ctx.beginPath();
      ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '9px "Microsoft YaHei"';
      ctx.textAlign = 'center';
      ctx.fillText(n.name, n.x, n.y - 18);
    }
  }

  function renderSpawners(ctx) {
    for (const s of spawners) {
      ctx.strokeStyle = 'rgba(255, 68, 68, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderWaypoints(ctx) {
    for (const w of waypoints) {
      ctx.fillStyle = '#44ffff';
      ctx.beginPath();
      ctx.arc(w.x, w.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Connections
      ctx.strokeStyle = 'rgba(68, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      for (const connId of w.connections) {
        const target = waypoints.find(wp => wp.id === connId);
        if (target) {
          ctx.beginPath();
          ctx.moveTo(w.x, w.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      }
    }
  }

  function renderRegions(ctx) {
    for (const r of regions) {
      if (r.points && r.points.length > 2) {
        ctx.fillStyle = 'rgba(201, 169, 98, 0.1)';
        ctx.strokeStyle = '#c9a962';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r.points[0].x, r.points[0].y);
        for (let i = 1; i < r.points.length; i++) {
          ctx.lineTo(r.points[i].x, r.points[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function renderSelectionBox(ctx) {
    if (!selectionBox) return;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.setLineDash([5 / camera.zoom, 5 / camera.zoom]);
    ctx.strokeRect(
      Math.min(selectionBox.x1, selectionBox.x2),
      Math.min(selectionBox.y1, selectionBox.y2),
      Math.abs(selectionBox.x2 - selectionBox.x1),
      Math.abs(selectionBox.y2 - selectionBox.y1)
    );
    ctx.setLineDash([]);
  }

  function renderSelectionHighlights(ctx) {
    // Already rendered in individual render functions
  }

  function renderBrushPreview(ctx) {
    // Get mouse position in world coords (would need to track)
  }

  function renderUI(ctx) {
    // Tool palette
    ctx.font = '12px "Microsoft YaHei"';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let y = 10;
    ctx.fillText(`模式: ${mode === EDITOR_MODES.EDIT ? '编辑' : '试玩'}`, 10, y); y += 20;
    ctx.fillText(`工具: ${getToolName(currentTool)}`, 10, y); y += 20;
    ctx.fillText(`笔刷: ${brushSize}px`, 10, y); y += 20;
    ctx.fillText(`建筑: ${buildings.length} | NPC: ${npcs.length}`, 10, y); y += 20;
    ctx.fillText(`生成器: ${spawners.length} | 路点: ${waypoints.length}`, 10, y);

    // Shortcuts hint
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(canvas.width - 220, 10, 210, 200);
    ctx.strokeStyle = '#c9a962';
    ctx.strokeRect(canvas.width - 220, 10, 210, 200);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '11px monospace';
    const hints = [
      'V - 选择',
      'T - 地形笔刷',
      'B - 生物群系笔刃',
      'H - 放置建筑',
      'N - 放置NPC',
      'S - 放置生成器',
      'W - 放置路点',
      'R - 区域',
      'E - 橡皮擦',
      'G - 切换网格',
      'P - 试玩',
      'Z - 撤销',
      'Y - 重做',
      'Del - 删除',
      'Ctrl+D - 复制',
      '[/] - 笔刷大小',
      '滚轮 - 缩放/平移'
    ];
    hints.forEach((h, i) => {
      ctx.fillText(h, canvas.width - 210, 25 + i * 16);
    });
  }

  function getToolName(tool) {
    const names = {
      select: '选择',
      terrain: '地形笔刷',
      biome: '生物群系笔刷',
      building: '建筑',
      npc: 'NPC',
      spawner: '生成器',
      waypoint: '路点',
      region: '区域',
      eraser: '橡皮擦'
    };
    return names[tool] || tool;
  }

  function getBuildingColor(type) {
    const colors = {
      house: '#8b7355', shop: '#a08050', stash: '#607080',
      portal: '#406080', boss_arena: '#804040', wall: '#505050', decor: '#706050'
    };
    return colors[type] || '#888888';
  }

  function getBuildingWidth(size) {
    const sizes = { SMALL: 16, MEDIUM: 32, LARGE: 48, HUGE: 64 };
    return sizes[size] || 32;
  }

  function getBuildingHeight(size) {
    const sizes = { SMALL: 16, MEDIUM: 24, LARGE: 48, HUGE: 64 };
    return sizes[size] || 24;
  }

  // Current preset tracking
  let currentBuildingPreset = '民房';
  let currentNPCPreset = '武器商';

  function setBuildingPreset(name) { currentBuildingPreset = name; }
  function setNPCPreset(name) { currentNPCPreset = name; }

  return {
    // Mode/Tool
    setTool,
    setMode,
    getMode: () => mode,
    getTool: () => currentTool,
    togglePlaytest,

    // Data
    getBuildings: () => buildings,
    getNPCs: () => npcs,
    getSpawners: () => spawners,
    getWaypoints: () => waypoints,
    getRegions: () => regions,

    // Camera
    getCamera: () => camera,
    setCamera: (c) => { camera = { ...camera, ...c }; },

    // Grid
    setGrid: (g) => { if (g.showGrid !== undefined) showGrid = g.showGrid; if (g.gridSize) gridSize = g.gridSize; if (g.snapToGrid !== undefined) snapToGrid = g.snapToGrid; },

    // Presets
    getPresets: () => presets,
    setBuildingPreset,
    setNPCPreset,

    // History
    undo,
    redo,
    canUndo: () => historyIndex > 0,
    canRedo: () => historyIndex < history.length - 1,

    // Serialization
    serialize,
    deserialize,
    exportToFile,
    importFromFile,

    // Input handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleWheel,

    // Render
    render,

    EDITOR_TOOLS,
    EDITOR_MODES
  };
}