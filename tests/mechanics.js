/* =============================================================================
 * 文件：tests/mechanics.js
 * 职责：机制测试：远程武器弹道 / 法杖AOE / 盾减伤 / 不死金牌 / 闪避概率 / 药水 / 死亡复活
 * 依赖：../js/ 下全部模块（用 vm + 桩 DOM 无头加载）
 * 运行：node mechanics.js
 * =============================================================================
 */
const fs = require('fs'), vm = require('vm');
const store = {};
const fakeEl = () => ({ style:{},width:800,height:450,value:'',textContent:'',innerHTML:'',className:'',
  children:[],firstChild:null,title:'',getContext:()=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:50}):typeof k==='string'?()=>{}:undefined,set:()=>true}),
  addEventListener:()=>{},appendChild:()=>{},removeChild:()=>{},querySelectorAll:()=>[],
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:450}),classList:{add:()=>{},remove:()=>{}},
  onclick:null,oninput:null,insertBefore:()=>{},getAttribute:()=>'0.9',setAttribute:()=>{} });
const sandbox = { console, Math, JSON, Date, performance:{now:()=>Date.now()}, requestAnimationFrame:()=>0,
  localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v,removeItem:k=>delete store[k]},
  navigator:{}, location:{protocol:'http:'}, confirm:()=>false,
  document:{getElementById:()=>fakeEl(),querySelectorAll:()=>[],createElement:()=>fakeEl(),addEventListener:()=>{}},
  addEventListener:()=>{}, setTimeout:()=>0, clearTimeout:()=>{}, Uint8Array, Map };
sandbox.window = sandbox; sandbox.global = sandbox; vm.createContext(sandbox);
for (const f of ['js/data/config.js','js/core/utils.js','js/core/input.js','js/world/terrain.js','js/world/worldmap.js',
 'js/systems/loot.js','js/systems/combat.js','js/systems/quest.js','js/systems/save.js','js/entity/player.js',
 'js/entity/enemy.js','js/entity/npc.js','js/entity/projectile.js','js/net/multiplayer.js','js/world/fx.js','js/world/renderer.js',
 'js/ui/ui.js','js/game.js']) vm.runInContext(fs.readFileSync(f,'utf8'), sandbox, {filename:f});
const L = sandbox.Legend;
L.Terrain.init(42); L.World.generate(42);
const rng = L.Utils.makeRng(7);

/* 远程武器：弓 */
const game = new L.Game(); game.worldSeed = 42; game.setup({name:'射手'}); game.begin(null);
L.UI.game = game;
const bow = L.Loot.makeWeapon(rng, {base: L.Config.getWeapon('bow'), quality: L.Config.WEAPON_QUALITIES[1], lv:5});
game.player.equip(bow);
console.log('装备:', L.Loot.itemName(bow), ' 属性:', JSON.stringify({dmg:+game.player.stats.dmg.toFixed(1), kind:game.player.stats.kind, range:+game.player.stats.range.toFixed(2)}));

/* 放一只怪在正前方，打一发 */
game.enemies = [];   // 清空 begin() 自动刷新的怪，避免挡弹道
const spot = L.Terrain.randomWalkable(rng, Math.floor(game.player.x)+3, Math.floor(game.player.y), 30);
console.log('目标落点', spot.x, spot.y, '地形', L.Terrain.tileAt(spot.x, spot.y));
const target = new L.Enemy('zombie', spot.x+0.5, spot.y+0.5, 3, 'normal', 0.9, rng);
game.enemies.push(target);
game.player.atkDir = Math.atan2(target.y-game.player.y, target.x-game.player.x);
const hp0 = target.hp;
game.playerAttack(game.player);
console.log('弹道生成:', L.Projectile.list.length === 1 ? 'OK' : 'FAIL');
for (let i=0;i<120 && L.Projectile.list.length;i++) L.Projectile.updateAll(1/60, game);
console.log('弓命中:', target.hp < hp0 ? 'OK 造成 '+(hp0-target.hp).toFixed(1)+' 伤害' : 'FAIL');

