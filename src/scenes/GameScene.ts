import { Scene, GameObjects, Cameras } from 'phaser'
import { World, Entity, createEntity } from '../ecs/ECS'
import { MapGenerator, ChunkData } from '../systems/MapGenerator'
import { CombatSystem } from '../systems/CombatSystem'
import { AISystem, MovementSystem, InputSystem } from '../systems/AISystem'
import { saveManager } from '../systems/SaveManager'
import { networkManager } from '../network/NetworkManager'
import { REGIONS, MAP_WIDTH, MAP_HEIGHT, CHUNK_SIZE, TILE_SIZE, Z_LAYERS, WEAPON_CONFIG, PLAYER_MAX_LEVEL } from '../config/GameConfig'

export class GameScene extends Scene {
  private world!: World
  private mapGenerator!: MapGenerator
  private combatSystem!: CombatSystem
  private aiSystem!: AISystem
  private movementSystem!: MovementSystem
  private inputSystem!: InputSystem
  
  private playerEntity!: Entity
  private camera!: Cameras.Scene2D.Camera
  private minimap!: GameObjects.RenderTexture
  private chunkGraphics: Map<string, GameObjects.Graphics> = new Map()
  private loadedChunks: Set<string> = new Set()
  private viewRadiusChunks = 4
  
  private lastTime = 0
  private paused = false

  constructor() {
    super('Game')
  }

  create() {
    this.initializeWorld()
    this.createPlayer()
    this.createCamera()
    this.createMinimap()
    this.setupInput()
    this.setupNetwork()
    this.loadSaveData()
    
    this.events.on('resume', () => { this.paused = false })
    this.events.on('pause', () => { this.paused = true })
  }

  private initializeWorld() {
    this.world = new World()
    const save = saveManager.getSave()
    const seed = save?.world?.seed || this.generateSeed()
    this.mapGenerator = new MapGenerator(seed)
    
    this.combatSystem = new CombatSystem(this.mapGenerator)
    this.aiSystem = new AISystem(this.mapGenerator)
    this.movementSystem = new MovementSystem(this.mapGenerator)
    this.inputSystem = new InputSystem()
    
    this.world.addSystem(this.inputSystem)
    this.world.addSystem(this.movementSystem)
    this.world.addSystem(this.aiSystem)
    this.world.addSystem(this.combatSystem)
    
    this.loadChunksAroundPlayer()
  }

  private generateSeed(): string {
    return Math.random().toString(36).substring(2, 10)
  }

  private createPlayer() {
    const save = saveManager.getSave()
    const startX = save?.player?.x || REGIONS[0].x + REGIONS[0].width / 2
    const startY = save?.player?.y || REGIONS[0].y + REGIONS[0].height / 2

    this.playerEntity = this.world.createEntity()
    this.playerEntity.add({ type: 'position', x: startX, y: startY })
    this.playerEntity.add({ type: 'velocity', vx: 0, vy: 0, maxSpeed: 200, acceleration: 800, drag: 0.95 })
    this.playerEntity.add({ type: 'sprite', texture: 'player_idle', frame: 0, width: 32, height: 32, offsetX: 0, offsetY: 0, tint: 0x00ffff, alpha: 1, flipX: false, flipY: false, depth: Z_LAYERS.entity })
    this.playerEntity.add({ type: 'animation', currentAnim: 'player_idle', animations: new Map(), frame: 0, timer: 0, playing: true, loop: true })
    this.playerEntity.add({ type: 'health', hp: 100, maxHp: 100, regen: 1, invulnerable: false, invulnTimer: 0, lastDamageSource: null })
    this.playerEntity.add({ type: 'stats', damage: 10, attackSpeed: 1.2, attackRange: 32, moveSpeed: 200, critChance: 0.05, critMultiplier: 2, dodgeChance: 0.05, defense: 0, lifesteal: 0, expMultiplier: 1, goldMultiplier: 1 })
    this.playerEntity.add({ type: 'input', up: false, down: false, left: false, right: false, attack: false, interact: false, dodge: false, menu: false, aimX: 0, aimY: 0 })
    this.playerEntity.add({ type: 'weapon', weaponType: 'iron_blade', quality: 'N', level: 1, baseDamage: 10, attackSpeed: 1.2, range: 32, bonds: [], lastAttackTime: 0, comboCount: 0 })
    this.playerEntity.add({ type: 'equipment', slots: { helmet: null, armor: null, leggings: null, boots: null }, setBonuses: [] })
    this.playerEntity.add({ type: 'inventory', items: [], maxSlots: 999, gold: 0 })
    this.playerEntity.add({ type: 'level', level: 1, exp: 0, expToNext: 100, attributePoints: 0, attributes: { strength: 5, agility: 5, intelligence: 5, vitality: 5 } })
    this.playerEntity.add({ type: 'bonds', active: new Map() })
    this.playerEntity.add({ type: 'player', isLocal: true, sessionId: 'local', name: 'Player', skin: 'default' })
    this.playerEntity.tags.add('player')

    if (save?.player) {
      this.applySaveToPlayer(save.player)
    }
  }

