"use strict";
/* Cinderwake — the run itself: world state, the frame update, how damage
   and kills resolve, upgrades between waves, and rewards at the end.   */

const G = {
  state: "menu", // menu | play | pause | upgrade | victory | over
  W: 1280, H: 720, t: 0, realT: 0,
  run: null, S: null, L: null, mods: duskMods(0), player: null, wave: null,
  enemies: [], bolts: [], shards: [], wakes: [], echoes: [], hazards: [], spawns: [],
  hitstop: 0, slowT: 0, slowScale: 1, chillT: 0, cutSeq: 0,
  combo: 0, comboT: 0, dying: 0, killedBy: "", gloomBoss: false,
  offers: null, offerRelic: false, summary: null, shrine: null,
};

function newRun(lantern, dusk) {
  return {
    lantern, dusk, wave: 1, up: {}, score: 0, kills: 0, hearts: 3, time: 0, dashes: 0,
    bestCombo: 0, bestMulti: 0, bestMultiWave: 0, bossKills: 0, rerolls: 1, flawless: 0, stormCount: 0,
    phoenixUsed: false, endless: false, cleared: false, hits: 0, waveDone: 0,
    lastMod: "", newAch: [], achCinders: 0, newDisc: [],
    perfectDashes: 0, quality: { clean: 0, sharp: 0, brutal: 0, masterful: 0 },
    flameSpent: 0, flameGained: 0, bloodKills: 0, lastShrineWave: 0,
    deathFlame: -1, deathHeartsBefore: 0, deathWave: 0, deathEarly: false,
  };
}

function clearWorld() {
  G.enemies.length = G.bolts.length = G.shards.length = 0;
  G.wakes.length = G.echoes.length = G.hazards.length = G.spawns.length = 0;
  G.hitstop = G.slowT = G.chillT = G.dying = 0;
  G.combo = G.comboT = 0;
  G.killedBy = "";
  G.gloomBoss = false;
  G.offers = null;
  G.summary = null;
  G.shrine = null;
  FX.clear();
  Stains.clear();
}

/** Start fresh, or resume from a saved snapshot. */
function startRun(lanternId, dusk, saved) {
  clearWorld();
  FX.configure();
  if (!saved && Save.data.run) bankSavedRun();
  const run = saved ? Object.assign(newRun(saved.lantern, saved.dusk), saved) : newRun(lanternId, dusk);
  G.run = run;
  G.mods = duskMods(run.dusk);
  G.L = LANTERNS[run.lantern];
  G.wave = null;
  G.S = calcStats(run);
  const p = (G.player = makePlayer());
  if (!saved) {
    run.hearts = G.S.maxHearts;
    run.rerolls = 1 + (Save.hasPerk("reroll") ? 1 : 0);
    const bl = Save.data.byLantern[run.lantern];
    if (masteryLevel(bl) >= 3 && G.L.masteryCard) {
      const mid = G.L.masteryCard;
      run.up[mid] = (run.up[mid] || 0) + 1;
      G.S = calcStats(run);
      UI.toast("Mastery Start: " + UP[mid].name);
    }
    if (Save.hasPerk("kindled")) {
      const id = pick(KINDLED_POOL);
      run.up[id] = 1;
      G.S = calcStats(run);
      UI.toast("Kindled start: " + UP[id].name);
    }
  }
  p.hearts = clamp(run.hearts, 1, G.S.maxHearts);
  p.flame = G.S.maxFlame;
  G.state = "play";
  Input.reset();
  Input.capture = true;
  beginWave(run.wave);
}

function beginWave(n) {
  const run = G.run, p = G.player;
  run.wave = n;
  run.hearts = p.hearts;
  p.ward = G.S.ward;
  p.flame = Math.max(p.flame, G.S.maxFlame * 0.6);
  G.bolts.length = G.hazards.length = 0;
  Save.data.run = sanitizeRun(run);
  Save.persist();
  if (n >= 20) unlockAch("endless20");
  if (n >= 30) unlockAch("endless30");
  Waves.begin(n);
}

function slowmo(dur, scale) {
  if (FX.reduced) return;
  if (dur > G.slowT) G.slowT = dur;
  G.slowScale = scale;
}
function addFlame(n) {
  const p = G.player, S = G.S;
  p.flame = Math.min(S.maxFlame + (S.overheat ? 50 : 0), p.flame + n);
  if (n > 0 && G.run) G.run.flameGained += n;
}
function addScore(base, x, y, quiet) {
  const pts = Math.round(base * (1 + Math.min(G.combo, 40) * 0.05));
  G.run.score += pts;
  if (!quiet && Save.data.settings.numbers) FX.text(x, y, "" + pts, 13, PAL.ash, 0.6);
}

