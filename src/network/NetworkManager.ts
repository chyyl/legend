import { Client, Room } from 'colyseus.js'

export interface PlayerState {
  id: string
  name: string
  x: number
  y: number
  hp: number
  maxHp: number
  level: number
  weapon: string
  skin: string
  isHost: boolean
}

export interface GameState {
  players: Map<string, PlayerState>
  enemies: Map<string, any>
  drops: Map<string, any>
  region: string
  difficulty: number
}

type NetworkCallback = (data: any) => void

class NetworkManager {
  private client: Client | null = null
  private room: Room<GameState> | null = null
  private playerId: string = ''
  private playerName: string = ''
  private callbacks: Map<string, NetworkCallback[]> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private serverUrl = ''

  async init() {
    this.serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://legend-server.fly.dev'
    this.client = new Client(this.serverUrl)
  }

  async createRoom(name: string, difficulty: number, maxPlayers: number = 4): Promise<Room<GameState> | null> {
    if (!this.client) await this.init()
    this.playerName = name

    try {
      this.room = await this.client!.create('legend', {
        name,
        difficulty,
        maxPlayers,
        isHost: true
      })
      this.setupRoomListeners()
      this.playerId = this.room.sessionId
      this.reconnectAttempts = 0
      return this.room
    } catch (e) {
      console.error('Create room failed:', e)
      return null
    }
  }

  async joinRoom(roomId: string, name: string): Promise<Room<GameState> | null> {
    if (!this.client) await this.init()
    this.playerName = name

    try {
      this.room = await this.client!.joinById(roomId, { name })
      this.setupRoomListeners()
      this.playerId = this.room.sessionId
      this.reconnectAttempts = 0
      return this.room
    } catch (e) {
      console.error('Join room failed:', e)
      return null
    }
  }

  async joinRandom(name: string): Promise<Room<GameState> | null> {
    if (!this.client) await this.init()
    this.playerName = name

    try {
      this.room = await this.client!.joinOrCreate('legend', { name, random: true })
      this.setupRoomListeners()
      this.playerId = this.room.sessionId
      this.reconnectAttempts = 0
      return this.room
    } catch (e) {
      console.error('Join random failed:', e)
      return null
    }
  }

  private setupRoomListeners() {
    if (!this.room) return

    this.room.onStateChange((state) => {
      this.emit('stateChange', state)
    })

    this.room.onMessage('playerJoined', (data) => {
      this.emit('playerJoined', data)
    })

    this.room.onMessage('playerLeft', (data) => {
      this.emit('playerLeft', data)
    })

    this.room.onMessage('chat', (data) => {
      this.emit('chat', data)
    })

    this.room.onMessage('dropItem', (data) => {
      this.emit('dropItem', data)
    })

    this.room.onMessage('pickupItem', (data) => {
      this.emit('pickupItem', data)
    })

    this.room.onMessage('enemySync', (data) => {
      this.emit('enemySync', data)
    })

    this.room.onError((code, message) => {
      console.error('Room error:', code, message)
      this.emit('error', { code, message })
    })

    this.room.onLeave((code) => {
      console.log('Left room:', code)
      this.emit('leave', { code })
      this.attemptReconnect()
    })
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        if (this.room) {
          this.room.reconnect().catch(() => this.attemptReconnect())
        }
      }, 2000 * this.reconnectAttempts)
    }
  }

  send(type: string, data: any) {
    if (this.room?.connection?.isOpen) {
      this.room.send(type, data)
    }
  }

  sendPosition(x: number, y: number) {
    this.send('move', { x, y })
  }

  sendAttack(targetId: string, damage: number) {
    this.send('attack', { targetId, damage })
  }

  sendChat(message: string) {
    this.send('chat', { message })
  }

  sendDropItem(item: any, x: number, y: number) {
    this.send('dropItem', { item, x, y })
  }

  sendPickupItem(dropId: string) {
    this.send('pickupItem', { dropId })
  }

  on(event: string, callback: NetworkCallback) {
    if (!this.callbacks.has(event)) this.callbacks.set(event, [])
    this.callbacks.get(event)!.push(callback)
  }

  off(event: string, callback: NetworkCallback) {
    const list = this.callbacks.get(event)
    if (list) {
      const idx = list.indexOf(callback)
      if (idx >= 0) list.splice(idx, 1)
    }
  }

  private emit(event: string, data: any) {
    this.callbacks.get(event)?.forEach(cb => cb(data))
  }

  leave() {
    if (this.room) {
      this.room.leave()
      this.room = null
    }
  }

  getRoom(): Room<GameState> | null {
    return this.room
  }

  getPlayerId(): string {
    return this.playerId
  }

  getPlayerName(): string {
    return this.playerName
  }

  isConnected(): boolean {
    return this.room?.connection?.isOpen ?? false
  }

  isHost(): boolean {
    return this.room?.sessionId === this.playerId && this.room?.state?.players?.get(this.playerId)?.isHost
  }

  getPlayers(): PlayerState[] {
    if (!this.room?.state?.players) return []
    return Array.from(this.room.state.players.values())
  }
}

export const networkManager = new NetworkManager()