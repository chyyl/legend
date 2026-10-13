import { Scene, GameObjects, Cameras } from 'phaser'
import { World, Entity } from '../ecs/ECS'
import { MapGenerator, ChunkData } from '../systems/MapGenerator'
import { CombatSystem } from '../systems/CombatSystem'
import { AISystem, MovementSystem, InputSystem } from '../systems/AISystem'
import { saveManager } from '../systems/SaveManager'
import { networkManager } from '../network/NetworkManager'
import {
  REGIONS, MAP_WIDTH, MAP_HEIGHT, CHUNK_SIZE, TILE_SIZE, Z_LAYERS,
  ENEMY_CONFIG, EnemyType
} from '../config/GameConfig'

export class GameScene extends Scene {
  private world!: World
  private mapGenerator!: MapGenerator
  private combatSystem!: CombatSystem
  private aiSystem!: AISystem
  private movementSystem!: MovementSystem
  private inputSystem!: InputSystem

  private playerEntity!: Entity
  private camera!: Cameras.Scene2D.Camera
  private uiCamera!: Cameras.Scene2D.Camera

  // 视口瓦片渲染：单个 Graphics，仅相机跨过瓦片边界时重绘
  private worldGraphics!: GameObjects.Graphics
  private lastViewTX = -9999
  private lastViewTY = -9999

  // 实体渲染层
  private entitySprites: Map<string, GameObjects.Sprite> = new Map()
  private barsGraphics!: GameObjects.Graphics

  // 伤害数字（键为 damageNumbers 条目对象本身）
  private dmgTexts: Map<object, GameObjects.Text> = new Map()

  // HUD
  private hpFill!: GameObjects.Image
  private xpFill!: GameObjects.Image
  private hpText!: GameObjects.Text
  private lvText!: GameObjects.Text
  private goldText!: GameObjects.Text

  // 小地图
  private minimap!: GameObjects.Graphics

  // 实体生成追踪
  private staticSpawned: Set<string> = new Set()
  private activeSpawners: Map<string, string> = new Map()
  private spawnerCooldowns: Map<string, number> = new Map()

  // 已发现区块（存档迷雾）
  private loadedChunks: Set<string> = new Set()

  private lastTime = 0
  private lastSaveTime = 0
  private paused = false
  private deathHandled = false
  private cullTimer = 0

  constructor() {
    super('Game')
  }

  create() {
    // 场景重启时清掉上一局的残留引用（对象已随场景销毁）
    this.entitySprites.clear()
    this.dmgTexts.clear()
    this.staticSpawned.clear()
    this.activeSpawners.clear()
    this.spawnerCooldowns.clear()
    this.loadedChunks.clear()
    this.lastViewTX = -9999
    this.lastViewTY = -9999

    this.initializeWorld()
    this.createPlayer()
    this.createCamera()
    this.createMinimap()
    this.createHUD()
    this.setupInput()
    this.setupNetwork()
    this.loadSaveData()

    // scrollFactor=0 的 UI 对象只交给 uiCamera 渲染
    this.children.each(child => {
      if ((child as any).scrollFactorX === 0) this.camera.ignore(child)
    })

    this.events.on('resume', () => { this.paused = false })
    this.events.on('pause', () => { this.paused = true })
    this.events.once('shutdown', () => {
      if (this.playerEntity && this.playerEntity.active) this.saveGame()
    })
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

    this.worldGraphics = this.add.graphics()
    this.worldGraphics.setDepth(Z_LAYERS.ground)
    this.barsGraphics = this.add.graphics()
    this.barsGraphics.setDepth(Z_LAYERS.effect)
  }

  private generateSeed(): string {
    return Math.random().toString(36).substring(2, 10)
  }