/* ------------------------------------------------------------ Combat */
/** Returns 0 = no effect, 1 = hurt, 2 = killed. `cut` counts chain kills. */
function damageEnemy(e, dmg, src, ang, cut) {
  if (e.dead) return 0;
  if (e.boss) return damageBoss(e, dmg, src, ang, cut);
  e.hp -= dmg;
  e.flash = 0.12;
  if (e.eliteMod === "regenerating") e.regenCd = 3;
  if (e.hp <= 0) {
    if (e.eliteMod === "armored" && e.armorUp) {
      e.armorUp = false;
      e.hp = 1;
      if (cut) cut.hits++;
      Sfx.block();
      FX.sparks(e.x, e.y, 10, (ang || 0) + Math.PI, 1, 110, 320, PAL.paper, 0.3);
      FX.ring(e.x, e.y, 6, e.r + 16, 0.24, PAL.paperRGB, 3);
      FX.text(e.x, e.y - e.r - 10, "armored", 13, PAL.paper, 0.6);
      return 1;
    }
    killEnemy(e, src, ang, cut);
    return 2;
  }
  if (cut) cut.hits++;
  knock(e, ang, e.type === "husk" ? 150 : 240);
  e.stun = Math.max(e.stun, 0.3);
  FX.sparks(e.x, e.y, 7, ang, 0.7, 100, 320, PAL.paper, 0.3);
  FX.flecks(e.x, e.y, 4, ang, 0.8, 80, 260, PAL.paper, 4);
  Sfx.hit();
  if (src === "dash") {
    addFlame(G.S.hitRefund);
    FX.mote(e.x, e.y, 1);
    G.hitstop = Math.max(G.hitstop, 0.035);
    FX.addShake(2);
  }
  return 1;
}

function killEnemy(e, src, ang, cut) {
  if (e.dead) return;
  e.dead = true;
  if (typeof AI === "object") AI.releaseAttackToken(e.id);
  const run = G.run, S = G.S, st = Save.data.stats;
  const self = src === "self";
  if (!self) {
    run.kills++;
    st.kills++;
    G.wave.kills++;
    G.combo++;
    G.comboT = 3;
    if (G.combo > run.bestCombo) run.bestCombo = G.combo;
    addScore(e.score, e.x, e.y - e.r - 8);
    let refund = 10;
    if (src === "dash") refund = S.killRefund;
    else if (src === "echo") refund = S.resonance ? S.killRefund : S.killRefund * 0.5;
    else if (src === "shard" || src === "burn") refund = 8;
    if (e.elite) refund *= 1.5;
    const mut = curMutation();
    if (mut && mut.refundMult) refund *= mut.refundMult;
    addFlame(refund);
    FX.mote(e.x, e.y, refund >= 15 ? 3 : 2);
    if (!e.boss && e.type) {
      Save.data.enemyKills[e.type] = (Save.data.enemyKills[e.type] || 0) + 1;
    }
    if (e.type === "bulwark") st.bulwarkKills++;
    unlockAch("firstcut");
    if (G.combo >= 25) unlockAch("combo25");
    if (G.combo >= 60) unlockAch("combo60");
    if (st.kills >= 1000) unlockAch("kills1k");
    if (st.bulwarkKills >= 40) unlockAch("backstab");
    if (S.storm && ++run.stormCount >= 10) {
      run.stormCount = 0;
      G.hazards.push({ type: "nova", fuse: 0.08 });
    }
    // Blood Moon: the refund is thin, but every third kill is free
    if (mut && mut.freeDashEvery) {
      run.bloodKills = (run.bloodKills || 0) + 1;
      if (run.bloodKills >= mut.freeDashEvery) {
        run.bloodKills = 0;
        G.player.freeDash = true;
        FX.text(G.player.x, G.player.y - 30, "free dash", 14, PAL.cold, 0.6);
      }
    }
  }
  // Elite modifiers that change what death leaves behind
  if (e.elite && e.eliteMod === "volatile" && e.type !== "blister") {
    addBlast(e.x, e.y, BLAST_R * 0.85, self ? 0.01 : 0.22);
  }
  if (e.elite && e.eliteMod === "splitting" && e.type !== "clot" && e.type !== "clotling") {
    const outs = [ang + 1.9, ang - 1.9];
    for (const o of outs) {
      const oa = o + rand(-0.3, 0.3);
      const c = spawnEnemy("clotling", clamp(e.x + Math.cos(oa) * 14, 14, G.W - 14), clamp(e.y + Math.sin(oa) * 14, 14, G.H - 14), null);
      c.spawn = 0;
      knock(c, oa, 260);
    }
  }

  // --- feedback: each kill in a chain lands harder than the last ---
  const isCut = cut && typeof cut === "object";
  const a = ang || 0, n = isCut ? (cut.kills || 0) : 0;
  const cs = Math.cos(a), sn = Math.sin(a);
  if (cut) {
    if (isCut) cut.kills = (cut.kills || 0) + 1;
    Sfx.kill(n);
    G.hitstop = Math.max(G.hitstop, Math.min(0.085, 0.03 + n * 0.011));
    FX.addShake(2.5 + Math.min(5, n * 0.9));
    FX.streak(e.x - cs * (e.r + 18 + n * 4), e.y - sn * (e.r + 18 + n * 4), e.x + cs * (e.r + 28 + n * 7), e.y + sn * (e.r + 28 + n * 7), 4 + Math.min(6, n), 0.2, 1);
    FX.ring(e.x, e.y, e.r * 0.6, e.r + 22 + Math.min(60, n * 8), 0.26, n >= 2 ? PAL.goldRGB : PAL.paperRGB, 2 + Math.min(4, n * 0.5));
  } else if (!self) {
    Sfx.pop(G.combo);
    FX.ring(e.x, e.y, e.r * 0.5, e.r + 16, 0.2, PAL.paperRGB, 2);
  }
  const spread = cut ? 0.9 : Math.PI;
  FX.flecks(e.x, e.y, 6 + Math.min(8, n * 2) + (e.r > 18 ? 4 : 0), a, spread, 90, 380 + n * 40, PAL.paper, e.r * 0.34);
  FX.flecks(e.x, e.y, 4, a, spread, 60, 240, PAL.wash2, e.r * 0.4);
  FX.sparks(e.x, e.y, 6 + Math.min(14, n * 3), a, spread * 0.8, 160, 480 + n * 50, n >= 2 ? PAL.gold : PAL.ember, 0.4);
  Stains.add(e.x, e.y, e.r * 1.5, a);

  // --- what each enemy leaves behind ---
  if (e.type === "blister") {
    addBlast(e.x, e.y, BLAST_R, self ? 0.01 : src === "blast" ? 0.2 : 0.38);
  } else if (e.type === "clot") {
    const outs = [a + 1.6, a - 1.6, a + Math.PI];
    for (const o of outs) {
      const oa = o + rand(-0.3, 0.3);
      const c = spawnEnemy("clotling", clamp(e.x + Math.cos(oa) * 14, 14, G.W - 14), clamp(e.y + Math.sin(oa) * 14, 14, G.H - 14), null);
      c.spawn = 0;
      knock(c, oa, 300);
    }
  } else if (e.type === "twin" && e.mate && !e.mate.dead) {
    e.mate.flash = 0.2;
  }
  if (cut && src === "dash" && S.shards) for (let i = 0; i < S.shards; i++) addShard(e.x, e.y, null, e);
  if ((src === "burn" || src === "blast") && S.wildfire && e.type !== "clotling") {
    G.wakes.push({ x1: e.x, y1: e.y, x2: e.x, y2: e.y, w: 30, life: 2, max: 2, noBurst: true });
  }
}

