/* ============================================================================
   js/world/camera.js —— 相机/视口/缩放（Q14 全场景缩放）
   ----------------------------------------------------------------------------
   职责：管理视口跟随、屏幕<->世界坐标转换、缩放（滚轮/捏合/快捷键）。

   对外接口（window.LG.Camera）：
     .init(canvas) .follow(x,y) .update()
     .zoom .setZoom(z) .zoomBy(delta)
     .worldToScreen(x,y) -> {x,y}
     .screenToWorld(x,y) -> {x,y}
     .view -> {x0,y0,x1,y1}   当前可视世界范围（用于渲染裁剪）

   依赖：core/config.js（瓦片尺寸）、core/input.js（缩放输入）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const T = LG.Config.TILE;

  const cam = { x: 0, y: 0, zoom: 1.5, canvas: null, W: 0, H: 0 };
  const ZMIN = 0.5, ZMAX = 4;

  function init(canvas) {
    cam.canvas = canvas;
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    cam.W = window.innerWidth; cam.H = window.innerHeight;
  }

  function follow(x, y) { cam.x = x; cam.y = y; }
  function setZoom(z) { cam.zoom = LG.U.clamp(z, ZMIN, ZMAX); }
  function zoomBy(d) { setZoom(cam.zoom + d); }

  function update() {
    // 消费缩放输入（滚轮 + 捏合）
    const wheel = LG.Input.consumeWheel();
    if (wheel) zoomBy(wheel);
    const pinch = LG.Input.consumePinch();
    if (pinch) zoomBy(pinch);
  }

  /* 世界坐标（格）-> 屏幕像素 */
  function worldToScreen(wx, wy) {
    return {
      x: (wx - cam.x) * T * cam.zoom + cam.W / 2,
      y: (wy - cam.y) * T * cam.zoom + cam.H / 2,
    };
  }
  /* 屏幕像素 -> 世界坐标（格） */
  function screenToWorld(sx, sy) {
    return {
      x: (sx - cam.W / 2) / (T * cam.zoom) + cam.x,
      y: (sy - cam.H / 2) / (T * cam.zoom) + cam.y,
    };
  }

  /* 当前可视世界格范围（含边距，供渲染裁剪） */
  function view() {
    const halfW = cam.W / 2 / (T * cam.zoom), halfH = cam.H / 2 / (T * cam.zoom);
    return { x0: cam.x - halfW - 1, y0: cam.y - halfH - 1, x1: cam.x + halfW + 1, y1: cam.y + halfH + 1 };
  }

  LG.Camera = { init, follow, update, zoom: cam.zoom, setZoom, zoomBy, worldToScreen, screenToWorld, view,
    get zoomVal() { return cam.zoom; } };
})();