  private createPlayer() {
    const save = saveManager.getSave()
    const camp = REGIONS[0]
    // 世界坐标为像素；营地中心 = (region 原点 + 半宽) * TILE_SIZE
    let startX = (camp.x + camp.width / 2) * TILE_SIZE
    let startY = (camp.y + camp.height / 2) * TILE_SIZE
    if (save?.player) {
      startX = save.player.x
      startY = save.player.y
    }

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
    // 旧档存的是格子坐标（x/y 都 < MAP_WIDTH），迁移为像素坐标
    if (pos.x < MAP_WIDTH && pos.y < MAP_HEIGHT) {
      pos.x *= TILE_SIZE
      pos.y *= TILE_SIZE
    }

    const health = this.playerEntity.get('health')!
    health.hp = playerData.hp
    health.maxHp = playerData.maxHp

    const level = this.playerEntity.get('level')!
    level.level = playerData.level
    level.exp = playerData.exp
    level.attributePoints = playerData.attributes ? (Object.values(playerData.attributes) as number[]).reduce((a, b) => a + b, 0) - 20 : 0
    level.attributes = playerData.attributes || level.attributes

    const inventory = this.playerEntity.get('inventory')!
    inventory.gold = playerData.gold
    inventory.items = playerData.inventory || []
  }

