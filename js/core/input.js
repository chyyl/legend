/* ============================================================================
   js/core/input.js —— 统一输入层（Q18 点击寻路+WASD/摇杆，Q14 捏合缩放）
   ----------------------------------------------------------------------------
   职责：把 鼠标/触屏/键盘/手柄 抽象成统一状态，供 engine/player 每帧读取。
         处理点击寻路、虚拟摇杆、触屏HUD按钮、手柄、捏合/滚轮缩放、按键自定义。

   支持的输入方式：
     · 键鼠：WASD 移动、左键点击移动/交互/攻击、滚轮缩放
     · 触屏：左半屏 轻点=点击寻路 / 拖动=虚拟摇杆（含视觉反馈）、右半屏点击、
       右下 HUD 按钮、双指捏合缩放
     · 手柄：左摇杆/十字键移动，A=交互 B=格挡 X=跳跃 Y=药水 LB=切换攻击模式 RT=攻击

   对外接口（window.LG.Input）：
     .init(canvas) .updateMoveVec()          每帧调用（合并键盘/手柄/摇杆到 moveVec）
     .state = { click, hover, moveVec, keys, joy, padMove, padHit }
     .consumeClick()/.consumePinch()/.consumeWheel()   （hover 位置直接读 state.hover）
     .touchButtons() -> [{id,x,y,r}]        触屏 HUD 按钮布局（几何；engine 命中检测+绘制共用）
     .padAction(action) -> bool              手柄按键一次性触发
     .down(action) .keyFor .setKey .keymap

   依赖：core/utils.js（LS）、core/config.js（无强依赖）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const state = {
    click: null,            // {x,y} 待消费点击（CSS 像素）
    hover: null,            // {x,y} 鼠标悬停位置（用于高亮 NPC/宝箱/敌人）
    moveVec: { x: 0, y: 0 },
    keys: {},
    pressed: [],            // 点按事件队列（keydown 即入队）：低帧率下短点按不丢失
    pinch: null,
    wheel: 0,
    joy: null,              // 虚拟摇杆 {base, cur}
    padMove: { x: 0, y: 0 }, // 手柄左摇杆/十字键
    padHit: {},             // 手柄一次性按键 {action:true}
  };

  /* 按键自定义（Q57）：action -> KeyboardEvent.code
     与默认值合并：老存档缺新增键（interact/attack）时也能正常工作 */
  let keymap = Object.assign({
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    attack: 'KeyJ', block: 'KeyF', jump: 'Space', potion: 'KeyQ',
    bag: 'KeyB', map: 'KeyM', quest: 'KeyL', mode: 'Tab', interact: 'KeyE',
    menu: 'Escape', // 游戏内设置面板开关（新增键自动并入老存档，见下方 Object.assign）
  }, LG.U.LS.get('keymap', {}));
  function keyFor(a) { return keymap[a]; }
  function setKey(a, code) { keymap[a] = code; LG.U.LS.set('keymap', keymap); }

  /* 手柄按键映射（标准布局 index）：action -> 按钮下标数组 */
  const PAD = { interact: [0], block: [1], jump: [2], potion: [3], mode: [4], attack: [6, 7, 2], bag: [9], map: [8] };
  const padPrev = {};

  let cvs = null, DPR = 1;
  function pos(e) {
    const r = cvs.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ---------- 触屏 HUD 按钮布局（仅几何；文案/高亮/动作由 engine 处理） ---------- */
  function touchButtons() {
    const W = window.innerWidth, H = window.innerHeight;
    return [
      { id: 'jump',     x: W - 62,  y: H - 70,  r: 30 },
      { id: 'block',    x: W - 132, y: H - 112, r: 28 },
      { id: 'potion',   x: W - 62,  y: H - 154, r: 26 },
      { id: 'bag',      x: W - 208, y: H - 70,  r: 24 },
      { id: 'interact', x: W - 138, y: H - 42,  r: 26 },
    ];
  }

  function init(canvas) {
    cvs = canvas;
    DPR = Math.min(window.devicePixelRatio || 1, 2);

    /* ===== 鼠标 ===== */
    canvas.addEventListener('mousedown', (e) => { state.click = pos(e); });
    canvas.addEventListener('mousemove', (e) => { state.hover = pos(e); });
    canvas.addEventListener('mouseleave', () => { state.hover = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); state.wheel += e.deltaY > 0 ? 0.1 : -0.1; }, { passive: false });

    /* ===== 触屏 ===== */
    const touches = {};
    let pinchStart = null;
    let pinchSaved = null; // 捏合挂起的待定指针：捏合结束若该指仍按住则恢复（防摇杆卡死）
    let pending = null; // 左半屏待定指针：拖动>死区升级为摇杆，轻点松手转点击寻路
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = pos(t);
        touches[t.identifier] = p;
        // 左半屏（非按钮区）= 摇杆候选：轻点=点击寻路，拖动=摇杆（此前按下即摇杆，
        // 导致"左半侧无法点击移动"）；其余位置 = 点击（交互/移动/按钮）
        if (t.clientX < window.innerWidth / 2 && !hitButton(p)) {
          pending = { id: t.identifier, p, t0: performance.now(), dragged: false };
        } else {
          state.click = p;
        }
      }
      if (e.touches.length === 2) {
        // 摇杆进行中，或第二指落在 HUD 按钮上 → 不是捏合意图：保持摇杆/待定不动。
        //（此前无条件清空 joy+pending 且本手势内无法重建 → "摇杆时点按钮人物卡死"）
        if (state.joy || hitButton(p)) {
          pinchStart = null;
        } else {
          pinchStart = { d: touchDist(e) };
          pinchSaved = pending; pending = null;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (pending && pending.id === t.identifier && touches[t.identifier]) {
          const p = pos(t);
          if (!state.joy) {
            // 首次位移超过死区（8px，与 updateMoveVec 一致）才激活摇杆并显示视觉反馈
            const bd = Math.hypot(p.x - pending.p.x, p.y - pending.p.y);
            if (bd > 8) { state.joy = { id: t.identifier, base: pending.p, cur: p }; pending.dragged = true; }
          } else if (state.joy.id === t.identifier) {
            const dx = p.x - state.joy.base.x, dy = p.y - state.joy.base.y;
            const d = Math.hypot(dx, dy);
            const max = 60; // 摇杆半径
            const k = d > max ? max / d : 1;
            state.joy.cur = { x: state.joy.base.x + dx * k, y: state.joy.base.y + dy * k };
          }
        }
      }
      if (e.touches.length === 2 && pinchStart) {
        const d = touchDist(e);
        state.pinch = (d - pinchStart.d) / 200;
        pinchStart.d = d;
      }
    }, { passive: false });

    function endTouch(e) {
      e.preventDefault();
      for (const t of e.changedTouches) {
        delete touches[t.identifier];
        // 轻点（未升级为摇杆且时间短）→ 转为点击寻路（修复"左半屏无法点击移动"）
        if (pending && pending.id === t.identifier) {
          if (!pending.dragged && performance.now() - pending.t0 < 350) state.click = pending.p;
          pending = null;
        }
        if (state.joy && state.joy.id === t.identifier) state.joy = null; // 摇杆手指抬起即停
      }
      if (e.touches.length < 2 && pinchStart) {
        // 捏合结束：剩余手指若正是被挂起的待定指针 → 恢复，继续拖动即可激活摇杆
        pinchStart = null;
        if (pinchSaved && e.touches.length === 1 && pinchSaved.id === e.touches[0].identifier) pending = pinchSaved;
        pinchSaved = null;
      }
      if (Object.keys(touches).length === 0) { state.joy = null; pending = null; pinchSaved = null; }
    }
    canvas.addEventListener('touchend', endTouch, { passive: false });
    canvas.addEventListener('touchcancel', endTouch, { passive: false });
    function touchDist(e) { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

    /* ===== 键盘 ===== */
    window.addEventListener('keydown', (e) => {
      // 输入框聚焦时不劫持按键
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      state.keys[e.code] = true;
      // 一次性动作走点按队列：事件发生即入队，主循环消费。
      // （此前靠每帧轮询 keys 状态，按下时长<帧间隔的短点按在低帧率设备上会被丢掉）
      if (!e.repeat && state.pressed.length < 32) state.pressed.push(e.code);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      updateMoveVec();
    });
    window.addEventListener('keyup', (e) => { state.keys[e.code] = false; updateMoveVec(); });
    window.addEventListener('resize', resize);
    resize();
  }
  function resize() { if (cvs) { cvs.width = window.innerWidth * DPR; cvs.height = window.innerHeight * DPR; } }

  /* ---------- 手柄轮询（Gamepad API，Windows/安卓蓝牙手柄） ---------- */
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { state.padMove = { x: 0, y: 0 }; return; }
    // 左摇杆（带死区）
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let mx = Math.abs(ax) > 0.22 ? ax : 0, my = Math.abs(ay) > 0.22 ? ay : 0;
    // 十字键补充
    if (gp.buttons[12] && gp.buttons[12].pressed) my = -1;
    if (gp.buttons[13] && gp.buttons[13].pressed) my = 1;
    if (gp.buttons[14] && gp.buttons[14].pressed) mx = -1;
    if (gp.buttons[15] && gp.buttons[15].pressed) mx = 1;
    state.padMove = { x: mx, y: my };
    // 按键边沿检测 -> padHit
    for (const action in PAD) {
      let downNow = false;
      for (const idx of PAD[action]) if (gp.buttons[idx] && gp.buttons[idx].pressed) downNow = true;
      if (downNow && !padPrev[action]) state.padHit[action] = true;
      padPrev[action] = downNow;
    }
  }
  function padAction(a) { if (state.padHit[a]) { state.padHit[a] = false; return true; } return false; }

  /* 消费一次点按：该键自上次消费以来是否被按下过（含短于一帧的点按） */
  function takePress(code) {
    if (!code) return false;
    const i = state.pressed.indexOf(code);
    if (i >= 0) { state.pressed.splice(i, 1); return true; }
    return false;
  }

  /* ---------- 每帧合并移动向量（键盘 > 手柄 > 虚拟摇杆） ---------- */
  function updateMoveVec() {
    pollPad();
    let x = 0, y = 0;
    if (state.keys[keymap.left]) x -= 1;
    if (state.keys[keymap.right]) x += 1;
    if (state.keys[keymap.up]) y -= 1;
    if (state.keys[keymap.down]) y += 1;
    if (x === 0 && y === 0 && (state.padMove.x || state.padMove.y)) { x = state.padMove.x; y = state.padMove.y; }
    if (x === 0 && y === 0 && state.joy) {
      const dx = state.joy.cur.x - state.joy.base.x, dy = state.joy.cur.y - state.joy.base.y;
      const m = Math.hypot(dx, dy);
      if (m > 8) { x = dx / m; y = dy / m; } // 死区8px
    }
    const m = Math.hypot(x, y);
    state.moveVec = m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }

  /* 命中触屏按钮（返回按钮对象或 null） */
  function hitButton(p) {
    for (const b of touchButtons()) if (LG.U.dist(p.x, p.y, b.x, b.y) <= b.r) return b;
    return null;
  }

  LG.Input = {
    state, init, updateMoveVec, touchButtons, hitButton, padAction, takePress,
    consumeClick() { const c = state.click; state.click = null; return c; },
    consumePinch() { const p = state.pinch; state.pinch = null; return p; },
    consumeWheel() { const w = state.wheel; state.wheel = 0; return w; },
    down(action) { return !!state.keys[keymap[action]]; },
    keyFor, setKey, keymap,
  };
})();
