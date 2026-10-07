"use strict";
/* Cinderwake — all sound is synthesised at runtime with the Web Audio API.
   No audio files. If the browser has no audio, every call quietly no-ops. */

/* D minor pentatonic, from D4 upward. Kill chains climb this ladder. */
const SCALE = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91, 1567.98];

const AudioSys = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  noiseBuf: null,
  gates: {},

  /** Must be called from a user gesture the first time. */
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      this.master = c.createGain();
      this.sfxBus = c.createGain();
      this.musicBus = c.createGain();
      this.sfxBus.connect(comp);
      this.musicBus.connect(comp);
      comp.connect(this.master);
      this.master.connect(c.destination);

      const len = c.sampleRate;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.ctx = c;
      this.applyVolumes();
    } catch (e) {
      this.ctx = null;
    }
  },

  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  },
  suspend() {
    if (this.ctx && this.ctx.state === "running") {
      const p = this.ctx.suspend();
      if (p && p.catch) p.catch(() => {});
    }
  },

  applyVolumes() {
    if (!this.ctx) return;
    const s = Save.data.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.mute ? 0 : s.master, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.music * 0.8, t, 0.03);
  },

  /** Rate-limit a named sound so stacked events do not clip. */
  gate(name, gap) {
    const now = this.ctx.currentTime;
    if (now - (this.gates[name] || -1) < gap) return false;
    this.gates[name] = now;
    return true;
  },

  tone(o) {
    const c = this.ctx;
    const t0 = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.2, t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(o.bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },

  noise(o) {
    const c = this.ctx;
    const t0 = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    src.loop = true;
    f.type = o.type || "bandpass";
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.2, t0 + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.bus || this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.03);
  },
};

/* ------------------------------------------------------ Sound effects */
const Sfx = {};
function defSfx(name, gap, fn) {
  Sfx[name] = (a, b) => {
    const A = AudioSys;
    if (!A.ctx || A.ctx.state !== "running") return;
    if (gap > 0 && !A.gate(name, gap)) return;
    try {
      fn(A, a, b);
    } catch (e) {
      /* a failed sound must never break the game */
    }
  };
}
const noteAt = (i) => SCALE[clamp(i | 0, 0, SCALE.length - 1)];

