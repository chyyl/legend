import { Scene } from 'phaser'
import { networkManager } from '../network/NetworkManager'
import { saveManager } from '../systems/SaveManager'

export class MainMenuScene extends Scene {
  private menuContainer: Phaser.GameObjects.Container | null = null
  private selectedSave: number = 0
  private saves: any[] = []

  constructor() {
    super('MainMenu')
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e')
    this.createBackground()
    this.createMenu()
    this.setupInput()
  }

  private createBackground() {
    const graphics = this.add.graphics()
    graphics.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x2d1b4e, 0x2d1b4e, 1)
    graphics.fillRect(0, 0, this.scale.width, this.scale.height)
    
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * this.scale.width
      const y = Math.random() * this.scale.height
      const size = Math.random() * 3 + 1
      graphics.fillStyle(0xff9900, Math.random() * 0.5 + 0.1)
      graphics.fillCircle(x, y, size)
    }
    
    const title = this.add.text(this.scale.width / 2, 100, 'LEGEND', {
      fontFamily: 'Arial Black',
      fontSize: '64px',
      color: '#ff9900',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5)
    
    const subtitle = this.add.text(this.scale.width / 2, 170, '像素火柴人 ARPG', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff'
    }).setOrigin(0.5)
    
    this.tweens.add({
      targets: title,
      scale: { from: 1, to: 1.05 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })
  }

  private createMenu() {
    this.menuContainer = this.add.container(this.scale.width / 2, 250)
    
    const buttons = [
      { text: '开始游戏', callback: () => this.showSaveSelect() },
      { text: '多人游戏', callback: () => this.showMultiplayerMenu() },
      { text: '设置', callback: () => this.showSettings() },
      { text: '退出', callback: () => window.close() }
    ]
    
    buttons.forEach((btn, i) => {
      const container = this.add.container(0, i * 70)
      
      const bg = this.add.graphics()
      bg.fillStyle(0x333355, 1)
      bg.fillRoundedRect(-120, -25, 240, 50, 12)
      bg.lineStyle(2, 0xff9900, 1)
      bg.strokeRoundedRect(-120, -25, 240, 50, 12)
      
      const text = this.add.text(0, 0, btn.text, {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#ffffff'
      }).setOrigin(0.5)
      
      container.add([bg, text])
      container.setSize(240, 50)
      container.setInteractive(new Phaser.Geom.Rectangle(-120, -25, 240, 50), Phaser.Geom.Rectangle.Contains)
      
      container.on('pointerover', () => {
        bg.clear()
        bg.fillStyle(0x444477, 1)
        bg.fillRoundedRect(-120, -25, 240, 50, 12)
        bg.lineStyle(2, 0xffcc00, 1)
        bg.strokeRoundedRect(-120, -25, 240, 50, 12)
        text.setColor('#ffcc00')
      })
      
      container.on('pointerout', () => {
        bg.clear()
        bg.fillStyle(0x333355, 1)
        bg.fillRoundedRect(-120, -25, 240, 50, 12)
        bg.lineStyle(2, 0xff9900, 1)
        bg.strokeRoundedRect(-120, -25, 240, 50, 12)
        text.setColor('#ffffff')
      })
      
      container.on('pointerdown', btn.callback)
      
      this.menuContainer!.add(container)
    })
    
    const version = this.add.text(this.scale.width - 20, this.scale.height - 20, 'v0.1.0', {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: '#666666'
    }).setOrigin(1, 1)
  }

  private showSaveSelect() {
    if (this.menuContainer) this.menuContainer.destroy()
    
    this.saves = []
    for (let i = 0; i < 3; i++) {
      const save = localStorage.getItem(`legend_save_${i}`)
      this.saves.push(save ? JSON.parse(save) : null)
    }
    
    this.menuContainer = this.add.container(this.scale.width / 2, 150)
    
    const title = this.add.text(0, -100, '选择存档', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#ff9900'
    }).setOrigin(0.5)
    this.menuContainer.add(title)
    
    this.saves.forEach((save, i) => {
      const container = this.add.container(0, i * 90)
      
      const bg = this.add.graphics()
      bg.fillStyle(0x333355, 1)
      bg.fillRoundedRect(-180, -40, 360, 80, 12)
      bg.lineStyle(2, i === this.selectedSave ? 0xffcc00 : 0xff9900, 1)
      bg.strokeRoundedRect(-180, -40, 360, 80, 12)
      
      if (save) {
        const nameText = this.add.text(-160, -25, `存档 ${i + 1}`, {
          fontFamily: 'Arial', fontSize: '20px', color: '#ffffff'
        })
        const infoText = this.add.text(-160, 5, `等级 ${save.player?.level || 1} | 金币 ${save.player?.gold || 0} | 时长 ${Math.floor((save.player?.playTime || 0) / 60000)}分`, {
          fontFamily: 'Arial', fontSize: '14px', color: '#aaaaaa'
        })
        const regionText = this.add.text(-160, 25, `区域: ${save.player?.unlockedRegions?.length || 1}/13`, {
          fontFamily: 'Arial', fontSize: '14px', color: '#888888'
        })
        container.add([nameText, infoText, regionText])
      } else {
        const emptyText = this.add.text(0, 0, `空存档 ${i + 1}`, {
          fontFamily: 'Arial', fontSize: '20px', color: '#666666'
        }).setOrigin(0.5)
        container.add(emptyText)
      }
      
      container.setSize(360, 80)
      container.setInteractive(new Phaser.Geom.Rectangle(-180, -40, 360, 80), Phaser.Geom.Rectangle.Contains)
      container.on('pointerdown', () => this.startGame(i))
      container.on('pointerover', () => {
        this.selectedSave = i
        this.showSaveSelect()
      })
      
      this.menuContainer!.add(container)
    })
    
    const backBtn = this.createButton(0, 300, '返回', () => this.createMenu())
    this.menuContainer.add(backBtn)
  }

  private async startGame(saveIndex: number) {
    const save = this.saves[saveIndex]
    if (!save) {
      saveManager.newGame()
    } else {
      saveManager.loadSave()
    }
    
    this.scene.start('Game')
  }

  private showMultiplayerMenu() {
    if (this.menuContainer) this.menuContainer.destroy()
    
    this.menuContainer = this.add.container(this.scale.width / 2, 200)
    
    const title = this.add.text(0, -150, '多人游戏', {
      fontFamily: 'Arial', fontSize: '32px', color: '#ff9900'
    }).setOrigin(0.5)
    this.menuContainer.add(title)
    
    const buttons = [
      { text: '创建房间', callback: () => this.createRoom() },
      { text: '加入房间', callback: () => this.joinRoom() },
      { text: '快速匹配', callback: () => this.quickMatch() },
      { text: '返回', callback: () => this.createMenu() }
    ]
    
    buttons.forEach((btn, i) => {
      const container = this.createButton(0, i * 70 - 50, btn.text, btn.callback)
      this.menuContainer!.add(container)
    })
  }

  private async createRoom() {
    const name = prompt('输入房间名称:', 'Legend Room')
    if (!name) return
    
    const difficulty = parseFloat(prompt('难度系数 (0-2):', '0.9') ?? '0.9') || 0.9
    const maxPlayers = parseInt(prompt('最大玩家数 (1-4):', '4') ?? '4') || 4
    
    const room = await networkManager.createRoom(name, difficulty, maxPlayers)
    if (room) {
      this.showRoomLobby(room)
    } else {
      alert('创建房间失败')
    }
  }

  private async joinRoom() {
    const roomId = prompt('输入房间ID:')
    if (!roomId) return
    
    const name = prompt('输入你的名称:', `Player${Math.floor(Math.random() * 1000)}`)
    if (!name) return
    
    const room = await networkManager.joinRoom(roomId, name)
    if (room) {
      this.showRoomLobby(room)
    } else {
      alert('加入房间失败')
    }
  }

  private async quickMatch() {
    const name = prompt('输入你的名称:', `Player${Math.floor(Math.random() * 1000)}`)
    if (!name) return
    
    const room = await networkManager.joinRandom(name)
    if (room) {
      this.showRoomLobby(room)
    } else {
      alert('匹配失败')
    }
  }

  private showRoomLobby(room: any) {
    if (this.menuContainer) this.menuContainer.destroy()
    
    this.menuContainer = this.add.container(this.scale.width / 2, 150)
    
    const title = this.add.text(0, -150, `房间: ${room.name}`, {
      fontFamily: 'Arial', fontSize: '28px', color: '#ff9900'
    }).setOrigin(0.5)
    this.menuContainer.add(title)
    
    const idText = this.add.text(0, -110, `ID: ${room.id}`, {
      fontFamily: 'Arial', fontSize: '16px', color: '#aaaaaa'
    }).setOrigin(0.5)
    this.menuContainer.add(idText)
    
    const playersText = this.add.text(0, -70, '玩家列表:', {
      fontFamily: 'Arial', fontSize: '20px', color: '#ffffff'
    }).setOrigin(0.5)
    this.menuContainer.add(playersText)
    
    const playerList = this.add.text(0, -30, networkManager.getPlayers().map(p => p.name).join(', '), {
      fontFamily: 'Arial', fontSize: '16px', color: '#cccccc'
    }).setOrigin(0.5)
    this.menuContainer.add(playerList)
    
    const startBtn = this.createButton(0, 50, networkManager.isHost() ? '开始游戏' : '等待房主开始', () => {
      if (networkManager.isHost()) {
        this.scene.start('Game')
      }
    })
    this.menuContainer.add(startBtn)
    
    const leaveBtn = this.createButton(0, 120, '离开房间', () => {
      networkManager.leave()
      this.createMenu()
    })
    this.menuContainer.add(leaveBtn)
    
    networkManager.on('playerJoined', () => {
      playerList.setText(networkManager.getPlayers().map(p => p.name).join(', '))
    })
    networkManager.on('playerLeft', () => {
      playerList.setText(networkManager.getPlayers().map(p => p.name).join(', '))
    })
  }

  private showSettings() {
    if (this.menuContainer) this.menuContainer.destroy()
    
    this.menuContainer = this.add.container(this.scale.width / 2, 150)
    
    const title = this.add.text(0, -150, '设置', {
      fontFamily: 'Arial', fontSize: '32px', color: '#ff9900'
    }).setOrigin(0.5)
    this.menuContainer.add(title)
    
    const settings = saveManager.getSettings()
    
    const options = [
      { key: 'master', label: '主音量', value: settings.audio.master, min: 0, max: 1, step: 0.1 },
      { key: 'music', label: '音乐音量', value: settings.audio.music, min: 0, max: 1, step: 0.1 },
      { key: 'sfx', label: '音效音量', value: settings.audio.sfx, min: 0, max: 1, step: 0.1 },
      { key: 'difficulty', label: '难度系数', value: settings.gameplay.difficulty, min: 0, max: 2, step: 0.1 }
    ]
    
    options.forEach((opt, i) => {
      const container = this.add.container(0, i * 60 - 80)
      
      const label = this.add.text(-180, 0, opt.label, {
        fontFamily: 'Arial', fontSize: '18px', color: '#ffffff'
      }).setOrigin(0, 0.5)
      
      const valueText = this.add.text(0, 0, opt.value.toFixed(1), {
        fontFamily: 'Arial', fontSize: '18px', color: '#ff9900'
      }).setOrigin(0.5)
      
      const minusBtn = this.add.text(-60, 0, '-', {
        fontFamily: 'Arial', fontSize: '24px', color: '#ffffff'
      }).setOrigin(0.5).setInteractive()
      minusBtn.on('pointerdown', () => {
        const newVal = Math.max(opt.min, opt.value - opt.step)
        this.updateSetting(opt.key, newVal)
        valueText.setText(newVal.toFixed(1))
      })
      
      const plusBtn = this.add.text(60, 0, '+', {
        fontFamily: 'Arial', fontSize: '24px', color: '#ffffff'
      }).setOrigin(0.5).setInteractive()
      plusBtn.on('pointerdown', () => {
        const newVal = Math.min(opt.max, opt.value + opt.step)
        this.updateSetting(opt.key, newVal)
        valueText.setText(newVal.toFixed(1))
      })
      
      container.add([label, valueText, minusBtn, plusBtn])
      this.menuContainer!.add(container)
    })
    
    const backBtn = this.createButton(0, 180, '返回', () => this.createMenu())
    this.menuContainer.add(backBtn)
  }

  private updateSetting(key: string, value: number) {
    const settings = saveManager.getSettings()
    if (key === 'difficulty') {
      settings.gameplay.difficulty = value
    } else {
      ;(settings.audio as any)[key] = value
    }
    saveManager.updateSettings(settings)
  }

  private createButton(x: number, y: number, text: string, callback: () => void) {
    const container = this.add.container(x, y)
    
    const bg = this.add.graphics()
    bg.fillStyle(0x333355, 1)
    bg.fillRoundedRect(-100, -20, 200, 40, 10)
    bg.lineStyle(2, 0xff9900, 1)
    bg.strokeRoundedRect(-100, -20, 200, 40, 10)
    
    const btnText = this.add.text(0, 0, text, {
      fontFamily: 'Arial', fontSize: '20px', color: '#ffffff'
    }).setOrigin(0.5)
    
    container.add([bg, btnText])
    container.setSize(200, 40)
    container.setInteractive(new Phaser.Geom.Rectangle(-100, -20, 200, 40), Phaser.Geom.Rectangle.Contains)
    
    container.on('pointerover', () => {
      bg.clear()
      bg.fillStyle(0x444477, 1)
      bg.fillRoundedRect(-100, -20, 200, 40, 10)
      bg.lineStyle(2, 0xffcc00, 1)
      bg.strokeRoundedRect(-100, -20, 200, 40, 10)
      btnText.setColor('#ffcc00')
    })
    
    container.on('pointerout', () => {
      bg.clear()
      bg.fillStyle(0x333355, 1)
      bg.fillRoundedRect(-100, -20, 200, 40, 10)
      bg.lineStyle(2, 0xff9900, 1)
      bg.strokeRoundedRect(-100, -20, 200, 40, 10)
      btnText.setColor('#ffffff')
    })
    
    container.on('pointerdown', callback)
    
    return container
  }

  private setupInput() {
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.menuContainer) {
        this.createMenu()
      }
    })
  }
}