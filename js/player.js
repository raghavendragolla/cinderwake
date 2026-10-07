"use strict";
/* Cinderwake — the lantern. Movement is the weapon: the dash is the only
   attack, it costs Flame, and every kill pays some of that Flame back. */

const _mv = { x: 0, y: 0 }, _ms = { x: 0, y: 0 }, _drag = { x: 0, y: 0, len: 0 };

/** Derive every run-time number from the lantern plus chosen cards. */
function calcStats(run) {
  const L = LANTERNS[run.lantern];
  const lv = (id) => run.up[id] || 0;
  const wake = lv("wake");
  return {
    maxHearts: Math.max(1, L.hearts + lv("heart") - lv("glass") - G.mods.heartPenalty),
    maxFlame: L.flame + 25 * lv("longwick"),
    dashCost: L.cost + 8 * lv("heavy"),
    dashDist: L.dist * (1 + 0.14 * lv("reach")),
    dashWidth: L.width * (1 + 0.35 * lv("keen")),
    burstR: (L.burst || 0) * (1 + 0.2 * lv("keen")) * (1 + 0.1 * lv("momentum")),
    dashDmg: L.dmg + lv("heavy") + lv("glass"),
    moveSpeed: L.speed * (1 + 0.1 * lv("fleet")),
    regen: L.regen * (1 + 0.35 * lv("oil")) * G.mods.regenMult,
    killRefund: L.refund + 5 * lv("kindling") + 8 * lv("glass"),
    hitRefund: 9,
    bossRefund: 16,
    reachBonus: 4 * lv("reach"),
    fleetHaste: lv("fleet") > 0 ? 0.15 + 0.05 * (lv("fleet") - 1) : 0,
    hasOil: lv("oil") > 0,
    oilDryHaste: 0.10 + 0.05 * Math.max(0, lv("oil") - 1),
    momentum: [0, 40, 60, 80][lv("momentum")],
    fever: lv("fever") > 0,
    wake, wakeLife: [0, 2, 3, 4][wake], wakeW: [0, 15, 20, 25][wake],
    backdraft: lv("backdraft") > 0,
    wildfire: lv("wildfire") > 0,
    echoes: lv("echo"),
    crosscut: lv("crosscut") > 0,
    resonance: lv("resonance") > 0,
    shards: lv("splinter") ? lv("splinter") + 1 : 0,
    ricochet: lv("ricochet") > 0,
    starburst: lv("starburst") > 0,
    deflect: lv("deflect") > 0,
    riposte: lv("riposte") > 0,
    breaker: lv("breaker") > 0,
    ward: lv("ward") > 0,
    flare: lv("flare") > 0,
    cinderMult: 1 + 0.35 * lv("soot"),
    phoenix: lv("phoenix") > 0,
    storm: lv("storm") > 0,
    timewick: lv("timewick") > 0,
    rebound: lv("rebound") > 0,
    overheat: lv("overheat") > 0,
    undertow: lv("undertow") > 0,
    gambit: lv("gambit") > 0,
    syn: synFlags(run),
  };
}

/** Active-synergy flags, keyed `syn_<id>`, for the hot combat paths to check. */
function synFlags(run) {
  const out = {};
  for (const id of activeSynergies(run)) out[id] = true;
  return out;
}

/** The current wave's mutation, or null outside a wave / on a plain wave. */
function curMutation() {
  return G.wave && G.wave.mod && G.wave.mod.mutation ? G.wave.mod : null;
}

/** Thin World eats into the usable arena as the wave goes on. */
function arenaMargin(base) {
  const w = G.wave;
  return w && w.shrink ? base + w.shrink : base;
}

function makePlayer() {
  return {
    x: G.W / 2, y: G.H / 2, vx: 0, vy: 0, r: 11,
    aim: -Math.PI / 2, aimDist: (G.S ? G.S.dashDist : 235), aimPow: 1, aimAuto: false, moveAng: -Math.PI / 2, moving: false,
    hearts: 3, flame: 100, inv: 0, dash: null, alive: true,
    charging: false, charge: 0, chargedCue: false,
    buf: 0, bufPow: 1, failT: 0, freeDash: false, haste: 0, reboundT: 0,
    ward: false, hurtT: 0, trail: 0,
  };
}

