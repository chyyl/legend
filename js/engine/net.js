/**
 * WebRTC P2P Networking — Host Authoritative
 * Signaling via simple WebSocket relay, state sync with deterministic simulation
 */

export const NET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  STATE_SYNC: 'state_sync',
  INPUT: 'input',
  CHAT: 'chat',
  ERROR: 'error'
};

export const PLAYER_ROLES = {
  HOST: 'host',
  CLIENT: 'client'
};

const SIGNALING_SERVERS = [
  'wss://relay1.example.com',
  'wss://relay2.example.com'
];

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export function createNetEngine(opts = {}) {
  const { isHost = false, roomCode = null, maxPlayers = 6 } = opts;

  let localPeerId = null;
  let role = isHost ? PLAYER_ROLES.HOST : PLAYER_ROLES.CLIENT;
  let signalingWs = null;
  let peers = new Map(); // peerId -> { pc, dc, connected, lastSeq }
  let pendingCandidates = new Map(); // peerId -> candidate[]
  let localState = { players: {}, entities: {}, world: {}, tick: 0 };
  let inputBuffer = []; // queued inputs for host
  let lastAckedTick = 0;
  let connectionCallbacks = new Map();

  // Generate peer ID
  localPeerId = generatePeerId();

  // RTCPeerConnection config
  const pcConfig = {
    iceServers: STUN_SERVERS,
    iceCandidatePoolSize: 10
  };

  // Create data channel options
  const dcOptions = { ordered: true, maxRetransmits: 0 }; // unreliable for state, reliable for chat

  function generatePeerId() {
    return 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // --- Signaling ---

  async function connectToSignaling() {
    for (const url of SIGNALING_SERVERS) {
      try {
        signalingWs = new WebSocket(url);
        signalingWs.binaryType = 'arraybuffer';
        await new Promise((resolve, reject) => {
          signalingWs.onopen = resolve;
          signalingWs.onerror = reject;
          setTimeout(reject, 5000);
        });
        break;
      } catch (e) {
        console.warn('Signaling server failed:', url, e);
      }
    }

    if (!signalingWs) throw new Error('No signaling servers available');

    signalingWs.onmessage = handleSignalingMessage;
    signalingWs.onclose = () => {
      console.log('Signaling disconnected');
      emit(NET_EVENTS.DISCONNECT, { reason: 'signaling_lost' });
    };

    // Register or join room
    if (isHost) {
      roomCode = roomCode || generateRoomCode();
      sendSignaling({ type: 'host', room: roomCode, peerId: localPeerId });
    } else {
      sendSignaling({ type: 'join', room: roomCode, peerId: localPeerId });
    }

    return roomCode;
  }

  function sendSignaling(msg) {
    if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
      signalingWs.send(JSON.stringify(msg));
    }
  }

  function handleSignalingMessage(event) {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'hosted':
        console.log('Hosting room:', msg.room);
        emit(NET_EVENTS.CONNECT, { room: msg.room, peerId: localPeerId, role });
        break;

      case 'joined':
        console.log('Joined room:', msg.room);
        emit(NET_EVENTS.CONNECT, { room: msg.room, peerId: localPeerId, role });
        break;

      case 'peer_joined':
        onPeerJoined(msg.peerId, msg.isHost);
        break;

      case 'peer_left':
        onPeerLeft(msg.peerId);
        break;

      case 'offer':
        handleOffer(msg.from, msg.offer);
        break;

      case 'answer':
        handleAnswer(msg.from, msg.answer);
        break;

      case 'candidate':
        handleCandidate(msg.from, msg.candidate);
        break;

      case 'error':
        emit(NET_EVENTS.ERROR, { message: msg.message });
        break;

      case 'room_full':
        emit(NET_EVENTS.ERROR, { message: 'Room is full' });
        break;

      case 'room_not_found':
        emit(NET_EVENTS.ERROR, { message: 'Room not found' });
        break;
    }
  }

  // --- WebRTC Peer Management ---

  function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(pcConfig);
    const dc = pc.createDataChannel('game', dcOptions);

    setupDataChannel(peerId, dc);
    setupPeerConnection(peerId, pc);

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        sendSignaling({ type: 'offer', to: peerId, offer });
      });
    }

    peers.set(peerId, { pc, dc, connected: false, lastSeq: 0 });
    return { pc, dc };
  }

  function setupPeerConnection(peerId, pc) {
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignaling({ type: 'candidate', to: peerId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const peer = peers.get(peerId);
      if (peer) {
        peer.connected = pc.connectionState === 'connected';
        if (peer.connected) {
          console.log('Peer connected:', peerId);
          flushPendingCandidates(peerId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          onPeerLeft(peerId);
        }
      }
    };

    pc.ondatachannel = (e) => {
      setupDataChannel(peerId, e.channel);
    };
  }

  function setupDataChannel(peerId, dc) {
    dc.onopen = () => {
      const peer = peers.get(peerId);
      if (peer) peer.connected = true;
      console.log('Data channel open:', peerId);
    };

    dc.onclose = () => {
      const peer = peers.get(peerId);
      if (peer) peer.connected = false;
    };

    dc.onerror = (e) => console.error('Data channel error:', peerId, e);

    dc.onmessage = (e) => handleDataChannelMessage(peerId, e.data);

    // Update peer reference
    const peer = peers.get(peerId);
    if (peer) peer.dc = dc;
  }

  function handleDataChannelMessage(peerId, data) {
    try {
      const msg = JSON.parse(data);
      handleGameMessage(peerId, msg);
    } catch (e) {
      console.error('Invalid message from', peerId, e);
    }
  }

  function handleGameMessage(peerId, msg) {
    switch (msg.type) {
      case 'state':
        if (role === PLAYER_ROLES.HOST) {
          // Host receives client input
          handleClientInput(peerId, msg);
        } else {
          // Client receives authoritative state
          applyState(msg.state);
        }
        break;

      case 'input':
        if (role === PLAYER_ROLES.HOST) {
          handleClientInput(peerId, msg);
        }
        break;

      case 'chat':
        emit(NET_EVENTS.CHAT, { from: peerId, message: msg.message });
        break;

      case 'ping':
        sendToPeer(peerId, { type: 'pong', time: msg.time });
        break;

      case 'pong':
        // RTT measurement
        break;
    }
  }

  function handleClientInput(peerId, msg) {
    // Validate and queue input for simulation
    const input = {
      peerId,
      tick: msg.tick,
      seq: msg.seq,
      moves: msg.moves,
      actions: msg.actions
    };
    inputBuffer.push(input);
  }

  function applyState(state) {
    localState = state;
    emit(NET_EVENTS.STATE_SYNC, { state: localState });
  }

  // --- Host Simulation Loop ---

  function hostSimulate(dt) {
    if (role !== PLAYER_ROLES.HOST) return;

    // Process input buffer
    inputBuffer.sort((a, b) => a.tick - b.tick || a.seq - b.seq);

    // Advance simulation tick
    localState.tick++;

    // Broadcast state to all peers
    broadcastState();
  }

  function broadcastState() {
    const stateMsg = {
      type: 'state',
      state: localState,
      tick: localState.tick
    };
    broadcast(stateMsg);
  }

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const [peerId, peer] of peers) {
      if (peer.connected && peer.dc) {
        peer.dc.send(data);
      }
    }
  }

  function sendToPeer(peerId, msg) {
    const peer = peers.get(peerId);
    if (peer && peer.connected && peer.dc) {
      peer.dc.send(JSON.stringify(msg));
    }
  }

  // --- Client Input Sending ---

  let clientInputSeq = 0;

  function sendInput(input) {
    if (role === PLAYER_ROLES.HOST) return; // Host applies directly

    const msg = {
      type: 'input',
      tick: localState.tick,
      seq: clientInputSeq++,
      moves: input.moves,
      actions: input.actions
    };

    // Send to host (first peer)
    for (const [peerId, peer] of peers) {
      if (peer.connected) {
        sendToPeer(peerId, msg);
        break;
      }
    }
  }

  // --- Signaling Handlers ---

  function onPeerJoined(peerId, isHostPeer) {
    if (peers.has(peerId)) return;

    console.log('Peer joined:', peerId);
    createPeerConnection(peerId, !isHostPeer); // Initiate if we're not host
    emit(NET_EVENTS.PLAYER_JOIN, { peerId });
  }

  function onPeerLeft(peerId) {
    const peer = peers.get(peerId);
    if (peer) {
      peer.pc.close();
      peers.delete(peerId);
    }
    pendingCandidates.delete(peerId);
    emit(NET_EVENTS.PLAYER_LEAVE, { peerId });
  }

  async function handleOffer(from, offer) {
    const { pc } = createPeerConnection(from, false);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignaling({ type: 'answer', to: from, answer });
  }

  async function handleAnswer(from, answer) {
    const peer = peers.get(from);
    if (peer) {
      await peer.pc.setRemoteDescription(answer);
      flushPendingCandidates(from);
    }
  }

  async function handleCandidate(from, candidate) {
    const peer = peers.get(from);
    if (peer && peer.pc.remoteDescription) {
      await peer.pc.addIceCandidate(candidate);
    } else {
      // Queue for later
      const arr = pendingCandidates.get(from) || [];
      arr.push(candidate);
      pendingCandidates.set(from, arr);
    }
  }

  function flushPendingCandidates(peerId) {
    const candidates = pendingCandidates.get(peerId) || [];
    const peer = peers.get(peerId);
    for (const candidate of candidates) {
      peer.pc.addIceCandidate(candidate).catch(console.error);
    }
    pendingCandidates.delete(peerId);
  }

  // --- Event System ---

  function on(event, callback) {
    if (!connectionCallbacks.has(event)) connectionCallbacks.set(event, []);
    connectionCallbacks.get(event).push(callback);
    return () => off(event, callback);
  }

  function off(event, callback) {
    const arr = connectionCallbacks.get(event);
    if (arr) {
      const idx = arr.indexOf(callback);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  function emit(event, data) {
    const arr = connectionCallbacks.get(event);
    if (arr) arr.forEach(cb => cb(data));
  }

  // --- Public API ---

  function disconnect() {
    for (const [peerId, peer] of peers) {
      peer.pc.close();
    }
    peers.clear();
    if (signalingWs) {
      signalingWs.close();
      signalingWs = null;
    }
  }

  function getPeers() {
    return Array.from(peers.entries()).map(([id, p]) => ({
      id, connected: p.connected, role: id === localPeerId ? role : PLAYER_ROLES.CLIENT
    }));
  }

  function getLocalState() {
    return localState;
  }

  function setLocalState(state) {
    localState = state;
  }

  return {
    connectToSignaling,
    disconnect,
    sendInput,
    broadcast,
    sendToPeer,
    on,
    off,
    getPeers,
    getLocalState,
    setLocalState,
    hostSimulate,
    update: (dt) => { if (role === PLAYER_ROLES.HOST) hostSimulate(dt); },
    get role() { return role; },
    get roomCode() { return roomCode; },
    get peerId() { return localPeerId; },
    NET_EVENTS,
    PLAYER_ROLES
  };
}