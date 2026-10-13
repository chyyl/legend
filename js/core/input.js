/* ============================================================================
   js/core/input.js —— 统一输入层（Q18 点击寻路+WASD/摇杆，Q14 捏合缩放）
   ----------------------------------------------------------------------------
   职责：把鼠标/触屏/键盘抽象成统一状态，供 engine/player 每帧读取。
         处理点击寻路、虚拟摇杆、捏合缩放、滚轮缩放、按键自定义。

   对外接口（window.LG.Input）：
     .init(canvas)
     .state  = { click, moveVec:{x,y}, pinch, wheel, keys:{}, joy }
     .consumeClick() -> {x,y}|null   消费一次屏幕点击（用于移动/交互）
     .consumePinch() -> delta|null   消费一次捏合缩放增量
     .down(key) .setKey(action, code) .keyFor(action)
     .showJoystick .hideJoystick

   事件：不直接依赖其它模块，仅在 init 后由 engine 轮询。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const state = {
    click: null,          // {x,y} 屏幕坐标，待消费
    moveVec: { x: 0, y: 0 }, // WASD/摇杆合成移动向量
    keys: {},             // 按下中的键
    pinch: null,          // 捏合缩放增量
    wheel: 0,             // 滚轮缩放增量
    joy: null,            // 虚拟摇杆 {base:{x,y}, cur:{x,y}}
    lastTapTime: 0,
  };

  /* 按键自定义（Q57）：action -> keyCode */
  let keymap = LG.U.LS.get('keymap', {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    // 空格=跳跃（教程口径），J=手动攻击，F=格挡，Q=药水
    attack: 'KeyJ', block: 'KeyF', jump: 'Space', potion: 'KeyQ',
    bag: 'KeyB', map: 'KeyM', quest: 'KeyJ', mode: 'Tab',
  });

  function keyFor(a) { return keymap[a]; }
  function setKey(a, code) { keymap[a] = code; LG.U.LS.set('keymap', keymap); }

  /* ---------- 屏幕坐标归一化（考虑设备像素比） ---------- */
  let cvs = null, DPR = 1;
  function pos(e) {
    const r = cvs.getBoundingClientRect();
    return { x: (e.clientX - r.left), y: (e.clientY - r.top) };
  }

  function init(canvas) {
    cvs = canvas;
    DPR = Math.min(window.devicePixelRatio || 1, 2); // 限2倍，兼顾Android5性能

    /* ===== 鼠标 ===== */
    canvas.addEventListener('mousedown', (e) => { state.click = pos(e); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); state.wheel += e.deltaY > 0 ? 0.1 : -0.1; }, { passive: false });

    /* ===== 触屏：单指点击/移动 = 摇杆或点击，双指 = 捏合缩放 ===== */
    const touches = {};
    let pinchStart = null;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        touches[t.identifier] = pos(t);
        // 左半屏出现触摸 -> 虚拟摇杆；右半屏 -> 点击
        if (t.clientX < window.innerWidth / 2) {
          state.joy = { base: pos(t), cur: pos(t) };
        } else {
          state.click = pos(t);
        }
      }
      if (e.touches.length === 2) {
        pinchStart = { d: touchDist(e), zoom: 1 };
        state.joy = null; // 双指时不显示摇杆
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = pos(t);
        if (state.joy && touches[t.identifier] &&
            Math.abs(state.joy.base.x - p.x) < 200) {
          state.joy.cur = p;
        }
      }
      if (e.touches.length === 2 && pinchStart) {
        const d = touchDist(e);
        state.pinch = (d - pinchStart.d) / 200; // 归一化缩放增量
        pinchStart.d = d;
      }
    }, { passive: false });

    function endTouch(e) {
      e.preventDefault();
      for (const t of e.changedTouches) delete touches[t.identifier];
      if (e.touches.length < 2) { pinchStart = null; }
      if (Object.keys(touches).length === 0) state.joy = null;
    }
    canvas.addEventListener('touchend', endTouch, { passive: false });
    canvas.addEventListener('touchcancel', endTouch, { passive: false });

    function touchDist(e) {
      const a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    /* ===== 键盘（Q18 Windows11 用 WASD） ===== */
    window.addEventListener('keydown', (e) => {
      state.keys[e.code] = true;
      updateMoveVec();
    });
    window.addEventListener('keyup', (e) => {
      state.keys[e.code] = false;
      updateMoveVec();
    });
    window.addEventListener('resize', () => {
      cvs.width = window.innerWidth * DPR;
      cvs.height = window.innerHeight * DPR;
    });
    // 初始尺寸
    cvs.width = window.innerWidth * DPR;
    cvs.height = window.innerHeight * DPR;
  }

  function updateMoveVec() {
    let x = 0, y = 0;
    if (state.keys[keymap.left]) x -= 1;
    if (state.keys[keymap.right]) x += 1;
    if (state.keys[keymap.up]) y -= 1;
    if (state.keys[keymap.down]) y += 1;
    // 键盘优先；若无键盘输入且有摇杆，则用摇杆
    if (x === 0 && y === 0 && state.joy) {
      const dx = state.joy.cur.x - state.joy.base.x;
      const dy = state.joy.cur.y - state.joy.base.y;
      const m = Math.hypot(dx, dy);
      if (m > 12) { x = dx / m; y = dy / m; } // 摇杆死区12px
    }
    const m = Math.hypot(x, y);
    state.moveVec = m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }

  LG.Input = {
    state, init,
    consumeClick() { const c = state.click; state.click = null; return c; },
    consumePinch() { const p = state.pinch; state.pinch = null; return p; },
    consumeWheel() { const w = state.wheel; state.wheel = 0; return w; },
    down(action) { return !!state.keys[keymap[action]]; },
    keyFor, setKey, keymap,
    updateMoveVec, // 摇杆每帧需重算
  };
})();
