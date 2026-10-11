/**
 * Radial Menu — Tab/Hold for Mouse/Gamepad/Touch
 * Unified input: 8-slice pie menu, keyboard navigation, gamepad stick, touch drag
 */

export const RADIAL_ACTIONS = {
  INVENTORY: 'inventory',
  MAP: 'map',
  QUESTS: 'quests',
  SETTINGS: 'settings',
  SOCIAL: 'social',
  EMOTES: 'emotes',
  SKILLS: 'skills', // placeholder for future
  EXIT: 'exit'
};

const DEFAULT_ACTIONS = [
  { id: RADIAL_ACTIONS.INVENTORY, label: '背包', icon: '🎒', key: 'I' },
  { id: RADIAL_ACTIONS.MAP, label: '地图', icon: '🗺️', key: 'M' },
  { id: RADIAL_ACTIONS.QUESTS, label: '任务', icon: '📜', key: 'J' },
  { id: RADIAL_ACTIONS.SETTINGS, label: '设置', icon: '⚙️', key: 'P' },
  { id: RADIAL_ACTIONS.SOCIAL, label: '社交', icon: '👥', key: 'O' },
  { id: RADIAL_ACTIONS.EMOTES, label: '表情', icon: '😀', key: 'E' },
  { id: RADIAL_ACTIONS.SKILLS, label: '技能', icon: '⚡', key: 'K' },
  { id: RADIAL_ACTIONS.EXIT, label: '退出', icon: '🚪', key: 'Esc' }
];

const SLICE_ANGLE = Math.PI * 2 / 8;
const HALF_SLICE = SLICE_ANGLE / 2;

