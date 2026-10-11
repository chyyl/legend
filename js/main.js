/**
 * Main Entry Point — Bootstrap, Game Loop, Systems Wiring
 * Initializes all subsystems and runs the game loop
 */

import { createRenderer } from './engine/renderer.js';
import { createAudioEngine } from './engine/audio.js';
import { createNetEngine } from './engine/net.js';
import { generateTerrain, getBiomeAt, getHeightAt, BIOMES } from './engine/terrain.js';
import { generateBuilding, generateBuildingCluster, BUILDING_TYPES } from './engine/building.js';
import { createLiberationSystem } from './gameplay/liberation.js';
import { createCombatSystem, createCombatEntity } from './gameplay/combat.js';
import { createLootSystem } from './gameplay/loot.js';
import { createNPCSystem } from './gameplay/npc.js';
import { createRadialMenu } from './ui/radial.js';
import { createHUD } from './ui/hud.js';
import { setGlobalSeed, globalPRNG } from './prng.js';

// Game state
let canvas = null;
let renderer = null;
let audio = null;
let net = null;
let terrain = null;
let buildings = [];
let entities = [];
let player = null;
let liberation = null;
let combat = null;
let loot = null;
let npcSystem = null;
let radialMenu = null;
let hud = null;

let lastTime = 0;
let running = false;
let paused = false;
let debugMode = false;

// Settings (persisted in localStorage)
const defaultSettings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  minimapZoom: 1,
  minimapSize: 180,
  minimapPosition: 'top-right',
  keyBindings: {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    attack: 'Mouse0',
    dash: 'ShiftLeft',
    interact: 'KeyE',
    map: 'KeyM',
    radial: 'Tab',
    inventory: 'KeyI',
    settings: 'KeyP'
  },
  graphicsQuality: 'auto', // 'low', 'medium', 'high', 'auto'
  showDamageNumbers: true,
  showHealthBars: true,
  cameraShake: true,
  language: 'zh'
};

let settings = { ...defaultSettings };

// Input state
const input = {
  move: { x: 0, y: 0 },
  attack: false,
  dash: false,
  interact: false,
  map: false,
  radial: false,
  mouse: { x: 0, y: 0, worldX: 0, worldY: 0 },
  keys: new Set()
};

// Performance monitoring
const perf = {
  frameTimes: [],
  avgFPS: 60,
  qualityLevel: 2, // 0=low, 1=medium, 2=high
  lastQualityCheck: 0
};

async function init() {
  // Load settings
  loadSettings();

  // Get canvas
  canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('Canvas not found');

  // Initialize renderer
  renderer = createRenderer(canvas, { dpr: Math.min(window.devicePixelRatio || 1, 2) });

  // Initialize audio
  audio = createAudioEngine({ masterVolume: settings.masterVolume });
  audio.setMasterVolume(settings.masterVolume);

  // Initialize net (optional, for multiplayer)
  // net = createNetEngine({ isHost: false });

  // Initialize world with seed
  const seed = getWorldSeed();
  setGlobalSeed(seed);

  // Generate terrain
  console.log('Generating terrain...');
  terrain = generateTerrain({ seed, width: 1000, height: 1000 });
  console.log(`Terrain: ${terrain.pointCount} vertices, ${terrain.triangleCount} triangles`);

  // Generate buildings
  console.log('Generating buildings...');
  buildings = generateBuildingsForWorld(terrain, seed);

  // Initialize gameplay systems
  liberation = createLiberationSystem({ seed });
  loot = createLootSystem({ rng: globalPRNG });

  // Create player entity
  player = createPlayer();

  // Initialize combat
  combat = createCombatSystem({ player, entities, audio, rng: globalPRNG });
  combat.on('hit', onEntityHit);
  combat.on('kill', onEntityKilled);

  // Initialize NPCs
  npcSystem = createNPCSystem({ rng: globalPRNG, lootSystem: loot, liberationSystem: liberation });
  for (const zone of liberation.getAllZones()) {
    const zoneNPCs = npcSystem.initializeZoneNPCs(zone.id);
    entities.push(...zoneNPCs);
  }

  // Initialize UI
  radialMenu = createRadialMenu({
    onAction: handleRadialAction
  });

  hud = createHUD({ renderer, player, liberationSystem: liberation, radialMenu, settings });

  // Setup input handlers
  setupInput();

  // Resize handler
  window.addEventListener('resize', onResize);
  onResize();

  // Start game loop
  running = true;
  requestAnimationFrame(gameLoop);

  // Resume audio on first interaction
  document.addEventListener('click', () => audio.resume(), { once: true });
  document.addEventListener('keydown', () => audio.resume(), { once: true });

  console.log('Game initialized successfully');
}

