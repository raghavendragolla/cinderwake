"use strict";
/* Cinderwake — enemies. Each type asks the player one clear question.
   AI functions only decide a desired velocity and state; the shared
   update integrates movement, separation and contact damage.          */

const SLAM_R = 132; // Husk slam radius
const BLAST_R = 96; // Blister burst radius
const LUNGE_SPEED = 640;
const LUNGE_TIME = 0.48;
const LURK_WAKE_R = 165; // how close you have to walk before a Lurker stirs
const LURK_LUNGE_SPEED = 560;
const LURK_LUNGE_TIME = 0.4;

/* A short, shared history of where the player has actually been — Shades
   walk this instead of chasing the player's live position, so their whole
   threat is legible from your own last few seconds of movement. */
const TRAIL_SAMPLE_DT = 0.08;
const TRAIL_MAX_AGE = 3.0;
let playerTrail = [];
let trailAcc = 0;
function recordPlayerTrail(dt) {
  trailAcc += dt;
  if (trailAcc < TRAIL_SAMPLE_DT) return;
  trailAcc = 0;
  playerTrail.push({ x: G.player.x, y: G.player.y });
  const maxLen = Math.ceil(TRAIL_MAX_AGE / TRAIL_SAMPLE_DT);
  if (playerTrail.length > maxLen) playerTrail.shift();
}

let ENEMY_UID = 0;

function makeEnemy(type, x, y, o) {
  const info = ENEMY_INFO[type];
  const w = G.wave;
  const e = {
    id: ++ENEMY_UID, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: info.r, hp: info.hp, maxHp: info.hp,
    speed: (info.speed || 0) * G.mods.speedMult * (w ? w.speed : 1),
    facing: Math.atan2(G.player.y - y, G.player.x - x),
    state: 0, t: 0, age: 0, spawn: 0.28, stun: 0, flash: 0, burnCd: 0,
    lastCut: -1, dead: false, elite: false, atk: false, hitWall: false,
    wob: rand(TAU), side: rand() < 0.5 ? -1 : 1, score: info.score,
  };
  switch (type) {
    case "dart": e.t = (w && w.n === 2) ? rand(1.4, 2.2) : rand(0.9, 1.9); e.lock = 0; break;
    case "bulwark": e.arc = 1.08; e.turn = 1.5; e.turnLock = 0; e.shoveCd = rand(1.5, 2.5); e.shoveT = 0; break;
    case "seer": e.t = rand(1.3, 2.3); break;
    case "husk": e.cd = 0.4; break;
    case "clotling": e.stun = 0.5; break;
    case "twin": e.warm = 1.1; break;
    case "hunter": e.side = rand() < 0.5 ? 1 : -1; e.aiT = rand(0.05, 0.15); e.t = rand(1.2, 2.2); break;
    case "coordinator": e.aiT = rand(0.05, 0.15); e.pulseT = 2.5; break;
    case "lurker": e.cloak = 1; break;
    case "seep": e.dropT = rand(0.3, 0.7); break;
    case "trapper": e.plantCd = rand(0.2, 0.5); break;
    case "shade": e.delay = rand(1.0, 1.5); break;
  }
  if (o) Object.assign(e, o);
  if (e.elite) {
    e.hp += 1;
    e.maxHp = e.hp;
    e.r *= 1.08;
    e.score = Math.round(e.score * 1.6);
    if (type === "bulwark") e.turn = 2.0;
    // an elite is never just bigger numbers: it plays by one new rule
    e.eliteMod = type === "moon" ? null : pick(ELITE_MOD_ORDER);
    if (e.eliteMod && !Save.data.seenElite[e.eliteMod]) {
      // counted for real by Waves.update just after spawnEnemy returns; this
      // only decides whether tonight is the first time anyone has seen it
      const mod = ELITE_MODS[e.eliteMod];
      if (G.run) G.run.newDisc.push("Elite: " + mod.name);
      UI.notify("DISCOVERED", mod.name, "disco");
    }
    e.baseSpeed = e.speed;
    if (e.eliteMod === "armored") e.armorUp = true;
    else if (e.eliteMod === "regenerating") e.regenCd = 0;
    else e.speed *= 1.12;
  }
  if (e.slow) e.speed *= e.slow;
  return e;
}