  private createCamera() {
    this.camera = this.cameras.main
    this.camera.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
    this.camera.setZoom(this.scale.width < 768 ? 1.5 : 2)

    // UI 相机：zoom=1。主相机 zoom > 1 时，scrollFactor=0 的对象会绕相机原点缩放甩出屏幕，
    // 因此 HUD/小地图/触屏按钮全部由独立 UI 相机渲染。
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height)
    this.uiCamera.setZoom(1)
    this.uiCamera.ignore([this.worldGraphics, this.barsGraphics])
  }

  private createMinimap() {
    this.minimap = this.add.graphics()
    this.minimap.setScrollFactor(0)
    this.minimap.setDepth(Z_LAYERS.ui)
  }

  private createHUD() {
    const x = 14
    const y = 14
    const ui = Z_LAYERS.ui

    this.add.image(x, y, 'hp_bar_bg').setOrigin(0, 0).setScrollFactor(0).setDepth(ui + 2)
    this.hpFill = this.add.image(x, y, 'hp_bar_fill').setOrigin(0, 0).setScrollFactor(0).setDepth(ui + 3)
    this.hpText = this.add.text(x + 100, y + 10, '100 / 100', {
      fontFamily: 'Arial', fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setScrollFactor(0).setDepth(ui + 4)

    this.add.image(x, y + 26, 'xp_bar_bg').setOrigin(0, 0).setScrollFactor(0).setDepth(ui + 2)
    this.xpFill = this.add.image(x, y + 26, 'xp_bar_fill').setOrigin(0, 0).setScrollFactor(0).setDepth(ui + 3)

    this.lvText = this.add.text(x, y + 42, 'Lv.1', {
      fontFamily: 'Arial', fontSize: '14px', color: '#ffcc00', stroke: '#000000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(ui + 4)

    this.goldText = this.add.text(x + 76, y + 42, '金币 0', {
      fontFamily: 'Arial', fontSize: '14px', color: '#ffe066', stroke: '#000000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(ui + 4)
  }

  private setupInput() {
    this.input.keyboard?.on('keydown-M', () => this.toggleMap())
    this.input.keyboard?.on('keydown-I', () => this.toggleInventory())
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())

    this.setupTouchUI()
  }

  private setupTouchUI() {
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    if (!coarse) return

    const mkButton = (label: string, bx: number, by: number, cb: () => void) => {
      const rect = this.add.rectangle(bx, by, 76, 40, 0x333355, 0.85)
      rect.setOrigin(0.5)
      rect.setStrokeStyle(2, 0xff9900)
      rect.setScrollFactor(0)
      rect.setDepth(Z_LAYERS.ui + 2)
      rect.setInteractive()
      rect.on('pointerdown', cb)
      this.add.text(bx, by, label, {
        fontFamily: 'Arial', fontSize: '16px', color: '#ffcc00'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(Z_LAYERS.ui + 3)
    }

    mkButton('背包', 54, 110, () => this.toggleInventory())
    mkButton('地图', 140, 110, () => this.toggleMap())
    mkButton('暂停', 226, 110, () => this.togglePause())

    // 右下角攻击按钮
    const ax = this.scale.width - 64
    const ay = this.scale.height - 76
    const circle = this.add.circle(ax, ay, 42, 0xff9900, 0.35)
    circle.setStrokeStyle(2, 0xff9900)
    circle.setScrollFactor(0)
    circle.setDepth(Z_LAYERS.ui + 2)
    circle.setInteractive()
    circle.on('pointerdown', () => this.inputSystem.setTouchAttack(true))
    this.add.text(ax, ay, '攻击', {
      fontFamily: 'Arial', fontSize: '18px', color: '#ffcc00'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(Z_LAYERS.ui + 3)

    this.input.on('pointerup', () => this.inputSystem.setTouchAttack(false))
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
        this.loadedChunks.add(chunkKey)
      }
    }
  }

  update(time: number, delta: number) {
    if (this.paused) return

    this.world.update(delta)
    this.updateCamera()
    this.updateViewport()
    this.syncEntitySprites()
    this.updateEntityBars()
    this.updateDamageTexts()
    this.updateHUD()
    this.updateMinimap()

    this.cullTimer -= delta
    if (this.cullTimer <= 0) {
      this.cullTimer = 2000
      this.cullDistantEnemies()
    }

    this.checkPlayerDeath()
    this.autoSave(time)

    this.lastTime = time
  }

  private updateViewport() {
    const cam = this.camera
    // 与 Camera.preRender 的 worldView 公式一致：
    // 可视区 = [scroll + origin - displaySize/2, ...]，其中 origin = width/2（zoom 无关）
    const dispW = cam.width / cam.zoom
    const dispH = cam.height / cam.zoom
    const view = {
      x: cam.scrollX + cam.width * 0.5 - dispW * 0.5,
      y: cam.scrollY + cam.height * 0.5 - dispH * 0.5,
      width: dispW,
      height: dispH
    }
    const tx0 = Math.max(0, Math.floor(view.x / TILE_SIZE))
    const ty0 = Math.max(0, Math.floor(view.y / TILE_SIZE))
    if (tx0 === this.lastViewTX && ty0 === this.lastViewTY) return
    this.lastViewTX = tx0
    this.lastViewTY = ty0
    this.renderViewport(view)
  }

  private renderViewport(view: { x: number; y: number; width: number; height: number }) {
    const tx0 = Math.max(0, Math.floor(view.x / TILE_SIZE))
    const ty0 = Math.max(0, Math.floor(view.y / TILE_SIZE))
    const tx1 = Math.min(MAP_WIDTH - 1, Math.ceil((view.x + view.width) / TILE_SIZE))
    const ty1 = Math.min(MAP_HEIGHT - 1, Math.ceil((view.y + view.height) / TILE_SIZE))

    const g = this.worldGraphics
    g.clear()
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tileType = this.mapGenerator.getTileAt(tx * TILE_SIZE, ty * TILE_SIZE)
        g.fillStyle(this.getTileColor(tileType), 1)
        g.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      }
    }

    // 装饰物 + 区块发现 + 实体生成
    const decoL = tx0 * TILE_SIZE - TILE_SIZE
    const decoT = ty0 * TILE_SIZE - TILE_SIZE
    const decoR = (tx1 + 1) * TILE_SIZE + TILE_SIZE
    const decoB = (ty1 + 1) * TILE_SIZE + TILE_SIZE

    const cx0 = Math.floor(tx0 / CHUNK_SIZE)
    const cy0 = Math.floor(ty0 / CHUNK_SIZE)
    const cx1 = Math.floor(tx1 / CHUNK_SIZE)
    const cy1 = Math.floor(ty1 / CHUNK_SIZE)

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunkKey = `${cx},${cy}`
        this.loadedChunks.add(chunkKey)
        const chunk = this.mapGenerator.getChunk(cx, cy)
        for (const deco of chunk.decorations) {
          if (deco.x >= decoL && deco.x <= decoR && deco.y >= decoT && deco.y <= decoB) {
            g.fillStyle(0x333333, 0.5)
            g.fillCircle(deco.x, deco.y, 4)
          }
        }
        this.spawnChunkEntities(chunkKey, chunk)
      }
    }
  }

  private spawnChunkEntities(chunkKey: string, chunk: ChunkData) {
    for (let i = 0; i < chunk.entities.length; i++) {
      const data = chunk.entities[i]
      const id = `${chunkKey}:${i}`

      if (data.type === 'enemy_spawner') {
        if (this.activeSpawners.has(id)) continue
        const cooldown = this.spawnerCooldowns.get(id)
        if (cooldown !== undefined && performance.now() < cooldown) continue
        if (this.world.query('enemy').length >= 40) continue
        const entity = this.spawnEnemy(data.x, data.y, data.properties)
        if (entity) this.activeSpawners.set(id, entity.id)
      } else if (data.type === 'npc') {
        if (this.staticSpawned.has(id)) continue
        this.spawnNPC(data.x, data.y, data.properties)
        this.staticSpawned.add(id)
      } else if (data.type === 'teleport') {
        if (this.staticSpawned.has(id)) continue
        this.spawnTeleport(data.x, data.y, data.properties)
        this.staticSpawned.add(id)
      }
    }
  }

  private spawnEnemy(x: number, y: number, props: any): Entity {
    const level: number = props?.level || 1
    const rawType: string = props?.enemyType || 'normal'
    const enemyType: EnemyType = rawType === 'elite' || rawType === 'boss' ? rawType : 'normal'
    const cfg = ENEMY_CONFIG[enemyType]
    const hpMul = Array.isArray(cfg.hpMul) ? (cfg.hpMul[0] + cfg.hpMul[1]) / 2 : cfg.hpMul

    const size = enemyType === 'boss' ? 48 : enemyType === 'elite' ? 38 : 32
    const hp = Math.round((40 + level * 20) * hpMul)

    const entity = this.world.createEntity()
    entity.add({ type: 'position', x, y })
    entity.add({ type: 'velocity', vx: 0, vy: 0, maxSpeed: enemyType === 'boss' ? 70 : 90, acceleration: 600, drag: 0.9 })
    entity.add({ type: 'sprite', texture: `enemy_${enemyType}`, frame: 0, width: size, height: size, offsetX: 0, offsetY: 0, tint: 0xffffff, alpha: 1, flipX: false, flipY: false, depth: Z_LAYERS.entity })
    entity.add({ type: 'health', hp, maxHp: hp, regen: 0, invulnerable: false, invulnTimer: 0, lastDamageSource: null })
    entity.add({ type: 'stats', damage: Math.round(4 + level * 1.5), attackSpeed: 0.8, attackRange: 32, moveSpeed: 90, critChance: 0.03, critMultiplier: 1.5, dodgeChance: 0.02, defense: 0, lifesteal: 0, expMultiplier: 1, goldMultiplier: 1 })
    entity.add({ type: 'ai', state: 'idle', target: null, aggroRange: 260, attackRange: 28, patrolPoints: [], patrolIndex: 0, decisionTimer: 0, lastAttackTime: 0 })
    entity.add({ type: 'enemy', enemyType, level, biome: props?.biome || 'plains', drops: [{ itemId: 'weapon', chance: 0.3, minCount: 1, maxCount: 1 }], xpReward: level * 10, goldReward: level * 10 })
    entity.tags.add('enemy')
    return entity
  }

  private spawnNPC(x: number, y: number, props: any) {
    const entity = this.world.createEntity()
    entity.add({ type: 'position', x, y })
    entity.add({ type: 'sprite', texture: 'player_idle', frame: 0, width: 32, height: 32, offsetX: 0, offsetY: 0, tint: 0xffee55, alpha: 1, flipX: false, flipY: false, depth: Z_LAYERS.entity })
    entity.add({ type: 'npc', npcId: props?.npcId || 'npc', dialogId: '', questIds: [], shopId: null, interactRange: 60 })
    entity.tags.add('npc')
  }

  private spawnTeleport(x: number, y: number, props: any) {
    const camp = REGIONS[0]
    const campX = (camp.x + camp.width / 2) * TILE_SIZE
    const campY = (camp.y + camp.height / 2) * TILE_SIZE

    const entity = this.world.createEntity()
    entity.add({ type: 'position', x, y })
    entity.add({ type: 'sprite', texture: 'levelup_effect', frame: 0, width: 48, height: 48, offsetX: 0, offsetY: 0, tint: 0x66e5ff, alpha: 0.9, flipX: false, flipY: false, depth: Z_LAYERS.entity })
    entity.add({ type: 'teleport', regionId: props?.regionId || '', targetX: campX, targetY: campY, cost: 10, unlocked: true })
    entity.tags.add('teleport')
  }

  private syncEntitySprites() {
    const seen = new Set<string>()

    for (const entity of this.world.entities.values()) {
      if (!entity.active) continue
      const spr = entity.get('sprite')
      const pos = entity.get('position')
      if (!spr || !pos) continue
      seen.add(entity.id)

      let img = this.entitySprites.get(entity.id)
      if (!img) {
        const texKey = this.textures.exists(spr.texture) ? spr.texture : 'player_idle'
        img = this.add.sprite(0, 0, texKey)
        img.setOrigin(0.5, 0.5)
        if (spr.width > 0 && img.width > 0) {
          img.setScale(spr.width / img.width)
        }
        this.uiCamera.ignore(img)
        this.entitySprites.set(entity.id, img)
      }

      img.setPosition(pos.x, pos.y)
      img.setFlipX(spr.flipX)
      img.setTint(spr.tint)
      img.setAlpha(spr.alpha)
      img.setDepth(spr.depth + pos.y * 0.0001)

      const health = entity.get('health')
      img.setVisible(!health || health.hp > 0)

      if (entity.has('player')) {
        const inp = entity.get('input')
        const vel = entity.get('velocity')
        let want = 'player_idle'
        if (inp && inp.attack) want = 'player_attack'
        else if (vel && (Math.abs(vel.vx) > 10 || Math.abs(vel.vy) > 10)) want = 'player_run'
        if (img.texture.key !== want && this.textures.exists(want)) img.setTexture(want)
      }
    }

    for (const [id, img] of this.entitySprites) {
      if (!seen.has(id)) {
        img.destroy()
        this.entitySprites.delete(id)
      }
    }
  }

  private updateEntityBars() {
    const g = this.barsGraphics
    g.clear()
    for (const entity of this.world.entities.values()) {
      if (!entity.active || !entity.has('enemy')) continue
      const hp = entity.get('health')
      const pos = entity.get('position')
      if (!hp || !pos || hp.hp >= hp.maxHp || hp.hp <= 0) continue
      const ratio = Math.max(0, hp.hp / hp.maxHp)
      const w = 26
      const bx = pos.x - w / 2
      const by = pos.y - 26
      g.fillStyle(0x000000, 0.7)
      g.fillRect(bx, by, w, 4)
      g.fillStyle(ratio > 0.3 ? 0xff4444 : 0xff0000, 1)
      g.fillRect(bx, by, w * ratio, 4)
    }
  }

  private updateDamageTexts() {
    const numbers = this.combatSystem.getDamageNumbers()
    const seen = new Set<object>()

    for (const dmg of numbers) {
      seen.add(dmg)
      let t = this.dmgTexts.get(dmg)
      if (!t) {
        t = this.add.text(dmg.x, dmg.y, dmg.text ?? String(dmg.value), {
          fontFamily: 'Arial',
          fontSize: dmg.crit ? '20px' : '14px',
          color: dmg.crit ? '#ffcc00' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 3
        })
        t.setOrigin(0.5)
        t.setDepth(Z_LAYERS.ui - 1)
        this.uiCamera.ignore(t)
        this.dmgTexts.set(dmg, t)
      }
      t.setPosition(dmg.x, dmg.y)
      t.setAlpha(Math.max(0, Math.min(1, dmg.time / 400)))
    }

    for (const [key, t] of this.dmgTexts) {
      if (!seen.has(key)) {
        t.destroy()
        this.dmgTexts.delete(key)
      }
    }
  }

  private updateHUD() {
    const health = this.playerEntity.get('health')!
    const level = this.playerEntity.get('level')!
    const inventory = this.playerEntity.get('inventory')!

    const hpRatio = health.maxHp > 0 ? Math.max(0, health.hp / health.maxHp) : 0
    this.hpFill.setScale(hpRatio, 1)
    const hpStr = `${Math.max(0, Math.ceil(health.hp))} / ${health.maxHp}`
    if (this.hpText.text !== hpStr) this.hpText.setText(hpStr)

    const xpRatio = level.expToNext > 0 ? Math.min(1, level.exp / level.expToNext) : 0
    this.xpFill.setScale(xpRatio, 1)

    const lvStr = level.attributePoints > 0 ? `Lv.${level.level} (+${level.attributePoints})` : `Lv.${level.level}`
    if (this.lvText.text !== lvStr) this.lvText.setText(lvStr)

    const goldStr = `金币 ${inventory.gold}`
    if (this.goldText.text !== goldStr) this.goldText.setText(goldStr)
  }

  private updateMinimap() {
    const size = 200
    const margin = 10
    const x0 = this.scale.width - size - margin
    const y0 = margin
    const scale = size / (MAP_WIDTH * TILE_SIZE)
    const pos = this.playerEntity.get('position')!

    const m = this.minimap
    m.clear()
    m.fillStyle(0x000000, 0.7)
    m.fillRoundedRect(x0, y0, size, size, 8)

    // 区域（region 定义为格子单位，需 * TILE_SIZE 转像素）
    for (const region of REGIONS) {
      const rx = x0 + region.x * TILE_SIZE * scale
      const ry = y0 + region.y * TILE_SIZE * scale
      const rw = Math.max(3, region.width * TILE_SIZE * scale)
      const rh = Math.max(3, region.height * TILE_SIZE * scale)
      const discovered = this.isRegionDiscovered(region.id)
      m.fillStyle(discovered ? 0x2e6b2e : 0x2a2a3a, discovered ? 0.9 : 0.7)
      m.fillRect(rx, ry, rw, rh)
    }

    m.lineStyle(1, 0xff9900, 0.7)
    m.strokeRoundedRect(x0, y0, size, size, 8)

    m.fillStyle(0x00ffff, 1)
    m.fillCircle(x0 + pos.x * scale, y0 + pos.y * scale, 3)
  }

  private isRegionDiscovered(regionId: string): boolean {
    const save = saveManager.getSave()
    return save?.player?.unlockedRegions?.includes(regionId) || regionId === 'camp'
  }

  private cullDistantEnemies() {
    const now = performance.now()

    // 敌人死亡（实体已被移除）→ 释放 spawner 并设置重生冷却
    for (const [spawnerId, entityId] of this.activeSpawners) {
      if (!this.world.entities.has(entityId)) {
        this.activeSpawners.delete(spawnerId)
        this.spawnerCooldowns.set(spawnerId, now + 15000)
      }
    }

    const playerPos = this.playerEntity.get('position')!
    const maxDistSq = 3000 * 3000
    const spawnerOfEntity = new Map<string, string>()
    for (const [spawnerId, entityId] of this.activeSpawners) {
      spawnerOfEntity.set(entityId, spawnerId)
    }

    const toCull: string[] = []
    for (const entity of this.world.entities.values()) {
      if (!entity.active || !entity.has('enemy')) continue
      const pos = entity.get('position')
      if (!pos) continue
      const dx = pos.x - playerPos.x
      const dy = pos.y - playerPos.y
      if (dx * dx + dy * dy > maxDistSq) toCull.push(entity.id)
    }

    for (const entityId of toCull) {
      this.world.removeEntity(entityId)
      const spawnerId = spawnerOfEntity.get(entityId)
      if (spawnerId) {
        this.activeSpawners.delete(spawnerId)
        this.spawnerCooldowns.set(spawnerId, now + 15000)
      }
    }
  }

  private checkPlayerDeath() {
    const health = this.playerEntity.get('health')!
    if (health.hp > 0) {
      this.deathHandled = false
      return
    }
    if (this.deathHandled) return
    this.deathHandled = true

    // 死亡：回到营地、回满血、损失 10% 金币
    const camp = REGIONS[0]
    const pos = this.playerEntity.get('position')!
    pos.x = (camp.x + camp.width / 2) * TILE_SIZE
    pos.y = (camp.y + camp.height / 2) * TILE_SIZE

    const vel = this.playerEntity.get('velocity')!
    vel.vx = 0
    vel.vy = 0

    health.hp = health.maxHp
    health.invulnerable = true
    health.invulnTimer = 2000

    const inventory = this.playerEntity.get('inventory')!
    inventory.gold = Math.floor(inventory.gold * 0.9)

    // 强制下帧重渲染视口
    this.lastViewTX = -9999
    this.lastViewTY = -9999
    this.saveGame()
  }

  private updateCamera() {
    const playerPos = this.playerEntity.get('position')!
    this.camera.centerOn(playerPos.x, playerPos.y)
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

  private autoSave(time: number) {
    if (time - this.lastSaveTime > 30000) {
      this.lastSaveTime = time
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