function damageBoss(b, dmg, src, ang, cut) {
  if (b.intangible) return 0;
  if (b.invuln) {
    if (src === "dash") {
      Sfx.tink();
      FX.sparks(b.x, b.y, 5, ang + Math.PI, 1, 80, 220, PAL.paper, 0.25);
    }
    return 0;
  }
  if (b.immune > 0) return 0;
  dmg = Math.min(dmg, 2); // thick hide: no single cut takes more than 2
  b.hp -= dmg;
  b.immune = 0.8;
  b.flash = 0.16;
  if (cut) cut.hits++;
  addScore(15 * dmg, b.x, b.y - b.r - 10);
  G.hitstop = Math.max(G.hitstop, 0.07);
  FX.addShake(6);
  Sfx.bossHit();
  FX.flecks(b.x, b.y, 12, ang, 0.9, 120, 460, PAL.paper, 6);
  FX.sparks(b.x, b.y, 14, ang, 0.8, 160, 560, PAL.gold, 0.45);
  FX.ring(b.x, b.y, b.r * 0.7, b.r + 50, 0.3, PAL.goldRGB, 4);
  if (src === "dash") {
    addFlame(G.S.bossRefund);
    FX.mote(b.x, b.y, 2);
  }
  if (b.hp <= 0) {
    killBoss(b, ang);
    return 2;
  }
  bossOnHit(b);
  return 1;
}

function killBoss(b, ang) {
  const run = G.run, p = G.player, st = Save.data.stats, w = G.wave;
  b.dead = true;
  w.bossDead = true;
  run.bossKills++;
  run.kills++;
  st.bossKills++;
  st.kills++;
  if (b.type) {
    Save.data.bossDefeats[b.type] = (Save.data.bossDefeats[b.type] || 0) + 1;
  }
  addScore(b.score, b.x, b.y - b.r - 14);
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.dead = true;
    FX.flecks(e.x, e.y, 6, 0, Math.PI, 60, 260, PAL.paper, 4);
  }
  G.spawns.length = G.bolts.length = G.hazards.length = 0;
  G.gloomBoss = false;
  Sfx.bossDie();
  FX.addShake(14);
  FX.doFlash(0.4, PAL.goldRGB);
  FX.punch(0.05);
  for (let i = 0; i < 4; i++) FX.ring(b.x, b.y, b.r * 0.5, b.r + 120 + i * 90, 0.6 + i * 0.2, i % 2 ? PAL.paperRGB : PAL.goldRGB, 7 - i);
  FX.flecks(b.x, b.y, 40, 0, Math.PI, 120, 620, PAL.paper, 7);
  FX.sparks(b.x, b.y, 60, 0, Math.PI, 160, 760, PAL.gold, 1.0);
  for (let i = 0; i < 6; i++) Stains.add(b.x + rand(-40, 40), b.y + rand(-40, 40), rand(30, 60), rand(TAU));
  slowmo(1.1, 0.25);
  p.inv = 3;
  if (p.hearts < G.S.maxHearts) {
    p.hearts++;
    Sfx.heal();
  }
  if (b.type === "mire") unlockAch("mire");
  if (b.type === "loom") unlockAch("loom");
  if (!w.hit) unlockAch("flawlessboss");
}

