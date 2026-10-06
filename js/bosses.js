"use strict";
/* Cinderwake — bosses. Each one is a small state machine that always
   telegraphs before it acts, then leaves an opening afterwards.       */

function makeBoss(kind, x, y, tier) {
  const info = ENEMY_INFO[kind];
  const b = makeEnemy(kind, x, y, null);
  const hp = Math.round(info.hp * G.mods.bossHp * (1 + 0.4 * tier));
  Object.assign(b, {
    boss: true, hp, maxHp: hp, r: info.r, score: info.score, speed: 0,
    state: "idle", t: 1.3, phase: 1, immune: 0, bag: [], lastAtk: "", ang: 0, n: 0,
    tier, rate: G.mods.bossSpeed * (1 + 0.08 * tier), spawn: 0.5,
    invuln: false, intangible: false,
  });
  if (kind === "loom") {
    b.shAng = 0;
    b.shDir = 1;
    b.flipT = 4;
    b.shields = [{ a: 0, arc: 1.75, off: 0 }, { a: Math.PI, arc: 1.75, off: 0 }];
    b.sAng = 0;
    b.sT = 0;
  } else if (kind === "eclipse") {
    b.orbit = 0;
    b.exposed = 0;
    b.invuln = true;
    b.state = "regrow";
    b.t = 0.9;
    b.rot = 1;
  }
  return b;
}

function bossNext(b, options) {
  if (typeof AI === "object" && AI.bossPickAttack && G.player) {
    return AI.bossPickAttack(b, G.player, G.hazards, options);
  }
  if (!b.bag.length) b.bag = shuffle(options.slice());
  let a = b.bag.pop();
  if (a === b.lastAtk && b.bag.length) {
    const other = b.bag.pop();
    b.bag.push(a);
    a = other;
  }
  b.lastAtk = a;
  return a;
}
function countAdds() {
  let n = G.spawns.length;
  for (const e of G.enemies) if (!e.dead && !e.boss && e.type !== "moon") n++;
  return n;
}
function bossPhaseFx(b, rgb) {
  Sfx.phase();
  FX.addShake(8);
  FX.ring(b.x, b.y, b.r, b.r + 190, 0.6, rgb || PAL.coldRGB, 6);
  FX.flecks(b.x, b.y, 18, 0, Math.PI, 120, 420, PAL.paper, 5);
  slowmo(0.35, 0.4);
}
/** A point inside the arena at least `minD` from the player. */
function farPoint(minD, margin) {
  const p = G.player;
  let bx = G.W / 2, by = G.H / 2, best = -1;
  for (let i = 0; i < 24; i++) {
    const x = rand(margin, G.W - margin), y = rand(margin, G.H - margin);
    const d = dist(x, y, p.x, p.y);
    if (d >= minD) return { x, y };
    if (d > best) {
      best = d;
      bx = x;
      by = y;
    }
  }
  return { x: bx, y: by };
}
function spawnAround(b, types, radius) {
  const off = rand(TAU);
  types.forEach((type, i) => {
    const a = off + (i / types.length) * TAU;
    const x = clamp(b.x + Math.cos(a) * radius, 40, G.W - 40), y = clamp(b.y + Math.sin(a) * radius, 40, G.H - 40);
    queueSpawn(type, x, y, i * 0.06, false);
  });
}

/** Returns the Loom shield a blade from (px,py) would strike, or null. */
function loomShieldAt(b, px, py) {
  if (b.type !== "loom") return null;
  const th = Math.atan2(py - b.y, px - b.x);
  for (const s of b.shields) {
    if (s.off > 0) continue;
    if (Math.abs(angDiff(th, b.shAng + s.a)) < s.arc / 2) return s;
  }
  return null;
}

/** Called after a boss survives a cut. */
function bossOnHit(b) {
  if (b.type === "loom") {
    b.state = "vanish";
    b.t = 0.45;
    b.intangible = true;
    b.atk = false;
  }
}

