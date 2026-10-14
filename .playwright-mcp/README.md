# 自动化验收脚本（Playwright MCP）

仅测试用，**不参与游戏运行**（index.html 不加载本目录）。
运行方式：OpenCode 内 playwright MCP `browser_run_code_unsafe({ filename: ".playwright-mcp/t1.js" })`
（路径必须在工作区根内）。改 JS/CSS 后需先 CDP `Network.clearBrowserCache` 再 goto（脚本内已自带）。

- `t1.js` 桌面 1280×800 全量回归：菜单分离/墙·海·敌人碰撞/HUD 四热区/ESC/任务接取/大地图真实地形/
  追踪条点击 + 数值调整（敌人伤害10%、范围×2）+ 落点菱形 + 小地图热区与点击 + 飘字分级（14/18/24）
- `t2.js` 手机 iPhone12 390×844（hasTouch/isMobile）：菜单适配/U=0.5 HUD 热区/左半屏轻点寻路/
  拖动摇杆消歧/设置面板开关
- 截图输出同目录：`a1~a3`（桌面菜单/大地图/游戏）、`b1~b4`（手机菜单/创建/设置/游戏）
- 合成测试对象（如敌人）必须带 `type.id` + `type.color`，否则 `Assets.enemy` 每帧抛错
