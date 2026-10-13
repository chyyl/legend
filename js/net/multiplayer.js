/* =============================================================================
 * 文件：js/net/multiplayer.js
 * 职责：多人联机（要求：默认大厅显示联机大厅 1-4 人，可一个人玩；GitHub 部署 + APK 离线）。
 *       采用 PeerJS(WebRTC) 免费公共信令，零服务器成本：
 *         - 房主 createRoom() 得到 6 位房间码，最多 3 人加入（合计 4 人）
 *         - 加入方 joinRoom(code)
 *         - 数据协议：{t:'hello'|'pos'|'state'|'enemy'|'chat'|'leave', ...}
 *       联机模型：主机权威——主机模拟敌人与掉落，客户端上报自己位置，
 *       主机把玩家/敌人快照广播给所有人。单人时本模块完全旁路，不影响单机。
 * 依赖：PeerJS（CDN，index.html 引入；离线时自动降级为"仅单机"）
 * 对外接口（Legend.Net）：
 *   - available()                         PeerJS 是否可用
 *   - createRoom(name, cb)                建房 -> cb({ok, code})
 *   - joinRoom(code, name, cb)            加入 -> cb({ok, code})
 *   - leave()                             离开房间
 *   - send(obj)                           发送消息
 *   - onMessage(fn)                       接收消息回调
 *   - isHost / peers                      房主标记 / 当前队友表 {id:{name,x,y,hp,lv}}
 *   - status                              'solo' | 'connecting' | 'hosting' | 'joined'
 * 被引用：ui.js（联机大厅面板）、game.js（每帧同步）
 * =============================================================================
 */
