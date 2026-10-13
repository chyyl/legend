/* =============================================================================
 * 文件：tests/despawn.js
 * 职责：验证敌人远距离回收与 BOSS 折返重生（真实场景，非人工构造）
 * 运行：node tests/despawn.js
 * =============================================================================
 */
const fs=require('fs'),vm=require('vm');
const fakeEl=()=>({style:{},width:800,height:450,value:'',textContent:'',innerHTML:'',className:'',children:[],firstChild:null,title:'',
 getContext:()=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:50}):typeof k==='string'?()=>{}:undefined,set:()=>true}),
 addEventListener:()=>{},appendChild:()=>{},removeChild:()=>{},querySelectorAll:()=>[],
 getBoundingClientRect:()=>({left:0,top:0,width:800,height:450}),classList:{add:()=>{},remove:()=>{}},onclick:null,oninput:null,
 insertBefore:()=>{},getAttribute:()=>'0.9',setAttribute:()=>{}});
const sb={console,Math,JSON,Date,performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,
 localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},navigator:{},location:{protocol:'http:'},confirm:()=>false,
 document:{getElementById:()=>fakeEl(),querySelectorAll:()=>[],createElement:()=>fakeEl(),addEventListener:()=>{}},
 addEventListener:()=>{},setTimeout:()=>0,clearTimeout:()=>{},Uint8Array,Map};
sb.window=sb;sb.global=sb;vm.createContext(sb);
for(const f of ['js/data/config.js','js/core/utils.js','js/core/input.js','js/world/terrain.js','js/world/worldmap.js',
 'js/systems/loot.js','js/systems/combat.js','js/systems/quest.js','js/systems/save.js','js/entity/player.js',
 'js/entity/enemy.js','js/entity/npc.js','js/entity/projectile.js','js/net/multiplayer.js','js/world/fx.js',
 'js/world/renderer.js','js/ui/ui.js','js/game.js'])
 vm.runInContext(fs.readFileSync(f,'utf8'),sb,{filename:f});
const L=sb.Legend;
L.Terrain.init(42);L.World.generate(42);
const game=new L.Game();game.worldSeed=42;game.setup({name:'x'});game.begin(null);L.UI.game=game;
const p=game.player;
const World=L.World;

function run(n){ for(let i=0;i<n;i++){ game.update(1/60); } }
function alive(){ return game.enemies.filter(e=>!e.dead); }

/* 场景 1：走遍 11 个区域，敌人数量必须被控制住 */
const spots=[[1400,1400],[1720,1000],[1500,620],[1250,360],[520,520],[700,1000],
             [300,1000],[1000,1000],[520,1500],[1000,1660],[1560,1150]];
let maxAlive=0;
for(const [x,y] of spots){ p.x=x+0.5;p.y=y+0.5; run(240); maxAlive=Math.max(maxAlive,alive().length); }
console.log('场景1 走遍全图后  最大存活敌人数:', maxAlive, maxAlive<=25 ? '✓ 未累积' : '✗ 仍在累积');

/* 场景 2：BOSS 折返重生（真实流程：进迷宫->BOSS生成->走远->被回收->折返->再生成） */
game.enemies.length=0;
World.bossSpawned['maze']=false;
p.x=1250.5; p.y=360.5;
run(300);   // 在迷宫停留，触发 BOSS 生成
const b1=alive().filter(e=>e.rank==='boss').length;
console.log('场景2a 迷宫内 BOSS 数:', b1, b1>0 ? '✓ 已生成' : '✗ 未生成');

p.x=1400.5; p.y=1400.5;   // 走远到营地（距离>55格）
run(300);
const b2=alive().filter(e=>e.rank==='boss').length;
console.log('场景2b 走远后 BOSS 数:', b2, b2===0 ? '✓ 已回收' : '✗ 未回收');

p.x=1250.5; p.y=360.5;   // 折返回迷宫
run(400);
const b3=alive().filter(e=>e.rank==='boss').length;
console.log('场景2c 折返后 BOSS 数:', b3, b3>0 ? '✓ 已重生，可再次解放' : '✗ 未重生');

/* 场景 3：解放进度不因回收丢失 */
const before=World.regionKill['maze']||0;
const boss=alive().find(e=>e.rank==='boss');
if(boss){ boss.takeDamage(999999,game,p); game.onEnemyDead(boss); }
console.log('场景3 击杀 BOSS 后 解放:', World.liberated['maze']?'✓ 区域已解放':'✗ 解放失败');

/* 场景 4：长时间运行敌人上限 */
game.enemies.length=0;
for(const [x,y] of spots){ p.x=x+0.5;p.y=y+0.5; run(200); }
const finalN=alive().length;
console.log('场景4 长时间运行后 敌人数:', finalN, finalN<=25 ? '✓ 稳定' : '✗ 偏高');
console.log('\n=== 敌人回收测试完成 ===');
