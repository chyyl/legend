/* =============================================================================
 * 文件：js/core/input.js
 * 职责：统一键盘、鼠标、触屏输入。提供“持续状态”（方向键/移动）与
 *       “一次性事件”（攻击、交互、打开背包等）两种读取方式。
 * 依赖：无
 * 对外接口（window.Legend.Input）：
 *   - attach(canvas)                       绑定事件
 *   - dirX / dirY                          移动方向分量（-1/0/1）
 *   - mouseX / mouseY / mouseDown          鼠标画布坐标与按下状态
 *   - aimAngle                             当前瞄准弧度（以玩家为原点）
 *   - consumePress(key)                    读取并清除一次性按键（'attack'/'interact'/'inv'/'map'/'roll'）
 *   - touchMove(dx, dy)                    虚拟摇杆写入（触屏）
 *   - enabled                              全局开关（UI 打开时暂停游戏输入）
 * 被引用：game.js / player.js
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Input = {
    enabled: true,
    dirX: 0, dirY: 0,
    mouseX: 0, mouseY: 0, mouseDown: false,
    aimAngle: 0,
    _keys: {},
    _press: {},
    _canvas: null,
    _touch: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 }
  };

  Input.attach = function (canvas) {
    Input._canvas = canvas;

    global.addEventListener('keydown', function (e) {
      if (!Input.enabled) return;
      var k = e.key.toLowerCase();
      if (!Input._keys[k]) {
        if (k === 'e' || k === 'f') Input._press.interact = true;
        if (k === 'i' || k === 'b') Input._press.inv = true;
        if (k === 'm') Input._press.map = true;
        if (k === ' ') Input._press.roll = true;
        if (k === 'q') Input._press.potion = true;
        if (k === 'escape') Input._press.esc = true;
      }
      Input._keys[k] = true;
      if (k === ' ' || k === 'w' || k === 'a' || k === 's' || k === 'd') e.preventDefault();
    });
    global.addEventListener('keyup', function (e) { Input._keys[e.key.toLowerCase()] = false; });

    function updMouse(e) {
      var r = canvas.getBoundingClientRect();
      Input.mouseX = e.clientX - r.left;
      Input.mouseY = e.clientY - r.top;
    }
    canvas.addEventListener('mousemove', updMouse);
    canvas.addEventListener('mousedown', function (e) {
      updMouse(e);
      if (!Input.enabled) return;
      Input.mouseDown = true; Input._press.attack = true;
    });
    global.addEventListener('mouseup', function () { Input.mouseDown = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ---- 触屏：左半屏虚拟摇杆移动，右半屏点击攻击/瞄准 ---- */
    canvas.addEventListener('touchstart', function (e) {
      if (!Input.enabled) return;
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        var r = canvas.getBoundingClientRect();
        var x = t.clientX - r.left, y = t.clientY - r.top;
        if (x < r.width * 0.45 && !Input._touch.active) {
          Input._touch.active = true; Input._touch.id = t.identifier;
          Input._touch.ox = x; Input._touch.oy = y;
          Input._touch.dx = 0; Input._touch.dy = 0;
        } else {
          Input.mouseX = x; Input.mouseY = y;
          Input.mouseDown = true; Input._press.attack = true;
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === Input._touch.id) {
          var r = canvas.getBoundingClientRect();
          var dx = (t.clientX - r.left) - Input._touch.ox;
          var dy = (t.clientY - r.top) - Input._touch.oy;
          var m = Math.max(1, Math.hypot(dx, dy));
          var k = Math.min(1, m / 40);           // 40px 推满
          Input._touch.dx = (dx / m) * k;
          Input._touch.dy = (dy / m) * k;
        }
      }
    }, { passive: false });
    function endTouch(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === Input._touch.id) {
          Input._touch.active = false; Input._touch.id = null;
          Input._touch.dx = 0; Input._touch.dy = 0;
        }
      }
      Input.mouseDown = false;
    }
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
  };

  /* 每帧由 game.js 调用，刷新移动方向与瞄准角（canvas 中心为玩家屏幕位置） */
  Input.update = function (playerScreenX, playerScreenY) {
    if (!Input.enabled) { Input.dirX = 0; Input.dirY = 0; Input.mouseDown = false; return; }
    var x = 0, y = 0;
    if (Input._keys['w'] || Input._keys['arrowup']) y -= 1;
    if (Input._keys['s'] || Input._keys['arrowdown']) y += 1;
    if (Input._keys['a'] || Input._keys['arrowleft']) x -= 1;
    if (Input._keys['d'] || Input._keys['arrowright']) x += 1;
    if (Input._touch.active) { x += Input._touch.dx; y += Input._touch.dy; }
    var m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    Input.dirX = x; Input.dirY = y;

    if (playerScreenX != null) {
      Input.aimAngle = Math.atan2(Input.mouseY - playerScreenY, Input.mouseX - playerScreenX);
    }
  };

  Input.consumePress = function (key) {
    if (Input._press[key]) { Input._press[key] = false; return true; }
    return false;
  };
  Input.clearPresses = function () { Input._press = {}; };
  Input.keyDown = function (k) { return !!Input._keys[k]; };

  L.Input = Input;
})(window);