/** Put a new enemy into the arena. Twins arrive as a linked pair. */
function spawnEnemy(type, x, y, o) {
  const s = Save.data.seen;
  s[type] = Math.min(99, (s[type] || 0) + 1);
  if (type === "twin") {
    const a = rand(TAU), m = 30, W = G.W, H = G.H;
    const ax = clamp(x + Math.cos(a) * 85, m, W - m), ay = clamp(y + Math.sin(a) * 85, m, H - m);
    const bx = clamp(x - Math.cos(a) * 85, m, W - m), by = clamp(y - Math.sin(a) * 85, m, H - m);
    const e1 = makeEnemy("twin", ax, ay, o), e2 = makeEnemy("twin", bx, by, o);
    e1.mate = e2;
    e2.mate = e1;
    e1.lead = true;
    e1.sign = 1;
    e2.sign = -1;
    G.enemies.push(e1, e2);
    return e1;
  }
  const e = makeEnemy(type, x, y, o);
  G.enemies.push(e);
  return e;
}

function steer(e, tvx, tvy, dt, rate) {
  const k = Math.min(1, rate * dt);
  e.vx += (tvx - e.vx) * k;
  e.vy += (tvy - e.vy) * k;
}
function knock(e, ang, force) {
  if (e.boss || e.type === "moon") return;
  e.kx += Math.cos(ang) * force;
  e.ky += Math.sin(ang) * force;
}
/** True when a blade arriving from (px,py) meets a Bulwark's shield. */
function shieldBlocks(e, px, py) {
  return Math.abs(angDiff(Math.atan2(py - e.y, px - e.x), e.facing)) < e.arc;
}

