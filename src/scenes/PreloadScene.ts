import { Scene } from 'phaser'
import { WEAPON_TYPES, WEAPON_CONFIG } from '../config/GameConfig'

export class PreloadScene extends Scene {
  constructor() {
    super('Preload')
  }

  preload() {
    // 真实美术/音频资源尚未制作（占位贴图由 BootScene 程序生成），暂不加载外部文件以避免 404。
    // 资源就绪后放开以下加载即可：
    // this.load.setPath('assets')
    // this.load.audio('bgm_main', 'audio/bgm_main.ogg')
    // this.load.audio('bgm_battle', 'audio/bgm_battle.ogg')
    // this.load.audio('sfx_hit', 'audio/hit.ogg')
    // this.load.audio('sfx_swing', 'audio/swing.ogg')
    // this.load.audio('sfx_levelup', 'audio/levelup.ogg')
    // this.load.audio('sfx_pickup', 'audio/pickup.ogg')
    // this.load.audio('sfx_death', 'audio/death.ogg')
    // this.load.bitmapFont('pixel_font', 'fonts/pixel.png', 'fonts/pixel.xml')
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