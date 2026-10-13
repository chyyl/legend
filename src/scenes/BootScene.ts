import { Scene } from 'phaser'

export class BootScene extends Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    // 占位资源由 generatePlaceholderAssets() 程序生成，不加载外部文件以避免 404
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e')

    // 先生成占位贴图，再使用（logo 等）
    this.generatePlaceholderAssets()

    const logo = this.add.image(this.scale.width / 2, this.scale.height / 2 - 50, 'logo')
    logo.setScale(0.5)
    
    const barBg = this.add.graphics()
    barBg.fillStyle(0x000000, 0.5)
    barBg.fillRoundedRect(this.scale.width / 2 - 150, this.scale.height / 2 + 50, 300, 20, 10)
    
    const bar = this.add.graphics()
    bar.fillStyle(0xff9900, 1)
    bar.fillRoundedRect(this.scale.width / 2 - 148, this.scale.height / 2 + 52, 0, 16, 8)

    this.scene.start('Preload')
  }

  private generatePlaceholderAssets() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false } as any)
    
    // Loading background
    graphics.fillStyle(0x1a1a2e)
    graphics.fillRect(0, 0, 800, 600)
    graphics.generateTexture('loading_bg', 800, 600)
    graphics.clear()
    
    // Loading bar
    graphics.fillStyle(0x333355)
    graphics.fillRoundedRect(0, 0, 300, 20, 10)
    graphics.generateTexture('loading_bar', 300, 20)
    graphics.clear()
    
    // Logo
    graphics.fillStyle(0xff9900)
    graphics.fillRect(0, 0, 200, 100)
    graphics.fillStyle(0xffffff)
    graphics.generateTexture('logo', 200, 100)
    graphics.clear()
    
    // Player sprites (stick figure)
    this.generateStickFigure('player_idle', 0x00ffff)
    this.generateStickFigure('player_run', 0x00ffff, true)
    this.generateStickFigure('player_attack', 0x00ffff, false, true)
    
    // Weapon sprites
    this.generateWeapon('iron_blade', 0x888888)
    this.generateWeapon('knight_sword', 0xaaaaaa)
    this.generateWeapon('scythe', 0x666666)
    this.generateWeapon('bow', 0x8b4513)
    this.generateWeapon('crossbow', 0x654321)
    this.generateWeapon('staff', 0x9933ff)
    this.generateWeapon('shield', 0x4444ff)
    
    // Enemy sprites
    this.generateStickFigure('enemy_normal', 0xff4444)
    this.generateStickFigure('enemy_elite', 0xff8800, false, false, 1.2)
    this.generateStickFigure('enemy_boss', 0xff00ff, false, false, 1.5)
    
    // Tiles
    this.generateTiles()
    
    // UI elements
    this.generateUI()
    
    // Particles
    this.generateParticles()
  }

  private generateStickFigure(key: string, color: number, running = false, attacking = false, scale = 1) {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false } as any)
    const size = 32 * scale
    const center = size / 2
    
    graphics.lineStyle(3 * scale, color, 1)
    
    // Head
    graphics.strokeCircle(center, center - size * 0.3, size * 0.12)
    
    // Body
    graphics.lineBetween(center, center - size * 0.18, center, center + size * 0.15)
    
    // Arms
    if (attacking) {
      graphics.lineBetween(center, center - size * 0.1, center + size * 0.25, center - size * 0.05)
      graphics.lineBetween(center, center - size * 0.1, center - size * 0.15, center + size * 0.05)
    } else if (running) {
      graphics.lineBetween(center, center - size * 0.1, center + size * 0.2, center + size * 0.1)
      graphics.lineBetween(center, center - size * 0.1, center - size * 0.2, center)
    } else {
      graphics.lineBetween(center, center - size * 0.1, center + size * 0.18, center + size * 0.05)
      graphics.lineBetween(center, center - size * 0.1, center - size * 0.18, center + size * 0.05)
    }
    
    // Legs
    if (running) {
      graphics.lineBetween(center, center + size * 0.15, center + size * 0.15, center + size * 0.35)
      graphics.lineBetween(center, center + size * 0.15, center - size * 0.1, center + size * 0.3)
    } else {
      graphics.lineBetween(center, center + size * 0.15, center + size * 0.1, center + size * 0.35)
      graphics.lineBetween(center, center + size * 0.15, center - size * 0.1, center + size * 0.35)
    }
    
    graphics.generateTexture(key, size, size)
    graphics.clear()
  }

  private generateWeapon(key: string, color: number) {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false } as any)
    const size = 48
    graphics.lineStyle(4, color, 1)
    graphics.fillStyle(color, 1)
    
    switch (key) {
      case 'iron_blade':
      case 'knight_sword':
        graphics.lineBetween(24, 4, 24, 40)
        graphics.fillTriangle(24, 4, 20, 12, 28, 12)
        break
      case 'scythe':
        graphics.lineBetween(12, 4, 12, 40)
        graphics.arc(12, 4, 16, Math.PI, 0, false)
        graphics.strokePath()
        break
      case 'bow':
        graphics.arc(24, 24, 20, -Math.PI * 0.3, Math.PI * 1.3, false)
        graphics.strokePath()
        graphics.lineBetween(24, 4, 24, 44)
        break
      case 'crossbow':
        graphics.lineBetween(4, 24, 44, 24)
        graphics.lineBetween(24, 4, 24, 44)
        break
      case 'staff':
        graphics.lineBetween(24, 4, 24, 44)
        graphics.fillCircle(24, 8, 6)
        break
      case 'shield':
        graphics.fillRoundedRect(8, 8, 32, 32, 8)
        graphics.lineStyle(2, 0xffffff, 1)
        graphics.strokeRoundedRect(8, 8, 32, 32, 8)
        break
    }
    
    graphics.generateTexture(key, size, size)
    graphics.clear()
  }

  private generateTiles() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false } as any)
    const tileSize = 16
    const colors: Record<string, number> = {
      grass: 0x2e8b2e, dirt: 0x8b6914, water: 0x1e90ff,
      mountain: 0x696969, sand: 0xf4e4bc, snow: 0xfffafa,
      stone: 0x808080, dark_grass: 0x1a4d1a, farmland: 0xdeb887,
      bridge: 0x8b7355, volcanic: 0x8b0000, castle_floor: 0x4a4a4a
    }
    
    for (const [name, color] of Object.entries(colors)) {
      graphics.fillStyle(color)
      graphics.fillRect(0, 0, tileSize, tileSize)
      graphics.fillStyle(this.adjustColor(color, -20))
      for (let i = 0; i < 4; i++) {
        graphics.fillRect(Math.random() * tileSize, Math.random() * tileSize, 2, 2)
      }
      graphics.generateTexture(`tile_${name}`, tileSize, tileSize)
      graphics.clear()
    }
  }

  private generateUI() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false } as any)
    
    // HP bar
    graphics.fillStyle(0x000000, 0.8)
    graphics.fillRoundedRect(0, 0, 200, 20, 10)
    graphics.generateTexture('hp_bar_bg', 200, 20)
    graphics.clear()
    
    graphics.fillStyle(0xff0000)
    graphics.fillRoundedRect(0, 0, 200, 20, 10)
    graphics.generateTexture('hp_bar_fill', 200, 20)
    graphics.clear()
    
    // XP bar
    graphics.fillStyle(0x000000, 0.8)
    graphics.fillRoundedRect(0, 0, 300, 10, 5)
    graphics.generateTexture('xp_bar_bg', 300, 10)
    graphics.clear()
    
    graphics.fillStyle(0x00ffff)
    graphics.fillRoundedRect(0, 0, 300, 10, 5)
    graphics.generateTexture('xp_bar_fill', 300, 10)
    graphics.clear()
    
    // Buttons
    graphics.fillStyle(0x333355)
    graphics.fillRoundedRect(0, 0, 120, 40, 8)
    graphics.lineStyle(2, 0xff9900)
    graphics.strokeRoundedRect(0, 0, 120, 40, 8)
    graphics.generateTexture('btn_normal', 120, 40)
    graphics.clear()
    
    graphics.fillStyle(0x444477)
    graphics.fillRoundedRect(0, 0, 120, 40, 8)
    graphics.lineStyle(2, 0xffcc00)
    graphics.strokeRoundedRect(0, 0, 120, 40, 8)
    graphics.generateTexture('btn_hover', 120, 40)
    graphics.clear()
    
    // Joystick base
    graphics.fillStyle(0x000000, 0.3)
    graphics.fillCircle(60, 60, 60)
    graphics.generateTexture('joystick_base', 120, 120)
    graphics.clear()
    
    graphics.fillStyle(0xffffff, 0.5)
    graphics.fillCircle(60, 60, 30)
    graphics.generateTexture('joystick_stick', 120, 120)
    graphics.clear()
    
    // Mini-map
    graphics.fillStyle(0x000000, 0.7)
    graphics.fillRoundedRect(0, 0, 200, 200, 10)
    graphics.generateTexture('minimap_bg', 200, 200)
    graphics.clear()
  }

  private generateParticles() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false } as any)
    
    // Damage number particles
    for (let i = 0; i < 10; i++) {
      graphics.fillStyle(0xff9900)
      graphics.fillRect(0, 0, 4, 4)
      graphics.generateTexture(`particle_dmg_${i}`, 4, 4)
      graphics.clear()
    }
    
    // Hit effect
    graphics.lineStyle(2, 0xffffff)
    graphics.strokeCircle(8, 8, 6)
    graphics.generateTexture('hit_effect', 16, 16)
    graphics.clear()
    
    // Level up effect
    graphics.fillStyle(0xffff00)
    for (let i = 0; i < 5; i++) {
      graphics.fillTriangle(8, 2, 14, 14, 2, 14)
    }
    graphics.generateTexture('levelup_effect', 16, 16)
    graphics.clear()
  }

  private adjustColor(color: number, amount: number): number {
    const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + amount))
    const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + amount))
    const b = Math.max(0, Math.min(255, (color & 0xff) + amount))
    return (r << 16) | (g << 8) | b
  }
}