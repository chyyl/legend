# Legend

像素火柴人 ARPG《Legend》—— 类《我的世界地下城》风格的俯视角动作角色扮演游戏，浏览器（PWA）、桌面与移动端（Android APK）均可运行，支持 1-4 人联机。

## 游戏特色

- **程序化大陆**：2000×2000 程序化生成的大陆，包含 **13 个区域**（营地、边境长城、海湾小镇、彬祥农业园、黑暗迷宫、西北兵工厂、绝壁雪山、跨海大桥、骷髅岛、黑暗城堡、终末之战等）
- **7 种武器**：铁刃、骑士剑、镰刀、弓、弩、法杖、盾
- **品质与羁绊（附魔词条）系统**：武器 N / R / SR / SSR、装备 D ~ SS 随机品质与词条；羁绊包括锋利、横扫之刃、经验获取、力量、三倍暴击、保护、吸血、不死金牌等
- **等级 1-10 自由加点**：经验升级后自由分配属性点
- **1-4 人联机**：基于 Colyseus 的多人合作
- **难度系数 0-2**：调节怪物生命、伤害、数量与掉落，控制难度多样性（默认 0.9）

## 技术栈

| 技术 | 用途 |
| --- | --- |
| TypeScript | 全部业务代码 |
| Vite 5 | 开发服务器与生产构建 |
| Phaser 3 | 2D 游戏引擎（场景、渲染、输入、物理） |
| Capacitor | 打包 Android APK |
| Colyseus（客户端 colyseus.js） | 联机状态同步 |

## 开发

```bash
npm install     # 安装依赖
npm run dev     # 启动开发服务器，端口 3000
```

浏览器打开 `http://localhost:3000` 即可。

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 先 `tsc --noEmit` 类型检查，再 `vite build`，产物输出到 `dist/` |
| `npm run preview` | 本地预览 `dist/` |
| `npm run lint` | ESLint 检查 `src` |
| `npm run deploy` | 构建后用 gh-pages 包发布到 GitHub Pages |

## 构建网页

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 部署（GitHub Pages）

两种方式，二选一：

1. **自动（推荐）**：推送到 `main` 分支即触发 GitHub Actions（`.github/workflows/deploy.yml`）自动构建并发布；也可在 Actions 页面手动 `Run workflow`。
   > 需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**
2. **本地**：`npm run deploy`（使用 gh-pages 包把 `dist/` 发布到 `gh-pages` 分支）

## 打 APK（Android）

```bash
# 首次
npx cap add android

# 之后每次打包
npm run build && npx cap sync && npx cap open android
```

在 Android Studio 中执行 **Build → Build APK(s)** 即可得到 APK。

## PWA

- `public/sw.js` 提供 **离线缓存**：导航请求 network-first、静态资源 cache-first + 后台更新，缓存名带版本号，升级时自动清理旧缓存
- 浏览器菜单选择 **「添加到主屏幕」**，即可全屏启动游戏

## 操作说明

| 操作 | 键盘 | 移动端 |
| --- | --- | --- |
| 移动 | WASD / 方向键 | 虚拟摇杆 |
| 攻击 | 空格 或 Shift | 触屏攻击按钮 |
| 互动 | E | 触屏互动按钮 |
| 背包 | I | 触屏背包按钮 |
| 地图 | M | 触屏地图按钮 |
| 暂停 | ESC | 触屏暂停按钮 |

移动端使用虚拟摇杆进行触屏操作。

## 存档

- 存档使用 **localStorage** 本地自动保存
- 暂停菜单支持 **导出 / 导入存档码**，可在不同设备之间迁移存档

## 联机说明

- 支持 1-4 人联机，客户端通过 colyseus.js 连接房间
- **GitHub Pages 仅做静态托管，不包含服务端**，联机需要自建 Colyseus 服务端
- 服务端地址在 `src/network/NetworkManager.ts` 中配置（优先读取环境变量 `VITE_SERVER_URL`），也可构建前设置该变量指向你自己的服务端

## 目录结构

```
legend/
├── public/                       # 静态资源（原样拷贝到 dist）
│   ├── manifest.json             # PWA 清单
│   └── sw.js                     # Service Worker（离线缓存）
├── src/
│   ├── config/                   # GameConfig.ts：区域、武器、品质、难度等全局配置
│   ├── systems/                  # MapGenerator / CombatSystem / AISystem / SaveManager 等游戏系统
│   ├── scenes/                   # Phaser 场景：Boot / Preload / MainMenu / Game
│   ├── ecs/                      # 轻量 ECS（实体-组件-系统）
│   ├── network/                  # NetworkManager：Colyseus 联机
│   └── main.ts                   # 入口：注册 Service Worker、启动 Phaser
├── .github/workflows/deploy.yml  # GitHub Pages 自动部署
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```
