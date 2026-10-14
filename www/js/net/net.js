/* ============================================================================
   js/net/net.js —— 联机核心（Q3 WebRTC P2P+房主权威，Q4 双通道，Q5 全功能打包）
   ----------------------------------------------------------------------------
   职责：实现 1-4 人 P2P 联机。无服务器设计：
     - 同浏览器多标签：BroadcastChannel 自动信令（快速加入）
     - 跨设备：复制粘贴完整房间码（SDP 压缩为 base64）
     房主权威：房主模拟世界（敌人/宝箱/掉落），客户端上报自身位置。

   对外接口（window.LG.Net）：
     .isHost .difficulty .peers{} .connected
     .createRoom() -> Promise<{roomId, code}>   创建房间（生成完整码）
     .join(codeOrRoomId) -> Promise<answerCode> 加入房间
     .acceptAnswer(code)                        房主接受应答
     .send(obj)                                 发送消息（客户端->房主）
     .broadcast(obj)                            房主->全体

   消息协议（JSON）：
     {t:'join',name,look} 加入 | {t:'snap',...} 状态快照 | {t:'in',x,y,mode} 输入
     {t:'loot',silver,exp,items} 掉落 | {t:'toast',msg} 提示 | {t:'start'} 开局
   依赖：utils(bus)、config；不依赖玩法模块（经 bus 与上层解耦）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const Net = {
    isHost: false,
    connected: false,
    difficulty: LG.Config.DIFFICULTY.default, // Q33 连续滑块
    roomId: null,
    peers: {},     // id -> {name, look, x, y, hp, down}
    _pc: null, _dc: null, _ch: null,
  };

  const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  /* ---------- 编解码：SDP <-> 房间码 ---------- */
  /* RTCSessionDescription 不可被 BroadcastChannel 结构化克隆，统一转纯对象 */
  function plainSdp(d) { return d ? { type: d.type, sdp: d.sdp } : null; }
  function encode(obj) {
    const s = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '');
  }
  function decode(code) {
    try {
      const b = code.trim() + '==='.slice((code.trim().length + 3) % 4);
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return null; }
  }

  /* ---------- BroadcastChannel：同浏览器自动信令（Q4 局域网通道A） ---------- */
  function chan() {
    if (Net._ch) return Net._ch;
    try { Net._ch = new BroadcastChannel('legend_signal'); } catch (e) { return null; }
    Net._ch.onmessage = async (ev) => {
      const m = ev.data;
      if (!m || !Net.roomId || m.room !== Net.roomId) return;
      try {
        if (m.kind === 'offer' && !Net.isHost && !Net.connected && !Net._gotOffer) {
          // 自动应答（同浏览器快速加入）
          Net._gotOffer = true;
          await ensurePC();
          await Net._pc.setRemoteDescription(m.sdp);
          const ans = await Net._pc.createAnswer();
          await Net._pc.setLocalDescription(ans);
          Net._ch.postMessage({ room: Net.roomId, kind: 'answer', sdp: plainSdp(Net._pc.localDescription), from: 'guest' });
          Net._code = encode({ s: 'answer', id: Net.roomId, d: plainSdp(Net._pc.localDescription) });
        } else if (m.kind === 'answer' && Net.isHost && !Net.connected) {
          await Net._pc.setRemoteDescription(m.sdp);
        } else if (m.kind === 'request' && Net.isHost && Net.roomId === m.room && !Net.connected) {
          // 后加入者请求重发 offer（BroadcastChannel 不缓存，首次 offer 可能错过）
          Net._ch.postMessage({ room: Net.roomId, kind: 'offer', sdp: plainSdp(Net._pc.localDescription) });
        }
      } catch (e) { console.warn('[net] signal', e); }
    };
    return Net._ch;
  }

  async function ensurePC() {
    if (Net._pc) return Net._pc;
    const pc = new RTCPeerConnection(RTC_CFG);
    Net._pc = pc;
    pc.onicecandidate = (e) => { Net._iceDone = !e.candidate; };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnected();
    };
    if (Net.isHost) {
      // 房主创建数据通道
      const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
      bindDC(dc);
    } else {
      pc.ondatachannel = (e) => bindDC(e.channel);
    }
    return pc;
  }

  function bindDC(dc) {
    Net._dc = dc;
    dc.onopen = () => setConnected();
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      LG.U.bus.emit('net_msg', m); // 上层（engine/lobby）订阅处理
    };
    dc.onclose = () => { Net.connected = false; LG.U.bus.emit('net_state', 'closed'); };
  }

  function setConnected() {
    Net.connected = true;
    LG.U.bus.emit('net_state', 'connected');
  }

  /* ---------- 创建房间（房主） ---------- */
  Net.createRoom = async function () {
    Net.isHost = true;
    Net.roomId = Math.random().toString(36).slice(2, 6).toUpperCase();
    await ensurePC();
    const offer = await Net._pc.createOffer();
    await Net._pc.setLocalDescription(offer);
    await waitIce();
    const code = encode({ s: 'offer', id: Net.roomId, d: plainSdp(Net._pc.localDescription) });
    const c = chan();
    if (c) c.postMessage({ room: Net.roomId, kind: 'offer', sdp: plainSdp(Net._pc.localDescription) });
    return { roomId: Net.roomId, code };
  };

  /* ---------- 加入房间（客户端）：返回应答码给房主 ---------- */
  Net.join = async function (input) {
    Net.isHost = false;
    const m = decode(input);
    if (m && m.s === 'offer' && m.d) {
      Net.roomId = m.id;
      await ensurePC();
      await Net._pc.setRemoteDescription(m.d);
      const ans = await Net._pc.createAnswer();
      await Net._pc.setLocalDescription(ans);
      await waitIce();
      return encode({ s: 'answer', id: Net.roomId, d: Net._pc.localDescription });
    }
    // 仅房间码：走 BroadcastChannel 自动信令，请求房主重发 offer
    Net.roomId = (input || '').trim().toUpperCase();
    const c = chan();
    if (c) c.postMessage({ room: Net.roomId, kind: 'request' }); // 主动请求（弥补消息不缓存）
    return ''; // 无需应答码，等待自动连接
  };

  /* ---------- 房主接受应答码 ---------- */
  Net.acceptAnswer = async function (code) {
    const m = decode(code);
    if (m && m.s === 'answer' && m.d && Net._pc) {
      await Net._pc.setRemoteDescription(m.d);
      return true;
    }
    return false;
  };

  function waitIce() {
    return new Promise((res) => {
      if (Net._iceDone) return res();
      const t = setInterval(() => { if (Net._iceDone) { clearInterval(t); res(); } }, 50);
      setTimeout(() => { clearInterval(t); res(); }, 2000); // 超时兜底（无STUN也可同网直连）
    });
  }

  /* ---------- 发送 ---------- */
  Net.send = function (obj) { // 客户端 -> 房主
    if (Net._dc && Net._dc.readyState === 'open') Net._dc.send(JSON.stringify(obj));
  };
  Net.broadcast = function (obj) { // 房主 -> 全体（本实现1条dc即1对1，多客户端时循环 peers）
    Net.send(obj);
  };

  LG.Net = Net;
})();
