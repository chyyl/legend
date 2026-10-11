/**
 * Liberation System — Region Unlock Progression & Chapter Gates
 * Chapter-gated: 3 zone gates at 33%/66%/100% story progress
 */

export const LIBERATION_STATES = {
  LOCKED: 0,      // Not accessible, fog of war
  CONTESTED: 1,   // Accessible, enemies present, liberation in progress
  LIBERATED: 2,   // Cleared, safe zone, NPCs active
  FORTIFIED: 3    // Player has built defenses, reduced enemy spawns
};

export const CHAPTERS = {
  1: { name: '觉醒', gateProgress: 0.33, zoneCount: 3, bossZone: 2 },
  2: { name: '反抗', gateProgress: 0.66, zoneCount: 3, bossZone: 5 },
  3: { name: '解放', gateProgress: 1.0, zoneCount: 3, bossZone: 8 }
};

export const ZONE_TYPES = {
  STARTER: 'starter',
  GRASSLAND: 'grassland',
  FOREST: 'forest',
  WASTELAND: 'wasteland',
  HIGHLAND: 'highland',
  BOSS: 'boss',
  TOWN: 'town'
};

const ZONE_DEFINITIONS = [
  // Chapter 1
  { id: 0, name: '起始营地', type: ZONE_TYPES.TOWN, chapter: 1, x: 500, y: 500, radius: 80, requiredProgress: 0 },
  { id: 1, name: '平原前哨', type: ZONE_TYPES.GRASSLAND, chapter: 1, x: 300, y: 400, radius: 120, requiredProgress: 0.05 },
  { id: 2, name: '林地哨站', type: ZONE_TYPES.FOREST, chapter: 1, x: 200, y: 600, radius: 100, requiredProgress: 0.15 },
  { id: 3, name: '荒原裂隙', type: ZONE_TYPES.WASTELAND, chapter: 1, x: 400, y: 700, radius: 140, requiredProgress: 0.25, isGate: true, boss: true },

  // Chapter 2
  { id: 4, name: '高地要塞', type: ZONE_TYPES.HIGHLAND, chapter: 2, x: 700, y: 300, radius: 150, requiredProgress: 0.35 },
  { id: 5, name: '深林废墟', type: ZONE_TYPES.FOREST, chapter: 2, x: 800, y: 600, radius: 130, requiredProgress: 0.45 },
  { id: 6, name: '灰烬荒原', type: ZONE_TYPES.WASTELAND, chapter: 2, x: 600, y: 800, radius: 160, requiredProgress: 0.55, isGate: true, boss: true },

  // Chapter 3
  { id: 7, name: '冰封峰巅', type: ZONE_TYPES.HIGHLAND, chapter: 3, x: 900, y: 200, radius: 180, requiredProgress: 0.7 },
  { id: 8, name: '腐化核心', type: ZONE_TYPES.BOSS, chapter: 3, x: 500, y: 500, radius: 200, requiredProgress: 0.85, isGate: true, boss: true, final: true },
  { id: 9, name: '自由之城', type: ZONE_TYPES.TOWN, chapter: 3, x: 500, y: 500, radius: 100, requiredProgress: 1.0 }
];