const ENEMY_AI = {
  blot(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.facing = Math.atan2(dy, dx);
    const close = d < 145;
    const sp = e.speed * (close ? 1.22 : 1.0);
    const w = Math.sin(e.age * 2.4 + e.wob) * (close ? 0.2 : 0.38);
    const ux = dx / d, uy = dy / d;
    steer(e, (ux - uy * w) * sp, (uy + ux * w) * sp, dt, close ? 5.2 : 4);
    if (close && Math.random() < 0.08) e.flash = 0.06;
  },

  clotling(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.facing = Math.atan2(dy, dx);
    const skitter = (Math.sin(e.age * 13 + e.wob) > -0.2) ? 1.15 : 0.72;
    steer(e, (dx / d) * e.speed * skitter, (dy / d) * e.speed * skitter, dt, 5.5);
  },

  /* Circle at range, show the lunge line, leap, then stand winded. */
  dart(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    if (e.state === 0) {
      e.atk = false;
      e.facing = Math.atan2(dy, dx);
      const rad = d > 260 ? 1 : d < 180 ? -0.7 : 0;
      if (e.hitWall) e.side = -e.side;
      steer(e, (ux * rad - uy * e.side * 0.75) * e.speed, (uy * rad + ux * e.side * 0.75) * e.speed, dt, 5);
      e.t -= dt;
      if (e.t <= 0 && d < 440) {
        const canAttack = typeof AI === "object" ? AI.requestAttackToken(e.id) : true;
        const fair = typeof AI === "object" ? AI.checkFairness(p, G.enemies, G.hazards).isFair : true;
        if (canAttack && fair) {
          e.state = 1;
          e.t = 0.72;
          e.lock = e.facing;
          Sfx.telegraph();
        } else {
          e.t = rand(0.2, 0.45);
          if (canAttack && typeof AI === "object") AI.releaseAttackToken(e.id);
        }
      }
    } else if (e.state === 1) {
      e.atk = true;
      steer(e, 0, 0, dt, 10);
      if (e.t > 0.36) e.lock = Math.atan2(dy, dx);
      e.facing = e.lock;
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 2;
        e.t = LUNGE_TIME;
        Sfx.lunge();
      }
    } else if (e.state === 2) {
      const sp = LUNGE_SPEED * (e.elite ? 1.1 : 1);
      e.vx = Math.cos(e.lock) * sp;
      e.vy = Math.sin(e.lock) * sp;
      e.t -= dt;
      if (e.t <= 0 || e.hitWall) {
        e.state = 3;
        e.t = 0.8;
        e.atk = false;
        if (typeof AI === "object") AI.releaseAttackToken(e.id);
      }
    } else {
      steer(e, 0, 0, dt, 9);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 0;
        e.t = rand(1.1, 2.0);
      }
    }
  },

  /* Walks where it faces, and only turns slowly. The back is open.
     Predictable commitment and turn stagger create fair flanking openings. */
  bulwark(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    const want = Math.atan2(dy, dx);
    const diff = Math.abs(angDiff(want, e.facing));

    if (e.turnLock > 0) {
      e.turnLock -= dt;
      // While turn is locked (committed forward stride, wall bump, or shield block stagger),
      // it marches along its committed facing and CANNOT pivot, giving the player an opening to flank!
      const spMult = e.shoveT > 0 ? 1.25 : 0.75;
      steer(e, Math.cos(e.facing) * e.speed * spMult, Math.sin(e.facing) * e.speed * spMult, dt, 3.5);
      if (e.shoveT > 0) e.shoveT -= dt;
      return;
    }

    if (e.shoveCd > 0) e.shoveCd -= dt;
    // Human-friendly bait opening:
    // If player approaches the front arc (d < 125, angle < 0.55 rad), Bulwark commits to a forward stride!
    if (d < 125 && diff < 0.55 && e.shoveCd <= 0) {
      e.shoveCd = rand(2.4, 3.4);
      e.shoveT = 0.65;
      e.turnLock = 0.65;
      e.flash = 0.12;
      steer(e, Math.cos(e.facing) * e.speed * 1.25, Math.sin(e.facing) * e.speed * 1.25, dt, 5);
      return;
    }

    e.facing = turnToward(e.facing, want, e.turn * dt);
    steer(e, Math.cos(e.facing) * e.speed, Math.sin(e.facing) * e.speed, dt, 3);
  },

  /* Arms itself when close; bursts whenever it dies, by any hand. */
  blister(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.state === 0) {
      e.facing = Math.atan2(dy, dx);
      steer(e, (dx / d) * e.speed, (dy / d) * e.speed, dt, 4);
      if (d < 82) {
        e.state = 1;
        e.t = 0.85;
        e.atk = true;
        Sfx.fuse();
      }
    } else {
      steer(e, 0, 0, dt, 8);
      e.t -= dt;
      if (e.t <= 0) killEnemy(e, "self", 0, null);
    }
  },

  /* Holds its distance, sights along a line, then fires down it. */
  seer(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    if (e.state === 0) {
      e.atk = false;
      e.facing = Math.atan2(dy, dx);
      const rad = d < 270 ? -1 : d > 430 ? 1 : 0;
      if (e.hitWall) e.side = -e.side;
      steer(e, (ux * rad - uy * e.side * 0.5) * e.speed, (uy * rad + ux * e.side * 0.5) * e.speed, dt, 3);
      e.t -= dt;
      if (e.t <= 0) {
        const canAttack = typeof AI === "object" ? AI.requestAttackToken(e.id) : true;
        const fair = typeof AI === "object" ? AI.checkFairness(p, G.enemies, G.hazards).isFair : true;
        if (canAttack && fair) {
          e.state = 1;
          e.t = 1.05;
          Sfx.telegraph();
        } else {
          e.t = rand(0.3, 0.6);
          if (canAttack && typeof AI === "object") AI.releaseAttackToken(e.id);
        }
      }
    } else {
      e.atk = true;
      steer(e, 0, 0, dt, 6);
      if (e.t > 0.40) e.facing = Math.atan2(dy, dx); // the last portion is locked
      e.t -= dt;
      if (e.t <= 0) {
        addBolt(e.x + Math.cos(e.facing) * 14, e.y + Math.sin(e.facing) * 14, e.facing, 530);
        Sfx.bolt();
        e.state = 0;
        e.t = rand(1.8, 2.8);
        knock(e, e.facing + Math.PI, 120);
        if (typeof AI === "object") AI.releaseAttackToken(e.id);
      }
    }
  },

  clot(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.facing = Math.atan2(dy, dx);
    steer(e, (dx / d) * e.speed, (dy / d) * e.speed, dt, 3);
  },

  /* Slow and thick. Slams the ground if you stay close. */
  husk(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.state === 0) {
      e.atk = false;
      e.facing = Math.atan2(dy, dx);
      steer(e, (dx / d) * e.speed, (dy / d) * e.speed, dt, 3);
      e.cd -= dt;
      if (d < 108 && e.cd <= 0) {
        const canAttack = typeof AI === "object" ? AI.requestAttackToken(e.id) : true;
        const fair = typeof AI === "object" ? AI.checkFairness(p, G.enemies, G.hazards).isFair : true;
        if (canAttack && fair) {
          e.state = 1;
          e.t = 0.82;
          e.atk = true;
          Sfx.telegraph();
        } else {
          e.cd = rand(0.3, 0.55);
          if (canAttack && typeof AI === "object") AI.releaseAttackToken(e.id);
        }
      }
    } else if (e.state === 1) {
      e.atk = true;
      steer(e, 0, 0, dt, 8);
      e.t -= dt;
      if (e.t <= 0) {
        Sfx.slam();
        FX.addShake(5);
        FX.ring(e.x, e.y, e.r, SLAM_R, 0.35, PAL.coldRGB, 5);
        addRing(e.x, e.y, e.r, 320, SLAM_R, "husk");
        e.state = 2;
        e.t = 1.1;
        e.atk = false;
        if (typeof AI === "object") AI.releaseAttackToken(e.id);
      }
    } else {
      steer(e, 0, 0, dt, 8);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 0;
        e.cd = 1.2;
      }
    }
  },

  /* Two bodies and the burning thread between them. */
  twin(e, dt, p) {
    const m = e.mate;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.facing = Math.atan2(dy, dx);
    if (!m || m.dead) {
      steer(e, (dx / d) * e.speed * 1.7, (dy / d) * e.speed * 1.7, dt, 5);
      return;
    }
    if (e.warm > 0) e.warm -= dt;
    // try to straddle the player so the thread sweeps across them
    const cx = (e.x + m.x) / 2, cy = (e.y + m.y) / 2;
    let ax = p.x - cx, ay = p.y - cy;
    const ad = Math.hypot(ax, ay) || 1;
    ax /= ad;
    ay /= ad;
    const tx = p.x - ay * e.sign * 100 + ax * 30, ty = p.y + ax * e.sign * 100 + ay * 30;
    const mx = tx - e.x, my = ty - e.y, md = Math.hypot(mx, my) || 1;
    const sp = md < 12 ? 0 : e.speed;
    steer(e, (mx / md) * sp, (my / md) * sp, dt, 4);
    if (e.lead && e.warm <= 0 && m.warm <= 0 && m.spawn <= 0 && m.stun <= 0 && p.alive && !p.dash && p.inv <= 0) {
      if (segDist2(e.x, e.y, m.x, m.y, p.x, p.y) < 121) hurtPlayer("thread");
    }
  },

  hunter(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.state === 0) {
      e.atk = false;
      e.facing = Math.atan2(dy, dx);
      e.aiT = (e.aiT || 0) - dt;
      if (e.aiT <= 0) {
        e.aiT = rand(0.12, 0.22);
        const pAng = Input.mouseActive() ? p.aim : 0;
        const toMe = Math.atan2(e.y - p.y, e.x - p.x);
        if (d < 240 && Math.abs(angDiff(pAng, toMe)) < 0.28) {
          e.side = -e.side;
        }
        e.targetPt = typeof AI === "object" ? AI.findFlankPosition(e, p, 230, e.side) : { x: p.x, y: p.y };
      }
      const tx = e.targetPt ? e.targetPt.x : p.x, ty = e.targetPt ? e.targetPt.y : p.y;
      const tdx = tx - e.x, tdy = ty - e.y, td = Math.hypot(tdx, tdy) || 1;
      steer(e, (tdx / td) * e.speed, (tdy / td) * e.speed, dt, 4.8);
      e.t -= dt;
      if (e.t <= 0 && d < 320) {
        const canAttack = typeof AI === "object" ? AI.requestAttackToken(e.id) : true;
        const fair = typeof AI === "object" ? AI.checkFairness(p, G.enemies, G.hazards).isFair : true;
        if (canAttack && fair) {
          e.state = 1;
          e.t = 0.65;
          e.lock = e.facing;
          Sfx.telegraph();
        } else {
          e.t = rand(0.3, 0.6);
          if (canAttack && typeof AI === "object") AI.releaseAttackToken(e.id);
        }
      }
    } else if (e.state === 1) {
      e.atk = true;
      steer(e, 0, 0, dt, 10);
      if (e.t > 0.32) e.lock = Math.atan2(dy, dx);
      e.facing = e.lock;
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 2;
        e.t = 0.35;
        Sfx.lunge();
      }
    } else if (e.state === 2) {
      const sp = 520 * (e.elite ? 1.1 : 1);
      e.vx = Math.cos(e.lock) * sp;
      e.vy = Math.sin(e.lock) * sp;
      e.t -= dt;
      if (e.t <= 0 || e.hitWall) {
        e.state = 3;
        e.t = 0.75;
        e.atk = false;
        if (typeof AI === "object") AI.releaseAttackToken(e.id);
      }
    } else {
      steer(e, 0, 0, dt, 9);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 0;
        e.t = rand(1.5, 2.5);
      }
    }
  },

  coordinator(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.facing = Math.atan2(dy, dx);
    e.aiT = (e.aiT || 0) - dt;
    if (e.aiT <= 0) {
      e.aiT = rand(0.15, 0.25);
      const blocker = G.enemies.find((o) => !o.dead && (o.type === "bulwark" || o.type === "husk"));
      e.targetPt = typeof AI === "object" ? AI.findSupportPosition(e, blocker, p) : { x: p.x - (dx / d) * 360, y: p.y - (dy / d) * 360 };
    }
    const tx = e.targetPt ? e.targetPt.x : p.x - (dx / d) * 360, ty = e.targetPt ? e.targetPt.y : p.y - (dy / d) * 360;
    const tdx = tx - e.x, tdy = ty - e.y, td = Math.hypot(tdx, tdy) || 1;
    steer(e, (tdx / td) * e.speed, (tdy / td) * e.speed, dt, 4.0);

    e.pulseT = (e.pulseT || 2.5) - dt;
    if (e.pulseT <= 0) {
      e.pulseT = rand(2.8, 3.8);
      FX.ring(e.x, e.y, 8, 90, 0.4, PAL.goldRGB, 2);
      Sfx.command();
      for (const o of G.enemies) {
        if (o.dead || o === e || dist2(e.x, e.y, o.x, o.y) > 280 * 280) continue;
        if (o.side !== undefined) o.side = -o.side;
        o.flash = 0.08;
        o.markT = 0.9; // read out: "these allies are being steered right now"
      }
    }
  },

  /* Stays still and nearly invisible until you walk too close, then wakes,
     locks on, and lunges once. A patient player can cut it before it stirs. */
  lurker(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.state === 0 || e.state === undefined) {
      e.atk = false;
      e.cloak = Math.min(1, (e.cloak === undefined ? 1 : e.cloak) + dt * 0.6);
      e.checkT = (e.checkT || 0) - dt;
      if (d < LURK_WAKE_R && e.checkT <= 0) {
        e.checkT = 0.18;
        const canAttack = typeof AI === "object" ? AI.requestAttackToken(e.id) : true;
        const fair = typeof AI === "object" ? AI.checkFairness(p, G.enemies, G.hazards).isFair : true;
        if (canAttack && fair) {
          e.state = 1;
          e.t = 0.42;
          e.lock = Math.atan2(dy, dx);
          e.facing = e.lock;
          e.atk = true;
          Sfx.telegraph();
        } else if (canAttack && typeof AI === "object") {
          AI.releaseAttackToken(e.id);
        }
      }
      return;
    }
    if (e.state === 1) {
      e.cloak = Math.max(0, e.cloak - dt * 7);
      steer(e, 0, 0, dt, 10);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 2;
        e.t = LURK_LUNGE_TIME;
        Sfx.lunge();
      }
      return;
    }
    if (e.state === 2) {
      const sp = LURK_LUNGE_SPEED * (e.elite ? 1.1 : 1);
      e.vx = Math.cos(e.lock) * sp;
      e.vy = Math.sin(e.lock) * sp;
      e.t -= dt;
      if (e.t <= 0 || e.hitWall) {
        e.state = 3;
        e.t = 0.9;
        e.atk = false;
        if (typeof AI === "object") AI.releaseAttackToken(e.id);
      }
      return;
    }
    // state 3: spent and exposed, then settles back into stillness
    steer(e, 0, 0, dt, 8);
    e.facing = Math.atan2(dy, dx);
    e.t -= dt;
    if (e.t <= 0) {
      e.state = 0;
      e.cloak = 0;
      e.checkT = 0.5;
    }
  },

  /* Slow and unthreatening by itself — the ground it leaves behind is the
     real danger. Kill it fast, or the arena keeps shrinking around it. */
  seep(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.facing = Math.atan2(dy, dx);
    steer(e, (dx / d) * e.speed, (dy / d) * e.speed, dt, 2.5);
    e.dropT -= dt;
    if (e.dropT <= 0) {
      e.dropT = rand(1.1, 1.5);
      addPool(e.x, e.y, 58, 4.2, "pool");
      e.flash = 0.15;
    }
  },

  /* Keeps its distance, picks a spot, plants a device, then moves to the
     next. The device is the threat; cut the Trapper before it finishes. */
  trapper(e, dt, p) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.state === 1) {
      e.atk = true;
      steer(e, 0, 0, dt, 7);
      e.facing = Math.atan2(dy, dx);
      e.t -= dt;
      if (e.t <= 0) {
        addTrap(e.x, e.y, 46, 0.5, 5.5, "trap");
        e.state = 0;
        e.atk = false;
        e.plantCd = rand(2.2, 3.2);
        e.targetPt = null;
        if (typeof AI === "object") AI.releaseAttackToken(e.id);
      }
      return;
    }
    e.atk = false;
    e.facing = Math.atan2(dy, dx);
    if (!e.targetPt || dist2(e.x, e.y, e.targetPt.x, e.targetPt.y) < 24 * 24) {
      const a = rand(TAU), dd = rand(130, 260), m = 50;
      e.targetPt = { x: clamp(p.x + Math.cos(a) * dd, m, G.W - m), y: clamp(p.y + Math.sin(a) * dd, m, G.H - m) };
    }
    const tdx = e.targetPt.x - e.x, tdy = e.targetPt.y - e.y, td = Math.hypot(tdx, tdy) || 1;
    steer(e, (tdx / td) * e.speed, (tdy / td) * e.speed, dt, 3.5);
    e.plantCd -= dt;
    if (td < 26 && e.plantCd <= 0) {
      const canAttack = typeof AI === "object" ? AI.requestAttackToken(e.id) : true;
      const fair = typeof AI === "object" ? AI.checkFairness(p, G.enemies, G.hazards).isFair : true;
      if (canAttack && fair) {
        e.state = 1;
        e.t = 0.6;
        Sfx.fuse();
      } else {
        e.plantCd = rand(0.3, 0.6);
        if (canAttack && typeof AI === "object") AI.releaseAttackToken(e.id);
      }
    }
  },

  /* Walks a few seconds of your own path, not your current position. Lead
     it somewhere on purpose, or outrun your own trail and leave it behind. */
  shade(e, dt, p) {
    const steps = Math.round(e.delay / TRAIL_SAMPLE_DT);
    const idx = playerTrail.length - 1 - steps;
    const target = idx >= 0 ? playerTrail[idx] : (playerTrail[0] || p);
    const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.facing = Math.atan2(dy, dx);
    const sp = 118;
    steer(e, d < 6 ? 0 : (dx / d) * sp, d < 6 ? 0 : (dy / d) * sp, dt, 4);
  },

  moon() {},
};