export function createRadialMenu(opts = {}) {
  const { actions = DEFAULT_ACTIONS, onAction, gamepadIndex = 0 } = opts;

  let isOpen = false;
  let openTime = 0;
  let selectedIndex = -1;
  let inputMode = 'mouse'; // 'mouse' | 'gamepad' | 'touch' | 'keyboard'
  let holdTimer = null;
  const HOLD_DELAY = 150; // ms to open on hold

  // Gamepad state
  let gamepadStickAngle = null;

  // Touch state
  let touchStartPos = null;
  let touchCurrentPos = null;

  // Keyboard navigation
  const KEY_MAP = {
    'Digit1': 0, 'Digit2': 1, 'Digit3': 2, 'Digit4': 3,
    'Digit5': 4, 'Digit6': 5, 'Digit7': 6, 'Digit8': 7
  };

  function open(centerX, centerY, mode = 'mouse') {
    if (isOpen) return;
    isOpen = true;
    openTime = performance.now();
    inputMode = mode;
    selectedIndex = -1;

    // Center position
    this.centerX = centerX;
    this.centerY = centerY;

    emit('open', { actions });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    selectedIndex = -1;
    gamepadStickAngle = null;
    touchStartPos = null;
    touchCurrentPos = null;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    emit('close', {});
  }

  function handleKeyDown(e) {
    if (!isOpen) {
      // Tab hold to open
      if (e.code === 'Tab') {
        e.preventDefault();
        holdTimer = setTimeout(() => {
          open(window.innerWidth / 2, window.innerHeight / 2, 'keyboard');
        }, HOLD_DELAY);
      }
      // Quick number keys
      if (KEY_MAP[e.code] !== undefined) {
        const idx = KEY_MAP[e.code];
        if (idx < actions.length) executeAction(idx);
      }
      // Escape closes
      if (e.code === 'Escape') close();
      return;
    }

    // Keyboard navigation when open
    switch (e.code) {
      case 'Tab':
        e.preventDefault();
        break;
      case 'Escape':
        close();
        break;
      case 'Enter':
      case 'Space':
        if (selectedIndex >= 0) executeAction(selectedIndex);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        navigateKeyboard(e.code);
        break;
    }
  }

  function handleKeyUp(e) {
    if (e.code === 'Tab' && holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
      // Tap = toggle
      if (isOpen) close();
      else open(window.innerWidth / 2, window.innerHeight / 2, 'keyboard');
    }
  }

  function navigateKeyboard(key) {
    if (selectedIndex === -1) {
      selectedIndex = 0;
      return;
    }

    const row = Math.floor(selectedIndex / 4);
    const col = selectedIndex % 4;

    switch (key) {
      case 'ArrowUp': selectedIndex = Math.max(0, selectedIndex - 4); break;
      case 'ArrowDown': selectedIndex = Math.min(7, selectedIndex + 4); break;
      case 'ArrowLeft': selectedIndex = row * 4 + Math.max(0, col - 1); break;
      case 'ArrowRight': selectedIndex = row * 4 + Math.min(3, col + 1); break;
    }
    emit('select', { index: selectedIndex, action: actions[selectedIndex] });
  }

  function handleMouseMove(x, y) {
    if (!isOpen || inputMode !== 'mouse') return;
    updateSelectionFromAngle(x, y);
  }

  function handleMouseDown(x, y) {
    if (!isOpen) return;
    updateSelectionFromAngle(x, y);
    if (selectedIndex >= 0) executeAction(selectedIndex);
  }

  function updateSelectionFromAngle(x, y) {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Dead zone in center
    if (dist < 40) {
      selectedIndex = -1;
      return;
    }

    let angle = Math.atan2(dy, dx); // -PI to PI
    if (angle < 0) angle += Math.PI * 2;

    // Convert to slice index (0 at top, clockwise)
    const adjustedAngle = (angle + Math.PI / 2) % (Math.PI * 2);
    selectedIndex = Math.floor(adjustedAngle / SLICE_ANGLE) % 8;

    emit('select', { index: selectedIndex, action: actions[selectedIndex] });
  }

  function handleTouchStart(x, y) {
    if (isOpen) return;
    touchStartPos = { x, y };
    touchCurrentPos = { x, y };
    holdTimer = setTimeout(() => {
      open(x, y, 'touch');
    }, HOLD_DELAY);
  }

  function handleTouchMove(x, y) {
    touchCurrentPos = { x, y };
    if (isOpen && inputMode === 'touch') {
      updateSelectionFromAngle(x, y);
    }
  }

  function handleTouchEnd() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (isOpen && inputMode === 'touch') {
      if (selectedIndex >= 0) executeAction(selectedIndex);
      else close();
    }
    touchStartPos = null;
    touchCurrentPos = null;
  }

  function handleGamepad(axes) {
    // axes: [leftX, leftY, rightX, rightY]
    const rightX = axes[2] || 0;
    const rightY = axes[3] || 0;
    const magnitude = Math.sqrt(rightX * rightX + rightY * rightY);

    if (!isOpen) {
      // Right stick press or magnitude to open
      if (magnitude > 0.5) {
        open(window.innerWidth / 2, window.innerHeight / 2, 'gamepad');
      }
      return;
    }

    if (magnitude > 0.2) {
      gamepadStickAngle = Math.atan2(rightY, rightX);
      if (gamepadStickAngle < 0) gamepadStickAngle += Math.PI * 2;
      const adjustedAngle = (gamepadStickAngle + Math.PI / 2) % (Math.PI * 2);
      selectedIndex = Math.floor(adjustedAngle / SLICE_ANGLE) % 8;
      emit('select', { index: selectedIndex, action: actions[selectedIndex] });
    } else {
      selectedIndex = -1;
      gamepadStickAngle = null;
    }
  }

  function handleGamepadButton(button, pressed) {
    if (!isOpen) return;

    // A button = confirm
    if (button === 0 && pressed && selectedIndex >= 0) {
      executeAction(selectedIndex);
    }
    // B button = cancel
    if (button === 1 && pressed) {
      close();
    }
  }

  function executeAction(index) {
    const action = actions[index];
    if (!action) return;

    close();
    if (onAction) onAction(action.id, action);
    emit('action', { actionId: action.id, action });
  }

  function getRenderData() {
    if (!isOpen) return null;

    return {
      centerX: this.centerX,
      centerY: this.centerY,
      actions,
      selectedIndex,
      inputMode,
      openProgress: Math.min(1, (performance.now() - openTime) / 100), // 100ms animation
      gamepadStickAngle,
      touchStartPos,
      touchCurrentPos
    };
  }

  function setActions(newActions) {
    this.actions = newActions || DEFAULT_ACTIONS;
  }

  function addAction(action) {
    if (actions.length < 8) actions.push(action);
  }

  function removeAction(actionId) {
    const idx = actions.findIndex(a => a.id === actionId);
    if (idx >= 0) actions.splice(idx, 1);
  }

  // Event system
  const listeners = new Map();
  function on(event, cb) { if (!listeners.has(event)) listeners.set(event, []); listeners.get(event).push(cb); }
  function off(event, cb) { const arr = listeners.get(event); if (arr) arr.splice(arr.indexOf(cb), 1); }
  function emit(event, data) { const arr = listeners.get(event); if (arr) arr.forEach(cb => cb(data)); }

  return {
    open,
    close,
    isOpen: () => isOpen,
    handleKeyDown,
    handleKeyUp,
    handleMouseMove,
    handleMouseDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleGamepad,
    handleGamepadButton,
    getRenderData,
    setActions,
    addAction,
    removeAction,
    on,
    off,
    RADIAL_ACTIONS,
    DEFAULT_ACTIONS
  };
}

