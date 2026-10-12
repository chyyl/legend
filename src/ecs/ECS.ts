export type ComponentType = 
  | 'position' | 'velocity' | 'sprite' | 'animation' | 'health' | 'stats' 
  | 'input' | 'ai' | 'weapon' | 'equipment' | 'inventory' | 'level' | 'bonds'
  | 'projectile' | 'pickup' | 'npc' | 'teleport' | 'enemy' | 'player'

export interface Component {
  type: ComponentType
}

export interface PositionComponent extends Component {
  type: 'position'
  x: number
  y: number
}

export interface VelocityComponent extends Component {
  type: 'velocity'
  vx: number
  vy: number
  maxSpeed: number
  acceleration: number
  drag: number
}

export interface SpriteComponent extends Component {
  type: 'sprite'
  texture: string
  frame: number
  width: number
  height: number
  offsetX: number
  offsetY: number
  tint: number
  alpha: number
  flipX: boolean
  flipY: boolean
  depth: number
}

export interface AnimationComponent extends Component {
  type: 'animation'
  currentAnim: string
  animations: Map<string, AnimationData>
  frame: number
  timer: number
  playing: boolean
  loop: boolean
}

export interface AnimationData {
  frames: number[]
  frameRate: number
  loop: boolean
}

export interface HealthComponent extends Component {
  type: 'health'
  hp: number
  maxHp: number
  regen: number
  invulnerable: boolean
  invulnTimer: number
  lastDamageSource: string | null
}

export interface StatsComponent extends Component {
  type: 'stats'
  damage: number
  attackSpeed: number
  attackRange: number
  moveSpeed: number
  critChance: number
  critMultiplier: number
  dodgeChance: number
  defense: number
  lifesteal: number
  expMultiplier: number
  goldMultiplier: number
}

export interface InputComponent extends Component {
  type: 'input'
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  attack: boolean
  interact: boolean
  dodge: boolean
  menu: boolean
  aimX: number
  aimY: number
}

export interface AIComponent extends Component {
  type: 'ai'
  state: 'idle' | 'chase' | 'attack' | 'flee' | 'patrol'
  target: string | null
  aggroRange: number
  attackRange: number
  patrolPoints: {x: number, y: number}[]
  patrolIndex: number
  decisionTimer: number
  lastAttackTime: number
}

export interface WeaponComponent extends Component {
  type: 'weapon'
  weaponType: string
  quality: string
  level: number
  baseDamage: number
  attackSpeed: number
  range: number
  bonds: string[]
  lastAttackTime: number
  comboCount: number
}

export interface EquipmentComponent extends Component {
  type: 'equipment'
  slots: Record<string, ItemData | null>
  setBonuses: string[]
}

export interface InventoryComponent extends Component {
  type: 'inventory'
  items: ItemData[]
  maxSlots: number
  gold: number
}

export interface LevelComponent extends Component {
  type: 'level'
  level: number
  exp: number
  expToNext: number
  attributePoints: number
  attributes: Record<string, number>
}

export interface BondsComponent extends Component {
  type: 'bonds'
  active: Map<string, BondData>
}

export interface BondData {
  id: string
  level: number
  source: 'weapon' | 'equipment' | 'consumable'
}

export interface ProjectileComponent extends Component {
  type: 'projectile'
  owner: string
  damage: number
  speed: number
  range: number
  traveled: number
  pierce: number
  hitEntities: Set<string>
  onHit: 'damage' | 'explode' | 'pierce' | 'lifesteal'
}

export interface PickupComponent extends Component {
  type: 'pickup'
  item: ItemData
  lifetime: number
  maxLifetime: number
  bobTimer: number
  magnetRange: number
}

export interface NPCComponent extends Component {
  type: 'npc'
  npcId: string
  dialogId: string
  questIds: string[]
  shopId: string | null
  interactRange: number
}

export interface TeleportComponent extends Component {
  type: 'teleport'
  regionId: string
  targetX: number
  targetY: number
  cost: number
  unlocked: boolean
}

export interface EnemyComponent extends Component {
  type: 'enemy'
  enemyType: 'normal' | 'elite' | 'boss'
  level: number
  biome: string
  drops: DropTableEntry[]
  xpReward: number
  goldReward: number
}

export interface DropTableEntry {
  itemId: string
  chance: number
  minCount: number
  maxCount: number
  qualityChances?: Record<string, number>
}

export interface PlayerComponent extends Component {
  type: 'player'
  isLocal: boolean
  sessionId: string
  name: string
  skin: string
}

export interface ItemData {
  id: string
  type: 'weapon' | 'equipment' | 'consumable' | 'material'
  name: string
  quality: string
  level: number
  stats: Record<string, number>
  bonds: string[]
  icon: string
  stackable: boolean
  count: number
  equipmentSlot?: string
}

export interface ComponentMap {
  position: PositionComponent
  velocity: VelocityComponent
  sprite: SpriteComponent
  animation: AnimationComponent
  health: HealthComponent
  stats: StatsComponent
  input: InputComponent
  ai: AIComponent
  weapon: WeaponComponent
  equipment: EquipmentComponent
  inventory: InventoryComponent
  level: LevelComponent
  bonds: BondsComponent
  projectile: ProjectileComponent
  pickup: PickupComponent
  npc: NPCComponent
  teleport: TeleportComponent
  enemy: EnemyComponent
  player: PlayerComponent
}

export class Entity {
  id: string
  components: Map<ComponentType, Component> = new Map()
  active: boolean = true
  tags: Set<string> = new Set()

  constructor(id: string = crypto.randomUUID()) {
    this.id = id
  }

  add<T extends Component>(component: T): T {
    this.components.set(component.type, component)
    return component
  }

  get<K extends ComponentType>(type: K): ComponentMap[K] | null {
    return this.components.get(type) as ComponentMap[K] | null
  }

  has(type: ComponentType): boolean {
    return this.components.has(type)
  }

  remove(type: ComponentType): boolean {
    return this.components.delete(type)
  }

  destroy() {
    this.active = false
    this.components.clear()
  }
}

export class World {
  entities: Map<string, Entity> = new Map()
  systems: System[] = []
  queryCache: Map<string, Entity[]> = new Map()
  toAdd: Entity[] = []
  toRemove: string[] = []

  createEntity(id?: string): Entity {
    const entity = new Entity(id)
    this.toAdd.push(entity)
    return entity
  }

  removeEntity(id: string) {
    this.toRemove.push(id)
  }

  addSystem(system: System) {
    system.world = this
    system.init?.()
    this.systems.push(system)
  }

  update(delta: number) {
    for (const entity of this.toAdd) {
      this.entities.set(entity.id, entity)
    }
    this.toAdd.length = 0

    for (const id of this.toRemove) {
      const entity = this.entities.get(id)
      if (entity) entity.destroy()
      this.entities.delete(id)
    }
    this.toRemove.length = 0

    for (const system of this.systems) {
      system.update(delta)
    }
  }

  query(...types: ComponentType[]): Entity[] {
    const key = types.sort().join(',')
    if (this.queryCache.has(key)) {
      return this.queryCache.get(key)!
    }
    const result: Entity[] = []
    for (const entity of this.entities.values()) {
      if (entity.active && types.every(t => entity.has(t))) {
        result.push(entity)
      }
    }
    this.queryCache.set(key, result)
    return result
  }

  invalidateQueries() {
    this.queryCache.clear()
  }
}

export abstract class System {
  world!: World
  abstract update(delta: number): void
  init?(): void
}