function nearestEnemy(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const e of G.enemies) {
    if (e.dead || e.spawn > 0 || e.intangible) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function updateAim(p) {
  if (Input.touch) {
    Input.aimDrag(_drag);
    if (_drag.len >= 14) {
      p.aim = Math.atan2(_drag.y, _drag.x);
      p.aimPow = clamp(_drag.len / 90, 0, 1);
      p.aimAuto = false;
    } else {
      // no drag yet: point at the nearest enemy so a quick tap still cuts
      // (Last Light turns this off: trust your own eyes, not the lantern's)
      const mut = curMutation();
      const e = mut && mut.noAutoAim ? null : nearestEnemy(p.x, p.y, 700);
      if (e) {
        p.aim = Math.atan2(e.y - p.y, e.x - p.x);
        p.aimDist = dist(e.x, e.y, p.x, p.y);
      } else if (p.moving) {
        p.aim = p.moveAng;
        p.aimDist = 1e9;
      }
      p.aimAuto = true;
      p.aimPow = 1;
    }
  } else if (Input.mouseActive()) {
    Input.mouseArena(_ms);
    const dx = _ms.x - p.x, dy = _ms.y - p.y;
    if (dx * dx + dy * dy > 9) p.aim = Math.atan2(dy, dx);
    p.aimDist = Math.hypot(dx, dy);
  } else {
    if (p.moving) p.aim = p.moveAng;
    p.aimDist = G.S ? G.S.dashDist : 235;
  }
}

/** Read the dash button. Runs even during hit-stop so no press is lost. */
function playerInput(p, dt) {
  const L = G.L;
  let want = false, power = 1;
  if (Input.touch && Input.release && !Input.tap) {
    p.aim = Math.atan2(Input.aimVec.y, Input.aimVec.x);
    p.aimPow = clamp(Input.aimVec.len / 90, 0, 1);
    p.aimAuto = false;
  }
  if (L.charge) {
    if ((Input.press || Input.touchPress || (Input.held && (Input.mouseDash || Input.mouseActive()))) && !p.charging) {
      p.charging = true;
      p.charge = 0;
      p.chargedCue = false;
      Sfx.charge();
    }
    if (p.charging) {
      p.charge = Math.min(1, p.charge + dt / L.charge);
      if (p.charge >= 1 && !p.chargedCue) {
        p.chargedCue = true;
        Sfx.charged();
        FX.ring(p.x, p.y, 30, 12, 0.2, PAL.goldRGB, 2);
      }
      if (Input.release || !Input.held) {
        want = true;
        power = p.charge;
        p.charging = false;
      }
    }
  } else if (Input.press) {
    // keyboard: the keydown edge is the entire gesture; keyup never dashes
    want = true;
  } else if (Input.release) {
    // mouse and touch: the pointerup edge is the entire gesture; pointer-down
    // only begins aiming (or drawing a charge lantern's bow), never a dash
    want = true;
  }

  if (want) {
    p.buf = 0.16;
    p.bufPow = power;
  }
  if (dt > 0 && p.buf > 0 && !p.dash) {
    p.buf = 0;
    tryDash(p, p.bufPow);
  }
}

function updatePlayer(dt) {
  const p = G.player, S = G.S, L = G.L;
  if (!p.alive) return;
  if (p.inv > 0) p.inv -= dt;
  if (p.haste > 0) p.haste -= dt;
  if (p.reboundT > 0) p.reboundT -= dt;
  if (p.failT > 0) p.failT -= dt;
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.buf > 0) p.buf -= dt;
  const mut = curMutation();
  if (G.run && G.run.practice) {
    p.flame = S.maxFlame;
    p.hearts = Math.max(p.hearts, 3);
  } else if (!p.dash) {
    if (mut && mut.regenZero) {
      // Hungry Flame: passive regeneration is suppressed above dash cost.
      // An emergency trickle (1.2/s) kicks in ONLY when below minimum dash cost
      // to prevent permanent mobility lock, stopping once one dash can be afforded.
      if (p.flame < S.dashCost) {
        p.flame = Math.min(S.dashCost, p.flame + 1.2 * dt);
      }
    } else if (p.flame < S.maxFlame) {
      p.flame = Math.min(S.maxFlame, p.flame + S.regen * dt);
    }
  }

  Input.moveVec(_mv);
  p.moving = _mv.x * _mv.x + _mv.y * _mv.y > 0.02;
  if (p.moving) p.moveAng = Math.atan2(_mv.y, _mv.x);
  updateAim(p);

  playerInput(p, dt);

  if (p.dash) stepDash(p, dt);
  else {
    const dryBonus = (p.flame < 5 && S.hasOil) ? (1 + S.oilDryHaste) : 1;
    const sp = S.moveSpeed * (p.haste > 0 ? 1.3 : 1) * (p.charging ? 0.5 : 1) * dryBonus;
    const k = Math.min(1, 16 * dt);
    p.vx += (_mv.x * sp - p.vx) * k;
    p.vy += (_mv.y * sp - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const m = arenaMargin(p.r + 3);
    p.x = clamp(p.x, m, G.W - m);
    p.y = clamp(p.y, m, G.H - m);
    // a faint wisp while walking, so the lantern always feels alive
    p.trail -= dt;
    if (p.trail <= 0 && p.moving) {
      p.trail = 0.05;
      FX.part(p.x + rand(-3, 3), p.y + rand(-3, 3), -p.vx * 0.1, -p.vy * 0.1, 0.3, 1.6, PAL.ember, 0, 2);
    }
  }
}

/** Dash distance rule:
    mouse cursor clamped between 40 and S.dashDist (lantern max reach);
    keyboard / touch default to S.dashDist unless dragged. */
function dashLengthFor(p) {
  const S = G.S;
  if (Input.touch) {
    if (Input.tap || p.aimAuto) return S.dashDist;
    return clamp(S.dashDist * p.aimPow, 40, S.dashDist);
  }
  if (!Input.mouseActive()) return S.dashDist;
  return clamp(p.aimDist, 40, S.dashDist);
}

/** Glint's blink: teleports directly to aim point (40 to S.dashDist), bursting on arrival. */
function blinkLengthFor(p) {
  const S = G.S;
  let d = S.dashDist;
  if (Input.touch) d *= p.aimAuto ? clamp(p.aimDist / S.dashDist, 0.25, 1) : Math.max(0.3, p.aimPow);
  else if (Input.mouseActive()) {
    d = clamp(p.aimDist, 40, S.dashDist);
  }
  return d;
}


function tryDash(p, power) {
  const S = G.S, L = G.L;
  let cost = S.dashCost;
  if (p.freeDash) cost = 0;
  else if (S.rebound && p.reboundT > 0) cost *= 0.5;
  if (p.flame + 0.001 < cost) {
    p.failT = 0.35;
    Sfx.dashFail();
    return false;
  }
  const overfull = S.overheat && p.flame > S.maxFlame + 0.5;
  p.flame -= cost;
  G.run.flameSpent += cost;
  if (cost === 0) p.freeDash = false;
  G.run.dashes++;
  G.wave.dashes++;
  Save.data.stats.dashes++;

  const ang = p.aim, dx = Math.cos(ang), dy = Math.sin(ang);
  const isClutch = p.flame <= 15 || p.hearts <= 1;
  if (isClutch) {
    Sfx.clutchDash();
    FX.ring(p.x, p.y, 8, 44, 0.28, PAL.emberRGB, 4);
    FX.sparks(p.x, p.y, 8, ang + Math.PI, 0.7, 100, 320, PAL.gold, 0.35);
  }
  let dmg = S.dashDmg + (overfull ? 1 : 0);
  if (S.gambit) dmg *= 2;
  if (L.blink) {
    doBlink(p, ang, dmg);
    return true;
  }
  let d = S.dashDist, width = S.dashWidth;
  if (L.charge) {
    d = lerp(L.distMin, S.dashDist, power);
    if (power >= 0.98) {
      dmg += L.dmg;
      width += 5;
    }
  } else {
    d = dashLengthFor(p);
  }
  if (S.undertow) undertow(p.x, p.y, dx, dy, d, width);
  p.dash = {
    id: ++G.cutSeq, ang, dx, dy, left: d, total: d, sx: p.x, sy: p.y,
    kills: 0, hits: 0, dmg, width, ext: 0, power, ghost: 0, blocked: false,
  };
  p.charging = false;
  Sfx.dash(L.charge ? power : 0.3);
  FX.sparks(p.x, p.y, 6, ang + Math.PI, 0.7, 60, 240, PAL.gold, 0.3);
  return true;
}

/** Relic: drag enemies standing just off the line onto it. */
function undertow(x, y, dx, dy, len, width) {
  const x2 = x + dx * len, y2 = y + dy * len;
  for (const e of G.enemies) {
    if (e.dead || e.boss || e.type === "moon" || e.spawn > 0) continue;
    const reach = e.r + width;
    const d2 = segDist2(x, y, x2, y2, e.x, e.y);
    if (d2 <= reach * reach || d2 > (reach + 62) * (reach + 62)) continue;
    const cx = x + dx * len * SEG.t, cy = y + dy * len * SEG.t;
    const d = Math.sqrt(d2), ux = (cx - e.x) / d, uy = (cy - e.y) / d;
    const move = d - reach * 0.5;
    FX.streak(e.x, e.y, e.x + ux * move, e.y + uy * move, 3, 0.2, 1);
    e.x += ux * move;
    e.y += uy * move;
  }
}

function stepDash(p, dt) {
  const d = p.dash, S = G.S, W = G.W, H = G.H, m = arenaMargin(p.r + 3);
  const step = Math.min(d.left, DASH_SPEED * dt);
  let nx = p.x + d.dx * step, ny = p.y + d.dy * step;
  let wall = false;
  if (nx < m || nx > W - m || ny < m || ny > H - m) {
    wall = true;
    nx = clamp(nx, m, W - m);
    ny = clamp(ny, m, H - m);
  }
  if (!d.perfect) checkPerfectDash(p, p.x, p.y, nx, ny, d);
  if (G.shrine && !G.shrine.claimed) {
    const sr = 30 * 30;
    if (segDist2(p.x, p.y, nx, ny, G.shrine.a.x, G.shrine.a.y) <= sr) claimShrine(G.shrine.a);
    else if (segDist2(p.x, p.y, nx, ny, G.shrine.b.x, G.shrine.b.y) <= sr) claimShrine(G.shrine.b);
  }

  // every enemy the blade crosses this frame, in the order it reaches them
  const hits = [];
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.spawn > 0 || e.intangible || e.lastCut === d.id) continue;
    const reach = e.r + d.width;
    if (segDist2(p.x, p.y, nx, ny, e.x, e.y) <= reach * reach) hits.push({ e, t: SEG.t });
  }
  if (hits.length > 1) hits.sort((a, b) => a.t - b.t);

  for (let i = 0; i < hits.length; i++) {
    const e = hits[i].e, t = hits[i].t;
    if (e.dead) continue;
    e.lastCut = d.id;
    const cx = lerp(p.x, nx, t), cy = lerp(p.y, ny, t);
    // where the blade first touches the body, for shield checks and bounces
    const off2 = dist2(cx, cy, e.x, e.y), R = e.r + p.r + 3;
    const back = Math.sqrt(Math.max(0, R * R - off2));
    const ex = cx - d.dx * back, ey = cy - d.dy * back;

    let shield = null;
    if (e.type === "bulwark" && shieldBlocks(e, ex, ey)) shield = e;
    else if (e.boss) shield = loomShieldAt(e, ex, ey);
    if (shield) {
      if (S.breaker) {
        Sfx.block();
        FX.flecks(ex, ey, 10, d.ang + Math.PI, 1.2, 120, 360, PAL.paper, 5);
        if (e.boss) shield.off = 6;
      } else {
        // the blade turns: stop here, bounce back, lose the dash
        p.x = clamp(ex, m, W - m);
        p.y = clamp(ey, m, H - m);
        d.blocked = true;
        Sfx.block();
        FX.addShake(4);
        FX.sparks(ex, ey, 14, d.ang + Math.PI, 1.0, 120, 420, PAL.paper, 0.35);
        FX.ring(ex, ey, 4, 30, 0.2, PAL.paperRGB, 2);
        if (e.type === "bulwark") {
          e.flash = 0.16;
          e.turnLock = Math.max(e.turnLock || 0, 0.7);
          e.stun = Math.max(e.stun || 0, 0.25);
          FX.text(ex, ey - e.r - 12, "BLOCKED", 13, PAL.paper, 0.55);
          knock(e, d.ang, 100);
        }
        G.hitstop = Math.max(G.hitstop, 0.05);
        endDash(p);
        p.vx = -d.dx * 300;
        p.vy = -d.dy * 300;
        p.inv = Math.max(p.inv, 0.4);
        return;
      }
    }
    let dmg = d.dmg;
    if (S.riposte && e.atk) {
      dmg += 2;
      addFlame(14);
      FX.text(e.x, e.y - e.r - 12, "riposte", 15, PAL.gold, 0.7);
      if (S.syn.riposteMomentum && d.ext < 320) {
        d.left += 50;
        d.ext += 50;
      }
    }
    const res = damageEnemy(e, dmg, "dash", d.ang, d);
    if (res === 2 && S.momentum && d.ext < 320) {
      d.left += S.momentum;
      d.ext += S.momentum;
      // Ashwake: a chain that keeps extending keeps the ground lit
      if (S.syn.ashwake) for (const w of G.wakes) w.life = w.max;
    }
  }

  // Deflect: bolts the blade passes through fly back at their makers
  if (S.deflect) {
    for (const b of G.bolts) {
      if (b.mine || b.dead) continue;
      const reach = b.r + d.width + 4;
      if (segDist2(p.x, p.y, nx, ny, b.x, b.y) <= reach * reach) reflectBolt(b);
    }
  }

  // afterimages along the path
  d.ghost -= step;
  if (d.ghost <= 0) {
    d.ghost = 46;
    const mastered = G.L && G.run && masteryLevel(Save.data.byLantern[G.run.lantern]) >= 5;
    FX.ghost(p.x, p.y, d.ang, 0.22, 1, mastered ? G.L.masteryRGB : null);
    if (mastered) {
      FX.part(p.x, p.y, -d.dx * 80 + rand(-15, 15), -d.dy * 80 + rand(-15, 15), 0.28, 2.0, `rgb(${G.L.masteryRGB})`, 0, 2);
    }
  }
  FX.streak(p.x, p.y, nx, ny, 9 + d.width * 0.5 + Math.min(10, d.kills * 2), 0.22 + Math.min(0.2, d.kills * 0.03), 0);
  p.x = nx;
  p.y = ny;
  d.left -= step;

  if (wall) {
    endDash(p);
    return;
  }
  if (d.left <= 0.01) {
    // never end a dash inside a boss: carry on until clear
    if (d.ext < 400) {
      for (const e of list) {
        if (e.boss && !e.dead && !e.intangible && dist2(p.x, p.y, e.x, e.y) < (e.r + p.r + 6) * (e.r + p.r + 6)) {
          d.left += 24;
          d.ext += 24;
          return;
        }
      }
    }
    endDash(p);
  }
}

