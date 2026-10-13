import { World, System, Entity, AIComponent, PositionComponent } from '../ecs/ECS'
import { MapGenerator } from './MapGenerator'
import { saveManager } from './SaveManager'
import { DIFFICULTY } from '../config/GameConfig'

export class AISystem extends System {
  private mapGenerator: MapGenerator

  constructor(mapGenerator: MapGenerator) {
    super()
    this.mapGenerator = mapGenerator
  }

  update(delta: number) {
    const entities = this.world.query('ai', 'position', 'velocity', 'stats', 'health')
    for (const entity of entities) {
      const ai = entity.get('ai')!
      const pos = entity.get('position')!
      const vel = entity.get('velocity')!
      const stats = entity.get('stats')!
      const health = entity.get('health')!

      if (health.hp <= 0) continue

      // ai.target 从未被赋值 -> 敌人永远 idle 闲逛。这里持续尝试锁定最近的玩家。
      this.acquireTarget(ai, pos)

      ai.decisionTimer -= delta
      this.updateAI(entity, ai, pos, vel, stats, delta)
    }
  }

  private acquireTarget(ai: AIComponent, pos: PositionComponent) {
    // 已有有效目标则沿用
    const current = ai.target ? this.world.entities.get(ai.target) : null
    if (current && current.active && current.has('position')) return

    ai.target = null

    const players = this.world.query('player', 'position')
    let nearest: Entity | null = null
    let nearestDistSq = Infinity
    for (const player of players) {
      if (!player.active) continue
      const playerPos = player.get('position')!
      const dx = playerPos.x - pos.x
      const dy = playerPos.y - pos.y
      const distSq = dx * dx + dy * dy
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearest = player
      }
    }

    if (nearest && nearestDistSq < ai.aggroRange * ai.aggroRange) {
      ai.target = nearest.id
      ai.state = 'chase'
    }
  }

  private updateAI(entity: Entity, ai: any, pos: any, vel: any, stats: any, delta: number) {
    const targetEntity = ai.target ? this.world.entities.get(ai.target) : null
    const targetPos = targetEntity?.get('position')

    switch (ai.state) {
      case 'idle':
        if (targetPos && this.inRange(pos, targetPos, ai.aggroRange)) {
          ai.state = 'chase'
        } else if (ai.decisionTimer <= 0) {
          this.randomMovement(entity, vel, stats)
          ai.decisionTimer = 2000 + Math.random() * 3000
        }
        break

      case 'chase':
        if (!targetPos || !this.inRange(pos, targetPos, ai.aggroRange * 1.5)) {
          ai.state = 'idle'
          ai.target = null
          break
        }
        this.moveTowards(pos, vel, targetPos, stats.moveSpeed)
        
        if (this.inRange(pos, targetPos, ai.attackRange)) {
          ai.state = 'attack'
        }
        break

      case 'attack':
        if (!targetPos || !this.inRange(pos, targetPos, ai.attackRange * 1.2)) {
          ai.state = 'chase'
          break
        }
        vel.vx = 0
        vel.vy = 0
        
        const now = Date.now()
        if (now - ai.lastAttackTime > 1000) {
          ai.lastAttackTime = now
          this.executeAttack(entity, targetEntity!)
        }
        break

      case 'flee':
        if (targetPos) {
          this.moveAway(pos, vel, targetPos, stats.moveSpeed * 1.2)
        }
        if (ai.decisionTimer <= 0) ai.state = 'idle'
        break

      case 'patrol':
        if (ai.patrolPoints.length > 0) {
          const target = ai.patrolPoints[ai.patrolIndex]
          this.moveTowards(pos, vel, target, stats.moveSpeed * 0.5)
          if (this.inRange(pos, target, 20)) {
            ai.patrolIndex = (ai.patrolIndex + 1) % ai.patrolPoints.length
          }
        }
        if (targetPos && this.inRange(pos, targetPos, ai.aggroRange)) {
          ai.state = 'chase'
        }
        break
    }
  }

  private inRange(a: any, b: any, range: number): boolean {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return dx * dx + dy * dy <= range * range
  }

  private moveTowards(pos: any, vel: any, target: any, speed: number) {
    const dx = target.x - pos.x
    const dy = target.y - pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 0) {
      vel.vx = (dx / dist) * speed
      vel.vy = (dy / dist) * speed
    }
  }

  private moveAway(pos: any, vel: any, target: any, speed: number) {
    const dx = pos.x - target.x
    const dy = pos.y - target.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 0) {
      vel.vx = (dx / dist) * speed
      vel.vy = (dy / dist) * speed
    }
  }

  private randomMovement(entity: Entity, vel: any, stats: any) {
    const angle = Math.random() * Math.PI * 2
    vel.vx = Math.cos(angle) * stats.moveSpeed * 0.3
    vel.vy = Math.sin(angle) * stats.moveSpeed * 0.3
  }

  private executeAttack(attacker: Entity, target: Entity) {
    const targetHealth = target.get('health')
    const attackerStats = attacker.get('stats')
    if (!targetHealth || !attackerStats) return
    // 无敌帧内不结算伤害
    if (targetHealth.invulnerable) return

    let damage = attackerStats.damage
    if (Math.random() < attackerStats.critChance) {
      damage *= attackerStats.critMultiplier
    }

    // 玩家受击：先减防御，再按难度系数缩放（0 → 0.5倍，0.9 → 0.95倍，2 → 1.5倍）
    if (target.get('player')) {
      const targetStats = target.get('stats')
      damage = Math.max(1, damage - (targetStats?.defense || 0))
      const difficulty = saveManager.getSettings().gameplay.difficulty ?? DIFFICULTY.default
      damage = Math.max(1, Math.floor(damage * (0.5 + difficulty * 0.5)))
    }

    targetHealth.hp = Math.max(0, targetHealth.hp - damage)
    targetHealth.lastDamageSource = attacker.id
    targetHealth.invulnerable = true
    targetHealth.invulnTimer = 200
  }
}

