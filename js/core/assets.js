/* ============================================================================
   js/core/assets.js —— 程序化像素图生成器（Q46：零外部素材，离线自包含）
   ----------------------------------------------------------------------------
   职责：用 Canvas 代码绘制所有像素图并缓存，保证 APK 离线无需外部图片。

   角色采用「像素图矩阵 + 镜像对称 + 自动描边 + 侧向阴影/高光」技术：
     - 每个角色由 16×16 字符矩阵定义（只写左半 8 列，运行时镜像保证左右对称）
     - ★左半第7列 = 镜像中轴，必须实心填色；若留透明，镜像后角色正中会出现
       2px 透明缝并被描边描黑，观感变成"两个小人并排"（历史渲染缺陷，勿回归）
     - 渲染器先铺一层深色描边（向四邻偏移），再铺本体，得到精致的1px轮廓
     - 叠加单侧阴影与发丝/盔甲高光，观感远超矩形拼接

   对外接口（window.LG.Assets）：
     .tile(name) -> canvas            地形瓦片
     .hero(opts) -> canvas            玩家角色（Q51 外观自定义：性别/发色/肤色/发型/手持武器）
     .enemy(type) -> canvas           敌人（人类军队 Q71：盔甲+头盔+武器）
     .boss(id, color) -> canvas       BOSS（放大+王冠+发光眼）
     .weaponIcon(id) .armorIcon(slot,color) .bondIcon(id) .chest()
     .hairStyles() -> ['short','long','ponytail','spiky']

   依赖：core/config.js（武器/类型）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  const T = 32; // 角色画布 32×32（16×16 矩阵按 2× 放大 = 高清像素 Q45）

  const cache = {};
  function mk(key, w, h, draw) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = w || T; c.height = h || T;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    draw(g, c.width, c.height);
    cache[key] = c;
    return c;
  }
  function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

  /* ==========================================================================
     像素图矩阵渲染器
     --------------------------------------------------------------------------
     rows: 字符矩阵（只给左半 8 列，自动镜像成 16 列，保证左右对称）
     pal : { char: color }，'.' 为透明
     scale: 放大倍率（2 → 16×16 变 32×32）
     shade: 单侧阴影高光开关（右侧压暗、左侧提亮，增强立体感）
     ========================================================================== */
  function mirror(halfRows) {
    // 左半 8 列 -> 镜像补全右半 8 列
    return halfRows.map((r) => r + r.split('').reverse().join(''));
  }
  function figure(g, halfRows, pal, scale, shade) {
    // 已是 16 列全宽矩阵（侧视图等非对称造型）则直接用，不再镜像
    const rows = halfRows[0].length >= 16 ? halfRows : mirror(halfRows);
    const H = rows.length, W = rows[0].length;
    const at = (x, y) => (y < 0 || y >= H || x < 0 || x >= W ? '.' : rows[y][x]);
    const col = (ch) => (ch && ch !== '.' ? pal[ch] : null);

    // 1) 描边层：所有本体像素向四邻各扩一格填深色，形成1px轮廓
    const outline = pal.O || '#1a1626';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) === '.') continue;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (at(x + dx, y + dy) === '.') px(g, (x + dx) * scale, (y + dy) * scale, scale, scale, outline);
        }
      }
    }
    // 2) 本体层
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = col(at(x, y));
        if (c) px(g, x * scale, y * scale, scale, scale, c);
      }
    // 3) 立体感：右半压暗、左上提亮（仅对非透明本体）
    if (shade) {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const ch = at(x, y);
          const c = col(ch);
          if (!c) continue;
          if (x >= W / 2) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x * scale, y * scale, scale, scale); }
        }
    }
  }

  /* ==========================================================================
     玩家角色：16×16（左半8列定义，右半自动镜像）
     ★镜像规则：第7列是镜像中轴，必须实心！若为透明，镜像后角色正中会出现
       2px透明缝+描边黑线，看起来像"两个小人并排"（曾出现的渲染缺陷）。
     身体各行（row0-6 头/发，row7-15 身体），字符含义：
       h=发 H=发高光 s=肤 S=肤暗 e=眼 t=衣 T=衣暗 g=金饰 l=裤 b=靴
     ========================================================================== */
  // 通用身体（男女共用骨架，配色由 pal 决定），左半8列（col7=中轴实心）
  const BODY = [
    '', '', '', '', '', '', '', // 0-6 由发型/头部填充
    '...ttttt',                 // 7  肩（镜像后全宽3-12）
    '..tttttt',                 // 8  胸
    'stttttgt',                 // 9  臂+金扣（手col1，扣col6->镜像6/9对称）
    'stttttts',                 // 10 臂
    '.TTTTTTT',                 // 11 腰带
    '..llllll',                 // 12 髋
    '..lllll.',                 // 13 腿（中缝自然分开）
    '..bbbbb.',                 // 14 靴口
    '..bbbbb.',                 // 15 靴
  ];
  /* 背面脸（行3-6，左半8列，镜像后=后脑勺全发+颈；col7=中轴实心） */
  const BACK_FACE = ['..hhhhhh', '..hhhhhh', '..hhhhhh', '..hhhsss'];
  /* 侧面脸（行3-6，16列全宽非对称：后脑在左/眼鼻在右，东向；西向由引擎翻转） */
  const SIDE_FACE = [
    '..hhhsssssssss..',   // 行3 额（后发col2-4，肤5-13）
    '..hhhssssssses..',   // 行4 眼 col12（贴近朝向侧）
    '..hhhsssssssss.',    // 行5 颊 + 鼻梁 col14 凸出
    '..hhh.ssssss....',   // 行6 下巴内收（颈col6-11）
  ];
  /* 背面身体：复用正面骨架但去掉金扣（背视不可见） */
  function backBody() {
    const b = BODY.slice(7);
    b[2] = 'stttttts';
    return b;
  }
  // 头部左半（含发），hair 决定顶部造型（col7=中轴实心）
  // dir: 's'正面(默认) / 'n'背面(后脑勺) / 'e'侧面(东向全宽非对称)
  function headRows(style, dir) {
    const top = {
      short:    ['...HHhh', '..hhhhh', '..hhhhh'],
      long:     ['...HHhh', '..hhhhh', '.hhhhhh'],
      ponytail: ['..hHhhh', '.hhhhhh', '.hhhhph'],
      spiky:    ['.H..Hhh', '..hhhhh', '..hhhhh'],
    }[style] || ['...HHhh', '..hhhhh', '..hhhhh'];

    // 背面（北向）：无五官，后脑勺全发 + 颈
    if (dir === 'n') {
      const face = BACK_FACE.slice();
      if (style === 'long') { face[1] = '.hhhhhhh'; face[2] = '.hhhhhhh'; } // 长发后背更宽
      if (style === 'ponytail') { face[1] = '..hhhhpp'; face[2] = '..hhhhpp'; face[3] = '..hhhhpp'; } // 马尾垂脑后
      return top.concat(face).concat(backBody());
    }
    // 侧面（东向）：16列全宽非对称矩阵（figure 识别全宽后不再镜像）
    if (dir === 'e') return mirror(top).concat(SIDE_FACE).concat(mirror(BODY.slice(7)));

    // 正面（默认，维持原样）
    const face = [
      '..hsssss', // 3 额
      '..hssess', // 4 眼（col5 -> 镜像后眼位于5/10对称）
      '..hsssss', // 5 颊
      '...sssss', // 6 下巴（收窄）
    ];
    const rows = top.concat(face);
    if (style === 'long') { rows[5] = '.hssssss'; rows[6] = '.h.sssss'; } // 长发垂肩+收下巴
    if (style === 'ponytail') { rows[6] = '.h.sssss'; }
    return rows.concat(BODY.slice(7));
  }

  const HAIR_STYLES = ['short', 'long', 'ponytail', 'spiky'];
  function hairStyles() { return HAIR_STYLES.slice(); }

  /* 玩家英雄（Q51）：opts = {skin, hairColor, hair, gender, weaponKind}
     dir = 's'|'n'|'e'（'w' 由引擎水平翻转 'e' 生成，避免重复缓存） */
  function hero(opts, dir) {
    opts = opts || {};
    dir = dir || 's';
    const skin = opts.skin || '#f0c8a0';
    const hair = opts.hairColor || '#4a3220';
    const hairHi = lighten(hair, 0.35);
    const F = opts.gender === 'F';
    const tunic = F ? '#a84f86' : '#3f6f9f';
    const key = 'hero2:' + [opts.skin, opts.hairColor, opts.hair, opts.gender, opts.weaponKind, dir].join('|');
    return mk(key, T, T, (g) => {
      const pal = {
        O: '#1a1626', h: hair, H: hairHi, s: skin, S: darken(skin, 0.18),
        e: '#241f33', t: tunic, T: darken(tunic, 0.28), g: '#e6c05a',
        l: F ? '#5a4a6a' : '#3a3a4a', b: '#5a4030', p: darken(hair, 0.35), // p=马尾
      };
      figure(g, headRows(opts.hair || 'short', dir), pal, 2, true);
      // 手持武器（贴在身体右侧；侧视为朝向前方，背面为右肩侧）
      drawHeldWeapon(g, opts.weaponKind, F);
    });
  }

  /* 手持武器：贴在身体右缘外侧（不遮挡躯干），强化“职业感” */
  function drawHeldWeapon(g, kind, female) {
    const hx = 25, hy = 13; // 右手位：身体右缘（col13=px26）外侧
    if (kind === 'melee') {
      px(g, hx + 1, hy - 5, 2, 15, '#dfe6ef');  // 剑刃
      px(g, hx + 1, hy - 5, 1, 15, '#ffffff');  // 刃高光
      px(g, hx - 1, hy + 9, 6, 2, '#8a6a3a');   // 护手
      px(g, hx + 1, hy + 11, 2, 4, '#5a4030');  // 剑柄
    } else if (kind === 'ranged') {
      g.strokeStyle = '#b5895a'; g.lineWidth = 2;
      g.beginPath(); g.arc(hx, hy + 1, 6, -1.15, 1.15); g.stroke(); // 弓臂
      px(g, hx - 2, hy - 4, 1, 12, '#e8e2d0');  // 弓弦
    } else if (kind === 'magic') {
      px(g, hx, hy - 3, 2, 17, '#6a4a2a');      // 法杖杆
      px(g, hx - 2, hy - 7, 6, 6, '#9b7fd4');   // 宝石
      px(g, hx, hy - 6, 2, 2, '#ffffff');
    } else if (kind === 'shield') {
      px(g, hx - 1, hy - 1, 6, 11, '#7a8290');  // 盾面
      px(g, hx, hy, 4, 9, '#9aa2b0');
      px(g, hx + 1, hy + 2, 2, 4, '#e6c05a');
    }
  }

  /* ==========================================================================
     敌人（Q71 人类军队）：同一骨架换盔甲配色 + 头盔 + 军靴，精英描金边
     dir = 's'|'n'|'e'（'w' 由引擎翻转 'e'），与英雄共用 BACK_FACE/SIDE_FACE
     ========================================================================== */
  function enemy(type, dir) {
    dir = dir || 's';
    const key = 'enemy2:' + type.id + ':' + dir;
    const armor = type.color;
    return mk(key, T, T, (g) => {
      const pal = {
        O: '#140f1c', h: darken(armor, 0.2), H: lighten(armor, 0.25), s: '#d8b494', S: '#b8947a',
        e: '#3a1010', t: armor, T: darken(armor, 0.3), g: type.elite ? '#f0d060' : '#6a6a72',
        l: '#33323e', b: '#26232c',
      };
      // 顶部换成头盔造型（col7=中轴实心），按朝向选脸
      const helmet = ['..HHHHH', '.hhhhhh', '.hhhhhh']; // 头盔（顶脊高光+宽檐）
      let rows;
      if (dir === 'n') rows = helmet.concat(BACK_FACE).concat(backBody());
      else if (dir === 'e') rows = mirror(helmet).concat(SIDE_FACE).concat(mirror(BODY.slice(7)));
      else rows = helmet.concat(['..hsssss', '..hssess', '..hsssss', '...sssss']).concat(BODY.slice(7));
      figure(g, rows, pal, 2, true);
      // 精英描一圈金
      if (type.elite) eliteGlow(g);
      // 手持兵器（缓慢型近战长枪 / 固定型远程弩）
      if (type.move === 'fixed') {
        px(g, 24, 17, 8, 2, '#5a4a2a');       // 弩身
        px(g, 28, 14, 2, 8, '#3a3020');       // 弩臂
      } else {
        px(g, 26, 7, 2, 18, '#8a8a9a');       // 长枪杆
        px(g, 26, 5, 2, 4, '#dfe6ef');        // 枪头
      }
    });
  }
  function eliteGlow(g) {
    g.strokeStyle = 'rgba(240,208,96,0.5)'; g.lineWidth = 1;
    g.strokeRect(2.5, 1.5, 27, 29);
  }

  /* BOSS：放大 3×，带王冠 + 发光红眼 + 暗能量肩甲 */
  function boss(id, baseColor) {
    const key = 'boss2:' + id;
    const c = baseColor || '#7a2f3c';
    const S = 48;
    return mk(key, S, S, (g) => {
      const scale = 3;
      const pal = {
        O: '#0e0a14', h: darken(c, 0.2), H: '#f0d060', s: '#c9a58a', S: '#a07a60',
        e: '#ff5030', t: c, T: darken(c, 0.32), g: '#f0d060', l: '#1a1a22', b: '#12101a',
      };
      const rows = [
        '...HHHH', '.HHHHHH', '..hhhhhh', // 王冠 + 头盔檐（col7=中轴实心）
        '..hsssss', '..hssess', '..hsssss', '...sssss',
      ].concat(BODY.slice(7));
      figure(g, rows, pal, scale, true);
      // 肩甲加宽 + 暗能量光晕
      g.fillStyle = 'rgba(120,40,160,0.18)';
      g.fillRect(3, 20, 42, 8);
      px(g, 4, 20, 8, 6, darken(c, 0.15)); px(g, 36, 20, 8, 6, darken(c, 0.15));
    });
  }

  /* ---------- 颜色工具：加深/提亮 ---------- */
  function parse(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(hex, target, amt) {
    const [r, gg, b] = parse(hex);
    const m = (a, t) => Math.round(a + (t - a) * amt);
    return 'rgb(' + m(r, target) + ',' + m(gg, target) + ',' + m(b, target) + ')';
  }
  function darken(hex, amt) { return mix(hex, 0, amt); }
  function lighten(hex, amt) { return mix(hex, 255, amt); }

  /* ==========================================================================
     地形瓦片（保持简洁，突出角色）
     ========================================================================== */
  const TILE_COLORS = {
    grass: ['#3f6b3a', '#4f7d47'], dirt: ['#6b4a2f', '#7a5636'],
    sand: ['#c2b280', '#cdbd8c'], snow: ['#dfe6ee', '#eef2f6'],
    rock: ['#5a5f6b', '#4a4e59'], water: ['#2a5f8a', '#316b99'],
    road: ['#8a7a5a', '#96865f'], castle: ['#3a3a4a', '#444456'],
    void: ['#241b2e', '#2e2239'], farm: ['#5a7a3a', '#66863f'],
    wall: ['#39404e', '#454d5e'], // 迷宫城墙（深色板岩，挤出后更显厚重）
  };
  function tile(type) {
    return mk('tile:' + type, T, T, (g) => {
      const cols = TILE_COLORS[type] || TILE_COLORS.grass;
      px(g, 0, 0, T, T, cols[0]);
      const r = LG.U.rng(type.length * 977);
      for (let i = 0; i < 26; i++)
        px(g, (r() * T) | 0, (r() * T) | 0, 2, 2, r() > 0.5 ? cols[1] : cols[0]);
    });
  }

  /* ==========================================================================
     2.5D 地面瓦片（地形高差挤出渲染，MD 式"有高有低"）
     --------------------------------------------------------------------------
     groundTile(type, level, cliffS, northDelta) -> 预烘焙 canvas（缓存，渲染仅一次 drawImage）
       level      : 本瓦片层级 0/1/2（越高顶面越亮 = 受光感）
       cliffS     : level - 南邻层级；>0 时在本片底边画南向崖壁挤出带
                    （暗面 + 岩缝横纹 + 顶缘受光棱，每级 7px、封顶 2 级）
       northDelta : 北邻层级 - level；>0 北邻更高 -> 本片顶边落影（崖壁投影）；
                    <0 本片更高 -> 本片顶边亮棱（区分同色平面）
     崖壁画在高层瓦片自身底边内（单瓦片内完成，零跨瓦片遮挡顺序问题）。
     ========================================================================== */
  function groundTile(type, level, cliffS, northDelta) {
    const key = 'gt:' + type + ':' + level + ':' + cliffS + ':' + northDelta;
    return mk(key, T, T, (g) => {
      g.drawImage(tile(type), 0, 0);
      const cols = TILE_COLORS[type] || TILE_COLORS.grass;
      // 层级受光：越高越亮（白膜提亮）
      if (level > 0) { g.fillStyle = 'rgba(255,255,255,' + (0.065 * level).toFixed(3) + ')'; g.fillRect(0, 0, T, T); }
      // 水面高光（原引擎每帧蓝膜，烘焙进瓦片省一次 fillRect）
      if (type === 'water') { g.fillStyle = 'rgba(120,180,255,0.15)'; g.fillRect(0, 0, T, T); }
      // 南向崖壁挤出带
      const cliff = Math.min(Math.max(cliffS, 0), 2);
      if (cliff > 0) {
        const bh = cliff * 7, y0 = T - bh;
        g.fillStyle = darken(cols[0], 0.5); g.fillRect(0, y0, T, bh);
        g.fillStyle = darken(cols[0], 0.25);              // 岩缝横纹
        for (let yy = y0 + 2; yy < T; yy += 3) g.fillRect(0, yy, T, 1);
        g.fillStyle = lighten(cols[0], 0.35); g.fillRect(0, y0, T, 1); // 顶缘受光棱
      }
      // 北邻更高：崖壁投影落本片顶边
      const shade = Math.min(Math.max(northDelta, 0), 2);
      if (shade > 0) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, T, 2 + shade * 2); }
      // 本片高于北邻：顶边亮棱
      const rim = Math.min(Math.max(-northDelta, 0), 2);
      if (rim > 0 && cliff === 0) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, T, 1); }
    });
  }

  /* ---------- 武器图标 ---------- */
  function weaponIcon(id) {
    const w = LG.Config.WEAPONS.find((x) => x.id === id) || { color: '#ccc' };
    return mk('wicon:' + id, T, T, (g) => {
      const c = w.color;
      if (w.kind === 'melee') {
        px(g, 20, 4, 4, 18, c); px(g, 18, 20, 8, 3, '#5a4a2a'); px(g, 21, 23, 2, 6, '#3a2a1a');
      } else if (w.kind === 'ranged') {
        g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.arc(16, 16, 11, -1.2, 1.2); g.stroke();
        px(g, 8, 15, 16, 2, c);
      } else if (w.kind === 'magic') {
        px(g, 21, 6, 2, 20, '#5a3a2a'); px(g, 18, 3, 8, 8, c); px(g, 20, 5, 4, 4, '#fff');
      } else if (w.kind === 'shield') {
        px(g, 9, 7, 14, 16, c); px(g, 11, 9, 10, 12, '#8a92a0'); px(g, 14, 12, 4, 6, '#d8b45a');
      }
    });
  }

  /* ---------- 装备图标（头/甲/腿/鞋） ---------- */
  function armorIcon(slot, color) {
    color = color || '#7a8290';
    return mk('aicon:' + slot + color, T, T, (g) => {
      if (slot === 'helm') { px(g, 9, 8, 14, 12, color); px(g, 11, 14, 10, 4, '#2a2a3a'); px(g, 9, 8, 14, 2, lighten(color, 0.3)); }
      else if (slot === 'chest') { px(g, 8, 8, 16, 16, color); px(g, 13, 8, 6, 16, '#2a2a3a'); px(g, 8, 8, 16, 2, lighten(color, 0.3)); }
      else if (slot === 'legs') { px(g, 9, 8, 6, 16, color); px(g, 17, 8, 6, 16, color); }
      else if (slot === 'boots') { px(g, 9, 16, 6, 9, color); px(g, 17, 16, 6, 9, color); px(g, 9, 23, 14, 2, darken(color, 0.3)); }
    });
  }

  /* ---------- 羁绊图标 ---------- */
  const BOND_COL = { sharp: '#e05050', sweep: '#50a0e0', exp: '#50c060', power: '#e08030',
    tri_crit: '#e0d040', guard: '#5080e0', lifesteal: '#a03060', phoenix: '#e0b040' };
  function bondIcon(id) {
    return mk('bond:' + id, T, T, (g) => {
      const c = BOND_COL[id] || '#aaa';
      px(g, 12, 12, 8, 8, c);
      px(g, 14, 6, 4, 6, c); px(g, 14, 20, 4, 6, c); px(g, 6, 14, 6, 4, c); px(g, 20, 14, 6, 4, c);
    });
  }

  /* ---------- 宝箱 ---------- */
  function chest() {
    return mk('chest', T, T, (g) => {
      px(g, 6, 12, 20, 14, '#7a5a2a'); px(g, 6, 12, 20, 5, '#8a6a3a');
      px(g, 6, 12, 20, 1, '#a0803a');
      px(g, 14, 15, 4, 6, '#d8b45a'); px(g, 6, 20, 20, 1, '#4a3a1a');
      px(g, 15, 16, 2, 3, '#fff2c0');
    });
  }

  LG.Assets = { tile, groundTile, hero, enemy, boss, weaponIcon, armorIcon, bondIcon, chest, hairStyles, _cache: cache };
})();
