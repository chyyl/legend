export const GAME_VERSION = '0.1.0'

export const MAP_WIDTH = 2000
export const MAP_HEIGHT = 2000
export const CHUNK_SIZE = 256
export const TILE_SIZE = 16

export const REGIONS = [
  { id: 'camp', name: '营地', x: 1400, y: 1400, width: 300, height: 300, biome: 'plains', level: 1, unlocked: true },
  { id: 'great_wall', name: '边境长城', x: 1300, y: 1100, width: 400, height: 300, biome: 'mountains', level: 2 },
  { id: 'bay_town', name: '海湾小镇', x: 1500, y: 1000, width: 300, height: 300, biome: 'coastal', level: 3 },
  { id: 'binxiang_farm', name: '彬祥农业园', x: 1500, y: 700, width: 300, height: 300, biome: 'farmland', level: 4 },
  { id: 'dark_maze', name: '黑暗迷宫', x: 1300, y: 500, width: 400, height: 300, biome: 'dark_forest', level: 5 },
  { id: 'nw_factory', name: '西北兵工厂', x: 600, y: 500, width: 300, height: 300, biome: 'industrial', level: 6 },
  { id: 'cliff_mountain', name: '绝壁雪山', x: 500, y: 800, width: 300, height: 400, biome: 'snow', level: 7 },
  { id: 'cross_sea_bridge', name: '跨海大桥', x: 400, y: 1000, width: 200, height: 500, biome: 'ocean', level: 8 },
  { id: 'skull_island', name: '骷髅岛', x: 1000, y: 1000, width: 300, height: 300, biome: 'volcanic', level: 9 },
  { id: 'dark_castle', name: '黑暗城堡', x: 700, y: 1300, width: 300, height: 300, biome: 'dark_castle', level: 10 },
  { id: 'final_battle', name: '终末之战', x: 1000, y: 1600, width: 400, height: 300, biome: 'final', level: 11 }
] as const

export type RegionId = typeof REGIONS[number]['id']

export const WEAPON_TYPES = [
  'iron_blade', 'knight_sword', 'scythe', 'bow', 'crossbow', 'staff', 'shield'
] as const

export type WeaponType = typeof WEAPON_TYPES[number]

export const WEAPON_CONFIG: Record<WeaponType, WeaponData> = {
  iron_blade: { name: '铁刃', type: 'melee', range: 32, attackSpeed: 1.2, damage: 10, projectile: false, animation: 'slash' },
  knight_sword: { name: '骑士剑', type: 'melee', range: 40, attackSpeed: 1.0, damage: 14, projectile: false, animation: 'thrust' },
  scythe: { name: '镰刀', type: 'melee', range: 48, attackSpeed: 0.8, damage: 18, projectile: false, animation: 'sweep', aoe: true },
  bow: { name: '弓', type: 'ranged', range: 200, attackSpeed: 0.9, damage: 12, projectile: true, animation: 'shoot', chargeTime: 300 },
  crossbow: { name: '弩', type: 'ranged', range: 180, attackSpeed: 0.6, damage: 22, projectile: true, animation: 'shoot', pierce: true },
  staff: { name: '法杖', type: 'magic', range: 160, attackSpeed: 0.7, damage: 16, projectile: true, animation: 'cast', aoe: true, element: 'arcane' },
  shield: { name: '盾', type: 'defense', range: 32, attackSpeed: 0.5, damage: 6, projectile: false, animation: 'bash', blockChance: 0.3, blockReduction: 0.6 }
}

export interface WeaponData {
  name: string
  type: 'melee' | 'ranged' | 'magic' | 'defense'
  range: number
  attackSpeed: number
  damage: number
  projectile: boolean
  animation: string
  chargeTime?: number
  pierce?: boolean
  aoe?: boolean
  element?: string
  blockChance?: number
  blockReduction?: number
}

export const EQUIPMENT_SLOTS = ['helmet', 'armor', 'leggings', 'boots'] as const
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number]

export const WEAPON_QUALITY = [
  { id: 'N', name: '普通', color: 0xffffff, damageMul: 1.0, bondRange: [0, 0], chance: 0.80 },
  { id: 'R', name: '稀有', color: 0x00ff00, damageMul: 1.3, bondRange: [1, 2], chance: 0.15, attackSpeedMul: [1.0, 1.0], rangeMul: [1.0, 1.0] },
  { id: 'SR', name: '史诗', color: 0x0099ff, damageMul: 1.5, bondRange: [2, 3], chance: 0.035, attackSpeedMul: [1.1, 1.3], rangeMul: [1.2, 1.2] },
  { id: 'SSR', name: '传说', color: 0xff9900, damageMul: 1.65, bondRange: [2, 4], chance: 0.015, attackSpeedMul: [1.2, 1.5], rangeMul: [1.2, 1.35] }
] as const