export class MovementSystem extends System {
  private mapGenerator: MapGenerator

  constructor(mapGenerator: MapGenerator) {
    super()
    this.mapGenerator = mapGenerator
  }

  update(delta: number) {
    const entities = this.world.query('position', 'velocity')
    for (const entity of entities) {
      const pos = entity.get('position')!
      const vel = entity.get('velocity')!

      if (vel.vx !== 0 || vel.vy !== 0) {
        const newX = pos.x + vel.vx * delta / 1000
        const newY = pos.y + vel.vy * delta / 1000

        if (this.mapGenerator.isWalkable(newX, pos.y)) {
          pos.x = newX
        } else {
          vel.vx = 0
        }

        if (this.mapGenerator.isWalkable(pos.x, newY)) {
          pos.y = newY
        } else {
          vel.vy = 0
        }
      }

      // drag 语义：每 60fps 帧的衰减系数（0.95/帧 ≈ 0.046/秒），按实际 delta 归一化
      vel.vx *= Math.pow(vel.drag, (delta / 1000) * 60)
      vel.vy *= Math.pow(vel.drag, (delta / 1000) * 60)

      if (Math.abs(vel.vx) < 0.1) vel.vx = 0
      if (Math.abs(vel.vy) < 0.1) vel.vy = 0
    }
  }
}

export class InputSystem extends System {
  private keys: Map<string, boolean> = new Map()
  private touchState: { active: boolean, x: number, y: number, id: number } = { active: false, x: 0, y: 0, id: -1 }
  private mouseAttack = false
  private touchAttack = false

  constructor() {
    super()
    this.setupListeners()
  }

  setTouchAttack(v: boolean) {
    this.touchAttack = v
  }

  private setupListeners() {
    window.addEventListener('keydown', e => this.keys.set(e.code, true))
    window.addEventListener('keyup', e => this.keys.set(e.code, false))
    window.addEventListener('blur', () => this.keys.clear())

    const canvas = document.querySelector('canvas')
    if (canvas) {
      canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false })
      canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false })
      canvas.addEventListener('touchend', this.onTouchEnd.bind(this))
      canvas.addEventListener('contextmenu', e => e.preventDefault())
      canvas.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button === 2) this.mouseAttack = true
      })
      window.addEventListener('pointerup', (e: PointerEvent) => {
        if (e.button === 2) this.mouseAttack = false
      })
    }
  }

  private onTouchStart(e: TouchEvent) {
    e.preventDefault()
    const touch = e.changedTouches[0]
    // 右下角为攻击按钮区域，不作为移动摇杆
    if (touch.clientX > window.innerWidth * 0.65 && touch.clientY > window.innerHeight * 0.65) return
    this.touchState = { active: true, x: touch.clientX, y: touch.clientY, id: touch.identifier }
  }

  private onTouchMove(e: TouchEvent) {
    e.preventDefault()
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.touchState.id) {
        this.touchState.x = touch.clientX
        this.touchState.y = touch.clientY
      }
    }
  }

  private onTouchEnd(e: TouchEvent) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.touchState.id) {
        this.touchState.active = false
      }
    }
  }

  update(delta: number) {
    const entities = this.world.query('input', 'position', 'velocity')
    for (const entity of entities) {
      const input = entity.get('input')!
      const vel = entity.get('velocity')!

      input.up = this.keys.get('KeyW') || this.keys.get('ArrowUp') || false
      input.down = this.keys.get('KeyS') || this.keys.get('ArrowDown') || false
      input.left = this.keys.get('KeyA') || this.keys.get('ArrowLeft') || false
      input.right = this.keys.get('KeyD') || this.keys.get('ArrowRight') || false
      input.attack = this.keys.get('Space') || this.keys.get('ShiftLeft') || this.mouseAttack || this.touchAttack || false
      input.interact = this.keys.get('KeyE') || this.keys.get('Enter') || false
      input.dodge = this.keys.get('ShiftLeft') || this.keys.get('ControlLeft') || false
      input.menu = this.keys.get('Escape') || this.keys.get('Tab') || false

      if (this.touchState.active) {
        const canvas = document.querySelector('canvas')
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          input.aimX = this.touchState.x - centerX
          input.aimY = this.touchState.y - centerY
          
          const dist = Math.sqrt(input.aimX * input.aimX + input.aimY * input.aimY)
          if (dist > 50) {
            input.up = input.aimY < -30
            input.down = input.aimY > 30
            input.left = input.aimX < -30
            input.right = input.aimX > 30
          }
        }
      } else {
        input.aimX = 0
        input.aimY = 0
      }

      const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      const moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0)
      
      if (moveX !== 0 || moveY !== 0) {
        const len = Math.sqrt(moveX * moveX + moveY * moveY)
        vel.vx = (moveX / len) * vel.maxSpeed
        vel.vy = (moveY / len) * vel.maxSpeed
      }
    }
  }
}