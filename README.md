# LEGEND 传奇

> 2D 像素动作 RPG，纯 HTML5 + Canvas 实现，参考《我的世界：地下城2》特征设计。
> 1-4 人 WebRTC P2P 联机，支持 Android APK / iOS / Windows / 纯网页四端离线运行。

## 🎮 快速开始

**方式一：直接玩（最简）**
双击 `index.html` 即可在浏览器中运行（无需构建、无需服务器）。

**方式二：本地服务器（推荐，联机需 http 环境）**
```bash
cd legend
python -m http.server 8080
# 打开 http://localhost:8080
```

**方式三：局域网多人（可选，同 WiFi 自动发现）**
```bash
node tools/lan-signal.js        # 终端1：启动信令（显示本机IP）
# 队友浏览器先访问 http://<你的IP>:8765
python -m http.server 8080      # 终端2：静态服务
# 各自打开 http://<你的IP>:8080 → 联机大厅 → 创建/加入房间
```

## 🕹 操作说明

| 操作 | PC | 手柄 | 手机 |
|---|---|---|---|
| 移动 | 点击地面寻路 / WASD | 左摇杆 / 十字键 | 左半屏虚拟摇杆 / 点击寻路 |
| 交互（NPC/宝箱） | E 或点击目标（超距自动走过去） | A | 点目标 或 右下"交"按钮 |
| 攻击 | 自动索敌（Tab 切模式）；J=手动出击 | RT/RB；LB 切模式 | 点右上角"模式"；自动索敌 |
| 跳跃（翻越矮障） | 空格 | X | 右下"跳"按钮 |
| 格挡（减伤50%） | F | B | 右下"挡"按钮 |
| 药水 | Q | Y | 右下"药"按钮 |
| 背包/地图/任务 | B / M / L | Start | 菜单按钮 |
| 缩放 | 鼠标滚轮（视角） | — | 双指捏合（视角） |
| 大地图缩放 | 滚轮 / －＋按钮（1×~8×，锚点缩放） | — | 双指捏合 / －＋按钮（锚在两指中点） |

**攻击模式**：`开`=自动追击索敌；`半自动`=只攻击原地射程内目标（不追击）；`关`=纯手动（J/RT 仍可主动出击）。

**攻击距离**：由主手武器决定——铁刃 1.6 / 骑士剑 1.7 / 镰刀 2.2 / 弓 7.0 / 弩 8.0 / 法杖 6.0 格（品质词条加射程、"横扫"羁绊 ×1.4 再乘算，空手 1 格）。

**交互易用性**：鼠标悬停 NPC/宝箱有金色呼吸环高亮；靠近时头顶显示 `[E] 交互` 提示；点击远处目标会自动寻路前往并在到达后交互（走不到会提示"走不过去"）。

## 🗺 游戏特色（源自 76 问需求确认）

- **世界**：2000×2000 岛屿，10 大区域（营地→边境长城→海湾小镇→农业园→黑暗迷宫→兵工厂→雪山→跨海大桥→骷髅岛→黑暗城堡→终末之战），完全开放自由探索；**环形主干道**按等级顺序串区并回接营地（沿环走不迷路、不易走散），台地/高山高低对比加强；大地图可缩放（1×~8× 滚轮/捏合/按钮）+ 点击/触屏轻点传送（拖拽平移、长按不误触），**大地图与小地图显示联机队友位置**（青点+名字）
- **敌人**：**人类黑暗军团**（非怪物）——固定型弩手/术士（远程弹幕+范围预警）+ 缓慢型士兵/队长（警戒追击），每区域 BOSS 可重复刷
- **数值**：武器 N~SSR（伤害/攻速/范围/暴击区间随机）、装备 D~SS（防御/移速/闪避）、8 种羁绊（锋利/横扫/经验/力量/三倍暴击/保护/吸血/不死金牌，同类不叠加）
- **成长**：等级 1-10 封顶（溢出转银币）、银币强化 +5%/级、难度滑块 0-2（默认0.9，高难度高掉落）
- **界面**：背包格与已装备槽点击进**吸底详情卡**（前缀全名+完整数值+羁绊+装备/强化/出售/卸下，防误卸）；
  武器**随机前缀名**（16 词池，如"血噬·骑士剑"，随存档）；行囊**一键分解**（两段确认，按售价折银）；
  **字体大小**设置 1~3× 即时生效（分端默认手机 1.5×/桌面 3×，界面等比缩放、大地图文字同步放大）
