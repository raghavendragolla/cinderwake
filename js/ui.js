"use strict";
/* Cinderwake — interface. Menus and overlays are plain DOM so they are
   keyboard- and screen-reader-friendly; only the arena is canvas.      */

/* How cards read when the lantern blinks instead of dashing. */
const BLINK_DESC = {
  momentum: ["Your burst is 10% wider.", "Your burst is 20% wider.", "Your burst is 30% wider."],
  keen: ["Your burst is 20% wider.", "Your burst is 40% wider."],
  reach: ["Blink 14% farther.", "Blink 28% farther.", "Blink 42% farther."],
  wake: ["Your burst leaves a burning patch for 2 seconds.", "The patch burns for 3 seconds.", "The patch burns for 4 seconds."],
  echo: ["Half a second after each blink, an echo bursts in the same place.", "A second echo follows the first."],
  crosscut: ["A second burst erupts at the spot you blinked from."],
  undertow: ["Your burst drags nearby enemies into it."],
  backdraft: ["When a burning patch dies out, it detonates."],
};
function cardDesc(u, level, lanternId) {
  const src = lanternId && LANTERNS[lanternId].blink && BLINK_DESC[u.id] ? BLINK_DESC[u.id] : u.desc;
  return src[clamp(level, 1, src.length) - 1];
}
/** "a Blot", "the Mire", "a bolt" — for the death line. */
function killerName(key) {
  const info = ENEMY_INFO[key];
  if (!info) return "the dark";
  if (info.boss) return info.name.replace(/^The /, "the ");
  return /^(a|an|the) /.test(info.name) ? info.name : "a " + info.name;
}