defSfx("dash", 0.03, (A, power) => {
  const p = power || 0;
  A.noise({ type: "bandpass", f: 900, f2: 3800 + p * 1500, q: 0.9, dur: 0.16, vol: 0.2 });
  A.tone({ type: "sine", f: 190, f2: 520 + p * 200, dur: 0.11, vol: 0.1 });
});
defSfx("blink", 0.03, (A) => {
  A.tone({ type: "sine", f: 880, f2: 220, dur: 0.1, vol: 0.14 });
  A.noise({ type: "highpass", f: 3000, dur: 0.08, vol: 0.1 });
  A.tone({ type: "triangle", f: 147, f2: 73, dur: 0.22, vol: 0.2, delay: 0.03 });
});
defSfx("dashFail", 0.12, (A) => {
  A.tone({ type: "triangle", f: 130, f2: 90, dur: 0.09, vol: 0.14 });
  A.noise({ type: "lowpass", f: 500, dur: 0.06, vol: 0.08 });
});
defSfx("whiff", 0.05, (A) => {
  A.noise({ type: "bandpass", f: 1400, f2: 500, q: 0.7, dur: 0.14, vol: 0.05, delay: 0.05 });
});
defSfx("nearMiss", 0.08, (A) => {
  A.tone({ type: "sine", f: 1480, f2: 2400, dur: 0.08, vol: 0.11 });
  A.noise({ type: "highpass", f: 4500, dur: 0.05, vol: 0.07 });
});
defSfx("clutchDash", 0.14, (A) => {
  A.tone({ type: "triangle", f: 120, f2: 260, dur: 0.22, vol: 0.18 });
  A.noise({ type: "lowpass", f: 800, f2: 180, dur: 0.2, vol: 0.14 });
});
/* n = position in the current chain (0 for the first kill of a dash). */
defSfx("kill", 0.012, (A, n) => {
  const f = noteAt(n);
  const v = Math.min(0.26, 0.17 + n * 0.012);
  A.tone({ type: "triangle", f, dur: 0.26, vol: v });
  A.tone({ type: "sine", f: f * 2, dur: 0.16, vol: v * 0.45 });
  A.noise({ type: "bandpass", f: 2400, q: 0.8, dur: 0.05, vol: 0.16 });
  A.tone({ type: "sine", f: 150, f2: 60, dur: 0.1, vol: 0.2 });
});
/* A softer pop for kills that did not come straight from your blade. */
defSfx("pop", 0.03, (A, n) => {
  A.tone({ type: "sine", f: noteAt((n || 0) % 6) * 0.5, dur: 0.14, vol: 0.1 });
  A.noise({ type: "bandpass", f: 1500, q: 1, dur: 0.04, vol: 0.08 });
});
defSfx("hit", 0.03, (A) => {
  A.tone({ type: "square", f: 220, f2: 140, dur: 0.07, vol: 0.09 });
  A.noise({ type: "bandpass", f: 1800, q: 1.2, dur: 0.05, vol: 0.14 });
});
defSfx("block", 0.06, (A) => {
  A.tone({ type: "square", f: 1244, dur: 0.16, vol: 0.07 });
  A.tone({ type: "square", f: 1661, dur: 0.12, vol: 0.05 });
  A.tone({ type: "triangle", f: 311, f2: 233, dur: 0.14, vol: 0.14 });
  A.noise({ type: "highpass", f: 4000, dur: 0.04, vol: 0.12 });
});
defSfx("tink", 0.06, (A) => {
  A.tone({ type: "sine", f: 1568, dur: 0.08, vol: 0.06 });
});
/* A cold, clean chime — the timing landed, not the kill count. */
defSfx("perfect", 0.08, (A) => {
  A.tone({ type: "sine", f: 1760, f2: 2217, dur: 0.16, vol: 0.14 });
  A.tone({ type: "triangle", f: 880, dur: 0.3, vol: 0.1, delay: 0.03 });
  A.noise({ type: "highpass", f: 6000, dur: 0.1, vol: 0.06 });
});
/* End-of-dash stinger: the notes you struck, rolled into a chord. */
defSfx("multi", 0.05, (A, k) => {
  const n = Math.min(k, 8);
  for (let i = 0; i < n; i++) {
    A.tone({ type: "triangle", f: noteAt(i + Math.max(0, k - 8)), dur: 0.5 + k * 0.05, vol: 0.085, delay: i * 0.022 });
  }
  A.tone({ type: "sine", f: 73.42, f2: 55, dur: 0.4, vol: 0.2 + Math.min(0.12, k * 0.02) });
  if (k >= 5) A.noise({ type: "highpass", f: 5000, dur: 0.5, vol: 0.07 });
});
defSfx("mote", 0.045, (A) => {
  A.tone({ type: "sine", f: 1760 + Math.random() * 300, dur: 0.05, vol: 0.035 });
});
defSfx("hurt", 0.1, (A) => {
  A.tone({ type: "sawtooth", f: 196, f2: 62, dur: 0.38, vol: 0.2 });
  A.noise({ type: "lowpass", f: 900, f2: 120, dur: 0.32, vol: 0.3 });
  A.tone({ type: "sine", f: 62, f2: 38, dur: 0.4, vol: 0.3 });
});
defSfx("ward", 0.1, (A) => {
  A.tone({ type: "triangle", f: 587, f2: 880, dur: 0.22, vol: 0.14 });
  A.noise({ type: "highpass", f: 3500, dur: 0.12, vol: 0.1 });
});
defSfx("die", 0.5, (A) => {
  A.tone({ type: "sawtooth", f: 220, f2: 36, dur: 1.2, vol: 0.2 });
  A.noise({ type: "lowpass", f: 1400, f2: 80, dur: 1.0, vol: 0.28 });
  [293.66, 277.18, 220, 146.83].forEach((f, i) => A.tone({ type: "triangle", f, dur: 0.6, vol: 0.1, delay: 0.15 + i * 0.16 }));
});
defSfx("revive", 0.5, (A) => {
  [146.83, 220, 293.66, 440, 587.33, 880].forEach((f, i) => A.tone({ type: "triangle", f, dur: 0.5, vol: 0.12, delay: i * 0.06 }));
  A.noise({ type: "bandpass", f: 600, f2: 5000, dur: 0.6, vol: 0.2 });
});
defSfx("lastEmber", 0.5, (A) => {
  A.tone({ type: "sine", f: 110, f2: 55, dur: 0.9, vol: 0.25 });
  A.tone({ type: "sawtooth", f: 220, f2: 82, dur: 0.7, vol: 0.15 });
  A.noise({ type: "lowpass", f: 450, dur: 0.8, vol: 0.2 });
  [330, 247, 196].forEach((f, i) => A.tone({ type: "triangle", f, dur: 0.4, vol: 0.08, delay: i * 0.12 }));
});
defSfx("rekindle", 0.5, (A) => {
  [196, 293.66, 392, 587.33, 784, 1174.66].forEach((f, i) => A.tone({ type: "triangle", f, dur: 0.6, vol: 0.13, delay: i * 0.05 }));
  A.noise({ type: "bandpass", f: 800, f2: 6000, dur: 0.7, vol: 0.22 });
  A.tone({ type: "sine", f: 73.42, f2: 146.83, dur: 0.5, vol: 0.28 });
});
defSfx("telegraph", 0.07, (A) => {
  A.tone({ type: "sine", f: 988, dur: 0.07, vol: 0.05 });
  A.tone({ type: "sine", f: 988, dur: 0.07, vol: 0.05, delay: 0.1 });
});
/* A quiet two-note chirp: "orders are being given" — the Coordinator's pulse. */
defSfx("command", 0.25, (A) => {
  A.tone({ type: "triangle", f: 740, f2: 587, dur: 0.11, vol: 0.06 });
  A.tone({ type: "triangle", f: 587, dur: 0.1, vol: 0.045, delay: 0.09 });
});
defSfx("bolt", 0.04, (A) => {
  A.tone({ type: "square", f: 700, f2: 240, dur: 0.12, vol: 0.06 });
  A.noise({ type: "bandpass", f: 2600, q: 2, dur: 0.06, vol: 0.07 });
});
defSfx("reflect", 0.03, (A) => {
  A.tone({ type: "triangle", f: 1318, f2: 1760, dur: 0.12, vol: 0.12 });
  A.noise({ type: "highpass", f: 5000, dur: 0.04, vol: 0.08 });
});
defSfx("explode", 0.05, (A) => {
  A.noise({ type: "lowpass", f: 1800, f2: 90, dur: 0.42, vol: 0.4 });
  A.tone({ type: "sine", f: 110, f2: 34, dur: 0.4, vol: 0.34 });
});
defSfx("fuse", 0.08, (A) => {
  A.tone({ type: "square", f: 660, dur: 0.04, vol: 0.05 });
});
defSfx("slam", 0.08, (A) => {
  A.noise({ type: "lowpass", f: 700, f2: 60, dur: 0.36, vol: 0.38 });
  A.tone({ type: "sine", f: 82, f2: 30, dur: 0.36, vol: 0.34 });
});
defSfx("lunge", 0.06, (A) => {
  A.noise({ type: "bandpass", f: 500, f2: 2200, q: 1.4, dur: 0.18, vol: 0.12 });
});
defSfx("spawn", 0.09, (A) => {
  A.tone({ type: "sine", f: 110, f2: 196, dur: 0.2, vol: 0.06 });
});
defSfx("shard", 0.03, (A) => {
  A.tone({ type: "triangle", f: 1568, f2: 2093, dur: 0.05, vol: 0.04 });
});
defSfx("burn", 0.08, (A) => {
  A.noise({ type: "bandpass", f: 3200, q: 0.6, dur: 0.1, vol: 0.06 });
});
defSfx("echo", 0.04, (A) => {
  A.noise({ type: "bandpass", f: 2200, f2: 700, q: 1.2, dur: 0.16, vol: 0.09 });
  A.tone({ type: "sine", f: 587, f2: 294, dur: 0.14, vol: 0.06 });
});
defSfx("charge", 0.2, (A) => {
  A.tone({ type: "sine", f: 196, f2: 587, dur: 0.6, vol: 0.05 });
});
defSfx("charged", 0.2, (A) => {
  A.tone({ type: "triangle", f: 1174.66, dur: 0.12, vol: 0.1 });
});
defSfx("comboBreak", 0.3, (A) => {
  A.tone({ type: "triangle", f: 392, f2: 196, dur: 0.24, vol: 0.07 });
});
defSfx("waveStart", 0.3, (A) => {
  A.tone({ type: "sine", f: 146.83, dur: 0.9, vol: 0.2 });
  A.tone({ type: "triangle", f: 293.66, dur: 0.6, vol: 0.08 });
  A.tone({ type: "triangle", f: 440, dur: 0.5, vol: 0.05, delay: 0.08 });
});
defSfx("waveClear", 0.3, (A) => {
  [293.66, 440, 587.33, 880].forEach((f, i) => A.tone({ type: "triangle", f, dur: 0.5, vol: 0.12, delay: i * 0.085 }));
});
defSfx("bossIntro", 0.5, (A) => {
  A.tone({ type: "sawtooth", f: 55, f2: 49, dur: 1.8, vol: 0.2 });
  A.tone({ type: "sine", f: 36.7, dur: 1.8, vol: 0.3 });
  A.tone({ type: "triangle", f: 155.56, dur: 1.2, vol: 0.07, delay: 0.3 });
  A.noise({ type: "lowpass", f: 300, dur: 1.4, vol: 0.14 });
});
defSfx("bossHit", 0.05, (A) => {
  A.tone({ type: "square", f: 165, f2: 82, dur: 0.18, vol: 0.14 });
  A.noise({ type: "bandpass", f: 1200, q: 0.7, dur: 0.12, vol: 0.24 });
  A.tone({ type: "triangle", f: 880, dur: 0.22, vol: 0.1 });
});
defSfx("bossDie", 0.5, (A) => {
  A.noise({ type: "lowpass", f: 2600, f2: 60, dur: 1.5, vol: 0.4 });
  A.tone({ type: "sine", f: 98, f2: 26, dur: 1.4, vol: 0.38 });
  [293.66, 440, 587.33, 880, 1174.66].forEach((f, i) => A.tone({ type: "triangle", f, dur: 1.0, vol: 0.1, delay: 0.5 + i * 0.1 }));
});
defSfx("phase", 0.3, (A) => {
  A.tone({ type: "sawtooth", f: 82, f2: 164, dur: 0.5, vol: 0.14 });
  A.noise({ type: "bandpass", f: 400, f2: 2400, dur: 0.5, vol: 0.14 });
});
defSfx("pick", 0.05, (A) => {
  [440, 587.33, 880].forEach((f, i) => A.tone({ type: "triangle", f, dur: 0.3, vol: 0.11, delay: i * 0.05 }));
});
defSfx("heal", 0.1, (A) => {
  [523.25, 698.46].forEach((f, i) => A.tone({ type: "sine", f, dur: 0.3, vol: 0.12, delay: i * 0.09 }));
});
defSfx("ui", 0.03, (A) => {
  A.tone({ type: "triangle", f: 587.33, dur: 0.06, vol: 0.07 });
});
defSfx("uiMove", 0.03, (A) => {
  A.tone({ type: "sine", f: 880, dur: 0.03, vol: 0.03 });
});
defSfx("uiBack", 0.03, (A) => {
  A.tone({ type: "triangle", f: 392, dur: 0.07, vol: 0.06 });
});
defSfx("deny", 0.1, (A) => {
  A.tone({ type: "square", f: 147, dur: 0.1, vol: 0.06 });
});
defSfx("buy", 0.1, (A) => {
  [587.33, 880, 1174.66, 1760].forEach((f, i) => A.tone({ type: "triangle", f, dur: 0.35, vol: 0.1, delay: i * 0.055 }));
});
defSfx("achieve", 0.2, (A) => {
  [587.33, 698.46, 880, 1174.66].forEach((f, i) => A.tone({ type: "sine", f, dur: 0.5, vol: 0.1, delay: i * 0.07 }));
});
defSfx("count", 0.03, (A) => {
  A.tone({ type: "sine", f: 1174.66, dur: 0.03, vol: 0.03 });
});

