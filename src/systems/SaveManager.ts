const SAVE_KEY = 'legend_save'
const SETTINGS_KEY = 'legend_settings'

export interface SaveData {
  version: string
  timestamp: number
  player: {
    x: number
    y: number
    level: number
    exp: number
    gold: number
    hp: number
    maxHp: number
    attributes: Record<string, number>
    equipment: Record<string, ItemData | null>
    weapon: ItemData | null
    inventory: ItemData[]
    unlockedRegions: string[]
    discoveredTeleports: string[]
    completedQuests: string[]
    activeQuest: string | null
    killCount: Record<string, number>
    playTime: number
  }
  world: {
    difficulty: number
    seed: string
    discoveredChunks: string[]
  }
}

export interface SettingsData {
  graphics: { quality: 'low' | 'medium' | 'high'; vsync: boolean; showFPS: boolean }
  audio: { master: number; music: number; sfx: number; mute: boolean }
  controls: { keybinds: Record<string, string[]>; touchEnabled: boolean; joystickSize: number }
  gameplay: { difficulty: number; autoPickup: boolean; showDamageNumbers: boolean; language: string }
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
}

class SaveManager {
  private saveData: SaveData | null = null
  private settingsData: SettingsData = this.getDefaultSettings()

  init() {
    this.loadSettings()
    this.loadSave()
  }

  getDefaultSettings(): SettingsData {
    return {
      graphics: { quality: 'medium', vsync: true, showFPS: false },
      audio: { master: 0.8, music: 0.7, sfx: 0.8, mute: false },
      controls: { keybinds: {}, touchEnabled: true, joystickSize: 120 },
      gameplay: { difficulty: 0.9, autoPickup: true, showDamageNumbers: true, language: 'zh-CN' }
    }
  }

  loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      if (stored) {
        this.settingsData = { ...this.getDefaultSettings(), ...JSON.parse(stored) }
      }
    } catch (e) {
      console.warn('Failed to load settings:', e)
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settingsData))
    } catch (e) {
      console.warn('Failed to save settings:', e)
    }
  }

  getSettings(): SettingsData {
    return this.settingsData
  }

  updateSettings(partial: Partial<SettingsData>) {
    this.settingsData = { ...this.settingsData, ...partial }
    this.saveSettings()
  }

  loadSave(): SaveData | null {
    try {
      const stored = localStorage.getItem(SAVE_KEY)
      if (stored) {
        const parsed: SaveData = JSON.parse(stored)
        this.saveData = parsed
        if (parsed.version !== '0.1.0') {
          this.migrateSave(parsed)
        }
      }
    } catch (e) {
      console.warn('Failed to load save:', e)
    }
    return this.saveData
  }

  saveGame(data: Partial<SaveData>) {
    if (!this.saveData) return
    this.saveData = {
      ...this.saveData,
      ...data,
      timestamp: Date.now(),
      version: '0.1.0'
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.saveData))
    } catch (e) {
      console.warn('Failed to save game:', e)
    }
  }

  getSave(): SaveData | null {
    return this.saveData
  }

  newGame(seed: string = this.generateSeed()): SaveData {
    this.saveData = {
      version: '0.1.0',
      timestamp: Date.now(),
      player: {
        x: 1550, y: 1550,
        level: 1, exp: 0, gold: 0,
        hp: 100, maxHp: 100,
        attributes: { strength: 5, agility: 5, intelligence: 5, vitality: 5 },
        equipment: { helmet: null, armor: null, leggings: null, boots: null },
        weapon: this.createStarterWeapon(),
        inventory: [],
        unlockedRegions: ['camp'],
        discoveredTeleports: ['camp'],
        completedQuests: [],
        activeQuest: null,
        killCount: {},
        playTime: 0
      },
      world: {
        difficulty: 0.9,
        seed,
        discoveredChunks: []
      }
    }
    this.saveGame({})
    return this.saveData
  }

  deleteSave() {
    this.saveData = null
    localStorage.removeItem(SAVE_KEY)
  }

  exportSave(): string {
    if (!this.saveData) return ''
    return btoa(JSON.stringify(this.saveData))
  }

  importSave(base64: string): boolean {
    try {
      const data = JSON.parse(atob(base64))
      this.saveData = data
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
      return true
    } catch (e) {
      console.error('Import failed:', e)
      return false
    }
  }

  private createStarterWeapon(): ItemData {
    return {
      id: 'weapon_iron_blade_0',
      type: 'weapon',
      name: '铁刃',
      quality: 'N',
      level: 1,
      stats: { damage: 10, attackSpeed: 1.2, range: 32 },
      bonds: [],
      icon: 'iron_blade',
      stackable: false,
      count: 1
    }
  }

  private generateSeed(): string {
    return Math.random().toString(36).substring(2, 10)
  }

  private migrateSave(save: SaveData) {
    // 版本迁移逻辑
    save.version = '0.1.0'
  }
}

export const saveManager = new SaveManager()