/* 法杖 AOE：三只怪聚在一起 */
game.player.equip(L.Loot.makeWeapon(rng,{base:L.Config.getWeapon('staff'), quality:L.Config.WEAPON_QUALITIES[0], lv:1}));
game.enemies = [];
const sp2 = L.Terrain.randomWalkable(rng, Math.floor(game.player.x)+2, Math.floor(game.player.y), 30);
const g1 = new L.Enemy('slime', sp2.x+0.5, sp2.y+0.5, 2,'normal',0.9,rng);
const g2 = new L.Enemy('slime', sp2.x+0.9, sp2.y+0.8, 2,'normal',0.9,rng);
const sp3 = L.Terrain.randomWalkable(rng, Math.floor(game.player.x)+9, Math.floor(game.player.y), 30);
const g3 = new L.Enemy('slime', sp3.x+0.5, sp3.y+0.5, 2,'normal',0.9,rng);  // 范围外
game.enemies.push(g1,g2,g3);
const h1=g1.hp,h2=g2.hp,h3=g3.hp;
game.player.atkDir = Math.atan2(g1.y-game.player.y, g1.x-game.player.x); game.playerAttack(game.player);
for (let i=0;i<200 && L.Projectile.list.length;i++) L.Projectile.updateAll(1/60, game);
console.log('法杖AOE 范围内两只受伤:', (g1.hp<h1&&g2.hp<h2)?'OK':'FAIL', ' 范围外未伤:', g3.hp===h3?'OK':'FAIL');

/* 盾：减伤 */
const shield = L.Loot.makeWeapon(rng,{base:L.Config.getWeapon('shield'), quality:L.Config.WEAPON_QUALITIES[0], lv:1});
game.player.equip(shield);
console.log('盾 block 减伤:', game.player.stats.block === 0.3 ? 'OK 30%' : 'FAIL '+game.player.stats.block);
const dmgNo = game.player.takeDamage(50, game);  // 盾生效
game.player.invuln = 0.5;
console.log('盾减伤结算:', dmgNo < 50 ? 'OK 实际受伤 '+dmgNo.toFixed(1) : 'FAIL '+dmgNo);

/* 翻滚无敌 + 不死金牌 */
const p = game.player;
p.unequip('weapon');
p.hp = 5;
p.invuln = 0; p.undeadCd = 0;
p.stats.undead = true; p.stats.dodge = 0;
const lethal = p.takeDamage(9999, game);
console.log('不死金牌:', p.hp === 1 && p.invuln > 4 ? 'OK 触发无敌5秒' : 'FAIL hp='+p.hp);

/* 闪避 */
p.invuln = 0; p.undeadCd = 100; p.stats.undead = false; p.stats.dodge = 0.6; p.hp = 100;
let dodged = 0;
for (let i=0;i<200;i++){ p.invuln=0; if (p.takeDamage(10, game) === 0) dodged++; }
console.log('闪避概率 期望~60%:', (dodged/200*100).toFixed(0)+'%');

/* 药水 */
p.potions = 2; p.hp = 10; p.potionCd = 0;
const inp = L.Input; inp._press = {potion:true};
p.update(1/60, inp, game);
console.log('药水:', p.potions===1 && p.hp>10 ? 'OK 剩余'+p.potions+' 血量'+p.hp.toFixed(0) : 'FAIL');

/* 玩家死亡与复活 */
p.invuln=0; p.stats.dodge=0; p.hp=1; game.state='play';
p.takeDamage(9999, game);
console.log('死亡:', game.state==='dead' ? 'OK 进入结算' : 'FAIL '+game.state);
game.respawn();
console.log('复活:', game.state==='play' && p.hp===p.maxHp ? 'OK 回营地满血' : 'FAIL');

console.log('\n=== 远程/羁绊/机制测试完成 ===');
