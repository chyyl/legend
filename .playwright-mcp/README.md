# 自动化验收脚本（Playwright MCP）

仅测试用，**不参与游戏运行**（index.html 不加载本目录）。
运行方式：OpenCode 内 playwright MCP `browser_run_code_unsafe({ filename: ".playwright-mcp/t1.js" })`
（路径必须在工作区根内）。改 JS/CSS 后需先 CDP `Network.clearBrowserCache` 再 goto（脚本内已自带）。

- `t1.js` 桌面 1280×800 全量回归：菜单分离/墙·海·敌人碰撞/HUD 四热区/ESC/任务接取/大地图真实地形/
  追踪条点击 + 数值调整（敌人伤害10%、范围×2）+ 落点菱形 + 小地图热区与点击 + 飘字分级（14/18/24）
- `t2.js` 手机 iPhone12 390×844（hasTouch/isMobile）：菜单适配/U=0.5 HUD 热区/左半屏轻点寻路/
  拖动摇杆消歧/设置面板开关
- `t3.js` 本轮三 Bug 回归（2026-10-14）：
  - 迷宫贯通：营地→迷宫中心 184 采样全可走 + 中心可走（buildRoads 移到 buildMaze 之后）
  - 迷宫雾每帧跟随：传送落点静止即揭示 radius6，格外不揭示（player.js fog.reveal 移出移动分支）
  - 大地图缩放：按钮 1.0→1.5×、滚轮→2.0×、拖拽平移不误触发传送、点击传送关面板且位移、
    重开面板缩放持久、手机双指捏合 1.0→4.0×
  - BOSS 血条：横屏 844×390 置顶红条像素计数>250 且旧位(H-210)=0；竖屏 390×844 底部>120 且顶部=0
    （画布逐行扫描取红像素最大值——血条物理高=16×U，竖屏仅 8px）
  - region 空指针：spawnBoss 后置 region=null 再击杀，死亡结算不抛错
- `t4.js` 存档读写 E2E（阶段十五，2026-10-14）：无档菜单（单一"开始游戏"）/新游戏走角色创建/
  关键事件存档(levelup→flush)/生命周期存档(pagehide)/设置页 #s-load 手动读档/刷新后
  「继续游戏」跳过角色创建且等级·经验·银币·位置·经验曲线(expTo=220)·宝箱已开·装备全部一致/
  「新游戏」(#mm-new) 重走创建并覆盖槽1——独立全新上下文（存储隔离）
- **输入坐标陷阱（宿主机 Windows 显示缩放 110%）**：isMobile 模拟上下文里 CDP 派发的坐标会被
  ×1.1 重映射（`elementFromPoint` 与真实命中不一致，`page.click('#mm-start')` 会误点到联机大厅、
  `touchscreen.tap(375,30)` 落到屏外）。**手机端脚本一律用页面内 JS 派发**：
  元素 `$eval(sel, el => el.click())`、触点 `new Touch + dispatchEvent(new TouchEvent(...))`
  （t2 的 `tapJS`、t3 的 startGame 即此模式）；桌面非 isMobile 上下文不受影响，坐标点击可用。
- 截图输出同目录：`b1~b4`（手机菜单/创建/设置/游戏）、`t3-maze`（迷宫雾实景）、
  `t3-boss-landscape/portrait`（血条横屏置顶/竖屏底部）；历史 c0~c9 为修复过程取证
- 合成测试对象（如敌人）必须带 `type.id` + `type.color`，否则 `Assets.enemy` 每帧抛错；
  合成区域实例用导出的 `LG.Enemy.spawnBoss(region)`（内部 `spawn` 未导出）