(function (global) {
  'use strict';
  var L = global.Legend = global.Legend || {};

  var Net = {
    status: 'solo',
    isHost: false,
    code: null,
    selfName: '勇者',
    peers: {},            // id -> {name,x,y,hp,lv,dir,weapon}
    _peer: null,
    _conns: {},           // 房主：已连接的连接对象
    _msgFn: null,
    MAX: 4
  };

  Net.available = function () { return typeof global.Peer !== 'undefined'; };

  /* 房间码 -> 确定性 PeerJS id，双方都能算出目标连接地址 */
  function codeToPeerId(code) { return 'legend-room-' + code; }

  function makeCode() {
    var s = '';
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉易混的 I/O/0/1
    for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  Net.onMessage = function (fn) { Net._msgFn = fn; };
  function emit(data) { if (Net._msgFn) Net._msgFn(data); }

  /* ---- 建房 ---- */
  Net.createRoom = function (name, cb) {
    if (!Net.available()) { cb && cb({ ok: false, err: '联机组件未加载（离线模式）' }); return; }
    Net.selfName = name || '房主';
    Net.status = 'connecting';
    Net.code = makeCode();
    /* 用房间码派生固定 id，加入方直接连接该 id，无需额外信令服务器 */
    var peer = new global.Peer(codeToPeerId(Net.code));
    Net._peer = peer;
    peer.on('open', function () {
      Net.isHost = true; Net.status = 'hosting';
      cb && cb({ ok: true, code: Net.code });
    });
    peer.on('unavailable-id', function () {
      Net.code = makeCode();
      peer.reconnect();
      cb && cb({ ok: true, code: Net.code });
    });
    peer.on('connection', function (conn) {
      if (Object.keys(Net._conns).length >= Net.MAX - 1) { conn.close(); return; }  // 最多 4 人
      Net._conns[conn.peer] = conn;
      bindConn(conn, true);
      conn.on('open', function () {
        conn.send({ t: 'welcome', id: conn.peer, name: Net.selfName, players: collectPlayers() });
      });
    });
    peer.on('error', function (e) { cb && cb({ ok: false, err: '建房失败：' + e.type }); });
  };

  function collectPlayers() {
    var out = [];
    for (var id in Net.peers) out.push({ id: id, name: Net.peers[id].name });
    out.push({ id: 'host', name: Net.selfName });
    return out;
  }

  /* ---- 加入 ---- */
  Net.joinRoom = function (code, name, cb) {
    if (!Net.available()) { cb && cb({ ok: false, err: '联机组件未加载（离线模式）' }); return; }
    Net.selfName = name || '队友';
    Net.status = 'connecting';
    var peer = new global.Peer();
    Net._peer = peer;
    peer.on('open', function () {
      var target = codeToPeerId(code.trim().toUpperCase());
      var conn = peer.connect(target, { reliable: false });
      var tried = 0;
      var timer = global.setTimeout(function () {
        if (Net.status === 'connecting') cb && cb({ ok: false, err: '房间不存在或已满' });
      }, 8000);
      conn.on('open', function () {
        global.clearTimeout(timer);
        Net.isHost = false; Net.status = 'joined'; Net.code = code;
        Net._conns['host'] = conn;
        bindConn(conn, false);
        conn.send({ t: 'hello', name: Net.selfName });
        cb && cb({ ok: true, code: code });
      });
      conn.on('error', function () { tried++; });
      conn.on('close', function () {
        if (Net.status === 'joined') { Net.status = 'solo'; emit({ t: 'disconnect' }); }
      });
    });
    peer.on('error', function (e) { cb && cb({ ok: false, err: '加入失败：' + e.type }); });
  };

  function bindConn(conn, isHostSide) {
    conn.on('data', function (d) {
      if (!d || !d.t) return;
      if (d.t === 'hello' && isHostSide) {
        Net.peers[d.id || conn.peer] = { name: d.name, x: 0, y: 0, hp: 100, lv: 1, dir: 0 };
        /* 转发欢迎消息给新成员 */
        conn.send({ t: 'welcome', id: conn.peer, name: Net.selfName, players: collectPlayers() });
      } else if (d.t === 'welcome') {
        Net.peers = {};
        for (var i = 0; i < d.players.length; i++) {
          if (d.players[i].id === d.id) continue;
          Net.peers[d.players[i].id] = { name: d.players[i].name, x: 0, y: 0, hp: 100, lv: 1, dir: 0 };
        }
        emit({ t: 'welcome', players: d.players });
      } else if (d.t === 'pos') {
        if (Net.peers[d.id]) {
          var p = Net.peers[d.id];
          p.x = d.x; p.y = d.y; p.hp = d.hp; p.lv = d.lv; p.dir = d.dir;
          p.atk = d.atk;
        }
        emit(d);
      } else if (d.t === 'chat') {
        emit(d);
        if (isHostSide) broadcast(d, conn.peer);     // 房主转发聊天
      } else if (d.t === 'leave') {
        delete Net.peers[d.id];
        if (isHostSide) broadcast(d);
        emit(d);
      } else {
        emit(d);
      }
    });
    conn.on('close', function () {
      delete Net.peers[isHostSide ? conn.peer : 'host'];
      delete Net._conns[isHostSide ? conn.peer : 'host'];
      emit({ t: 'leave', id: conn.peer });
    });
  }

  function broadcast(obj, exceptId) {
    for (var id in Net._conns) {
      if (id === exceptId) continue;
      try { Net._conns[id].send(obj); } catch (e) { /* 忽略断线 */ }
    }
  }

  /* ---- 每帧由 game.js 调用：发送自己位置 ---- */
  Net.syncSelf = function (player) {
    if (Net.status !== 'hosting' && Net.status !== 'joined') return;
    var msg = {
      t: 'pos', id: Net.isHost ? 'host' : (Net._peer ? Net._peer.id : 'me'),
      x: Math.round(player.x * 100) / 100, y: Math.round(player.y * 100) / 100,
      hp: Math.round(player.hp), lv: player.lv, dir: Math.round(player.dir * 100) / 100,
      atk: player.atkAnim > 0
    };
    if (Net.isHost) broadcast(msg);
    else if (Net._conns['host']) { try { Net._conns['host'].send(msg); } catch (e) {} }
  };

  /* 主机广播敌人快照（客户端只渲染不模拟） */
  Net.syncEnemies = function (list) {
    if (!Net.isHost) return;
    var slim = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;
      slim.push({ x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10,
                  hp: Math.round(e.hp), mh: e.maxHp, r: e.rank, lv: e.lv,
                  c: e.tpl.color, s: e.radius, d: Math.round(e.dir * 100) / 100 });
    }
    broadcast({ t: 'enemy', list: slim });
  };

  Net.send = function (obj) {
    if (Net.isHost) broadcast(obj);
    else if (Net._conns['host']) { try { Net._conns['host'].send(obj); } catch (e) {} }
  };

  Net.leave = function () {
    try { Net.send({ t: 'leave', id: Net._peer ? Net._peer.id : 'me' }); } catch (e) {}
    for (var id in Net._conns) { try { Net._conns[id].close(); } catch (e) {} }
    if (Net._peer) { try { Net._peer.destroy(); } catch (e) {} }
    Net._peer = null; Net._conns = {}; Net.peers = {};
    Net.status = 'solo'; Net.isHost = false; Net.code = null;
  };

  Net.count = function () {
    return (Net.status === 'hosting' || Net.status === 'joined') ? Object.keys(Net.peers).length + 1 : 1;
  };

  L.Net = Net;
})(window);