/* ------------------------------------------------- Bolts and shards */
function addBolt(x, y, ang, speed) {
  if (G.bolts.length > 160) return;
  G.bolts.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 6, mine: false, dead: false });
}
function reflectBolt(b) {
  const st = Save.data.stats;
  b.mine = true;
  const e = nearestEnemy(b.x, b.y, 900);
  const sp = Math.hypot(b.vx, b.vy) * 1.5;
  const a = e ? Math.atan2(e.y - b.y, e.x - b.x) : Math.atan2(-b.vy, -b.vx);
  b.vx = Math.cos(a) * sp;
  b.vy = Math.sin(a) * sp;
  addFlame(8);
  st.reflects++;
  if (st.reflects >= 25) unlockAch("reflect");
  Sfx.reflect();
  FX.ring(b.x, b.y, 4, 24, 0.2, PAL.goldRGB, 2);
}
function updateBolts(dt) {
  const p = G.player, list = G.bolts;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (!b) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < -20 || b.x > G.W + 20 || b.y < -20 || b.y > G.H + 20) b.dead = true;
    else if (!b.mine) {
      if (p.alive && !p.dash && p.inv <= 0 && dist2(b.x, b.y, p.x, p.y) < (b.r + 7) * (b.r + 7)) {
        b.dead = true;
        hurtPlayer("bolt");
      }
    } else {
      for (const e of G.enemies) {
        if (e.dead || e.spawn > 0 || e.intangible) continue;
        if (dist2(b.x, b.y, e.x, e.y) > (e.r + b.r) * (e.r + b.r)) continue;
        b.dead = true;
        damageEnemy(e, 2, "reflect", Math.atan2(b.vy, b.vx), null);
        break;
      }
    }
    if (b.dead && list[i] === b) list.splice(i, 1);
  }
}

function addShard(x, y, ang, from) {
  if (G.shards.length > 90) return;
  if (ang === null) {
    // aim at one of the nearest few enemies, so shards spread across a crowd
    const near = [];
    for (const e of G.enemies) {
      if (e.dead || e === from || e.spawn > 0 || e.intangible) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < 340 * 340) near.push({ e, d });
    }
    if (near.length) {
      near.sort((a, b) => a.d - b.d);
      const t = near[(Math.random() * Math.min(3, near.length)) | 0].e;
      ang = Math.atan2(t.y - y, t.x - x) + rand(-0.06, 0.06);
    } else ang = rand(TAU);
  }
  G.shards.push({ x, y, vx: Math.cos(ang) * 640, vy: Math.sin(ang) * 640, life: 0.55, bounce: G.S.ricochet ? 1 : 0, last: from });
}
function updateShards(dt) {
  const list = G.shards;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    let dead = s.life <= 0 || s.x < 0 || s.x > G.W || s.y < 0 || s.y > G.H;
    if (!dead) {
      for (const e of G.enemies) {
        if (e.dead || e === s.last || e.spawn > 0 || e.intangible) continue;
        if (dist2(s.x, s.y, e.x, e.y) > (e.r + 6) * (e.r + 6)) continue;
        const a = Math.atan2(s.vy, s.vx);
        if (e.type === "bulwark" && !G.S.breaker && shieldBlocks(e, s.x - s.vx * 0.03, s.y - s.vy * 0.03)) {
          FX.sparks(s.x, s.y, 4, a + Math.PI, 0.8, 60, 200, PAL.paper, 0.2);
          dead = true;
          break;
        }
        damageEnemy(e, 1, "shard", a, null);
        Sfx.shard();
        if (s.bounce > 0) {
          s.bounce--;
          s.last = e;
          let best = null, bd = 300 * 300;
          for (const o of G.enemies) {
            if (o.dead || o === e || o.spawn > 0 || o.intangible) continue;
            const d = dist2(s.x, s.y, o.x, o.y);
            if (d < bd) {
              bd = d;
              best = o;
            }
          }
          if (best) {
            const na = Math.atan2(best.y - s.y, best.x - s.x);
            s.vx = Math.cos(na) * 640;
            s.vy = Math.sin(na) * 640;
            s.life = 0.5;
          } else dead = true;
        } else dead = true;
        break;
      }
    }
    if (dead) list.splice(i, 1);
  }
}

/* --------------------------------------------------- Wakes and echoes */
function updateWakes(dt) {
  const list = G.wakes, S = G.S;
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    w.life -= dt;
    for (const e of G.enemies) {
      if (e.dead || e.spawn > 0 || e.burnCd > 0 || e.intangible) continue;
      const reach = e.r + w.w;
      if (segDist2(w.x1, w.y1, w.x2, w.y2, e.x, e.y) > reach * reach) continue;
      e.burnCd = e.boss ? 1.3 : 0.6;
      damageEnemy(e, 1, "burn", rand(TAU), null);
      Sfx.burn();
    }
    if (Math.random() < dt * 14) {
      const t = Math.random();
      FX.part(lerp(w.x1, w.x2, t) + rand(-w.w, w.w) * 0.6, lerp(w.y1, w.y2, t) + rand(-w.w, w.w) * 0.6, rand(-20, 20), rand(-70, -20), 0.5, 1.8, PAL.ember, 0, 1);
    }
    // Cinderthrow: standing fire keeps flinging embers at whatever is near
    if (S.syn.cinderthrow) {
      w.shardCd = (w.shardCd === undefined ? rand(0.2, 0.4) : w.shardCd) - dt;
      if (w.shardCd <= 0) {
        w.shardCd = 0.45;
        const t = Math.random();
        addShard(lerp(w.x1, w.x2, t), lerp(w.y1, w.y2, t), null, null);
      }
    }
    if (w.life <= 0) {
      list.splice(i, 1);
      if (S.backdraft && !w.noBurst) {
        const len = dist(w.x1, w.y1, w.x2, w.y2), steps = Math.max(1, Math.round(len / 46));
        for (let k = 0; k <= steps; k++) {
          const t = k / steps, x = lerp(w.x1, w.x2, t), y = lerp(w.y1, w.y2, t);
          FX.ring(x, y, 6, w.w + 38, 0.28, PAL.emberRGB, 4);
          FX.sparks(x, y, 5, 0, Math.PI, 80, 280, PAL.ember, 0.4);
        }
        Sfx.explode();
        FX.addShake(4);
        for (const e of G.enemies.slice()) {
          if (e.dead || e.spawn > 0 || e.intangible) continue;
          const reach = e.r + w.w + 38;
          if (segDist2(w.x1, w.y1, w.x2, w.y2, e.x, e.y) <= reach * reach) damageEnemy(e, 1, "burn", rand(TAU), null);
        }
      }
    }
  }
}