function getWorldSeed() {
  // Try to get seed from URL params or localStorage
  const params = new URLSearchParams(window.location.search);
  if (params.has('seed')) return parseInt(params.get('seed'), 10);

  const saved = localStorage.getItem('emancipate_seed');
  if (saved) return parseInt(saved, 10);

  // Generate new seed
  const seed = Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF);
  localStorage.setItem('emancipate_seed', seed.toString());
  return seed;
}

function generateBuildingsForWorld(terrain, seed) {
  const allBuildings = [];

  // Town center cluster
  const townBuildings = generateBuildingCluster({
    seed: seed ^ 0xABCDEF,
    centerX: 500, centerY: 500,
    radius: 120,
    buildingCount: 25,
    typeWeights: {
      [BUILDING_TYPES.HOUSE]: 0.5,
      [BUILDING_TYPES.SHOP]: 0.15,
      [BUILDING_TYPES.STASH]: 0.05,
      [BUILDING_TYPES.DECOR]: 0.3
    }
  });
  allBuildings.push(...townBuildings);

  // Zone-based buildings
  const zones = liberation.getAllZones();
  for (const zone of zones) {
    if (zone.type === 'town') continue; // Already done

    let count = 0, weights = {};
    switch (zone.type) {
      case 'grassland': count = 8; weights = { [BUILDING_TYPES.HOUSE]: 0.7, [BUILDING_TYPES.DECOR]: 0.3 }; break;
      case 'forest': count = 6; weights = { [BUILDING_TYPES.HOUSE]: 0.5, [BUILDING_TYPES.DECOR]: 0.5 }; break;
      case 'wasteland': count = 4; weights = { [BUILDING_TYPES.HOUSE]: 0.3, [BUILDING_TYPES.DECOR]: 0.3, [BUILDING_TYPES.WALL]: 0.4 }; break;
      case 'highland': count = 3; weights = { [BUILDING_TYPES.HOUSE]: 0.4, [BUILDING_TYPES.BOSS_ARENA]: 0.3, [BUILDING_TYPES.WALL]: 0.3 }; break;
      case 'boss': count = 1; weights = { [BUILDING_TYPES.BOSS_ARENA]: 1.0 }; break;
    }

    if (count > 0) {
      const cluster = generateBuildingCluster({
        seed: seed ^ zone.id,
        centerX: zone.x, centerY: zone.y,
        radius: zone.radius * 0.7,
        buildingCount: count,
        typeWeights: weights
      });
      allBuildings.push(...cluster);
    }
  }

  return allBuildings;
}

function createPlayer() {
  const p = createCombatEntity({
    x: 500, y: 500,
    maxHealth: 100,
    health: 100,
    radius: 12,
    speed: 120,
    stats: {
      attack: 10,
      defense: 5,
      critChance: 0.05,
      critDamage: 1.5,
      moveSpeed: 1.0,
      attackSpeed: 1.0
    },
    equipment: {},
    inventory: [],
    gold: 100,
    level: 1,
    xp: 0,
    xpToNext: 100,
    lastMoveX: 0,
    lastMoveY: -1
  });

  p.takeDamage = (amount, type, source) => {
    if (p.invulnerable) return 0;
    const actual = Math.min(p.health, amount);
    p.health -= actual;
    if (p.health <= 0) {
      p.health = 0;
      onPlayerDeath();
    }
    hud?.onDamageTaken?.();
    return actual;
  };

  p.applyKnockback = (dx, dy, force) => {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    p.knockback = { x: (dx / len) * force, y: (dy / len) * force, time: 200 };
  };

  p.updateKnockback = (dt) => {
    if (p.knockback.time > 0) {
      p.knockback.time -= dt;
      const factor = p.knockback.time / 200;
      p.x += p.knockback.x * factor * dt / 1000;
      p.y += p.knockback.y * factor * dt / 1000;
    }
  };

  return p;
}

