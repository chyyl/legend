import { REGIONS, RegionId, MAP_WIDTH, MAP_HEIGHT, CHUNK_SIZE, TILE_SIZE } from '../config/GameConfig'

export type TileType = 'grass' | 'dirt' | 'water' | 'mountain' | 'sand' | 'snow' | 'stone' | 'dark_grass' | 'farmland' | 'bridge' | 'volcanic' | 'castle_floor'

export interface ChunkData {
  x: number
  y: number
  tiles: Uint8Array
  entities: EntityData[]
  decorations: DecorationData[]
}

export interface EntityData {
  type: string
  x: number
  y: number
  properties: Record<string, any>
}

export interface DecorationData {
  type: string
  x: number
  y: number
  rotation: number
  scale: number
}

const TILE_MAP: Record<TileType, number> = {
  grass: 0, dirt: 1, water: 2, mountain: 3,
  sand: 4, snow: 5, stone: 6, dark_grass: 7,
  farmland: 8, bridge: 9, volcanic: 10, castle_floor: 11
}

const REVERSE_TILE_MAP: Record<number, TileType> = {}
Object.entries(TILE_MAP).forEach(([k, v]) => { REVERSE_TILE_MAP[v] = k as TileType })

const BIOME_TILES: Record<string, TileType[]> = {
  plains: ['grass', 'dirt'],
  mountains: ['mountain', 'stone', 'grass'],
  coastal: ['sand', 'water', 'grass'],
  farmland: ['farmland', 'dirt', 'grass'],
  dark_forest: ['dark_grass', 'dirt', 'stone'],
  industrial: ['stone', 'dirt', 'mountain'],
  snow: ['snow', 'mountain', 'stone'],
  ocean: ['water', 'sand'],
  volcanic: ['volcanic', 'stone', 'mountain'],
  dark_castle: ['castle_floor', 'stone', 'dark_grass'],
  final: ['volcanic', 'castle_floor', 'dark_grass']
}

const BIOME_WEIGHTS: Record<string, number[]> = {
  plains: [0.7, 0.3],
  mountains: [0.5, 0.3, 0.2],
  coastal: [0.3, 0.4, 0.3],
  farmland: [0.6, 0.2, 0.2],
  dark_forest: [0.6, 0.2, 0.2],
  industrial: [0.5, 0.3, 0.2],
  snow: [0.6, 0.3, 0.1],
  ocean: [0.8, 0.2],
  volcanic: [0.5, 0.3, 0.2],
  dark_castle: [0.4, 0.4, 0.2],
  final: [0.4, 0.4, 0.2]
}

class SeededRandom {
  private seed: number
  constructor(seed: string) {
    this.seed = this.hashString(seed)
  }
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash |= 0
    }
    return hash
  }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 0x100000000
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min
  }
}

function noise2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453
  return n - Math.floor(n)
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
  let value = 0
  let amplitude = 1
  let frequency = 1
  let maxValue = 0
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency, seed + i * 100)
    maxValue += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / maxValue
}

export class MapGenerator {
  private seed: string
  private random: SeededRandom
  private chunkCache: Map<string, ChunkData> = new Map()
  private regionGrid: Uint8Array

  constructor(seed: string) {
    this.seed = seed
    this.random = new SeededRandom(seed)
    this.regionGrid = new Uint8Array(MAP_WIDTH * MAP_HEIGHT)
    this.buildRegionMap()
  }

