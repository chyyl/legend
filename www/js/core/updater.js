/* ============================================================================
   js/core/updater.js —— 网页版自动更新检测（阶段十九）
   ----------------------------------------------------------------------------
   职责：启动时无缓存检测 www/version.json（构建时由 CHANGELOG.md 生成），
        发现新版本时：主菜单场景自动重载拉新资源（sessionStorage 单次防循环）；
        游戏进行中不打断，下次进入主菜单自动生效。
        file:// 直开、离线、未部署 version.json 等场景一律静默跳过（不报错不打扰）。

   对外接口（window.LG.Updater）：
     .current()        -> 当前版本号字符串（读 LG.CHANGELOG[0].v，生成文件缺失回退 'dev'）
     .check()          -> 执行一次检测（幂等；主菜单内才触发自动重载）
     .CHECK_KEY(ver)   -> 防循环用的 sessionStorage 键名（测试可据此断言）

   依赖：main.js 引导时调用 check()；引擎场景查询 LG.Engine.scene（可缺省）。
   部署前提：网页需与 version.json 同源部署（npm run sync 产物在 www/ 内）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  function current() {
    return (LG.CHANGELOG && LG.CHANGELOG[0] && LG.CHANGELOG[0].v) || 'dev';
  }
  function CHECK_KEY(ver) { return 'legend_up_at_' + ver; }

  /* 重载到最新资源：?vup= 冲刷 index.html 自身缓存；其内资源带内容哈希 ?v= 自然拉新 */
  function reload() {
    location.replace(location.pathname + '?vup=' + Date.now());
  }

  async function check() {
    if (location.protocol === 'file:') return;          // 本地直开/离线包：无更新源
    let remote = null;
    try {
      const r = await fetch('version.json?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;                                // 未部署（如开发根目录）：静默
      remote = await r.json();
    } catch (e) { return; }                             // 断网/CSP 等：静默
    if (!remote || !remote.v || remote.v === current()) return;

    const key = CHECK_KEY(remote.v);
    const inMenu = !LG.Engine || LG.Engine.scene === 'menu';
    if (inMenu && !sessionStorage.getItem(key)) {
      // 主菜单：安全时机，自动重载（每发现一个新版本只自动重载一次，防坏部署死循环）
      sessionStorage.setItem(key, String(Date.now()));
      reload();
      return;
    }
    // 已自动重载过仍发现新版（部署异常/版本回退）或游戏进行中：交给玩家手动确认
    if (window.confirm('发现新版本 ' + remote.v + '（当前 ' + current() + '），是否立即更新？\n'
      + '更新仅需刷新页面，进度已自动保存。')) {
      sessionStorage.removeItem(key);
      reload();
    }
  }

  LG.Updater = { current, check, CHECK_KEY, reload };
})();