function setupInput() {
  // Keyboard
  window.addEventListener('keydown', (e) => {
    input.keys.add(e.code);
    handleKeyDown(e);
  });

  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    handleKeyUp(e);
  });

  // Mouse
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - rect.left;
    input.mouse.y = e.clientY - rect.top;
    const world = renderer.screenToWorld(input.mouse.x, input.mouse.y);
    input.mouse.worldX = world.x;
    input.mouse.worldY = world.y;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.attack = true;
    if (e.button === 2) input.dash = true;
    e.preventDefault();
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.attack = false;
    if (e.button === 2) input.dash = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);

  // Gamepad polling
  setInterval(pollGamepad, 1000 / 60);
}

function handleKeyDown(e) {
  // Radial menu
  if (e.code === settings.keyBindings.radial) {
    e.preventDefault();
    radialMenu.handleKeyDown(e);
  }

  // Movement (WASD + Arrow keys)
  if (e.code === settings.keyBindings.moveUp || e.code === 'ArrowUp') input.move.y = -1;
  if (e.code === settings.keyBindings.moveDown || e.code === 'ArrowDown') input.move.y = 1;
  if (e.code === settings.keyBindings.moveLeft || e.code === 'ArrowLeft') input.move.x = -1;
  if (e.code === settings.keyBindings.moveRight || e.code === 'ArrowRight') input.move.x = 1;

  // Actions
  if (e.code === settings.keyBindings.interact) input.interact = true;
  if (e.code === settings.keyBindings.map) input.map = true;

  // Debug
  if (e.code === 'F1') debugMode = !debugMode;
  if (e.code === 'F2') togglePause();
  if (e.code === 'F3') toggleFullscreen();
}

function handleKeyUp(e) {
  radialMenu.handleKeyUp(e);

  if (e.code === settings.keyBindings.moveUp || e.code === 'ArrowUp') input.move.y = 0;
  if (e.code === settings.keyBindings.moveDown || e.code === 'ArrowDown') input.move.y = 0;
  if (e.code === settings.keyBindings.moveLeft || e.code === 'ArrowLeft') input.move.x = 0;
  if (e.code === settings.keyBindings.moveRight || e.code === 'ArrowRight') input.move.x = 0;

  if (e.code === settings.keyBindings.interact) input.interact = false;
  if (e.code === settings.keyBindings.map) input.map = false;
}

function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  input.mouse.x = touch.clientX - rect.left;
  input.mouse.y = touch.clientY - rect.top;
  const world = renderer.screenToWorld(input.mouse.x, input.mouse.y);
  input.mouse.worldX = world.x;
  input.mouse.worldY = world.y;

  radialMenu.handleTouchStart(input.mouse.x, input.mouse.y);
}

function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  input.mouse.x = touch.clientX - rect.left;
  input.mouse.y = touch.clientY - rect.top;
  const world = renderer.screenToWorld(input.mouse.x, input.mouse.y);
  input.mouse.worldX = world.x;
  input.mouse.worldY = world.y;

  radialMenu.handleTouchMove(input.mouse.x, input.mouse.y);
}

function handleTouchEnd(e) {
  radialMenu.handleTouchEnd();
}

function pollGamepad() {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[settings.gamepadIndex || 0];
  if (!gp) return;

  // Left stick for movement
  const deadzone = 0.15;
  const lx = gp.axes[0] || 0;
  const ly = gp.axes[1] || 0;
  if (Math.abs(lx) > deadzone || Math.abs(ly) > deadzone) {
    input.move.x = lx;
    input.move.y = ly;
  } else {
    input.move.x = input.move.y = 0;
  }

  // Buttons
  input.attack = gp.buttons[0]?.pressed || false; // A
  input.dash = gp.buttons[1]?.pressed || false; // B
  input.interact = gp.buttons[2]?.pressed || false; // X
  input.map = gp.buttons[3]?.pressed || false; // Y

  // Radial menu
  if (gp.buttons[9]?.pressed) { // Start
    radialMenu.handleGamepadButton(9, true);
  }

  // Right stick for radial
  radialMenu.handleGamepad(gp.axes);
}