- **任务**：主线讨伐链 + 支线（击杀/收集/探索/讨伐/护送五类），营地 6 功能 NPC
- **存档**：进世界即自动存档（60 秒定时 + 升级/任务/换区/开箱/BOSS 关键事件 + 切后台/关页生命周期，三类触发），刷新后主菜单「继续游戏」原地续玩（等级/背包/任务/宝箱全恢复），「新游戏」重开覆盖
- **联机**：1-4 人房主权威，单人也是 1 人房；角色存本地、世界随房主

## 🔄 更新日志与自动更新

- **更新日志**：仓库根 [`CHANGELOG.md`](CHANGELOG.md)（**每次开发会话至少一条**，同时是版本号唯一来源），
  游戏内「设置 → 更新日志」可查看最近条目（`npm run sync` 自动生成 `js/generated/changelog.js`）
- **网页版自动更新**：把 `www/` 部署到任意静态托管后，玩家打开游戏时自动检测 `version.json`，
  发现新版在主菜单自动重载拉新资源（游戏进行中不打断，下次进菜单生效）；离线与 file:// 直开静默跳过
- **APK 更新**：内置资源恒为打包时版本（断网可玩优先），发新版后重装 `dist/LEGEND-v1.x-release.apk`

## 📦 打包发布

### Android APK（离线+联机全功能）

工程已就绪：`capacitor.config.json`（appId `com.legend.game`、`webDir:"www"`、`releaseType:"APK"`）
+ `android/`（Capacitor 7，**minSdk 23 = Android 6.0+**，Android 5 已放弃——Capacitor 7 的底线），
断网可玩，同一局域网内多台设备照常联机。当前产物（2026-10-14 命令行出包验证）：

| 包 | 路径 | 说明 |
|---|---|---|
| Release（已签名） | `dist/LEGEND-v1.3-release.apk` | 日常安装这个（约3.5MB） |
| Debug | `dist/LEGEND-v1.3-debug.apk` | 排查用，可连 logcat（约4.4MB） |

```bash
# 1) 每次网页改动后重建 www 并同步进安卓工程（JS 改动必跑；sync = build-www + cap sync）
npm run sync

# 2) 命令行出包（Windows/macOS 用 ./gradlew.bat；Linux 用 ./gradlew）
cd android && ./gradlew.bat assembleDebug     # 调试包
cd android && ./gradlew.bat assembleRelease   # 签名 Release（签名已配好，直接出）

# 3) 产物与安装
#    android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

换新机器首次出包（本机已全部配好，照做即可）：

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android   # Node 依赖（仅首次）
npx cap add android                                       # 挂载工程（仅首次）
# 生成签名密钥（仅首次；keytool 不在 PATH，需全路径调用）
"C:\Program Files\Java\jdk-26.0.2.1\bin\keytool.exe" -genkeypair -v \
  -keystore android/keystore/legend-release.jks -alias legend \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass legend2026 -keypass legend2026 \
  -dname "CN=LEGEND, O=LEGEND Game, C=CN"
```

**环境要点（踩坑实录，改配置前先读）：**

