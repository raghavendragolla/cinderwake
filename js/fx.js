"use strict";
/* Cinderwake — visual effects: particles, streaks, rings, floating text,
   scorch stains and camera feedback. Everything is pooled in flat arrays
   with hard caps so a busy screen can never run away with the frame.   */

/* Pre-rendered soft glows; far cheaper than canvas shadowBlur. */
const Glow = {
  ember: null, paper: null, cold: null,
  make(rgb) {
    const s = 128, c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    if (!g) return c;
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(0.22, `rgba(${rgb},0.5)`);
    gr.addColorStop(0.55, `rgba(${rgb},0.13)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    return c;
  },
  init() {
    this.ember = this.make(PAL.emberRGB);
    this.paper = this.make(PAL.paperRGB);
    this.cold = this.make(PAL.coldRGB);
  },
};
function drawGlow(ctx, img, x, y, r, a) {
  if (a <= 0.004 || r <= 0) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/* Scorch marks left where things die. Drawn once into an offscreen
   canvas, then composited each frame; the layer slowly fades.          */
const Stains = {
  c: null, g: null, s: 0.5, fadeT: 0,
  resize(W, H) {
    this.c = document.createElement("canvas");
    this.c.width = Math.max(2, Math.ceil(W * this.s));
    this.c.height = Math.max(2, Math.ceil(H * this.s));
    this.g = this.c.getContext("2d");
  },
  clear() {
    if (this.g) this.g.clearRect(0, 0, this.c.width, this.c.height);
  },
  add(x, y, r, ang) {
    const g = this.g;
    if (!g) return;
    const s = this.s;
    g.save();
    g.translate(x * s, y * s);
    g.rotate(ang || 0);
    g.scale(1.9, 1);
    const R = r * s;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, "rgba(6,6,10,0.55)");
    gr.addColorStop(0.6, "rgba(46,31,27,0.22)");
    gr.addColorStop(0.85, "rgba(255,154,61,0.03)");
    gr.addColorStop(1, "rgba(255,154,61,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    g.restore();
    g.fillStyle = "rgba(255,170,90,0.1)";
    for (let i = 0; i < 4; i++) {
      const a = (ang || 0) + rand(-0.7, 0.7), d = rand(r * 0.6, r * 2.4);
      g.beginPath();
      g.arc((x + Math.cos(a) * d) * s, (y + Math.sin(a) * d) * s, rand(0.5, 1.4), 0, TAU);
      g.fill();
    }
  },
  update(dt) {
    this.fadeT += dt;
    if (this.fadeT > 1.2 && this.g) {
      this.fadeT = 0;
      const g = this.g;
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "rgba(0,0,0,0.045)";
      g.fillRect(0, 0, this.c.width, this.c.height);
      g.globalCompositeOperation = "source-over";
    }
  },
};

const FX = {
  parts: [], rings: [], texts: [], streaks: [], motes: [], ghosts: [],
  cap: 520,
  reduced: false,
  shakeScale: 1,
  shake: 0, sx: 0, sy: 0,
  flash: 0, flashRGB: PAL.paperRGB,
  hurt: 0, // cold vignette after taking a hit
  zoom: 0, // brief punch-in on big chains
  pulse: 0, // Flame ring pulse when a refund lands

  clear() {
    this.parts.length = this.rings.length = this.texts.length = 0;
    this.streaks.length = this.motes.length = this.ghosts.length = 0;
    this.shake = this.flash = this.hurt = this.zoom = this.pulse = 0;
  },
  configure() {
    this.reduced = Save.reducedMotion();
    this.shakeScale = Save.data.settings.shake;
    this.cap = this.reduced ? 220 : 520;
  },

  addShake(n) {
    if (this.reduced) return;
    this.shake = Math.min(16, this.shake + n * this.shakeScale);
  },
  doFlash(a, rgb) {
    if (this.reduced) a *= 0.3;
    if (a > this.flash) {
      this.flash = a;
      this.flashRGB = rgb || PAL.paperRGB;
    }
  },
  punch(z) {
    if (!this.reduced) this.zoom = Math.max(this.zoom, z);
  },

  /* type 0 = additive spark (drawn as a short line along its velocity),
     type 1 = solid fleck (a small rotating shard of paper or ink).     */
  part(x, y, vx, vy, life, size, col, type, drag) {
    if (this.parts.length >= this.cap) return;
    this.parts.push({ x, y, vx, vy, life, max: life, size, col, type: type | 0, drag: drag === undefined ? 3.2 : drag, rot: Math.random() * TAU });
  },
  sparks(x, y, n, ang, spread, s0, s1, col, life) {
    if (this.reduced) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-spread, spread), s = rand(s0, s1);
      this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1) * (life || 0.45), rand(1.2, 2.6), col || PAL.ember, 0);
    }
  },
  flecks(x, y, n, ang, spread, s0, s1, col, size) {
    if (this.reduced) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-spread, spread), s = rand(s0, s1);
      this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.35, 0.8), rand(0.6, 1.2) * (size || 4), col || PAL.paper, 1, 4.2);
    }
  },
  ring(x, y, r0, r1, life, rgb, w) {
    if (this.rings.length > 60) return;
    this.rings.push({ x, y, r0, r1, life, max: life, rgb: rgb || PAL.paperRGB, w: w || 2 });
  },
  text(x, y, str, size, col, life) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, str, size: size || 16, col: col || PAL.paper, life: life || 0.8, max: life || 0.8 });
  },
  streak(x1, y1, x2, y2, w, life, kind) {
    if (this.streaks.length > 40) this.streaks.shift();
    this.streaks.push({ x1, y1, x2, y2, w, life, max: life, kind: kind || 0 });
  },
  ghost(x, y, ang, life, scale, rgb) {
    if (this.ghosts.length > 40) return;
    this.ghosts.push({ x, y, ang, life, max: life, scale: scale || 1, rgb: rgb || null });
  },
  /* Flame refund: embers that fly from the kill back into the lantern. */
  mote(x, y, n) {
    if (this.reduced) n = 1;
    for (let i = 0; i < n && this.motes.length < 70; i++) {
      const a = rand(TAU), s = rand(120, 300);
      this.motes.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, delay: rand(0.04, 0.16) });
    }
  },

  update(dt, rawDt, p) {
    // camera feedback always runs in real time
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - rawDt * 46);
      const a = Math.random() * TAU;
      this.sx = Math.cos(a) * this.shake;
      this.sy = Math.sin(a) * this.shake;
    } else this.sx = this.sy = 0;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - rawDt * 3.2);
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - rawDt * 1.4);
    if (this.zoom > 0) this.zoom = Math.max(0, this.zoom - rawDt * 0.22);
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - rawDt * 4);

    let arr = this.parts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const q = arr[i];
      q.life -= dt;
      if (q.life <= 0) {
        arr[i] = arr[arr.length - 1];
        arr.pop();
        continue;
      }
      const k = Math.exp(-q.drag * dt);
      q.vx *= k;
      q.vy *= k;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += dt * 6;
    }
    const decay = (list, d) => {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= d;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    };
    decay(this.rings, dt);
    decay(this.streaks, rawDt);
    decay(this.ghosts, rawDt);
    arr = this.texts;
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].life -= rawDt;
      arr[i].y -= rawDt * 26;
      if (arr[i].life <= 0) arr.splice(i, 1);
    }
    arr = this.motes;
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i];
      m.t += rawDt;
      if (m.t > m.delay && p) {
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
        const pull = 2600 * Math.min(1, (m.t - m.delay) * 5);
        m.vx += (dx / d) * pull * rawDt;
        m.vy += (dy / d) * pull * rawDt;
        const k = Math.exp(-7 * rawDt);
        m.vx *= k;
        m.vy *= k;
        if (d < 16 || m.t > 1.2) {
          arr.splice(i, 1);
          this.pulse = 1;
          Sfx.mote();
          continue;
        }
      } else {
        const k = Math.exp(-5 * rawDt);
        m.vx *= k;
        m.vy *= k;
      }
      m.x += m.vx * rawDt;
      m.y += m.vy * rawDt;
    }
  },

  /* Streaks and afterimages sit under the actors. */
  drawUnder(ctx) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const s of this.streaks) {
      const k = s.life / s.max;
      const echo = s.kind === 1;
      ctx.globalAlpha = 0.55 * k * (echo ? 0.7 : 1);
      ctx.strokeStyle = echo ? PAL.paper : PAL.ember;
      ctx.lineWidth = s.w * (0.35 + 0.65 * k);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * k;
      ctx.strokeStyle = echo ? "#ffffff" : PAL.gold;
      ctx.lineWidth = Math.max(1, s.w * 0.3 * k);
      ctx.beginPath();
      ctx.moveTo(lerp(s.x2, s.x1, k), lerp(s.y2, s.y1, k));
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const g of this.ghosts) {
      const k = g.life / g.max;
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = g.rgb ? `rgb(${g.rgb})` : PAL.gold;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.ang);
      const s = 10 * g.scale;
      ctx.beginPath();
      ctx.moveTo(s * 1.4, 0);
      ctx.lineTo(0, s * 0.8);
      ctx.lineTo(-s, 0);
      ctx.lineTo(0, -s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  /* Particles, rings, motes and text sit over the actors. */
  drawOver(ctx) {
    // solid flecks first
    for (const q of this.parts) {
      if (q.type !== 1) continue;
      const k = q.life / q.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = q.col;
      const s = q.size * (0.4 + 0.6 * k);
      const c = Math.cos(q.rot) * s, sn = Math.sin(q.rot) * s;
      ctx.beginPath();
      ctx.moveTo(q.x + c, q.y + sn);
      ctx.lineTo(q.x - sn * 0.7, q.y + c * 0.7);
      ctx.lineTo(q.x - c * 0.6, q.y - sn * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const q of this.parts) {
      if (q.type !== 0) continue;
      const k = q.life / q.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = q.col;
      ctx.lineWidth = q.size * (0.5 + 0.5 * k);
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035);
      ctx.stroke();
    }
    for (const m of this.motes) {
      drawGlow(ctx, Glow.ember, m.x, m.y, 11, 0.9);
      ctx.globalAlpha = 1;
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.2, 0, TAU);
      ctx.fill();
    }
    for (const r of this.rings) {
      const k = r.life / r.max, e = easeOut(1 - k);
      ctx.globalAlpha = k * 0.9;
      ctx.strokeStyle = `rgb(${r.rgb})`;
      ctx.lineWidth = r.w * (0.4 + k);
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = 1 + 0.5 * Math.max(0, k - 0.8) / 0.2;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = `italic 600 ${Math.round(t.size * pop)}px "Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(16,18,25,0.85)";
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },
};