function updateEchoes(dt) {
  const list = G.echoes, S = G.S;
  for (let i = list.length - 1; i >= 0; i--) {
    const ec = list[i];
    ec.t -= dt;
    if (ec.t > 0) continue;
    list.splice(i, 1);
    Sfx.echo();
    if (ec.trail) G.wakes.push({ x1: ec.x1, y1: ec.y1, x2: ec.kind === "burst" ? ec.x1 : ec.x2, y2: ec.kind === "burst" ? ec.y1 : ec.y2, w: ec.kind === "burst" ? ec.R * 0.6 : 14, life: 1.0, max: 1.0 });
    if (ec.kind === "burst") {
      FX.ring(ec.x1, ec.y1, 8, ec.R, 0.24, PAL.paperRGB, 4);
      burstAt(ec.x1, ec.y1, ec.R, ec.dmg, "echo", null);
      continue;
    }
    const ang = Math.atan2(ec.y2 - ec.y1, ec.x2 - ec.x1);
    FX.streak(ec.x1, ec.y1, ec.x2, ec.y2, 8 + ec.w * 0.4, 0.26, 1);
    FX.ghost(ec.x2, ec.y2, ang, 0.3, 1);
    for (const e of G.enemies.slice()) {
      if (e.dead || e.spawn > 0 || e.intangible) continue;
      const reach = e.r + ec.w;
      if (segDist2(ec.x1, ec.y1, ec.x2, ec.y2, e.x, e.y) > reach * reach) continue;
      const blocked = (e.type === "bulwark" && shieldBlocks(e, ec.x1, ec.y1)) || (e.boss && loomShieldAt(e, ec.x1, ec.y1));
      if (blocked && !S.breaker) {
        FX.sparks(e.x, e.y, 5, ang + Math.PI, 0.9, 80, 240, PAL.paper, 0.25);
        continue;
      }
      const ex = e.x, ey = e.y;
      const res = damageEnemy(e, ec.dmg, "echo", ang, null);
      if (res === 2 && S.syn.splitfire && S.shards) for (let i = 0; i < S.shards; i++) addShard(ex, ey, null, null);
    }
  }
}

/* ------------------------------------------------------------ Hazards */
function addRing(x, y, r, speed, maxR, src = "ring") {
  G.hazards.push({ type: "ring", x, y, r, speed, maxR, hit: false, src });
}
function addBlast(x, y, R, fuse) {
  G.hazards.push({ type: "blast", x, y, R, fuse, max: Math.max(fuse, 0.01) });
}
function explode(x, y, R) {
  Sfx.explode();
  FX.addShake(7);
  FX.ring(x, y, 10, R, 0.3, PAL.coldRGB, 7);
  FX.ring(x, y, 6, R * 0.7, 0.36, PAL.paperRGB, 3);
  FX.sparks(x, y, 22, 0, Math.PI, 160, 560, PAL.cold, 0.5);
  FX.flecks(x, y, 10, 0, Math.PI, 120, 420, PAL.paper, 5);
  Stains.add(x, y, R * 0.55, rand(TAU));
  let kills = 0;
  const list = G.enemies, n = list.length;
  for (let i = 0; i < n; i++) {
    const e = list[i];
    if (!e || e.dead || e.spawn > 0 || e.intangible) continue;
    const reach = R + e.r * 0.5;
    if (dist2(x, y, e.x, e.y) > reach * reach) continue;
    if (damageEnemy(e, 2, "blast", Math.atan2(e.y - y, e.x - x), null) === 2) kills++;
  }
  if (kills >= 2) FX.text(x, y - 24, "\u00d7" + kills, 18 + Math.min(16, kills * 3), PAL.paper, 0.9);
  if (kills >= 4) unlockAch("demolition");
  const p = G.player;
  if (p.alive && !p.dash && p.inv <= 0 && dist2(p.x, p.y, x, y) < (R - 4) * (R - 4)) hurtPlayer("blast");
}

