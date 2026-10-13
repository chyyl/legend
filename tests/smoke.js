/* =============================================================================
 * 文件：tests/smoke.js
 * 职责：冒烟测试：世界生成 / 掉落概率10万次抽样 / 敌人公式 / 900帧战斗模拟 / 任务交付 / 存档往返
 * 依赖：../js/ 下全部模块（用 vm + 桩 DOM 无头加载）
 * 运行：node smoke.js
 * =============================================================================
 */
/* 无头冒烟测试：模拟 window/document，加载全部模块，跑 600 帧模拟战斗 */
const fs = require('fs');
const vm = require('vm');

const store = {};
const fakeEl = () => ({
  style: {}, width: 800, height: 450, value: '', textContent: '', innerHTML: '',
  className: '', children: [], firstChild: null, title: '',
  getContext: () => new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 50 });
    if (k === 'canvas') return { width: 800, height: 450 };
    return typeof k === 'string' ? (() => {}) : undefined;
  }, set: () => true }),
  addEventListener: () => {}, appendChild: () => {}, removeChild: () => {},
  querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
  classList: { add: () => {}, remove: () => {} }, onclick: null, oninput: null,
  insertBefore: () => {},getAttribute: () => '0.9', setAttribute: () => {}
});

const sandbox = {
  console, Math, JSON, Date, performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] },
  navigator: { serviceWorker: null },
  location: { protocol: 'http:' },
  confirm: () => false,
  document: {
    getElementById: () => fakeEl(),
    querySelectorAll: () => [],
    createElement: () => fakeEl(),
    addEventListener: () => {}
  },
  addEventListener: () => {},
  setTimeout: () => 0, clearTimeout: () => {},
  Uint8Array, Map, Array, Object, parseFloat, parseInt, isNaN, Infinity
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

const files = ['js/data/config.js','js/core/utils.js','js/core/input.js','js/world/terrain.js','js/world/worldmap.js',
 'js/systems/loot.js','js/systems/combat.js','js/systems/quest.js','js/systems/save.js',
 'js/entity/player.js','js/entity/enemy.js','js/entity/npc.js','js/entity/projectile.js',
 'js/net/multiplayer.js','js/world/fx.js','js/world/renderer.js','js/ui/ui.js','js/game.js'];
for (const f of files) {
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f }); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); }
}
console.log('全部模块加载成功');

const L = sandbox.Legend;

/* 1. 世界生成 */
L.Terrain.init(20261013);
L.World.generate(20261013);
console.log('世界生成 OK  传送点:', L.World.teleports.length, ' 宝箱:', L.World.chests.length);

/* 2. 地形连通性检查：营地到各区域中心是否可走（简单BFS抽样） */
function walk(x, y) { return L.Terrain.walkable(Math.floor(x), Math.floor(y)); }
const camp = L.Config.REGIONS[0];
let blocked = 0, total = 0;
for (const rg of L.Config.REGIONS) {
  if (rg.id === 'wild') continue;
  total++;
  // 沿直线采样 40 点
  let ok = 0;
  for (let i = 0; i <= 40; i++) {
    const x = camp.cx + (rg.cx - camp.cx) * i / 40;
    const y = camp.cy + (rg.cy - camp.cy) * i / 40;
    if (walk(x, y) || L.Terrain.tileAt(Math.floor(x), Math.floor(y)) === 'rock_high') ok++;
  }
  if (ok < 35) { blocked++; console.log('  路径不畅:', rg.name, ok + '/41'); }
}
console.log('区域连通检查:', total - blocked + '/' + total, '通畅');

/* 3. 掉落概率验证：10万次抽样武器品质 */
const rng = L.Utils.makeRng(12345);
const cnt = {};
for (let i = 0; i < 100000; i++) {
  const q = L.Loot.rollWeaponQuality(rng);
  cnt[q.id] = (cnt[q.id] || 0) + 1;
}
console.log('武器品质分布 (目标 N80 R15 SR3.5 SSR1.5):',
  Object.entries(cnt).map(([k,v]) => k + '=' + (v/1000).toFixed(2) + '%').join(' '));

const cnt2 = {};
for (let i = 0; i < 100000; i++) {
  const q = L.Loot.rollArmorQuality(rng);
  cnt2[q.id] = (cnt2[q.id] || 0) + 1;
}
console.log('装备品质分布 (目标 D50 C25 B15 A6 S3 SS1):',
  Object.entries(cnt2).map(([k,v]) => k + '=' + (v/1000).toFixed(2) + '%').join(' '));