function handleRadialAction(actionId, action) {
  switch (actionId) {
    case 'inventory': openInventory(); break;
    case 'map': openMap(); break;
    case 'quests': openQuests(); break;
    case 'settings': openSettings(); break;
    case 'social': openSocial(); break;
    case 'emotes': openEmotes(); break;
    case 'exit': returnToMenu(); break;
  }
}

function openInventory() { console.log('Open inventory'); }
function openMap() { console.log('Open map'); }
function openQuests() { console.log('Open quests'); }
function openSettings() { console.log('Open settings'); }
function openSocial() { console.log('Open social'); }
function openEmotes() { console.log('Open emotes'); }
function returnToMenu() { window.location.href = 'index.html'; }

function onEntityHit(data) {
  // Screen shake on hit
  if (settings.cameraShake && data.source === 'player') {
    renderer.shake(3, 100);
  }
}

function onEntityKilled(data) {
  if (data.target === player) return;

  // Grant XP
  const xpGain = data.target.xpValue || 10;
  player.xp += xpGain;
  checkLevelUp();

  // Loot drop
  if (data.target.lootTable) {
    const drops = loot.generateLootDrop(data.target.type, player.level, data.target.isBoss);
    for (const drop of drops) {
      if (drop.type === 'gold') {
        player.gold += drop.amount;
      } else {
        player.inventory.push(drop);
      }
    }
  }

  // Liberation progress
  if (data.target.zoneId !== undefined) {
    liberation.completeObjective(data.target.zoneId, 'clear_enemies');
  }
}

function onPlayerDeath() {
  // Handle death - mercy mode or penalty
  const mercyMode = localStorage.getItem('emancipate_mercy') === 'true';
  if (mercyMode) {
    // Revive at full health
    player.health = player.maxHealth;
    player.x = 500; player.y = 500; // Town
    audio.playSFX('heal');
  } else {
    // Gold penalty
    const loss = Math.floor(player.gold * 0.1);
    player.gold = Math.max(0, player.gold - loss);
    player.health = Math.max(1, Math.floor(player.maxHealth * 0.3));
    player.x = 500; player.y = 500;
    audio.playSFX('death');
  }
}

function checkLevelUp() {
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = Math.floor(player.xpToNext * 1.5);
    player.maxHealth += 10;
    player.health = player.maxHealth;
    player.stats.attack += 2;
    audio.playSFX('levelup');
    // Show level up notification
  }
}

function gameLoop(time) {
  if (!running) return;

  const dt = time - lastTime;
  lastTime = time;

  if (!paused) {
    update(dt / 1000);
    render();
  }

  // Performance monitoring
  perf.frameTimes.push(dt);
  if (perf.frameTimes.length > 60) perf.frameTimes.shift();
  perf.avgFPS = 1000 / (perf.frameTimes.reduce((a, b) => a + b, 0) / perf.frameTimes.length);

  // Auto quality adjustment
  if (settings.graphicsQuality === 'auto' && time - perf.lastQualityCheck > 5000) {
    adjustQuality();
    perf.lastQualityCheck = time;
  }

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  // Update player
  updatePlayer(dt);

  // Update combat
  combat.update(dt, performance.now());

  // Update entities
  for (const entity of entities) {
    if (entity.update) entity.update(dt);
    if (entity.updateKnockback) entity.updateKnockback(dt);
  }

  // Update camera
  renderer.setCamera(player.x, player.y);

  // Update liberation
  // liberation.update?.(dt);

  // Update NPCs
  npcSystem.update?.(dt);

  // Update HUD
  hud.update?.(dt);

  // Update audio
  audio.update?.(dt);

  // Update net
  // net.update?.(dt);
}

