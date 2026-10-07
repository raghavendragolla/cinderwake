"use strict";
/* Cinderwake — persistence. Everything lives in one localStorage key.
   Loading never trusts what it reads: every field is type-checked and
   clamped, and a save that cannot be parsed is set aside, not deleted. */

const SAVE_KEY = "cinderwake.save.v1";
const SAVE_BACKUP_KEY = "cinderwake.save.corrupt";

function defaultSave() {
  const byLantern = {};
  if (typeof LANTERNS === "object") {
    for (const id in LANTERNS) {
      byLantern[id] = { best: 0, wave: 0, clears: 0, runs: 0, kills: 0, perfectDashes: 0, masterfulDashes: 0, bossKills: 0, bestCombo: 0, bestMulti: 0 };
    }
  }
  return {
    v: 2, // v2 adds mastery/discovery/records fields; see sanitizeSave — every
    // field here is defaulted when absent, so an old save just loads with
    // these at zero/empty rather than needing a branching migration step.
    cinders: 0,
    totalCinders: 0,
    lantern: "wick",
    lanterns: ["wick"],
    cards: [],
    perks: [],
    duskMax: 0,
    duskSel: 0,
    ach: {},
    seen: {},
    seenElite: {},
    seenSynergy: {},
    enemyKills: {},
    bossDefeats: {},
    lastRun: null,
    daily: { date: "", best: 0, played: 0 },
    bestEndless: 0,
    fastestClear: 0,
    tutorialDone: false,
    stats: {
      runs: 0, kills: 0, dashes: 0, bestScore: 0, bestWave: 0, bestCombo: 0, bestMulti: 0,
      playTime: 0, clears: 0, bossKills: 0, bulwarkKills: 0, reflects: 0, perfectDashes: 0,
      lifetimeScore: 0,
    },
    byLantern,
    history: [],
    settings: {
      master: 0.8, sfx: 0.9, music: 0.5, mute: false,
      shake: 1, reduced: null, aimGuide: true, numbers: true,
    },
    run: null,
  };
}

const _num = (v, def, lo = 0, hi = 1e12) => (typeof v === "number" && isFinite(v) ? clamp(v, lo, hi) : def);
const _int = (v, def, lo = 0, hi = 1e12) => Math.floor(_num(v, def, lo, hi));
const _strs = (v, ok) =>
  Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === "string" && ok(s)))] : [];

/** A saved run is only resumed if every field makes sense. */
function sanitizeRun(r) {
  if (!r || typeof r !== "object" || !LANTERNS[r.lantern]) return null;
  const wave = _int(r.wave, 0, 0, 9999);
  if (wave < 1) return null;
  const up = {};
  if (r.up && typeof r.up === "object") {
    for (const id in r.up) {
      if (UP[id]) {
        const lv = _int(r.up[id], 0, 0, UP[id].max);
        if (lv > 0) up[id] = lv;
      }
    }
  }
  return {
    lantern: r.lantern,
    dusk: _int(r.dusk, 0, 0, DUSK_TIERS.length - 1),
    seed: typeof r.seed === "string" ? r.seed : "",
    wave,
    checkpointWave: _int(r.checkpointWave, wave, 1, 9999),
    up,
    score: _int(r.score, 0),
    kills: _int(r.kills, 0),
    hearts: _int(r.hearts, 1, 1, 12),
    time: _num(r.time, 0),
    dashes: _int(r.dashes, 0),
    bestCombo: _int(r.bestCombo, 0),
    bestMulti: _int(r.bestMulti, 0),
    bossKills: _int(r.bossKills, 0),
    rerolls: _int(r.rerolls, 0, 0, 9),
    flawless: _int(r.flawless, 0),
    stormCount: _int(r.stormCount, 0),
    phoenixUsed: !!r.phoenixUsed,
    rekindled: !!r.rekindled,
    endless: !!r.endless,
    cleared: !!r.cleared,
    hits: _int(r.hits, 0),
    waveDone: _int(r.waveDone, wave - 1, 0, 9999),
    bestMultiWave: _int(r.bestMultiWave, 0),
    perfectDashes: _int(r.perfectDashes, 0),
    quality: {
      clean: _int(r.quality && r.quality.clean, 0), sharp: _int(r.quality && r.quality.sharp, 0),
      brutal: _int(r.quality && r.quality.brutal, 0), masterful: _int(r.quality && r.quality.masterful, 0),
    },
    flameSpent: _num(r.flameSpent, 0), flameGained: _num(r.flameGained, 0), bloodKills: _int(r.bloodKills, 0, 0, 2),
    lastShrineWave: _int(r.lastShrineWave, 0, 0, 9999),
  };
}

