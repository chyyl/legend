/**
 * Web Audio Synthesis + External Music Layers
 * Adaptive crossfading between states: explore/combat/danger/town/boss
 */

export const AUDIO_STATES = {
  EXPLORE: 'explore',
  COMBAT: 'combat',
  DANGER: 'danger',
  TOWN: 'town',
  BOSS: 'boss',
  VICTORY: 'victory',
  DEATH: 'death'
};

export function createAudioEngine(opts = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.value = opts.masterVolume || 0.7;

  // State music layers (each is a GainNode for crossfading)
  const stateLayers = {};
  const layerGains = {};

  // SFX cache
  const sfxBuffers = new Map();
  const sfxSources = new Set();

  // Current state
  let currentState = AUDIO_STATES.EXPLORE;
  let targetState = AUDIO_STATES.EXPLORE;
  let crossfadeTime = 0;
  const CROSSFADE_DURATION = 2.0; // seconds

  // Music tracks (external files)
  const musicTracks = {
    [AUDIO_STATES.EXPLORE]: { url: 'audio/music_explore.ogg', loops: true, volume: 0.5 },
    [AUDIO_STATES.COMBAT]: { url: 'audio/music_combat.ogg', loops: true, volume: 0.6 },
    [AUDIO_STATES.DANGER]: { url: 'audio/music_danger.ogg', loops: true, volume: 0.55 },
    [AUDIO_STATES.TOWN]: { url: 'audio/music_town.ogg', loops: true, volume: 0.4 },
    [AUDIO_STATES.BOSS]: { url: 'audio/music_boss.ogg', loops: true, volume: 0.7 },
    [AUDIO_STATES.VICTORY]: { url: 'audio/music_victory.ogg', loops: false, volume: 0.6 },
    [AUDIO_STATES.DEATH]: { url: 'audio/music_death.ogg', loops: false, volume: 0.5 }
  };

  // Initialize state layers
  for (const state of Object.values(AUDIO_STATES)) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(masterGain);
    layerGains[state] = gain;
    stateLayers[state] = { source: null, gain, playing: false };
  }

  // Set initial state
  layerGains[currentState].gain.value = 1;

  async function loadMusicTrack(state) {
    const track = musicTracks[state];
    if (!track || track.loaded) return;

    try {
      const response = await fetch(track.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      track.buffer = audioBuffer;
      track.loaded = true;
    } catch (e) {
      console.warn(`Failed to load music: ${track.url}`, e);
      track.failed = true;
    }
  }

  async function playStateMusic(state) {
    if (stateLayers[state].playing) return;

    await loadMusicTrack(state);
    const track = musicTracks[state];
    if (!track.buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.loop = track.loops;
    source.connect(layerGains[state]);
    source.start(0);
    stateLayers[state] = { source, gain: layerGains[state], playing: true };
  }

  function stopStateMusic(state) {
    const layer = stateLayers[state];
    if (layer.source) {
      layer.source.stop();
      layer.source.disconnect();
      layer.source = null;
      layer.playing = false;
    }
  }

  function setState(state, immediate = false) {
    if (state === currentState && !immediate) return;
    targetState = state;

    if (immediate) {
      // Instant switch
      for (const s of Object.values(AUDIO_STATES)) {
        layerGains[s].gain.value = s === state ? 1 : 0;
        if (s !== state) stopStateMusic(s);
      }
      playStateMusic(state);
      currentState = state;
      crossfadeTime = 0;
    } else {
      // Crossfade
      crossfadeTime = CROSSFADE_DURATION;
      playStateMusic(state);
    }
  }

  function update(dt) {
    if (crossfadeTime > 0) {
      crossfadeTime = Math.max(0, crossfadeTime - dt);
      const t = 1 - crossfadeTime / CROSSFADE_DURATION;
      const eased = t * t * (3 - 2 * t); // smoothstep

      for (const s of Object.values(AUDIO_STATES)) {
        if (s === targetState) {
          layerGains[s].gain.value = eased;
        } else if (s === currentState) {
          layerGains[s].gain.value = 1 - eased;
        } else {
          layerGains[s].gain.value = 0;
        }
      }

      if (crossfadeTime === 0) {
        stopStateMusic(currentState);
        currentState = targetState;
      }
    }

    // Clean up finished SFX
    for (const src of sfxSources) {
      if (src.playbackState === src.FINISHED_STATE || ctx.currentTime > src._endTime) {
        src.disconnect();
        sfxSources.delete(src);
      }
    }
  }

  function setMasterVolume(vol) {
    masterGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  // --- Procedural SFX Synthesis ---

  function playSFX(name, opts = {}) {
    const { volume = 1, pitch = 1, pan = 0, delay = 0 } = opts;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panNode = ctx.createStereoPanner();

    osc.connect(gain);
    gain.connect(panNode);
    panNode.connect(masterGain);

    panNode.pan.value = Math.max(-1, Math.min(1, pan));

    const now = ctx.currentTime + delay;
    const dur = getSFXDuration(name);

    // Configure oscillator based on SFX type
    configureSFX(osc, gain, name, now, dur, volume, pitch);

    osc.start(now);
    osc.stop(now + dur);

    src._endTime = now + dur;
    sfxSources.add(osc);

    return osc;
  }

  function configureSFX(osc, gain, name, now, dur, volume, pitch) {
    const env = gain.gain;
    env.setValueAtTime(0, now);

    switch (name) {
      case 'attack': {
        // Sharp click + tone
        osc.type = 'square';
        osc.frequency.setValueAtTime(200 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(80 * pitch, now + 0.05);
        env.setValueAtTime(0.3 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.1);
        break;
      }
      case 'attack_heavy': {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(50 * pitch, now + 0.08);
        env.setValueAtTime(0.4 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.15);
        break;
      }
      case 'dash': {
        // Whoosh noise
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(100 * pitch, now + 0.15);
        env.setValueAtTime(0.2 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.2);
        break;
      }
      case 'hit': {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(100 * pitch, now + 0.05);
        env.setValueAtTime(0.25 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.08);
        break;
      }
      case 'hit_crit': {
        osc.type = 'square';
        osc.frequency.setValueAtTime(500 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(200 * pitch, now + 0.03);
        env.setValueAtTime(0.3 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.06);
        break;
      }
      case 'heal': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400 * pitch, now);
        osc.frequency.setValueAtTime(600 * pitch, now + 0.1);
        osc.frequency.setValueAtTime(800 * pitch, now + 0.2);
        env.setValueAtTime(0.2 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.3);
        break;
      }
      case 'pickup': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(1200 * pitch, now + 0.1);
        env.setValueAtTime(0.15 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.15);
        break;
      }
      case 'levelup': {
        osc.type = 'triangle';
        [400, 500, 600, 800].forEach((f, i) => {
          osc.frequency.setValueAtTime(f * pitch, now + i * 0.08);
        });
        env.setValueAtTime(0.25 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.5);
        break;
      }
      case 'door': {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(80 * pitch, now + 0.1);
        env.setValueAtTime(0.2 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.15);
        break;
      }
      case 'portal': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(400 * pitch, now + 0.2);
        osc.frequency.exponentialRampToValueAtTime(100 * pitch, now + 0.5);
        env.setValueAtTime(0.3 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.6);
        break;
      }
      case 'death': {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(50 * pitch, now + 0.5);
        env.setValueAtTime(0.4 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.6);
        break;
      }
      case 'footstep': {
        // Noise burst
        const buffer = createNoiseBuffer(ctx, 0.05);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const g = ctx.createGain();
        src.connect(g);
        g.connect(masterGain);
        g.gain.setValueAtTime(0.1 * volume, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        src.start(now);
        return;
      }
      default: {
        osc.type = 'sine';
        osc.frequency.value = 440 * pitch;
        env.setValueAtTime(0.1 * volume, now);
        env.exponentialRampToValueAtTime(0.001, now + 0.1);
      }
    }
  }

  function getSFXDuration(name) {
    const durations = {
      attack: 0.1, attack_heavy: 0.15, dash: 0.2, hit: 0.08,
      hit_crit: 0.06, heal: 0.3, pickup: 0.15, levelup: 0.5,
      door: 0.15, portal: 0.6, death: 0.6, footstep: 0.05
    };
    return durations[name] || 0.1;
  }

  function createNoiseBuffer(ctx, duration) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // Resume audio context on user interaction
  function resume() {
    if (ctx.state === 'suspended') ctx.resume();
  }

  return {
    ctx,
    masterGain,
    setState,
    playSFX,
    setMasterVolume,
    update,
    resume,
    getCurrentState: () => currentState,
    AUDIO_STATES
  };
}