/* Cinderwake play-test bot. Injected into the page by tools/playtest.py.
   It plays whole runs at many times real speed through the same update
   functions the real game uses, and checks every frame for bad numbers. */
window.CWBot = (function () {
  const bot = { mx: 0, my: 0, ax: 0, ay: 0, cd: 0, skill: 0.7, hold: 0, moveT: 0 };
  Input.moveVec = (out) => { out.x = bot.mx; out.y = bot.my; return out; };
  Input.mouseActive = () => true;
  Input.mouseArena = (out) => { out.x = bot.ax; out.y = bot.ay; return out; };

  function evalDash(p, a, es, S, L, dOverride) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let d = L.charge ? L.distMin : S.dashDist;
    const m = 14;
    if (L.blink && dOverride) d = Math.min(d, dOverride);
    const ex = clamp(p.x + dx * d, m, G.W - m), ey = clamp(p.y + dy * d, m, G.H - m);
    let score = 0, firstT = 2, firstBlock = 2;
    for (const e of es) {
      let hit;
      if (L.blink) hit = dist2(ex, ey, e.x, e.y) <= (S.burstR + e.r) * (S.burstR + e.r);
      else { const reach = e.r + S.dashWidth; hit = segDist2(p.x, p.y, ex, ey, e.x, e.y) <= reach * reach; }
      if (!hit) { if (dist2(ex, ey, e.x, e.y) < (e.r + 48) * (e.r + 48)) score -= e.boss ? 2.5 : 1.2; continue; }
      const t = SEG.t;
      const fx = L.blink ? ex : p.x, fy = L.blink ? ey : p.y;
      if (e.type === "bulwark" && !S.breaker && shieldBlocks(e, fx, fy)) { if (t < firstBlock) firstBlock = t; continue; }
      if (e.boss) {
        if (!S.breaker && loomShieldAt(e, fx, fy)) { if (t < firstBlock) firstBlock = t; continue; }
        if (e.invuln || e.immune > 0) continue;
        score += 2.2;
      } else if (e.type === "blister") { score += 1; if (dist2(ex, ey, e.x, e.y) < 110 * 110) score -= 2.5; }
      else score += e.hp <= S.dashDmg ? 1 : 0.45;
      if (t < firstT) firstT = t;
    }
    if (!L.blink && firstBlock < 2) score = -4; // any shield on the line stops the dash
    for (const hz of G.hazards) {
      if (hz.type === "blast" && dist2(ex, ey, hz.x, hz.y) < (hz.R + 10) * (hz.R + 10)) score -= 3;
      else if (hz.type === "ring") { // a good player dashes through the wave, not away from it
        const d0 = dist(p.x, p.y, hz.x, hz.y), d1 = dist(ex, ey, hz.x, hz.y);
        if (d0 > hz.r && d0 - hz.r < 120) score += d1 < hz.r - 14 ? 3 : d1 > hz.maxR ? 2 : -1.5;
      }
    }
    return score;
  }

  function step() {
    const p = G.player, S = G.S, L = G.L;
    if (!p || !p.alive) return;
    const es = G.enemies.filter((e) => !e.dead && e.spawn <= 0 && !e.intangible);
    const sk = bot.skill, see = () => Math.random() < 0.5 + 0.5 * sk; // weaker players miss some threats
    let near = 1e9, urgent = false, target = null, td = 1e9;
    for (const e of es) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d - e.r < near) near = d - e.r;
      if (d < td) { td = d; target = e; }
    }
    // movement is only re-planned every so often: a stand-in for reaction time
    bot.moveT -= 1 / 60;
    if (bot.moveT <= 0) {
      bot.moveT = 0.06 + (1 - sk) * 0.32;
      let mx = 0, my = 0;
      for (const e of es) {
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        const danger = e.type === "blister" ? 150 : e.type === "husk" ? 165 : e.boss ? e.r + 150 : e === target && e.type === "bulwark" ? 62 : 115;
        if (d < danger) { const w = (danger - d) / danger; mx += (dx / d) * w * 2.6; my += (dy / d) * w * 2.6; }
        if (e.type === "dart" && (e.state === 1 || e.state === 2) && see()) {
          const lx = Math.cos(e.lock), ly = Math.sin(e.lock), side = (p.x - e.x) * -ly + (p.y - e.y) * lx;
          if (Math.abs(side) < 40 && d < 360) { const s = side >= 0 ? 1 : -1; mx += -ly * s * 2.5; my += lx * s * 2.5; }
        }
        if (e.boss && e.state === "lurchTell" && see()) { const lx = Math.cos(e.ang), ly = Math.sin(e.ang), side = (p.x - e.x) * -ly + (p.y - e.y) * lx; if (Math.abs(side) < 90) { const s = side >= 0 ? 1 : -1; mx += -ly * s * 3; my += lx * s * 3; } }
      }
      for (const b of G.bolts) {
        if (b.mine || !see()) continue;
        const rx = p.x - b.x, ry = p.y - b.y, sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
        const along = rx * ux + ry * uy, side = rx * -uy + ry * ux;
        if (along > 0 && along < 260 && Math.abs(side) < 34) { const s = side >= 0 ? 1 : -1; mx += -uy * s * 3; my += ux * s * 3; }
      }
      for (const hz of G.hazards) {
        if (hz.type === "blast" && see()) { const d = dist(p.x, p.y, hz.x, hz.y); if (d < hz.R + 30) { mx += ((p.x - hz.x) / (d || 1)) * 4; my += ((p.y - hz.y) / (d || 1)) * 4; } }
        else if (hz.type === "beam") { const b = hz.owner, a = Math.atan2(p.y - b.y, p.x - b.x); let da = angDiff(a, hz.ang); if (hz.two && Math.abs(da) > Math.PI / 2) da = angDiff(a, hz.ang + Math.PI); const s = hz.rot > 0 ? 1 : -1; if (da * s > 0 && da * s < 0.9) { mx += -Math.sin(a) * s * 4; my += Math.cos(a) * s * 4; } }
      }
      const threat = Math.hypot(mx, my);
      // not under pressure and holding Flame: go hunting
      if (target && threat < 1.2 && (p.flame >= S.dashCost || td > 260)) {
        const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (target.type === "bulwark" && !S.breaker) {
          // circle round to its open back
          const front = shieldBlocks(target, p.x, p.y);
          const rel = angDiff(Math.atan2(-dy, -dx), target.facing), s = rel >= 0 ? 1 : -1;
          if (front || d > 150) { const rad = d > 105 ? 1 : d < 80 ? -1 : 0; mx += (-dy / d) * -s * 2 + (dx / d) * rad * 1.2; my += (dx / d) * -s * 2 + (dy / d) * rad * 1.2; }
        } else {
          const want = target.type === "blister" ? 118 : target.type === "husk" ? 175 : target.boss ? target.r + 150 : Math.min(190, S.dashDist * 0.75);
          if (d > want) { mx += (dx / d) * 1.6; my += (dy / d) * 1.6; }
        }
      }
      mx += ((G.W / 2 - p.x) / G.W) * 1.0; my += ((G.H / 2 - p.y) / G.H) * 1.0;
      const ml = Math.hypot(mx, my);
      if (ml > 0.05) { bot.mx = mx / ml; bot.my = my / ml; } else { bot.mx = bot.my = 0; }
    }
    // things that call for an immediate dash, if the player notices in time
    if (near < 40) urgent = true;
    for (const e of es) if (e.type === "twin" && e.lead && e.mate && !e.mate.dead && segDist2(e.x, e.y, e.mate.x, e.mate.y, p.x, p.y) < 45 * 45) urgent = true;
    for (const hz of G.hazards) {
      if (hz.type === "ring") { const d = dist(p.x, p.y, hz.x, hz.y); if (d > hz.r && d - hz.r < 50) urgent = true; }
      else if (hz.type === "beam") { const b = hz.owner, a = Math.atan2(p.y - b.y, p.x - b.x); let da = angDiff(a, hz.ang); if (hz.two && Math.abs(da) > Math.PI / 2) da = angDiff(a, hz.ang + Math.PI); if (da * (hz.rot > 0 ? 1 : -1) > 0 && Math.abs(da) < 0.13) urgent = true; }
    }
    for (const b of G.bolts) if (!b.mine && sk > 0.5 && dist2(b.x, b.y, p.x, p.y) < 60 * 60) urgent = true;

    bot.cd -= 1 / 60;
    if (L.charge && bot.hold > 0) { bot.hold -= 1 / 60; Input.held = bot.hold > 0; if (bot.hold <= 0) Input.release = true; return; }
    if (bot.cd > 0 || p.dash) return;
    const cost = S.dashCost;
    if (p.flame + 0.01 < cost && !p.freeDash) return;
    let best = -99, bestA = 0, bestD = 0;
    for (const e of es) {
      const a0 = Math.atan2(e.y - p.y, e.x - p.x);
      const de = dist(p.x, p.y, e.x, e.y);
      for (const off of [0, 0.07, -0.07, 0.16, -0.16]) { const sc = evalDash(p, a0 + off, es, S, L, de); if (sc > best) { best = sc; bestA = a0 + off; bestD = de; } }
    }
    const need = p.flame >= S.maxFlame * 0.9 ? 0.4 : p.flame >= cost * 2 ? 1 : 1.9;
    let go = best >= need;
    if (!go && urgent) {
      if (best < 0.5) { for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, sc = evalDash(p, a, es, S, L) + 0.5; if (sc > best) { best = sc; bestA = a; bestD = 0; } } }
      go = best > -1.5;
    }
    if (go) {
      const a = bestA + (Math.random() * 2 - 1) * (1 - sk) * 0.3;
      const d = L.blink && bestD ? Math.min(S.dashDist, bestD) : S.dashDist;
      bot.ax = p.x + Math.cos(a) * d; bot.ay = p.y + Math.sin(a) * d;
      Input.press = true; Input.held = true;
      if (L.charge) bot.hold = 0.05; else Input.held = false;
      bot.cd = 0.1 + (1 - sk) * 0.55 + Math.random() * 0.1;
    }
  }

  /** Play one whole run synchronously. pick(offers) chooses a card index. */
  function playRun(opts) {
    bot.skill = opts.skill;
    Save.data.lanterns = LANTERN_ORDER.slice();
    if (opts.allCards) Save.data.cards = UPGRADES.filter((u) => u.price).map((u) => u.id);
    Save.data.duskMax = 5;
    UI.hide();
    startRun(opts.lantern || "wick", opts.dusk || 0, null);
    const log = { waves: [], bad: null, steps: 0 };
    let waveStart = 0, lastWave = 1;
    const maxWave = opts.maxWave || 15, maxSteps = (opts.maxMinutes || 22) * 3600;
    const prefer = opts.prefer || null;
    while (log.steps < maxSteps) {
      log.steps++;
      if (G.state === "play") {
        step();
        gameUpdate(1 / 60);
        Input.endFrame();
        const p = G.player;
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.flame) || !isFinite(G.run.score) || p.flame < -0.01) { log.bad = "player " + JSON.stringify([p.x, p.y, p.flame, G.run.score]); break; }
        for (const e of G.enemies) if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) { log.bad = "enemy " + e.type; break; }
        if (log.bad) break;
        if (G.wave.n !== lastWave) { log.waves.push(Math.round((log.steps - waveStart) / 60)); waveStart = log.steps; lastWave = G.wave.n; }
      } else if (G.state === "upgrade") {
        let i = (Math.random() * G.offers.length) | 0;
        if (prefer) { const j = G.offers.findIndex((id) => prefer.includes(id) || prefer.includes(UP[id].build)); if (j >= 0) i = j; }
        if (G.run.wave >= maxWave) { endRun(true); break; }
        UI.pickCard(i);
      } else if (G.state === "victory") {
        if (maxWave > 15) goEndless(); else { endRun(true); break; }
      } else break;
    }
    const s = G.summary || {};
    const out = { lantern: opts.lantern || "wick", skill: opts.skill, wave: s.wave !== undefined ? s.wave : (G.wave ? G.wave.n : (G.run ? G.run.wave : 1)), score: s.score !== undefined ? s.score : (G.run ? G.run.score : 0), kills: s.kills !== undefined ? s.kills : (G.run ? G.run.kills : 0), cinders: s.cinders || 0, ach: s.achCinders || 0, time: Math.round(s.time || (G.run ? G.run.time : 0)), hits: G.run ? G.run.hits : -1, hearts: G.player ? G.player.hearts : -1, multi: s.bestMulti || 0, combo: s.bestCombo || 0, killedBy: s.killedBy || "", cleared: !!s.cleared, up: Object.keys(s.up || (G.run ? G.run.up : {}) || {}).join(","), waves: log.waves.join("/"), bad: log.bad, state: G.state, steps: log.steps };
    if (G.state !== "over") { out.stuck = G.state + " w" + (G.wave ? G.wave.n : "?") + " left " + (G.wave ? G.wave.left : "?") + " enemies " + G.enemies.map((e) => e.type + ":" + e.state).join(","); }
    quitToMenu();
    return out;
  }
  return { playRun, bot, step };
})();