const BOSS_AI = {
  /* ---------------------------------------------------------- Mire */
  mire(b, dt, p) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (b.phase === 1 && b.hp <= b.maxHp * 0.5) {
      b.phase = 2;
      bossPhaseFx(b, PAL.emberRGB);
    } else if (b.phase === 2 && b.hp <= b.maxHp * 0.2) {
      b.phase = 3;
      bossPhaseFx(b, PAL.emberRGB);
    }
    const k = b.rate * (b.phase === 3 ? 1.55 : b.phase === 2 ? 1.25 : 1);
    switch (b.state) {
      case "idle":
        b.atk = false;
        b.facing = Math.atan2(dy, dx);
        steer(b, (dx / d) * 46, (dy / d) * 46, dt, 2);
        b.t -= dt * k;
        if (b.t <= 0) {
          // movement mastery, to the last: at phase 3 the ground never stops moving
          const opts = b.phase === 3 ? ["lurch", "quake", "lurch", "quake"] : ["lurch", "quake", "lurch"];
          if (countAdds() < 5) opts.push("brood");
          const a = bossNext(b, opts);
          if (a === "lurch") {
            b.state = "lurchTell";
            b.t = 0.85;
            b.ang = Math.atan2(dy, dx);
          } else if (a === "quake") {
            b.state = "quakeTell";
            b.t = 1.0;
            b.n = b.phase >= 2 ? 2 : 1;
          } else {
            b.state = "broodTell";
            b.t = 0.6;
          }
          Sfx.telegraph();
        }
        break;
      case "lurchTell":
        b.atk = true;
        steer(b, 0, 0, dt, 8);
        if (b.t > 0.3) b.ang = Math.atan2(dy, dx);
        b.facing = b.ang;
        b.t -= dt * k;
        if (b.t <= 0) {
          b.state = "lurch";
          b.t = 0.55;
          Sfx.lunge();
        }
        break;
      case "lurch":
        b.atk = true;
        b.vx = Math.cos(b.ang) * 720;
        b.vy = Math.sin(b.ang) * 720;
        b.t -= dt;
        if (b.t <= 0 || b.hitWall) {
          if (b.hitWall) {
            FX.addShake(7);
            Sfx.slam();
          }
          b.state = "rest";
          b.t = 1.15;
        }
        break;
      case "quakeTell":
        b.atk = true;
        steer(b, 0, 0, dt, 8);
        b.t -= dt * k;
        if (b.t <= 0) {
          addRing(b.x, b.y, b.r, 280, 350);
          Sfx.slam();
          FX.addShake(6);
          if (--b.n > 0) b.t = 1.0;
          else {
            b.state = "rest";
            b.t = 1.0;
          }
        }
        break;
      case "broodTell":
        steer(b, 0, 0, dt, 8);
        b.t -= dt * k;
        if (b.t <= 0) {
          spawnAround(b, b.phase >= 2 ? ["blot", "blot", "blot", "blister"] : ["blot", "blot", "blot"], 110);
          b.state = "rest";
          b.t = 0.7;
        }
        break;
      default: // rest
        b.atk = false;
        steer(b, 0, 0, dt, 5);
        b.t -= dt * k;
        if (b.t <= 0) {
          b.state = "idle";
          b.t = 0.9;
        }
    }
  },

  /* ---------------------------------------------------------- Loom */
  loom(b, dt, p) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (b.phase === 1 && b.hp <= b.maxHp * 0.5) {
      b.phase = 2;
      b.shields = [0, 1, 2].map((i) => ({ a: (i * TAU) / 3, arc: 1.2, off: 0 }));
      bossPhaseFx(b, PAL.coldRGB);
    } else if (b.phase === 2 && b.hp <= b.maxHp * 0.2) {
      b.phase = 3;
      b.shields = [0, 1, 2].map((i) => ({ a: (i * TAU) / 3, arc: 0.95, off: 0 }));
      bossPhaseFx(b, PAL.coldRGB);
    }
    const k = b.rate * (b.phase === 3 ? 1.5 : b.phase === 2 ? 1.2 : 1);
    b.shAng += b.shDir * (b.phase === 3 ? 1.85 : b.phase === 2 ? 1.45 : 1.05) * dt * Math.min(1.3, b.rate);
    for (const s of b.shields) if (s.off > 0) s.off -= dt;
    if (b.phase >= 2) {
      b.flipT -= dt;
      if (b.flipT <= 0) {
        b.shDir = -b.shDir;
        b.flipT = b.phase === 3 ? rand(1.8, 3) : rand(3, 5);
      }
    }
    switch (b.state) {
      case "idle": {
        b.atk = false;
        b.facing = Math.atan2(dy, dx);
        const rad = d < 230 ? -1 : d > 380 ? 1 : 0;
        steer(b, (dx / d) * rad * 44, (dy / d) * rad * 44, dt, 2);
        b.t -= dt * k;
        if (b.t <= 0) {
          const opts = b.phase === 3 ? ["fan", "spiral", "fan", "spiral"] : ["fan", "spiral", "fan"];
          if (countAdds() < 4) opts.push("thread");
          const a = bossNext(b, opts);
          if (a === "fan") {
            b.state = "fanTell";
            b.t = 0.75;
            b.ang = Math.atan2(dy, dx);
            b.n = b.phase >= 2 ? 2 : 1;
          } else if (a === "spiral") {
            b.state = "spiral";
            b.t = 1.5;
            b.sAng = rand(TAU);
            b.sT = 0.35;
          } else {
            b.state = "threadTell";
            b.t = 0.6;
          }
          Sfx.telegraph();
        }
        break;
      }
      case "fanTell":
        b.atk = true;
        steer(b, 0, 0, dt, 6);
        if (b.t > 0.25) b.ang = Math.atan2(dy, dx);
        b.facing = b.ang;
        b.t -= dt * k;
        if (b.t <= 0) {
          for (let i = -2; i <= 2; i++) addBolt(b.x, b.y, b.ang + i * 0.21, 390);
          Sfx.bolt();
          if (--b.n > 0) {
            b.t = 0.5;
            b.ang = Math.atan2(dy, dx);
          } else {
            b.state = "rest";
            b.t = 0.9;
          }
        }
        break;
      case "spiral":
        b.atk = true;
        steer(b, 0, 0, dt, 6);
        b.sT -= dt;
        while (b.sT <= 0) {
          addBolt(b.x, b.y, b.sAng, 250);
          if (b.phase === 2) addBolt(b.x, b.y, b.sAng + Math.PI, 250);
          b.sAng += 0.44;
          b.sT += 0.1;
          Sfx.bolt();
        }
        b.t -= dt;
        if (b.t <= 0) {
          b.state = "rest";
          b.t = 0.9;
        }
        break;
      case "threadTell":
        steer(b, 0, 0, dt, 6);
        b.t -= dt * k;
        if (b.t <= 0) {
          if (Math.random() < 0.55) {
            const a = rand(TAU);
            queueSpawn("twin", clamp(b.x + Math.cos(a) * 150, 60, G.W - 60), clamp(b.y + Math.sin(a) * 150, 60, G.H - 60), 0, false);
          } else spawnAround(b, ["dart", "dart"], 130);
          b.state = "rest";
          b.t = 0.6;
        }
        break;
      case "vanish":
        steer(b, 0, 0, dt, 10);
        b.t -= dt;
        if (b.t <= 0) {
          const pt = farPoint(Math.min(320, G.W * 0.3), 90);
          FX.ring(b.x, b.y, b.r, 6, 0.3, PAL.paperRGB, 3);
          b.x = pt.x;
          b.y = pt.y;
          b.state = "appear";
          b.t = 0.45;
          FX.ring(b.x, b.y, 6, b.r + 30, 0.4, PAL.paperRGB, 3);
        }
        break;
      case "appear":
        b.t -= dt;
        if (b.t <= 0) {
          b.intangible = false;
          b.state = "idle";
          b.t = 0.7;
        }
        break;
      default: // rest
        b.atk = false;
        steer(b, 0, 0, dt, 5);
        b.t -= dt * k;
        if (b.t <= 0) {
          b.state = "idle";
          b.t = 0.8;
        }
    }
  },

  /* ------------------------------------------------------- Eclipse */
  eclipse(b, dt, p) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (b.phase === 1 && b.hp <= b.maxHp * 0.66) {
      b.phase = 2;
      bossPhaseFx(b, PAL.goldRGB);
    } else if (b.phase === 2 && b.hp <= b.maxHp * 0.33) {
      b.phase = 3;
      G.gloomBoss = true;
      bossPhaseFx(b, PAL.goldRGB);
    }
    const k = b.rate * (1 + 0.12 * (b.phase - 1));
    b.orbit += dt * (1.15 + 0.2 * b.phase);

    // place the moons and count the living
    let moons = 0;
    for (const m of G.enemies) {
      if (m.type !== "moon" || m.dead || m.parent !== b) continue;
      moons++;
      const a = b.orbit * m.dir + m.a;
      m.x = b.x + Math.cos(a) * m.orbR;
      m.y = b.y + Math.sin(a) * m.orbR;
    }
    if (b.invuln && moons === 0 && b.state !== "regrow") {
      b.invuln = false;
      b.exposed = 6;
      b.state = "stunned";
      b.t = 1.5;
      b.atk = false;
      removeBeams(b);
      Sfx.phase();
      FX.ring(b.x, b.y, b.r, b.r + 120, 0.5, PAL.goldRGB, 5);
      FX.addShake(5);
    }
    if (!b.invuln) {
      b.exposed -= dt;
      if (b.exposed <= 0 && (b.state === "idle" || b.state === "rest" || b.state === "stunned")) {
        b.state = "regrow";
        b.t = 1.0;
        b.invuln = true;
        Sfx.telegraph();
      }
    }

    switch (b.state) {
      case "stunned":
        steer(b, 0, 0, dt, 8);
        b.t -= dt;
        if (b.t <= 0) {
          b.state = "idle";
          b.t = 0.5;
        }
        break;
      case "regrow":
        steer(b, 0, 0, dt, 8);
        b.t -= dt;
        if (b.t <= 0) {
          const n = 3 + b.phase;
          for (let i = 0; i < n; i++) {
            const m = makeEnemy("moon", b.x, b.y, null);
            m.parent = b;
            m.a = (i / n) * TAU;
            m.dir = 1;
            m.orbR = 98 + (b.phase === 3 && i % 2 ? 30 : 0);
            m.spawn = 0.35;
            G.enemies.push(m);
          }
          FX.ring(b.x, b.y, 20, 110, 0.4, PAL.paperRGB, 3);
          b.state = "idle";
          b.t = 1.0;
        }
        break;
      case "idle":
        b.atk = false;
        b.facing = Math.atan2(dy, dx);
        steer(b, (dx / d) * 38, (dy / d) * 38, dt, 2);
        b.t -= dt * k;
        if (b.t <= 0) {
          const opts = ["beam", "nova", "lurch"];
          if (countAdds() < 4) opts.push("summon");
          const a = bossNext(b, opts);
          if (a === "beam") {
            b.rot = Math.random() < 0.5 ? 1 : -1;
            b.ang = Math.atan2(dy, dx) - b.rot * 0.8;
            b.state = "beamTell";
            b.t = 1.0;
          } else if (a === "nova") {
            b.state = "novaTell";
            b.t = 0.7;
            b.n = b.phase >= 2 ? 2 : 1;
          } else if (a === "lurch") {
            b.state = "lurchTell";
            b.t = 0.8;
            b.ang = Math.atan2(dy, dx);
          } else {
            b.state = "summonTell";
            b.t = 0.6;
          }
          Sfx.telegraph();
        }
        break;
      case "beamTell":
        b.atk = true;
        steer(b, 0, 0, dt, 8);
        b.t -= dt * k;
        if (b.t <= 0) {
          G.hazards.push({ type: "beam", owner: b, ang: b.ang, rot: b.rot * 0.8, life: 2.6, two: b.phase === 3 });
          b.state = "beam";
          b.t = 2.6;
          Sfx.lunge();
        }
        break;
      case "beam":
        b.atk = true;
        steer(b, 0, 0, dt, 8);
        b.t -= dt;
        if (b.t <= 0) {
          b.state = "rest";
          b.t = 0.8;
        }
        break;
      case "novaTell":
        b.atk = true;
        steer(b, 0, 0, dt, 8);
        b.t -= dt * k;
        if (b.t <= 0) {
          const off = b.orbit + (b.n % 2) * (TAU / 24);
          for (let i = 0; i < 12; i++) addBolt(b.x, b.y, off + (i / 12) * TAU, 260);
          Sfx.bolt();
          if (--b.n > 0) b.t = 0.5;
          else {
            b.state = "rest";
            b.t = 0.8;
          }
        }
        break;
      case "lurchTell":
        b.atk = true;
        steer(b, 0, 0, dt, 8);
        if (b.t > 0.3) b.ang = Math.atan2(dy, dx);
        b.t -= dt * k;
        if (b.t <= 0) {
          b.state = "lurch";
          b.t = 0.5;
          Sfx.lunge();
        }
        break;
      case "lurch":
        b.atk = true;
        b.vx = Math.cos(b.ang) * 640;
        b.vy = Math.sin(b.ang) * 640;
        b.t -= dt;
        if (b.t <= 0 || b.hitWall) {
          b.state = "rest";
          b.t = 1.0;
        }
        break;
      case "summonTell":
        steer(b, 0, 0, dt, 8);
        b.t -= dt * k;
        if (b.t <= 0) {
          spawnAround(b, ["dart", "blot", "dart", "blot"], 150);
          b.state = "rest";
          b.t = 0.6;
        }
        break;
      default: // rest
        b.atk = false;
        steer(b, 0, 0, dt, 5);
        b.t -= dt * k;
        if (b.t <= 0) {
          b.state = "idle";
          b.t = 0.8;
        }
    }
  },
};

function updateBoss(b, dt, p) {
  if (b.immune > 0) b.immune -= dt;
  BOSS_AI[b.type](b, dt, p);
}
function removeBeams(owner) {
  for (const hz of G.hazards) if (hz.type === "beam" && hz.owner === owner) hz.life = 0;
}
