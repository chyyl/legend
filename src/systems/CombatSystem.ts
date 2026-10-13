import { World, System, Entity, ComponentType, ItemData } from '../ecs/ECS'
import { BONDS, BondId, WEAPON_CONFIG, WEAPON_QUALITY, EQUIPMENT_QUALITY, ENEMY_CONFIG, DIFFICULTY, PLAYER_MAX_LEVEL, EnemyType } from '../config/GameConfig'
import { MapGenerator } from './MapGenerator'
import { saveManager } from './SaveManager'

export class CombatSystem extends System {
  private mapGenerator: MapGenerator
  private damageNumbers: Map<string, {x: number, y: number, value: number, time: number, crit: boolean, text?: string}> = new Map()

  constructor(mapGenerator: MapGenerator) {
    super()
    this.mapGenerator = mapGenerator
  }

  update(delta: number) {
    this.updateDamageNumbers(delta)
    this.processAttacks(delta)
    this.processProjectiles(delta)
    this.processRegeneration(delta)
    this.processInvulnerability(delta)
  }

  private updateDamageNumbers(delta: number) {
    for (const [id, dmg] of this.damageNumbers) {
      dmg.time -= delta
      dmg.y -= delta * 0.05
      if (dmg.time <= 0) this.damageNumbers.delete(id)
    }
  }

  private processAttacks(delta: number) {
    const attackers = this.world.query('weapon', 'position', 'stats')
    for (const attacker of attackers) {
      const weapon = attacker.get('weapon')!
      const pos = attacker.get('position')!
      const stats = attacker.get('stats')!
      const now = Date.now()

      if (now - weapon.lastAttackTime < 1000 / (weapon.attackSpeed * stats.attackSpeed)) continue

      const input = attacker.get('input')
      if (!input || !input.attack) continue

      const targets = this.findTargetsInRange(attacker, weapon.range * stats.attackRange)
      if (targets.length === 0) continue

      weapon.lastAttackTime = now
      this.executeAttack(attacker, targets[0], weapon, stats)
    }
  }

