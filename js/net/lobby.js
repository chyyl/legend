/* ============================================================================
   js/net/lobby.js —— 联机大厅（Q4 双通道，Q52 在线列表+房间+角色可见）
   ----------------------------------------------------------------------------
   职责：默认首屏即联机大厅（文档要求）。展示在线玩家/房间，提供：
     创建房间（显示完整码+房间码）、加入（粘贴码或输房间码）、单人开始（1人房）。
     角色形象在大厅可见（Q52/Q51）。

   对外接口（window.LG.Lobby）：
     .show()        打开大厅面板（DOM，写入 #overlay）
     .players       当前成员列表（含自己）

   事件：确认开局后 emit 'start_game' {players, host}，由 engine 接管。
   依赖：net(信令)、ui(面板)、assets(角色形象)、config(难度)。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const Lobby = { players: [] };

  /* 成员：{id, name, look, ready} */
  function selfPlayer() {
    const P = LG.Player._raw;
    return { id: 'self', name: P.name || '冒险者', look: P.look || { gender: 'M', hairColor: '#3a2a1a', skin: '#e0b090' } };
  }

  function show() {
    if (!Lobby.players.length) Lobby.players = [selfPlayer()];
    const p = LG.UI.panel(LG.I18n.get('lobby'), '');
    const body = p.querySelector('.pbody');
    body.innerHTML = `
      <div class="lobby-cap">${LG.I18n.get('players_online')}</div>
      <div id="lobby-players" class="lobby-grid"></div>
      <div class="slider-row"><label>${LG.I18n.get('difficulty')}</label>
        <input type="range" id="lobby-diff" min="0" max="2" step="0.1" value="${LG.Net.difficulty}">
        <span class="val" id="lobby-diff-v">${LG.Net.difficulty.toFixed(1)}</span></div>
      <div class="btn-col">
        <button class="btn primary" id="lb-create">${LG.I18n.get('create_room')}</button>
        <button class="btn" id="lb-join">${LG.I18n.get('join_room')}</button>
        <button class="btn" id="lb-solo">${LG.I18n.get('start_solo')}</button>
      </div>
      <div id="lb-codebox" class="code-box" style="display:none">
        <div class="slider-row"><label>${LG.I18n.get('room_code')}</label>
          <input class="inp" id="lb-code" readonly></div>
        <div style="text-align:center">
          <button class="btn small" id="lb-copy">${LG.I18n.get('copy')}</button>
          <button class="btn small" id="lb-accept" style="display:none">${LG.I18n.get('confirm')}</button>
        </div>
        <div class="slider-row" id="lb-ansrow" style="display:none"><label>${LG.I18n.get('paste')}</label>
          <input class="inp" id="lb-answer" placeholder="${LG.I18n.get('enter_code')}"></div>
      </div>
      <div class="lobby-lore">${LG.Config.LORE[LG.I18n.lang].slice(0, 60)}…</div>`;

    renderPlayers();
    // 难度滑块（Q33 连续0-2）
    const ds = body.querySelector('#lobby-diff');
    ds.oninput = () => {
      LG.Net.difficulty = parseFloat(ds.value);
      body.querySelector('#lobby-diff-v').textContent = LG.Net.difficulty.toFixed(1);
      LG.Enemy.setDifficulty(LG.Net.difficulty);
    };

    /* 创建房间：生成房间码+完整连接码 */
    body.querySelector('#lb-create').onclick = async () => {
      const { roomId, code } = await LG.Net.createRoom();
      const box = body.querySelector('#lb-codebox');
      box.style.display = 'block';
      body.querySelector('#lb-code').value = roomId;   // 短码（同浏览器自动连）
      body.querySelector('#lb-code').dataset.full = code;
      body.querySelector('#lb-accept').style.display = 'inline-block';
      body.querySelector('#lb-ansrow').style.display = 'flex'; // 跨设备：贴应答码
      // 房主随时可开局（成员以当前 players 为准）
      const startBtn = document.createElement('button');
      startBtn.className = 'btn primary';
      startBtn.id = 'lb-start';
      startBtn.textContent = (LG.I18n.lang === 'zh' ? '开始游戏' : 'Start') + ' (' + Lobby.players.length + ')';
      startBtn.style.cssText = 'display:block;margin:6px auto 0';
      startBtn.onclick = () => startGame(true);
      box.appendChild(startBtn);
      LG.UI.toast(LG.I18n.get('room_code') + ': ' + roomId);
    };
    body.querySelector('#lb-copy').onclick = () => {
      const el = body.querySelector('#lb-code');
      const full = el.dataset.full || el.value;
      if (navigator.clipboard) navigator.clipboard.writeText(full);
      else { el.select(); document.execCommand('copy'); }
      LG.UI.toast(LG.I18n.get('copied'));
    };
    /* 房主粘贴应答码完成握手 */
    body.querySelector('#lb-accept').onclick = async () => {
      const v = body.querySelector('#lb-answer').value;
      if (v && await LG.Net.acceptAnswer(v)) LG.UI.toast('✓ 连接成功');
      else LG.UI.toast('码无效');
    };
    /* 加入房间 */
    body.querySelector('#lb-join').onclick = async () => {
      const v = prompt(LG.I18n.get('enter_code'));
      if (!v) return;
      const ans = await LG.Net.join(v);
      if (ans) {
        LG.UI.toast(LG.I18n.get('copied') + '应答码→发给房主');
        if (navigator.clipboard) navigator.clipboard.writeText(ans);
        alert(ans); // 跨设备：展示应答码
      } else {
        LG.UI.toast('已发送加入请求，等待房主…');
      }
    };
    /* 单人=1人房（Q1：单人也是联机） */
    body.querySelector('#lb-solo').onclick = () => startGame(true);

    // 联机状态与新成员
    LG.U.bus.off('lobby_net');
    LG.U.bus.on('net_state', (s) => {
      if (s === 'connected') {
        LG.UI.toast('✓ 已连接');
        LG.Net.send({ t: 'join', name: selfPlayer().name, look: selfPlayer().look });
      }
    });
    LG.U.bus.on('net_msg', (m) => {
      if (m.t === 'join' && LG.Net.isHost) {
        Lobby.players.push({ id: 'p' + Lobby.players.length, name: m.name, look: m.look });
        renderPlayers();
        LG.Net.broadcast({ t: 'start', players: Lobby.players, difficulty: LG.Net.difficulty });
      }
      if (m.t === 'start') {
        Lobby.players = m.players; LG.Net.difficulty = m.difficulty;
        startGame(false);
      }
      if (m.t === 'in' && LG.Net.isHost) {
        LG.U.bus.emit('peer_input', m); // engine 应用远端玩家位置
      }
    });
  }

  function renderPlayers() {
    const box = document.getElementById('lobby-players');
    if (!box) return;
    box.innerHTML = '';
    Lobby.players.forEach((pl, i) => {
      const d = document.createElement('div');
      d.className = 'pl-card';
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      cv.className = 'pl-face';
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(LG.Assets.hero(pl.look || {}), 0, 0, 32, 32);
      const nm = document.createElement('div');
      nm.className = 'pl-name';
      nm.textContent = pl.name + (i === 0 ? '★' : '');
      d.appendChild(cv); d.appendChild(nm);
      box.appendChild(d);
    });
  }

  function startGame(solo) {
    if (solo) LG.Net.isHost = true; // 单人=房主（Q1）
    LG.UI.closePanel();
    LG.U.bus.emit('start_game', { players: Lobby.players, host: LG.Net.isHost });
  }

  /* 挂载公开接口（show 必须显式挂到 Lobby 对象上） */
  Lobby.show = show;
  Lobby.startGame = startGame;
  LG.Lobby = Lobby;
})();
