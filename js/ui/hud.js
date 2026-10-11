/**
 * HUD — Minimap (Zoomable), Health, Radial Trigger
 * Settings: minimap zoom, position, size
 */

export function createHUD(opts = {}) {
  const { renderer, player, liberationSystem, radialMenu, settings } = opts;

  // HUD state
  let minimapZoom = settings?.minimapZoom || 1;
  let minimapSize = settings?.minimapSize || 180;
  let minimapPosition = settings?.minimapPosition || 'top-right'; // 'top-right', 'top-left', 'bottom-right', 'bottom-left'
  let showMinimap = true;
  let showHealth = true;
  let showResources = true;

  // Health bar animation
  let displayedHealth = player?.health || 100;
  let displayedMaxHealth = player?.maxHealth || 100;
  let healthFlashTime = 0;

  // Minimap canvas (offscreen for performance)
  let minimapCanvas = null;
  let minimapCtx = null;
  let lastMinimapUpdate = 0;
  const MINIMAP_UPDATE_INTERVAL = 100; // ms

  // Tooltips
  let activeTooltip = null;

  function init() {
    // Create offscreen minimap canvas
    minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = minimapSize;
    minimapCanvas.height = minimapSize;
    minimapCtx = minimapCanvas.getContext('2d');
  }

  function update(dt) {
    if (!player) return;

    // Smooth health bar
    const targetHealth = player.health;
    const diff = targetHealth - displayedHealth;
    displayedHealth += diff * Math.min(1, dt * 0.01);

    // Health flash on damage
    if (healthFlashTime > 0) {
      healthFlashTime -= dt;
    }

    // Update minimap periodically
    lastMinimapUpdate += dt;
  }

  function render(ctx, canvasWidth, canvasHeight) {
    if (!player) return;

    ctx.save();
    ctx.font = '12px "Microsoft YaHei", sans-serif';

    // 1. Health Bar (top-left by default)
    if (showHealth) {
      renderHealthBar(ctx, 20, 20, 200, 18);
    }

    // 2. Minimap
    if (showMinimap) {
      renderMinimap(ctx, canvasWidth, canvasHeight);
    }

    // 3. Resource bars (gold, etc.)
    if (showResources) {
      renderResources(ctx, canvasWidth, canvasHeight);
    }

    // 4. Active quest tracker
    renderQuestTracker(ctx, canvasWidth, canvasHeight);

    // 5. Zone name (when entering new zone)
    renderZoneName(ctx, canvasWidth);

    // 6. Tooltip
    if (activeTooltip) {
      renderTooltip(ctx, activeTooltip);
    }

    // 7. Radial menu (rendered last, on top)
    const radialData = radialMenu?.getRenderData?.();
    if (radialData) {
      import('./radial.js').then(m => m.renderRadialMenu(ctx, radialData));
    }

    ctx.restore();
  }

  function renderHealthBar(ctx, x, y, w, h) {
    const maxHealth = displayedMaxHealth;
    const health = Math.max(0, displayedHealth);
    const pct = maxHealth > 0 ? health / maxHealth : 0;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    roundRect(ctx, x, y, w, h, 4);
    ctx.fill();

    // Health gradient
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    if (healthFlashTime > 0) {
      grad.addColorStop(0, '#ff4444');
      grad.addColorStop(1, '#cc0000');
    } else {
      grad.addColorStop(0, '#44aa44');
      grad.addColorStop(1, '#228822');
    }
    ctx.fillStyle = grad;
    roundRect(ctx, x + 1, y + 1, (w - 2) * pct, h - 2, 3);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#c9a962';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 4);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(health)} / ${maxHealth}`, x + w / 2, y + h / 2);
  }

  function renderMinimap(ctx, canvasWidth, canvasHeight) {
    if (!renderer || !liberationSystem) return;

    const pos = getMinimapPosition(canvasWidth, canvasHeight);
    const size = minimapSize * minimapZoom;
    const { x, y } = pos;

    // Update minimap texture
    if (lastMinimapUpdate >= MINIMAP_UPDATE_INTERVAL) {
      updateMinimapTexture();
      lastMinimapUpdate = 0;
    }

    // Draw minimap background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    roundRect(ctx, x, y, size, size, 4);
    ctx.fill();

    // Draw minimap content
    if (minimapCanvas) {
      ctx.drawImage(minimapCanvas, x, y, size, size);
    }

    // Border
    ctx.strokeStyle = '#c9a962';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, size, size, 4);
    ctx.stroke();

    // Zoom indicator
    ctx.font = '10px monospace';
    ctx.fillStyle = '#c9a962';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(minimapZoom * 100)}%`, x + size - 4, y + 14);

    // Zone labels on minimap
    renderMinimapZones(ctx, x, y, size);
  }

  function getMinimapPosition(canvasWidth, canvasHeight) {
    const size = minimapSize * minimapZoom;
    const margin = 20;

    switch (minimapPosition) {
      case 'top-left': return { x: margin, y: margin };
      case 'bottom-right': return { x: canvasWidth - size - margin, y: canvasHeight - size - margin };
      case 'bottom-left': return { x: margin, y: canvasHeight - size - margin };
      default: // top-right
        return { x: canvasWidth - size - margin, y: margin };
    }
  }

  function updateMinimapTexture() {
    if (!minimapCtx || !liberationSystem) return;

    const { bounds } = renderer.terrain?.chunks || { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 } };
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    const scale = minimapSize / Math.max(worldW, worldH);

    minimapCtx.clearRect(0, 0, minimapSize, minimapSize);

    // Draw terrain biomes
    const zones = liberationSystem.getAllZones?.() || [];
    for (const zone of zones) {
      const mx = (zone.x - bounds.minX) * scale;
      const my = (zone.y - bounds.minY) * scale;
      const mr = zone.radius * scale;

      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, mr, 0, Math.PI * 2);

      const state = liberationSystem.getZoneState?.(zone.id) || 0;
      const colors = {
        0: 'rgba(60, 60, 70, 0.3)',    // locked
        1: 'rgba(200, 150, 50, 0.4)',  // contested
        2: 'rgba(50, 150, 50, 0.4)',   // liberated
        3: 'rgba(100, 200, 100, 0.4)'  // fortified
      };
      minimapCtx.fillStyle = colors[state] || colors[0];
      minimapCtx.fill();

      // Zone name
      if (mr > 15) {
        minimapCtx.font = '8px "Microsoft YaHei"';
        minimapCtx.fillStyle = '#ffffff';
        minimapCtx.textAlign = 'center';
        minimapCtx.fillText(zone.name, mx, my);
      }
    }

    // Player position
    if (player) {
      const px = (player.x - bounds.minX) * scale;
      const py = (player.y - bounds.minY) * scale;
      minimapCtx.beginPath();
      minimapCtx.arc(px, py, 4, 0, Math.PI * 2);
      minimapCtx.fillStyle = '#ffd700';
      minimapCtx.fill();
      minimapCtx.strokeStyle = '#000000';
      minimapCtx.lineWidth = 1;
      minimapCtx.stroke();
    }
  }

  function renderMinimapZones(ctx, x, y, size) {
    // Zone labels drawn on main canvas over minimap
  }

  function renderResources(ctx, canvasWidth, canvasHeight) {
    if (!player) return;

    const x = 20;
    let y = 50;

    // Gold
    if (player.gold !== undefined) {
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '14px "Microsoft YaHei"';
      ctx.fillText(`💰 ${player.gold}`, x, y);
      y += 22;
    }

    // Level/XP
    if (player.level !== undefined) {
      ctx.fillStyle = '#88ccff';
      ctx.fillText(`⭐ Lv.${player.level} ${player.xp || 0}/${player.xpToNext || 100}`, x, y);
      y += 22;
    }
  }

  function renderQuestTracker(ctx, canvasWidth, canvasHeight) {
    if (!liberationSystem) return;

    const nextObj = liberationSystem.getNextObjective?.();
    if (!nextObj) return;

    const x = canvasWidth - 320;
    const y = 20;
    const w = 300;

    ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
    roundRect(ctx, x, y, w, 60, 4);
    ctx.fill();
    ctx.strokeStyle = '#c9a962';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, 60, 4);
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px "Microsoft YaHei"';
    ctx.textAlign = 'left';
    ctx.fillText('当前目标:', x + 10, y + 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "Microsoft YaHei"';
    ctx.fillText(`${nextObj.zoneName}: ${getObjectiveText(nextObj.objectiveId)}`, x + 10, y + 42);
  }

  function getObjectiveText(objId) {
    const texts = {
      'clear_enemies': '清理区域敌人',
      'destroy_spawner': '摧毁生成器',
      'rescue_npc': '营救NPC',
      'capture_point': '占领据点',
      'defeat_boss': '击败首领',
      'find_secret': '发现秘密区域'
    };
    return texts[objId] || objId;
  }

  function renderZoneName(ctx, canvasWidth) {
    if (!player || !liberationSystem) return;

    // Check if player entered a new zone recently
    // (simplified - would track zone transitions)
  }

  function renderTooltip(ctx, tooltip) {
    const padding = 8;
    const maxWidth = 280;

    ctx.font = '12px "Microsoft YaHei"';
    const lines = tooltip.text.split('\n');
    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      maxLineWidth = Math.max(maxLineWidth, w);
    }
    const w = Math.min(maxLineWidth, maxWidth) + padding * 2;
    const h = lines.length * 18 + padding * 2;

    const x = tooltip.x - w / 2;
    const y = tooltip.y - h - 10;

    ctx.fillStyle = 'rgba(20, 20, 30, 0.95)';
    roundRect(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = '#c9a962';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 4);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + padding, y + padding + i * 18);
    }
  }

  function showTooltip(text, x, y) {
    activeTooltip = { text, x, y };
  }

  function hideTooltip() {
    activeTooltip = null;
  }

  function onDamageTaken() {
    healthFlashTime = 200;
  }

  function setMinimapZoom(zoom) {
    minimapZoom = Math.max(0.5, Math.min(3, zoom));
    if (settings) settings.minimapZoom = minimapZoom;
  }

  function setMinimapSize(size) {
    minimapSize = Math.max(100, Math.min(300, size));
    if (minimapCanvas) {
      minimapCanvas.width = minimapSize;
      minimapCanvas.height = minimapSize;
    }
    if (settings) settings.minimapSize = minimapSize;
  }

  function setMinimapPosition(pos) {
    minimapPosition = pos;
    if (settings) settings.minimapPosition = pos;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return {
    init,
    update,
    render,
    showTooltip,
    hideTooltip,
    onDamageTaken,
    setMinimapZoom,
    setMinimapSize,
    setMinimapPosition,
    getMinimapZoom: () => minimapZoom,
    getMinimapSize: () => minimapSize,
    getMinimapPosition: () => minimapPosition
  };
}