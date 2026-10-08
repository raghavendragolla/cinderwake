"use strict";
/* Cinderwake — drawing. One canvas, no images. Bodies are cut-paper
   shapes with a pale edge; warm light is the player's, cold light is
   danger. The static arena floor is rendered once and reused.          */

const _mousePt = { x: 0, y: 0 };

const Render = {
  canvas: null, ctx: null, bg: null, lightK: 0, menuT: 0, streakT: 2,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    Glow.init();
    this.resize();
  },

  /** Fit the arena to the window: constant play area, any aspect ratio. */
  resize() {
    const cssW = Math.max(200, window.innerWidth), cssH = Math.max(200, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const topH = 72;
    const playH = Math.max(160, cssH - topH);
    const aspect = clamp(cssW / playH, 0.5, 2.3);
    const area = Math.min(cssW, playH) < 560 ? 620000 : 900000;
    const W = Math.round(Math.sqrt(area * aspect)), H = Math.round(W / aspect);
    const scale = Math.min(cssW / W, playH / H);
    View.W = W; View.H = H; View.scale = scale; View.dpr = dpr;
    View.cssW = cssW; View.cssH = cssH;
    View.ox = (cssW - W * scale) / 2;
    View.oy = topH + (playH - H * scale) / 2;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    const changed = G.W !== W || G.H !== H;
    G.W = W;
    G.H = H;
    if (changed || !this.bg) {
      Stains.resize(W, H);
      this.buildBg(W, H);
      // keep everything inside the new bounds
      const fit = (o, m) => { o.x = clamp(o.x, m, W - m); o.y = clamp(o.y, m, H - m); };
      if (G.player) fit(G.player, 16);
      for (const e of G.enemies) fit(e, e.r + 4);
      for (const s of G.spawns) fit(s, 40);
    }
  },

  /** The floor: ink washes, paper grain and a brushed border. */
  buildBg(W, H) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    this.bg = c;
    if (!g) return;
    g.fillStyle = PAL.soot;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const x = rand(W), y = rand(H), r = rand(140, 380);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() < 0.55;
      gr.addColorStop(0, light ? "rgba(37,42,59,0.34)" : "rgba(6,7,11,0.5)");
      gr.addColorStop(1, "rgba(16,18,25,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // grain
    for (let i = 0; i < (W * H) / 900; i++) {
      g.fillStyle = `rgba(233,224,204,${rand(0.015, 0.05)})`;
      g.fillRect(rand(W), rand(H), 1, 1);
    }
    // long dry-brush strokes, barely there
    g.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const y = rand(H), x = rand(-100, W * 0.6), len = rand(W * 0.3, W * 0.8);
      g.strokeStyle = `rgba(233,224,204,${rand(0.012, 0.03)})`;
      g.lineWidth = rand(6, 30);
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + len * 0.3, y + rand(-30, 30), x + len * 0.7, y + rand(-30, 30), x + len, y + rand(-50, 50));
      g.stroke();
    }
    // the arena edge: an uneven brushed frame
    g.strokeStyle = "rgba(233,224,204,0.16)";
    g.lineWidth = 2;
    g.strokeRect(7, 7, W - 14, H - 14);
    g.strokeStyle = "rgba(233,224,204,0.06)";
    g.lineWidth = 6;
    g.strokeRect(13, 13, W - 26, H - 26);
    const edge = g.createLinearGradient(0, 0, 0, H);
    edge.addColorStop(0, "rgba(0,0,0,0.3)");
    edge.addColorStop(0.12, "rgba(0,0,0,0)");
    edge.addColorStop(0.88, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,0.3)");
    g.fillStyle = edge;
    g.fillRect(0, 0, W, H);
  },

  draw(rawDt) {
    const ctx = this.ctx, cv = this.canvas, W = G.W, H = G.H;
    if (!ctx) return;
    if (cv && (G.state !== "play" || !G.player || G.player.dash) && cv.style.cursor !== "crosshair") {
      cv.style.cursor = "crosshair";
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0a0b10";
    ctx.fillRect(0, 0, cv.width, cv.height);
    const s = View.scale * View.dpr, z = 1 + FX.zoom;
    ctx.setTransform(s * z, 0, 0, s * z, View.ox * View.dpr + FX.sx * s - (z - 1) * s * W * 0.5, View.oy * View.dpr + FX.sy * s - (z - 1) * s * H * 0.5);
    ctx.drawImage(this.bg, 0, 0, W, H);
    if (Stains.c) ctx.drawImage(Stains.c, 0, 0, W, H);

    if (!G.player) {
      this.drawMenuScene(ctx, rawDt);
    } else {
      this.drawWorld(ctx);
    }

    // overlays that should not shake
    ctx.setTransform(View.dpr, 0, 0, View.dpr, 0, 0);
    if (FX.hurt > 0 || (G.player && G.player.alive && G.player.hearts === 1 && G.state === "play")) {
      const pulse = G.player && G.player.hearts === 1 ? 0.1 + 0.05 * Math.sin(G.realT * 4) : 0;
      const a = Math.max(FX.hurt * 0.5, pulse);
      const gr = ctx.createRadialGradient(View.cssW / 2, View.cssH / 2, Math.min(View.cssW, View.cssH) * 0.3, View.cssW / 2, View.cssH / 2, Math.max(View.cssW, View.cssH) * 0.72);
      gr.addColorStop(0, `rgba(${PAL.coldRGB},0)`);
      gr.addColorStop(1, `rgba(${PAL.coldRGB},${a})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, View.cssW, View.cssH);
    }
    if (FX.flash > 0) {
      ctx.fillStyle = `rgba(${FX.flashRGB},${FX.flash})`;
      ctx.fillRect(0, 0, View.cssW, View.cssH);
    }
    if (G.state === "play" && Input.touch) this.drawTouch(ctx);
  },

  /* A quiet scene behind the menus: embers, and now and then a single cut. */
  drawMenuScene(ctx, rawDt) {
    const W = G.W, H = G.H;
    this.menuT += rawDt;
    this.streakT -= rawDt;
    if (!FX.reduced) {
      if (Math.random() < rawDt * 9) FX.part(rand(W), H + 10, rand(-12, 12), rand(-70, -25), rand(3, 6), rand(1, 2.2), Math.random() < 0.3 ? PAL.gold : PAL.ember, 0, 0.05);
      if (this.streakT <= 0) {
        this.streakT = rand(4.5, 8);
        const y = rand(H * 0.2, H * 0.8), a = rand(-0.35, 0.35), len = rand(260, 420);
        const x = rand(W * 0.45, W * 0.8);
        FX.streak(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 16, 0.5, 0);
        FX.sparks(x + Math.cos(a) * len, y + Math.sin(a) * len, 14, a, 0.5, 80, 380, PAL.gold, 0.7);
        FX.ghost(x + Math.cos(a) * len, y + Math.sin(a) * len, a, 0.6, 1.3);
      }
    }
    FX.update(rawDt, rawDt, null);
    ctx.globalCompositeOperation = "lighter";
    const breathe = 0.5 + 0.5 * Math.sin(this.menuT * 0.8);
    drawGlow(ctx, Glow.ember, W * 0.72, H * 0.52, 300 + breathe * 40, 0.1 + breathe * 0.04);
    ctx.globalCompositeOperation = "source-over";
    FX.drawUnder(ctx);
    FX.drawOver(ctx);
  },

  drawWorld(ctx) {
    const p = G.player, W = G.W, H = G.H, t = G.realT;

    // ambient embers drifting through the dark — pure atmosphere, drawn
    // under everything so it never competes with gameplay-critical reads
    Atmosphere.draw(ctx);

    // Thin World: the walls visibly close in as the wave runs long
    if (G.wave && G.wave.shrink > 1) {
      const m = G.wave.shrink;
      ctx.strokeStyle = `rgba(${PAL.coldRGB},${0.25 + 0.1 * Math.sin(t * 3)})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([9, 7]);
      ctx.strokeRect(m, m, W - m * 2, H - m * 2);
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(${PAL.coldRGB},0.05)`;
      ctx.fillRect(0, 0, W, m);
      ctx.fillRect(0, H - m, W, m);
      ctx.fillRect(0, 0, m, H);
      ctx.fillRect(W - m, 0, m, H);
    }

    // burning wakes
    if (G.wakes.length) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const w of G.wakes) {
        const k = clamp(w.life / Math.min(1, w.max), 0, 1), fl = 0.8 + 0.2 * Math.sin(t * 22 + w.x1);
        const disc = w.x1 === w.x2 && w.y1 === w.y2;
        ctx.strokeStyle = PAL.emberDeep;
        ctx.fillStyle = PAL.emberDeep;
        ctx.globalAlpha = 0.2 * k * fl;
        if (disc) { ctx.beginPath(); ctx.arc(w.x1, w.y1, w.w, 0, TAU); ctx.fill(); }
        else { ctx.lineWidth = w.w * 2; ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); }
        ctx.strokeStyle = PAL.ember;
        ctx.fillStyle = PAL.ember;
        ctx.globalAlpha = 0.34 * k * fl;
        if (disc) { ctx.beginPath(); ctx.arc(w.x1, w.y1, w.w * 0.5, 0, TAU); ctx.fill(); }
        else { ctx.lineWidth = w.w * 0.7; ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // floor marks where enemies are about to rise
    for (const s of G.spawns) {
      const k = clamp(1 - s.t / (s.boss ? 1.5 : SPAWN_TELL), 0, 1), r = s.r * (1.5 - 0.5 * k) + 4;
      ctx.fillStyle = `rgba(6,7,11,${0.35 + 0.4 * k})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * k + 2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(${PAL.paperRGB},${0.25 + 0.5 * k})`;
      ctx.lineWidth = s.boss ? 3 : 1.5;
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.drawHazards(ctx, t);
    if (G.shrine && !G.shrine.claimed) this.drawShrine(ctx, t);
    for (const e of G.enemies) if (!e.dead) this.drawTelegraph(ctx, e, t);

    // where an echo is about to strike
    for (const ec of G.echoes) {
      const k = 1 - ec.t / ec.max;
      ctx.strokeStyle = `rgba(${PAL.paperRGB},${0.1 + 0.3 * k})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      if (ec.kind === "burst") ctx.arc(ec.x1, ec.y1, ec.R, 0, TAU);
      else { ctx.moveTo(ec.x1, ec.y1); ctx.lineTo(ec.x2, ec.y2); }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    FX.drawUnder(ctx);
    for (const e of G.enemies) if (!e.dead) this.drawEnemy(ctx, e, t);

    // bolts and shards
    ctx.globalCompositeOperation = "lighter";
    for (const b of G.bolts) {
      drawGlow(ctx, b.mine ? Glow.ember : Glow.cold, b.x, b.y, 20, 0.8);
      ctx.strokeStyle = b.mine ? PAL.gold : PAL.cold;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.045, b.y - b.vy * 0.045);
      ctx.stroke();
    }
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2.5;
    for (const s of G.shards) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const b of G.bolts) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, TAU);
      ctx.fill();
      if (!b.mine) {
        // a hollow ring marks a hostile bolt, independent of colour
        ctx.strokeStyle = PAL.cold;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 7, 0, TAU);
        ctx.stroke();
      }
    }

    FX.drawOver(ctx);
    if (p.alive) this.drawPlayer(ctx, p, t);
    if (G.lastEmber) this.drawLastEmber(ctx, p, t);

    // the dark beyond the lantern's reach
    const gloom = G.gloomBoss || (G.wave && G.wave.mod && G.wave.mod.gloom && !G.wave.cleared);
    this.lightK += ((gloom ? 1 : 0) - this.lightK) * 0.05;
    const R = lerp(640, 270, this.lightK), dark = lerp(0.46, 0.9, this.lightK);
    const gr = ctx.createRadialGradient(p.x, p.y, R * 0.28, p.x, p.y, R);
    gr.addColorStop(0, "rgba(7,8,12,0)");
    gr.addColorStop(1, `rgba(7,8,12,${dark})`);
    ctx.fillStyle = gr;
    ctx.fillRect(-60, -60, W + 120, H + 120);
  },

  drawLastEmber(ctx, p, t) {
    if (!G.lastEmber || !p.alive) return;
    const le = G.lastEmber, W = G.W, H = G.H;
    const prog = clamp(le.t / le.maxT, 0, 1);

    // Dim the surrounding world without hiding gameplay essentials
    ctx.fillStyle = "rgba(6, 7, 12, 0.45)";
    ctx.fillRect(0, 0, W, H);

    const tgt = le.target;
    if (tgt && !tgt.dead) {
      // Dotted golden ray from player to target
      ctx.strokeStyle = `rgba(${PAL.goldRGB},${0.4 + 0.35 * Math.sin(t * 14)})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target Ember Beacon
      const br = tgt.r + 14 + 4 * Math.sin(t * 12);
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tgt.x, tgt.y, br, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(${PAL.goldRGB},0.22)`;
      ctx.beginPath();
      ctx.arc(tgt.x, tgt.y, br, 0, TAU);
      ctx.fill();

      // Orbiting ember chevrons
      for (let k = 0; k < 4; k++) {
        const ang = t * 3.5 + (k * Math.PI) / 2;
        const cx = tgt.x + Math.cos(ang) * (br + 6), cy = tgt.y + Math.sin(ang) * (br + 6);
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, TAU);
        ctx.fillStyle = PAL.ember;
        ctx.fill();
      }
    }

    // Sleek timer ring around player
    ctx.strokeStyle = `rgba(${PAL.paperRGB},0.25)`;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
    ctx.stroke();
  },

  /** Two labeled motes of a Cinder Shrine — what each grants is shown
      before you choose, never hidden. Neither can ever hurt you.        */
  drawShrine(ctx, t) {
    const mote = (m) => {
      const pulse = 0.6 + 0.4 * Math.sin(t * 3.2 + m.x * 0.01);
      ctx.globalCompositeOperation = "lighter";
      drawGlow(ctx, Glow.paper, m.x, m.y, 30 + pulse * 10, 0.5 * pulse);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = PAL.gold;
      ctx.strokeStyle = PAL.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9 + pulse * 2, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `italic 600 14px "Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(16,18,25,0.85)";
      ctx.strokeText(m.label, m.x, m.y - 24);
      ctx.fillStyle = PAL.gold;
      ctx.fillText(m.label, m.x, m.y - 24);
    };
    mote(G.shrine.a);
    mote(G.shrine.b);
  },

  drawHazards(ctx, t) {
    for (const hz of G.hazards) {
      if (hz.type === "blast") {
        const k = clamp(1 - hz.fuse / hz.max, 0, 1);
        ctx.fillStyle = `rgba(${PAL.coldRGB},${0.08 + 0.16 * k})`;
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, hz.R * (0.3 + 0.7 * k), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(${PAL.coldRGB},0.85)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, hz.R, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (hz.type === "ring") {
        const a = clamp((hz.maxR - hz.r) / 90, 0, 1);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(${PAL.coldRGB},${0.3 * a})`;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, hz.r, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(210,228,255,${0.95 * a})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(hz.x, hz.y, hz.r, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      } else if (hz.type === "beam") {
        const b = hz.owner;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        const line = (a) => {
          const x2 = b.x + Math.cos(a) * 1600, y2 = b.y + Math.sin(a) * 1600;
          ctx.strokeStyle = `rgba(${PAL.coldRGB},0.3)`;
          ctx.lineWidth = 26 + Math.sin(t * 40) * 4;
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = "rgba(225,238,255,0.95)";
          ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
        };
        line(hz.ang);
        if (hz.two) line(hz.ang + Math.PI);
        ctx.globalCompositeOperation = "source-over";
      } else if (hz.type === "rainTell") {
        const k = clamp(1 - hz.t / 0.5, 0, 1);
        ctx.strokeStyle = `rgba(${PAL.coldRGB},${0.15 + 0.55 * k})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 9]);
        ctx.beginPath(); ctx.moveTo(hz.x, 0); ctx.lineTo(hz.x, G.H); ctx.stroke();
        ctx.setLineDash([]);
      } else if (hz.type === "trap") {
        if (!hz.armed) {
          const k = clamp(1 - hz.armT / hz.maxArm, 0, 1);
          ctx.strokeStyle = `rgba(${PAL.coldRGB},${0.25 + 0.5 * k})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 6]);
          ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r * (0.3 + 0.7 * k), 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const pulse = 0.5 + 0.5 * Math.sin(t * 7);
          ctx.strokeStyle = `rgba(${PAL.coldRGB},${0.7 + 0.25 * pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r, 0, TAU); ctx.stroke();
          ctx.strokeStyle = `rgba(210,228,255,${0.6 + 0.3 * pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(hz.x - 7, hz.y - 7); ctx.lineTo(hz.x + 7, hz.y + 7);
          ctx.moveTo(hz.x + 7, hz.y - 7); ctx.lineTo(hz.x - 7, hz.y + 7);
          ctx.stroke();
        }
      } else if (hz.type === "pool") {
        const grow = clamp(1 - hz.life / hz.max, 0, 1); // eases in just after it's dropped
        const fade = clamp(hz.life / 0.6, 0, 1); // flickers out in its last moment, as a warning it's clearing
        const rr = hz.r * (0.5 + 0.5 * easeOut(Math.min(1, grow * 5)));
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + hz.x);
        ctx.fillStyle = `rgba(${PAL.coldRGB},${(0.1 + 0.05 * pulse) * fade})`;
        ctx.beginPath(); ctx.arc(hz.x, hz.y, rr, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(${PAL.coldRGB},${(0.55 + 0.2 * pulse) * fade})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(hz.x, hz.y, rr, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },

  /* Attack warnings are drawn under the bodies, always in cold light. */
  drawTelegraph(ctx, e, t) {
    if (e.spawn > 0) return;
    const cold = PAL.coldRGB;
    const lane = (ang, len, half, k) => {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(ang);
      ctx.fillStyle = `rgba(${cold},${0.07 + 0.16 * k})`;
      ctx.fillRect(0, -half, len, half * 2);
      ctx.strokeStyle = `rgba(${cold},${0.4 + 0.5 * k})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(k > 0.55 ? [] : [8, 7]);
      ctx.strokeRect(0, -half, len, half * 2);
      ctx.setLineDash([]);
      ctx.restore();
    };
    const disc = (R, k) => {
      ctx.fillStyle = `rgba(${cold},${0.06 + 0.14 * k})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + (R - e.r) * easeOut(k), 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${cold},0.8)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    };
    switch (e.type) {
      case "dart":
        if (e.state === 1) lane(e.lock, LUNGE_SPEED * LUNGE_TIME, e.r * 0.8, 1 - e.t / 0.68);
        break;
      case "hunter":
        if (e.state === 1) lane(e.lock, 520 * 0.35, e.r * 0.8, 1 - e.t / 0.55);
        break;
      case "lurker":
        if (e.state === 1) lane(e.lock, LURK_LUNGE_SPEED * LURK_LUNGE_TIME, e.r * 0.85, 1 - e.t / 0.42);
        break;
      case "trapper":
        if (e.state === 1) disc(46, 1 - e.t / 0.6);
        break;
      case "coordinator":
        if (e.pulseT < 0.6) disc(e.r + 36, 1 - e.pulseT / 0.6);
        break;
      case "blister":
        if (e.state === 1) disc(BLAST_R, 1 - e.t / 0.85);
        break;
      case "husk":
        if (e.state === 1) disc(SLAM_R, 1 - e.t / 0.78);
        break;
      case "seer":
        if (e.state === 1) {
          const locked = e.t <= 0.32;
          ctx.strokeStyle = `rgba(${cold},${locked ? 0.95 : 0.5})`;
          ctx.lineWidth = locked ? 3 : 1.5;
          ctx.setLineDash(locked ? [] : [6, 8]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(e.facing) * 1500, e.y + Math.sin(e.facing) * 1500);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      case "twin":
        if (e.lead && e.mate && !e.mate.dead && e.mate.spawn <= 0) {
          const m = e.mate, live = e.warm <= 0 && m.warm <= 0 && e.stun <= 0 && m.stun <= 0;
          if (live) {
            ctx.globalCompositeOperation = "lighter";
            ctx.strokeStyle = `rgba(${cold},0.3)`;
            ctx.lineWidth = 12 + Math.sin(t * 30) * 2;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(m.x, m.y); ctx.stroke();
            ctx.strokeStyle = "rgba(215,232,255,0.95)";
            ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(m.x, m.y); ctx.stroke();
            ctx.globalCompositeOperation = "source-over";
          } else {
            ctx.strokeStyle = `rgba(${cold},0.5)`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 7]);
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(m.x, m.y); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        break;
      case "mire":
      case "eclipse":
        if (e.state === "lurchTell") lane(e.ang, 420, e.r * 0.9, 1 - e.t / 0.85);
        else if (e.state === "quakeTell" || e.state === "novaTell") disc(e.r + 70, clamp(1 - e.t / 0.9, 0, 1));
        else if (e.state === "beamTell") {
          const k = 1 - e.t / 1.0;
          ctx.strokeStyle = `rgba(${cold},${0.4 + 0.5 * k})`;
          ctx.lineWidth = 2 + k * 3;
          ctx.setLineDash(k > 0.7 ? [] : [10, 9]);
          const line = (a) => { ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 1600, e.y + Math.sin(a) * 1600); ctx.stroke(); };
          line(e.ang);
          if (e.phase === 3) line(e.ang + Math.PI);
          ctx.setLineDash([]);
        }
        break;
      case "loom":
        if (e.state === "fanTell") {
          const k = clamp(1 - e.t / 0.75, 0, 1);
          ctx.strokeStyle = `rgba(${cold},${0.35 + 0.5 * k})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 8]);
          for (let i = -2; i <= 2; i++) {
            const a = e.ang + i * 0.21;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 1200, e.y + Math.sin(a) * 1200); ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        break;
    }
  },

  /** A small, modifier-specific mark so an elite is never color-only. */
  eliteGlyph(ctx, mod, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgb(${mod.rgb})`;
    ctx.strokeStyle = `rgb(${mod.rgb})`;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    switch (mod.glyph) {
      case "bolt":
        ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(1, -1); ctx.lineTo(-1, 1); ctx.lineTo(3, 5); ctx.stroke();
        break;
      case "burst":
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.stroke(); }
        break;
      case "shield":
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, -2.5); ctx.lineTo(3, 4); ctx.lineTo(0, 6); ctx.lineTo(-3, 4); ctx.lineTo(-4, -2.5); ctx.closePath(); ctx.fill();
        break;
      case "split":
        ctx.beginPath(); ctx.arc(-3, 0, 2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(3, 0, 2, 0, TAU); ctx.fill();
        break;
      case "plus":
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
        break;
      case "arrow":
        ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 0); ctx.lineTo(-4, 4); ctx.stroke();
        break;
      case "drop":
        ctx.beginPath(); ctx.arc(0, 2, 3, 0, TAU);
        ctx.moveTo(-2.6, 0); ctx.lineTo(0, -6); ctx.lineTo(2.6, 0); ctx.closePath(); ctx.fill();
        break;
    }
    ctx.restore();
  },

  drawEnemy(ctx, e, t) {
    const grow = e.spawn > 0 ? clamp(1 - e.spawn / 0.3, 0.2, 1) : 1;
    const r = e.r * grow, x = e.x, y = e.y, f = e.facing;
    const flash = e.flash > 0;
    ctx.fillStyle = flash ? PAL.paper : PAL.body;
    ctx.strokeStyle = PAL.paper;
    ctx.lineWidth = e.elite ? 3 : 2;
    ctx.lineJoin = "round";
    let alpha = e.spawn > 0 ? 0.6 : 1;
    if (e.type === "loom" && (e.state === "vanish" || e.state === "appear")) alpha = e.state === "vanish" ? clamp(e.t / 0.45, 0, 1) : clamp(1 - e.t / 0.45, 0, 1);
    ctx.globalAlpha = alpha;
    const poly = (n, rad, rot, wob, amp) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        const rr = rad * (1 + (amp ? amp * Math.sin(a * 3 + t * wob + e.wob) + amp * 0.5 * Math.sin(a * 5 - t * wob * 0.7) : 0));
        if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    const eye = (d, sz) => {
      ctx.fillStyle = flash ? PAL.body : PAL.paper;
      ctx.beginPath();
      ctx.arc(x + Math.cos(f) * d, y + Math.sin(f) * d, sz, 0, TAU);
      ctx.fill();
    };

    switch (e.type) {
      case "blot":
        poly(9, r, e.wob, 3, 0.13);
        eye(r * 0.42, 2.4);
        break;
      case "clotling":
        poly(6, r, e.wob + t * 3, 5, 0.12);
        break;
      case "dart": {
        const jx = e.state === 1 ? rand(-1.5, 1.5) : 0, jy = e.state === 1 ? rand(-1.5, 1.5) : 0;
        ctx.beginPath();
        ctx.moveTo(x + jx + Math.cos(f) * r * 1.7, y + jy + Math.sin(f) * r * 1.7);
        ctx.lineTo(x + jx + Math.cos(f + 2.45) * r * 1.15, y + jy + Math.sin(f + 2.45) * r * 1.15);
        ctx.lineTo(x + jx - Math.cos(f) * r * 0.35, y + jy - Math.sin(f) * r * 0.35);
        ctx.lineTo(x + jx + Math.cos(f - 2.45) * r * 1.15, y + jy + Math.sin(f - 2.45) * r * 1.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (e.state === 3) { // winded: an open ring says "cut me now"
          ctx.strokeStyle = `rgba(${PAL.paperRGB},0.45)`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + 7, t * 4, t * 4 + 4.2); ctx.stroke();
        }
        break;
      }
      case "bulwark": {
        poly(8, r, f + TAU / 16, 0, 0);
        eye(r * 0.35, 2.4);
        // the shield: a heavy bright arc across the front
        ctx.strokeStyle = PAL.paper;
        ctx.lineWidth = 6;
        ctx.lineCap = "butt";
        ctx.beginPath(); ctx.arc(x, y, r + 7, f - e.arc, f + e.arc); ctx.stroke();
        ctx.strokeStyle = PAL.soot;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r + 7, f - e.arc, f + e.arc); ctx.stroke();
        // the open back: a small warm notch; when turnLock > 0 (staggered or committed stride), pulse brightly to signal the opening!
        const open = e.turnLock > 0;
        ctx.fillStyle = open ? PAL.gold : PAL.ember;
        ctx.beginPath(); ctx.arc(x - Math.cos(f) * (r - 3), y - Math.sin(f) * (r - 3), open ? 4.2 : 2.6, 0, TAU); ctx.fill();
        if (open) {
          ctx.strokeStyle = `rgba(${PAL.goldRGB},0.75)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        break;
      }
      case "blister": {
        const armed = e.state === 1, pulse = armed ? 0.5 + 0.5 * Math.sin(t * 34) : 0.5 + 0.5 * Math.sin(t * 5 + e.wob);
        const rr = r * (1 + 0.08 * pulse);
        ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const a = e.wob + (i / 7) * TAU;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          ctx.lineTo(x + Math.cos(a) * (rr + 5), y + Math.sin(a) * (rr + 5));
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${PAL.coldRGB},${0.45 + 0.55 * pulse})`;
        ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
        break;
      }
      case "seer": {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = `rgba(${PAL.paperRGB},0.5)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, r + 5, f + 0.6, f + TAU - 0.6); ctx.stroke();
        ctx.fillStyle = e.state === 1 ? PAL.cold : flash ? PAL.body : PAL.paper;
        ctx.beginPath(); ctx.arc(x + Math.cos(f) * r * 0.4, y + Math.sin(f) * r * 0.4, e.state === 1 ? 4.2 : 3.2, 0, TAU); ctx.fill();
        break;
      }
      case "clot": {
        poly(11, r, e.wob, 2, 0.1);
        ctx.fillStyle = flash ? PAL.body : PAL.paper;
        for (let i = 0; i < 3; i++) {
          const a = e.wob + t * 0.8 + (i / 3) * TAU;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, 3, 0, TAU); ctx.fill();
        }
        break;
      }
      case "husk": {
        ctx.lineWidth = e.elite ? 4 : 3;
        poly(6, r, f, 0, 0);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(${PAL.paperRGB},0.4)`;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = f + (i / 6) * TAU;
          if (i) ctx.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
          else ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
        }
        ctx.closePath(); ctx.stroke();
        // one pip for each cut it can still take
        for (let i = 0; i < e.maxHp; i++) {
          const px = x + (i - (e.maxHp - 1) / 2) * 8;
          ctx.fillStyle = i < e.hp ? (flash ? PAL.body : PAL.paper) : "rgba(233,224,204,0.18)";
          ctx.beginPath(); ctx.arc(px, y, 2.6, 0, TAU); ctx.fill();
        }
        break;
      }
      case "twin": {
        const lone = !e.mate || e.mate.dead;
        poly(4, r * 1.15, lone ? t * 8 : t * 1.5 + e.wob, 0, 0);
        ctx.fillStyle = PAL.cold;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
        break;
      }
      case "hunter": {
        const jx = e.state === 1 ? rand(-1, 1) : 0, jy = e.state === 1 ? rand(-1, 1) : 0;
        ctx.beginPath();
        ctx.moveTo(x + jx + Math.cos(f) * r * 1.6, y + jy + Math.sin(f) * r * 1.6);
        ctx.lineTo(x + jx + Math.cos(f + 2.1) * r * 1.2, y + jy + Math.sin(f + 2.1) * r * 1.2);
        ctx.lineTo(x + jx - Math.cos(f) * r * 0.7, y + jy - Math.sin(f) * r * 0.7);
        ctx.lineTo(x + jx + Math.cos(f - 2.1) * r * 1.2, y + jy + Math.sin(f - 2.1) * r * 1.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        eye(r * 0.4, 2.2);
        if (e.state === 3) {
          ctx.strokeStyle = `rgba(${PAL.paperRGB},0.5)`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + 6, t * 4, t * 4 + 4.2); ctx.stroke();
        }
        break;
      }
      case "coordinator": {
        poly(6, r, t * 1.2, 0, 0);
        ctx.strokeStyle = `rgba(${PAL.goldRGB},0.8)`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const a = t * 2.5 + (i / 3) * TAU;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7), 2.5, 0, TAU);
          ctx.stroke();
        }
        eye(r * 0.25, 2.8);
        break;
      }
      case "shade": {
        // a pale, cold diamond — an echo of the player's own shape, not ink
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * 0.7;
        ctx.fillStyle = `rgba(${PAL.coldRGB},0.5)`;
        ctx.strokeStyle = `rgba(210,228,255,0.85)`;
        poly(4, r * 1.15, f + Math.PI / 4, 0, 0);
        ctx.globalAlpha = prevAlpha;
        break;
      }
      case "trapper": {
        // low and wedge-shaped, hunched over whatever it's about to set down
        poly(5, r, f, 0, 0);
        ctx.fillStyle = flash ? PAL.body : (e.state === 1 ? PAL.cold : PAL.paper);
        ctx.beginPath(); ctx.arc(x - Math.cos(f) * r * 0.3, y - Math.sin(f) * r * 0.3, e.state === 1 ? 3.2 : 2.4, 0, TAU); ctx.fill();
        break;
      }
      case "seep": {
        // a low, oozing blob, trailing a few drips toward where it's been
        poly(7, r, e.wob + t * 0.4, 2.5, 0.16);
        ctx.strokeStyle = `rgba(${PAL.coldRGB},0.6)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = f + Math.PI + (i - 1) * 0.5, dd = r * (1.3 + i * 0.35);
          ctx.fillStyle = `rgba(${PAL.coldRGB},${0.5 - i * 0.12})`;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, 2.4 - i * 0.5, 0, TAU); ctx.fill();
        }
        break;
      }
      case "lurker": {
        const reveal = 1 - (e.cloak === undefined ? 1 : e.cloak);
        ctx.globalAlpha = alpha * (0.1 + 0.9 * reveal);
        if (reveal < 0.5) {
          // dormant: a low, flat, closed shape — easy to miss, never fully hidden
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.1, r * 0.55, e.wob * 0.3, 0, TAU);
          ctx.fill();
          ctx.stroke();
        } else {
          // awake: a sharp, raised claw aimed at its lock
          const jx = e.state === 2 ? rand(-1.5, 1.5) : 0, jy = e.state === 2 ? rand(-1.5, 1.5) : 0;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = f + (i - 2) * 0.55;
            const rr = i === 2 ? r * 1.6 : r * 0.9;
            const px = x + jx + Math.cos(a) * rr, py = y + jy + Math.sin(a) * rr;
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          eye(r * 0.5, 2.6);
          if (e.state === 3) { // spent: an open ring says "cut me now"
            ctx.strokeStyle = `rgba(${PAL.paperRGB},0.45)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, r + 7, t * 4, t * 4 + 4.2); ctx.stroke();
          }
        }
        break;
      }
      case "moon": {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = flash ? PAL.body : `rgba(${PAL.paperRGB},0.8)`;
        ctx.beginPath(); ctx.arc(x, y, r * 0.8, 1.2, 4.3); ctx.fill();
        break;
      }
      case "mire": this.drawMire(ctx, e, t, r, flash); break;
      case "loom": this.drawLoom(ctx, e, t, r, flash); break;
      case "eclipse": this.drawEclipse(ctx, e, t, r, flash); break;
    }
    if (e.elite && !e.boss) {
      const mod = ELITE_MODS[e.eliteMod];
      const ringRgb = mod ? mod.rgb : PAL.paperRGB;
      ctx.strokeStyle = `rgba(${ringRgb},0.75)`;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(x, y, r + (e.type === "bulwark" ? 14 : 7), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (mod) this.eliteGlyph(ctx, mod, x, y - r - (e.type === "bulwark" ? 25 : 19));
      if (e.hp > 1 && e.type !== "husk") {
        ctx.fillStyle = PAL.paper;
        for (let i = 0; i < e.hp; i++) { ctx.beginPath(); ctx.arc(x + (i - (e.hp - 1) / 2) * 7, y - r - 9, 2, 0, TAU); ctx.fill(); }
      }
    }
    if (e.markT > 0) { // the Coordinator's pulse: which allies it is steering
      const k = Math.min(1, e.markT * 2);
      ctx.strokeStyle = `rgba(${PAL.goldRGB},${0.55 * k})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -t * 22;
      ctx.beginPath(); ctx.arc(x, y, r + 9, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.stun > 0.05 && !e.boss) {
      ctx.strokeStyle = `rgba(${PAL.paperRGB},0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 4, t * 9, t * 9 + 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  drawMire(ctx, b, t, r, flash) {
    const x = b.x, y = b.y, f = b.facing;
    const sq = b.state === "lurch" ? 0.12 : b.state === "quakeTell" ? 0.06 * Math.sin(t * 30) : 0;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 + 0.07 * Math.sin(a * 4 + t * 2) + 0.05 * Math.sin(a * 7 - t * 3) + sq * Math.cos((a - b.ang) * 2));
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(${PAL.paperRGB},0.25)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * 0.62, t * 0.6, t * 0.6 + 4.6); ctx.stroke();
    ctx.fillStyle = flash ? PAL.body : b.atk ? PAL.cold : PAL.paper;
    for (let i = -1; i <= 1; i++) {
      const a = f + i * 0.5;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, i === 0 ? 5 : 3.5, 0, TAU); ctx.fill();
    }
    if (b.state === "rest") this.openMark(ctx, x, y, r + 12, t);
  },

  drawLoom(ctx, b, t, r, flash) {
    const x = b.x, y = b.y;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    // warp threads across the body
    ctx.strokeStyle = `rgba(${PAL.paperRGB},0.3)`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = t * 0.5 + (i / 6) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
      ctx.lineTo(x - Math.cos(a) * r * 0.85, y - Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = flash ? PAL.body : b.atk ? PAL.cold : PAL.paper;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
    // the turning shields; the gaps are the way in
    ctx.lineCap = "butt";
    for (const s of b.shields) {
      const a0 = b.shAng + s.a - s.arc / 2, a1 = b.shAng + s.a + s.arc / 2;
      if (s.off > 0) {
        ctx.strokeStyle = `rgba(${PAL.paperRGB},0.2)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
      } else {
        ctx.strokeStyle = PAL.paper;
        ctx.lineWidth = 8;
      }
      ctx.beginPath(); ctx.arc(x, y, r + 15, a0, a1); ctx.stroke();
      ctx.setLineDash([]);
      if (s.off <= 0) {
        ctx.strokeStyle = PAL.soot;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 15, a0 + 0.04, a1 - 0.04); ctx.stroke();
      }
    }
  },

  drawEclipse(ctx, b, t, r, flash) {
    const x = b.x, y = b.y;
    // corona
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, b.invuln ? Glow.cold : Glow.ember, x, y, r * 2.4, b.invuln ? 0.35 : 0.6);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = flash ? PAL.paper : "#07080c";
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.paper;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(${PAL.paperRGB},0.4)`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const a = t * 0.3 + (i / 12) * TAU, l = 8 + 5 * Math.sin(t * 3 + i * 1.7);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
      ctx.lineTo(x + Math.cos(a) * (r + 5 + l), y + Math.sin(a) * (r + 5 + l));
      ctx.stroke();
    }
    if (!b.invuln) {
      // exposed: the core glows warm, and a ring counts down the opening
      ctx.fillStyle = PAL.gold;
      ctx.beginPath(); ctx.arc(x, y, r * 0.42 + Math.sin(t * 10) * 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(b.exposed / 6, 0, 1)); ctx.stroke();
      if (b.state === "stunned") this.openMark(ctx, x, y, r + 32, t);
    } else {
      ctx.fillStyle = b.atk ? PAL.cold : `rgba(${PAL.paperRGB},0.5)`;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      if (b.state === "regrow") {
        ctx.strokeStyle = `rgba(${PAL.paperRGB},0.6)`;
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(x, y, 98, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },

  /** A warm rotating bracket: "this is your opening". */
  openMark(ctx, x, y, r, t) {
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + (i / 3) * TAU;
      ctx.beginPath(); ctx.arc(x, y, r, a, a + 0.7); ctx.stroke();
    }
  },

  drawPlayer(ctx, p, t) {
    const S = G.S, L = G.L, x = p.x, y = p.y;
    const cost = p.freeDash ? 0 : S.dashCost * (S.rebound && p.reboundT > 0 ? 0.5 : 1);
    const can = p.flame + 0.001 >= cost;
    const fr = clamp(p.flame / S.maxFlame, 0, 1);

    // HARD RULE: Do NOT change in future updates. Keep aim guide draggable across entire screen by mouse.
    if (Save.data.settings.aimGuide && !p.dash && G.state === "play") {
      let d = S.dashDist;
      if (Input.mouseActive()) d = Math.max(20, p.aimDist);
      else if (L.charge) d = lerp(L.distMin, S.dashDist, p.charging ? p.charge : 0);
      else if (L.blink) d = blinkLengthFor(p);
      else d = dashLengthFor(p);
      const ex = clamp(x + Math.cos(p.aim) * d, 14, G.W - 14), ey = clamp(y + Math.sin(p.aim) * d, 14, G.H - 14);
      if (this.canvas) {
        this.canvas.style.cursor = "crosshair";
      }
      const guideColor = can ? PAL.goldRGB : "220,110,60";
      const a = can ? 0.35 : 0.15;
      ctx.strokeStyle = `rgba(${guideColor},${a})`;
      ctx.lineWidth = L.blink ? 1.2 : 1.6 + (p.charging ? p.charge * 3 : 0);
      ctx.setLineDash([3, 7]);
      ctx.lineCap = "round";
      const startDist = Math.min(24, d * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(p.aim) * startDist, y + Math.sin(p.aim) * startDist);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${guideColor},${a + 0.2})`;
      ctx.lineWidth = 1.6;
      const ringR = L.blink ? S.burstR : 6;
      ctx.beginPath();
      ctx.arc(ex, ey, ringR, 0, TAU);
      ctx.stroke();
    }

    // warm light
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, Glow.ember, x, y, 60 + fr * 34 + FX.pulse * 14, (can ? 0.3 : 0.12) + 0.22 * fr + FX.pulse * 0.2);
    ctx.globalCompositeOperation = "source-over";

    // Flame ring: one bright segment for each dash you can afford
    const R = 22 + FX.pulse * 2.5, unit = S.dashCost, gap = 0.1;
    ctx.lineCap = "butt";
    ctx.strokeStyle = `rgba(${PAL.paperRGB},0.12)`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    const fail = p.failT > 0;
    const jx = fail ? rand(-1.5, 1.5) : 0;
    for (let v = 0; v < Math.min(p.flame, S.maxFlame) - 0.01; v += unit) {
      const end = Math.min(p.flame, S.maxFlame, v + unit);
      const full = end - v >= unit - 0.01;
      const a0 = -Math.PI / 2 + (v / S.maxFlame) * TAU + gap / 2, a1 = -Math.PI / 2 + (end / S.maxFlame) * TAU - gap / 2;
      if (a1 <= a0) continue;
      ctx.strokeStyle = fail ? PAL.cold : full ? (FX.pulse > 0.3 ? PAL.gold : PAL.ember) : `rgba(${PAL.emberRGB},0.4)`;
      ctx.lineWidth = full ? 3.5 : 2;
      ctx.beginPath(); ctx.arc(x + jx, y, R, a0, a1); ctx.stroke();
    }
    if (p.flame > S.maxFlame + 0.5) { // overheat
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R + 4.5, -Math.PI / 2, -Math.PI / 2 + ((p.flame - S.maxFlame) / 50) * TAU); ctx.stroke();
    }
    if (p.ward) {
      ctx.strokeStyle = `rgba(${PAL.goldRGB},0.75)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = t * 14;
      ctx.beginPath(); ctx.arc(x, y, R + 8, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.charging) {
      ctx.strokeStyle = p.charge >= 1 ? PAL.gold : PAL.paper;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, R + 6, -Math.PI / 2, -Math.PI / 2 + p.charge * TAU); ctx.stroke();
    }

    // the lantern: a small flame-diamond that leans into its aim
    const blink = ((p.inv > 0.15 && !p.dash && p.hurtT <= 0 && Math.sin(t * 40) > 0.2 && G.player.hearts > 0 && G.wave && !G.wave.cleared) || (G.lastEmber && Math.sin(t * 36) > 0.1));
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.dash ? p.dash.ang : p.aim);
    const s = p.r * (p.dash ? 1.25 : 1), stretch = p.dash ? 1.9 : 1.25;
    ctx.fillStyle = can ? PAL.ember : "#8a5a3a";
    ctx.beginPath();
    ctx.moveTo(s * stretch, 0);
    ctx.lineTo(0, s * 0.82);
    ctx.lineTo(-s * 0.95, 0);
    ctx.lineTo(0, -s * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = can ? PAL.gold : PAL.ash;
    ctx.beginPath();
    ctx.moveTo(s * stretch * 0.62, 0);
    ctx.lineTo(0, s * 0.42);
    ctx.lineTo(-s * 0.4, 0);
    ctx.lineTo(0, -s * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    // aim chevron
    if (!p.dash) {
      const cx = x + Math.cos(p.aim) * (R + 9), cy = y + Math.sin(p.aim) * (R + 9);
      ctx.strokeStyle = can ? PAL.gold : `rgba(${PAL.paperRGB},0.35)`;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(p.aim + 2.5) * 6, cy + Math.sin(p.aim + 2.5) * 6);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + Math.cos(p.aim - 2.5) * 6, cy + Math.sin(p.aim - 2.5) * 6);
      ctx.stroke();
    }
  },

  /* On-screen thumbs, drawn in screen space. */
  drawTouch(ctx) {
    const st = Input.stick, am = Input.aimS;
    ctx.lineCap = "round";
    if (st.id !== null) {
      ctx.strokeStyle = `rgba(${PAL.paperRGB},0.25)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, 46, 0, TAU); ctx.stroke();
      const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy) || 1, m = Math.min(46, l);
      ctx.fillStyle = `rgba(${PAL.paperRGB},0.35)`;
      ctx.beginPath(); ctx.arc(st.ox + (dx / l) * m, st.oy + (dy / l) * m, 18, 0, TAU); ctx.fill();
    }
    if (am.id !== null) {
      ctx.strokeStyle = `rgba(${PAL.goldRGB},0.5)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(am.ox, am.oy, 14, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(am.ox, am.oy); ctx.lineTo(am.x, am.y); ctx.stroke();
      ctx.fillStyle = `rgba(${PAL.goldRGB},0.55)`;
      ctx.beginPath(); ctx.arc(am.x, am.y, 10, 0, TAU); ctx.fill();
    }
  },
};