function updateHazards(dt) {
  const p = G.player, list = G.hazards;
  for (let i = list.length - 1; i >= 0; i--) {
    const hz = list[i];
    if (!hz) continue;
    let done = false;
    if (hz.type === "ring") {
      hz.r += hz.speed * dt;
      if (!hz.hit && p.alive && !p.dash && p.inv <= 0) {
        const d = dist(p.x, p.y, hz.x, hz.y);
        if (Math.abs(d - hz.r) < 16) {
          hz.hit = true;
          hurtPlayer(hz.src || "ring");
        }
      }
      done = hz.r >= hz.maxR;
    } else if (hz.type === "blast") {
      hz.fuse -= dt;
      if (hz.fuse <= 0) {
        done = true;
        list.splice(i, 1);
        explode(hz.x, hz.y, hz.R);
        continue;
      }
    } else if (hz.type === "beam") {
      const b = hz.owner;
      hz.life -= dt;
      hz.ang += hz.rot * dt;
      done = hz.life <= 0 || b.dead;
      if (!done && p.alive && !p.dash && p.inv <= 0) {
        const hitLine = (a) => segDist2(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, b.x + Math.cos(a) * 1600, b.y + Math.sin(a) * 1600, p.x, p.y) < 15 * 15;
        if (hitLine(hz.ang) || (hz.two && hitLine(hz.ang + Math.PI))) hurtPlayer("beam");
      }
    } else if (hz.type === "rainTell") {
      hz.t -= dt;
      if (hz.t <= 0) {
        done = true;
        list.splice(i, 1);
        addBolt(hz.x, -24, Math.PI / 2, 560);
        Sfx.bolt();
        continue;
      }
    } else if (hz.type === "nova") {
      hz.fuse -= dt;
      if (hz.fuse <= 0) {
        done = true;
        list.splice(i, 1);
        FX.ring(p.x, p.y, 10, 165, 0.35, PAL.emberRGB, 6);
        FX.sparks(p.x, p.y, 20, 0, Math.PI, 140, 480, PAL.ember, 0.5);
        Sfx.explode();
        burstAt(p.x, p.y, 165, 1, "blast", null);
        continue;
      }
    }
    if (done && list[i] === hz) list.splice(i, 1);
  }
}

/* ------------------------------------------------------- Frame update */
function gameUpdate(rawDt) {
  G.realT += rawDt;
  Input.now = G.realT;
  const p = G.player, run = G.run, w = G.wave;

  if (G.hitstop > 0) {
    // the world holds its breath; input is still heard
    G.hitstop -= rawDt;
    if (p.alive) playerInput(p, 0);
    FX.update(0, rawDt, p);
    return;
  }
  let dt = rawDt;
  if (G.slowT > 0) {
    G.slowT -= rawDt;
    dt *= G.slowScale;
  }
  G.t += dt;
  if (p.alive && !w.cleared) run.time += rawDt;

  updatePlayer(dt);
  let edt = dt;
  if (G.chillT > 0) {
    G.chillT -= dt;
    edt *= 0.35;
  }
  Waves.update(edt);
  updateEnemies(edt);
  updateBolts(edt);
  updateHazards(edt);
  updateShards(dt);
  updateWakes(dt);
  updateEchoes(dt);

  if (G.comboT > 0) {
    G.comboT -= dt;
    if (G.comboT <= 0) {
      if (G.combo >= 5) Sfx.comboBreak();
      G.combo = 0;
    }
  }
  FX.update(dt, rawDt, p);
  Stains.update(rawDt);
  if (typeof Music === "object" && Music.updateTension) Music.updateTension(dt);

  if (G.dying > 0) {
    G.dying -= rawDt;
    if (G.dying <= 0) endRun(false);
  } else if (w.cleared && G.state === "play") {
    w.clearT -= rawDt;
    if (w.clearT <= 0) afterWave();
  }
}

/* ------------------------------------------------- Between the waves */
function waveCleared() {
  const w = G.wave, run = G.run, p = G.player;
  w.cleared = true;
  run.waveDone = w.n;
  w.clearT = w.boss ? 2.4 : 1.3;
  for (const b of G.bolts) FX.sparks(b.x, b.y, 3, 0, Math.PI, 40, 140, PAL.cold, 0.3);
  G.bolts.length = G.hazards.length = 0;
  p.inv = Math.max(p.inv, w.clearT + 0.6);
  const bonus = 40 * w.n * (w.hit ? 1 : 2);
  run.score += bonus;
  if (!w.hit) {
    run.flawless++;
    if (run.flawless >= 3) unlockAch("flawless3");
  } else run.flawless = 0;
  if (!w.boss && w.misses === 0 && w.kills >= 10) unlockAch("everycut");
  if (!w.boss) slowmo(0.45, 0.35);
  Sfx.waveClear();
  UI.banner(w.boss ? ENEMY_INFO[w.boss].name + " falls" : w.hit ? "Wave cleared" : "Flawless", "+" + fmt(bonus), 1.25);
  Save.data.tutorialDone = true;
  if (w.n === CAMPAIGN_WAVES && !run.cleared) grantClear();
  Music.setMood(0.15, false);
}

function grantClear() {
  const run = G.run, d = Save.data;
  run.cleared = true;
  d.stats.clears++;
  unlockAch("clear");
  if (run.dusk >= 3) unlockAch("dusk3");
  if (run.dusk >= 5) unlockAch("dusk5");
  if (run.time > 0 && run.time <= 720) unlockAch("speedclear");
  if (Object.keys(run.up).length <= 3) unlockAch("minimalist");
  if (run.dusk === d.duskMax && d.duskMax < DUSK_TIERS.length - 1) {
    d.duskMax++;
    d.duskSel = d.duskMax;
    UI.toast(DUSK_TIERS[d.duskMax].name + " unlocked. " + DUSK_TIERS[d.duskMax].rule);
  }
}

function afterWave() {
  const w = G.wave, run = G.run;
  if (w.n === CAMPAIGN_WAVES && !run.endless) {
    G.state = "victory";
    Input.capture = false;
    UI.showVictory();
    return;
  }
  offerUpgrades(!!w.boss);
}