/* --------------------------------------------------- Generative music */
/* A low drone, a soft pulse and sparse pentatonic plucks. `intensity`
   (0..1) brings the pulse and hats in as the fight heats up.           */
const Music = {
  on: false,
  timer: null,
  step: 0,
  nextT: 0,
  intensity: 0,
  target: 0,
  boss: false,
  note: 5,
  drone: null,
  stepDur: 60 / 92 / 2,

  start() {
    const A = AudioSys;
    if (this.on || !A.ctx) return;
    const c = A.ctx;
    try {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 180;
      f.Q.value = 0.7;
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(0.5, c.currentTime + 2.5);
      const oscs = [];
      [[73.42, -5, "sawtooth", 0.16], [73.42, 6, "sawtooth", 0.16], [36.71, 0, "sine", 0.5], [110, 0, "triangle", 0.08]].forEach((d) => {
        const o = c.createOscillator(), og = c.createGain();
        o.type = d[2];
        o.frequency.value = d[0];
        o.detune.value = d[1];
        og.gain.value = d[3];
        o.connect(og);
        og.connect(f);
        o.start();
        oscs.push(o);
      });
      // a slightly sour second voice that only sounds during boss fights
      const bo = c.createOscillator(), bg = c.createGain();
      bo.type = "sawtooth";
      bo.frequency.value = 77.78;
      bg.gain.value = 0;
      bo.connect(bg);
      bg.connect(f);
      bo.start();
      f.connect(g);
      g.connect(A.musicBus);
      this.drone = { f, g, bg };
      this.nextT = c.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 70);
      this.on = true;
    } catch (e) {
      this.on = false;
    }
  },

  setMood(target, boss) {
    this.target = clamp(target, 0, 1);
    this.boss = !!boss;
  },

  updateTension(dt) {
    if (!G.run || G.state !== "play" || !G.player || !G.player.alive) return;
    const p = G.player, w = G.wave;
    let base = w ? (w.boss ? 0.85 : clamp(0.3 + w.n * 0.035, 0.3, 0.75)) : 0.4;
    if (p.flame < 18) base = Math.min(1.0, base + 0.15);
    if (G.combo >= 6) base = Math.min(1.0, base + 0.12);
    if (typeof AI === "object" && AI.activeTokens && AI.activeTokens.size > 0) base = Math.min(1.0, base + 0.08);
    this.target = base;
  },

  tick() {
    const A = AudioSys;
    if (!A.ctx || A.ctx.state !== "running") return;
    const c = A.ctx;
    this.intensity += (this.target - this.intensity) * 0.08;
    if (this.drone) {
      this.drone.f.frequency.setTargetAtTime(170 + this.intensity * 420, c.currentTime, 0.3);
      this.drone.bg.gain.setTargetAtTime(this.boss ? 0.12 : 0, c.currentTime, 0.5);
    }
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05; // tab was asleep
    let guard = 0;
    while (this.nextT < c.currentTime + 0.2 && guard++ < 8) {
      this.playStep(this.step, this.nextT - c.currentTime);
      this.step = (this.step + 1) % 32;
      this.nextT += this.stepDur;
    }
  },

  playStep(i, delay) {
    const A = AudioSys, it = this.intensity, bus = A.musicBus;
    delay = Math.max(0, delay);
    const s8 = i % 8;
    if (it > 0.2 && (s8 === 0 || (it > 0.65 && s8 === 4) || (it > 0.85 && s8 === 6))) {
      A.tone({ type: "sine", f: 92, f2: 42, dur: 0.2, vol: 0.34 * Math.min(1, it + 0.3), delay, bus });
    }
    if (it > 0.45 && i % 2 === 1) {
      A.noise({ type: "highpass", f: 6500, dur: 0.035, vol: 0.035 + it * 0.03, delay, bus });
    }
    if (it > 0.12 && (s8 === 0 || s8 === 5)) {
      const root = this.boss ? [73.42, 73.42, 77.78, 65.41] : [73.42, 87.31, 98.0, 65.41];
      A.tone({ type: "triangle", f: root[(i >> 3) % 4], dur: 0.3, vol: 0.16, delay, bus });
    }
    if (Math.random() < 0.2 + it * 0.3) {
      this.note = clamp(this.note + randInt(-2, 2), 0, 9);
      const f = SCALE[this.note] * (this.boss && Math.random() < 0.2 ? 0.5 * 1.059 : 0.5);
      A.tone({ type: "triangle", f, dur: 0.9, vol: 0.06 + it * 0.03, delay, bus, attack: 0.01 });
      if (Math.random() < 0.3) A.tone({ type: "sine", f: f * 2, dur: 0.6, vol: 0.025, delay: delay + this.stepDur * 0.5, bus });
    }
  },
};
