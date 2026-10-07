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
    const cfg = (typeof window !== "undefined" && window.CINDERWAKE_CONFIG) || {};
    const url = (cfg.apiBaseUrl || (window.localStorage && localStorage.getItem("cinderwake.api.url")) || "https://cinderwake-save.raghavendayadavgolla.workers.dev").trim();
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
    const data = await this.apiRequest("/api/me");
    if (!data) return null;
    if (data.username) return { username: data.username };
    if (data.user && data.user.username) return { username: data.user.username };
    return null;
  },

  async register(username, password) {
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

    // Register flow: check whether cloud already has a save
    // If local has meaningful progress and cloud does not, migrate to cloud once.
    try {
      const cloudSave = await this.fetchCloudSave();
      const localData = typeof Save !== "undefined" && Save.data;
      const hasLocal = this.hasMeaningfulProgress(localData);
      const hasCloud = this.hasMeaningfulProgress(cloudSave);

      if (hasLocal && !hasCloud) {
        await this.pushCloudSave(this.toCloudPayload(localData));
      } else if (hasCloud) {
        this.applyCloudPayload(cloudSave);
      } else if (localData) {
        await this.pushCloudSave(this.toCloudPayload(localData));
      }
    } catch (e) {
      // Offline fallback: mark sync pending
      this.syncPending = true;
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
    return {
      lifetimeScore: s.lifetimeScore || 0,
      cinders: local.cinders || 0,
      selectedLantern: local.lantern || "wick",
      unlockedLanterns: Array.isArray(local.lanterns) && local.lanterns.length ? local.lanterns : ["wick"],
      lanternMastery: local.byLantern || {},
      achievements: local.ach || {},
      bestiary: {
        kills: local.enemyKills || {},
        bosses: local.bossDefeats || {},
        seen: local.seen || {},
        seenElite: local.seenElite || {},
      },
      synergies: local.seenSynergy || {},
      duskProgress: local.duskMax || 0,
      saveVersion: 1,
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
      d.lanterns = unlocked;
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

    if (cloud.achievements && typeof cloud.achievements === "object") {
      d.ach = Object.assign({}, d.ach, cloud.achievements);
    }

    const syn = cloud.synergies || cloud.seen_synergy;
    if (syn && typeof syn === "object") {
      d.seenSynergy = Object.assign({}, d.seenSynergy, syn);
    }

    const dusk = (typeof cloud.duskProgress === "number") ? cloud.duskProgress : (typeof cloud.dusk_progress === "number" ? cloud.dusk_progress : null);
    if (typeof dusk === "number") {
      d.duskMax = Math.max(d.duskMax || 0, dusk);
    }

    if (cloud.bestiary && typeof cloud.bestiary === "object") {
      if (cloud.bestiary.kills) d.enemyKills = Object.assign({}, d.enemyKills, cloud.bestiary.kills);
      if (cloud.bestiary.bosses) d.bossDefeats = Object.assign({}, d.bossDefeats, cloud.bestiary.bosses);
      if (cloud.bestiary.seen) d.seen = Object.assign({}, d.seen, cloud.bestiary.seen);
      if (cloud.bestiary.seenElite) d.seenElite = Object.assign({}, d.seenElite, cloud.bestiary.seenElite);
      // Support flat bestiary dict of kill counts
      for (const k in cloud.bestiary) {
        if (typeof cloud.bestiary[k] === "number") {
          d.enemyKills[k] = Math.max(d.enemyKills[k] || 0, cloud.bestiary[k]);
        }
      }
    }

    // Persist to local cache immediately
    Save._set(SAVE_KEY, JSON.stringify(Save.data));
  },

  hasMeaningfulProgress(data) {
    if (!data) return false;
    const life = (data.stats && data.stats.lifetimeScore) || data.lifetimeScore || data.lifetime_score || 0;
    const cinders = data.cinders || 0;
    const lanterns = data.lanterns || data.unlockedLanterns || data.unlocked_lanterns || [];
    const runs = (data.stats && data.stats.runs) || 0;
    return life > 0 || cinders > 0 || lanterns.length > 1 || runs > 0;
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
