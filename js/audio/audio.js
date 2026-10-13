/* ============================================================================
   js/audio/audio.js —— 程序化 8-bit 音频（Q58：程序生成BGM+音效）
   ----------------------------------------------------------------------------
   职责：用 WebAudio API 合成芯片音乐（每区域一曲）与音效，零外部音频文件。

   对外接口（window.LG.Sound）：
     .init() .play(sfxName) .bgm(regionId) .stopBgm()
     .setVolume(v, which)  which='music'|'sfx'

   实现：用 OscillatorNode 方波/三角波按音符序列播放，简单音序器循环。
   依赖：无；首次需在用户手势后调用 init（浏览器自动播放策略）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  let ctx = null, musicGain = null, sfxGain = null, bgmTimer = null, curBgm = null;

  const VOL = () => LG.U.LS.get('vol', { music: 0.5, sfx: 0.7 });

  /* 五声音阶频率（8-bit 感） */
  const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
  // 每区域一段旋律种子，用种子随机生成旋律，风格统一但各区域不同
  function melodyFor(regionId) {
    const seed = regionId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const r = LG.U.rng(seed);
    const seq = [];
    for (let i = 0; i < 16; i++) seq.push(SCALE[(r() * SCALE.length) | 0]);
    return seq;
  }

  function note(freq, t, dur, type, gainNode) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(gainNode);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function bgm(regionId) {
    if (!ctx || curBgm === regionId) return;
    curBgm = regionId;
    stopBgm();
    const seq = melodyFor(regionId);
    let i = 0;
    // 120BPM，每音符0.25s，循环播放
    bgmTimer = setInterval(() => {
      if (!ctx) return;
      note(seq[i % seq.length], ctx.currentTime, 0.22, 'square', musicGain);
      if (i % 4 === 0) note(seq[0] / 2, ctx.currentTime, 0.2, 'triangle', musicGain); // 低音
      i++;
    }, 250);
  }
  function stopBgm() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

  /* 音效合成：短促方波/噪声 */
  const SFX = {
    hit: () => blip(220, 0.08, 'square'),
    crit: () => blip(660, 0.12, 'square'),
    shoot: () => blip(880, 0.05, 'sawtooth'),
    pickup: () => { blip(523, 0.06, 'square'); setTimeout(() => blip(784, 0.08, 'square'), 60); },
    levelup: () => { [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => blip(f, 0.12, 'square'), k * 90)); },
    death: () => blip(110, 0.4, 'sawtooth'),
    block: () => blip(160, 0.1, 'triangle'),
    ui: () => blip(440, 0.04, 'square'),
    boss: () => { blip(80, 0.5, 'sawtooth'); setTimeout(() => blip(60, 0.6, 'sawtooth'), 200); },
  };
  function blip(freq, dur, type) {
    if (!ctx) return;
    note(freq, ctx.currentTime, dur, type, sfxGain);
  }

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const v = VOL();
      musicGain = ctx.createGain(); musicGain.gain.value = v.music; musicGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = v.sfx; sfxGain.connect(ctx.destination);
    } catch (e) { /* 无音频环境（如某些 WebView）静默降级 */ }
  }

  LG.Sound = {
    init, bgm, stopBgm,
    play(name) { if (SFX[name]) SFX[name](); },
    setVolume(v, which) {
      const cur = VOL(); cur[which] = v; LG.U.LS.set('vol', cur);
      if (which === 'music' && musicGain) musicGain.gain.value = v;
      if (which === 'sfx' && sfxGain) sfxGain.gain.value = v;
    },
  };
})();