  private buildRegionMap() {
    // 0 = 无区域，其余为 REGIONS 索引 + 1（按格子坐标填充，O(1) 查询）
    REGIONS.forEach((region, index) => {
      const x0 = Math.max(0, region.x)
      const y0 = Math.max(0, region.y)
      const x1 = Math.min(MAP_WIDTH, region.x + region.width)
      const y1 = Math.min(MAP_HEIGHT, region.y + region.height)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          this.regionGrid[y * MAP_WIDTH + x] = index + 1
        }
      }
    })
  }

  getRegionAt(worldX: number, worldY: number): RegionId | null {
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) return null
    const idx = this.regionGrid[tileY * MAP_WIDTH + tileX]
    return idx > 0 ? REGIONS[idx - 1].id : null
  }

  getBiomeAt(worldX: number, worldY: number): string {
    const region = this.getRegionAt(worldX, worldY)
    if (region) {
      const r = REGIONS.find(reg => reg.id === region)
      return r?.biome || 'plains'
    }
    return 'plains'
  }

  generateChunk(chunkX: number, chunkY: number): ChunkData {
    const key = `${chunkX},${chunkY}`
    if (this.chunkCache.has(key)) {
      return this.chunkCache.get(key)!
    }

    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
    const entities: EntityData[] = []
    const decorations: DecorationData[] = []

    const region = this.getRegionAt(chunkX * CHUNK_SIZE * TILE_SIZE, chunkY * CHUNK_SIZE * TILE_SIZE)
    const biome = region ? REGIONS.find(r => r.id === region)?.biome || 'plains' : 'plains'
    const biomeTiles = BIOME_TILES[biome] || ['grass', 'dirt']
    const biomeWeights = BIOME_WEIGHTS[biome] || [1]

    const chunkSeedX = chunkX * CHUNK_SIZE
    const chunkSeedY = chunkY * CHUNK_SIZE

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const worldX = chunkSeedX + x
        const worldY = chunkSeedY + y

        const elevation = fbm(worldX * 0.005, worldY * 0.005, 4, this.random.nextInt(0, 1000))
        const moisture = fbm(worldX * 0.01, worldY * 0.01, 3, this.random.nextInt(0, 1000) + 500)
        const detail = fbm(worldX * 0.05, worldY * 0.05, 2, this.random.nextInt(0, 1000) + 1000)

        let tileType: TileType

        const distToCenter = Math.sqrt(
          Math.pow(worldX - MAP_WIDTH / 2, 2) + Math.pow(worldY - MAP_HEIGHT / 2, 2)
        )

        if (biome === 'ocean') {
          tileType = elevation < 0.3 ? 'water' : (elevation < 0.4 ? 'sand' : 'grass')
        } else if (biome === 'snow') {
          tileType = elevation > 0.6 ? 'mountain' : (elevation > 0.3 ? 'snow' : 'stone')
        } else if (biome === 'mountains') {
          tileType = elevation > 0.7 ? 'mountain' : (elevation > 0.4 ? 'stone' : 'grass')
        } else if (biome === 'volcanic') {
          tileType = elevation > 0.6 ? 'volcanic' : (elevation > 0.3 ? 'stone' : 'dark_grass')
        } else if (biome === 'coastal') {
          if (distToCenter > 1200) {
            tileType = elevation < 0.4 ? 'water' : 'sand'
          } else {
            tileType = biomeTiles[0]
          }
        } else {
          const tileIndex = Math.min(Math.floor(elevation * biomeTiles.length), biomeTiles.length - 1)
          tileType = biomeTiles[tileIndex]
        }

        if (detail > 0.85 && tileType !== 'water' && tileType !== 'mountain') {
          tileType = this.random.next() < 0.5 ? 'dirt' : 'stone'
        }

        tiles[y * CHUNK_SIZE + x] = TILE_MAP[tileType]

        if (this.random.next() < 0.02 && tileType !== 'water' && tileType !== 'mountain') {
          decorations.push({
            type: this.getRandomDecoration(biome),
            x: worldX * TILE_SIZE + this.random.nextFloat(-4, 4),
            y: worldY * TILE_SIZE + this.random.nextFloat(-4, 4),
            rotation: this.random.nextFloat(0, Math.PI * 2),
            scale: this.random.nextFloat(0.8, 1.2)
          })
        }
      }
    }

    this.addStructures(chunkX, chunkY, biome, entities, decorations)

    const chunk: ChunkData = { x: chunkX, y: chunkY, tiles, entities, decorations }
    this.chunkCache.set(key, chunk)
    return chunk
  }

  private addStructures(chunkX: number, chunkY: number, biome: string, entities: EntityData[], decorations: DecorationData[]) {
    const region = this.getRegionAt(chunkX * CHUNK_SIZE * TILE_SIZE, chunkY * CHUNK_SIZE * TILE_SIZE)
    if (!region) return

    const regionData = REGIONS.find(r => r.id === region)
    if (!regionData) return

    const chunkWorldX = chunkX * CHUNK_SIZE * TILE_SIZE
    const chunkWorldY = chunkY * CHUNK_SIZE * TILE_SIZE
    const centerX = (regionData.x + regionData.width / 2) * TILE_SIZE
    const centerY = (regionData.y + regionData.height / 2) * TILE_SIZE
    if (
      centerX >= chunkWorldX && centerX < chunkWorldX + CHUNK_SIZE * TILE_SIZE &&
      centerY >= chunkWorldY && centerY < chunkWorldY + CHUNK_SIZE * TILE_SIZE
    ) {
      if (region === 'camp') {
        entities.push({ type: 'npc', x: centerX, y: centerY, properties: { npcId: 'elder' } })
        entities.push({ type: 'teleport', x: centerX + 80, y: centerY, properties: { regionId: 'camp' } })
      }
      // 每个区域中心放一个传送门
      entities.push({ type: 'teleport', x: centerX, y: centerY + 80, properties: { regionId: regionData.id } })
    }

    if (this.random.next() < 0.001) {
      entities.push({
        type: 'chest',
        x: chunkX * CHUNK_SIZE * TILE_SIZE + this.random.nextInt(0, CHUNK_SIZE * TILE_SIZE),
        y: chunkY * CHUNK_SIZE * TILE_SIZE + this.random.nextInt(0, CHUNK_SIZE * TILE_SIZE),
        properties: { level: regionData.level }
      })
    }

    // 营地为安全区不刷怪；其他区域每个区块 2~4 个刷怪点
    if (region !== 'camp') {
      const spawnerCount = 2 + this.random.nextInt(0, 2)
      for (let i = 0; i < spawnerCount; i++) {
        const roll = this.random.next()
        const type = roll < 0.75 ? 'normal' : roll < 0.95 ? 'elite' : 'boss'
        entities.push({
          type: 'enemy_spawner',
          x: chunkX * CHUNK_SIZE * TILE_SIZE + this.random.nextInt(0, CHUNK_SIZE * TILE_SIZE),
          y: chunkY * CHUNK_SIZE * TILE_SIZE + this.random.nextInt(0, CHUNK_SIZE * TILE_SIZE),
          properties: { enemyType: type, level: regionData.level, biome }
        })
      }
    }
  }

  private getRandomDecoration(biome: string): string {
    const decorations: Record<string, string[]> = {
      plains: ['grass_tuft', 'flower', 'rock_small'],
      mountains: ['rock_large', 'boulder', 'pine_tree'],
      coastal: ['palm_tree', 'shell', 'driftwood'],
      farmland: ['crop', 'fence', 'hay_stack'],
      dark_forest: ['dead_tree', 'mushroom', 'skull'],
      industrial: ['pipe', 'crate', 'gear'],
      snow: ['pine_tree_snow', 'ice_rock', 'snow_drift'],
      ocean: ['coral', 'seaweed', 'rock_water'],
      volcanic: ['lava_rock', 'ash_pile', 'obsidian'],
      dark_castle: ['gargoyle', 'torch', 'bone_pile'],
      final: ['crystal', 'rift', 'bone_pile']
    }
    const list = decorations[biome] || decorations.plains
    return list[this.random.nextInt(0, list.length - 1)]
  }

  getChunk(chunkX: number, chunkY: number): ChunkData {
    return this.generateChunk(chunkX, chunkY)
  }

  getChunksInRadius(centerX: number, centerY: number, radiusChunks: number): ChunkData[] {
    const chunks: ChunkData[] = []
    const centerChunkX = Math.floor(centerX / (CHUNK_SIZE * TILE_SIZE))
    const centerChunkY = Math.floor(centerY / (CHUNK_SIZE * TILE_SIZE))

    for (let y = -radiusChunks; y <= radiusChunks; y++) {
      for (let x = -radiusChunks; x <= radiusChunks; x++) {
        chunks.push(this.getChunk(centerChunkX + x, centerChunkY + y))
      }
    }
    return chunks
  }

  isWalkable(worldX: number, worldY: number): boolean {
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    const chunkX = Math.floor(tileX / CHUNK_SIZE)
    const chunkY = Math.floor(tileY / CHUNK_SIZE)
    const chunk = this.getChunk(chunkX, chunkY)
    let localX = tileX % CHUNK_SIZE
    let localY = tileY % CHUNK_SIZE
    if (localX < 0) localX += CHUNK_SIZE
    if (localY < 0) localY += CHUNK_SIZE
    const tileIndex = chunk.tiles[localY * CHUNK_SIZE + localX]
    return tileIndex !== TILE_MAP.water && tileIndex !== TILE_MAP.mountain
  }

  getTileAt(worldX: number, worldY: number): TileType {
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    const chunkX = Math.floor(tileX / CHUNK_SIZE)
    const chunkY = Math.floor(tileY / CHUNK_SIZE)
    const chunk = this.getChunk(chunkX, chunkY)
    let localX = tileX % CHUNK_SIZE
    let localY = tileY % CHUNK_SIZE
    if (localX < 0) localX += CHUNK_SIZE
    if (localY < 0) localY += CHUNK_SIZE
    const tileIndex = chunk.tiles[localY * CHUNK_SIZE + localX]
    return REVERSE_TILE_MAP[tileIndex] || 'grass'
  }
}

export function createMapGenerator(seed: string): MapGenerator {
  return new MapGenerator(seed)
}