function updatePlayer(dt) {
  if (!player) return;

  // Movement
  const speed = player.speed * (player.stats.moveSpeed || 1);
  let moveX = input.move.x;
  let moveY = input.move.y;

  // Normalize diagonal
  const len = Math.sqrt(moveX * moveX + moveY * moveY);
  if (len > 0) {
    moveX /= len; moveY /= len;
    player.lastMoveX = moveX;
    player.lastMoveY = moveY;
  }

  // Apply knockback first
  player.updateKnockback(dt * 1000);

  // Move
  if (!combat.isDashingNow()) {
    player.x += moveX * speed * dt;
    player.y += moveY * speed * dt;
  }

  // World bounds
  const bounds = terrain.bounds;
  player.x = Math.max(bounds.minX + 20, Math.min(bounds.maxX - 20, player.x));
  player.y = Math.max(bounds.minY + 20, Math.min(bounds.maxY - 20, player.y));

  // Attack
  if (input.attack) {
    const dir = { x: input.mouse.worldX - player.x, y: input.mouse.worldY - player.y };
    combat.tryAttack(performance.now(), dir);
  }

  // Dash
  if (input.dash) {
    combat.tryDash(performance.now(), moveX || player.lastMoveX, moveY || player.lastMoveY);
  }

  // Interact
  if (input.interact) {
    combat.tryInteract();
    input.interact = false; // Consume
  }

  // Map
  if (input.map) {
    openMap();
    input.map = false;
  }
}

function render() {
  if (!renderer || !terrain) return;

  renderer.render(terrain, buildings, entities, 16); // dt in ms

  // Render HUD on top
  hud.render(renderer.ctx, canvas.width, canvas.height);

  // Debug overlay
  if (debugMode) renderDebug(renderer.ctx);
}

function renderDebug(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#00ff00';
  ctx.textAlign = 'left';
  ctx.fillText(`FPS: ${Math.round(perf.avgFPS)}`, 10, 20);
  ctx.fillText(`Player: ${Math.round(player.x)}, ${Math.round(player.y)}`, 10, 40);
  ctx.fillText(`Health: ${Math.round(player.health)}/${player.maxHealth}`, 10, 60);
  ctx.fillText(`Gold: ${player.gold}`, 10, 80);
  ctx.fillText(`Level: ${player.level}`, 10, 100);
  ctx.fillText(`Entities: ${entities.length}`, 10, 120);
  ctx.fillText(`Buildings: ${buildings.length}`, 10, 140);
  ctx.fillText(`Quality: ${perf.qualityLevel}`, 10, 160);
  ctx.fillText(`Zone: ${liberation.getCurrentChapter?.() || 1}`, 10, 180);
  ctx.fillText(`Progress: ${Math.round((liberation.getGlobalProgress?.() || 0) * 100)}%`, 10, 200);
  ctx.restore();
}

function adjustQuality() {
  const targetFPS = 55;
  if (perf.avgFPS < targetFPS - 5 && perf.qualityLevel > 0) {
    perf.qualityLevel--;
    applyQualitySettings();
  } else if (perf.avgFPS > targetFPS + 10 && perf.qualityLevel < 2) {
    perf.qualityLevel++;
    applyQualitySettings();
  }
}

function applyQualitySettings() {
  // Adjust render distance, particle count, etc.
  console.log(`Quality adjusted to level ${perf.qualityLevel}`);
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  renderer.resize(width, height);
}

function togglePause() {
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen().catch(console.error);
  } else {
    document.exitFullscreen();
  }
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('emancipate_settings');
    if (saved) settings = { ...defaultSettings, ...JSON.parse(saved) };
  } catch (e) { console.warn('Failed to load settings'); }
}

function saveSettings() {
  try {
    localStorage.setItem('emancipate_settings', JSON.stringify(settings));
  } catch (e) { console.warn('Failed to save settings'); }
}

// Export for global access (debugging)
window.game = {
  getPlayer: () => player,
  getTerrain: () => terrain,
  getBuildings: () => buildings,
  getEntities: () => entities,
  getLiberation: () => liberation,
  getSettings: () => settings,
  saveSettings,
  togglePause,
  debugMode: () => debugMode
};

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, player, terrain, buildings, entities, liberation, combat, loot, npcSystem, renderer, audio, settings };