export const EQUIPMENT_QUALITY = [
  { id: 'D', name: 'D', color: 0x888888, defenseMul: [1.0, 1.0], speedMul: [1.0, 1.0], damageMul: [1.0, 1.0], dodgeMul: [1.0, 1.0], bondRange: [0, 0], chance: 0.50 },
  { id: 'C', name: 'C', color: 0xffffff, defenseMul: [1.1, 1.2], speedMul: [1.0, 1.0], damageMul: [1.0, 1.0], dodgeMul: [1.0, 1.0], bondRange: [0, 0], chance: 0.25 },
  { id: 'B', name: 'B', color: 0x00ff00, defenseMul: [1.2, 1.3], speedMul: [1.1, 1.2], damageMul: [1.0, 1.0], dodgeMul: [1.0, 1.0], bondRange: [1, 1], chance: 0.15 },
  { id: 'A', name: 'A', color: 0x0099ff, defenseMul: [1.2, 1.35], speedMul: [1.1, 1.25], damageMul: [1.1, 1.25], dodgeMul: [1.0, 1.0], bondRange: [1, 2], chance: 0.06 },
  { id: 'S', name: 'S', color: 0xff9900, defenseMul: [1.3, 1.4], speedMul: [1.1, 1.3], damageMul: [1.2, 1.3], dodgeMul: [1.2, 1.3], bondRange: [2, 3], chance: 0.03 },
  { id: 'SS', name: 'SS', color: 0xff00ff, defenseMul: [1.35, 1.5], speedMul: [1.1, 1.4], damageMul: [1.3, 1.55], dodgeMul: [1.25, 1.4], bondRange: [2, 4], chance: 0.01 }
] as const

export const BONDS = [
  { id: 'sharp', name: '锋利', desc: '伤害+30%', type: 'damage', value: 0.30 },
  { id: 'cleave', name: '横扫之刃', desc: '攻击范围+40%', type: 'range', value: 0.40 },
  { id: 'exp_boost', name: '经验获取', desc: '经验获取+50%', type: 'exp', value: 0.50 },
  { id: 'strength', name: '力量', desc: '伤害+15%，攻速+15%', type: 'damage_speed', value: 0.15 },
  { id: 'triple_crit', name: '三倍暴击', desc: '三倍暴击概率+8%', type: 'crit', value: 0.08 },
  { id: 'protection', name: '保护', desc: '防御力+30%', type: 'defense', value: 0.30 },
  { id: 'lifesteal', name: '吸血', desc: '攻击吸收5%血量', type: 'lifesteal', value: 0.05 },
  { id: 'undying', name: '不死金牌', desc: '必亡伤害触发无敌5秒，CD60秒', type: 'undying', value: 5 }
] as const

export type BondId = typeof BONDS[number]['id']

export const ENEMY_TYPES = ['normal', 'elite', 'boss'] as const
export type EnemyType = typeof ENEMY_TYPES[number]

export const ENEMY_CONFIG: Record<EnemyType, EnemyData> = {
  normal: { hpMul: 1.0, dmgMul: 1.0, expMul: 0.3, goldMul: 0.3, bondChance: 0.01 },
  elite: { hpMul: [2.5, 4.0], dmgMul: [1.1, 1.3], expMul: 2.0, goldMul: 2.0, bondChance: 0.05 },
  boss: { hpMul: [5.0, 10.0], dmgMul: [1.15, 1.4], expMul: 4.0, goldMul: 4.0, bondChance: 0.15 }
}

export interface EnemyData {
  hpMul: number | [number, number]
  dmgMul: number | [number, number]
  expMul: number
  goldMul: number
  bondChance: number
}

export const DIFFICULTY = {
  min: 0,
  max: 2,
  default: 0.9
}

export const PLAYER_MAX_LEVEL = 10
export const BASE_EXP_PER_LEVEL = 100
export const EXP_CURVE = 1.5

export const ATTRIBUTES = ['strength', 'agility', 'intelligence', 'vitality'] as const
export type Attribute = typeof ATTRIBUTES[number]

export const ATTRIBUTE_EFFECTS: Record<Attribute, string[]> = {
  strength: ['物理伤害', '近战攻速'],
  agility: ['移动速度', '攻击速度', '暴击率', '闪避'],
  intelligence: ['法术伤害', '法力上限', '法力回复'],
  vitality: ['最大生命', '生命回复', '防御力']
}

export const Z_LAYERS = {
  background: 0,
  ground: 10,
  water: 20,
  entity: 50,
  projectile: 60,
  effect: 70,
  ui: 1000,
  ui_overlay: 2000
}

export const INPUT_KEYS = {
  moveUp: ['W', 'ARROWUP'],
  moveDown: ['S', 'ARROWDOWN'],
  moveLeft: ['A', 'ARROWLEFT'],
  moveRight: ['D', 'ARROWRIGHT'],
  attack: ['SPACE', 'SHIFT'],
  interact: ['E', 'ENTER'],
  dodge: ['SHIFT', 'CTRL'],
  menu: ['ESC', 'TAB'],
  inventory: ['I'],
  map: ['M'],
  skill1: ['1'],
  skill2: ['2'],
  skill3: ['3'],
  skill4: ['4']
} as const