/** Dashing through a telegraphed threat (bolt, ring, beam, a boss mid-lunge)
    without taking the hit. Fires once per dash, rewards the timing.      */
const PERFECT_PAD = 26;
function checkPerfectDash(p, x1, y1, x2, y2, d) {
  for (const b of G.bolts) {
    if (b.dead || b.mine) continue;
    const reach = b.r + PERFECT_PAD;
    if (segDist2(x1, y1, x2, y2, b.x, b.y) <= reach * reach) return firePerfect(p, d);
  }
  for (const hz of G.hazards) {
    if (hz.type === "ring") {
      const d1 = dist(x1, y1, hz.x, hz.y), d2 = dist(x2, y2, hz.x, hz.y);
      if ((d1 - hz.r) * (d2 - hz.r) <= 0 || Math.abs(d2 - hz.r) < 34) return firePerfect(p, d);
    } else if (hz.type === "beam" && hz.owner && !hz.owner.dead) {
      const b = hz.owner;
      for (let t = 0; t <= 1.001; t += 0.1) {
        const px = b.x + Math.cos(hz.ang) * (b.r + t * 1500), py = b.y + Math.sin(hz.ang) * (b.r + t * 1500);
        if (segDist2(x1, y1, x2, y2, px, py) <= PERFECT_PAD * PERFECT_PAD) return firePerfect(p, d);
        if (hz.two) {
          const qx = b.x + Math.cos(hz.ang + Math.PI) * (b.r + t * 1500), qy = b.y + Math.sin(hz.ang + Math.PI) * (b.r + t * 1500);
          if (segDist2(x1, y1, x2, y2, qx, qy) <= PERFECT_PAD * PERFECT_PAD) return firePerfect(p, d);
        }
      }
    }
  }
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.boss && e.atk && (e.state === "lurch" || e.state === "lurchTell")) {
      const reach = e.r + PERFECT_PAD + 8;
      if (segDist2(x1, y1, x2, y2, e.x, e.y) <= reach * reach) return firePerfect(p, d);
    } else if (e.type === "dart" && e.atk && (e.state === 2 || (e.state === 1 && e.t < 0.28))) {
      const reach = e.r + PERFECT_PAD + 6;
      if (segDist2(x1, y1, x2, y2, e.x, e.y) <= reach * reach) return firePerfect(p, d);
    } else if (e.type === "twin" && e.lead && e.mate && !e.mate.dead && e.warm <= 0) {
      const m = e.mate;
      if (segIntersects(x1, y1, x2, y2, e.x, e.y, m.x, m.y) || segDist2(x1, y1, x2, y2, (e.x + m.x) / 2, (e.y + m.y) / 2) <= (PERFECT_PAD + 12) * (PERFECT_PAD + 12)) {
        return firePerfect(p, d);
      }
    }
  }
}
function firePerfect(p, d) {
  d.perfect = true;
  const run = G.run, st = Save.data.stats;
  run.perfectDashes = (run.perfectDashes || 0) + 1;
  st.perfectDashes = (st.perfectDashes || 0) + 1;
  const bonus = (G.S.reachBonus || 0);
  addFlame(14 + bonus);
  if (G.S.fleetHaste) p.haste = Math.max(p.haste, 1.0);
  addScore(60, 0, 0, true);
  FX.text(p.x, p.y - 48, bonus ? `PERFECT +${14 + bonus}` : "PERFECT +14", 17, PAL.cold, 0.85);
  FX.ring(p.x, p.y, 8, 54, 0.3, PAL.coldRGB, 3);
  FX.sparks(p.x, p.y, 10, 0, Math.PI, 100, 260, PAL.cold, 0.4);
  Sfx.perfect();
  G.hitstop = Math.max(G.hitstop, 0.05);
  slowmo(0.16, 0.45);
  p.inv = Math.max(p.inv, 0.22);
  unlockAch("perfect1");
  if (st.perfectDashes >= 10) unlockAch("perfect10");
  if (st.perfectDashes >= 50) unlockAch("perfect50");
  return true;
}