- **构建 JDK 必须 17/21**：`android/gradle.properties` 已指定
  `org.gradle.java.home=C:/Users/L1896/tools/jdk21/jdk-21.0.12.1+1`
  （清华 TUNA Adoptium 镜像的 Temurin 21 zip，`jar xf` 解压即用、不进 PATH）。
  系统自带 JDK 26 会撞 AGP 8.x 已知 bug「JdkImageTransform failure with JDK 26」
  （Google Issue #486844145，AGP 9.2.0 才修复），jlink 重建 java.base 必失败，**无开关可绕**。
- **依赖镜像**：`~/.gradle/init.d/mirror.gradle` 注入阿里云四镜像（google/central/gradle-plugin/public），
  `dl.google.com` 不通时必需；普通仓库须「快照既有 → 清空 → 镜像前置 → 还原既有」，否则根工程
  `allprojects{google()}` 抢先超时。**删掉该文件构建必卡网络超时**。
- **`android/local.properties` 的 `sdk.dir` 必须正斜杠**（`sdk.dir=C:/Users/.../Sdk`）：
  反斜杠会被 Properties 转义吞掉，SdkLocator 报 Win32 error 123。
- **签名**：`android/keystore/legend-release.jks`（alias `legend`、密码 `legend2026`）已挂
  `app/build.gradle → signingConfigs.release`，`assembleRelease` 直接产出签名包。
- 每次 JS 改动后 `npm run sync` 再构建才进包；`npx cap open android` 仍可用 Android Studio 图形出包。
- 真机验收清单见 `TODO.md` 阶段九 9.4；打包全链与故障记录见 `TODO.md` 阶段十六。

### iOS（iPhone 12）
```bash
npx cap add ios
npx cap sync ios
npx cap open ios            # 需 macOS + Xcode 签名
# 或直接用 Safari 访问部署的网页版
```

### Windows 桌面
```bash
npm i -D electron
npx electron .              # 或用 Tauri：npm create tauri-app
```

## 📁 项目结构

```
legend/
├── index.html              # 入口（含模块加载顺序注释）
├── css/style.css           # 全局样式（楷体/像素渲染/面板）
├── js/
│   ├── core/               # config(数值) utils assets(像素图) input camera engine
│   ├── data/i18n.js        # 中英双语
│   ├── world/              # terrain(2000×2000生成) pathfinding(A*)
│   ├── game/               # loot inventory player enemy combat quest npc save ui
│   ├── net/                # net(WebRTC) lobby(大厅)
│   └── audio/audio.js      # 程序生成8-bit音乐音效
├── assets/font/            # 楷体子集（LXGW WenKai，OFL协议）
├── tools/lan-signal.js     # 可选局域网信令（零依赖Node）
├── docs/api.md             # ★ 模块接口文档（修改前必读）
├── capacitor.config.json   # APK/iOS 打包配置
└── TODO.md                 # 开发清单（与OpenCode任务同步）
```

## 🔧 二次开发守则

1. 每个文件头部注释写明**职责/接口/依赖**，新增功能请新建文件并登记到 `index.html` 与 `docs/api.md`
2. 模块间通信一律走 `LG.U.bus` 事件或公开接口，**不要直接引用其它模块内部变量**
3. 所有数值只改 `js/core/config.js`，禁止散落硬编码
4. 全部文案走 `js/data/i18n.js`，统一「敌人」术语（不叫怪物）
5. 全原创美术（程序化生成）与文案，规避版权风险
6. **每次开发会话结束前**：在 `CHANGELOG.md` 顶部补一条（`## [vX.Y.Z] - 日期`，版本号随之递进），
   再跑 `npm run sync`——版本号、游戏内更新日志、网页自动更新三者均由它驱动

## ❓ 常见问题

- **联机连不上**：WebRTC 需 http/https 环境（不要 file://）；跨公网需 STUN，部分网络建议先试同 WiFi（局域网信令）
- **iOS 字体**：楷体子集缺失时自动回退系统楷体（Kaiti SC）
- **卡顿**：设置中降低帧率上限；敌人更新已做视口外冻结（30帧保底 Android 5）
