/**
 * NPC System — Functional Interactables Only (Shop/Stash/Portal)
 * No dialogue, no personality, pure UI interaction points
 */

export const NPC_TYPES = {
  SHOP: 'shop',
  STASH: 'stash',
  PORTAL: 'portal',
  HEALER: 'healer',
  SMITH: 'smith',
  QUEST_GIVER: 'quest_giver'
};

export const SHOP_CATEGORIES = {
  WEAPONS: 'weapons',
  ARMOR: 'armor',
  CONSUMABLES: 'consumables',
  MATERIALS: 'materials'
};

export function createNPCSystem(opts = {}) {
  const { rng, lootSystem, liberationSystem } = opts;

  const npcs = new Map(); // zoneId -> NPC[]
  const shopInventories = new Map(); // npcId -> item[]

  function initializeZoneNPCs(zoneId) {
    const zone = liberationSystem?.getZone?.(zoneId);
    if (!zone) return [];

    const zoneNPCs = [];

    // Every zone gets a portal back to town
    zoneNPCs.push(createPortalNPC(zoneId, zone.x, zone.y - zone.radius * 0.8));

    // Town gets all services
    if (zone.type === 'town') {
      zoneNPCs.push(createShopNPC('shop_weapons', zoneId, zone.x - 60, zone.y, SHOP_CATEGORIES.WEAPONS));
      zoneNPCs.push(createShopNPC('shop_armor', zoneId, zone.x + 60, zone.y, SHOP_CATEGORIES.ARMOR));
      zoneNPCs.push(createShopNPC('shop_consumables', zoneId, zone.x, zone.y + 60, SHOP_CATEGORIES.CONSUMABLES));
      zoneNPCs.push(createStashNPC('stash_main', zoneId, zone.x, zone.y - 40));
      zoneNPCs.push(createSmithNPC('smith_main', zoneId, zone.x - 40, zone.y + 40));
      zoneNPCs.push(createHealerNPC('healer_main', zoneId, zone.x + 40, zone.y + 40));
    }

    // Liberated zones get basic services
    if (liberationSystem?.getZoneState?.(zoneId) === 2) { // LIBERATED
      zoneNPCs.push(createStashNPC(`stash_${zoneId}`, zoneId, zone.x, zone.y - 30));
      if (rng?.next() < 0.5) {
        zoneNPCs.push(createShopNPC(`shop_${zoneId}`, zoneId, zone.x + 40, zone.y + 30, SHOP_CATEGORIES.CONSUMABLES));
      }
    }

    // Boss zones get quest giver after liberation
    if (zone.boss && liberationSystem?.getZoneState?.(zoneId) === 2) {
      zoneNPCs.push(createQuestGiverNPC(`quest_${zoneId}`, zoneId, zone.x, zone.y));
    }

    npcs.set(zoneId, zoneNPCs);
    return zoneNPCs;
  }

  function createShopNPC(id, zoneId, x, y, category) {
    return {
      id,
      type: NPC_TYPES.SHOP,
      zoneId,
      x, y,
      w: 24, h: 32,
      category,
      name: getShopName(category),
      interact: (player) => openShop(id, player),
      interactSound: 'shop',
      refreshTimer: 0,
      stock: generateShopStock(category, 1)
    };
  }

  function createStashNPC(id, zoneId, x, y) {
    return {
      id,
      type: NPC_TYPES.STASH,
      zoneId,
      x, y,
      w: 20, h: 20,
      name: '储物箱',
      interact: (player) => openStash(id, player),
      interactSound: 'stash',
      shared: true // all stashes share same storage
    };
  }

  function createPortalNPC(id, zoneId, x, y) {
    return {
      id,
      type: NPC_TYPES.PORTAL,
      zoneId,
      x, y,
      w: 32, h: 32,
      name: '传送门',
      destination: 'town', // always returns to town
      interact: (player) => usePortal(id, player),
      interactSound: 'portal',
      cooldown: 0
    };
  }

  function createHealerNPC(id, zoneId, x, y) {
    return {
      id,
      type: NPC_TYPES.HEALER,
      zoneId,
      x, y,
      w: 24, h: 32,
      name: '治疗师',
      interact: (player) => useHealer(id, player),
      interactSound: 'heal',
      healCost: 50,
      healPercent: 1.0
    };
  }

  function createSmithNPC(id, zoneId, x, y) {
    return {
      id,
      type: NPC_TYPES.SMITH,
      zoneId,
      x, y,
      w: 24, h: 32,
      name: '铁匠',
      interact: (player) => openSmith(id, player),
      interactSound: 'smith',
      enhanceCost: (level) => lootSystem?.getSmithCost?.(level) || 0
    };
  }

  function createQuestGiverNPC(id, zoneId, x, y) {
    return {
      id,
      type: NPC_TYPES.QUEST_GIVER,
      zoneId,
      x, y,
      w: 24, h: 32,
      name: '向导',
      interact: (player) => showQuestInfo(id, player),
      interactSound: 'interact',
      quests: []
    };
  }

  function getShopName(category) {
    const names = {
      [SHOP_CATEGORIES.WEAPONS]: '武器商人',
      [SHOP_CATEGORIES.ARMOR]: '防具商人',
      [SHOP_CATEGORIES.CONSUMABLES]: '杂货商人',
      [SHOP_CATEGORIES.MATERIALS]: '材料商人'
    };
    return names[category] || '商人';
  }

  function generateShopStock(category, zoneLevel) {
    const stock = [];
    const itemCount = 6 + Math.floor(zoneLevel / 2);

    for (let i = 0; i < itemCount; i++) {
      let slot;
      switch (category) {
        case SHOP_CATEGORIES.WEAPONS: slot = 'weapon'; break;
        case SHOP_CATEGORIES.ARMOR:
          slot = ['helmet', 'chest', 'gloves', 'boots'][Math.floor(rng?.next() * 4 || Math.random() * 4)];
          break;
        case SHOP_CATEGORIES.CONSUMABLES:
          // Consumables handled separately
          continue;
        default: slot = 'weapon';
      }
      if (lootSystem) {
        stock.push(lootSystem.generateItem(slot, zoneLevel, null, false));
      }
    }
    return stock;
  }

  function refreshShopStock(npcId) {
    const npc = findNPC(npcId);
    if (npc && npc.type === NPC_TYPES.SHOP) {
      const zone = liberationSystem?.getZone?.(npc.zoneId);
      const level = zone?.chapter || 1;
      npc.stock = generateShopStock(npc.category, level);
      npc.refreshTimer = Date.now() + 3600000; // 1 hour
    }
  }

  function findNPC(npcId) {
    for (const [zoneId, zoneNPCs] of npcs) {
      const found = zoneNPCs.find(n => n.id === npcId);
      if (found) return found;
    }
    return null;
  }

  function getNPCsInZone(zoneId) {
    return npcs.get(zoneId) || [];
  }

  function getAllNPCs() {
    const all = [];
    for (const zoneNPCs of npcs.values()) {
      all.push(...zoneNPCs);
    }
    return all;
  }

  function getNearestNPC(player, maxRange = 30) {
    let nearest = null;
    let nearestDist = maxRange;

    for (const npc of getAllNPCs()) {
      const dx = npc.x - player.x;
      const dy = npc.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = npc;
      }
    }

    return nearest;
  }

  // Interaction handlers (return action for UI to execute)
  function openShop(npcId, player) {
    const npc = findNPC(npcId);
    return { action: 'open_shop', npc, items: npc?.stock || [] };
  }

  function openStash(npcId, player) {
    return { action: 'open_stash', npcId };
  }

  function usePortal(npcId, player) {
    const npc = findNPC(npcId);
    if (npc && npc.cooldown <= Date.now()) {
      npc.cooldown = Date.now() + 3000; // 3s cooldown
      return { action: 'teleport', destination: npc.destination, zoneId: npc.zoneId };
    }
    return { action: 'portal_cooldown' };
  }

  function useHealer(npcId, player) {
    const npc = findNPC(npcId);
    if (player.gold >= npc.healCost) {
      player.gold -= npc.healCost;
      const healAmount = Math.floor(player.maxHealth * npc.healPercent);
      player.health = Math.min(player.maxHealth, player.health + healAmount);
      return { action: 'healed', amount: healAmount, cost: npc.healCost };
    }
    return { action: 'insufficient_gold', cost: npc.healCost };
  }

  function openSmith(npcId, player) {
    const npc = findNPC(npcId);
    return { action: 'open_smith', npc };
  }

  function showQuestInfo(npcId, player) {
    return { action: 'show_quests', npcId };
  }

  function update(dt) {
    // Refresh shop stock periodically
    for (const npc of getAllNPCs()) {
      if (npc.type === NPC_TYPES.SHOP && npc.refreshTimer > 0 && npc.refreshTimer <= Date.now()) {
        const zone = liberationSystem?.getZone?.(npc.zoneId);
        const level = zone?.chapter || 1;
        npc.stock = generateShopStock(npc.category, level);
        npc.refreshTimer = Date.now() + 3600000;
      }
    }
  }

  function buyItem(npcId, itemIndex, player) {
    const npc = findNPC(npcId);
    if (!npc || npc.type !== NPC_TYPES.SHOP) return { success: false };

    const item = npc.stock[itemIndex];
    if (!item) return { success: false };

    // Calculate price based on item value
    const price = calculateItemPrice(item);
    if (player.gold >= price) {
      player.gold -= price;
      npc.stock.splice(itemIndex, 1);
      return { success: true, item, price };
    }
    return { success: false, reason: 'insufficient_gold' };
  }

  function sellItem(item, player) {
    if (!item) return { success: false };
    const price = Math.floor(calculateItemPrice(item) * 0.25); // 25% sell value
    player.gold += price;
    return { success: true, price };
  }

  function calculateItemPrice(item) {
    if (!item) return 0;
    let price = 10; // base
    price += item.mainStat?.value * 5 || 0;
    for (const affix of item.affixes || []) {
      price += affix.value * 10;
    }
    price *= Math.pow(1.5, item.quality);
    price *= (1 + item.enhanced * 0.2);
    return Math.floor(price);
  }

  function serialize() {
    return {
      npcs: Object.fromEntries(
        Array.from(npcs.entries()).map(([k, v]) => [
          k,
          v.map(n => ({
            ...n,
            stock: n.stock?.map(i => i?.id) || []
          }))
        ])
      )
    };
  }

  function deserialize(data) {
    if (!data) return;
    npcs.clear();
    for (const [k, v] of Object.entries(data.npcs || {})) {
      npcs.set(Number(k), v);
    }
  }

  return {
    initializeZoneNPCs,
    getNPCsInZone,
    getAllNPCs,
    getNearestNPC,
    findNPC,
    refreshShopStock,
    buyItem,
    sellItem,
    calculateItemPrice,
    update,
    serialize,
    deserialize,
    NPC_TYPES,
    SHOP_CATEGORIES
  };
}