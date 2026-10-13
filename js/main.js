/* ============================================================================
   js/main.js —— 应用引导（装配入口，最后加载）
   ----------------------------------------------------------------------------
   职责：等待 DOM 与字体就绪 -> 隐藏加载遮罩 -> 启动引擎主菜单。
         此文件是唯一在所有模块加载后执行的引导逻辑。

   对外接口：无（自执行）。若需启动参数，扩展 window.LEGEND_BOOT。
   依赖：core/engine（LG.Engine.start）、core/utils、data/i18n。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  function boot() {
    // 载入进度提示
    const fill = document.getElementById('boot-fill');
    if (fill) fill.style.width = '60%';

    // 恢复语言与音量设置
    const lang = LG.U.LS.get('lang', (navigator.language || 'zh').indexOf('zh') === 0 ? 'zh' : 'en');
    LG.I18n.set(lang);
    // 订阅语言切换后同步存储
    LG.U.bus.on('lang', (l) => LG.U.LS.set('lang', l));

    // 绑定联机消息处理
    LG.Engine.bindNet();

    // 尝试加载楷体子集（Q47），失败自动回退系统楷体，不阻塞启动
    if (document.fonts && document.fonts.load) {
      document.fonts.load('16px LegendKai').catch(() => {});
    }

    if (fill) fill.style.width = '100%';
    setTimeout(() => {
      const boot = document.getElementById('boot');
      if (boot) boot.classList.add('hide');
      LG.Engine.start(); // 进入主菜单（含联机大厅入口）
    }, 200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