  private applySaveToPlayer(playerData: any) {
    const pos = this.playerEntity.get('position')!
    pos.x = playerData.x
    pos.y = playerData.y
    
    const health = this.playerEntity.get('health')!
    health.hp = playerData.hp
    health.maxHp = playerData.maxHp
    
    const level = this.playerEntity.get('level')!
    level.level = playerData.level
    level.exp = playerData.exp
    level.attributePoints = playerData.attributes ? Object.values(playerData.attributes).reduce((a: number, b: number) => a + b, 0) - 20 : 0
    level.attributes = playerData.attributes || level.attributes
    
    const inventory = this.playerEntity.get('inventory')!
    inventory.gold = playerData.gold
    inventory.items = playerData.inventory || []
  }

  private createCamera() {
    this.camera = this.cameras.main
    this.camera.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
    this.camera.startFollow(this.playerEntity.get('position') as any, true, 0.1, 0.1)
    this.camera.setZoom(this.scale.width < 768 ? 1.5 : 2)
  }

  private createMinimap() {
    const size = 200
    this.minimap = this.add.renderTexture(this.scale.width - size - 10, 10, size, size)
    this.minimap.setScrollFactor(0)
    this.minimap.setDepth(Z_LAYERS.ui)
    
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.7)
    bg.fillRoundedRect(this.scale.width - size - 10, 10, size, size, 10)
    bg.setScrollFactor(0)
    bg.setDepth(Z_LAYERS.ui - 1)
  }

  private setupInput() {
    this.input.keyboard?.on('keydown-M', () => this.toggleMap())
    this.input.keyboard?.on('keydown-I', () => this.toggleInventory())
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())
    
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.playerEntity.get('input')!.attack = true
      }
    })
  }

  private setupNetwork() {
    if (networkManager.isConnected()) {
      networkManager.on('stateChange', (state: any) => this.onNetworkStateChange(state))
      networkManager.on('playerJoined', (data: any) => this.onPlayerJoined(data))
      networkManager.on('playerLeft', (data: any) => this.onPlayerLeft(data))
    }
  }

  private loadSaveData() {
    const save = saveManager.getSave()
    if (save?.world?.discoveredChunks) {
      for (const chunkKey of save.world.discoveredChunks) {
        const [x, y] = chunkKey.split(',').map(Number)
        this.loadedChunks.add(chunkKey)
      }
    }
  }

  update(time: number, delta: number) {
    if (this.paused) return
    
    this.world.update(delta)
    this.updateChunks()
    this.updateCamera()
    this.updateMinimap()
    this.autoSave(time)
    
    this.lastTime = time
  }

  private updateChunks() {
    const playerPos = this.playerEntity.get('position')!
    const centerChunkX = Math.floor(playerPos.x / (CHUNK_SIZE * TILE_SIZE))
    const centerChunkY = Math.floor(playerPos.y / (CHUNK_SIZE * TILE_SIZE))

    const newLoadedChunks = new Set<string>()
    
    for (let y = -this.viewRadiusChunks; y <= this.viewRadiusChunks; y++) {
      for (let x = -this.viewRadiusChunks; x <= this.viewRadiusChunks; x++) {
        const chunkX = centerChunkX + x
        const chunkY = centerChunkY + y
        const key = `${chunkX},${chunkY}`
        newLoadedChunks.add(key)
        
        if (!this.loadedChunks.has(key)) {
          this.loadChunk(chunkX, chunkY)
        }
      }
    }
    
    for (const key of this.loadedChunks) {
      if (!newLoadedChunks.has(key)) {
        this.unloadChunk(key)
      }
    }
    
    this.loadedChunks = newLoadedChunks
  }

  private loadChunk(chunkX: number, chunkY: number) {
    const chunk = this.mapGenerator.getChunk(chunkX, chunkY)
    const graphics = this.add.graphics()
    graphics.setDepth(Z_LAYERS.ground)
    
    const tileSize = TILE_SIZE
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const tileIndex = chunk.tiles[y * CHUNK_SIZE + x]
        const tileType = this.indexToTileType(tileIndex)
        const worldX = (chunkX * CHUNK_SIZE + x) * tileSize
        const worldY = (chunkY * CHUNK_SIZE + y) * tileSize
        
        const textureKey = `tile_${tileType}`
        if (this.textures.exists(textureKey)) {
          graphics.drawTexture(textureKey, worldX, worldY, tileSize, tileSize)
        } else {
          graphics.fillStyle(this.getTileColor(tileType))
          graphics.fillRect(worldX, worldY, tileSize, tileSize)
        }
      }
    }
    
    for (const deco of chunk.decorations) {
      graphics.fillStyle(0x333333, 0.5)
      graphics.fillCircle(deco.x, deco.y, 4)
    }
    
    this.chunkGraphics.set(`${chunkX},${chunkY}`, graphics)
  }

  private unloadChunk(key: string) {
    const graphics = this.chunkGraphics.get(key)
    if (graphics) {
      graphics.destroy()
      this.chunkGraphics.delete(key)
    }
  }

  private indexToTileType(index: number): string {
    const map: Record<number, string> = {
      0: 'grass', 1: 'dirt', 2: 'water', 3: 'mountain',
      4: 'sand', 5: 'snow', 6: 'stone', 7: 'dark_grass',
      8: 'farmland', 9: 'bridge', 10: 'volcanic', 11: 'castle_floor'
    }
    return map[index] || 'grass'
  }

  private getTileColor(tileType: string): number {
    const colors: Record<string, number> = {
      grass: 0x2e8b2e, dirt: 0x8b6914, water: 0x1e90ff,
      mountain: 0x696969, sand: 0xf4e4bc, snow: 0xfffafa,
      stone: 0x808080, dark_grass: 0x1a4d1a, farmland: 0xdeb887,
      bridge: 0x8b7355, volcanic: 0x8b0000, castle_floor: 0x4a4a4a
    }
    return colors[tileType] || 0x2e8b2e
  }

  private updateCamera() {
    const playerPos = this.playerEntity.get('position')!
    this.camera.centerOn(playerPos.x, playerPos.y)
  }

  private updateMinimap() {
    const playerPos = this.playerEntity.get('position')!
    const size = 200
    const scale = size / (MAP_WIDTH * TILE_SIZE)
    
    this.minimap.clear()
    
    for (const [key, graphics] of this.chunkGraphics) {
      const [chunkX, chunkY] = key.split(',').map(Number)
      const x = (chunkX * CHUNK_SIZE * TILE_SIZE) * scale
      const y = (chunkY * CHUNK_SIZE * TILE_SIZE) * scale
      const w = CHUNK_SIZE * TILE_SIZE * scale
      const h = CHUNK_SIZE * TILE_SIZE * scale
      
      this.minimap.draw(graphics, x, y, w, h)
    }
    
    const px = playerPos.x * scale
    const py = playerPos.y * scale
    this.minimap.fillStyle(0x00ffff, 1)
    this.minimap.fillCircle(px, py, 3)
    
    for (const region of REGIONS) {
      if (this.isRegionDiscovered(region.id)) {
        const rx = region.x * scale
        const ry = region.y * scale
        const rw = region.width * scale
        const rh = region.height * scale
        this.minimap.lineStyle(1, 0xff9900, 0.5)
        this.minimap.strokeRect(rx, ry, rw, rh)
      }
    }
  }

  private isRegionDiscovered(regionId: string): boolean {
    const save = saveManager.getSave()
    return save?.player?.unlockedRegions?.includes(regionId) || regionId === 'camp'
  }

  private autoSave(time: number) {
    if (time - this.lastTime > 30000) {
      this.saveGame()
    }
  }

  private saveGame() {
    const playerPos = this.playerEntity.get('position')!
    const health = this.playerEntity.get('health')!
    const level = this.playerEntity.get('level')!
    const inventory = this.playerEntity.get('inventory')!
    const attributes = this.playerEntity.get('level')!.attributes
    
    saveManager.saveGame({
      player: {
        x: playerPos.x,
        y: playerPos.y,
        level: level.level,
        exp: level.exp,
        gold: inventory.gold,
        hp: health.hp,
        maxHp: health.maxHp,
        attributes,
        inventory: inventory.items
      },
      world: {
        discoveredChunks: Array.from(this.loadedChunks)
      }
    })
  }

  private toggleMap() {
    this.scene.launch('UI', { tab: 'map' })
  }

  private toggleInventory() {
    this.scene.launch('UI', { tab: 'inventory' })
  }

  private togglePause() {
    this.paused = !this.paused
    if (this.paused) {
      this.scene.launch('UI', { tab: 'pause' })
    }
  }

  private onNetworkStateChange(state: any) {
    // Handle network state updates
  }

  private onPlayerJoined(data: any) {
    // Create remote player entity
  }

  private onPlayerLeft(data: any) {
    // Remove remote player entity
  }
}