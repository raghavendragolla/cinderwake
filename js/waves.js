"use strict";
/* Cinderwake — the wave director. A wave is a budget spent on spawn
   groups; groups arrive in readable formations, each enemy announced by
   a mark on the floor before it rises, never on top of the player.     */

const SPAWN_TELL = 0.85;

function queueSpawn(type, x, y, delay, elite, extra) {
  G.spawns.push({ type, x, y, t: SPAWN_TELL + (delay || 0), elite: !!elite, extra: extra || null, r: ENEMY_INFO[type].r });
}

const Waves = {
  begin(n) {
    const def = waveDef(n), run = G.run;
    if (typeof AI === "object") AI.clearTokens();
    G.shrine = null;
    const w = (G.wave = {
      n, boss: def.boss || null, queue: [], gapT: 0.2, intro: 1.5, t: 0,
      total: 0, hit: false, misses: 0, dashes: 0, kills: 0, mod: null,
      cleared: false, clearT: 0, bossSpawned: false, bossRef: null, bossDead: false,
      speed: n <= CAMPAIGN_WAVES ? 1 + 0.023 * (n - 1) : Math.min(2.5, 1.32 + 0.035 * (n - CAMPAIGN_WAVES)), maxAlive: def.maxAlive || 10, tutorial: false,
    });
    G.gloomBoss = false;
    let title = "Wave " + n + (WAVE_NAMES[n] ? " — " + WAVE_NAMES[n] : ""), sub = "";
    if (w.boss) {
      title = ENEMY_INFO[w.boss].name;
      sub = Save.data.seen[w.boss] ? "" : ENEMY_INFO[w.boss].tip;
      Sfx.bossIntro();
    } else {
      const useMod = def.mod || (G.mods.tier >= 2 && n >= 6 && rand() < 0.4);
      if (useMod) {
        w.mod = pick(MODIFIERS.filter((m) => m.id !== run.lastMod));
        run.lastMod = w.mod.id;
        if (w.mod.speed) w.speed *= w.mod.speed;
        if (w.mod.alive) w.maxAlive += w.mod.alive;
        sub = (w.mod.mutation ? w.mod.name.toUpperCase() : w.mod.name) + ". " + w.mod.desc;
      }
      // Cinder Shrine: rare, optional, never on a mutated wave so it never
      // competes for attention with a rule change. Lives the whole wave.
      if (!w.mod && n >= 3 && n - (run.lastShrineWave || 0) >= 2 && rand() < 0.22) {
        run.lastShrineWave = n;
        const m = 70, a1 = rand(TAU), d1 = rand(180, 300), a2 = a1 + Math.PI + rand(-0.5, 0.5);
        const pt = (a, d) => ({ x: clamp(G.player.x + Math.cos(a) * d, m, G.W - m), y: clamp(G.player.y + Math.sin(a) * d, m, G.H - m) });
        const p1 = pt(a1, d1), p2 = pt(a2, d1);
        G.shrine = {
          a: { x: p1.x, y: p1.y, type: "flame", label: "Full Flame" },
          b: { x: p2.x, y: p2.y, type: "cinders", label: "+15 Cinders" },
          claimed: false,
        };
        UI.notify("SHRINE", "A shrine glows nearby", "shrine");
      }
      if (def.intro && (Save.data.seen[def.intro] || 0) < 3) sub = ENEMY_INFO[def.intro].name + ". " + ENEMY_INFO[def.intro].tip;
      w.queue = this.plan(def, w);
      for (const g of w.queue) for (const t of g.list) w.total += t === "twin" ? 2 : 1;
      if (n === 1) {
        // the opening beat: a clean line to sweep through
        w.tutorial = !Save.data.tutorialDone;
        const openCount = w.tutorial ? 3 : 4;
        w.queue.unshift({ list: Array(openCount).fill("blot"), form: "line", first: true });
        w.total += openCount;
      }
      Sfx.waveStart();
    }
    w.left = w.total;
    UI.banner(title, sub, w.boss ? 1.8 : 1.2, w.mod && w.mod.mutation);
    Music.setMood(w.boss ? 0.9 : clamp(0.3 + n * 0.035, 0.3, 0.8), !!w.boss);
  },

  /** Spend the wave budget on spawn groups. */
  plan(def, w) {
    const mod = w.mod;
    let budget = def.budget * G.mods.budgetMult * (mod && mod.budget ? mod.budget : 1);
    const pool = Object.assign({}, def.pool);
    if (mod && mod.pool) for (const k in mod.pool) if (pool[k]) pool[k] *= mod.pool[k];
    const types = Object.keys(pool);
    const groups = [];
    if (def.intro) {
      const cnt = def.introCount || 1;
      groups.push({ list: Array(cnt).fill(def.intro), form: "far" });
      budget -= ENEMY_INFO[def.intro].cost * cnt;
    }
    let guard = 0;
    while (budget >= 1 && guard++ < 120) {
      // Curated tactical encounter archetypes for readable human combat puzzles
      if (w.n >= 3 && guard <= 4 && rand() < 0.5) {
        if (pool.bulwark && pool.blot && budget >= 7 && !groups.some((g) => g.archetype === "flank")) {
          let bCount = 0;
          for (const g of groups) for (const item of g.list) if (item === "bulwark") bCount++;
          if (w.n === 3 && bCount >= 3) {
            // Cap Wave 3 bulwarks to ensure readable flank lesson
          } else {
            // FLANK: 1 Bulwark + Blots in pincer, keeping the flank route wide open
            groups.push({ list: ["bulwark", "blot", "blot"], form: "pincer", archetype: "flank" });
            budget -= 7;
            continue;
          }
        }
        if (pool.coordinator && pool.bulwark && pool.blot && budget >= 11 && !groups.some((g) => g.archetype === "formation")) {
          // FORMATION: Coordinator in the rear commanding 1 Bulwark and Blot escorts
          groups.push({ list: ["coordinator", "bulwark", "blot", "blot"], form: "far", archetype: "formation" });
          budget -= 11;
          continue;
        }
        if (pool.seer && pool.blot && budget >= 9 && !groups.some((g) => g.archetype === "crossfire")) {
          // CROSS FIRE: Seer with Blot screen, giving clear line of sight
          groups.push({ list: ["seer", "blot", "blot", "blot"], form: "far", archetype: "crossfire" });
          budget -= 9;
          continue;
        }
        if (pool.dart && (pool.clot || pool.blot) && budget >= 8 && !groups.some((g) => g.archetype === "pressure")) {
          // PRESSURE: Fast Darts with Blot/Clot support
          groups.push({ list: ["dart", "dart", pool.clot ? "clot" : "blot", "blot"], form: "pincer", archetype: "pressure" });
          budget -= 8;
          continue;
        }
        if (pool.husk && pool.blot && budget >= 10 && !groups.some((g) => g.archetype === "areacontrol")) {
          // AREA CONTROL: Husk pulse surrounded by Blots, without simultaneous Blister spam
          groups.push({ list: ["husk", "blot", "blot", "blot"], form: "cluster", archetype: "areacontrol" });
          budget -= 10;
          continue;
        }
        if (pool.blister && pool.blot && budget >= 8 && !groups.some((g) => g.archetype === "volatile")) {
          // VOLATILE: Controlled Blister explosive cluster with generous Blot refund fuel
          groups.push({ list: ["blister", "blot", "blot", "blot"], form: "cluster", archetype: "volatile" });
          budget -= 8;
          continue;
        }
        if (pool.hunter && pool.blot && budget >= 8 && !groups.some((g) => g.archetype === "ambush")) {
          // AMBUSH: Hunter flanking alongside distracting Blots
          groups.push({ list: ["hunter", "blot", "blot"], form: "pincer", archetype: "ambush" });
          budget -= 8;
          continue;
        }
      }

      const t = wpick(types, (k) => pool[k]);
      if (w.n === 3 && t === "bulwark") {
        let bCount = 0;
        for (const g of groups) for (const item of g.list) if (item === "bulwark") bCount++;
        if (bCount >= 3) continue;
      }
      let list, form;
      const blots = (a, b) => Array(randInt(a, b)).fill("blot");
      switch (t) {
        case "dart": list = Array(w.n === 2 ? randInt(1, 2) : randInt(1, 3)).fill("dart"); form = "scatter"; break;
        case "bulwark": list = ["bulwark"].concat(blots(0, 2)); form = "cluster"; break;
        case "blister": list = rand() < 0.6 ? ["blister"].concat(blots(2, 3)) : ["blister", "blister"]; form = "cluster"; break;
        case "seer": list = Array(randInt(1, 2)).fill("seer"); form = "far"; break;
        case "clot": list = Array(randInt(1, 2)).fill("clot"); form = "cluster"; break;
        case "husk": list = ["husk"].concat(blots(0, 2)); form = "cluster"; break;
        case "twin": list = ["twin"]; form = "far"; break;
        case "hunter": list = Array(randInt(1, 2)).fill("hunter"); form = "pincer"; break;
        case "coordinator": list = ["coordinator"].concat(blots(1, 2)); form = "cluster"; break;
        case "lurker": list = Array(randInt(1, 2)).fill("lurker"); form = "scatter"; break;
        case "seep": list = Array(randInt(1, 2)).fill("seep"); form = "far"; break;
        case "trapper": list = Array(randInt(1, 2)).fill("trapper"); form = "far"; break;
        case "shade": list = ["shade"]; form = "far"; break;
        default: {
          const big = mod && mod.id === "swarm" ? 8 : 6;
          const nB = randInt(3, Math.max(3, Math.min(big, Math.floor(budget))));
          list = Array(nB).fill("blot");
          // base weights reproduce the game's original formation odds exactly;
          // a build-aware nudge (Chain/Trail favor line/cluster) only applies
          // when the tactical layer and an active run are both present.
          const baseForms = nB >= 5
            ? (w.n >= 6 ? { line: 2, ring: 2, pincer: 1, cluster: 1 } : { line: 2, cluster: 1, ring: 1, pincer: 1 })
            : { line: 2, cluster: 1 };
          const buildAware = typeof AI === "object" && AI.scoreEncounterForBuild && G.run;
          form = wpick(Object.keys(baseForms), (f) =>
            baseForms[f] * (buildAware ? 1 + Math.max(0, AI.scoreEncounterForBuild({ list, form: f }, G.run)) * 0.4 : 1));
        }
      }
      let cost = 0;
      for (const k of list) cost += ENEMY_INFO[k].cost;
      groups.push({ list, form });
      budget -= cost;
    }
    return this.pace(groups, def.intro ? 1 : 0);
  },

  /** Reorders the groups a wave already decided to spend its budget on —
      composition and total threat are untouched — into a real shape: a
      light opening, a climb, one deliberate peak around three-quarters of
      the way through, then a lighter group at the very end so the wave's
      last beat is a breather, not its hardest moment. Short waves (too few
      groups to shape) are left in their natural order. */
  pace(groups, lockedHead) {
    const head = groups.slice(0, lockedHead);
    const body = groups.slice(lockedHead);
    if (body.length < 4) return groups;
    const weight = (g) => g.list.reduce((s, k) => s + (ENEMY_INFO[k] ? ENEMY_INFO[k].cost : 1), 0);
    body.sort((a, b) => weight(a) - weight(b));
    const relief = body.shift();
    const peak = body.pop();
    body.splice(Math.round(body.length * 0.7), 0, peak);
    body.push(relief);
    return head.concat(body);
  },

  /** Lay one group out in the arena and queue its floor marks. */
  spawnGroup(g) {
    const p = G.player, W = G.W, H = G.H, w = G.wave, m = 46 + (w.shrink || 0);
    const inside = (x, y) => x >= m && x <= W - m && y >= m && y <= H - m;
    const anchorAt = (lo, hi) => {
      for (let i = 0; i < 30; i++) {
        const a = rand(TAU), d = rand(lo, hi);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (inside(x, y)) return { x, y };
      }
      return farPoint(lo, m);
    };
    const eliteChance = Math.max(G.mods.eliteChance, w.mod && w.mod.elite ? w.mod.elite : 0) + (w.n > CAMPAIGN_WAVES ? Math.min(0.6, (w.n - CAMPAIGN_WAVES) * 0.03) : 0);
    const place = (type, x, y, i, extra) => {
      let bMargin = m;
      if (type === "bulwark") bMargin = Math.max(m, 85);
      x = clamp(x, bMargin, W - bMargin);
      y = clamp(y, bMargin, H - bMargin);
      // never mark a spawn close enough to be a cheap hit
      if (dist2(x, y, p.x, p.y) < 170 * 170) {
        const a = Math.atan2(y - p.y, x - p.x) || rand(TAU);
        x = clamp(p.x + Math.cos(a) * 190, bMargin, W - bMargin);
        y = clamp(p.y + Math.sin(a) * 190, bMargin, H - bMargin);
        if (dist2(x, y, p.x, p.y) < 150 * 150) {
          const f = farPoint(220, bMargin);
          x = f.x;
          y = f.y;
        }
      }
      // Bulwark spacing rule: never allow multiple Bulwarks to overlap into an impenetrable shield wall
      if (type === "bulwark") {
        for (const o of G.enemies) {
          if (!o.dead && o.type === "bulwark" && dist2(x, y, o.x, o.y) < 180 * 180) {
            const da = Math.atan2(y - o.y, x - o.x) || rand(TAU);
            x = clamp(o.x + Math.cos(da) * 190, bMargin, W - bMargin);
            y = clamp(o.y + Math.sin(da) * 190, bMargin, H - bMargin);
          }
        }
        for (const s of G.spawns) {
          if (s.type === "bulwark" && dist2(x, y, s.x, s.y) < 180 * 180) {
            const da = Math.atan2(y - s.y, x - s.x) || rand(TAU);
            x = clamp(s.x + Math.cos(da) * 190, bMargin, W - bMargin);
            y = clamp(s.y + Math.sin(da) * 190, bMargin, H - bMargin);
          }
        }
      }
      const elite = type !== "clotling" && rand() < eliteChance;
      queueSpawn(type, x, y, i * 0.07, elite, extra);
    };

    const n = g.list.length;
    if (g.first) {
      // tutorial row: straight ahead of where the player is aiming
      const a = Input.mouseActive() ? p.aim : 0;
      let ax = p.x + Math.cos(a) * 150, ay = p.y + Math.sin(a) * 150;
      const dirOk = inside(p.x + Math.cos(a) * 250, p.y + Math.sin(a) * 250);
      const ang = dirOk ? a : Math.atan2(H / 2 - p.y, W / 2 - p.x + 1);
      ax = p.x + Math.cos(ang) * 150;
      ay = p.y + Math.sin(ang) * 150;
      g.list.forEach((type, i) => {
        const x = clamp(ax + Math.cos(ang) * i * 38, m, W - m), y = clamp(ay + Math.sin(ang) * i * 38, m, H - m);
        queueSpawn(type, x, y, i * 0.07, false, { slow: w.tutorial ? 0.3 : 0.6 });
      });
      return;
    }
    const anchor = g.form === "far" ? farPoint(Math.min(360, W * 0.34), m) : anchorAt(250, 430);
    const toP = Math.atan2(p.y - anchor.y, p.x - anchor.x);
    g.list.forEach((type, i) => {
      switch (g.form) {
        case "line": // a column marching at the player: the gift of a clean cut
          place(type, anchor.x - Math.cos(toP) * i * 36, anchor.y - Math.sin(toP) * i * 36, i);
          break;
        case "ring": {
          const a = (i / n) * TAU + toP;
          place(type, p.x + Math.cos(a) * 290, p.y + Math.sin(a) * 290, i);
          break;
        }
        case "pincer": {
          const flip = i % 2 ? -1 : 1;
          const bx = p.x + (anchor.x - p.x) * flip, by = p.y + (anchor.y - p.y) * flip;
          place(type, bx + rand(-34, 34), by + rand(-34, 34), i);
          break;
        }
        case "scatter": {
          const s = anchorAt(240, 420);
          place(type, s.x, s.y, i);
          break;
        }
        case "far": {
          const f = i === 0 ? anchor : farPoint(Math.min(340, W * 0.32), m);
          place(type, f.x, f.y, i);
          break;
        }
        default: { // cluster
          const a = rand(TAU), d = i === 0 ? 0 : rand(22, 30 + n * 9);
          place(type, anchor.x + Math.cos(a) * d, anchor.y + Math.sin(a) * d, i);
        }
      }
    });
  },

  update(dt) {
    const w = G.wave;
    if (!w || w.cleared) return;
    w.t += dt;

    // Thin World: the room closes in as the wave runs long (calibrated to preserve evasion space)
    if (w.mod && w.mod.thin) w.shrink = Math.min(95, w.t * 3.5);
    // Black Rain: a telegraphed bolt falls somewhere in the arena, on a timer
    if (w.mod && w.mod.rain && !w.boss) {
      w.rainT = (w.rainT === undefined ? rand(1.6, 2.6) : w.rainT) - dt;
      if (w.rainT <= 0) {
        w.rainT = rand(1.6, 2.6);
        G.hazards.push({ type: "rainTell", x: rand(70, G.W - 70), t: 0.75 });
      }
    }

    // floor marks count down, then the enemy rises
    const sp = G.spawns;
    for (let i = sp.length - 1; i >= 0; i--) {
      const s = sp[i];
      s.t -= dt;
      if (s.t <= 0) {
        sp.splice(i, 1);
        if (s.boss) {
          const b = makeBoss(s.type, s.x, s.y, s.tier);
          G.enemies.push(b);
          w.bossRef = b;
          Save.data.seen[s.type] = (Save.data.seen[s.type] || 0) + 1;
          FX.addShake(8);
          FX.ring(s.x, s.y, 10, 200, 0.6, PAL.paperRGB, 5);
          Sfx.slam();
        } else {
          const o = { elite: s.elite };
          if (s.extra) Object.assign(o, s.extra);
          const spawned = spawnEnemy(s.type, s.x, s.y, o);
          if (spawned && spawned.elite && spawned.eliteMod) {
            Save.data.seenElite[spawned.eliteMod] = (Save.data.seenElite[spawned.eliteMod] || 0) + 1;
          }
          Sfx.spawn();
        }
      }
    }

    if (w.intro > 0) {
      w.intro -= dt;
      return;
    }

    if (w.boss) {
      if (!w.bossSpawned) {
        w.bossSpawned = true;
        const p = G.player;
        let x = G.W / 2, y = G.H * 0.3;
        if (dist(x, y, p.x, p.y) < 260) y = G.H * 0.7;
        const tier = Math.max(0, Math.floor((w.n - 1) / 15));
        G.spawns.push({ type: w.boss, x, y, t: 1.5, boss: true, tier, r: ENEMY_INFO[w.boss].r });
      }
    } else if (w.queue.length) {
      w.gapT -= dt;
      const alive = G.enemies.length + G.spawns.length;
      if (alive === 0 && w.gapT > 0.35) w.gapT = 0.35;
      // Flame Recovery Director: lightweight encounter fairness rule
      // If player Flame is critically low and no reasonable kill target exists,
      // bias the queue toward a recoverable target (e.g. Blot) so the player can earn their refund.
      if (G.player && G.player.alive && G.player.flame < G.S.dashCost * 1.25 && w.queue.length > 0) {
        let recoverableActive = 0;
        for (const e of G.enemies) {
          if (!e.dead && !e.intangible && (e.type === "blot" || e.type === "clotling" || (e.hp === 1 && e.type !== "bulwark"))) {
            recoverableActive++;
          }
        }
        if (recoverableActive === 0) {
          const recIdx = w.queue.findIndex((g) => g.list.includes("blot"));
          if (recIdx > 0) {
            const recGroup = w.queue.splice(recIdx, 1)[0];
            w.queue.unshift(recGroup);
            if (w.gapT > 0.35) w.gapT = 0.35;
          }
        }
      }

      if (w.gapT <= 0) {
        // Concurrency caps: prevent unfair overlapping crossfire
        let idx = 0;
        const countActive = (type) => {
          let c = 0;
          for (const e of G.enemies) if (!e.dead && e.type === type) c++;
          for (const s of G.spawns) if (s.type === type) c++;
          return c;
        };
        for (let i = 0; i < Math.min(3, w.queue.length); i++) {
          const g = w.queue[i];
          const hasBulwark = g.list.includes("bulwark");
          const hasSeer = g.list.includes("seer");
          const hasHusk = g.list.includes("husk");
          const hasTwin = g.list.includes("twin");
          const hasDart = g.list.includes("dart");
          const hasHunter = g.list.includes("hunter");
          // Wave 3 limits Bulwarks strictly to 1 active; all other waves to 2
          if (hasBulwark && countActive("bulwark") >= (w.n === 3 ? 1 : 2)) continue;
          if (hasSeer && countActive("seer") >= 2) continue;
          if (hasHusk && countActive("husk") >= 2) continue;
          if (hasTwin && countActive("twin") >= 2) continue;
          if (hasHunter && countActive("hunter") >= 2) continue;
          if (w.n === 2 && hasDart && countActive("dart") >= 2) continue;
          if (w.n > 2 && hasDart && countActive("dart") >= 3) continue;
          idx = i;
          break;
        }
        const next = w.queue[idx];
        const fits = alive + next.list.length <= w.maxAlive;
        const fairness = (typeof AI === "object" && G.player) ? AI.checkFairness(G.player, G.enemies, G.hazards) : { isFair: true };
        if (alive === 0 || (fits && fairness.isFair) || (w.gapT < -3.5 && alive < w.maxAlive + 6)) {
          w.queue.splice(idx, 1);
          this.spawnGroup(next);
          w.gapT = next.first ? (w.tutorial ? 5 : 1.2) : alive === 0 ? 0.22 : rand(0.8, 1.4);
        } else if (!fairness.isFair && alive > 0) {
          w.gapT = 0.35;
        }
      }
      // tutorial: once the opening row is cut, move on at once
      if (w.tutorial && w.kills >= 3 && w.gapT > 0.8) w.gapT = 0.8;
    }

    // how many are still to come, for the HUD
    let left = G.spawns.length;
    for (const g of w.queue) for (const t of g.list) left += t === "twin" ? 2 : 1;
    for (const e of G.enemies) if (!e.dead) left++;
    w.left = left;

    const done = w.boss ? w.bossDead : !w.queue.length && !G.spawns.length && G.enemies.length === 0;
    if (done) waveCleared();
  },
};