/**
 * Render radial menu to canvas
 */
export function renderRadialMenu(ctx, data) {
  if (!data) return;

  const { centerX, centerY, actions, selectedIndex, openProgress, inputMode } = data;
  const radius = 120;
  const innerRadius = 50;
  const animProgress = easeOutBack(openProgress);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.globalAlpha = animProgress;

  // Background ring
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 20, 30, 0.95)';
  ctx.fill();
  ctx.strokeStyle = '#c9a962';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner circle
  ctx.beginPath();
  ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30, 30, 40, 0.9)';
  ctx.fill();

  // Slices
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const startAngle = -Math.PI / 2 + i * SLICE_ANGLE;
    const endAngle = startAngle + SLICE_ANGLE;
    const isSelected = i === selectedIndex;

    // Slice background
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();

    if (isSelected) {
      ctx.fillStyle = 'rgba(201, 169, 98, 0.3)';
    } else {
      ctx.fillStyle = 'rgba(60, 60, 70, 0.5)';
    }
    ctx.fill();

    // Slice border
    ctx.strokeStyle = isSelected ? '#c9a962' : 'rgba(100, 100, 110, 0.3)';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    // Icon
    const midAngle = startAngle + HALF_SLICE;
    const iconRadius = (radius + innerRadius) / 2;
    const iconX = Math.cos(midAngle) * iconRadius;
    const iconY = Math.sin(midAngle) * iconRadius;

    ctx.font = isSelected ? 'bold 28px Arial' : '24px Arial';
    ctx.fillStyle = isSelected ? '#ffd700' : '#cccccc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(action.icon || '?', iconX, iconY - 8);

    // Label
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = isSelected ? '#ffd700' : '#aaaaaa';
    ctx.fillText(action.label, iconX, iconY + 18);

    // Key hint (keyboard mode)
    if (inputMode === 'keyboard' && action.key) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#888888';
      ctx.fillText(action.key, iconX + 30, iconY - 25);
    }
  }

  // Center hint
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hints = {
    mouse: '点击选择',
    keyboard: '方向键/数字键选择，回车确认',
    gamepad: '右摇杆选择，A键确认',
    touch: '拖动选择，释放确认'
  };
  ctx.fillText(hints[inputMode] || '', 0, 0);

  ctx.restore();
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}