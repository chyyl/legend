import { Scene, GameObjects, Geom } from 'phaser'
import { saveManager, ItemData } from '../systems/SaveManager'
import {
  REGIONS, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, Z_LAYERS,
  WEAPON_CONFIG, WEAPON_TYPES, EQUIPMENT_SLOTS,
  WEAPON_QUALITY, EQUIPMENT_QUALITY, BONDS,
  ATTRIBUTES, ATTRIBUTE_EFFECTS, DIFFICULTY, PLAYER_MAX_LEVEL
} from '../config/GameConfig'

type TabKey = 'inventory' | 'equipment' | 'attributes' | 'map' | 'pause'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'inventory', label: '背包' },
  { key: 'equipment', label: '装备' },
  { key: 'attributes', label: '属性' },
  { key: 'map', label: '地图' },
  { key: 'pause', label: '暂停' }
]

const SLOT_LABELS: Record<string, string> = {
  weapon: '武器', helmet: '头盔', armor: '胸甲', leggings: '护腿', boots: '靴子'
}

const ATTR_LABELS: Record<string, string> = {
  strength: '力量', agility: '敏捷', intelligence: '智力', vitality: '体质'
}

const STAT_LABELS: Record<string, string> = {
  damage: '伤害', attackSpeed: '攻速', range: '范围', defense: '防御',
  moveSpeed: '移速', critChance: '暴击率', critMultiplier: '暴击倍率',
  dodgeChance: '闪避率', lifesteal: '吸血', hp: '生命', maxHp: '最大生命',
  blockChance: '格挡率', exp: '经验', gold: '金币', strength: '力量',
  agility: '敏捷', intelligence: '智力', vitality: '体质'
}

const BIOME_COLORS: Record<string, number> = {
  plains: 0x2e8b2e, mountains: 0x808080, coastal: 0x4169e1, farmland: 0xdeb887,
  dark_forest: 0x1a4d1a, industrial: 0x708090, snow: 0xcfe8ff, ocean: 0x1e6fd9,
  volcanic: 0x9b3b1e, dark_castle: 0x4b3a6b, final: 0x8b1a1a
}

const FONT = 'Arial'

export class UIScene extends Scene {
  private currentTab: TabKey = 'inventory'
  private difficulty: number = DIFFICULTY.default
  private selectedIndex: number = -1
  private invPage: number = 0

  private root: GameObjects.Container | null = null
  private content: GameObjects.Container | null = null
  private closeBtn: GameObjects.Container | null = null
  private tabBtns: GameObjects.Container[] = []

  private panelX = 0
  private panelY = 0
  private panelW = 0
  private panelH = 0
  private tabH = 48
  private closeSize = 44
  private contentX = 0
  private contentY = 0
  private contentW = 0
  private contentH = 0

  constructor() {
    super('UI')
  }

  create(data?: { tab?: string }): void {
    const t = data?.tab
    this.currentTab =
      t === 'inventory' || t === 'equipment' || t === 'attributes' || t === 'map' || t === 'pause'
        ? t
        : 'inventory'
    this.selectedIndex = -1
    this.invPage = 0

    const save = saveManager.getSave()
    this.difficulty =
      save && typeof save.world.difficulty === 'number'
        ? save.world.difficulty
        : saveManager.getSettings().gameplay.difficulty

    if (this.scene.get('Game')) {
      this.scene.pause('Game')
    }

    this.buildAll()

    this.scale.on('resize', this.onResize, this)
    this.input.keyboard?.on('keydown-ESC', this.closeUI, this)
    this.events.once('shutdown', this.onShutdown, this)
  }

  private onShutdown(): void {
    this.scale.off('resize', this.onResize, this)
    this.input.keyboard?.off('keydown-ESC', this.closeUI, this)
  }

  private onResize(): void {
    this.buildAll()
  }

  private closeUI(): void {
    this.scene.resume('Game')
    this.scene.stop()
  }

  // ---------- layout & chrome ----------