function sanitizeSave(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;

  d.cinders = _int(raw.cinders, 0);
  d.totalCinders = Math.max(d.cinders, _int(raw.totalCinders, 0));
  d.lanterns = _strs(raw.lanterns, (id) => !!LANTERNS[id]);
  if (!d.lanterns.includes("wick")) d.lanterns.unshift("wick");
  d.lantern = d.lanterns.includes(raw.lantern) ? raw.lantern : "wick";
  d.cards = _strs(raw.cards, (id) => !!UP[id] && !!UP[id].price);
  d.perks = _strs(raw.perks, (id) => !!PERKS[id]);
  d.duskMax = _int(raw.duskMax, 0, 0, DUSK_TIERS.length - 1);
  d.duskSel = _int(raw.duskSel, 0, 0, d.duskMax);
  d.tutorialDone = !!raw.tutorialDone;

  if (raw.ach && typeof raw.ach === "object") {
    for (const id in raw.ach) if (ACH[id] && raw.ach[id]) d.ach[id] = _num(raw.ach[id], 1);
  }
  if (raw.seen && typeof raw.seen === "object") {
    for (const id in raw.seen) if (ENEMY_INFO[id]) d.seen[id] = _int(raw.seen[id], 1, 0, 99);
  }
  if (raw.seenElite && typeof raw.seenElite === "object") {
    for (const id in raw.seenElite) if (ELITE_MODS[id]) d.seenElite[id] = _num(raw.seenElite[id], 1);
  }
  if (raw.seenSynergy && typeof raw.seenSynergy === "object") {
    for (const id in raw.seenSynergy) if (SYN[id]) d.seenSynergy[id] = _num(raw.seenSynergy[id], 1);
  }
  if (raw.enemyKills && typeof raw.enemyKills === "object") {
    for (const id in raw.enemyKills) if (ENEMY_INFO[id] && !ENEMY_INFO[id].boss) d.enemyKills[id] = _int(raw.enemyKills[id], 0, 0, 999999);
  }
  if (raw.bossDefeats && typeof raw.bossDefeats === "object") {
    for (const id in raw.bossDefeats) if (ENEMY_INFO[id] && ENEMY_INFO[id].boss) d.bossDefeats[id] = _int(raw.bossDefeats[id], 0, 0, 99999);
  }
  if (raw.lastRun && typeof raw.lastRun === "object" && LANTERNS[raw.lastRun.lantern]) {
    d.lastRun = { wave: _int(raw.lastRun.wave, 1, 1, 9999), lantern: raw.lastRun.lantern, cleared: !!raw.lastRun.cleared, cinders: _int(raw.lastRun.cinders, 0) };
  }
  if (raw.daily && typeof raw.daily === "object") {
    d.daily = { date: typeof raw.daily.date === "string" ? raw.daily.date : "", best: _int(raw.daily.best, 0), played: _int(raw.daily.played, 0, 0, 9999) };
  }
  d.bestEndless = _int(raw.bestEndless, 0, 0, 9999);
  d.fastestClear = _num(raw.fastestClear, 0);
  if (raw.stats && typeof raw.stats === "object") {
    for (const k in d.stats) d.stats[k] = _num(raw.stats[k], 0);
  }
  if (typeof raw.lifetimeScore === "number" && !d.stats.lifetimeScore) {
    d.stats.lifetimeScore = _int(raw.lifetimeScore, 0);
  }
  d.lifetimeScore = d.stats.lifetimeScore;
  d.byLantern = {};
  for (const id in LANTERNS) {
    const b = (raw.byLantern && typeof raw.byLantern === "object" && raw.byLantern[id]) || {};
    d.byLantern[id] = {
      best: _int(b.best, 0), wave: _int(b.wave, 0), clears: _int(b.clears, 0), runs: _int(b.runs, 0),
      kills: _int(b.kills, 0), perfectDashes: _int(b.perfectDashes, 0), masterfulDashes: _int(b.masterfulDashes, 0),
      bossKills: _int(b.bossKills, 0), bestCombo: _int(b.bestCombo, 0), bestMulti: _int(b.bestMulti, 0),
    };
  }
  const s = raw.settings;
  if (s && typeof s === "object") {
    d.settings.master = _num(s.master, 0.8, 0, 1);
    d.settings.sfx = _num(s.sfx, 0.9, 0, 1);
    d.settings.music = _num(s.music, 0.5, 0, 1);
    d.settings.mute = !!s.mute;
    d.settings.shake = _num(s.shake, 1, 0, 1);
    d.settings.reduced = typeof s.reduced === "boolean" ? s.reduced : null;
    d.settings.aimGuide = s.aimGuide !== false;
    d.settings.numbers = s.numbers !== false;
  }
  d.history = Array.isArray(raw.history)
    ? raw.history.slice(0, 10).map((h) => ({
        date: String(h.date || ""),
        lantern: String(h.lantern || "wick"),
        wave: _int(h.wave, 1),
        score: _int(h.score, 0),
        kills: _int(h.kills, 0),
        seed: String(h.seed || ""),
        cleared: !!h.cleared,
        killedBy: String(h.killedBy || ""),
      }))
    : [];
  d.run = sanitizeRun(raw.run);
  return d;
}

const Save = {
  data: null,
  storageOk: true,
  recovered: false, // true when a broken save was found and set aside

  _get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      this.storageOk = false;
      return null;
    }
  },
  _set(key, val) {
    try {
      window.localStorage.setItem(key, val);
      return true;
    } catch (e) {
      this.storageOk = false;
      return false;
    }
  },

  load() {
    const text = this._get(SAVE_KEY);
    let raw = null;
    if (text) {
      try {
        raw = JSON.parse(text);
      } catch (e) {
        this._set(SAVE_BACKUP_KEY, text);
        this.recovered = true;
      }
    }
    this.data = sanitizeSave(raw);
    return this.data;
  },

  persist() {
    if (!this.data) return;
    try {
      this._set(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      this.storageOk = false;
    }
    if (typeof Cloud === "object" && Cloud.queueSync) {
      Cloud.queueSync();
    }
  },

  save() {
    this.persist();
  },

  reset() {
    const keep = this.data ? this.data.settings : null;
    this.data = defaultSave();
    if (keep) this.data.settings = keep;
    this.persist();
  },

  /* Convenience queries used across the game. */
  hasLantern(id) {
    return this.data.lanterns.includes(id);
  },
  cardAvailable(id) {
    const u = UP[id];
    return !!u && (!u.price || this.data.cards.includes(id));
  },
  hasPerk(id) {
    return this.data.perks.includes(id);
  },
  reducedMotion() {
    const r = this.data.settings.reduced;
    if (typeof r === "boolean") return r;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  },
};
