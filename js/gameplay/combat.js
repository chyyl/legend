/**
 * Combat System — Attack/Dash/Hitbox, No Skills
 * Real-time action: LMB attack, RMB/Shift dash, E interact
 */

export const COMBAT_EVENTS = {
  ATTACK: 'attack',
  HIT: 'hit',
  KILL: 'kill',
  DASH: 'dash',
  DASH_END: 'dash_end',
  DEATH: 'death'
};

export const DAMAGE_TYPES = {
  PHYSICAL: 'physical',
  FIRE: 'fire',
  COLD: 'cold',
  LIGHTNING: 'lightning',
  POISON: 'poison'
};

export function createCombatSystem(opts = {}) {
  const { player, entities, audio, rng } = opts;

  // Combat constants
  const ATTACK_COOLDOWN = 350; // ms
  const ATTACK_RANGE = 28;
  const ATTACK_ANGLE = Math.PI / 3; // 60 degrees cone
  const ATTACK_KNOCKBACK = 80;
  const DASH_DURATION = 200;
  const DASH_SPEED = 400;
  const DASH_COOLDOWN = 800;
  const DASH_IFRAMES = 150;
  const INTERACT_RANGE = 20;

  // State
  let lastAttackTime = -ATTACK_COOLDOWN;
  let lastDashTime = -DASH_COOLDOWN;
  let isDashing = false;
  let dashEndTime = 0;
  let dashDirection = { x: 0, y: 0 };
  let dashStartPos = { x: 0, y: 0 };

  // Damage numbers for display
  const damageNumbers = [];

  function canAttack(now) {
    return now - lastAttackTime >= ATTACK_COOLDOWN;
  }

  function canDash(now) {
    return now - lastDashTime >= DASH_COOLDOWN && !isDashing;
  }

  function tryAttack(now, inputDir) {
    if (!canAttack(now)) return null;

    lastAttackTime = now;

    // Determine attack direction (mouse or input)
    let dirX = 0, dirY = -1; // default up
    if (inputDir) {
      dirX = inputDir.x;
      dirY = inputDir.y;
    } else if (player) {
      // Face movement direction or last input
      dirX = player.lastMoveX || 0;
      dirY = player.lastMoveY || -1;
    }
    const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= len; dirY /= len;

    // Attack hitbox: cone in front of player
    const px = player ? player.x : 0;
    const py = player ? player.y : 0;
    const hitbox = {
      x: px + dirX * 12,
      y: py + dirY * 12,
      range: ATTACK_RANGE,
      angle: Math.atan2(dirY, dirX),
      spread: ATTACK_ANGLE,
      damage: getPlayerDamage(),
      knockback: ATTACK_KNOCKBACK,
      source: 'player',
      type: DAMAGE_TYPES.PHYSICAL
    };

    // Find targets in cone
    const targets = [];
    for (const entity of entities) {
      if (!entity.alive || entity === player) continue;
      if (entity.invulnerable) continue;

      const dx = entity.x - hitbox.x;
      const dy = entity.y - hitbox.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hitbox.range + (entity.radius || 12)) {
        // Check angle
        const targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - hitbox.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) <= hitbox.spread / 2) {
          targets.push({ entity, dist, dx, dy });
        }
      }
    }

    // Sort by distance
    targets.sort((a, b) => a.dist - b.dist);

    // Apply damage to targets (max 3 for cleave)
    const results = [];
    for (let i = 0; i < Math.min(3, targets.length); i++) {
      const { entity, dx, dy } = targets[i];
      const result = applyDamage(entity, hitbox, dx, dy, i === 0);
      results.push(result);
    }

    // Audio & visual feedback
    if (audio) {
      audio.playSFX(targets.length > 0 ? 'hit' : 'attack', {
        volume: targets.length > 0 ? 0.5 : 0.3,
        pitch: 1 + (rng?.next() || 0) * 0.1
      });
    }

    emit(COMBAT_EVENTS.ATTACK, { hitbox, targets: results });
    return { hitbox, results };
  }

  function applyDamage(target, hitbox, dx, dy, isPrimary) {
    let damage = hitbox.damage;

    // Primary target gets full damage, others reduced
    if (!isPrimary) damage *= 0.6;

    // Crit chance (based on player stats)
    const isCrit = (rng?.next() || Math.random()) < (player?.critChance || 0.05);
    if (isCrit) damage *= 2;

    // Damage variance ±10%
    damage *= 0.9 + (rng?.next() || Math.random()) * 0.2;
    damage = Math.max(1, Math.floor(damage));

    // Apply to target
    const actualDamage = target.takeDamage ? target.takeDamage(damage, hitbox.type, hitbox.source) : damage;

    // Knockback
    const kbDist = hitbox.knockback * (isPrimary ? 1 : 0.5);
    if (target.applyKnockback) {
      target.applyKnockback(dx, dy, kbDist);
    }

    // Hit effects
    if (audio) {
      audio.playSFX(isCrit ? 'hit_crit' : 'hit', {
        volume: 0.4,
        pitch: isCrit ? 1.2 : 1
      });
    }

    // Damage number
    damageNumbers.push({
      x: target.x,
      y: target.y - 20,
      value: actualDamage,
      crit: isCrit,
      time: Date.now(),
      duration: 800
    });

    // Events
    emit(COMBAT_EVENTS.HIT, { target, damage: actualDamage, crit: isCrit, source: hitbox.source });

    if (!target.alive || (target.health <= 0)) {
      emit(COMBAT_EVENTS.KILL, { target, killer: player });
    }

    return { target, damage: actualDamage, crit: isCrit, killed: !target.alive };
  }

  function getPlayerDamage() {
    if (!player) return 10;
    const base = player.stats?.attack || 10;
    const weapon = player.equipment?.weapon?.damage || 0;
    return base + weapon;
  }

  function tryDash(now, dirX, dirY) {
    if (!canDash(now) || !player) return false;

    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 0.1) return false;

    lastDashTime = now;
    isDashing = true;
    dashEndTime = now + DASH_DURATION;
    dashDirection = { x: dirX / len, y: dirY / len };
    dashStartPos = { x: player.x, y: player.y };

    // Invulnerability frames
    player.invulnerable = true;
    setTimeout(() => { if (player) player.invulnerable = false; }, DASH_IFRAMES);

    if (audio) audio.playSFX('dash', { volume: 0.3 });
    emit(COMBAT_EVENTS.DASH, { direction: dashDirection });
    return true;
  }

  function updateDash(now) {
    if (!isDashing || !player) return;

    if (now >= dashEndTime) {
      isDashing = false;
      player.invulnerable = false;
      emit(COMBAT_EVENTS.DASH_END, { position: { x: player.x, y: player.y } });
      return;
    }

    // Move player during dash
    const progress = (now - (dashEndTime - DASH_DURATION)) / DASH_DURATION;
    const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic
    const dashDist = DASH_SPEED * DASH_DURATION / 1000;
    player.x = dashStartPos.x + dashDirection.x * dashDist * eased;
    player.y = dashStartPos.y + dashDirection.y * dashDist * eased;
  }

  function tryInteract() {
    if (!player) return null;

    // Find nearest interactable
    let nearest = null;
    let nearestDist = INTERACT_RANGE;

    for (const entity of entities) {
      if (!entity.interactable) continue;
      const dx = entity.x - player.x;
      const dy = entity.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = entity;
      }
    }

    if (nearest) {
      if (audio) audio.playSFX(nearest.interactSound || 'interact', { volume: 0.4 });
      return nearest.interact ? nearest.interact(player) : true;
    }

    return null;
  }

  function update(dt, now) {
    updateDash(now);
    updateDamageNumbers(now);
  }

  function updateDamageNumbers(now) {
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      if (now - dn.time > dn.duration) {
        damageNumbers.splice(i, 1);
      }
    }
  }

  function getDamageNumbers() {
    return damageNumbers;
  }

  function getAttackCooldownRemaining(now) {
    return Math.max(0, ATTACK_COOLDOWN - (now - lastAttackTime));
  }

  function getDashCooldownRemaining(now) {
    return Math.max(0, DASH_COOLDOWN - (now - lastDashTime));
  }

  function isDashingNow() {
    return isDashing;
  }

  // Event system
  const listeners = new Map();
  function on(event, cb) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(cb); }
  function off(event, cb) { const arr = listeners.get(event); if (arr) arr.splice(arr.indexOf(cb), 1); }
  function emit(event, data) { const arr = listeners.get(event); if (arr) arr.forEach(cb => cb(data)); }

  return {
    tryAttack,
    tryDash,
    tryInteract,
    update,
    getDamageNumbers,
    getAttackCooldownRemaining,
    getDashCooldownRemaining,
    isDashingNow,
    on,
    off,
    ATTACK_COOLDOWN,
    DASH_COOLDOWN,
    ATTACK_RANGE,
    INTERACT_RANGE,
    COMBAT_EVENTS,
    DAMAGE_TYPES
  };
}

// Simple entity mixin for damage handling
export function createCombatEntity(base = {}) {
  return {
    ...base,
    health: base.maxHealth || 100,
    maxHealth: base.maxHealth || 100,
    alive: true,
    invulnerable: false,
    knockback: { x: 0, y: 0, time: 0 },

    takeDamage(amount, type, source) {
      if (this.invulnerable || !this.alive) return 0;
      const actual = Math.min(this.health, amount);
      this.health -= actual;
      if (this.health <= 0) {
        this.health = 0;
        this.alive = false;
        this.onDeath?.(source);
      }
      this.onHit?.(actual, type, source);
      return actual;
    },

    applyKnockback(dx, dy, force) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      this.knockback = {
        x: (dx / len) * force,
        y: (dy / len) * force,
        time: 200 // ms
      };
    },

    updateKnockback(dt) {
      if (this.knockback.time > 0) {
        this.knockback.time -= dt;
        const factor = this.knockback.time / 200;
        this.x += this.knockback.x * factor * dt / 1000;
        this.y += this.knockback.y * factor * dt / 1000;
      }
    }
  };
}