  private buildAll(): void {
    if (this.root) {
      this.root.destroy()
      this.root = null
      this.content = null
      this.closeBtn = null
      this.tabBtns = []
    }

    const W = this.scale.width
    const H = this.scale.height
    const margin = Math.max(6, Math.floor(Math.min(W, H) * 0.02))

    this.panelX = margin
    this.panelY = margin
    this.panelW = W - margin * 2
    this.panelH = H - margin * 2
    this.tabH = 48
    this.closeSize = 44
    this.contentX = this.panelX + 8
    this.contentY = this.panelY + this.tabH + 8
    this.contentW = this.panelW - 16
    this.contentH = this.panelH - this.tabH - 16

    const root = this.add.container(0, 0)
    root.setDepth(Z_LAYERS.ui)
    this.root = root

    // full screen dim mask
    const dim = this.add.graphics()
    dim.fillStyle(0x1a1a2e, 0.85)
    dim.fillRect(0, 0, W, H)
    dim.setInteractive(new Geom.Rectangle(0, 0, W, H), Geom.Rectangle.Contains)
    root.add(dim)

    // panel
    const panel = this.add.graphics()
    panel.fillStyle(0x333355, 1)
    panel.fillRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, 12)
    panel.lineStyle(2, 0xff9900, 1)
    panel.strokeRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, 12)
    root.add(panel)

    // content container (children drawn in screen coords)
    this.content = this.add.container(0, 0)
    root.add(this.content)

    this.buildTabBar(root)
    this.buildCloseButton(root)
    this.renderTab()
  }

  private buildTabBar(root: GameObjects.Container): void {
    const tabsW = this.panelW - this.closeSize
    const tabW = tabsW / TABS.length
    const h = this.tabH - 8

    TABS.forEach((tab, i) => {
      const cx = this.panelX + tabW * i + tabW / 2
      const cy = this.panelY + this.tabH / 2
      const active = tab.key === this.currentTab

      const c = this.add.container(cx, cy)
      const g = this.add.graphics()
      const draw = (hover: boolean) => {
        g.clear()
        g.fillStyle(active ? 0x444477 : hover ? 0x3d3d66 : 0x2a2a44, 1)
        g.fillRoundedRect(-tabW / 2 + 2, -h / 2, tabW - 4, h, 8)
        g.lineStyle(2, active ? 0xffcc00 : 0xff9900, active ? 1 : 0.6)
        g.strokeRoundedRect(-tabW / 2 + 2, -h / 2, tabW - 4, h, 8)
      }
      draw(false)

      const label = this.add.text(0, 0, tab.label, {
        fontFamily: FONT,
        fontSize: tabW < 64 ? '13px' : '15px',
        color: active ? '#ffcc00' : '#ffffff'
      }).setOrigin(0.5, 0.5)

      c.add([g, label])
      c.setSize(tabW - 4, h)
      c.setInteractive(new Geom.Rectangle(-tabW / 2 + 2, -h / 2, tabW - 4, h), Geom.Rectangle.Contains)
      c.on('pointerover', () => {
        if (!active) label.setColor('#ffcc00')
        draw(true)
      })
      c.on('pointerout', () => {
        if (!active) label.setColor('#ffffff')
        draw(false)
      })
      c.on('pointerdown', () => this.switchTab(tab.key))

      root.add(c)
      this.tabBtns.push(c)
    })
  }

  private buildCloseButton(root: GameObjects.Container): void {
    const size = this.closeSize
    const cx = this.panelX + this.panelW - size / 2
    const cy = this.panelY + this.tabH / 2

    const c = this.add.container(cx, cy)
    const g = this.add.graphics()
    const draw = (hover: boolean) => {
      g.clear()
      g.fillStyle(hover ? 0x553333 : 0x333355, 1)
      g.fillRoundedRect(-size / 2, -size / 2, size, size, 8)
      g.lineStyle(2, hover ? 0xffcc00 : 0xff9900, 1)
      g.strokeRoundedRect(-size / 2, -size / 2, size, size, 8)
    }
    draw(false)

    const label = this.add.text(0, 0, '✕', {
      fontFamily: FONT,
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(0.5, 0.5)

    c.add([g, label])
    c.setSize(size, size)
    c.setDepth(Z_LAYERS.ui_overlay)
    c.setInteractive(new Geom.Rectangle(-size / 2, -size / 2, size, size), Geom.Rectangle.Contains)
    c.on('pointerover', () => {
      label.setColor('#ffcc00')
      draw(true)
    })
    c.on('pointerout', () => {
      label.setColor('#ffffff')
      draw(false)
    })
    c.on('pointerdown', () => this.closeUI())

    root.add(c)
    this.closeBtn = c
  }

  private switchTab(key: TabKey): void {
    if (this.currentTab === key) return
    this.currentTab = key
    this.selectedIndex = -1
    this.invPage = 0

    // rebuild chrome so active tab highlight updates
    if (this.root) {
      for (const b of this.tabBtns) b.destroy()
      this.tabBtns = []
      this.buildTabBar(this.root)
      if (this.closeBtn) {
        this.root.remove(this.closeBtn)
        this.closeBtn.destroy()
      }
      this.buildCloseButton(this.root)
    }
    this.renderTab()
  }

  private renderTab(): void {
    if (!this.content) return
    this.content.removeAll(true)
    switch (this.currentTab) {
      case 'inventory':
        this.renderInventory()
        break
      case 'equipment':
        this.renderEquipment()
        break
      case 'attributes':
        this.renderAttributes()
        break
      case 'map':
        this.renderMap()
        break
      case 'pause':
        this.renderPause()
        break
    }
  }

  // ---------- data helpers ----------

  private getGame(): any {
    return this.scene.get('Game') as any
  }

  private getPlayer(): any | null {
    const game = this.getGame()
    return game && game.playerEntity ? game.playerEntity : null
  }

  private getInventory(): { items: ItemData[]; maxSlots: number; gold: number } | null {
    const player = this.getPlayer()
    if (player) {
      const inv = player.get('inventory')
      if (inv) return inv
    }
    const save = saveManager.getSave()
    if (save) {
      return { items: save.player.inventory, maxSlots: 999, gold: save.player.gold }
    }
    return null
  }

  private getEquipmentSlots(): Record<string, ItemData | null> {
    const player = this.getPlayer()
    if (player) {
      const eq = player.get('equipment')
      if (eq) return eq.slots
    }
    const save = saveManager.getSave()
    if (save) return save.player.equipment
    return { helmet: null, armor: null, leggings: null, boots: null }
  }

  private getLevel(): { level: number; exp: number; expToNext: number; attributePoints: number; attributes: Record<string, number> } | null {
    const player = this.getPlayer()
    if (player) {
      const lv = player.get('level')
      if (lv) return lv
    }
    const save = saveManager.getSave()
    if (save) {
      return {
        level: save.player.level,
        exp: save.player.exp,
        expToNext: Math.floor(100 * Math.pow(1.5, save.player.level - 1)),
        attributePoints: 0,
        attributes: save.player.attributes
      }
    }
    return null
  }

  private getUnlockedRegions(): string[] {
    const save = saveManager.getSave()
    const list = save && Array.isArray(save.player.unlockedRegions) ? [...save.player.unlockedRegions] : []
    if (!list.includes('camp')) list.push('camp')
    return list
  }

  private qualityInfo(quality: string): { name: string; color: string; num: number } {
    const w = WEAPON_QUALITY.find(q => q.id === quality)
    if (w) return { name: w.name, color: this.toHex(w.color), num: w.color }
    const e = EQUIPMENT_QUALITY.find(q => q.id === quality)
    if (e) return { name: e.name, color: this.toHex(e.color), num: e.color }
    return { name: quality, color: '#ffffff', num: 0xffffff }
  }

  private toHex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0')
  }

  private bondNames(bonds: string[]): string[] {
    return bonds.map(id => {
      const b = BONDS.find(x => x.id === id)
      return b ? b.name : id
    })
  }

  private expNeeded(level: number): number {
    return Math.floor(100 * Math.pow(1.5, level - 1))
  }

  // ---------- shared widgets ----------

  private makeButton(
    x: number, y: number, w: number, h: number,
    text: string, onClick: () => void, fontSize: string = '16px'
  ): GameObjects.Container {
    const c = this.add.container(x, y)
    const g = this.add.graphics()
    const draw = (hover: boolean) => {
      g.clear()
      g.fillStyle(hover ? 0x444477 : 0x333355, 1)
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 10)
      g.lineStyle(2, hover ? 0xffcc00 : 0xff9900, 1)
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 10)
    }
    draw(false)

    const label = this.add.text(0, 0, text, {
      fontFamily: FONT,
      fontSize,
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5, 0.5)

    c.add([g, label])
    c.setSize(w, h)
    c.setInteractive(new Geom.Rectangle(-w / 2, -h / 2, w, h), Geom.Rectangle.Contains)
    c.on('pointerover', () => {
      label.setColor('#ffcc00')
      draw(true)
    })
    c.on('pointerout', () => {
      label.setColor('#ffffff')
      draw(false)
    })
    c.on('pointerdown', onClick)

    this.content?.add(c)
    return c
  }

  private label(x: number, y: number, text: string, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}, originX = 0, originY = 0): GameObjects.Text {
    const t = this.add.text(x, y, text, {
      fontFamily: FONT,
      fontSize: '14px',
      color: '#ffffff',
      ...opts
    })
    t.setOrigin(originX, originY)
    this.content?.add(t)
    return t
  }

  // ---------- inventory tab ----------

  private renderInventory(): void {
    const inv = this.getInventory()
    const items = inv ? inv.items : []
    if (this.selectedIndex >= items.length) this.selectedIndex = -1

    const showDetail = this.selectedIndex >= 0
    const detailH = showDetail ? Math.min(170, Math.floor(this.contentH * 0.4)) : 0
    const gridH = this.contentH - detailH - (showDetail ? 8 : 0)

    // header
    this.label(this.contentX, this.contentY, `背包  金币: ${inv ? inv.gold : 0}`, {
      fontSize: '14px', color: '#ff9900'
    })
    const headerH = 22

    // grid geometry: 5 columns
    const cols = 5
    const cell = Math.max(44, Math.min(88, Math.floor(this.contentW / cols)))
    const rows = Math.max(1, Math.floor((gridH - headerH) / cell))
    const pageSize = cols * rows
    const pages = Math.max(1, Math.ceil(items.length / pageSize))
    if (this.invPage >= pages) this.invPage = pages - 1
    if (this.invPage < 0) this.invPage = 0
    const start = this.invPage * pageSize

    const gridTop = this.contentY + headerH
    for (let i = 0; i < pageSize; i++) {
      const idx = start + i
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = this.contentX + col * cell + cell / 2
      const cy = gridTop + row * cell + cell / 2
      const item = idx < items.length ? items[idx] : null
      const selected = idx === this.selectedIndex
      this.drawItemSlot(item, cx, cy, cell, selected, () => {
        if (!item) return
        this.selectedIndex = idx
        this.renderInventory()
      })
    }

    // pagination
    if (pages > 1) {
      const py = gridTop + rows * cell + 16
      const half = Math.floor(this.contentW / 4)
      this.makeButton(this.contentX + half, py, Math.min(96, half), 36, '< 上一页', () => {
        if (this.invPage > 0) this.invPage--
        this.renderInventory()
      }, '13px')
      this.label(this.contentX + this.contentW / 2, py, `${this.invPage + 1} / ${pages}`, {
        fontSize: '13px', color: '#aaaaaa'
      }, 0.5, 0.5)
      this.makeButton(this.contentX + this.contentW - half, py, Math.min(96, half), 36, '下一页 >', () => {
        if (this.invPage < pages - 1) this.invPage++
        this.renderInventory()
      }, '13px')
    }

    // detail panel
    if (showDetail) {
      const item = items[this.selectedIndex]
      const dy = this.contentY + this.contentH - detailH
      const dg = this.add.graphics()
      dg.fillStyle(0x2a2a4a, 1)
      dg.fillRoundedRect(this.contentX, dy, this.contentW, detailH, 8)
      dg.lineStyle(1, 0xff9900, 0.6)
      dg.strokeRoundedRect(this.contentX, dy, this.contentW, detailH, 8)
      this.content?.add(dg)

      if (item) this.drawItemDetail(item, dy, detailH)
    }
  }

  private drawItemSlot(
    item: ItemData | null, cx: number, cy: number, cell: number,
    selected: boolean, onClick: () => void
  ): void {
    const c = this.add.container(cx, cy)
    const g = this.add.graphics()
    const q = item ? this.qualityInfo(item.quality) : null
    const borderColor = selected ? 0xffcc00 : q ? q.num : 0x444466

    g.fillStyle(selected ? 0x444466 : 0x26264a, 1)
    g.fillRoundedRect(-cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4, 6)
    g.lineStyle(selected ? 2 : 1, borderColor, 1)
    g.strokeRoundedRect(-cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4, 6)
    c.add(g)

    if (item) {
      const nameSize = cell >= 64 ? '11px' : '9px'
      const name = this.add.text(0, -cell / 2 + 10, this.truncate(item.name, cell - 8), {
        fontFamily: FONT, fontSize: nameSize, color: q ? q.color : '#ffffff', align: 'center',
        wordWrap: { width: cell - 8 }
      }).setOrigin(0.5, 0)
      c.add(name)

      const bonds = this.bondNames(item.bonds)
      if (bonds.length > 0) {
        const bond = this.add.text(0, cell / 2 - 16, `羁绊:${this.truncate(bonds.join(','), 6)}`, {
          fontFamily: FONT, fontSize: '9px', color: '#ffcc00', align: 'center',
          wordWrap: { width: cell - 8 }
        }).setOrigin(0.5, 0)
        c.add(bond)
      }

      if (item.count > 1) {
        const cnt = this.add.text(cell / 2 - 6, cell / 2 - 4, `x${item.count}`, {
          fontFamily: FONT, fontSize: '10px', color: '#ffffff'
        }).setOrigin(1, 1)
        c.add(cnt)
      }
    }

    c.setSize(cell - 4, cell - 4)
    c.setInteractive(new Geom.Rectangle(-cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4), Geom.Rectangle.Contains)
    c.on('pointerover', () => { if (!selected) g.alpha = 0.85 })
    c.on('pointerout', () => { g.alpha = 1 })
    c.on('pointerdown', onClick)
    this.content?.add(c)
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max - 1) + '…' : text
  }

  private drawItemDetail(item: ItemData, dy: number, detailH: number): void {
    const x = this.contentX + 10
    const q = this.qualityInfo(item.quality)
    let y = dy + 8

    this.label(x, y, item.name, { fontSize: '16px', color: q.color })
    y += 22

    const typeNames: Record<string, string> = {
      weapon: '武器', equipment: '装备', consumable: '消耗品', material: '材料'
    }
    this.label(x, y, `[${typeNames[item.type] ?? item.type}] ${q.name}  Lv.${item.level}  x${item.count}`,
      { fontSize: '12px', color: '#aaaaaa' })
    y += 18

    const statParts = Object.entries(item.stats).map(([k, v]) => {
      const name = STAT_LABELS[k] ?? k
      const val = k === 'attackSpeed' || k === 'critMultiplier' ? v.toFixed(2) : String(v)
      return `${name}+${val}`
    })
    if (statParts.length > 0) {
      this.label(x, y, statParts.join('  '), { fontSize: '12px', color: '#cccccc', wordWrap: { width: this.contentW - 20 } })
      y += 18
    }

    const bonds = this.bondNames(item.bonds)
    this.label(x, y, bonds.length > 0 ? `羁绊: ${bonds.join('、')}` : '羁绊: 无', {
      fontSize: '12px', color: bonds.length > 0 ? '#ffcc00' : '#777777',
      wordWrap: { width: this.contentW - 20 }
    })
    y += 20

    // action buttons
    const btnH = 40
    const btnW = Math.min(120, (this.contentW - 30) / 2)
    const btnY = dy + detailH - btnH / 2 - 8
    const canEquip = item.type === 'weapon' || item.type === 'equipment'

    if (canEquip) {
      const eqX = this.contentX + 10 + btnW / 2
      this.makeButton(eqX, btnY, btnW, btnH, '装 备', () => this.equipSelected())
      this.makeButton(this.contentX + this.contentW - 10 - btnW / 2, btnY, btnW, btnH, '丢 弃', () => this.dropSelected())
    } else {
      this.makeButton(this.contentX + this.contentW - 10 - btnW / 2, btnY, btnW, btnH, '丢 弃', () => this.dropSelected())
    }
  }

  private equipSelected(): void {
    const player = this.getPlayer()
    const inv = this.getInventory()
    if (!player || !inv) return
    const items = inv.items
    const item = items[this.selectedIndex]
    if (!item) return

    const liveInv = player.get('inventory')
    const eqComp = player.get('equipment')
    if (!liveInv || !eqComp) return

    if (item.type === 'weapon') {
      const weapon = player.get('weapon')
      if (!weapon) return
      // put current weapon back into inventory as an item
      const curType = WEAPON_TYPES.includes(weapon.weaponType as any) ? weapon.weaponType : WEAPON_TYPES[0]
      const curCfg = WEAPON_CONFIG[curType as typeof WEAPON_TYPES[number]]
      const oldItem: ItemData = {
        id: `weapon_${curType}_${weapon.level}`,
        type: 'weapon',
        name: curCfg.name,
        quality: weapon.quality,
        level: weapon.level,
        stats: { damage: weapon.baseDamage, attackSpeed: weapon.attackSpeed, range: weapon.range },
        bonds: [...weapon.bonds],
        icon: curType,
        stackable: false,
        count: 1
      }
      const newType = WEAPON_TYPES.includes(item.icon as any) ? item.icon : WEAPON_TYPES[0]
      const newCfg = WEAPON_CONFIG[newType as typeof WEAPON_TYPES[number]]
      weapon.weaponType = newType
      weapon.quality = item.quality
      weapon.level = item.level
      weapon.baseDamage = item.stats.damage ?? newCfg.damage
      weapon.attackSpeed = item.stats.attackSpeed ?? newCfg.attackSpeed
      weapon.range = item.stats.range ?? newCfg.range
      weapon.bonds = [...item.bonds]

      const idx = liveInv.items.indexOf(item)
      if (idx >= 0) liveInv.items.splice(idx, 1)
      liveInv.items.push(oldItem)
    } else if (item.type === 'equipment') {
      const slot = this.resolveSlot(item)
      const prev = eqComp.slots[slot]
      const idx = liveInv.items.indexOf(item)
      if (idx >= 0) liveInv.items.splice(idx, 1)
      eqComp.slots[slot] = item
      if (prev) liveInv.items.push(prev)
    } else {
      return
    }

    this.selectedIndex = -1
    this.renderInventory()
  }

  private resolveSlot(item: ItemData): string {
    const anyItem = item as any
    if (anyItem.equipmentSlot && EQUIPMENT_SLOTS.includes(anyItem.equipmentSlot)) {
      return anyItem.equipmentSlot
    }
    const s = `${item.name} ${item.icon}`
    if (/头|盔|帽|helmet/i.test(s)) return 'helmet'
    if (/裤|腿|legging/i.test(s)) return 'leggings'
    if (/靴|鞋|boot/i.test(s)) return 'boots'
    return 'armor'
  }

  private dropSelected(): void {
    const player = this.getPlayer()
    const inv = this.getInventory()
    if (!player || !inv) return
    const liveInv = player.get('inventory')
    if (!liveInv) return
    const item = liveInv.items[this.selectedIndex]
    if (!item) return
    if (!window.confirm(`丢弃「${item.name}」？`)) return
    liveInv.items.splice(this.selectedIndex, 1)
    this.selectedIndex = -1
    this.renderInventory()
  }

  // ---------- equipment tab ----------

  private renderEquipment(): void {
    const player = this.getPlayer()
    const eq = player ? player.get('equipment') : null
    const slots: Record<string, ItemData | null> = eq ? eq.slots : this.getEquipmentSlots()
    const weapon = player ? player.get('weapon') : null
    const stats = player ? player.get('stats') : null
    const health = player ? player.get('health') : null

    let y = this.contentY
    this.label(this.contentX, y, '装备', { fontSize: '15px', color: '#ff9900' })
    y += 26

    const slotKeys: string[] = ['weapon', ...EQUIPMENT_SLOTS]
    const rowH = Math.max(52, Math.min(72, Math.floor((this.contentH - 150) / slotKeys.length)))

    for (const key of slotKeys) {
      const isWeapon = key === 'weapon'
      let item: ItemData | null = null
      let displayName = '（空）'
      let displayQuality = ''

      if (isWeapon && weapon) {
        const wt = WEAPON_TYPES.includes(weapon.weaponType as any) ? weapon.weaponType : WEAPON_TYPES[0]
        const cfg = WEAPON_CONFIG[wt as typeof WEAPON_TYPES[number]]
        item = {
          id: `weapon_${wt}_${weapon.level}`, type: 'weapon', name: cfg.name,
          quality: weapon.quality, level: weapon.level,
          stats: { damage: weapon.baseDamage, attackSpeed: weapon.attackSpeed, range: weapon.range },
          bonds: [...weapon.bonds], icon: wt, stackable: false, count: 1
        }
        displayName = `${cfg.name}  伤害${weapon.baseDamage}  攻速${weapon.attackSpeed.toFixed(2)}  范围${weapon.range}`
        displayQuality = weapon.quality
      } else if (!isWeapon) {
        item = slots[key] ?? null
        if (item) {
          const statsStr = Object.entries(item.stats).map(([k, v]) => `${STAT_LABELS[k] ?? k}+${v}`).join(' ')
          displayName = `${item.name}  ${statsStr}`
          displayQuality = item.quality
        }
      }

      // row background
      const rg = this.add.graphics()
      rg.fillStyle(0x26264a, 1)
      rg.fillRoundedRect(this.contentX, y, this.contentW, rowH - 8, 6)
      rg.lineStyle(1, item ? this.qualityInfo(displayQuality).num : 0x444466, item ? 1 : 0.6)
      rg.strokeRoundedRect(this.contentX, y, this.contentW, rowH - 8, 6)
      this.content?.add(rg)

      this.label(this.contentX + 10, y + 8, SLOT_LABELS[key] ?? key, {
        fontSize: '12px', color: '#8888aa'
      })
      this.label(this.contentX + 10, y + 26, this.truncate(displayName, 34), {
        fontSize: '13px', color: item ? this.qualityInfo(displayQuality).color : '#666666',
        wordWrap: { width: this.contentW - 90 }
      })

      if (item) {
        this.makeButton(this.contentX + this.contentW - 46, y + (rowH - 8) / 2, 76, 34, '卸下', () => {
          this.unequipSlot(key)
        }, '13px')
      }

      // make the whole row clickable to unequip
      const hit = this.add.container(0, 0)
      const zoneW = this.contentW - 90
      const zoneH = rowH - 8
      const zone = this.add.zone(this.contentX + zoneW / 2, y + zoneH / 2, zoneW, zoneH)
      zone.setInteractive(new Geom.Rectangle(0, 0, zoneW, zoneH), Geom.Rectangle.Contains)
      zone.on('pointerdown', () => { if (item) this.unequipSlot(key) })
      hit.add(zone)
      this.content?.add(hit)

      y += rowH
    }

    // summary
    y += 4
    const summaryLines: string[] = []
    let totalDefense = 0
    for (const k of EQUIPMENT_SLOTS) {
      const it = slots[k]
      if (it && typeof it.stats.defense === 'number') totalDefense += it.stats.defense
    }
    summaryLines.push(`总防御: ${totalDefense}${stats ? `  (面板防御: ${stats.defense})` : ''}`)
    if (health) summaryLines.push(`生命: ${Math.round(health.hp)} / ${health.maxHp}`)
    if (stats) {
      summaryLines.push(`伤害: ${stats.damage}  攻速: ${stats.attackSpeed.toFixed(2)}  移速: ${Math.round(stats.moveSpeed)}`)
      summaryLines.push(`暴击: ${Math.round(stats.critChance * 100)}%  闪避: ${Math.round(stats.dodgeChance * 100)}%`)
    }
    if (eq && Array.isArray(eq.setBonuses) && eq.setBonuses.length > 0) {
      summaryLines.push(`套装加成: ${eq.setBonuses.join('、')}`)
    }

    const sg = this.add.graphics()
    sg.fillStyle(0x1f1f3a, 1)
    sg.fillRoundedRect(this.contentX, y, this.contentW, this.contentY + this.contentH - y, 8)
    sg.lineStyle(1, 0xff9900, 0.5)
    sg.strokeRoundedRect(this.contentX, y, this.contentW, this.contentY + this.contentH - y, 8)
    this.content?.add(sg)

    this.label(this.contentX + 10, y + 8, summaryLines.join('\n'), {
      fontSize: '12px', color: '#cccccc', lineSpacing: 4,
      wordWrap: { width: this.contentW - 20 }
    })
  }

  private unequipSlot(key: string): void {
    const player = this.getPlayer()
    if (!player) return
    const eq = player.get('equipment')
    const inv = player.get('inventory')
    if (!eq || !inv) return

    if (key === 'weapon') {
      const weapon = player.get('weapon')
      if (!weapon) return
      const wt = WEAPON_TYPES.includes(weapon.weaponType as any) ? weapon.weaponType : WEAPON_TYPES[0]
      const cfg = WEAPON_CONFIG[wt as typeof WEAPON_TYPES[number]]
      inv.items.push({
        id: `weapon_${wt}_${weapon.level}`, type: 'weapon', name: cfg.name,
        quality: weapon.quality, level: weapon.level,
        stats: { damage: weapon.baseDamage, attackSpeed: weapon.attackSpeed, range: weapon.range },
        bonds: [...weapon.bonds], icon: wt, stackable: false, count: 1
      })
      // reset to bare hands equivalent (starter-like weak weapon)
      weapon.quality = 'N'
      weapon.level = 1
      weapon.baseDamage = 5
      weapon.attackSpeed = 1.0
      weapon.range = WEAPON_CONFIG[WEAPON_TYPES[0]].range
      weapon.bonds = []
      this.renderEquipment()
      return
    }

    const item = eq.slots[key]
    if (!item) return
    eq.slots[key] = null
    inv.items.push(item)
    this.renderEquipment()
  }

  // ---------- attributes tab ----------

  private renderAttributes(): void {
    const lv = this.getLevel()
    const player = this.getPlayer()
    const stats = player ? player.get('stats') : null
    const health = player ? player.get('health') : null

    let y = this.contentY
    const W = this.contentW
    const x = this.contentX

    const level = lv ? lv.level : 1
    const exp = lv ? lv.exp : 0
    const need = this.expNeeded(level)
    const points = lv ? lv.attributePoints : 0

    this.label(x, y, `等级  ${level} / ${PLAYER_MAX_LEVEL}`, { fontSize: '16px', color: '#ff9900' })
    if (stats && health) {
      this.label(x + W, y, `生命 ${Math.round(health.hp)}/${health.maxHp}  伤害 ${stats.damage}  防御 ${stats.defense}`, {
        fontSize: '12px', color: '#aaaaaa'
      }, 1, 0)
    }
    y += 28

    // exp bar
    const barW = W
    const barH = 18
    const pct = Math.max(0, Math.min(1, need > 0 ? exp / need : 0))
    const bg = this.add.graphics()
    bg.fillStyle(0x1a1a2e, 1)
    bg.fillRoundedRect(x, y, barW, barH, 6)
    bg.lineStyle(1, 0xff9900, 0.8)
    bg.strokeRoundedRect(x, y, barW, barH, 6)
    if (pct > 0) {
      bg.fillStyle(0xff9900, 1)
      bg.fillRoundedRect(x + 1, y + 1, Math.max(4, (barW - 2) * pct), barH - 2, 5)
    }
    this.content?.add(bg)
    this.label(x + barW / 2, y + barH / 2, `${exp} / ${need}`, {
      fontSize: '11px', color: '#ffffff'
    }, 0.5, 0.5)
    y += barH + 14

    // attribute points
    const pointsColor = points > 0 ? '#ffcc00' : '#888888'
    this.label(x, y, `剩余属性点: ${points}`, { fontSize: '15px', color: pointsColor })
    y += 28

    const attrs: Record<string, number> = lv ? lv.attributes : {}
    const btnSize = 44
    const rowH = Math.max(56, Math.min(76, Math.floor((this.contentY + this.contentH - y - 10) / ATTRIBUTES.length)))

    for (const attr of ATTRIBUTES) {
      const val = attrs[attr] ?? 0
      const rowTop = y

      const rg = this.add.graphics()
      rg.fillStyle(0x26264a, 1)
      rg.fillRoundedRect(x, rowTop, W, rowH - 6, 6)
      this.content?.add(rg)

      this.label(x + 12, rowTop + 8, ATTR_LABELS[attr] ?? attr, { fontSize: '15px', color: '#ffffff' })
      this.label(x + 96, rowTop + 8, `${val}`, { fontSize: '15px', color: '#ffcc00' })

      const effects = ATTRIBUTE_EFFECTS[attr] ?? []
      this.label(x + 12, rowTop + 30, `效果: ${effects.join(' / ')}`, {
        fontSize: '11px', color: '#8faacc', wordWrap: { width: W - btnSize - 40 }
      })

      // + button (touch friendly 44px)
      const bx = x + W - btnSize / 2 - 8
      const by = rowTop + (rowH - 6) / 2
      const canAdd = points > 0 && !!lv
      const c = this.add.container(bx, by)
      const g = this.add.graphics()
      const draw = (hover: boolean) => {
        g.clear()
        g.fillStyle(!canAdd ? 0x2a2a3a : hover ? 0x444477 : 0x333355, 1)
        g.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 10)
        g.lineStyle(2, !canAdd ? 0x444455 : hover ? 0xffcc00 : 0xff9900, 1)
        g.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 10)
      }
      draw(false)
      const plus = this.add.text(0, 0, '+', {
        fontFamily: FONT, fontSize: '24px', color: canAdd ? '#ffffff' : '#555566'
      }).setOrigin(0.5, 0.5)
      c.add([g, plus])
      c.setSize(btnSize, btnSize)
      c.setInteractive(new Geom.Rectangle(-btnSize / 2, -btnSize / 2, btnSize, btnSize), Geom.Rectangle.Contains)
      if (canAdd) {
        c.on('pointerover', () => { plus.setColor('#ffcc00'); draw(true) })
        c.on('pointerout', () => { plus.setColor('#ffffff'); draw(false) })
        c.on('pointerdown', () => this.addAttribute(attr))
      }
      this.content?.add(c)

      y += rowH
    }
  }

  private addAttribute(attr: string): void {
    const player = this.getPlayer()
    if (!player) return
    const lv = player.get('level')
    if (!lv) return
    if (lv.attributePoints <= 0) return
    lv.attributePoints -= 1
    lv.attributes[attr] = (lv.attributes[attr] ?? 0) + 1

    // vitality also raises max hp immediately
    if (attr === 'vitality') {
      const health = player.get('health')
      if (health) {
        health.maxHp += 10
        health.hp = Math.min(health.hp + 10, health.maxHp)
      }
    }
    this.renderAttributes()
  }

  // ---------- map tab ----------

  private renderMap(): void {
    const x = this.contentX
    let y = this.contentY
    const W = this.contentW
    const H = this.contentH

    this.label(x, y, '世界地图', { fontSize: '15px', color: '#ff9900' })
    y += 24

    // map area keeps a square shape for the 2000x2000 world
    const legendH = 66
    const mapSize = Math.min(W, H - legendH - 28)
    const mapX = x + (W - mapSize) / 2

    const scale = mapSize / (MAP_WIDTH * TILE_SIZE)
    const worldW = MAP_WIDTH * TILE_SIZE
    const worldH = MAP_HEIGHT * TILE_SIZE

    const g = this.add.graphics()
    // world background
    g.fillStyle(0x12121f, 1)
    g.fillRect(mapX, y, mapSize, mapSize * (worldH / worldW))
    g.lineStyle(1, 0x555577, 1)
    g.strokeRect(mapX, y, mapSize, mapSize * (worldH / worldW))

    const unlocked = this.getUnlockedRegions()

    for (const region of REGIONS) {
      const rx = mapX + region.x * TILE_SIZE * scale
      const ry = y + region.y * TILE_SIZE * scale
      const rw = region.width * TILE_SIZE * scale
      const rh = region.height * TILE_SIZE * scale
      const isOpen = unlocked.includes(region.id)

      if (isOpen) {
        const color = BIOME_COLORS[region.biome] ?? 0x3a6a3a
        g.fillStyle(color, 0.9)
        g.fillRect(rx, ry, rw, rh)
        g.lineStyle(1, 0xff9900, 0.9)
        g.strokeRect(rx, ry, rw, rh)
      } else {
        g.fillStyle(0x000000, 0.72)
        g.fillRect(rx, ry, rw, rh)
        g.lineStyle(1, 0x333344, 0.8)
        g.strokeRect(rx, ry, rw, rh)
      }
    }
    this.content?.add(g)

    // region labels (name + recommended level)
    for (const region of REGIONS) {
      const rx = mapX + region.x * TILE_SIZE * scale + region.width * TILE_SIZE * scale / 2
      const ry = y + region.y * TILE_SIZE * scale + region.height * TILE_SIZE * scale / 2
      const isOpen = unlocked.includes(region.id)
      const labelStr = `${region.name}\nLv.${region.level}`
      if (region.width * TILE_SIZE * scale >= 34) {
        this.label(rx, ry, labelStr, {
          fontSize: '9px',
          color: isOpen ? '#ffffff' : '#666677',
          align: 'center',
          lineSpacing: 1
        }, 0.5, 0.5)
      }
    }

    // player position marker (bright dot)
    const pos = this.getPlayerPosition()
    if (pos) {
      const px = mapX + pos.x * TILE_SIZE * scale
      const py = y + pos.y * TILE_SIZE * scale
      const dot = this.add.graphics()
      dot.fillStyle(0xffff00, 0.35)
      dot.fillCircle(px, py, 7)
      dot.fillStyle(0xffffff, 1)
      dot.fillCircle(px, py, 3.5)
      this.content?.add(dot)
    }

    // legend
    const ly = y + mapSize * (worldH / worldW) + 8
    const unlockedCount = unlocked.length
    const posStr = pos ? `(${Math.round(pos.x)}, ${Math.round(pos.y)})` : '未知'
    this.label(x, ly, `已解锁区域: ${unlockedCount} / ${REGIONS.length}    玩家位置: ${posStr}`, {
      fontSize: '11px', color: '#aaaaaa', wordWrap: { width: W }
    })
    this.label(x, ly + 16, '黄色边框 = 已解锁   暗色 = 未解锁   亮点 = 玩家', {
      fontSize: '11px', color: '#777788', wordWrap: { width: W }
    })
    this.label(x, ly + 32, `世界: ${MAP_WIDTH}x${MAP_HEIGHT} 格 (1格=${TILE_SIZE}px)`, {
      fontSize: '11px', color: '#555566'
    })
  }

  private getPlayerPosition(): { x: number; y: number } | null {
    const player = this.getPlayer()
    if (player) {
      const p = player.get('position')
      if (p) return { x: p.x, y: p.y }
    }
    const save = saveManager.getSave()
    if (save) return { x: save.player.x, y: save.player.y }
    return null
  }

  // ---------- pause tab ----------

  private renderPause(): void {
    const x = this.contentX
    let y = this.contentY + 6
    const W = this.contentW

    this.label(x + W / 2, y, '暂停', { fontSize: '18px', color: '#ff9900' }, 0.5, 0)
    y += 34

    // difficulty stepper
    const rowH = 44
    const rg = this.add.graphics()
    rg.fillStyle(0x26264a, 1)
    rg.fillRoundedRect(x, y, W, rowH, 8)
    this.content?.add(rg)

    this.label(x + 12, y + rowH / 2, '难度系数', { fontSize: '14px', color: '#ffffff' }, 0, 0.5)

    const diffText = this.label(x + W / 2, y + rowH / 2, this.difficulty.toFixed(1), {
      fontSize: '16px', color: '#ffcc00'
    }, 0.5, 0.5)

    const stepBtn = (bx: number, sign: number) => {
      const c = this.add.container(bx, y + rowH / 2)
      const g = this.add.graphics()
      const draw = (hover: boolean) => {
        g.clear()
        g.fillStyle(hover ? 0x444477 : 0x333355, 1)
        g.fillRoundedRect(-22, -17, 44, 34, 8)
        g.lineStyle(2, hover ? 0xffcc00 : 0xff9900, 1)
        g.strokeRoundedRect(-22, -17, 44, 34, 8)
      }
      draw(false)
      const t = this.add.text(0, 0, sign > 0 ? '+' : '-', {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff'
      }).setOrigin(0.5, 0.5)
      c.add([g, t])
      c.setSize(44, 44)
      c.setInteractive(new Geom.Rectangle(-22, -22, 44, 44), Geom.Rectangle.Contains)
      c.on('pointerover', () => { t.setColor('#ffcc00'); draw(true) })
      c.on('pointerout', () => { t.setColor('#ffffff'); draw(false) })
      c.on('pointerdown', () => {
        const next = Math.round((this.difficulty + sign * 0.1) * 10) / 10
        this.difficulty = Math.max(DIFFICULTY.min, Math.min(DIFFICULTY.max, next))
        this.applyDifficulty()
        diffText.setText(this.difficulty.toFixed(1))
      })
      this.content?.add(c)
    }
    stepBtn(x + W - 100, -1)
    stepBtn(x + W - 30, 1)
    y += rowH + 12

    // action buttons
    const btnW = Math.min(260, W - 20)
    const btnH = 44
    const gap = 10

    this.makeButton(x + W / 2, y + btnH / 2, btnW, btnH, '保存游戏', () => this.saveGameNow())
    y += btnH + gap
    this.makeButton(x + W / 2, y + btnH / 2, btnW, btnH, '导出存档', () => this.exportSaveNow())
    y += btnH + gap
    this.makeButton(x + W / 2, y + btnH / 2, btnW, btnH, '导入存档', () => this.importSaveNow())
    y += btnH + gap
    this.makeButton(x + W / 2, y + btnH / 2, btnW, btnH, '返回主菜单', () => this.toMainMenu())
    y += btnH + gap
    this.makeButton(x + W / 2, y + btnH / 2, btnW, btnH, '继续游戏', () => this.closeUI())
  }

  private applyDifficulty(): void {
    const settings = saveManager.getSettings()
    saveManager.updateSettings({
      ...settings,
      gameplay: { ...settings.gameplay, difficulty: this.difficulty }
    })
    const save = saveManager.getSave()
    if (save) {
      saveManager.saveGame({
        world: { ...save.world, difficulty: this.difficulty }
      })
    }
  }

  private saveGameNow(): void {
    const player = this.getPlayer()
    const save = saveManager.getSave()
    if (!save) {
      alert('没有可用存档')
      return
    }
    if (!player) {
      alert('找不到玩家实体，无法保存')
      return
    }

    const pos = player.get('position')
    const health = player.get('health')
    const lv = player.get('level')
    const inv = player.get('inventory')
    const eq = player.get('equipment')
    const weapon = player.get('weapon')

    let weaponItem: ItemData | null = save.player.weapon
    if (weapon) {
      const wt = WEAPON_TYPES.includes(weapon.weaponType as any) ? weapon.weaponType : WEAPON_TYPES[0]
      const cfg = WEAPON_CONFIG[wt as typeof WEAPON_TYPES[number]]
      weaponItem = {
        id: `weapon_${wt}_${weapon.level}`, type: 'weapon', name: cfg.name,
        quality: weapon.quality, level: weapon.level,
        stats: { damage: weapon.baseDamage, attackSpeed: weapon.attackSpeed, range: weapon.range },
        bonds: [...weapon.bonds], icon: wt, stackable: false, count: 1
      }
    }

    saveManager.saveGame({
      player: {
        x: pos ? pos.x : save.player.x,
        y: pos ? pos.y : save.player.y,
        level: lv ? lv.level : save.player.level,
        exp: lv ? lv.exp : save.player.exp,
        gold: inv ? inv.gold : save.player.gold,
        hp: health ? health.hp : save.player.hp,
        maxHp: health ? health.maxHp : save.player.maxHp,
        attributes: lv ? { ...lv.attributes } : save.player.attributes,
        equipment: eq ? { ...eq.slots } : save.player.equipment,
        weapon: weaponItem,
        inventory: inv ? inv.items : save.player.inventory,
        unlockedRegions: save.player.unlockedRegions,
        discoveredTeleports: save.player.discoveredTeleports,
        completedQuests: save.player.completedQuests,
        activeQuest: save.player.activeQuest,
        killCount: save.player.killCount,
        playTime: save.player.playTime
      },
      world: { ...save.world, difficulty: this.difficulty }
    })
    alert('游戏已保存')
  }

  private exportSaveNow(): void {
    const b64 = saveManager.exportSave()
    if (!b64) {
      alert('没有可导出的存档')
      return
    }
    window.prompt('存档 Base64（复制保存）:', b64)
  }

  private importSaveNow(): void {
    const code = window.prompt('粘贴存档 Base64:')
    if (!code) return
    const ok = saveManager.importSave(code.trim())
    alert(ok ? '存档导入成功，请重新开始游戏以生效' : '存档导入失败：格式无效')
  }

  private toMainMenu(): void {
    this.scene.stop('Game')
    this.scene.start('MainMenu')
    this.scene.stop()
  }
}