  private findTargetsInRange(attacker: Entity, range: number): Entity[] {
    const pos = attacker.get('position')!
    const targets: Entity[] = []
    const entities = this.world.query('health', 'position', 'enemy')
    for (const entity of entities) {
      if (!entity.active) continue
      const targetPos = entity.get('position')!
      const dx = targetPos.x - pos.x
      const dy = targetPos.y - pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= range) targets.push(entity)
    }
    return targets.sort((a, b) => {
      const aPos = a.get('position')!
      const bPos = b.get('position')!
      const aDist = Math.pow(aPos.x - pos.x, 2) + Math.pow(aPos.y - pos.y, 2)
      const bDist = Math.pow(bPos.x - pos.x, 2) + Math.pow(bPos.y - pos.y, 2)
      return aDist - bDist
    })
  }

  private executeAttack(attacker: Entity, target: Entity, weapon: any, stats: any) {
    const targetHealth = target.get('health')!
    if (targetHealth.invulnerable) return

    let damage = weapon.baseDamage * stats.damage
    let isCrit = false

    if (Math.random() < stats.critChance) {
      damage *= stats.critMultiplier
      isCrit = true
    }

    if (Math.random() < stats.dodgeChance) {
      this.showDamageNumber(target, 'MISS', false)
      return
    }

    const targetEnemy = target.get('enemy')
    if (targetEnemy) {
      const enemyConfig = ENEMY_CONFIG[targetEnemy.enemyType]
      const dmgMul = Array.isArray(enemyConfig.dmgMul) ? (enemyConfig.dmgMul[0] + enemyConfig.dmgMul[1]) / 2 : enemyConfig.dmgMul
      damage *= dmgMul
    }

    const bonds = attacker.get('bonds')
    if (bonds) {
      damage = this.applyBondEffects(attacker, target, damage, bonds)
    }

    let actualDamage = Math.max(1, Math.floor(damage - targetHealth.maxHp * 0.01))

    // 难度系数影响敌人对玩家造成的伤害（0.9 -> 0.95x，2 -> 1.5x，0 -> 0.5x）
    if (attacker.get('enemy') && target.get('player')) {
      const difficulty = saveManager.getSettings().gameplay.difficulty ?? DIFFICULTY.default
      actualDamage = Math.max(1, Math.floor(actualDamage * (0.5 + difficulty * 0.5)))
    }

    targetHealth.hp = Math.max(0, targetHealth.hp - actualDamage)
    targetHealth.lastDamageSource = attacker.id
    targetHealth.invulnerable = true
    targetHealth.invulnTimer = 200

    this.showDamageNumber(target, actualDamage, isCrit)

    if (stats.lifesteal > 0) {
      const attackerHealth = attacker.get('health')
      if (attackerHealth) {
        const heal = Math.floor(actualDamage * stats.lifesteal)
        attackerHealth.hp = Math.min(attackerHealth.maxHp, attackerHealth.hp + heal)
      }
    }

    if (targetHealth.hp <= 0) {
      this.onKill(attacker, target)
      // 尸体不再留在世界里挡路/被查询到
      if (target.get('enemy')) {
        this.world.removeEntity(target.id)
      }
    }
  }

  private applyBondEffects(attacker: Entity, target: Entity, damage: number, bonds: any): number {
    let finalDamage = damage
    for (const [bondId, bondData] of bonds.active) {
      const bond = BONDS.find(b => b.id === bondId)
      if (!bond) continue

      switch (bond.type) {
        case 'damage':
          finalDamage *= (1 + bond.value)
          break
        case 'damage_speed':
          finalDamage *= (1 + bond.value)
          break
        case 'crit':
          if (Math.random() < bond.value) finalDamage *= 3
          break
        case 'lifesteal':
          // handled in executeAttack
          break
        case 'undying':
          // handled in health system
          break
      }
    }
    return finalDamage
  }

  private showDamageNumber(target: Entity, value: number | string, crit: boolean) {
    const pos = target.get('position')!
    const id = `${target.id}_${Date.now()}`
    this.damageNumbers.set(id, {
      x: pos.x + (Math.random() - 0.5) * 20,
      y: pos.y - 20,
      value: typeof value === 'number' ? value : 0,
      time: 1000,
      crit,
      text: typeof value === 'string' ? value : undefined
    })
  }

  private onKill(killer: Entity, victim: Entity) {
    const victimEnemy = victim.get('enemy')
    const killerLevel = killer.get('level')
    const killerStats = killer.get('stats')

    if (victimEnemy && killerLevel) {
      const enemyConfig = ENEMY_CONFIG[victimEnemy.enemyType]
      const baseExp = victimEnemy.level * 10 * enemyConfig.expMul
      const baseGold = victimEnemy.level * 10 * enemyConfig.goldMul
      const difficulty = saveManager.getSettings().gameplay.difficulty ?? DIFFICULTY.default

      let exp = baseExp * difficulty * (killerStats?.expMultiplier || 1)
      let gold = baseGold * difficulty * (killerStats?.goldMultiplier || 1)

      killerLevel.exp += Math.floor(exp)
      const inventory = killer.get('inventory')
      if (inventory) inventory.gold += Math.floor(gold)

      this.checkLevelUp(killer)

      this.rollDrops(killer, victimEnemy)
    }
  }

  private checkLevelUp(entity: Entity) {
    const level = entity.get('level')!
    if (level.level >= PLAYER_MAX_LEVEL) return
    const expToNext = Math.floor(100 * Math.pow(1.5, level.level - 1))
    if (level.exp >= expToNext) {
      level.level++
      level.exp -= expToNext
      level.attributePoints += 3
      const health = entity.get('health')
      if (health) {
        health.maxHp += 10 + level.attributes.vitality * 2
        health.hp = health.maxHp
      }
    }
  }

  private rollDrops(killer: Entity, victimEnemy: any) {
    const inventory = killer.get('inventory')
    if (!inventory) return

    for (const drop of victimEnemy.drops) {
      if (Math.random() < drop.chance) {
        const count = Math.floor(Math.random() * (drop.maxCount - drop.minCount + 1)) + drop.minCount
        for (let i = 0; i < count; i++) {
          this.generateDrop(inventory, victimEnemy.level, victimEnemy.enemyType)
        }
      }
    }
  }

  private generateDrop(inventory: any, enemyLevel: number, enemyType: EnemyType) {
    const quality = this.rollQuality()
    const damage = Math.round((5 + enemyLevel * 2) * quality.damageMul)

    const item: ItemData = {
      id: `drop_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      type: 'weapon',
      name: '铁刃',           // 暂时统一叫铁刃，quality.id 区分
      quality: quality.id,     // 'N'|'R'|'SR'|'SSR'
      level: enemyLevel,
      stats: { damage, attackSpeed: 1.2, range: 32 },
      bonds: [],
      icon: 'iron_blade',
      stackable: false,
      count: 1
    }

    this.rollBonds(item, quality, enemyType)
    inventory.items.push(item)
  }

  /** 按 WEAPON_QUALITY.chance 加权 roll 品质（N=0.80, R=0.15, SR=0.035, SSR=0.015） */
  private rollQuality(): (typeof WEAPON_QUALITY)[number] {
    let roll = Math.random()
    for (const quality of WEAPON_QUALITY) {
      if (roll < quality.chance) return quality
      roll -= quality.chance
    }
    return WEAPON_QUALITY[WEAPON_QUALITY.length - 1]
  }

  /** 按品质 bondRange 附 0~N 个不重复羁绊；bondChance 成功则额外附 1 个 */
  private rollBonds(item: ItemData, quality: (typeof WEAPON_QUALITY)[number], enemyType: EnemyType) {
    const min = quality.bondRange[0]
    const max = quality.bondRange[1]
    const bondCount = max > min ? min + Math.floor(Math.random() * (max - min + 1)) : min

    const pool: string[] = BONDS.map(b => b.id)
    for (let i = 0; i < bondCount && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length)
      item.bonds.push(pool.splice(idx, 1)[0])
    }

    // 额外掉落一个羁绊物品（bondRange 为 0 时也保证至少有 1 个羁绊）
    if (Math.random() < ENEMY_CONFIG[enemyType].bondChance && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length)
      item.bonds.push(pool[idx])
    }
  }

  private processProjectiles(delta: number) {
    const projectiles = this.world.query('projectile', 'position', 'velocity')
    for (const proj of projectiles) {
      const projectile = proj.get('projectile')!
      const pos = proj.get('position')!
      const vel = proj.get('velocity')!

      projectile.traveled += Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy) * delta / 1000
      if (projectile.traveled >= projectile.range) {
        this.world.removeEntity(proj.id)
        continue
      }

      const targets = this.world.query('health', 'position', 'enemy')
      for (const target of targets) {
        if (projectile.hitEntities.has(target.id)) continue
        const targetPos = target.get('position')!
        const dx = targetPos.x - pos.x
        const dy = targetPos.y - pos.y
        if (dx * dx + dy * dy < 400) {
          projectile.hitEntities.add(target.id)
          const targetHealth = target.get('health')!
          targetHealth.hp = Math.max(0, targetHealth.hp - projectile.damage)
          
          if (projectile.onHit === 'lifesteal') {
            const owner = this.world.entities.get(projectile.owner)
            if (owner) {
              const ownerHealth = owner.get('health')
              if (ownerHealth) ownerHealth.hp = Math.min(ownerHealth.maxHp, ownerHealth.hp + projectile.damage * 0.05)
            }
          }

          if (projectile.pierce <= 0 || projectile.onHit === 'explode') {
            this.world.removeEntity(proj.id)
          } else {
            projectile.pierce--
          }
          break
        }
      }
    }
  }

  private processRegeneration(delta: number) {
    const entities = this.world.query('health')
    for (const entity of entities) {
      const health = entity.get('health')!
      if (health.hp > 0 && health.hp < health.maxHp && health.regen > 0) {
        health.hp = Math.min(health.maxHp, health.hp + health.regen * delta / 1000)
      }
    }
  }

  private processInvulnerability(delta: number) {
    const entities = this.world.query('health')
    for (const entity of entities) {
      const health = entity.get('health')!
      if (health.invulnerable) {
        health.invulnTimer -= delta
        if (health.invulnTimer <= 0) health.invulnerable = false
      }
    }
  }

  getDamageNumbers() {
    return Array.from(this.damageNumbers.values())
  }
}