function endDash(p) {
  const d = p.dash, S = G.S;
  if (!d) return;
  p.dash = null;
  p.inv = Math.max(p.inv, 0.14);
  p.vx = d.dx * 200;
  p.vy = d.dy * 200;
  p.reboundT = 0.5;
  const len = dist(d.sx, d.sy, p.x, p.y);
  if (!d.blocked && len > 20) {
    if (S.wake) G.wakes.push({ x1: d.sx, y1: d.sy, x2: p.x, y2: p.y, w: S.wakeW, life: S.wakeLife, max: S.wakeLife });
    const mut = curMutation();
    let echoes = S.echoes;
    if (mut && mut.forceEcho && echoes === 0) echoes = 1;
    for (let i = 0; i < echoes; i++) {
      // Doublecut: an echo reaches past where the chain's momentum carried you
      let ex = p.x, ey = p.y;
      if (S.syn.doublecut && d.ext > 0) {
        ex = p.x + d.dx * d.ext;
        ey = p.y + d.dy * d.ext;
      }
      G.echoes.push({ kind: "line", t: 0.5 * (i + 1), max: 0.5 * (i + 1), x1: d.sx, y1: d.sy, x2: ex, y2: ey, w: d.width, dmg: 1, trail: S.syn.twinflame });
    }
    if (S.crosscut) {
      const mx = (d.sx + p.x) / 2, my = (d.sy + p.y) / 2, hl = Math.max(70, len * 0.45);
      G.echoes.push({ kind: "line", t: 0.12, max: 0.12, x1: mx + d.dy * hl, y1: my - d.dx * hl, x2: mx - d.dy * hl, y2: my + d.dx * hl, w: d.width, dmg: 1 });
    }
  }
  onCutEnd(p, d);
}