export function createLiberationSystem(opts = {}) {
  const { seed = 0 } = opts;

  // Liberation progress per zone (0-1)
  const zoneProgress = new Map();
  const zoneStates = new Map();
  let globalProgress = 0;
  let currentChapter = 1;
  let discoveredZones = new Set([0]); // Start with town discovered
  let completedObjectives = new Map(); // zoneId -> Set(objectiveIds)

  // Initialize zones
  for (const zone of ZONE_DEFINITIONS) {
    const isInitiallyLiberated = zone.requiredProgress === 0;
    zoneProgress.set(zone.id, isInitiallyLiberated ? 1 : 0);
    zoneStates.set(zone.id, isInitiallyLiberated ? LIBERATION_STATES.LIBERATED : LIBERATION_STATES.LOCKED);
  }

  function getZone(zoneId) {
    return ZONE_DEFINITIONS.find(z => z.id === zoneId);
  }

  function getZonesByChapter(chapter) {
    return ZONE_DEFINITIONS.filter(z => z.chapter === chapter);
  }

  function getAllZones() {
    return [...ZONE_DEFINITIONS];
  }

  function getZoneState(zoneId) {
    return zoneStates.get(zoneId) || LIBERATION_STATES.LOCKED;
  }

  function getZoneProgress(zoneId) {
    return zoneProgress.get(zoneId) || 0;
  }

  function getGlobalProgress() {
    return globalProgress;
  }

  function getCurrentChapter() {
    return currentChapter;
  }

  function isZoneDiscovered(zoneId) {
    return discoveredZones.has(zoneId);
  }

  function discoverZone(zoneId) {
    discoveredZones.add(zoneId);
    // Auto-discover adjacent zones
    const zone = getZone(zoneId);
    if (zone) {
      for (const other of ZONE_DEFINITIONS) {
        if (other.id === zoneId) continue;
        const dx = other.x - zone.x;
        const dy = other.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < (zone.radius + other.radius) * 1.5) {
          discoveredZones.add(other.id);
        }
      }
    }
  }

  function canAccessZone(zoneId) {
    const state = getZoneState(zoneId);
    return state !== LIBERATION_STATES.LOCKED;
  }

  function getAccessibleZones() {
    return ZONE_DEFINITIONS.filter(z => canAccessZone(z.id) && isZoneDiscovered(z.id));
  }

  function addZoneProgress(zoneId, amount) {
    const current = getZoneProgress(zoneId);
    const next = Math.min(1, current + amount);
    zoneProgress.set(zoneId, next);

    // Update zone state based on progress
    const zone = getZone(zoneId);
    if (zone) {
      let newState = zoneStates.get(zoneId);
      if (next >= 1) {
        newState = LIBERATION_STATES.LIBERATED;
        onZoneLiberated(zoneId);
      } else if (next > 0) {
        newState = LIBERATION_STATES.CONTESTED;
      }
      if (newState !== zoneStates.get(zoneId)) {
        zoneStates.set(zoneId, newState);
      }
    }

    recalcGlobalProgress();
    checkChapterProgression();
  }

  function onZoneLiberated(zoneId) {
    const zone = getZone(zoneId);
    if (!zone) return;

    // Discover connected zones
    discoverZone(zoneId);

    // Unlock next zone in sequence if this was a gate
    if (zone.isGate) {
      const nextZones = ZONE_DEFINITIONS.filter(z =>
        z.chapter === zone.chapter && z.requiredProgress > zone.requiredProgress
      ).sort((a, b) => a.requiredProgress - b.requiredProgress);

      if (nextZones.length > 0) {
        const next = nextZones[0];
        zoneStates.set(next.id, LIBERATION_STATES.CONTESTED);
        discoverZone(next.id);
      } else if (zone.chapter < 3) {
        // Unlock next chapter's first zone
        const nextChapterZones = getZonesByChapter(zone.chapter + 1)
          .sort((a, b) => a.requiredProgress - b.requiredProgress);
        if (nextChapterZones.length > 0) {
          zoneStates.set(nextChapterZones[0].id, LIBERATION_STATES.CONTESTED);
          discoverZone(nextChapterZones[0].id);
        }
      }
    }
  }

  function recalcGlobalProgress() {
    let totalWeight = 0;
    let completedWeight = 0;

    for (const zone of ZONE_DEFINITIONS) {
      const weight = zone.isGate ? 3 : (zone.boss ? 2 : 1);
      totalWeight += weight;
      completedWeight += getZoneProgress(zone.id) * weight;
    }

    globalProgress = totalWeight > 0 ? completedWeight / totalWeight : 0;
  }

  function checkChapterProgression() {
    for (let ch = 1; ch <= 3; ch++) {
      const chapter = CHAPTERS[ch];
      const chapterZones = getZonesByChapter(ch);
      const allLiberated = chapterZones.every(z => getZoneState(z.id) === LIBERATION_STATES.LIBERATED);

      if (allLiberated && currentChapter <= ch) {
        currentChapter = ch + 1;
        if (currentChapter > 3) currentChapter = 3;
        emit('chapter_complete', { chapter: ch });
      }
    }
  }

  function completeObjective(zoneId, objectiveId) {
    if (!completedObjectives.has(zoneId)) {
      completedObjectives.set(zoneId, new Set());
    }
    completedObjectives.get(zoneId).add(objectiveId);

    // Objectives give different progress amounts
    const progressValues = {
      'clear_enemies': 0.2,
      'destroy_spawner': 0.3,
      'rescue_npc': 0.15,
      'capture_point': 0.25,
      'defeat_boss': 1.0,
      'find_secret': 0.1
    };
    const progress = progressValues[objectiveId] || 0.1;
    addZoneProgress(zoneId, progress);
  }

  function getZoneObjectives(zoneId) {
    const zone = getZone(zoneId);
    if (!zone) return [];

    const objectives = ['clear_enemies'];
    if (zone.boss) objectives.push('defeat_boss');
    if (zone.type === ZONE_TYPES.WASTELAND || zone.type === ZONE_TYPES.HIGHLAND) {
      objectives.push('destroy_spawner');
    }
    if (zone.type === ZONE_TYPES.FOREST) {
      objectives.push('find_secret');
    }
    return objectives;
  }

  function getChapterProgress(chapter) {
    const zones = getZonesByChapter(chapter);
    if (zones.length === 0) return 0;
    let sum = 0;
    for (const z of zones) sum += getZoneProgress(z.id);
    return sum / zones.length;
  }

  function isGameComplete() {
    return globalProgress >= 1.0 && getZoneState(8) === LIBERATION_STATES.LIBERATED;
  }

  function getNextObjective() {
    // Find nearest incomplete zone with available objectives
    for (const zone of ZONE_DEFINITIONS) {
      if (isZoneDiscovered(zone.id) && canAccessZone(zone.id)) {
        const state = getZoneState(zone.id);
        if (state === LIBERATION_STATES.CONTESTED) {
          const completed = completedObjectives.get(zone.id) || new Set();
          const objectives = getZoneObjectives(zone.id);
          for (const obj of objectives) {
            if (!completed.has(obj)) {
              return { zoneId: zone.id, objectiveId: obj, zoneName: zone.name };
            }
          }
        }
      }
    }
    return null;
  }

  // Serialization
  function serialize() {
    return {
      zoneProgress: Object.fromEntries(zoneProgress),
      zoneStates: Object.fromEntries(zoneStates),
      globalProgress,
      currentChapter,
      discoveredZones: Array.from(discoveredZones),
      completedObjectives: Object.fromEntries(
        Array.from(completedObjectives.entries()).map(([k, v]) => [k, Array.from(v)])
      )
    };
  }

  function deserialize(data) {
    if (!data) return;
    zoneProgress.clear();
    for (const [k, v] of Object.entries(data.zoneProgress || {})) zoneProgress.set(Number(k), v);
    zoneStates.clear();
    for (const [k, v] of Object.entries(data.zoneStates || {})) zoneStates.set(Number(k), v);
    globalProgress = data.globalProgress || 0;
    currentChapter = data.currentChapter || 1;
    discoveredZones = new Set(data.discoveredZones || [0]);
    completedObjectives.clear();
    for (const [k, v] of Object.entries(data.completedObjectives || {})) {
      completedObjectives.set(Number(k), new Set(v));
    }
  }

  // Event system
  const listeners = new Map();
  function on(event, cb) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(cb); }
  function off(event, cb) { const arr = listeners.get(event); if (arr) arr.splice(arr.indexOf(cb), 1); }
  function emit(event, data) { const arr = listeners.get(event); if (arr) arr.forEach(cb => cb(data)); }

  return {
    getZone,
    getZonesByChapter,
    getAllZones,
    getZoneState,
    getZoneProgress,
    getGlobalProgress,
    getCurrentChapter,
    isZoneDiscovered,
    discoverZone,
    canAccessZone,
    getAccessibleZones,
    addZoneProgress,
    completeObjective,
    getZoneObjectives,
    getChapterProgress,
    isGameComplete,
    getNextObjective,
    serialize,
    deserialize,
    on,
    off,
    ZONE_TYPES,
    LIBERATION_STATES,
    CHAPTERS,
    ZONE_DEFINITIONS
  };
}