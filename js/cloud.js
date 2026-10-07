"use strict";
/**
 * Cinderwake Cloud Save & Account Management
 * Powered by Cloudflare Worker + Cloudflare D1.
 *
 * Supports:
 * - GUEST mode (default, 100% offline local save)
 * - ACCOUNT mode (authenticated cross-device progression via Cloudflare Worker)
 * - Username + Password authentication (no email, phone, or OTP)
 * - HTTP-only session cookies with credentials: "include"
 * - Debounced event-based syncing (no frame-by-frame spam)
 * - Explicit registration migration & safe merge policy
 * - Seamless offline fallback
 */

const CLOUD_PENDING_KEY = "cinderwake.cloud.pending_sync";
const CLOUD_CACHED_USER_KEY = "cinderwake.auth.username";

const Cloud = {
  mode: "guest",            // "guest" | "account"
  status: "guest",          // "guest" | "connected" | "syncing" | "offline"
  user: null,               // { username }
  syncTimer: null,
  syncPending: false,
  isSyncing: false,
  lastSyncTime: null,
  callbacks: [],

  /* ------------------------------------------------------------- Config */
  getBaseUrl() {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = localStorage.getItem("cinderwake.api.url");
      if (stored && stored.includes("raghavendayadavgolla")) {
        localStorage.removeItem("cinderwake.api.url");
      }
    }
    const cfg = (typeof window !== "undefined" && window.CINDERWAKE_CONFIG) || {};
    const url = (cfg.apiBaseUrl || (window.localStorage && localStorage.getItem("cinderwake.api.url")) || "https://cinderwake-save.raghavendrayadavgolla.workers.dev").trim();
    return url.replace(/\/+$/, "");
  },

  onStatusChange(cb) {
    if (typeof cb === "function") this.callbacks.push(cb);
  },

  setStatus(s) {
    this.status = s;
    for (const cb of this.callbacks) {
      try { cb(this.status, this.user); } catch (e) {}
    }
  },

  /* --------------------------------------------------------------- Init */
  async init() {
    // Listen to network status for offline reconnect
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (this.mode === "account" && this.syncPending) {
          this.flushPendingSync();
        }
      });
    }

    // Only attempt session restoration if a user was previously logged in
    const cachedUser = window.localStorage && localStorage.getItem(CLOUD_CACHED_USER_KEY);
    if (!cachedUser) {
      this.mode = "guest";
      this.user = null;
      this.setStatus("guest");
      return;
    }

    // Check existing authentication via GET /api/me
    try {
      const me = await this.fetchMe();
      if (me && me.username) {
        this.user = { username: me.username };
        this.mode = "account";
        this.setStatus("connected");
        localStorage.setItem(CLOUD_CACHED_USER_KEY, me.username);
        // Load cloud progression on fresh session
        await this.pullAndApply();
        return;
      }
    } catch (e) {
      // If network is offline but we were previously signed in:
      this.user = { username: cachedUser };
      this.mode = "account";
      this.setStatus("offline");
      this.syncPending = true;
      return;
    }

    this.mode = "guest";
    this.user = null;
    if (window.localStorage) {
      localStorage.removeItem(CLOUD_CACHED_USER_KEY);
    }
    this.setStatus("guest");
  },

  /* --------------------------------------------------- API Request Helper */
  async apiRequest(path, options = {}) {
    const baseUrl = this.getBaseUrl();
    const url = baseUrl + path;

    const headers = Object.assign({
      "Content-Type": "application/json",
      "Accept": "application/json",
    }, options.headers || {});

    const fetchOpts = {
      method: options.method || "GET",
      headers,
      credentials: "include", // CRITICAL: send and receive HTTP-only session cookie
    };

    if (options.body !== undefined) {
      fetchOpts.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
      let errData = null;
      try { errData = await res.json(); } catch (e) {}
      const msg = (errData && (errData.error || errData.message || errData.msg)) || res.statusText || ("HTTP " + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = errData;
      throw err;
    }

    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  },

  /* ------------------------------------------------- Authentication APIs */
  async fetchMe() {
    try {
      const data = await this.apiRequest("/api/me");
      if (!data) return null;
      if (data.username) return { username: data.username };
      if (data.user && data.user.username) return { username: data.user.username };
      return null;
    } catch (e) {
      if (e.status === 401 || (e.data && e.data.authenticated === false)) {
        return null;
      }
      throw e;
    }
  },

  async register(username, password, shouldMigrate = false) {
    username = (username || "").trim();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      throw new Error("Username must be 3–32 characters (letters, numbers, underscore).");
    }
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const res = await this.apiRequest("/api/register", {
      method: "POST",
      body: { username, password },
    });

    this.user = { username };
    this.mode = "account";
    this.setStatus("connected");
    if (window.localStorage) {
      localStorage.setItem(CLOUD_CACHED_USER_KEY, username);
    }

    // Register flow:
    // If migration requested and local save has progression: upload local persistent progression
    const localData = typeof Save !== "undefined" && Save.data;
    if (shouldMigrate && localData && this.hasMeaningfulProgress(localData)) {
      const payload = this.toCloudPayload(localData);
      await this.pushCloudSave(payload);
      this.applyCloudPayload(payload);
    } else {
      try {
        const cloudSave = await this.fetchCloudSave();
        if (cloudSave) {
          this.applyCloudPayload(cloudSave);
        }
      } catch (e) {
        // Fallback: keep initial state
      }
    }

    return { ok: true, user: this.user };
  },

  async login(username, password) {
    username = (username || "").trim();
    if (!username) throw new Error("Please enter your username.");
    if (!password) throw new Error("Please enter your password.");

    const res = await this.apiRequest("/api/login", {
      method: "POST",
      body: { username, password },
    });

    this.user = { username };
    this.mode = "account";
    this.setStatus("connected");
    if (window.localStorage) {
      localStorage.setItem(CLOUD_CACHED_USER_KEY, username);
    }

    // Normal login flow: CLOUD -> GAME STATE -> LOCAL CACHE
    await this.pullAndApply();

    return { ok: true, user: this.user };
  },

  async logout() {
    try {
      await this.apiRequest("/api/logout", { method: "POST" });
    } catch (e) {
      // Proceed with local logout regardless of network error
    }

    this.user = null;
    this.mode = "guest";
    this.syncPending = false;
    if (window.localStorage) {
      localStorage.removeItem(CLOUD_CACHED_USER_KEY);
      localStorage.removeItem(CLOUD_PENDING_KEY);
    }
    this.setStatus("guest");
  },

  /* ---------------------------------------------------- Cloud Save CRUD */
  async fetchCloudSave() {
    if (this.mode !== "account") return null;
    const res = await this.apiRequest("/api/save");
    if (!res) return null;
    // Unwrap response if returned as { save: ... } or { data: ... } or raw object
    const saveObj = (res && typeof res === "object") ? (res.save || res.data || res.progress || res) : null;
    return saveObj;
  },

  async pushCloudSave(payload) {
    if (this.mode !== "account") return null;
    const res = await this.apiRequest("/api/save", {
      method: "PUT",
      body: payload,
    });
    this.lastSyncTime = Date.now();
    this.syncPending = false;
    if (window.localStorage) {
      localStorage.removeItem(CLOUD_PENDING_KEY);
    }
    return res;
  },

  async pullAndApply() {
    if (this.mode !== "account") return;
    try {
      this.setStatus("syncing");
      const cloudSave = await this.fetchCloudSave();
      if (cloudSave) {
        this.applyCloudPayload(cloudSave);
      }
      this.setStatus("connected");
    } catch (e) {
      this.setStatus("offline");
    }
  },

  /* ------------------------------------------------- Payload Serializers */
  toCloudPayload(local) {
    if (!local) return null;
    const s = local.stats || {};

    // Extract Bestiary: enemy kills and boss defeats
    const bestiaryList = [];
    if (local.enemyKills && typeof local.enemyKills === "object") {
      for (const k in local.enemyKills) {
        if (local.enemyKills[k]) bestiaryList.push(k);
      }
    }
    if (local.bossDefeats && typeof local.bossDefeats === "object") {
      for (const k in local.bossDefeats) {
        if (local.bossDefeats[k] && !bestiaryList.includes(k)) bestiaryList.push(k);
      }
    }
    if (Array.isArray(local.bestiary)) {
      for (const k of local.bestiary) {
        if (typeof k === "string" && !bestiaryList.includes(k)) bestiaryList.push(k);
      }
    }

    // Achievements: array of unlocked achievement IDs
    const achList = [];
    if (local.ach && typeof local.ach === "object") {
      for (const k in local.ach) {
        if (local.ach[k]) achList.push(k);
      }
    }
    if (Array.isArray(local.achievements)) {
      for (const k of local.achievements) {
        if (typeof k === "string" && !achList.includes(k)) achList.push(k);
      }
    }

    // Synergies: array of seen synergy IDs
    const synList = [];
    if (local.seenSynergy && typeof local.seenSynergy === "object") {
      for (const k in local.seenSynergy) {
        if (local.seenSynergy[k]) synList.push(k);
      }
    }
    if (Array.isArray(local.synergies)) {
      for (const k of local.synergies) {
        if (typeof k === "string" && !synList.includes(k)) synList.push(k);
      }
    }

    const life = (typeof s.lifetimeScore === "number") ? s.lifetimeScore : (typeof local.lifetimeScore === "number" ? local.lifetimeScore : 0);

    return {
      lifetimeScore: Math.max(0, Math.floor(life)),
      cinders: Math.max(0, Math.floor(Number(local.cinders) || 0)),
      selectedLantern: String(local.lantern || local.selectedLantern || "wick"),
      unlockedLanterns: Array.isArray(local.lanterns) && local.lanterns.length ? [...new Set(local.lanterns)] : ["wick"],
      lanternMastery: local.byLantern || local.lanternMastery || {},
      achievements: achList,
      bestiary: bestiaryList,
      synergies: synList,
      duskProgress: Math.max(0, Math.floor(Number(local.duskMax || local.duskProgress) || 0)),
      saveVersion: Math.max(1, Math.floor(Number(local.v || local.saveVersion) || 1)),
    };
  },

  applyCloudPayload(cloud) {
    if (!cloud || typeof Save === "undefined" || !Save.data) return;
    const d = Save.data;

    if (typeof cloud.cinders === "number") {
      d.cinders = cloud.cinders;
      d.totalCinders = Math.max(d.totalCinders || 0, d.cinders);
    }

    const life = (typeof cloud.lifetimeScore === "number") ? cloud.lifetimeScore : (typeof cloud.lifetime_score === "number" ? cloud.lifetime_score : null);
    if (typeof life === "number") {
      if (!d.stats) d.stats = {};
      d.stats.lifetimeScore = life;
      d.lifetimeScore = life;
    }

    const unlocked = cloud.unlockedLanterns || cloud.unlocked_lanterns;
    if (Array.isArray(unlocked) && unlocked.length) {
      d.lanterns = [...new Set(unlocked.filter((id) => typeof id === "string" && id))];
    }

    const selected = cloud.selectedLantern || cloud.selected_lantern;
    if (selected && d.lanterns && d.lanterns.includes(selected)) {
      d.lantern = selected;
    } else if (d.lanterns && d.lanterns.length) {
      d.lantern = d.lanterns[0];
    }

    const mastery = cloud.lanternMastery || cloud.lantern_mastery || cloud.by_lantern;
    if (mastery && typeof mastery === "object") {
      d.byLantern = Object.assign({}, d.byLantern, mastery);
    }

    if (Array.isArray(cloud.achievements)) {
      for (const id of cloud.achievements) {
        if (typeof id === "string") d.ach[id] = 1;
      }
    } else if (cloud.achievements && typeof cloud.achievements === "object") {
      d.ach = Object.assign({}, d.ach, cloud.achievements);
    }

    const syn = cloud.synergies || cloud.seen_synergy;
    if (Array.isArray(syn)) {
      for (const id of syn) {
        if (typeof id === "string") d.seenSynergy[id] = 1;
      }
    } else if (syn && typeof syn === "object") {
      d.seenSynergy = Object.assign({}, d.seenSynergy, syn);
    }

    const dusk = (typeof cloud.duskProgress === "number") ? cloud.duskProgress : (typeof cloud.dusk_progress === "number" ? cloud.dusk_progress : null);
    if (typeof dusk === "number") {
      d.duskMax = Math.max(d.duskMax || 0, dusk);
    }

    if (Array.isArray(cloud.bestiary)) {
      for (const id of cloud.bestiary) {
        if (typeof id === "string") {
          if (typeof ENEMY_INFO === "object" && ENEMY_INFO[id] && ENEMY_INFO[id].boss) {
            d.bossDefeats[id] = Math.max(d.bossDefeats[id] || 0, 1);
          } else {
            d.enemyKills[id] = Math.max(d.enemyKills[id] || 0, 1);
          }
          d.seen[id] = Math.max(d.seen[id] || 0, 1);
        }
      }
    } else if (cloud.bestiary && typeof cloud.bestiary === "object") {
      if (cloud.bestiary.kills) d.enemyKills = Object.assign({}, d.enemyKills, cloud.bestiary.kills);
      if (cloud.bestiary.bosses) d.bossDefeats = Object.assign({}, d.bossDefeats, cloud.bestiary.bosses);
      if (cloud.bestiary.seen) d.seen = Object.assign({}, d.seen, cloud.bestiary.seen);
      if (cloud.bestiary.seenElite) d.seenElite = Object.assign({}, d.seenElite, cloud.bestiary.seenElite);
    }

    // Persist to local cache immediately
    Save._set(SAVE_KEY, JSON.stringify(Save.data));
    if (typeof UI === "object" && UI.updateHearth) {
      try { UI.updateHearth(); } catch (_) {}
    }
  },

  hasMeaningfulProgress(data) {
    if (!data) return false;
    const life = (data.stats && data.stats.lifetimeScore) || data.lifetimeScore || data.lifetime_score || 0;
    const cinders = data.cinders || 0;
    const lanterns = data.lanterns || data.unlockedLanterns || data.unlocked_lanterns || [];
    const runs = (data.stats && data.stats.runs) || 0;
    const ach = data.ach || data.achievements || {};
    const achCount = Array.isArray(ach) ? ach.length : Object.keys(ach).length;
    const bestiary = data.enemyKills || data.bossDefeats || (data.bestiary && data.bestiary.kills) || data.bestiary || {};
    const killsCount = Array.isArray(bestiary) ? bestiary.length : Object.keys(bestiary).length;
    const mastery = data.byLantern || data.lanternMastery || {};
    let hasMastery = false;
    for (const id in mastery) {
      if (mastery[id] && (mastery[id].runs > 0 || mastery[id].kills > 0 || mastery[id].best > 0)) {
        hasMastery = true;
        break;
      }
    }
    return life > 0 || cinders > 0 || lanterns.length > 1 || runs > 0 || achCount > 0 || killsCount > 0 || hasMastery;
  },

  /* -------------------------------------------------- Sync Management */
  queueSync() {
    if (this.mode !== "account" || !this.user) return;
    this.syncPending = true;
    if (window.localStorage) {
      localStorage.setItem(CLOUD_PENDING_KEY, "1");
    }

    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.sync();
    }, 1500); // 1.5s debounce
  },

  async sync() {
    if (this.mode !== "account" || !this.user) return;
    if (this.isSyncing) {
      this.syncPending = true;
      return;
    }
    this.isSyncing = true;
    this.setStatus("syncing");

    try {
      const payload = this.toCloudPayload(Save.data);
      await this.pushCloudSave(payload);
      this.setStatus("connected");
    } catch (e) {
      this.syncPending = true;
      this.setStatus("offline");
    } finally {
      this.isSyncing = false;
    }
  },

  async flushPendingSync() {
    if (this.syncPending) {
      await this.sync();
    }
  },

  /* -------------------------------------------------------- Merge Policy */
  /**
   * Deterministic merge policy ensuring currencies and scores are NEVER duplicated.
   */
  mergeProgress(local, cloud) {
    const localLife = (local.stats && local.stats.lifetimeScore) || local.lifetimeScore || 0;
    const cloudLife = cloud.lifetimeScore || cloud.lifetime_score || (cloud.stats && cloud.stats.lifetimeScore) || 0;
    const mergedLife = Math.max(localLife, cloudLife);

    // Cinders: strictly take the max balance, never sum, preventing duplication
    const mergedCinders = Math.max(local.cinders || 0, cloud.cinders || 0);

    // Unlocks: union
    const localL = Array.isArray(local.lanterns) ? local.lanterns : ["wick"];
    const cloudL = Array.isArray(cloud.unlockedLanterns || cloud.unlocked_lanterns) ? (cloud.unlockedLanterns || cloud.unlocked_lanterns) : ["wick"];
    const mergedLanterns = [...new Set([...localL, ...cloudL])];

    const localCards = Array.isArray(local.cards) ? local.cards : [];
    const cloudCards = Array.isArray(cloud.cards) ? cloud.cards : [];
    const mergedCards = [...new Set([...localCards, ...cloudCards])];

    const mergedAch = Object.assign({}, cloud.achievements || {}, local.ach || {});
    const mergedSynergies = Object.assign({}, cloud.synergies || cloud.seen_synergy || {}, local.seenSynergy || {});

    // Mastery: max per field
    const mergedMastery = {};
    const localMastery = local.byLantern || {};
    const cloudMastery = cloud.lanternMastery || cloud.lantern_mastery || cloud.by_lantern || {};
    const allKeys = new Set([...Object.keys(localMastery), ...Object.keys(cloudMastery)]);
    for (const k of allKeys) {
      const a = localMastery[k] || {};
      const b = cloudMastery[k] || {};
      mergedMastery[k] = {
        best: Math.max(a.best || 0, b.best || 0),
        wave: Math.max(a.wave || 0, b.wave || 0),
        clears: Math.max(a.clears || 0, b.clears || 0),
        runs: Math.max(a.runs || 0, b.runs || 0),
        kills: Math.max(a.kills || 0, b.kills || 0),
        perfectDashes: Math.max(a.perfectDashes || 0, b.perfectDashes || 0),
        masterfulDashes: Math.max(a.masterfulDashes || 0, b.masterfulDashes || 0),
        bossKills: Math.max(a.bossKills || 0, b.bossKills || 0),
        bestCombo: Math.max(a.bestCombo || 0, b.bestCombo || 0),
        bestMulti: Math.max(a.bestMulti || 0, b.bestMulti || 0),
      };
    }

    const mergedDusk = Math.max(local.duskMax || 0, cloud.duskProgress || cloud.dusk_progress || 0);

    return {
      lifetimeScore: mergedLife,
      cinders: mergedCinders,
      selectedLantern: mergedLanterns.includes(local.lantern) ? local.lantern : mergedLanterns[0],
      unlockedLanterns: mergedLanterns,
      lanternMastery: mergedMastery,
      cards: mergedCards,
      achievements: mergedAch,
      bestiary: cloud.bestiary || { kills: local.enemyKills || {} },
      synergies: mergedSynergies,
      duskProgress: mergedDusk,
      saveVersion: 1,
    };
  },
};