/* Glint's blink: no path, just a burst where you land. */
function doBlink(p, ang, dmg) {
  const S = G.S, m = arenaMargin(p.r + 3);
  let d = blinkLengthFor(p);
  const sx = p.x, sy = p.y;
  p.x = clamp(sx + Math.cos(ang) * d, m, G.W - m);
  p.y = clamp(sy + Math.sin(ang) * d, m, G.H - m);
  p.vx = p.vy = 0;
  p.inv = Math.max(p.inv, 0.3);
  p.reboundT = 0.5;
  p.charging = false;
  Sfx.blink();
  const mastered = G.L && G.run && masteryLevel(Save.data.byLantern[G.run.lantern]) >= 5;
  FX.ghost(sx, sy, ang, 0.3, 1.2, mastered ? G.L.masteryRGB : null);
  FX.streak(sx, sy, p.x, p.y, 5, 0.2, 1);
  FX.ring(sx, sy, 16, 2, 0.18, PAL.paperRGB, 2);

  const cut = { id: ++G.cutSeq, kills: 0, hits: 0, ang };
  checkPerfectDash(p, sx, sy, p.x, p.y, cut);
  if (G.shrine && !G.shrine.claimed) {
    const sr = 30 * 30;
    if (segDist2(sx, sy, p.x, p.y, G.shrine.a.x, G.shrine.a.y) <= sr) claimShrine(G.shrine.a);
    else if (segDist2(sx, sy, p.x, p.y, G.shrine.b.x, G.shrine.b.y) <= sr) claimShrine(G.shrine.b);
  }
  const R = S.burstR;
  if (S.undertow) {
    for (const e of G.enemies) {
      if (e.dead || e.boss || e.type === "moon" || e.spawn > 0) continue;
      const dd = dist(e.x, e.y, p.x, p.y), reach = R + e.r;
      if (dd <= reach || dd > reach + 70) continue;
      const k = (dd - reach * 0.8) / dd;
      FX.streak(e.x, e.y, lerp(e.x, p.x, k), lerp(e.y, p.y, k), 3, 0.2, 1);
      e.x = lerp(e.x, p.x, k);
      e.y = lerp(e.y, p.y, k);
    }
  }
  burstAt(p.x, p.y, R, dmg, "dash", cut);
  FX.ring(p.x, p.y, 8, R, 0.24, PAL.goldRGB, 5);
  FX.ring(p.x, p.y, 4, R * 0.7, 0.3, PAL.emberRGB, 3);
  FX.sparks(p.x, p.y, 14, 0, Math.PI, 120, 380, PAL.gold, 0.35);
  FX.addShake(2);
  if (S.deflect) {
    for (const b of G.bolts) if (!b.mine && !b.dead && dist2(b.x, b.y, p.x, p.y) < (R + b.r) * (R + b.r)) reflectBolt(b);
  }
  if (S.wake) G.wakes.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, w: R * 0.7, life: S.wakeLife, max: S.wakeLife });
  {
    const mut = curMutation();
    let echoes = S.echoes;
    if (mut && mut.forceEcho && echoes === 0) echoes = 1;
    for (let i = 0; i < echoes; i++) G.echoes.push({ kind: "burst", t: 0.5 * (i + 1), max: 0.5 * (i + 1), x1: p.x, y1: p.y, R, dmg: 1, trail: S.syn.twinflame });
  }
  if (S.crosscut) G.echoes.push({ kind: "burst", t: 0.12, max: 0.12, x1: sx, y1: sy, R: R * 0.85, dmg: 1 });
  onCutEnd(p, cut);
}