function offerUpgrades(relic) {
  G.state = "upgrade";
  Input.capture = false;
  G.offerRelic = relic;
  G.offers = rollOffers(relic, null);
  UI.showUpgrade();
}

/** Three choices. Cards from builds you have started are a little more
    likely, so a build can come together without being guaranteed.     */
function rollOffers(relic, avoid) {
  const run = G.run, p = G.player, S = G.S;
  const lv = (id) => run.up[id] || 0;
  const usable = (u) =>
    Save.cardAvailable(u.id) && lv(u.id) < u.max && (!u.req || lv(u.req) > 0) && (!u.minWave || run.wave >= u.minWave) &&
    (u.id !== "mend" || p.hearts < S.maxHearts) && (u.id !== "heart" || S.maxHearts < 6) && (u.id !== "glass" || S.maxHearts > 1);
  let pool = UPGRADES.filter((u) => !!u.relic === relic && usable(u));
  if (relic && pool.length < 3) pool = pool.concat(UPGRADES.filter((u) => !u.relic && u.rarity !== "c" && usable(u)));
  if (pool.length < 3) pool = pool.concat(UPGRADES.filter((u) => !u.relic && usable(u) && !pool.includes(u)));
  if (avoid && pool.length - avoid.length >= 3) pool = pool.filter((u) => !avoid.includes(u.id));
  const builds = {};
  for (const id in run.up) builds[UP[id].build] = true;
  const rw = { c: 10, u: 6.5, r: 3 };
  const weight = (u) => {
    if (u.relic) return 1;
    let wgt = rw[u.rarity] || 5;
    if (builds[u.build] && u.build !== "util") wgt *= 1.7;
    if (lv(u.id) > 0) wgt *= 1.25;
    if (u.id === "mend") wgt *= 0.6 + (S.maxHearts - p.hearts) * 0.9;
    return wgt;
  };
  const out = [];
  const bag = pool.slice();
  while (out.length < 3 && bag.length) {
    const u = wpick(bag, weight);
    bag.splice(bag.indexOf(u), 1);
    out.push(u.id);
  }
  // never three plain stat cards when something build-defining is on the table
  if (!relic && out.length === 3 && out.every((id) => UP[id].build === "util")) {
    const alt = bag.filter((u) => u.build !== "util");
    if (alt.length) out[2] = wpick(alt, weight).id;
  }
  return out;
}

function rerollOffers() {
  const run = G.run;
  if (run.rerolls <= 0 || !G.offers) return false;
  run.rerolls--;
  G.offers = rollOffers(G.offerRelic, G.offers);
  return true;
}

function takeUpgrade(id) {
  const run = G.run, p = G.player, u = UP[id];
  if (!u || G.state !== "upgrade") return;
  const prevSyn = activeSynergies(run);
  if (!u.consumable) run.up[id] = Math.min(u.max, (run.up[id] || 0) + 1);
  const before = G.S;
  G.S = calcStats(run);
  for (const sid of activeSynergies(run)) {
    if (prevSyn.includes(sid)) continue;
    const s = SYN[sid];
    Save.data.seenSynergy[sid] = (Save.data.seenSynergy[sid] || 0) + 1;
    UI.toast("SYNERGY UNLOCKED — " + s.name + ". " + s.desc, "syn");
    Sfx.achieve();
  }
  if (id === "heart") p.hearts = Math.min(G.S.maxHearts, p.hearts + 1);
  if (id === "mend") p.hearts = Math.min(G.S.maxHearts, p.hearts + 2);
  if (G.S.maxFlame > before.maxFlame) p.flame += G.S.maxFlame - before.maxFlame;
  p.hearts = clamp(p.hearts, 1, G.S.maxHearts);
  Sfx.pick();
  G.offers = null;
  G.state = "play";
  Input.reset();
  Input.capture = true;
  beginWave(run.wave + 1);
}

/** From the victory screen: keep the build and go on past wave 15. */
function goEndless() {
  G.run.endless = true;
  offerUpgrades(true);
}

/* ------------------------------------------------------ End of a run */
/** Pay out a run and fold it into lifetime stats. Returns the summary. */
function settleRun(run) {
  const d = Save.data, st = d.stats;
  const mult = duskMods(run.dusk).cinderMult * (1 + 0.35 * (run.up.soot || 0));
  // 4 per wave cleared, 25 per boss, plus the square root of the score:
  // early runs still pay, and long endless runs cannot flood the Hearth
  const cinders = Math.round(((run.waveDone || 0) * 4 + run.bossKills * 25 + Math.sqrt(Math.max(0, run.score)) * 0.8) * mult);
  d.cinders += cinders;
  d.totalCinders += cinders;
  const prevBest = st.bestScore;
  st.runs++;
  st.playTime += run.time || 0;
  st.bestScore = Math.max(st.bestScore, run.score);
  st.bestWave = Math.max(st.bestWave, run.wave);
  st.bestCombo = Math.max(st.bestCombo, run.bestCombo);
  st.bestMulti = Math.max(st.bestMulti, run.bestMulti);
  const bl = d.byLantern[run.lantern] || (d.byLantern[run.lantern] = { best: 0, wave: 0, clears: 0, runs: 0 });
  bl.runs = (bl.runs || 0) + 1;
  bl.best = Math.max(bl.best || 0, run.score || 0);
  bl.wave = Math.max(bl.wave || 0, run.wave || 0);
  if (run.cleared) bl.clears = (bl.clears || 0) + 1;
  bl.kills = (bl.kills || 0) + (run.kills || 0);
  bl.perfectDashes = (bl.perfectDashes || 0) + (run.perfectDashes || 0);
  bl.masterfulDashes = (bl.masterfulDashes || 0) + ((run.quality && run.quality.masterful) || 0);
  bl.bossKills = (bl.bossKills || 0) + (run.bossKills || 0);
  bl.bestCombo = Math.max(bl.bestCombo || 0, run.bestCombo || 0);
  bl.bestMulti = Math.max(bl.bestMulti || 0, run.bestMulti || 0);
  d.run = null;
  Save.persist();
  return { cinders, prevBest, newBest: run.score > prevBest && run.score > 0 };
}

