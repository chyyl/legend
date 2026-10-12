import { Scene } from 'phaser'
import { REGIONS, WEAPON_TYPES, WEAPON_CONFIG, EQUIPMENT_SLOTS, BONDS } from '../config/GameConfig'

export class PreloadScene extends Scene {
  constructor() {
    super('Preload')
  }

  preload() {
    this.load.setPath('assets')
    
    // Audio
    this.load.audio('bgm_main', 'audio/bgm_main.ogg')
    this.load.audio('bgm_battle', 'audio/bgm_battle.ogg')
    this.load.audio('sfx_hit', 'audio/hit.ogg')
    this.load.audio('sfx_swing', 'audio/swing.ogg')
    this.load.audio('sfx_levelup', 'audio/levelup.ogg')
    this.load.audio('sfx_pickup', 'audio/pickup.ogg')
    this.load.audio('sfx_death', 'audio/death.ogg')
    
    // Font
    this.load.bitmapFont('pixel_font', 'fonts/pixel.png', 'fonts/pixel.xml')
    
    this.load.on('complete', () => {
      this.scene.start('MainMenu')
    })
  }

  create() {
    this.createAnimations()
    this.scene.start('MainMenu')
  }

  private createAnimations() {
    // Player animations
    this.anims.create({
      key: 'player_idle',
      frames: [{ key: 'player_idle' }],
      frameRate: 1,
      repeat: -1
    })
    
    this.anims.create({
      key: 'player_run',
      frames: [{ key: 'player_run' }],
      frameRate: 8,
      repeat: -1
    })
    
    this.anims.create({
      key: 'player_attack',
      frames: [{ key: 'player_attack' }],
      frameRate: 12,
      repeat: 0
    })
    
    // Enemy animations
    this.anims.create({
      key: 'enemy_idle',
      frames: [{ key: 'enemy_normal' }],
      frameRate: 1,
      repeat: -1
    })
    
    this.anims.create({
      key: 'enemy_run',
      frames: [{ key: 'enemy_normal' }],
      frameRate: 6,
      repeat: -1
    })
    
    // Weapon animations
    for (const weaponType of WEAPON_TYPES) {
      const config = WEAPON_CONFIG[weaponType]
      this.anims.create({
        key: `${weaponType}_attack`,
        frames: [{ key: weaponType }],
        frameRate: 10,
        repeat: 0
      })
    }
  }
}