/** Damage everything in a circle. Shields facing the centre still hold. */
function burstAt(x, y, R, dmg, src, cut) {
  const S = G.S;
  for (const e of G.enemies.slice()) {
    if (e.dead || e.spawn > 0 || e.intangible) continue;
    const reach = R + e.r;
    if (dist2(x, y, e.x, e.y) > reach * reach) continue;
    const ang = Math.atan2(e.y - y, e.x - x);
    let shield = null;
    if (e.type === "bulwark" && shieldBlocks(e, x, y)) shield = e;
    else if (e.boss) shield = loomShieldAt(e, x, y);
    if (shield) {
      Sfx.block();
      if (!S.breaker) {
        FX.sparks(e.x - Math.cos(ang) * e.r, e.y - Math.sin(ang) * e.r, 8, ang + Math.PI, 0.9, 100, 300, PAL.paper, 0.3);
        continue;
      }
      if (e.boss) shield.off = 6;
    }
    let dd = dmg;
    if (src === "dash" && S.riposte && e.atk) {
      dd += 2;
      addFlame(14);
    }
    damageEnemy(e, dd, src, ang, cut);
  }
}

/** Feedback that scales with how many fell to one cut. Named tiers make
    the quality of the stroke legible at a glance: 1 = Clean, 2 = Sharp,
    3 = Brutal, 4+ = Masterful. */