/** A run left on the menu still pays out when you start a new one. */
function bankSavedRun() {
  const r = Save.data.run;
  if (!r) return;
  const s = settleRun(Object.assign(newRun(r.lantern, r.dusk), r));
  if (s.cinders > 0) UI.toast("Banked " + fmt(s.cinders) + " Cinders from your unfinished run.");
}

/** A one-line highlight the run is proud of. */
function bestMoment(run) {
  if (run.bestMulti >= 2) return run.bestMulti + " kills with one dash, on wave " + (run.bestMultiWave || run.wave) + ".";
  if (run.perfectDashes > 0) return "A perfect dash, timed right through the danger.";
  if (run.bestCombo >= 10) return "A combo " + run.bestCombo + " kills long.";
  return "Every wave, one cut at a time.";
}
/** A concrete, reachable next target, nearest first. */
function nextGoal(run) {
  const st = Save.data.stats;
  if (run.bestMulti < 4) return "Land a 4-kill dash for your first Masterful.";
  if (run.bestMulti < 10) return "Reach a 10-kill dash.";
  if ((st.perfectDashes || 0) < 10) return "Land 10 perfect dashes.";
  if (!Save.data.ach.flawlessboss) return "Beat a boss without taking a hit.";
  if (run.bestCombo < 40) return "Build a 40-kill combo.";
  if (!run.cleared) return "Clear all 15 waves.";
  if (!Save.data.ach.dusk3 && run.dusk < 3) return "Clear the campaign on Dusk 3.";
  return "Push your score past " + fmt(Math.round(Math.max(1000, st.bestScore * 1.08))) + ".";
}

function endRun(banked) {
  const run = G.run, w = G.wave;
  G.state = "over";
  Input.capture = false;
  run.hearts = G.player.hearts;
  const s = settleRun(run);
  let near = "";
  if (!banked) {
    if (w.boss && w.bossRef && !w.bossRef.dead) {
      const left = Math.max(1, w.bossRef.hp);
      if (left <= Math.ceil(w.bossRef.maxHp * 0.34)) near = ENEMY_INFO[w.boss].name + " had " + left + (left === 1 ? " cut" : " cuts") + " left in it.";
    } else if (!w.boss && w.left > 0 && w.left <= 6) {
      near = "Only " + w.left + " more to clear wave " + w.n + ".";
    }
  }
  G.summary = {
    banked, score: run.score, wave: run.wave, kills: run.kills, time: run.time, bestCombo: run.bestCombo,
    bestMulti: run.bestMulti, cinders: s.cinders, achCinders: run.achCinders, newBest: s.newBest, prevBest: s.prevBest,
    newAch: run.newAch.slice(), killedBy: banked ? "" : G.killedBy, near, cleared: run.cleared, lantern: run.lantern,
    dusk: run.dusk, up: Object.assign({}, run.up),
    dashes: run.dashes, perfectDashes: run.perfectDashes, quality: Object.assign({}, run.quality),
    flameSpent: run.flameSpent, flameGained: run.flameGained,
    synergies: activeSynergies(run).map((id) => SYN[id].name),
    bestMoment: bestMoment(run), nextGoal: nextGoal(run),
  };
  Music.setMood(0.05, false);
  UI.showOver(G.summary);
}

/** Restart from the pause menu: settle the current run, then begin anew. */
function restartRun() {
  const run = G.run;
  run.hearts = G.player.hearts;
  settleRun(run);
  startRun(run.lantern, run.dusk, null);
}

function quitToMenu() {
  G.state = "menu";
  Input.capture = false;
  Save.persist();
  clearWorld();
  G.run = null;
  G.wave = null;
  G.player = null;
  Music.setMood(0, false);
}

/* -------------------------------------------------------- Achievements */
function unlockAch(id) {
  const d = Save.data, a = ACH[id];
  if (!a || d.ach[id]) return;
  d.ach[id] = Date.now();
  d.cinders += a.reward;
  d.totalCinders += a.reward;
  if (G.run) {
    G.run.newAch.push(id);
    G.run.achCinders += a.reward;
  }
  Sfx.achieve();
  UI.toast(a.name + ". +" + a.reward + " Cinders", "ach");
  // some lanterns are earned, not bought
  for (const lid of LANTERN_ORDER) {
    const L = LANTERNS[lid];
    if (L.needAch === id && !d.lanterns.includes(lid)) {
      d.lanterns.push(lid);
      UI.toast("New lantern: " + L.name + ". " + L.tag + ".", "ach");
    }
  }
  if (id !== "collector" && LANTERN_ORDER.every((l) => d.lanterns.includes(l))) unlockAch("collector");
  Save.persist();
}
