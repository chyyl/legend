/* =============================================================================
 * 文件：js/ui/ui.js
 * 职责：全部 DOM 界面——HUD（血条/经验/银币/小地图/难度）、背包（装备对比穿戴）、
 *       任务面板（接取/查看/交付）、大地图（传送）、设置（难度系数/音量/清档）、
 *       联机大厅（1-4人）、开始界面、死亡结算。所有面板通过 display 切换。
 * 依赖：js/core/utils.js、js/data/config.js、js/systems/loot.js、
 *       js/systems/quest.js、js/net/multiplayer.js、js/world/renderer.js
 * 对外接口（Legend.UI）：
 *   - init(game)                    绑定 DOM 与游戏引用
 *   - toast(text, color)            右上角提示
 *   - togglePanel(name)             切换 'inv'|'quest'|'map'|'settings'|'lobby'
 *   - closeAll()
 *   - openQuestPanel(npc) / openShopPanel(npc)
 *   - refreshHud()                  刷新 HUD 数值
 *   - showDeath() / showLobby()     死亡结算 / 联机大厅
 * 被引用：game.js / npc.js / index.html
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};
  var Config = L.Config, Utils = L.Utils, Loot = L.Loot, Quest = L.Quest;

  var UI = { game: null, panel: null, _mmTimer: 0 };
  var $ = function (id) { return document.getElementById(id); };

  UI.init = function (game) {
    UI.game = game;

    /* 顶栏按钮 */
    $('btn-inv').onclick = function () { UI.togglePanel('inv'); };
    $('btn-quest').onclick = function () { UI.togglePanel('quest'); };
    $('btn-map').onclick = function () { UI.togglePanel('map'); };
    $('btn-lobby').onclick = function () { UI.togglePanel('lobby'); };
    $('btn-settings').onclick = function () { UI.togglePanel('settings'); };

    /* 面板关闭按钮 */
    var closes = document.querySelectorAll('.panel-close');
    for (var i = 0; i < closes.length; i++) closes[i].onclick = function () { UI.closeAll(); };

    /* 设置：难度系数滑条 */
    var slider = $('diff-slider');
    slider.value = game.difficulty;
    $('diff-val').textContent = game.difficulty.toFixed(2);
    slider.oninput = function () {
      game.difficulty = parseFloat(slider.value);
      $('diff-val').textContent = game.difficulty.toFixed(2);
      Utils.bus.emit('difficulty', game.difficulty);
    };
    /* 难度预设按钮 */
    var presets = document.querySelectorAll('.diff-preset');
    for (var pi = 0; pi < presets.length; pi++) {
      presets[pi].onclick = function () {
        var v = parseFloat(this.getAttribute('data-v'));
        slider.value = v; game.difficulty = v;
        $('diff-val').textContent = v.toFixed(2);
      };
    }
    /* 清档 */
    $('btn-reset-save').onclick = function () {
      if (confirm('确定删除存档并重新开始吗？')) { L.Save.clear(); location.reload(); }
    };
    /* 缩放 */
    $('zoom-in').onclick = function () { L.Renderer.camera.zoom = Utils.clamp(L.Renderer.camera.zoom + 0.25, 1, 4); };
    $('zoom-out').onclick = function () { L.Renderer.camera.zoom = Utils.clamp(L.Renderer.camera.zoom - 0.25, 1, 4); };

    /* 联机大厅 */
    $('btn-create-room').onclick = function () {
      var name = $('lobby-name').value || '房主';
      L.Net.createRoom(name, function (res) {
        var box = $('lobby-status');
        if (res.ok) { box.textContent = '房间已创建！房间码：' + res.code + '（等待队友加入…最多4人）'; }
        else box.textContent = res.err;
      });
      $('lobby-status').textContent = '正在建房…';
    };
    $('btn-join-room').onclick = function () {
      var code = $('room-code').value.trim();
      var name = $('lobby-name').value || '队友';
      if (!code) { $('lobby-status').textContent = '请输入房间码'; return; }
      L.Net.joinRoom(code, name, function (res) {
        $('lobby-status').textContent = res.ok ? ('已加入房间 ' + res.code + '！') : res.err;
      });
      $('lobby-status').textContent = '正在加入…';
    };
    $('btn-leave-room').onclick = function () {
      L.Net.leave();
      $('lobby-status').textContent = '已离开房间（单机模式）';
    };
    $('btn-solo').onclick = function () { UI.closeAll(); UI.toast('单人冒险开始！', '#7ee0ff'); };

    /* 消息事件 -> 顶部提示 */
    Utils.bus.on('region_found', function (rg) { UI.toast('发现新区域：' + rg.name + '（' + rg.dir + '）', '#7ee0ff'); });
    Utils.bus.on('region_liberated', function (rg) { UI.toast('★ 区域解放：' + rg.name + '！', '#ffd750'); });
    Utils.bus.on('levelup', function (lv) { UI.toast('升级！等级达到 Lv' + lv, '#7ee0ff'); });
    Utils.bus.on('loot', function (it) { UI.toast('获得 ' + Loot.itemName(it), Loot.itemNameColor(it)); });
    Utils.bus.on('undead', function () { UI.toast('不死金牌触发！无敌 5 秒', '#ffd750'); });
    Utils.bus.on('quest_ready', function (q) { UI.toast('任务可交付：' + q.name + '（找 NPC 领奖）', '#9dff70'); });
    Utils.bus.on('difficulty', function () {});
  };

  /* ---- 提示 ---- */
  UI.toast = function (text, color) {
    var box = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.style.borderColor = color || '#4a5a74';
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('fade'); }, 2600);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
    while (box.children.length > 6) box.removeChild(box.firstChild);
  };

  /* ---- 面板切换 ---- */
  UI.togglePanel = function (name) {
    if (UI.panel === name) { UI.closeAll(); return; }
    UI.closeAll();
    UI.panel = name;
    var el = $('panel-' + name);
    if (el) el.style.display = 'block';
    L.Input.enabled = false;
    if (name === 'inv') UI.refreshInv();
    if (name === 'quest') UI.refreshQuest();
    if (name === 'map') UI.refreshMap();
    if (name === 'lobby') UI.refreshLobby();
    /* 大地图需要持续刷新玩家位置标记 */
  };
  UI.closeAll = function () {
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) panels[i].style.display = 'none';
    UI.panel = null;
    if (UI.game && UI.game.state === 'play') L.Input.enabled = true;
  };

  /* ---- 背包面板 ---- */
  UI.refreshInv = function () {
    var p = UI.game.player;
    var slots = ['weapon', 'helmet', 'chest', 'legging', 'boots'];
    var slotNames = { weapon: '武器', helmet: '头盔', chest: '护甲', legging: '护腿', boots: '鞋' };
    var eq = $('inv-equipped'), bag = $('inv-bag');
    eq.innerHTML = ''; bag.innerHTML = '';

    for (var i = 0; i < slots.length; i++) {
      var key = slots[i];
      var it = p.slots[key];
      var div = document.createElement('div');
      div.className = 'item-row';
      if (it) {
        div.innerHTML = '<span class="item-name q-' + it.quality + '">' + Loot.itemName(it) + '</span>' +
          '<button data-slot="' + key + '" class="btn-mini btn-unequip">卸下</button>';
      } else {
        div.innerHTML = '<span class="item-name dim">[' + slotNames[key] + '] 空</span>';
      }
      eq.appendChild(div);
    }
    /* 卸下按钮 */
    var uneqs = eq.querySelectorAll('.btn-unequip');
    for (var u = 0; u < uneqs.length; u++) {
      uneqs[u].onclick = function () {
        UI.game.player.unequip(this.getAttribute('data-slot'));
        UI.refreshInv(); UI.refreshHud();
      };
    }

    /* 背包列表 */
    if (p.inventory.length === 0) bag.innerHTML = '<div class="dim" style="padding:8px">背包空空如也，去打怪开宝箱吧！</div>';
    for (var j = 0; j < p.inventory.length; j++) {
      var item = p.inventory[j];
      var row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = '<span class="item-name q-' + item.quality + '">' + Loot.itemName(item) + '</span>' +
        '<button data-uid="' + item.uid + '" class="btn-mini btn-equip">装备</button>' +
        '<button data-uid="' + item.uid + '" class="btn-mini btn-drop">丢弃</button>';
      row.title = Loot.itemDesc(item);
      bag.appendChild(row);
    }
    var equips = bag.querySelectorAll('.btn-equip');
    for (var e = 0; e < equips.length; e++) {
      equips[e].onclick = function () {
        var uid = parseInt(this.getAttribute('data-uid'), 10);
        var item = null;
        for (var k = 0; k < p.inventory.length; k++) if (p.inventory[k].uid === uid) item = p.inventory[k];
        if (item) { p.equip(item); UI.refreshInv(); UI.refreshHud(); }
      };
    }
    var drops = bag.querySelectorAll('.btn-drop');
    for (var d = 0; d < drops.length; d++) {
      drops[d].onclick = function () {
        var uid = parseInt(this.getAttribute('data-uid'), 10);
        for (var k = 0; k < p.inventory.length; k++) {
          if (p.inventory[k].uid === uid) { p.inventory.splice(k, 1); break; }
        }
        UI.refreshInv();
      };
    }
  };

  /* ---- 任务面板 ---- */
  UI.refreshQuest = function () {
    var wrap = $('quest-list');
    wrap.innerHTML = '';
    /* 进行中 */
    for (var i = 0; i < Quest.active.length; i++) {
      var a = Quest.active[i], q = Quest.byId(a.id);
      if (!q) continue;
      var div = document.createElement('div');
      div.className = 'quest-row' + (a.progress >= q.need ? ' ready' : '');
      div.innerHTML = '<b>' + q.name + '</b> <span class="dim">' + a.progress + '/' + q.need + '</span>' +
        '<div class="quest-desc">' + q.desc + '</div>' +
        '<div class="dim">奖励：银币' + q.reward.silver + ' 经验' + q.reward.exp +
        (q.reward.item ? ' +概率装备' : '') + '</div>' +
        (a.progress >= q.need ? '<button class="btn-mini btn-turnin" data-id="' + q.id + '">交付领取</button>' : '');
      wrap.appendChild(div);
    }
    /* 可接取 */
    var avail = Quest.available();
    if (avail.length) {
      var head = document.createElement('div');
      head.className = 'quest-head';
      head.textContent = '可接取任务（找营地 NPC 接取）';
      wrap.appendChild(head);
      for (var j = 0; j < avail.length; j++) {
        var q2 = avail[j];
        var d2 = document.createElement('div');
        d2.className = 'quest-row';
        d2.innerHTML = '<b>' + q2.name + '</b><div class="quest-desc">' + q2.desc + '</div>';
        wrap.appendChild(d2);
      }
    }
    /* 交付按钮 */
    var turns = wrap.querySelectorAll('.btn-turnin');
    for (var t = 0; t < turns.length; t++) {
      turns[t].onclick = function () {
        var res = Quest.turnIn(this.getAttribute('data-id'), UI.game.player, UI.game);
        if (res) {
          UI.toast('任务完成：' + res.quest.name + '！', '#9dff70');
          for (var x = 0; x < res.texts.length; x++) UI.toast(res.texts[x], '#ffd750');
        }
        UI.refreshQuest(); UI.refreshHud();
      };
    }
  };

  /* NPC 对话打开的任务面板（带接取按钮） */
  UI.openQuestPanel = function (npc) {
    UI.togglePanel('quest');
    var wrap = $('quest-list');
    var avail = Quest.available();
    var head = document.createElement('div');
    head.className = 'quest-head';
    head.innerHTML = '💬 ' + npc.name + '：' + npc.greet;
    wrap.insertBefore(head, wrap.firstChild);
    if (avail.length) {
      for (var i = 0; i < avail.length; i++) {
        var q = avail[i];
        var div = document.createElement('div');
        div.className = 'quest-row accept';
        div.innerHTML = '<b>' + q.name + '</b><div class="quest-desc">' + q.desc + '</div>' +
          '<button class="btn-mini btn-accept" data-id="' + q.id + '">接取任务</button>';
        wrap.appendChild(div);
      }
      var accs = wrap.querySelectorAll('.btn-accept');
      for (var a = 0; a < accs.length; a++) {
        accs[a].onclick = function () {
          Quest.accept(this.getAttribute('data-id'));
          UI.toast('已接取任务', '#9dff70');
          UI.closeAll();
        };
      }
    }
  };

  UI.openShopPanel = function (npc) {
    /* 简易商店：银币购买药水 */
    var p = UI.game.player;
    var cost = 50;
    if (p.silver >= cost) {
      p.silver -= cost; p.potions++;
      UI.toast('向 ' + npc.name + ' 购买药水 -' + cost + ' 银币（剩余 ' + p.potions + ' 瓶）', '#ff9aa2');
    } else {
      UI.toast('银币不足（需要 ' + cost + '）', '#ff9aa2');
    }
    UI.refreshHud();
  };

  /* ---- 大地图面板 ---- */
  UI.refreshMap = function () {
    var cv = $('bigmap');
    var ctx = cv.getContext('2d');
    var size = cv.width;
    var game = UI.game;
    /* 底图 */
    var mm = L.World.minimapData(160);
    var n = mm.size, cellPx = size / n;
    ctx.fillStyle = '#0a0f18'; ctx.fillRect(0, 0, size, size);
    for (var i = 0; i < mm.cells.length; i++) {
      var gx = i % n, gy = Math.floor(i / n);
      var rg = Config.getRegionAt(Math.floor(gx * Config.MAP_SIZE / n), Math.floor(gy * Config.MAP_SIZE / n));
      var known = World.explored[rg.id] || rg.id === 'camp';
      ctx.fillStyle = known ? mm.cells[i] : '#141a26';
      ctx.fillRect(gx * cellPx, gy * cellPx, cellPx + 1, cellPx + 1);
    }
    /* 区域名 */
    ctx.textAlign = 'center';
    for (var r = 0; r < Config.REGIONS.length; r++) {
      var rr = Config.REGIONS[r];
      if (rr.id === 'wild') continue;
      var mx = rr.cx / Config.MAP_SIZE * size, my = rr.cy / Config.MAP_SIZE * size;
      var known2 = World.explored[rr.id];
      ctx.fillStyle = World.liberated[rr.id] ? '#9dff70' : (known2 ? '#e8e8d8' : '#556');
      ctx.font = 'bold 11px monospace';
      ctx.fillText(rr.name, mx, my - 4);
      ctx.fillStyle = '#8899aa';
      ctx.font = '9px monospace';
      ctx.fillText(rr.dir + (World.liberated[rr.id] ? ' ✓已解放' : ''), mx, my + 8);
    }
    /* 传送点（可点击传送） */
    var self = this;
    UI._tpHits = [];
    for (var t = 0; t < World.teleports.length; t++) {
      var tp = World.teleports[t];
      var tx = tp.x / Config.MAP_SIZE * size, ty = tp.y / Config.MAP_SIZE * size;
      ctx.fillStyle = tp.unlocked ? '#5ad0ff' : '#445';
      ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 6.29); ctx.fill();
      UI._tpHits.push({ x: tx, y: ty, tp: tp });
    }
    /* 玩家位置 */
    var p = game.player;
    ctx.fillStyle = '#ff4040';
    ctx.beginPath(); ctx.arc(p.x / Config.MAP_SIZE * size, p.y / Config.MAP_SIZE * size, 5, 0, 6.29); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

    /* 点击传送（仅限已解锁传送点） */
    cv.onclick = function (ev) {
      var rect = cv.getBoundingClientRect();
      var cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
      for (var h = 0; h < UI._tpHits.length; h++) {
        var hit = UI._tpHits[h];
        if (Utils.dist(cx, cy, hit.x, hit.y) < 9) {
          if (!hit.tp.unlocked) { UI.toast('该传送点尚未解锁（先去探索该区域）', '#ff9aa2'); return; }
          game.player.x = hit.tp.x; game.player.y = hit.tp.y;
          UI.toast('传送到：' + hit.tp.name, '#5ad0ff');
          UI.closeAll();
          return;
        }
      }
    };
  };

  /* ---- 联机大厅 ---- */
  UI.refreshLobby = function () {
    $('lobby-name').value = $('lobby-name').value || UI.game.player.name;
    var status = $('lobby-status');
    var count = L.Net.count();
    status.textContent = L.Net.status === 'solo'
      ? ('当前单机。联机大厅支持 1-4 人（可一个人玩）。PeerJS：' + (L.Net.available() ? '可用' : '未加载(离线)'))
      : ('房间 ' + L.Net.code + '，当前 ' + count + '/4 人');
    /* 队友列表 */
    var list = $('lobby-peers');
    list.innerHTML = '';
    var names = [UI.game.player.name + '（我）'];
    for (var id in L.Net.peers) names.push(L.Net.peers[id].name);
    for (var i = 0; i < names.length; i++) {
      var div = document.createElement('div');
      div.className = 'peer-row';
      div.textContent = '● ' + names[i];
      list.appendChild(div);
    }
  };

  /* ---- HUD 刷新 ---- */
  UI.refreshHud = function () {
    var p = UI.game.player;
    $('hud-hp-fill').style.width = Math.max(0, (p.hp / p.maxHp * 100)) + '%';
    $('hud-hp-text').textContent = Math.ceil(p.hp) + '/' + p.maxHp;
    var need = Config.expForLevel(p.lv);
    $('hud-exp-fill').style.width = (p.lv >= Config.PLAYER_MAX_LEVEL ? 100 : Math.min(100, p.exp / need * 100)) + '%';
    $('hud-exp-text').textContent = p.lv >= Config.PLAYER_MAX_LEVEL ? 'MAX' : (p.exp + '/' + need);
    $('hud-lv').textContent = 'Lv' + p.lv;
    $('hud-silver').textContent = p.silver;
    $('hud-potion').textContent = '🧪×' + p.potions;
    $('hud-region').textContent = Config.getRegionAt(Math.floor(p.x), Math.floor(p.y)).name;
    $('hud-diff').textContent = '难度 ' + UI.game.difficulty.toFixed(2);
    $('hud-dmg').textContent = Math.round(p.stats.dmg);
    $('hud-def').textContent = Math.round(p.stats.def);
    /* 武器名 */
    var w = p.slots.weapon;
    $('hud-weapon').textContent = w ? Loot.itemName(w) : '空手';
    if (w) $('hud-weapon').className = 'hud-weapon q-' + w.quality;
  };

  /* ---- HUD 小地图（由 game 循环每 0.2s 调一次） ---- */
  UI.drawHudMinimap = function () {
    var cv = $('hud-minimap');
    var ctx = cv.getContext('2d');
    L.Renderer.drawMinimap(ctx, UI.game, 0, 0, cv.width);
  };

  /* ---- 死亡结算 ---- */
  UI.showDeath = function () {
    var g = UI.game, p = g.player;
    var box = $('death-panel');
    box.style.display = 'block';
    $('death-stats').innerHTML =
      '等级 Lv' + p.lv + '　银币 ' + p.silver + '<br>' +
      '本次击杀 ' + g.totalKills + ' 只怪物　探索区域 ' + Object.keys(World.explored).length + ' 个';
    $('btn-respawn').onclick = function () { g.respawn(); };
    $('btn-death-save').onclick = function () { L.Save.save(g); UI.toast('已保存', '#9dff70'); };
  };

  L.UI = UI;
})(window);