const QUALITY_TIER = (k) => (k >= 4 ? "masterful" : k === 3 ? "brutal" : k === 2 ? "sharp" : "clean");
const QUALITY_LABEL = { clean: "CLEAN", sharp: "SHARP", brutal: "BRUTAL", masterful: "MASTERFUL" };
function onCutEnd(p, cut) {
  const k = cut.kills, run = G.run, S = G.S;
  if (k === 0 && cut.hits === 0) {
    if (!cut.blocked) G.wave.misses++;
    Sfx.whiff();
    return;
  }
  if (k > run.bestMulti) {
    run.bestMulti = k;
    run.bestMultiWave = G.wave.n;
  }
  if (k >= 1) {
    const tier = QUALITY_TIER(k);
    run.quality[tier] = (run.quality[tier] || 0) + 1;
  }
  if (k >= 2) {
    addScore(25 * (k - 1) * (k - 1), 0, 0, true);
    FX.text(p.x, p.y - 36, QUALITY_LABEL[QUALITY_TIER(k)], Math.min(22, 16 + k * 2), k >= 5 ? PAL.gold : PAL.paper, 0.75);
    FX.ring(p.x, p.y, 14, 46 + k * 26, 0.34 + Math.min(0.3, k * 0.03), k >= 3 ? PAL.goldRGB : PAL.paperRGB, 2 + Math.min(6, k * 0.7));
    Sfx.multi(k);
  }
  if (k >= 3) {
    slowmo(0.2 + Math.min(0.22, k * 0.03), 0.3);
    FX.doFlash(0.09 + Math.min(0.16, k * 0.022), PAL.goldRGB);
    FX.punch(Math.min(0.045, 0.012 + k * 0.004));
    FX.addShake(2 + k);
    FX.sparks(p.x, p.y, 8 + k * 4, 0, Math.PI, 140, 380 + k * 30, PAL.gold, 0.6);
    if (k >= 5) FX.ring(p.x, p.y, 20, 120 + k * 30, 0.6, PAL.emberRGB, 3);
    if (S.fever) {
      p.freeDash = true;
      p.haste = 2.5;
    }
    if (S.starburst || S.syn.shattercut) {
      const off = rand(TAU);
      for (let i = 0; i < 10; i++) addShard(p.x, p.y, off + (i / 10) * TAU, null);
    }
    if (S.timewick) G.chillT = 2;
    unlockAch("triple");
    if (k >= 4) unlockAch("masterful");
    if (k >= 5) unlockAch("quint");
    if (k >= 8) unlockAch("octo");
  }
}

/** Bulwark's Ash and Thornward: what a Ward break or Flare leaves behind. */
function guardBurstExtras(p, S) {
  if (S.syn.bulwarkash) {
    G.wakes.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, w: 120, life: 1.6, max: 1.6 });
  }
  if (S.syn.thornward) {
    const off = rand(TAU);
    for (let i = 0; i < 8; i++) addShard(p.x, p.y, off + (i / 8) * TAU, null);
  }
}

/** Take a hit. `src` is an ENEMY_INFO key used for the death-screen tip. */
function hurtPlayer(src) {
  const p = G.player, S = G.S, run = G.run;
  if (!p.alive || p.dash || p.inv > 0 || G.state !== "play") return;
  // the shock that follows any hit: shove nearby enemies back
  const shove = (radius, force) => {
    for (const e of G.enemies) {
      if (e.dead || e.boss || e.type === "moon") continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < radius) {
        knock(e, Math.atan2(e.y - p.y, e.x - p.x), force * (1 - (d / radius) * 0.5));
        e.stun = Math.max(e.stun, 0.45);
      }
    }
  };
  if (p.ward) {
    p.ward = false;
    p.inv = 1.0;
    shove(170, 420);
    Sfx.ward();
    FX.ring(p.x, p.y, 16, 150, 0.4, PAL.goldRGB, 4);
    FX.flecks(p.x, p.y, 12, 0, Math.PI, 120, 320, PAL.gold, 4);
    if (S.syn.wardedecho) G.echoes.push({ kind: "burst", t: 0.1, max: 0.1, x1: p.x, y1: p.y, R: 150, dmg: 1 });
    guardBurstExtras(p, S);
    return;
  }
  const heartsBefore = p.hearts;
  p.hearts -= S.gambit ? 2 : 1;
  run.hits++;
  G.wave.hit = true;
  G.killedBy = src;
  p.inv = 1.4;
  p.hurtT = 0.4;
  p.charging = false;
  if (G.combo >= 5) Sfx.comboBreak();
  G.combo = 0;
  G.comboT = 0;
  shove(180, 460);
  Sfx.hurt();
  FX.addShake(11);
  FX.hurt = 1;
  FX.doFlash(0.22, PAL.coldRGB);
  FX.ring(p.x, p.y, 14, 180, 0.4, PAL.coldRGB, 4);
  FX.sparks(p.x, p.y, 16, 0, Math.PI, 120, 420, PAL.ember, 0.5);
  slowmo(0.3, 0.35);
  if (S.flare && p.hearts > 0) {
    burstAt(p.x, p.y, 175, 2, "blast", null);
    p.flame = S.maxFlame;
    FX.ring(p.x, p.y, 10, 175, 0.4, PAL.emberRGB, 6);
    Sfx.explode();
    guardBurstExtras(p, S);
  }
  if (p.hearts <= 0) {
    if (S.phoenix && !run.phoenixUsed) {
      run.phoenixUsed = true;
      p.hearts = Math.min(2, S.maxHearts);
      p.inv = 2.2;
      p.flame = S.maxFlame;
      burstAt(p.x, p.y, 280, 3, "blast", null);
      Sfx.revive();
      FX.doFlash(0.5, PAL.goldRGB);
      FX.ring(p.x, p.y, 10, 280, 0.6, PAL.goldRGB, 8);
      FX.sparks(p.x, p.y, 40, 0, Math.PI, 160, 640, PAL.gold, 0.9);
      FX.text(p.x, p.y - 44, "phoenix", 20, PAL.gold, 1.0);
      UI.notify("REVIVED", "Phoenix feather consumed", "disco");
      return;
    }
    if (G.lastEmber) {
      failLastEmber(p);
      return;
    }
    if (!run.rekindled && G.state === "play" && !run.practice) {
      startLastEmber(p, heartsBefore);
      return;
    }
    run.deathFlame = p.flame;
    run.deathHeartsBefore = heartsBefore;
    run.deathWave = G.wave ? G.wave.n : 0;
    run.deathEarly = !!(G.wave && G.wave.t < 6);
    p.alive = false;
    p.hearts = 0;
    G.dying = 1.5;
    Sfx.die();
    FX.sparks(p.x, p.y, 46, 0, Math.PI, 80, 620, PAL.ember, 1.1);
    FX.flecks(p.x, p.y, 16, 0, Math.PI, 80, 380, PAL.gold, 5);
    FX.ring(p.x, p.y, 10, 240, 0.9, PAL.emberRGB, 5);
    FX.addShake(10);
    slowmo(1.2, 0.25);
  }
}

