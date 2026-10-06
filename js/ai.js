"use strict";
/* Cinderwake — Game AI & Tactical Coordination Layer.
   Modular, deterministic, explainable tactical decision-making.
   Runs on bounded decision intervals (120–220ms), never every frame.
   Guarantees human readability and player escape space.              */

const AI_ROLES = {
  blot: "PRESSURE",
  dart: "CHASER",
  bulwark: "BLOCKER",
  blister: "AREA_CONTROL",
  seer: "RANGED",
  clot: "PRESSURE",
  clotling: "PRESSURE",
  husk: "AREA_CONTROL",
  twin: "AREA_CONTROL",
  hunter: "AMBUSH",
  coordinator: "SUPPORT",
};

const AI = {
  /* ---------------------------------------------------- Attack Tokens */
  /* Limits simultaneous high-threat attacks (lunges, snipes, slams) to
     guarantee human readability and prevent unavoidable crossfire.     */
  maxTokens: 2,
  activeTokens: new Set(),

  requestAttackToken(id) {
    if (this.activeTokens.size >= this.maxTokens) return false;
    this.activeTokens.add(id);
    return true;
  },

  releaseAttackToken(id) {
    this.activeTokens.delete(id);
  },

  clearTokens() {
    this.activeTokens.clear();
  },

  /* ----------------------------------------------- Fairness Validator */
  /* Divides 360 degrees around the player into 8 angular sectors (45 deg
     each). Checks if incoming attacks, hazards, or arena walls choke all
     sectors. Guarantees AT LEAST TWO open escape sectors at all times.  */
  checkFairness(player, enemies, hazards) {
    const W = G.W, H = G.H, m = 60;
    const px = player.x, py = player.y;
    const sectors = [0, 0, 0, 0, 0, 0, 0, 0]; // 8 sectors around player

    // 1. Arena boundary constraints
    if (px < m + 80) { sectors[3]++; sectors[4]++; sectors[5]++; }
    if (px > W - m - 80) { sectors[7]++; sectors[0]++; sectors[1]++; }
    if (py < m + 80) { sectors[1]++; sectors[2]++; sectors[3]++; }
    if (py > H - m - 80) { sectors[5]++; sectors[6]++; sectors[7]++; }

    // 2. Active hazards
    for (const hz of hazards) {
      if (hz.type === "blast") {
        const a = Math.atan2(hz.y - py, hz.x - px);
        const idx = Math.floor(((a + TAU) % TAU) / (TAU / 8));
        sectors[idx]++;
      } else if (hz.type === "beam" && hz.owner) {
        const idx = Math.floor(((hz.ang + TAU) % TAU) / (TAU / 8));
        sectors[idx] += 2;
        if (hz.two) sectors[(idx + 4) % 8] += 2;
      }
    }

    // 3. Enemies currently attacking or winding up
    for (const e of enemies) {
      if (e.dead || !e.atk) continue;
      const dx = e.x - px, dy = e.y - py;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 380) {
        const a = Math.atan2(dy, dx);
        const idx = Math.floor(((a + TAU) % TAU) / (TAU / 8));
        sectors[idx]++;
        sectors[(idx + 1) % 8] += 0.5;
        sectors[(idx + 7) % 8] += 0.5;
      }
    }

    let openSectors = 0;
    for (let i = 0; i < 8; i++) {
      if (sectors[i] < 1.0) openSectors++;
    }

    return {
      isFair: openSectors >= 2,
      openSectors,
      pressureIndex: clamp((8 - openSectors) / 8, 0, 1),
      safeAngles: sectors.map((s, i) => (s < 1.0 ? i * (TAU / 8) : null)).filter((a) => a !== null),
    };
  },

  /* --------------------------------------- Spatial Utility Evaluation */
  /** Evaluate how favorable a point (x, y) is for an enemy. */
  scorePosition(x, y, p, role, enemies) {
    const W = G.W, H = G.H, m = 60;
    if (x < m || x > W - m || y < m || y > H - m) return -999;

    const dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    let score = 0;

    // Ideal range by role
    switch (role) {
      case "RANGED": // Seer: prefers 280-420px
        score += d >= 260 && d <= 440 ? 5 : -Math.abs(d - 350) * 0.03;
        break;
      case "AMBUSH": // Hunter: prefers flanking angle, 200-300px
        score += d >= 180 && d <= 320 ? 6 : -Math.abs(d - 250) * 0.04;
        break;
      case "SUPPORT": // Coordinator: prefers 320-460px behind blockers
        score += d >= 300 && d <= 480 ? 6 : -Math.abs(d - 380) * 0.03;
        break;
      case "BLOCKER": // Bulwark: prefers 120-220px in front
        score += d >= 100 && d <= 240 ? 5 : -Math.abs(d - 160) * 0.04;
        break;
      default:
        score += -d * 0.02;
    }

    // Spacing from allies to avoid clumping into a single easy swipe
    for (const o of enemies) {
      if (o.dead) continue;
      const od = Math.hypot(x - o.x, y - o.y);
      if (od < 55) score -= 3.5;
    }

    // Avoid burning wakes
    for (const wk of G.wakes || []) {
      if (dist2(x, y, wk.x, wk.y) < 60 * 60) score -= 8;
    }

    return score;
  },

  /** Find a flanking coordinate perpendicular to the player's current facing/aim. */
  findFlankPosition(e, p, desiredDist, side) {
    const ang = (Input.mouseActive() ? p.aim : Math.atan2(e.y - p.y, e.x - p.x)) + (side >= 0 ? 1 : -1) * 1.35;
    const m = 54, W = G.W, H = G.H;
    return {
      x: clamp(p.x + Math.cos(ang) * desiredDist, m, W - m),
      y: clamp(p.y + Math.sin(ang) * desiredDist, m, H - m),
    };
  },

  /** Find safe cover behind a blocker (Bulwark or Husk). */
  findSupportPosition(supporter, blocker, p) {
    if (!blocker || blocker.dead) return this.findFlankPosition(supporter, p, 360, 1);
    const ang = Math.atan2(blocker.y - p.y, blocker.x - p.x);
    const m = 54, W = G.W, H = G.H;
    return {
      x: clamp(blocker.x + Math.cos(ang) * 90, m, W - m),
      y: clamp(blocker.y + Math.sin(ang) * 90, m, H - m),
    };
  },

  /* ------------------------------------- Adaptive Boss Attack Selector */
  /** Evaluates battlefield conditions and picks a tactical, fair attack for the boss. */
  bossPickAttack(b, p, hazards, options) {
    const d = dist(b.x, b.y, p.x, p.y);
    const W = G.W, H = G.H;
    const nearWall = p.x < 120 || p.x > W - 120 || p.y < 120 || p.y > H - 120;
    const lowFlame = p.flame < 20;

    // Build tactical scores for candidate moves
    const scores = {};
    for (const opt of options) {
      scores[opt] = 10;
      // Penalize repetition
      if (opt === b.lastAtk) scores[opt] -= 8;
    }

    // Specific tactical nuances
    if (b.type === "mire") {
      // options: ["lurch", "spit", "quake"]
      if (d > 320) scores.lurch = (scores.lurch || 0) + 4; // close distance
      if (nearWall) scores.quake = (scores.quake || 0) - 4; // avoid trapping player against wall with ring
      if (lowFlame && scores.quake) scores.quake -= 3; // ring is punishing on 0 flame
      if (d <= 220) scores.spit = (scores.spit || 0) + 3; // area denial at mid-range
    } else if (b.type === "loom") {
      // options: ["fan", "shove", "darts"]
      if (d > 350) scores.darts = (scores.darts || 0) + 4;
      if (d < 190) scores.shove = (scores.shove || 0) + 5;
      if (nearWall) scores.fan = (scores.fan || 0) - 3;
    } else if (b.type === "eclipse") {
      // options: ["beam", "nova", "lurch"]
      if (d > 340) scores.beam = (scores.beam || 0) + 4;
      if (d < 180) scores.nova = (scores.nova || 0) + 4;
      if (lowFlame && scores.beam) scores.beam -= 4; // sweeping beam requires dashes
    }

    // Weighted selection favoring highest score
    let best = options[0], bestS = -999;
    for (const opt of options) {
      const s = (scores[opt] || 0) + rand(-1.5, 1.5);
      if (s > bestS) { bestS = s; best = opt; }
    }
    b.lastAtk = best;
    return best;
  },

  /* -------------------------------------- Build-Aware Encounter Filter */
  /** Evaluates how well an encounter formation synergizes with the player's active build. */
  scoreEncounterForBuild(group, run) {
    if (!run || !run.up) return 0;
    let score = 0;
    const builds = activeBuilds ? activeBuilds(run) : {};

    // Chain / Trail builds love tight columns and swarms
    if (builds.chain || builds.trail) {
      if (group.form === "line" || group.form === "cluster") score += 2;
      if (group.list.includes("blot")) score += 1.5;
    }

    // Guard / Echo builds enjoy distinct telegraphed attacks to counter
    if (builds.guard || builds.echo) {
      if (group.list.includes("dart") || group.list.includes("bulwark")) score += 2;
    }

    // Shard builds enjoy mobile spread targets
    if (builds.shard) {
      if (group.form === "scatter" || group.list.includes("clot")) score += 2;
    }

    return score;
  },
};