const UI = {
  cur: null,
  settingsFrom: "main",
  selLantern: null,
  bannerT: 0,
  cache: {},
  countTimer: null,
  resetArmed: 0,
  hintText: "",

  init() {
    this.hud = $("#hud");
    this.screens = $$("#screens > .screen");
    $("#btnPause").innerHTML = icon("pause", 22);

    // one click handler for every data-go / data-act button
    document.addEventListener("click", (e) => {
      const b = e.target.closest ? e.target.closest("button") : null;
      if (!b || b.disabled) return;
      if (b.dataset.go) {
        Sfx.uiBack();
        this.show(b.dataset.go);
      } else if (b.dataset.act) {
        Sfx.ui();
        this.act(b.dataset.act);
      }
    });
    $("#btnPause").addEventListener("click", () => pauseGame());
    $("#settingsBack").addEventListener("click", () => {
      Sfx.uiBack();
      Save.persist();
      this.show(this.settingsFrom);
    });
    $("#btnBegin").addEventListener("click", () => this.begin());
    $("#duskDown").addEventListener("click", () => this.stepDusk(-1));
    $("#duskUp").addEventListener("click", () => this.stepDusk(1));
    $("#btnReroll").addEventListener("click", () => this.reroll());
    this.initSettings();
  },

  /* ---------------------------------------------------- navigation */
  show(name) {
    for (const s of this.screens) s.hidden = s.id !== "scr-" + name;
    this.cur = name;
    this.bannerT = 0;
    $("#banner").classList.remove("on");
    const build = { main: "refreshMain", loadout: "buildLoadout", hearth: "buildHearth", how: "buildBestiary", stats: "buildStats", ach: "buildAch", settings: "syncSettings", pause: "buildPause", cloud: "buildCloud" }[name];
    if (build) this[build]();
    const scr = $("#scr-" + name);
    if (scr) {
      const f = scr.querySelector("[data-autofocus]:not([hidden]):not(:disabled)") || scr.querySelector("button:not([hidden]):not(:disabled)");
      if (f) f.focus({ preventScroll: true });
      const panel = scr.querySelector(".panel");
      if (panel) panel.scrollTop = 0;
    }
  },
  hide() {
    for (const s of this.screens) s.hidden = true;
    this.cur = null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  },
  back() {
    if (!this.cur) return;
    const b = $("#scr-" + this.cur + " .btn-back");
    if (b) b.click();
  },
  /** Arrow-key focus movement inside the open screen. */
  moveFocus(dir) {
    if (!this.cur) return false;
    const list = $$("#scr-" + this.cur + " button, #scr-" + this.cur + " input").filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
    if (!list.length) return false;
    let i = list.indexOf(document.activeElement);
    i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    list[i].focus();
    Sfx.uiMove();
    return true;
  },

  act(name) {
    switch (name) {
      case "play": this.show("loadout"); break;
      case "continue":
        if (Save.data.run) {
          this.hide();
          startRun(null, 0, Save.data.run);
        }
        break;
      case "hearth":
        if (G.state !== "menu") quitToMenu();
        this.show("hearth");
        break;
      case "resume": resumeGame(); break;
      case "restart":
        this.hide();
        restartRun();
        break;
      case "settings-pause":
        this.settingsFrom = "pause";
        this.show("settings");
        break;
      case "quit":
      case "menu":
        quitToMenu();
        this.show("main");
        break;
      case "endless":
        goEndless();
        break;
      case "bank":
        endRun(true);
        break;
      case "daily":
        // fixed lantern and tier — everyone's "today's best" has to be the
        // same challenge, not whatever loadout you happened to have selected
        this.hide();
        startRun("wick", 0, null, Rng.todaySeed());
        break;
      case "practice":
        this.hide();
        startPractice();
        break;
      case "same-seed": {
        const s = G.summary || { lantern: Save.data.lantern, dusk: Save.data.duskSel, seed: "" };
        this.hide();
        startRun(s.lantern, s.dusk, null, s.seed);
        break;
      }
      case "again": {
        const s = G.summary || { lantern: Save.data.lantern, dusk: Save.data.duskSel };
        this.hide();
        startRun(s.lantern, s.dusk, null);
        break;
      }
      case "retry-wave":
        this.hide();
        restartCheckpoint();
        break;
      case "end-run":
        this.hide();
        endRun(false);
        break;
    }
  },

  notify(badge, title, kind) {
    const box = $("#toasts");
    if (!box) return;
    while (box.children.length >= 2) box.firstChild.remove();
    const t = h("div", { class: "toast" + (kind ? " t-" + kind : "") });
    if (badge) t.append(h("div", { class: "t-badge", text: badge }));
    t.append(h("div", { class: "t-title", text: title || "" }));
    box.append(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 1100);
  },

  toast(msg, kind) {
    if (typeof msg === "string" && msg.includes(" — ")) {
      const parts = msg.split(" — ");
      return this.notify(parts[0], parts[1].split(".")[0], kind);
    }
    return this.notify("", msg, kind);
  },

  banner(title, sub, dur, cls) {
    $("#bannerTitle").textContent = title;
    $("#bannerSub").textContent = sub || "";
    const b = $("#banner");
    b.classList.add("on");
    b.classList.toggle("mutation", !!cls);
    this.bannerT = dur || 2;
  },

  /* ------------------------------------------------------ main menu */
  refreshMain() {
    const d = Save.data, r = d.run;
    this.settingsFrom = "main";
    const c = $("#btnContinue");
    c.hidden = !r;
    if (r) c.textContent = "Continue " + LANTERNS[r.lantern].name + ", wave " + r.wave;
    $("#mainCinders").textContent = fmt(d.cinders) + " Cinders";
    $("#mainBest").textContent = d.stats.bestScore > 0 ? "Best " + fmt(d.stats.bestScore) + ", wave " + d.stats.bestWave : "";
    const n = this.affordable().length;
    $("#hearthNote").textContent = n ? (n === 1 ? "1 thing you can afford" : n + " things you can afford") : "";
    $("#achNote").textContent = Object.keys(d.ach).length + " of " + ACHIEVEMENTS.length;
    const today = typeof Rng === "object" ? Rng.todaySeed() : "";
    $("#dailyNote").textContent = d.daily && d.daily.date === today && d.daily.played > 0 ? "today's best " + fmt(d.daily.best) : "not played today";
    const cn = $("#cloudNote");
    if (cn && typeof Cloud === "object") {
      cn.textContent = Cloud.mode === "account" ? (Cloud.status === "syncing" ? "Syncing..." : Cloud.status === "offline" ? "Offline" : "Connected") : "Guest";
    }
    // the reset after a death should feel like the start of the next attempt,
    // not a blank slate — say what carried over
    const w = $("#mainWelcome");
    if (w) {
      const lr = d.lastRun;
      w.textContent = lr && !r ? "Last time you reached Wave " + lr.wave + " with " + LANTERNS[lr.lantern].name + (lr.cinders > 0 ? ", and kept " + fmt(lr.cinders) + " Cinders" : "") + ". Beat it." : "";
    }
  },

  /** Everything still for sale, cheapest first. */
  forSale() {
    const d = Save.data, out = [];
    for (const id of LANTERN_ORDER) {
      const L = LANTERNS[id];
      if (L.price && !d.lanterns.includes(id)) out.push({ kind: "lantern", id, name: L.name + " lantern", price: L.price });
    }
    for (const u of UPGRADES) if (u.price && !d.cards.includes(u.id)) out.push({ kind: "card", id: u.id, name: u.name, price: u.price });
    for (const id in PERKS) if (!d.perks.includes(id)) out.push({ kind: "perk", id, name: PERKS[id].name, price: PERKS[id].price });
    return out.sort((a, b) => a.price - b.price);
  },
  affordable() {
    const c = Save.data.cinders;
    return this.forSale().filter((x) => x.price <= c);
  },

  /* -------------------------------------------------------- loadout */
  buildLoadout() {
    const d = Save.data;
    if (!this.selLantern || !d.lanterns.includes(this.selLantern)) this.selLantern = d.lantern;
    if (!d.lanterns.includes(this.selLantern)) this.selLantern = "wick";
    const list = $("#lanternList");
    list.textContent = "";
    for (const id of LANTERN_ORDER) {
      const L = LANTERNS[id], owned = d.lanterns.includes(id), bl = d.byLantern[id];
      const foot = owned
        ? bl && bl.best ? "Best " + fmt(bl.best) + ", wave " + bl.wave : "Not yet played"
        : L.price ? L.price + " Cinders at the Hearth" : "Clear all 15 waves to earn it";

      let masteryEl = null;
      if (owned) {
        const lvl = masteryLevel(bl);
        const nextL = MASTERY_LEVELS.find((m) => m.id === lvl + 1);
        let progText = "";
        let pct = 0;
        if (nextL && nextL.prog) {
          const pr = nextL.prog(bl || {});
          progText = Math.min(pr[0], pr[1]) + "/" + pr[1];
          pct = clamp((pr[0] / pr[1]) * 100, 0, 100);
        } else if (nextL) {
          pct = 0;
        } else {
          pct = 100;
        }
        let rewardText = "";
        if (lvl >= 5) {
          rewardText = L.masteryTitle;
        } else if (nextL) {
          rewardText = nextL.reward ? "Next: " + nextL.reward : "Next: " + nextL.desc;
        }
        masteryEl = h("div", { class: "l-mastery" },
          h("div", { class: "m-head" },
            h("span", { class: "m-lvl" }, lvl >= 5 ? "Mastered" : "Mastery Level " + lvl),
            progText ? h("span", { class: "m-prog" }, progText) : null
          ),
          nextL ? h("div", { class: "m-bar" }, h("i", { style: "width:" + pct + "%" })) : null,
          h("span", { class: "m-next" }, rewardText)
        );
      }

      const isChecked = owned && id === this.selLantern;
      const b = h("button", {
        type: "button",
        class: "lantern" + (owned ? "" : " locked"),
        role: "radio",
        "aria-checked": isChecked ? "true" : "false",
        "aria-disabled": owned ? "false" : "true",
        tabindex: owned ? "0" : "-1",
        title: owned ? L.name : L.name + " (" + foot + ")",
        onclick: () => this.selectLantern(id),
      },
        h("b", null, L.name + (owned && masteryLevel(bl) >= 5 ? " • " + L.masteryTitle : "")),
        h("span", { class: "l-tag" }, L.tag),
        h("span", { class: "l-desc" }, L.desc),
        h("ul", null, L.facts.map((f) => h("li", null, f))),
        masteryEl,
        h("span", { class: "l-foot" }, foot));
      list.append(b);
    }
    d.duskSel = clamp(d.duskSel, 0, d.duskMax);
    const t = d.duskSel;
    $("#duskName").innerHTML = "";
    $("#duskName").append(DUSK_TIERS[t].name, t > 0 ? h("small", null, "+" + t * 20 + "% Cinders") : "");
    const rules = $("#duskRules");
    rules.textContent = "";
    if (t === 0) rules.append(h("li", null, d.duskMax === 0 ? "The standard descent. Clear all 15 waves to unlock Dusk 1." : DUSK_TIERS[0].rule));
    for (let i = 1; i <= t; i++) rules.append(h("li", null, DUSK_TIERS[i].rule));
    $("#duskDown").disabled = t <= 0;
    $("#duskUp").disabled = t >= d.duskMax;
    $("#loadoutNote").textContent = d.run ? "Beginning a new run banks the Cinders from your unfinished one." : "";
  },
  selectLantern(id) {
    const d = Save.data;
    const owned = d.lanterns.includes(id);
    const L = LANTERNS[id];
    if (!L) return;
    if (!owned) {
      Sfx.deny();
      const foot = L.price ? L.price + " Cinders at the Hearth" : "Clear all 15 waves to earn it";
      $("#loadoutNote").textContent = L.name + " is locked. " + foot + ".";
      return;
    }
    Sfx.ui();
    this.selLantern = id;
    d.lantern = id;
    Save.persist();
    $("#loadoutNote").textContent = "";
    this.buildLoadout();
    const idx = LANTERN_ORDER.indexOf(id);
    const again = $$("#lanternList .lantern")[idx];
    if (again) again.focus();
  },
  stepLantern(dir) {
    const d = Save.data;
    const curIdx = LANTERN_ORDER.indexOf(this.selLantern);
    for (let step = 1; step <= LANTERN_ORDER.length; step++) {
      const nextIdx = (curIdx + dir * step + LANTERN_ORDER.length * 10) % LANTERN_ORDER.length;
      const nextId = LANTERN_ORDER[nextIdx];
      if (d.lanterns.includes(nextId)) {
        this.selectLantern(nextId);
        return;
      }
    }
  },
  selectLanternIndex(idx) {
    if (idx < 0 || idx >= LANTERN_ORDER.length) return;
    this.selectLantern(LANTERN_ORDER[idx]);
  },
  stepDusk(dir) {
    const d = Save.data;
    d.duskSel = clamp(d.duskSel + dir, 0, d.duskMax);
    Sfx.uiMove();
    this.buildLoadout();
  },
  begin() {
    const d = Save.data;
    if (!d.lanterns.includes(this.selLantern)) this.selLantern = "wick";
    d.lantern = this.selLantern;
    Save.persist();
    Sfx.pick();
    this.hide();
    startRun(d.lantern, d.duskSel, null);
  },

  /* --------------------------------------------------------- hearth */
  buildHearth() {
    const d = Save.data, body = $("#hearthBody");
    $("#hearthCinders").textContent = fmt(d.cinders) + " Cinders";
    body.textContent = "";
    const row = (ic, name, desc, have, price, lockText, buy) => {
      let right;
      if (have) right = h("span", { class: "shop-state" }, "Owned");
      else if (!price) right = h("span", { class: "shop-state" }, lockText);
      else if (d.cinders >= price) right = h("button", { type: "button", class: "btn btn-small btn-primary", onclick: buy }, "Buy for " + price);
      else right = h("span", { class: "shop-state" }, price + " Cinders, " + (price - d.cinders) + " to go");
      return h("div", { class: "shop-row" + (have ? " have" : "") }, h("div", { class: "shop-icon", html: icon(have ? "check" : ic, 22) }),
        h("div", { class: "shop-text" }, h("b", null, name), h("span", null, desc)), right);
    };
    const sec = (title, rows) => {
      if (rows.length) body.append(h("div", { class: "shop-sec" }, h("h3", null, title), rows));
    };
    sec("Lanterns", LANTERN_ORDER.filter((id) => id !== "wick").map((id) => {
      const L = LANTERNS[id];
      return row("util", L.name, L.tag + ". " + L.desc, d.lanterns.includes(id), L.price, "Clear all 15 waves", () => this.buy("lantern", id, L.price, L.name));
    }));
    sec("Cards added to your runs", UPGRADES.filter((u) => u.price && !u.relic).map((u) =>
      row(u.build, u.name, BUILD_NAMES[u.build] + " card. " + u.desc[0] + (u.req ? " Needs " + UP[u.req].name + "." : ""), d.cards.includes(u.id), u.price, "", () => this.buy("card", u.id, u.price, u.name))));
    sec("Relics added to boss rewards", UPGRADES.filter((u) => u.price && u.relic).map((u) =>
      row("relic", u.name, u.desc[0], d.cards.includes(u.id), u.price, "", () => this.buy("card", u.id, u.price, u.name))));
    sec("Standing perks", Object.keys(PERKS).map((id) => {
      const P = PERKS[id];
      return row("cinder", P.name, P.desc, d.perks.includes(id), P.price, "", () => this.buy("perk", id, P.price, P.name));
    }));
  },
  buy(kind, id, price, name) {
    const d = Save.data;
    if (d.cinders < price) return;
    const list = kind === "lantern" ? d.lanterns : kind === "card" ? d.cards : d.perks;
    if (list.includes(id)) return;
    d.cinders -= price;
    list.push(id);
    if (kind === "lantern") {
      d.lantern = id;
      this.selLantern = id;
    }
    Save.persist();
    Sfx.buy();
    this.toast(name + " is yours.");
    if (LANTERN_ORDER.every((l) => d.lanterns.includes(l))) unlockAch("collector");
    const panel = $("#scr-hearth .panel"), top = panel.scrollTop;
    this.buildHearth();
    panel.scrollTop = top;
    $("#scr-hearth .btn-back").focus({ preventScroll: true });
  },

  /* ---------------------------------------- reference and statistics */
  buildBestiary() {
    const box = $("#bestiary"), d = Save.data, seen = d.seen;
    box.textContent = "";
    for (const id of BESTIARY_ORDER) {
      const info = ENEMY_INFO[id];
      if (seen[id]) {
        let countTag = "";
        if (info.boss) {
          const defs = d.bossDefeats[id] || 0;
          countTag = defs ? fmt(defs) + (defs === 1 ? " defeat" : " defeats") : "Not yet defeated";
        } else {
          const kills = d.enemyKills[id] || 0;
          countTag = fmt(kills) + " cut down";
        }
        box.append(h("div", { class: "beast" },
          h("div", { class: "beast-head" },
            h("b", null, info.name),
            h("span", { class: "beast-count" }, countTag)
          ),
          h("span", { class: "beast-tip" }, info.tip)
        ));
      } else {
        box.append(h("div", { class: "beast unknown" }, "Not yet met"));
      }
    }

    const synBox = $("#synergies");
    if (synBox) {
      synBox.textContent = "";
      for (const s of SYNERGIES) {
        const found = !!d.seenSynergy[s.id];
        const n1 = BUILD_NAMES[s.need[0]] || s.need[0], n2 = BUILD_NAMES[s.need[1]] || s.need[1];
        synBox.append(h("div", { class: "syn-card" + (found ? " found" : " locked") },
          h("div", { class: "syn-head" },
            h("b", null, found ? s.name : "???"),
            h("span", { class: "syn-pair" }, n1 + " + " + n2),
            h("span", { class: "syn-status" }, found ? "✓ Discovered" : "Undiscovered")
          ),
          h("span", { class: "syn-desc" }, found ? s.desc : "Combine " + n1 + " and " + n2 + " cards in a run to discover this synergy.")
        ));
      }
    }
  },
  buildStats() {
    const d = Save.data, s = d.stats, body = $("#statsBody");
    body.textContent = "";
    const rows = [
      ["Runs", fmt(s.runs)], ["Campaign clears", fmt(s.clears)], ["Best score", fmt(s.bestScore)], ["Lifetime score", fmt(s.lifetimeScore || 0)], ["Farthest wave", fmt(s.bestWave)],
      ["Most kills in one dash", fmt(s.bestMulti)], ["Longest combo", fmt(s.bestCombo)], ["Enemies cut down", fmt(s.kills)],
      ["Bosses defeated", fmt(s.bossKills)], ["Dashes made", fmt(s.dashes)], ["Perfect dashes landed", fmt(s.perfectDashes || 0)],
      ["Bolts sent back", fmt(s.reflects)], ["Best Endless wave", d.bestEndless > CAMPAIGN_WAVES ? fmt(d.bestEndless) : "—"],
      ["Fastest campaign clear", d.fastestClear > 0 ? fmtTime(d.fastestClear) : "—"],
      ["Cinders earned, all time", fmt(d.totalCinders)], ["Deepest Dusk unlocked", DUSK_TIERS[d.duskMax].name], ["Time in the dark", fmtTime(s.playTime)],
    ];
    const dl = h("dl", { class: "stat-list" });
    for (const r of rows) dl.append(h("dt", null, r[0]), h("dd", null, r[1]));
    body.append(dl);
    const per = LANTERN_ORDER.filter((id) => d.byLantern[id] && d.byLantern[id].runs);
    if (per.length) {
      const dl2 = h("dl", { class: "stat-list" });
      for (const id of per) {
        const b = d.byLantern[id];
        const ml = masteryLevel(b);
        dl2.append(h("dt", null, LANTERNS[id].name + (ml ? " (Mastery " + ml + (ml >= 5 ? ": " + LANTERNS[id].masteryTitle : "") + ")" : "")),
          h("dd", null, fmt(b.best) + ", wave " + b.wave + (b.bestMulti ? ", " + b.bestMulti + "-dash" : "") + (b.clears ? ", " + b.clears + (b.clears === 1 ? " clear" : " clears") : "")));
      }
      body.append(h("h3", null, "Best by lantern"), dl2);
    }
    const hist = d.history || [];
    if (hist.length) {
      body.append(h("h3", null, "Recent Runs"));
      const t = h("div", { class: "history-list" });
      for (const hr of hist) {
        t.append(h("div", { class: "history-row" },
          h("div", null, h("b", null, LANTERNS[hr.lantern] ? LANTERNS[hr.lantern].name : hr.lantern), h("span", { class: "dim" }, " • " + (hr.cleared ? "Cleared" : "Wave " + hr.wave))),
          h("div", { class: "history-score" }, fmt(hr.score) + " pts"),
          h("div", { class: "dim" }, hr.seed ? hr.seed : hr.date)
        ));
      }
      body.append(t);
    }
    if (!s.runs) body.append(h("p", { class: "note" }, "Nothing here yet. Begin a run and this page will fill in."));
  },
  buildAch() {
    const d = Save.data, body = $("#achBody");
    body.textContent = "";
    $("#achCount").textContent = Object.keys(d.ach).length + " of " + ACHIEVEMENTS.length;
    for (const a of ACHIEVEMENTS) {
      const done = !!d.ach[a.id];
      const text = h("div", null, h("b", null, a.name), h("span", null, a.desc));
      if (!done && a.prog) {
        const pr = a.prog(d.stats);
        text.append(h("div", { class: "ach-bar" }, h("i", { style: "width:" + clamp((pr[0] / pr[1]) * 100, 0, 100) + "%" })));
      }
      body.append(h("div", { class: "ach" + (done ? " done" : "") }, h("div", { class: "a-icon", html: icon(done ? "check" : "cinder", 20) }), text,
        h("div", { class: "a-reward" }, (done ? "" : "+") + a.reward + (done ? " earned" : " Cinders"))));
    }
  },

  /* ------------------------------------------------------- settings */
  initSettings() {
    const s = () => Save.data.settings;
    const bindRange = (id, key) => $("#" + id).addEventListener("input", (e) => {
      s()[key] = clamp(Number(e.target.value) / 100, 0, 1);
      AudioSys.applyVolumes();
      FX.configure();
      if (key === "sfx" || key === "master") Sfx.uiMove();
    });
    bindRange("setMaster", "master");
    bindRange("setSfx", "sfx");
    bindRange("setMusic", "music");
    bindRange("setShake", "shake");
    const bindCheck = (id, key) => $("#" + id).addEventListener("change", (e) => {
      s()[key] = !!e.target.checked;
      AudioSys.applyVolumes();
      FX.configure();
      Save.persist();
      Sfx.ui();
    });
    bindCheck("setMute", "mute");
    bindCheck("setReduced", "reduced");
    bindCheck("setAim", "aimGuide");
    bindCheck("setNumbers", "numbers");
    for (const id of ["setMaster", "setSfx", "setMusic", "setShake"]) $("#" + id).addEventListener("change", () => Save.persist());
    $("#setFullscreen").addEventListener("click", () => {
      try {
        const el = document.documentElement;
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el.requestFullscreen) {
          const p = el.requestFullscreen();
          if (p && p.catch) p.catch(() => { $("#setNote").textContent = "Full screen is not available here."; });
        } else $("#setNote").textContent = "Full screen is not available here.";
      } catch (e) {
        $("#setNote").textContent = "Full screen is not available here.";
      }
    });
    $("#setReset").addEventListener("click", (e) => {
      const b = e.currentTarget, now = Date.now();
      if (now - this.resetArmed < 5000) {
        this.resetArmed = 0;
        if (G.state !== "menu") quitToMenu();
        Save.reset();
        this.selLantern = null;
        b.textContent = "Erase";
        b.classList.remove("armed");
        $("#setNote").textContent = "Progress erased. Settings were kept.";
        this.settingsFrom = "main";
        Sfx.uiBack();
      } else {
        this.resetArmed = now;
        b.textContent = "Press again to erase";
        b.classList.add("armed");
        $("#setNote").textContent = "This cannot be undone.";
        setTimeout(() => {
          if (this.resetArmed === now) {
            this.resetArmed = 0;
            b.textContent = "Erase";
            b.classList.remove("armed");
            $("#setNote").textContent = "";
          }
        }, 5000);
      }
    });
  },
  syncSettings() {
    const s = Save.data.settings;
    $("#setMaster").value = Math.round(s.master * 100);
    $("#setSfx").value = Math.round(s.sfx * 100);
    $("#setMusic").value = Math.round(s.music * 100);
    $("#setShake").value = Math.round(s.shake * 100);
    $("#setMute").checked = s.mute;
    $("#setReduced").checked = Save.reducedMotion();
    $("#setAim").checked = s.aimGuide;
    $("#setNumbers").checked = s.numbers;
    $("#setNote").textContent = Save.storageOk ? "" : "This browser is blocking storage, so progress will not survive closing the tab.";
  },

  /* ----------------------------------------------------- cloud save */
  buildCloud() {
    if (typeof Cloud !== "object") return;
    const isAuthed = Cloud.mode === "account" && Cloud.user;
    const badge = $("#cloudBadge");
    const userEl = $("#cloudUserDisplay");
    const desc = $("#cloudStatusDesc");
    const authedBox = $("#cloudAuthedControls");
    const authForm = $("#cloudAuthForm");
    const note = $("#cloudAuthNote");
    const syncNote = $("#cloudSyncNote");

    if (note) note.textContent = "";
    if (syncNote) syncNote.textContent = Cloud.lastSyncTime ? "Last synced: " + new Date(Cloud.lastSyncTime).toLocaleTimeString() : "";

    if (isAuthed) {
      if (authedBox) authedBox.hidden = false;
      if (authForm) authForm.hidden = true;
      if (badge) {
        badge.textContent = Cloud.status === "syncing" ? "Syncing" : Cloud.status === "offline" ? "Offline" : "Cloud Save: ON";
        badge.className = "cloud-badge " + (Cloud.status === "syncing" ? "syncing" : Cloud.status === "offline" ? "offline" : "connected");
      }
      if (userEl) userEl.textContent = (Cloud.user && Cloud.user.username) || "Connected";
      if (desc) desc.textContent = "Your progression follows you across devices. Sync is automatic.";
    } else {
      if (authedBox) authedBox.hidden = true;
      if (authForm) authForm.hidden = false;
      if (badge) {
        badge.textContent = "Guest";
        badge.className = "cloud-badge";
      }
      if (userEl) userEl.textContent = "Local save only";
      if (desc) desc.textContent = "Sign in or create an account to back up and sync your progression.";
    }

    const btnSync = $("#btnCloudSync");
    if (btnSync) {
      btnSync.onclick = async () => {
        btnSync.disabled = true;
        btnSync.textContent = "Syncing...";
        try {
          await Cloud.sync();
          this.toast("Cloud save synced.");
        } catch (e) {
          this.toast("Sync failed: " + (e.message || "Network error"));
        } finally {
          btnSync.disabled = false;
          btnSync.textContent = "Sync Now";
          this.buildCloud();
        }
      };
    }

    const btnLogout = $("#btnCloudLogout");
    if (btnLogout) {
      btnLogout.onclick = async () => {
        btnLogout.disabled = true;
        try {
          await Cloud.logout();
        } finally {
          btnLogout.disabled = false;
          this.toast("Logged out. Returned to Guest mode.");
          this.buildCloud();
        }
      };
    }

    const btnBackup = $("#btnCloudBackupDevice");
    if (btnBackup) {
      btnBackup.onclick = async () => {
        btnBackup.disabled = true;
        try {
          const snapshot = Cloud.getStoredSnapshot() || Cloud.captureLocalSnapshot();
          if (!snapshot || !Cloud.hasMeaningfulProgress(snapshot)) {
            this.toast("No local progression found to back up.");
            return;
          }
          const cloudSave = await Cloud.fetchCloudSave();
          this.showConflictModal(snapshot, cloudSave || { cinders: 0, lifetimeScore: 0, unlockedLanterns: ["wick"] }, async (choice) => {
            if (choice === "import") {
              try {
                await Cloud.importLocalProgress(snapshot);
                this.toast("Progress imported successfully.");
              } catch (err) {
                this.toast(err.message || "Import failed.");
              }
            } else if (choice === "cloud") {
              if (cloudSave) Cloud.applyCloudPayload(cloudSave);
              Cloud.clearStoredSnapshot();
              this.toast("Kept cloud account progression.");
            }
            this.buildCloud();
            if (this.updateHearth) this.updateHearth();
          });
        } catch (err) {
          this.toast(err.message || "Failed to inspect save data.");
        } finally {
          btnBackup.disabled = false;
        }
      };
    }

    const btnLogin = $("#btnCloudLogin");
    if (btnLogin) {
      btnLogin.onclick = async () => {
        const username = ($("#cloudUsername").value || "").trim();
        const pwd = ($("#cloudPassword").value || "").trim();
        if (!username) { if (note) note.textContent = "Please enter your username."; return; }
        if (!pwd) { if (note) note.textContent = "Please enter your password."; return; }
        btnLogin.disabled = true;
        if (note) note.textContent = "Signing in...";
        try {
          const res = await Cloud.login(username, pwd);
          const pwdEl = $("#cloudPassword");
          if (pwdEl) pwdEl.value = "";
          if (res && res.requiresDecision) {
            this.showConflictModal(res.localSnapshot, res.cloudSave, async (choice) => {
              if (choice === "import") {
                try {
                  await Cloud.importLocalProgress(res.localSnapshot);
                  this.toast("Progress imported successfully.");
                } catch (err) {
                  this.toast(err.message || "Import failed.");
                }
              } else if (choice === "cloud") {
                if (res.cloudSave) Cloud.applyCloudPayload(res.cloudSave);
                Cloud.clearStoredSnapshot();
                this.toast("Using cloud account progression.");
              } else {
                if (res.cloudSave) Cloud.applyCloudPayload(res.cloudSave);
                this.toast("Signed in. Local snapshot retained.");
              }
              this.buildCloud();
              if (this.updateHearth) this.updateHearth();
            });
            return;
          }
          this.toast("Signed in as " + username);
          this.buildCloud();
        } catch (e) {
          if (note) note.textContent = e.message || "Sign in failed.";
        } finally {
          btnLogin.disabled = false;
        }
      };
    }

    const btnRegister = $("#btnCloudRegister");
    const confirmBox = $("#cloudMigrationConfirm");
    const authFields = $("#cloudAuthFields");
    const btnConfirmBackup = $("#btnCloudConfirmBackup");
    const btnCancelBackup = $("#btnCloudCancelBackup");

    const doRegister = async (username, pwd, migrate) => {
      if (btnRegister) btnRegister.disabled = true;
      if (btnConfirmBackup) btnConfirmBackup.disabled = true;
      if (note) note.textContent = "Creating account...";
      try {
        await Cloud.register(username, pwd, migrate);
        const pwdEl = $("#cloudPassword");
        if (pwdEl) pwdEl.value = "";
        if (confirmBox) confirmBox.hidden = true;
        if (authFields) authFields.hidden = false;
        this.toast(migrate ? "Account created and local progression backed up." : ("Account created. Welcome, " + username));
        this.buildCloud();
      } catch (e) {
        if (note) note.textContent = e.message || "Account creation failed.";
        if (confirmBox) confirmBox.hidden = true;
        if (authFields) authFields.hidden = false;
      } finally {
        if (btnRegister) btnRegister.disabled = false;
        if (btnConfirmBackup) btnConfirmBackup.disabled = false;
      }
    };

    if (btnRegister) {
      btnRegister.onclick = () => {
        const username = ($("#cloudUsername").value || "").trim();
        const pwd = ($("#cloudPassword").value || "").trim();
        if (!username) { if (note) note.textContent = "Please enter a username."; return; }
        if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
          if (note) note.textContent = "Username must be 3–32 characters (letters, numbers, underscore).";
          return;
        }
        if (!pwd || pwd.length < 8) {
          if (note) note.textContent = "Password must be at least 8 characters.";
          return;
        }
        if (note) note.textContent = "";

        const hasLocal = typeof Cloud !== "undefined" && Cloud.hasMeaningfulProgress(Save.data);
        if (hasLocal && confirmBox && authFields) {
          authFields.hidden = true;
          confirmBox.hidden = false;
        } else {
          doRegister(username, pwd, false);
        }
      };
    }

    if (btnConfirmBackup) {
      btnConfirmBackup.onclick = () => {
        const username = ($("#cloudUsername").value || "").trim();
        const pwd = ($("#cloudPassword").value || "").trim();
        doRegister(username, pwd, true);
      };
    }

    if (btnCancelBackup) {
      btnCancelBackup.onclick = () => {
        if (confirmBox) confirmBox.hidden = true;
        if (authFields) authFields.hidden = false;
        if (note) note.textContent = "";
      };
    }
  },

  showConflictModal(localData, cloudData, callback) {
    const box = $("#conflictComparison");
    if (!box) { callback("import"); return; }

    localData = localData || {};
    cloudData = cloudData || {};

    const localLife = (localData.stats && typeof localData.stats.lifetimeScore === "number")
      ? localData.stats.lifetimeScore
      : (typeof localData.lifetimeScore === "number" ? localData.lifetimeScore : 0);
    const cloudLife = (typeof cloudData.lifetimeScore === "number")
      ? cloudData.lifetimeScore
      : (typeof cloudData.lifetime_score === "number" ? cloudData.lifetime_score : ((cloudData.stats && cloudData.stats.lifetimeScore) || 0));

    const localCinders = Number(localData.cinders) || 0;
    const cloudCinders = Number(cloudData.cinders) || 0;

    const localLanterns = Array.isArray(localData.unlockedLanterns) ? localData.unlockedLanterns : (Array.isArray(localData.lanterns) ? localData.lanterns : ["wick"]);
    const cloudLanterns = Array.isArray(cloudData.unlockedLanterns || cloudData.unlocked_lanterns) ? (cloudData.unlockedLanterns || cloudData.unlocked_lanterns) : ["wick"];

    box.innerHTML = `
      <div class="conflict-card">
        <h4>Local:</h4>
        <dl>
          <dt>Lifetime Score</dt><dd>${fmt(localLife)}</dd>
          <dt>Cinders</dt><dd>${fmt(localCinders)}</dd>
          <dt>Lanterns Unlocked</dt><dd>${localLanterns.length}</dd>
        </dl>
      </div>
      <div class="conflict-card">
        <h4>Cloud:</h4>
        <dl>
          <dt>Lifetime Score</dt><dd>${fmt(cloudLife)}</dd>
          <dt>Cinders</dt><dd>${fmt(cloudCinders)}</dd>
          <dt>Lanterns Unlocked</dt><dd>${cloudLanterns.length}</dd>
        </dl>
      </div>
    `;

    const btnImport = $("#btnConflictImport") || $("#btnConflictLocal");
    const btnKeepCloud = $("#btnConflictKeepCloud") || $("#btnConflictCloud");
    const btnCancel = $("#btnConflictCancel") || $("#btnConflictMerge");

    if (btnImport) {
      btnImport.onclick = () => {
        this.hide();
        this.show("cloud");
        callback("import");
      };
    }
    if (btnKeepCloud) {
      btnKeepCloud.onclick = () => {
        this.hide();
        this.show("cloud");
        callback("cloud");
      };
    }
    if (btnCancel) {
      btnCancel.onclick = () => {
        this.hide();
        this.show("cloud");
        callback("cancel");
      };
    }

    this.show("conflict");
  },

  /* ----------------------------------------------- in-run overlays */
  ownedInto(el, up) {
    el.textContent = "";
    for (const id in up) {
      const u = UP[id];
      if (!u) continue;
      el.append(h("span", { class: u.relic ? "relic" : "", html: icon(u.build, 16) }, u.name + (up[id] > 1 ? " " + up[id] : "")));
    }
  },
  buildPause() {
    this.ownedInto($("#pauseBuild"), G.run ? G.run.up : {});
  },

  showUpgrade() {
    const run = G.run, relic = G.offerRelic, next = run.wave + 1, nd = waveDef(next);
    $("#pickTitle").textContent = relic ? "Choose a relic" : "Choose a card";
    $("#pickSub").textContent = "Next: " + (nd.boss ? ENEMY_INFO[nd.boss].name : "wave " + next + (next <= CAMPAIGN_WAVES ? " of " + CAMPAIGN_WAVES : ""));
    const box = $("#pickCards");
    box.textContent = "";
    G.offers.forEach((id, i) => {
      const u = UP[id], cur = run.up[id] || 0, lvl = cur + 1;
      let level = "";
      if (u.cursed) level = "A bargain";
      else if (u.relic) level = "Relic";
      else if (u.consumable) level = "Used at once";
      else if (u.max > 1) level = "Level " + lvl + " of " + u.max;
      let synEl = null;
      if (u.build !== "util" && !u.relic) {
        const possible = SYNERGIES.filter(s => s.need.includes(u.build));
        const liveSyns = activeSynergies(run);
        const myBuilds = activeBuilds(run);
        const ready = possible.find(s => {
          const other = s.need[0] === u.build ? s.need[1] : s.need[0];
          return myBuilds[other] && !liveSyns.includes(s.id);
        });
        if (ready) {
          synEl = h("span", { class: "card-synergy-ready" }, "⚡ Unlocks: " + ready.name);
        } else if (possible.length) {
          const partners = possible.map(s => BUILD_NAMES[s.need[0] === u.build ? s.need[1] : s.need[0]]).join(" • ");
          synEl = h("span", { class: "card-synergy-pairs" }, "Pairs with: " + partners);
        }
      }
      box.append(h("button", { type: "button", class: "card" + (u.relic ? " relic" : "") + (u.cursed ? " cursed" : ""), onclick: () => this.pickCard(i) },
        h("span", { class: "card-icon", html: icon(u.build, 34) }),
        h("span", { class: "card-build" }, BUILD_NAMES[u.build]),
        h("span", { class: "card-name" }, u.name),
        h("span", { class: "card-level" }, level),
        h("span", { class: "card-desc" }, cardDesc(u, lvl, run.lantern)),
        synEl,
        h("span", { class: "card-key" }, "Press " + (i + 1))));
    });
    const rb = $("#btnReroll");
    rb.textContent = run.rerolls > 0 ? "Reroll, " + run.rerolls + " left (R)" : "No rerolls left";
    rb.disabled = run.rerolls <= 0;
    this.ownedInto($("#pickOwned"), run.up);
    this.show("upgrade");
    const first = box.querySelector(".card");
    if (first) first.focus({ preventScroll: true });
  },
  pickCard(i) {
    if (G.state !== "upgrade" || !G.offers || !G.offers[i]) return;
    const id = G.offers[i];
    this.hide();
    takeUpgrade(id);
  },
  reroll() {
    if (G.state !== "upgrade") return;
    if (rerollOffers()) {
      Sfx.ui();
      this.showUpgrade();
    } else Sfx.deny();
  },

  showCheckpoint(info) {
    $("#cpTitle").textContent = "Wave " + info.wave + (info.waveName ? " — " + info.waveName : "");
    $("#cpWhy").textContent = info.why || "The flame was extinguished.";
    const st = $("#cpStats");
    st.textContent = "";
    [
      ["Wave", info.wave],
      ["Flame at fall", info.flame],
      ["Kills this run", fmt(info.kills)],
      ["Perfect dashes", fmt(info.perfectDashes)],
      ["Best dash quality", info.bestQuality],
      ["Rekindle used", info.rekindled ? "Yes" : "No"],
    ].forEach((r) => st.append(h("div", null, h("dt", null, r[0]), h("dd", null, r[1]))));

    const rb = $("#btnRetryWave");
    if (rb) {
      rb.textContent = "Retry Wave " + info.wave;
    }
    this.show("checkpoint");
  },

  showVictory() {
    const run = G.run;
    $("#victoryText").textContent = "You carried the flame through all fifteen waves on " + DUSK_TIERS[run.dusk].name + ". Score so far: " + fmt(run.score) + ".";
    this.show("victory");
  },

  showOver(s) {
    const d = Save.data;
    $("#overTitle").textContent = s.banked ? "The run is banked" : "Your flame fades";
    let why = "";
    if (!s.banked) {
      why = s.deathCause + (s.near ? " " + s.near : "");
    } else why = "Fifteen waves cleared with " + LANTERNS[s.lantern].name + " on " + DUSK_TIERS[s.dusk].name + ".";
    $("#overWhy").textContent = why;
    $("#overScore").textContent = fmt(s.score);
    $("#overBest").textContent = s.newBest ? "New best" : "Best " + fmt(d.stats.bestScore);
    const st = $("#overStats");
    st.textContent = "";
    const effPct = s.flameSpent > 0 ? Math.round((s.flameGained / s.flameSpent) * 100) : 0;
    [
      ["Wave", s.wave], ["Kills", fmt(s.kills)], ["Damage taken", fmt(s.hits || 0)], ["Most in one dash", s.bestMulti], ["Best combo", s.bestCombo], ["Time", fmtTime(s.time)],
      ["Perfect dashes", fmt(s.perfectDashes || 0)],
      ["Rekindle used", s.rekindled ? "yes" : "no"],
      ["Near misses", fmt(s.nearMisses || 0)],
      ["Seed", s.seed || "—"],
      ["Kills per dash", s.dashes ? (s.kills / s.dashes).toFixed(2) : "0"],
      ["Flame efficiency", effPct + "%"],
    ].forEach((r) => st.append(h("div", null, h("dt", null, r[0]), h("dd", null, r[1]))));

    // Cinders count up; the total is already banked
    const ce = $("#overCinders");
    clearInterval(this.countTimer);
    $("#overCindersNote").textContent = (s.achCinders ? "plus " + s.achCinders + " from achievements. " : "") + "You now hold " + fmt(d.cinders) + ".";
    if (Save.reducedMotion() || s.cinders <= 0) ce.textContent = "+" + fmt(s.cinders) + " Cinders";
    else {
      let shown = 0;
      const stepN = Math.max(1, Math.ceil(s.cinders / 40));
      ce.textContent = "+0 Cinders";
      this.countTimer = setInterval(() => {
        shown = Math.min(s.cinders, shown + stepN);
        ce.textContent = "+" + fmt(shown) + " Cinders";
        Sfx.count();
        if (shown >= s.cinders) clearInterval(this.countTimer);
      }, 28);
    }
    const ae = $("#overAch");
    ae.textContent = "";
    for (const id of s.newAch) if (ACH[id]) ae.append(h("span", null, "Achievement: " + ACH[id].name));

    // what survives the run ending: this is the part that was never at risk
    const perm = $("#overPermanent");
    perm.textContent = "";
    if (!s.banked) {
      const bits = [];
      if (s.masteryUp) {
        const L = MASTERY_LEVELS.find((m) => m.id === s.masteryUp);
        bits.push(h("p", null, LANTERNS[s.lantern].name + " reached ", h("b", null, L.name + (s.masteryUp >= 5 ? ": " + LANTERNS[s.lantern].masteryTitle : "")), "."));
      }
      for (const dd of s.newDisc || []) bits.push(h("p", null, "Discovered: ", h("b", null, dd.replace(/^\w+:\s*/, ""))));
      if (bits.length) perm.append(h("h3", null, "What you keep"), ...bits);
    }

    // run analysis: the dash tiers landed, the run's best stroke, and a
    // concrete, reachable target for the next attempt
    const an = $("#overAnalysis");
    an.textContent = "";
    if (!s.banked) {
      const q = s.quality || {};
      const tierBits = ["masterful", "brutal", "sharp", "clean"]
        .filter((k) => q[k])
        .map((k) => q[k] + " " + QUALITY_LABEL[k].charAt(0) + QUALITY_LABEL[k].slice(1).toLowerCase());
      if (tierBits.length) an.append(h("p", null, "Dashes: " + tierBits.join(", ") + "."));
      if (s.synergies && s.synergies.length) an.append(h("p", null, "Synergies in play: " + s.synergies.join(", ") + "."));
      an.append(h("p", null, "Your best moment: ", h("b", null, s.bestMoment)));
      an.append(h("p", { class: "next" }, "Next: ", h("b", { class: "next" }, s.nextGoal)));
    }

    // the reason to go again: what the next run is working toward
    const goal = $("#overGoal"), sale = this.forSale(), can = sale.filter((x) => x.price <= d.cinders);
    goal.textContent = "";
    if (can.length) {
      goal.append(can.length === 1 ? "You can afford " + can[0].name + ". It is waiting at the Hearth." : "You can afford " + can[can.length - 1].name + " and " + (can.length - 1) + " more at the Hearth.");
    } else if (sale.length) {
      const g0 = sale[0];
      goal.append(fmt(d.cinders) + " of " + g0.price + " Cinders toward " + g0.name + ".", h("div", { class: "goal-bar" }, h("i", { style: "width:" + clamp((d.cinders / g0.price) * 100, 0, 100) + "%" })));
    } else if (d.duskMax < DUSK_TIERS.length - 1) {
      goal.append("Everything at the Hearth is yours. " + DUSK_TIERS[d.duskMax + 1].name + " waits beyond a clear on " + DUSK_TIERS[d.duskMax].name + ".");
    } else goal.append("Everything is unlocked. Only the score is left to beat.");
    this.show("over");
  },

  /* ------------------------------------------------------------ HUD */
  tutorialHint() {
    const w = G.wave, p = G.player, run = G.run, L = G.L;
    if (G.state !== "play" || !p || !p.alive || !w) return "";
    if (w.tutorial && !w.cleared) {
      if (run.kills === 0) {
        if (w.intro > 0.4) return "";
        if (Input.touch) return L.charge ? "Left thumb moves. Hold the right side to charge, let go to fly through them." : L.blink ? "Left thumb moves. Drag on the right to aim, let go to blink into them." : "Left thumb moves. Drag on the right to aim, let go to dash through them.";
        if (L.charge) return "Aim with the mouse. Hold the button to charge, release to fly through them.";
        if (L.blink) return "Aim with the mouse. Click to blink into the middle of them.";
        return "Aim with the mouse. Click to dash through all three.";
      }
      if (run.kills < 8) return "Every kill returns Flame. Cut more than one at once and you come out ahead.";
      return Input.touch ? "While you dash, nothing can touch you. Dash through danger." : "Move with W A S D. While you dash, nothing can touch you.";
    }
    if (p.failT > 0 && Save.data.stats.runs < 3) return "Out of Flame. It returns slowly on its own, and quickly with every kill.";
    return "";
  },

  frame(rawDt) {
    const p = G.player, show = !!p && G.state !== "menu" && G.state !== "over";
    if (this.hud.hidden === show) this.hud.hidden = !show;
    if (this.bannerT > 0) {
      this.bannerT -= rawDt;
      if (this.bannerT <= 0) $("#banner").classList.remove("on");
    }
    if (!show) return;
    const S = G.S, run = G.run, w = G.wave, c = this.cache;
    const set = (key, val, fn) => {
      if (c[key] !== val) {
        c[key] = val;
        fn(val);
      }
    };
    set("hearts", p.hearts + "/" + S.maxHearts + (p.ward ? "w" : ""), () => {
      let html = "";
      for (let i = 0; i < S.maxHearts; i++) html += `<span class="${i < p.hearts ? "full" : "lost"}">${icon("heart", 24)}</span>`;
      if (p.ward) html += `<span class="ward">${icon("guard", 22)}</span>`;
      $("#hudHearts").innerHTML = html;
      $("#hudHearts").setAttribute("aria-label", p.hearts + " of " + S.maxHearts + " hearts");
    });
    const hideTicks = !!(w && w.mod && w.mod.hideFlameTicks);
    set("ticks", hideTicks + "|" + S.dashCost + "/" + S.maxFlame, () => {
      let html = "";
      if (!hideTicks) for (let v = S.dashCost; v < S.maxFlame - 0.5; v += S.dashCost) html += `<i style="left:${(v / S.maxFlame) * 100}%"></i>`;
      $("#hudFlameTicks").innerHTML = html;
      $(".flame").style.width = "";
    });
    set("flame", Math.round(clamp(p.flame / S.maxFlame, 0, 1) * 200), (v) => { $("#hudFlame").style.width = v / 2 + "%"; });
    set("flameState", (p.flame + 0.001 < S.dashCost && !p.freeDash ? "low" : "") + (p.flame > S.maxFlame + 0.5 ? " over" : ""), (v) => { $(".flame").className = "flame " + v; });
    set("build", JSON.stringify(run.up), () => {
      const el = $("#hudBuild");
      el.textContent = "";
      for (const id in run.up) {
        const u = UP[id];
        if (u) el.append(h("span", { class: u.relic ? "relic" : "", title: u.name, html: icon(u.build, 18) }, run.up[id] > 1 ? String(run.up[id]) : ""));
      }
    });
    if (w) {
      set("wave", w.n + (run.endless ? "e" : ""), () => {
        const el = $("#hudWave");
        el.textContent = "Wave " + w.n + " ";
        if (w.n <= CAMPAIGN_WAVES && !run.endless) el.append(h("small", null, "of " + CAMPAIGN_WAVES));
      });
      set("left", w.boss || w.cleared || w.intro > 0 ? "" : w.left + " left", (v) => { $("#hudLeft").textContent = v; });
      set("mutation", w.mod && w.mod.mutation && !w.cleared ? w.mod.name : "", (v) => {
        const el = $("#hudMutation");
        if (el) { el.hidden = !v; el.textContent = v; }
      });
      const b = w.boss && w.bossRef && !w.bossRef.dead ? w.bossRef : null;
      set("boss", b ? ENEMY_INFO[w.boss].name : "", (v) => {
        $("#hudBoss").hidden = !v;
        $("#hudBossName").textContent = v;
      });
      if (b) set("bossHp", Math.round(clamp(b.hp / b.maxHp, 0, 1) * 200), (v) => { $("#hudBossFill").style.width = v / 2 + "%"; });
    }
    const lifetime = (Save.data && Save.data.stats && typeof Save.data.stats.lifetimeScore === "number")
      ? Save.data.stats.lifetimeScore
      : run.score;
    set("score", lifetime, (v) => { $("#hudScore").textContent = fmt(v); });
    set("combo", G.combo >= 2 ? G.combo : 0, (v) => {
      $("#hudCombo").classList.toggle("on", v > 0);
      if (v) $("#hudComboN").textContent = v + " combo";
    });
    if (G.combo >= 2) set("comboT", Math.round(clamp(G.comboT / 3, 0, 1) * 50), (v) => { $("#hudComboFill").style.width = v * 2 + "%"; });
    set("hint", this.tutorialHint(), (v) => { $("#hint").textContent = v; });
  },
};