/** Last Ember target ranking: plain distance first, plus a penalty for
    targets that punish a straight cut — a shield raised at you, a boss
    body, a Lurker still cloaked. Penalties are smaller than the distance
    spreads they exist to bridge, so a genuinely nearer target still wins
    and an awkward one only takes the mark when nothing better is alive. */
function emberTargetScore(e) {
  const p = G.player;
  let s = dist(p.x, p.y, e.x, e.y);
  if (e.boss) s += 260;
  else if (e.type === "bulwark" && shieldBlocks(e, p.x, p.y)) s += 150;
  if (e.type === "lurker" && (e.cloak === undefined || e.cloak > 0.5)) s += 90;
  return s;
}

function startLastEmber(p, heartsBefore) {
  const run = G.run;
  p.hearts = 0;
  p.inv = 0.6;
  p.flame = Math.max(p.flame, 40);

  let target = null;
  const candidates = G.enemies.filter(e => !e.dead && e.spawn <= 0 && !e.intangible && e.type !== "moon");
  if (candidates.length > 0) {
    candidates.sort((a, b) => emberTargetScore(a) - emberTargetScore(b));
    target = candidates[0];
  } else {
    const a = rand(TAU);
    const px = clamp(p.x + Math.cos(a) * 180, 50, G.W - 50);
    const py = clamp(p.y + Math.sin(a) * 180, 50, G.H - 50);
    target = spawnEnemy("blot", px, py, null);
    target.spawn = 0;
    target.speed = 25;
  }
  target.isEmberTarget = true;
  target.flash = 0.5;

  G.lastEmber = {
    t: 2.5,
    maxT: 2.5,
    target,
    heartsBefore,
  };

  slowmo(0.5, 0.45);
  FX.addShake(9);
  FX.doFlash(0.35, "255,80,30");
  FX.ring(p.x, p.y, 14, 160, 0.5, PAL.emberRGB, 4);
  FX.sparks(p.x, p.y, 25, 0, Math.PI, 120, 480, PAL.ember, 0.6);
  Sfx.lastEmber();
  FX.text(p.x, p.y - 52, "LAST EMBER", 22, PAL.gold, 1.3);
}

function failLastEmber(p) {
  if (!G.lastEmber) return;
  const run = G.run;
  const heartsBefore = G.lastEmber.heartsBefore || 1;
  if (G.lastEmber.target) G.lastEmber.target.isEmberTarget = false;
  G.lastEmber = null;

  run.deathFlame = p.flame;
  run.deathHeartsBefore = heartsBefore;
  run.deathWave = G.wave ? G.wave.n : 0;
  run.deathEarly = !!(G.wave && G.wave.t < 6);
  p.alive = false;
  p.hearts = 0;
  G.dying = 1.5;
  Sfx.die();
  FX.sparks(p.x, p.y, 46, 0, Math.PI, 80, 620, PAL.ember, 1.1);
  FX.flecks(p.x, p.y, 16, 0, Math.PI, 80, 380, PAL.gold, 5);
  FX.ring(p.x, p.y, 10, 240, 0.9, PAL.emberRGB, 5);
  FX.addShake(10);
  slowmo(1.2, 0.25);
}

function rekindlePlayer(p) {
  if (!G.lastEmber) return;
  const run = G.run;
  run.rekindled = true;
  Save.data.stats.rekindles = (Save.data.stats.rekindles || 0) + 1;
  if (G.lastEmber.target) {
    G.lastEmber.target.isEmberTarget = false;
    G.lastEmber.target.stun = Math.max(G.lastEmber.target.stun, 1.2);
  }
  G.lastEmber = null;

  p.hearts = 1;
  p.flame = Math.max(p.flame, 45);
  p.inv = Math.max(p.inv, 1.6);
  G.combo = 0;

  burstAt(p.x, p.y, 175, 1, "blast", null);

  G.hitstop = Math.max(G.hitstop, 0.08);
  slowmo(0.25, 0.4);
  Sfx.rekindle();
  FX.doFlash(0.45, PAL.goldRGB);
  FX.ring(p.x, p.y, 12, 220, 0.6, PAL.goldRGB, 6);
  FX.sparks(p.x, p.y, 35, 0, Math.PI, 140, 550, PAL.gold, 0.8);
  FX.text(p.x, p.y - 48, "REKINDLED", 24, PAL.gold, 1.4);
  UI.notify("REKINDLED", "The flame refused to die.", "disco");
}