function updateEnemies(dt) {
  const p = G.player, list = G.enemies, W = G.W, H = G.H;
  recordPlayerTrail(dt);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.burnCd > 0) e.burnCd -= dt;
    if (e.markT > 0) e.markT -= dt;
    e.age += dt;
    if (e.spawn > 0) {
      e.spawn -= dt;
      continue;
    }
    // elite modifiers that run every frame, regardless of AI state
    if (e.eliteMod === "regenerating") {
      if (e.regenCd > 0) e.regenCd -= dt;
      else if (e.hp < e.maxHp) {
        e.hp++;
        e.flash = 0.1;
        e.regenCd = 1.1;
      }
    } else if (e.eliteMod === "hunting") {
      e.speed = e.baseSpeed * (1 + clamp((dist(p.x, p.y, e.x, e.y) - 200) / 500, 0, 1) * 0.7);
    }
    const adt = e.eliteMod === "frenzied" ? dt * 1.35 : dt;
    if (e.boss) updateBoss(e, dt, p);
    else if (e.stun > 0) {
      e.stun -= dt;
      const k = Math.exp(-8 * dt);
      e.vx *= k;
      e.vy *= k;
    } else ENEMY_AI[e.type](e, adt, p);
    if (e.dead || e.type === "moon") continue;
    e.hitWall = false;
    const kk = Math.exp(-7 * dt);
    e.x += (e.vx + e.kx) * dt;
    e.y += (e.vy + e.ky) * dt;
    e.kx *= kk;
    e.ky *= kk;
    const m = e.r + 4;
    if (e.x < m) { e.x = m; e.hitWall = true; }
    else if (e.x > W - m) { e.x = W - m; e.hitWall = true; }
    if (e.y < m) { e.y = m; e.hitWall = true; }
    else if (e.y > H - m) { e.y = H - m; e.hitWall = true; }
    if (e.hitWall && e.type === "bulwark") {
      e.turnLock = Math.max(e.turnLock || 0, 0.7);
      e.flash = Math.max(e.flash || 0, 0.08);
    }
  }

  // Keep bodies from stacking, without scattering a good line.
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead || a.type === "moon" || a.intangible) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead || b.type === "moon" || b.intangible) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r + 2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) * 0.5, ux = dx / d, uy = dy / d;
      const wa = a.boss ? 0 : b.boss ? 1 : 0.5, wb = b.boss ? 0 : a.boss ? 1 : 0.5;
      a.x -= ux * push * wa * 2 * 0.5;
      a.y -= uy * push * wa * 2 * 0.5;
      b.x += ux * push * wb * 2 * 0.5;
      b.y += uy * push * wb * 2 * 0.5;
    }
  }

  // Touching living ink hurts — unless you are mid-dash or it is stunned.
  if (p.alive && !p.dash && p.inv <= 0) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.spawn > 0 || e.stun > 0 || e.intangible) continue;
      const rr = e.r * 0.86 + 7;
      const d2 = dist2(p.x, p.y, e.x, e.y);
      if (d2 < rr * rr) {
        const hadWard = p.ward;
        hurtPlayer(e.type);
        if (!hadWard && e.eliteMod === "vampiric" && !e.dead && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + 1);
          e.flash = 0.15;
          FX.ring(e.x, e.y, e.r * 0.5, e.r + 12, 0.3, "220,40,60", 2);
        }
        break;
      } else if (e.atk && !e.nearMissed && d2 <= (rr + 24) * (rr + 24)) {
        e.nearMissed = true;
        if (typeof onNearMiss === "function") onNearMiss(p, e.x, e.y, e.type);
      }
    }
  }

  // Compact the list in place.
  let n = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[n++] = list[i];
  list.length = n;
}