/* 4. 属性计算：SSR 武器应显著强于 N */
const wN = L.Loot.makeWeapon(rng, { quality: L.Config.WEAPON_QUALITIES[0], lv: 5 });
const wSSR = L.Loot.makeWeapon(rng, { quality: L.Config.WEAPON_QUALITIES[3], lv: 5 });
const sN = L.Loot.weaponStats(wN), sS = L.Loot.weaponStats(wSSR);
console.log('Lv5 N伤害', sN.dmg.toFixed(1), ' SSR伤害', sS.dmg.toFixed(1),
  ' SSR/N=', (sS.dmg / sN.dmg).toFixed(2), '(期望≈1.65+羁绊)');

/* 5. 敌人公式验证 */
const e1 = new L.Enemy('zombie', 100, 100, 5, 'normal', 0.9, rng);
const e2 = new L.Enemy('zombie', 100, 100, 5, 'elite', 0.9, rng);
const e3 = new L.Enemy('zombie', 100, 100, 5, 'boss', 0.9, rng);
console.log('敌人生命 Lv5@0.9  普通:', e1.maxHp, ' 精英:', e2.maxHp, '(2.5-4x)', ' BOSS:', e3.maxHp, '(5-10x)');

/* 6. 击杀奖励公式 */
const r1 = L.Combat.killReward(e1, 0.9), r3 = L.Combat.killReward(e3, 0.9);
console.log('击杀奖励 普通:', JSON.stringify(r1), ' 期望 silver=', Math.round(5*10*0.3*0.9));
console.log('击杀奖励 BOSS:', JSON.stringify(r3), ' 期望 silver=', Math.round(5*10*4*0.9));

/* 7. 玩家 + 完整战斗循环 */
const game = new L.Game();
game.worldSeed = 777;
game.setup({ name: '测试者' });
game.begin(null);
console.log('游戏初始化 OK  状态:', game.state, ' 玩家:', game.player.name,
  ' 武器:', L.Loot.itemName(game.player.slots.weapon));

// 模拟输入：向北走并持续攻击
const fakeInput = sandbox.Legend.Input;   // 修改真实引用的字段（game.js 顶部已捕获该对象）
fakeInput.dirX = 0.3; fakeInput.dirY = -1; fakeInput.mouseX = 400; fakeInput.mouseY = 100;
fakeInput.aimAngle = -1.2; fakeInput.mouseDown = true; fakeInput.enabled = true;
sandbox.Legend.UI.game = game;   // 真实环境由 UI.init 设置
game.player.stats.kind = 'melee';

let errs = 0, kills = 0;
for (let f = 0; f < 900; f++) {
  try {
    fakeInput.dirY = (f % 100 < 50) ? -1 : 1;
    fakeInput.aimAngle = (f % 100 < 50) ? -1.2 : 1.9;
    fakeInput._press = { attack: true };   // 每帧触发一次攻击
    game.update(1 / 60);
    L.Projectile.updateAll(1 / 60, game);
    const before = game.totalKills;
    // 强制刷一只怪在面前保证有战斗
    if (f % 60 === 0) {
      const en = new L.Enemy('slime', game.player.x + 0.8, game.player.y, 3, 'normal', 0.9, rng);
      game.enemies.push(en);
    }
    kills = game.totalKills;
  } catch (e) { errs++; if (errs < 3) console.error('FRAME ERR@' + f, e.message, e.stack.split('\n')[1]); }
}
console.log('900 帧模拟  错误:', errs, ' 击杀:', kills,
  ' 玩家HP:', game.player.hp.toFixed(0) + '/' + game.player.maxHp,
  ' 银币:', game.player.silver, ' 等级:', game.player.lv);

/* 8. 任务系统 */
L.Quest.init();
L.Quest.accept('q1');
for (let i = 0; i < 8; i++) L.Quest.onEvent('kill', 'camp');
const turn = L.Quest.turnIn('q1', game.player, game);
console.log('任务 q1 交付:', turn ? turn.texts.join(' | ') : '失败');

/* 9. 存档往返 */
const okSave = L.Save.save(game);
const data = L.Save.load();
const p2 = L.Player.load(data.player);
console.log('存档:', okSave, ' 读档玩家 Lv', p2.lv, ' 银币', p2.silver,
  ' 武器', p2.slots.weapon ? L.Loot.itemName(p2.slots.weapon) : '无',
  ' 背包', p2.inventory.length, '件');

/* 10. 羁绊效果 */
const wl = L.Loot.makeWeapon(rng, { quality: L.Config.WEAPON_QUALITIES[3], lv: 10 });
console.log('SSR Lv10 武器羁绊:', wl.bonds.map(b => L.Config.getBond(b).name).join('、') || '无',
  ' 属性:', JSON.stringify({ dmg: +L.Loot.weaponStats(wl).dmg.toFixed(1) }));

console.log('\n=== 冒烟测试完成 ===');
